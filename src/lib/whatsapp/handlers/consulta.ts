/**
 * consulta.ts - Handler de consulta manual de editais via WhatsApp
 *
 * Fluxo:
 * 1. NLP extrai filtros da mensagem (incluindo exclusoes)
 * 2. Busca dinamica no Supabase com relaxamento progressivo
 * 3. Salva resultados no contexto -> permite "edital N" para detalhes
 * 4. Detalhe exibe menu: 1=Compatibilidade | 2=Similares | 3=Voltar lista
 */

import { createAdminClient } from '@/lib/supabase/server'
import { extrairFiltrosConsulta, extrairFiltrosRefinamento } from '@/lib/ai/assistant'
import { analisarCompatibilidade } from '@/lib/ai/matcher'
import { seguirEdital } from '@/lib/whatsapp/handlers/favoritos'
import { buscarTodosEditais, MODALIDADES } from '@/lib/pncp/client'
import { resolverLinkEditalDB, resolverLinkEditalPNCP } from '@/lib/pncp/links'
import type { EditalDB, PerfilEmpresa, FiltrosConsulta, ContextoConversa, EditalPNCP } from '@/types'
import type { SupabaseClient } from '@supabase/supabase-js'

const MAX_RESULTADOS = 5
const TERMOS_EQUIVALENTES: Record<string, string[]> = {
    ti: ['tecnologia da informacao', 'informatica', 'software', 'servidor', 'rede', 'cloud', 'telefonia ip', 'suporte tecnico'],
    tecnologia: ['informatica', 'software', 'cloud', 'dados', 'sistema'],
    obra: ['engenharia', 'construcao', 'construcao civil', 'reforma', 'manutencao predial', 'pavimentacao'],
    reforma: ['engenharia', 'manutencao', 'obra', 'predial', 'ampliacao'],
    engenharia: ['obra', 'projeto executivo', 'fiscalizacao', 'pavimentacao', 'infraestrutura'],
    arquitetura: ['projeto arquitetonico', 'projeto basico', 'urbanismo', 'layout'],
    saude: ['hospitalar', 'clinico', 'medicamento', 'material hospitalar', 'insumo'],
    medicamento: ['farmaceutico', 'remedio', 'insumo hospitalar', 'hospitalar'],
    alimenticio: ['generos alimenticios', 'merenda', 'alimentos', 'nutricao'],
    administrativo: ['expediente', 'escritorio', 'papelaria', 'suprimentos'],
}

const STOPWORDS_SEMANTICAS = new Set([
    'contratacao', 'empresa', 'prestacao', 'servico', 'servicos', 'fornecimento',
    'aquisicao', 'registro', 'precos', 'ata', 'termo', 'referencia', 'edital',
    'licitacao', 'objeto', 'atender', 'necessidades', 'municipio', 'secretaria',
    'processo', 'publicacao', 'aviso', 'extrato',
    'conforme', 'especializada', 'municipal', 'portal', 'futura', 'eventual',
    'condicoes', 'anexos', 'destinados', 'atendimento', 'compras',
    'qualquer', 'valor', 'valores', 'execucao', 'execucoes',
    'todo', 'toda', 'todos', 'todas', 'brasil', 'nacional', 'pais',
])

function termosParaBusca(termos: string[]): string[] {
    const saida = new Set<string>()
    for (const termo of termos) {
        const base = normalizarTextoBusca(termo).trim()
        if (!base || STOPWORDS_SEMANTICAS.has(base)) continue
        if (base.length <= 2 && base !== 'ti') continue

        const candidatos = new Set<string>([base])

        // Termo composto: quebra em tokens para aumentar recall (ex: "construcao civil")
        const tokens = base.split(/\s+/).filter((t) => t.length >= 3 && !STOPWORDS_SEMANTICAS.has(t))
        for (const token of tokens) candidatos.add(token)

        for (const c of Array.from(candidatos)) {
            if (c.length >= 4) {
                if (c.endsWith('s')) candidatos.add(c.slice(0, -1))
                else candidatos.add(`${c}s`)
            }
        }

        for (const c of candidatos) {
            saida.add(c)
            const equivalentes = TERMOS_EQUIVALENTES[c]
            if (equivalentes?.length) {
                for (const sinonimo of equivalentes) {
                    const sn = normalizarTextoBusca(sinonimo).trim()
                    if (sn && !STOPWORDS_SEMANTICAS.has(sn)) saida.add(sn)
                }
            }
        }
    }

    return Array.from(saida)
}

function normalizarTextoBusca(texto: string): string {
    return texto
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
}

function termosNucleo(termos: string[]): string[] {
    return termos
        .map((t) => normalizarTextoBusca(t).trim())
        .filter((t) => t.length >= 3 && !STOPWORDS_SEMANTICAS.has(t))
}

function pontuarAderenciaEdital(edital: EditalDB, filtros: FiltrosConsulta): number {
    const objeto = normalizarTextoBusca(edital.objeto ?? '')
    const termosBase = termosNucleo(filtros.termos)
    const termosExpandidos = termosParaBusca(filtros.termos)

    let score = 0

    for (const termo of termosBase) {
        if (objeto.includes(termo)) score += 10
        else score -= 2
    }

    for (const termo of termosExpandidos) {
        if (objeto.includes(normalizarTextoBusca(termo))) score += 2
    }

    if (filtros.ufs.length > 0 && edital.uf_orgao && filtros.ufs.includes(edital.uf_orgao)) {
        score += 4
    }

    return score
}

function ordenarPorAderencia(editais: EditalDB[], filtros: FiltrosConsulta): EditalDB[] {
    const comScore = editais.map((e) => ({ e, score: pontuarAderenciaEdital(e, filtros) }))
    const filtrados = comScore.filter(({ score }) => score > 0 || filtros.termos.length === 0)

    return filtrados
        .sort((a, b) => {
            if (b.score !== a.score) return b.score - a.score
            return new Date(b.e.data_publicacao ?? 0).getTime() - new Date(a.e.data_publicacao ?? 0).getTime()
        })
        .map(({ e }) => e)
}

function extrairTermosRelevantes(texto: string, limite = 3): string[] {
    const palavras = normalizarTextoBusca(texto)
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter((p) => p.length >= 4 && !STOPWORDS_SEMANTICAS.has(p))

    return Array.from(new Set(palavras)).slice(0, limite)
}

// ---------- Helpers de formatacao ----------

function indicadorPrazo(dataEncerramento: string | null): string {
    if (!dataEncerramento) return 'SEM PRAZO'
    const diasRestantes = Math.ceil(
        (new Date(dataEncerramento).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    )
    if (diasRestantes <= 0) return 'ENCERRADO'
    if (diasRestantes <= 3) return `URGENTE: ${diasRestantes}d restantes`
    if (diasRestantes <= 7) return `ATENCAO: ${diasRestantes}d restantes`
    return `${diasRestantes}d restantes`
}

function formatarEdital(edital: EditalDB, indice: number): string {
    const valor = edital.valor_estimado
        ? edital.valor_estimado.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
        : 'Valor nao informado'
    const encerramento = edital.data_encerramento
        ? new Date(edital.data_encerramento).toLocaleDateString('pt-BR')
        : 'Prazo nao informado'
    const prazo = indicadorPrazo(edital.data_encerramento)
    const modalidade = edital.modalidade ? ` | ${edital.modalidade}` : ''
    return [
        `*${indice}. ${edital.nome_orgao}*`,
        `📋 ${edital.objeto.substring(0, 120)}${edital.objeto.length > 120 ? '...' : ''}`,
        `💰 ${valor}${modalidade}`,
        `📍 ${edital.municipio_orgao ?? ''} - ${edital.uf_orgao ?? ''} | ⏰ ${prazo} (encerra ${encerramento})`,
    ].join('\n')
}

const MENU_ACOES = [
    '',
    '⚙️ *O que deseja fazer?*',
    '1️⃣ Analisar compatibilidade com meu perfil',
    '2️⃣ Buscar editais similares',
    '3️⃣ Voltar à lista anterior',
    '4️⃣ Seguir este edital (receber lembrete de prazo)',
].join('\n')

// ---------- Busca semantica ----------

async function buscarComFiltrosSemantico(
    supabase: SupabaseClient,
    filtros: FiltrosConsulta,
    limite: number,
    offset: number
): Promise<EditalDB[] | null> {
    const termosBusca = termosParaBusca(filtros.termos)
    const { data, error } = await supabase.rpc('buscar_editais_semantico', {
        p_termos: termosBusca,
        p_ufs: filtros.ufs,
        p_excluir: filtros.excluir,
        p_valor_min: filtros.valor_min,
        p_valor_max: filtros.valor_max,
        p_modalidade: filtros.modalidade,
        p_tipo_orgao: filtros.tipo_orgao,
        p_prazo_min_dias: filtros.prazo_min_dias,
        p_prazo_max_dias: filtros.prazo_max_dias,
        p_offset: offset,
        p_limite: limite,
    })

    if (error) {
        const msg = `${error.message ?? ''} ${error.details ?? ''}`.toLowerCase()
        const funcaoAusente =
            msg.includes('buscar_editais_semantico') &&
            (msg.includes('could not find') || msg.includes('does not exist') || msg.includes('not found'))
        if (!funcaoAusente) {
            console.warn('[Consulta] RPC semantica indisponivel, fallback SQL padrao:', error.message)
        }
        return null
    }

    return ((data ?? []) as EditalDB[])
}

async function buscarComFiltros(
    supabase: SupabaseClient,
    filtros: FiltrosConsulta,
    limite = MAX_RESULTADOS,
    offset = 0
): Promise<EditalDB[]> {
    const semantico = await buscarComFiltrosSemantico(supabase, filtros, limite, offset)
    if (semantico !== null) return semantico

    // Compara apenas a data (sem hora) para incluir editais que encerram hoje
    const agoraIso = new Date().toISOString().split('T')[0]
    let query = supabase
        .from('editais_pncp')
        .select('*')
        .gte('data_encerramento', agoraIso)

    if (filtros.ufs.length > 0) query = query.in('uf_orgao', filtros.ufs)

    const termosBusca = termosParaBusca(filtros.termos)
    if (termosBusca.length > 0) {
        const ilikeFiltro = termosBusca.map((t) => `objeto.ilike.%${t}%`).join(',')
        query = query.or(ilikeFiltro)
    }
    for (const termo of filtros.excluir) {
        query = query.not('objeto', 'ilike', `%${termo}%`)
    }

    if (filtros.valor_min !== null) query = query.gte('valor_estimado', filtros.valor_min)
    if (filtros.valor_max !== null) query = query.lte('valor_estimado', filtros.valor_max)

    if (filtros.prazo_min_dias !== null) {
        const d = new Date(); d.setDate(d.getDate() + filtros.prazo_min_dias)
        query = query.gte('data_encerramento', d.toISOString())
    }
    if (filtros.prazo_max_dias !== null) {
        const d = new Date(); d.setDate(d.getDate() + filtros.prazo_max_dias)
        query = query.lte('data_encerramento', d.toISOString())
    }

    if (filtros.modalidade) {
        const modalMap: Record<string, string> = {
            pregao: 'Pregao',
            dispensa: 'Dispensa',
            concorrencia: 'Concorrencia',
            credenciamento: 'Credenciamento',
        }
        const modalidade = normalizarTextoBusca(filtros.modalidade)
        query = query.ilike('modalidade', `%${modalMap[modalidade] ?? filtros.modalidade}%`)
    }

    if (filtros.tipo_orgao) {
        const orgaoMap: Record<string, string> = {
            prefeitura: 'Prefeitura',
            municipal: 'Prefeitura',
            federal: 'Uniao',
            estadual: 'Estado',
            universidade: 'Universidade',
            autarquia: 'Autarquia',
        }
        const tipoOrgao = normalizarTextoBusca(filtros.tipo_orgao)
        query = query.ilike('nome_orgao', `%${orgaoMap[tipoOrgao] ?? filtros.tipo_orgao}%`)
    }

    const faixaBusca = Math.max(offset + (limite * 8), limite * 8)
    const { data, error } = await query
        .order('data_publicacao', { ascending: false })
        .range(0, faixaBusca - 1)
    if (error) throw new Error(error.message)

    const base = (data as EditalDB[]) ?? []
    const ordenados = ordenarPorAderencia(base, filtros)
    return ordenados.slice(offset, offset + limite)
}
const MODALIDADES_LIVE_PADRAO = [
    MODALIDADES.PREGAO_ELETRONICO,
    MODALIDADES.DISPENSA_LICITACAO,
    MODALIDADES.CONCORRENCIA_ELETRONICA,
    MODALIDADES.CONCORRENCIA_PRESENCIAL,
    MODALIDADES.INEXIGIBILIDADE,
    MODALIDADES.CREDENCIAMENTO,
]

function mapearEditalPNCPParaDB(e: EditalPNCP) {
    return {
        pncp_id: e.numeroControlePNCP,
        numero_controle_pncp: e.numeroControlePNCP,
        ano_compra: e.anoCompra,
        sequencial_compra: e.sequencialCompra,
        cnpj_orgao: e.orgaoEntidade?.cnpj ?? null,
        nome_orgao: e.orgaoEntidade?.razaoSocial ?? 'Nao informado',
        uf_orgao: e.unidadeOrgao?.ufSigla ?? null,
        municipio_orgao: e.unidadeOrgao?.municipioNome ?? null,
        objeto: e.objetoCompra,
        modalidade: e.modalidadeNome ?? null,
        modo_disputa: e.modoDisputaNome ?? null,
        valor_estimado: e.valorTotalEstimado ?? null,
        status: e.situacaoCompraNome ?? 'Recebendo Proposta',
        data_publicacao: e.dataPublicacaoPncp ?? null,
        data_abertura_proposta: e.dataAberturaProposta ?? null,
        data_encerramento: e.dataEncerramentoProposta ?? null,
        link_sistema_origem: resolverLinkEditalPNCP(e),
    }
}

function resolverModalidadesLive(modalidade: string | null): string[] {
    if (!modalidade) return MODALIDADES_LIVE_PADRAO

    const m = normalizarTextoBusca(modalidade)
    if (m.includes('pregao')) return [MODALIDADES.PREGAO_ELETRONICO, MODALIDADES.PREGAO_PRESENCIAL]
    if (m.includes('dispensa')) return [MODALIDADES.DISPENSA_LICITACAO]
    if (m.includes('concorrencia')) return [MODALIDADES.CONCORRENCIA_ELETRONICA, MODALIDADES.CONCORRENCIA_PRESENCIAL]
    if (m.includes('inexig')) return [MODALIDADES.INEXIGIBILIDADE]
    if (m.includes('credenciamento')) return [MODALIDADES.CREDENCIAMENTO]

    return MODALIDADES_LIVE_PADRAO
}

function parseIntEnv(value: string | undefined, fallback: number): number {
    const n = Number(value)
    if (!Number.isFinite(n)) return fallback
    return Math.max(1, Math.floor(n))
}

async function buscarPNCPAoVivoEPopularBase(
    supabase: SupabaseClient,
    filtros: FiltrosConsulta
): Promise<number> {
    const diasAtras = parseIntEnv(process.env.PNCP_LIVE_DIAS_ATRAS, 30)
    const maxPaginas = parseIntEnv(process.env.PNCP_LIVE_MAX_PAGINAS, 2)
    const modalidades = resolverModalidadesLive(filtros.modalidade)
    const ufs = filtros.ufs.length > 0 ? filtros.ufs.slice(0, 5) : [undefined]

    const coletados = new Map<string, EditalPNCP>()

    for (const modalidade of modalidades) {
        for (const uf of ufs) {
            try {
                const dados = await buscarTodosEditais({
                    diasAtras,
                    modalidade,
                    maxPaginas,
                    ...(uf ? { uf } : {}),
                })

                for (const e of dados) {
                    if (!coletados.has(e.numeroControlePNCP)) coletados.set(e.numeroControlePNCP, e)
                }

                if (coletados.size >= 2000) break
            } catch (err) {
                console.warn('[Consulta] Falha no fallback ao vivo PNCP:', err instanceof Error ? err.message : err)
            }
        }
        if (coletados.size >= 2000) break
    }

    if (coletados.size === 0) return 0

    const lotes = Array.from(coletados.values())
    const LOTE = 100
    let totalUpserts = 0

    for (let i = 0; i < lotes.length; i += LOTE) {
        const chunk = lotes.slice(i, i + LOTE).map(mapearEditalPNCPParaDB)
        const { data, error } = await supabase
            .from('editais_pncp')
            .upsert(chunk, { onConflict: 'pncp_id', ignoreDuplicates: false })
            .select('id')

        if (error) {
            console.warn('[Consulta] Upsert fallback ao vivo falhou:', error.message)
            continue
        }

        totalUpserts += data?.length ?? 0
    }

    return totalUpserts
}

// ---------- Persistencia de busca ----------

async function salvarUltimaBusca(
    numero: string,
    editais: EditalDB[],
    filtros?: FiltrosConsulta,
    offset = 0
): Promise<void> {
    try {
        const supabase = createAdminClient()
        const { data } = await supabase
            .from('conversas').select('contexto_json').eq('numero_whatsapp', numero).maybeSingle()
        const ctx = (data?.contexto_json as Record<string, unknown>) ?? {}
        const ultimaBusca = editais.map((e, i) => ({
            id: e.id,
            indice: i + 1,
            nome_orgao: e.nome_orgao,
            objeto: e.objeto.substring(0, 150),
            link: resolverLinkEditalDB(e),
            valor_estimado: e.valor_estimado ?? null,
            data_encerramento: e.data_encerramento ?? null,
            modalidade: e.modalidade ?? null,
            uf_orgao: e.uf_orgao ?? null,
        }))
        await supabase.from('conversas')
            .update({
                contexto_json: {
                    ...ctx,
                    ultima_busca: ultimaBusca,
                    aguardando_acao_edital_id: null,
                    // Salva filtros para refinamento contextual
                    ...(filtros ? { ultimos_filtros: filtros } : {}),
                    ultimo_offset_busca: offset,
                }
            })
            .eq('numero_whatsapp', numero)
    } catch (err) {
        console.warn('[Consulta] Erro ao salvar ultima busca:', err instanceof Error ? err.message : err)
    }
}

async function registrarTelemetriaBusca(
    numero: string,
    texto: string,
    filtros: FiltrosConsulta,
    totalResultados: number,
    origem: 'rpc_semantico' | 'fallback_sql' | 'nao_encontrado' | 'pncp_live'
): Promise<void> {
    try {
        const supabase = createAdminClient()
        await supabase.from('bot_busca_logs').insert({
            numero_whatsapp: numero,
            consulta_texto: texto,
            filtros_json: filtros,
            total_resultados: totalResultados,
            origem_busca: origem,
            criado_em: new Date().toISOString(),
        })
    } catch {
        // Tabela opcional de observabilidade. Falha nao deve afetar a conversa.
    }
}
async function salvarAcaoPendente(numero: string, editalId: string): Promise<void> {
    try {
        const supabase = createAdminClient()
        const { data } = await supabase
            .from('conversas').select('contexto_json').eq('numero_whatsapp', numero).maybeSingle()
        const ctx = (data?.contexto_json as Record<string, unknown>) ?? {}
        await supabase.from('conversas')
            .update({ contexto_json: { ...ctx, aguardando_acao_edital_id: editalId } })
            .eq('numero_whatsapp', numero)
    } catch (err) {
        console.warn('[Consulta] Erro ao salvar acao pendente:', err instanceof Error ? err.message : err)
    }
}

async function limparAcaoPendente(numero: string): Promise<void> {
    try {
        const supabase = createAdminClient()
        const { data } = await supabase
            .from('conversas').select('contexto_json').eq('numero_whatsapp', numero).maybeSingle()
        const ctx = (data?.contexto_json as Record<string, unknown>) ?? {}
        const { aguardando_acao_edital_id: _rem, ...resto } = ctx as Record<string, unknown>
        void _rem
        await supabase.from('conversas')
            .update({ contexto_json: resto })
            .eq('numero_whatsapp', numero)
    } catch (err) {
        console.warn('[Consulta] Erro ao limpar acao pendente:', err instanceof Error ? err.message : err)
    }
}

// ---------- Detalhe de edital ----------

export async function handleDetalheEdital(numero: string, indice: number): Promise<string> {
    const supabase = createAdminClient()
    const { data: conversa } = await supabase
        .from('conversas').select('contexto_json').eq('numero_whatsapp', numero).maybeSingle()
    const contexto = (conversa?.contexto_json as ContextoConversa) ?? {}
    const ultimaBusca = contexto.ultima_busca ?? []

    const item = ultimaBusca.find((b) => b.indice === indice)
    if (!item) {
        return `🚨 Não encontrei o edital ${indice} na última busca. Realize uma nova pesquisa e solicite os detalhes novamente.`
    }

    const { data: edital } = await supabase
        .from('editais_pncp').select('*').eq('id', item.id).maybeSingle()
    if (!edital) return '❌ Edital não encontrado na base de dados.'

    const e = edital as EditalDB
    const valor = e.valor_estimado
        ? e.valor_estimado.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
        : 'Valor nao informado'
    const encerramento = e.data_encerramento
        ? new Date(e.data_encerramento).toLocaleDateString('pt-BR') : 'Nao informado'
    const abertura = e.data_abertura_proposta
        ? new Date(e.data_abertura_proposta).toLocaleDateString('pt-BR') : 'Nao informado'
    const prazo = indicadorPrazo(e.data_encerramento)

    await salvarAcaoPendente(numero, e.id)

    return [
        `📚 *Edital ${indice} — Detalhes completos*`,
        '',
        `🏢 *Órgão:* ${e.nome_orgao}`,
        `📍 *Local:* ${e.municipio_orgao ?? ''} - ${e.uf_orgao ?? ''}`,
        `📝 *Modalidade:* ${e.modalidade}`,
        '',
        '*Objeto:*',
        e.objeto,
        '',
        `💰 *Valor estimado:* ${valor}`,
        `📅 *Abertura de propostas:* ${abertura}`,
        `⏰ *Encerramento:* ${encerramento} (${prazo})`,
        '',
        '🔗 *Link oficial:*',
        resolverLinkEditalDB(e),
        MENU_ACOES,
    ].join('\n')
}

export async function handleAcaoEdital(numero: string, acao: '1' | '2' | '3' | '4'): Promise<string> {
    const supabase = createAdminClient()
    const { data: conversa } = await supabase
        .from('conversas').select('contexto_json').eq('numero_whatsapp', numero).maybeSingle()
    const contexto = (conversa?.contexto_json as ContextoConversa) ?? {}
    const editalId = contexto.aguardando_acao_edital_id

    if (!editalId) {
        return '⚠️ Contexto expirado. Por favor, realize uma nova busca e selecione um edital.'
    }

    await limparAcaoPendente(numero)

    // Acao 3: Link do PNCP
    if (acao === '3') {
        const ultimaBusca = contexto.ultima_busca ?? []
        if (ultimaBusca.length === 0) {
            return '🚨 Não há resultados anteriores para paginar. Faça uma nova busca.'
        }
        const ids = ultimaBusca.map((b) => b.id)
        const { data: editais } = await supabase
            .from('editais_pncp').select('*').in('id', ids)
        if (!editais?.length) return '⚠️ Não foi possível recuperar a lista anterior.'
        const editaisOrdenados = ids
            .map((id) => editais.find((e) => e.id === id))
            .filter(Boolean) as EditalDB[]
        const lista = editaisOrdenados.map((e, i) => formatarEdital(e, i + 1)).join('\n\n')
        return [
            `📝 *${editaisOrdenados.length} edital(is) da última busca:*`,
            '',
            lista,
            '',
            '_Responda *edital N* (ex: "edital 2") para ver detalhes completos e o link oficial._',
        ].join('\n')
    }

    // Acao 4: Buscar similares
    if (acao === '4') {
        return seguirEdital(numero, editalId)
    }

    // Carrega o edital para as opcoes 1 e 2
    const { data: editalData } = await supabase
        .from('editais_pncp').select('*').eq('id', editalId).maybeSingle()
    if (!editalData) return '🚨 Edital não encontrado. Realize uma nova busca.'
    const edital = editalData as EditalDB

    // Acao 2: Editais similares
    if (acao === '2') {
        return handleEditalSimilares(supabase, edital, numero)
    }

    // Acao 1: Analise de compatibilidade
    return handleCompatibilidade(supabase, edital, numero)
}

// ---------- Analise de compatibilidade ----------

async function handleCompatibilidade(
    supabase: SupabaseClient,
    edital: EditalDB,
    numero: string
): Promise<string> {
    const { data: usuario } = await supabase
        .from('usuarios').select('id').eq('whatsapp', numero).maybeSingle()
    if (!usuario) return '❌ Usuário não encontrado. Refaça o cadastro enviando *mudar perfil*.'

    const { data: perfil } = await supabase
        .from('perfil_empresa').select('*').eq('usuario_id', usuario.id).maybeSingle()
    if (!perfil) return '❌ Perfil da empresa não encontrado. Envie *mudar perfil* para cadastrar.'

    try {
        const resultado = await analisarCompatibilidade(edital, perfil as PerfilEmpresa)

        const scoreTag =
            resultado.score >= 80 ? 'ALTO' :
            resultado.score >= 50 ? 'MEDIO' : 'BAIXO'

        const pontos = resultado.pontos_fortes.map((p) => `- ${p}`).join('\n')
        const riscos = resultado.riscos.map((r) => `- ${r}`).join('\n')

        return [
            '📊 *Análise de Compatibilidade*',
            `_${edital.nome_orgao}_`,
            '',
            `🎯 *Score:* ${resultado.score}/100 (${scoreTag})`,
            `📌 *Recomendação:* ${resultado.recomendacao}`,
            '',
            '*Análise:*',
            resultado.justificativa,
            '',
            '✅ *Pontos fortes:*',
            pontos,
            '',
            '⚠️ *Riscos:*',
            riscos,
            '',
            '_Para ver outro edital, responda "edital N" ou faça uma nova pesquisa._',
        ].join('\n')
    } catch (err) {
        console.error('[Consulta] Erro na analise de compatibilidade:', err instanceof Error ? err.message : err)
        return '⚠️ Não foi possível realizar a análise no momento. Tente novamente em instantes.'
    }
}

async function handleEditalSimilares(
    supabase: SupabaseClient,
    edital: EditalDB,
    numero: string
): Promise<string> {
    // Extrai 2 palavras-chave do objeto (descarta stopwords e palavras curtas)
    const termosBase = extrairTermosRelevantes(edital.objeto, 3)
    const termos = termosParaBusca(termosBase).slice(0, 6)

    if (termos.length === 0) {
        return '⚠️ Não foi possível identificar termos para buscar editais similares.'
    }

    const agoraIso = new Date().toISOString().split('T')[0]
    const ilikeFiltro = termos.map((t) => `objeto.ilike.%${t}%`).join(',')
    const { data } = await supabase
        .from('editais_pncp')
        .select('*')
        .gte('data_encerramento', agoraIso)
        .or(ilikeFiltro)
        .neq('id', edital.id) // exclui o edital atual
        .order('data_publicacao', { ascending: false })
        .limit(5)

    const similaresBase = (data as EditalDB[]) ?? []
    const similares = ordenarPorAderencia(similaresBase, {
        termos,
        ufs: edital.uf_orgao ? [edital.uf_orgao] : [],
        prazo_min_dias: null,
        prazo_max_dias: null,
        valor_min: null,
        valor_max: null,
        modalidade: null,
        tipo_orgao: null,
        excluir: [],
    })

    if (similares.length === 0) {
        return [
            'Nao encontrei editais similares abertos no momento.',
            '',
            '_Tente uma nova busca com termos diferentes._',
        ].join('\n')
    }

    await salvarUltimaBusca(numero, similares, undefined, 0)

    const lista = similares.map((e, i) => formatarEdital(e, i + 1)).join('\n\n')
    return [
        `🔍 *${similares.length} edital(is) similar(es) encontrado(s)*`,
        `_Baseado em: ${termos.join(', ')}_`,
        '',
        lista,
        '',
        '_Responda *edital N* para ver detalhes completos e o link oficial._',
    ].join('\n')
}

// ---------- Perfil do usuario ----------

async function buscarPerfilUsuario(numero: string): Promise<PerfilEmpresa | null> {
    const supabase = createAdminClient()
    const { data: usuario } = await supabase
        .from('usuarios').select('id').eq('whatsapp', numero).maybeSingle()
    if (!usuario) return null
    const { data: perfil } = await supabase
        .from('perfil_empresa').select('*').eq('usuario_id', usuario.id).maybeSingle()
    return perfil as PerfilEmpresa | null
}

async function buscarPorPerfil(supabase: SupabaseClient, perfil: PerfilEmpresa): Promise<EditalDB[]> {
    const agoraIso = new Date().toISOString().split('T')[0]
    const termos = perfil.palavras_chave.slice(0, 3)
    for (const termo of termos) {
        let query = supabase.from('editais_pncp').select('*')
            .gte('data_encerramento', agoraIso)
            .ilike('objeto', `%${termo}%`)
            .order('data_publicacao', { ascending: false })
            .limit(MAX_RESULTADOS)
        if (perfil.uf_interesse?.length > 0) query = query.in('uf_orgao', perfil.uf_interesse)
        const { data } = await query
        if (data?.length) return data as EditalDB[]
    }
    return []
}

// ---------- Resumo de filtros ----------

function resumirFiltros(filtros: FiltrosConsulta): string | null {
    const partes: string[] = []
    if (filtros.termos.length > 0) partes.push(`segmento: _${filtros.termos.join(', ')}_`)
    if (filtros.excluir.length > 0) partes.push(`excluindo: _${filtros.excluir.join(', ')}_`)
    if (filtros.ufs.length > 0) partes.push(`UF: _${filtros.ufs.join(', ')}_`)
    if (filtros.modalidade) partes.push(`modalidade: _${filtros.modalidade}_`)
    if (filtros.tipo_orgao) partes.push(`orgao: _${filtros.tipo_orgao}_`)
    if (filtros.valor_min !== null)
        partes.push(`valor min: _${filtros.valor_min.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}_`)
    if (filtros.valor_max !== null)
        partes.push(`valor max: _${filtros.valor_max.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}_`)
    if (filtros.prazo_min_dias !== null) partes.push(`prazo min: _${filtros.prazo_min_dias} dias_`)
    if (filtros.prazo_max_dias !== null) partes.push(`urgencia: _ate ${filtros.prazo_max_dias} dias_`)
    return partes.length > 0 ? partes.join(' | ') : null
}

// ---------- Validacao de busca ----------

function buscaGenericaDemais(filtros: FiltrosConsulta): boolean {
    if (filtros.termos.length === 0) return true

    const termosGenericos = new Set([
        'servico', 'servicos', 'material', 'materiais', 'item', 'itens',
        'produto', 'produtos', 'compra', 'compras', 'contratacao', 'empresa',
        'fornecimento', 'solucao', 'solucoes', 'apoio', 'consultoria',
        'informacao', 'informacoes', 'edital', 'editais', 'licitacao', 'licitacoes',
    ])

    const termosObjetivos = filtros.termos.filter((t) => !termosGenericos.has(normalizarTextoBusca(t)))
    return termosObjetivos.length === 0
}


const MAPA_MACRO_SUBTIPOS: Record<string, string[]> = {
    saude: ['medicamentos', 'material hospitalar', 'exames/laboratorio', 'equipamentos medicos'],
    obra: ['pavimentacao', 'reforma predial', 'manutencao', 'construcao civil'],
    obras: ['pavimentacao', 'reforma predial', 'manutencao', 'construcao civil'],
    engenharia: ['eletrica', 'civil', 'hidraulica', 'projeto executivo'],
    alimentos: ['merenda escolar', 'generos alimenticios', 'cestas', 'nutricao'],
    alimentacao: ['merenda escolar', 'generos alimenticios', 'cestas', 'nutricao'],
    papelaria: ['material de expediente', 'impressos', 'suprimentos de escritorio', 'consumiveis'],
    projeto: ['projeto arquitetonico', 'projeto executivo', 'consultoria tecnica', 'fiscalizacao'],
    consultoria: ['juridica', 'contabil', 'ambiental', 'gestao publica'],
    ti: ['software/sistemas', 'infraestrutura/rede', 'suporte tecnico', 'dados/cloud'],
    tecnologia: ['software/sistemas', 'infraestrutura/rede', 'suporte tecnico', 'dados/cloud'],
    administrativo: ['material de expediente', 'servicos administrativos', 'apoio operacional', 'gestao documental'],
}

const ALIASES_MACRO: Record<string, string[]> = {
    obra: [
        'obra', 'obras', 'execucao de obra', 'execucao de obras', 'construcao',
        'construcao civil', 'infraestrutura', 'pavimentacao', 'reforma', 'manutencao predial',
        'engenharia civil',
    ],
    engenharia: [
        'engenharia', 'projeto executivo', 'fiscalizacao', 'hidraulica', 'eletrica',
        'engenharia eletrica', 'engenharia hidraulica',
    ],
    saude: [
        'saude', 'hospital', 'hospitalar', 'clinica', 'clinico',
        'medicamento', 'medicamentos', 'farmaceutico', 'insumo hospitalar',
        'material hospitalar', 'equipamentos medicos',
    ],
    alimentos: [
        'alimento', 'alimentos', 'alimentacao', 'merenda', 'merenda escolar',
        'generos alimenticios', 'cesta basica', 'cestas basicas', 'nutricao',
    ],
    ti: [
        'ti', 'tecnologia', 'informatica', 'software', 'sistema', 'sistemas',
        'rede', 'cloud', 'dados', 'suporte tecnico',
    ],
    administrativo: [
        'administrativo', 'expediente', 'papelaria', 'escritorio',
        'suprimentos', 'gestao documental', 'impressos',
    ],
    consultoria: [
        'consultoria', 'consultoria tecnica', 'consultoria ambiental',
        'consultoria juridica', 'consultoria contabil',
    ],
    projeto: [
        'projeto', 'projetos', 'projeto arquitetonico', 'projeto basico',
        'projeto executivo', 'arquitetura',
    ],
}

// Apenas chaves-macro sao genéricas. Subtipos (pavimentacao, reforma, etc.) sao
// específicos o bastante para executar a busca diretamente, sem desambiguação.
const TERMOS_MACRO_GENERICOS = new Set<string>([
    ...Object.keys(MAPA_MACRO_SUBTIPOS),
    ...Object.keys(ALIASES_MACRO),
    'material', 'materiais', 'servico', 'servicos', 'produto', 'produtos',
    'insumo', 'insumos', 'compra', 'compras', 'fornecimento', 'licitacao', 'edital',
    'conforme', 'especializada', 'municipal', 'portal', 'futura', 'eventual',
])

function detectarMacroNoTexto(texto: string): string | null {
    const t = normalizarTextoBusca(texto)
    let melhorMacro: string | null = null
    let melhorScore = 0

    for (const [macro, aliases] of Object.entries(ALIASES_MACRO)) {
        let score = 0
        for (const alias of aliases) {
            const a = normalizarTextoBusca(alias)
            if (a.length <= 2) {
                if (new RegExp(`(^|\\s)${a}(\\s|$)`).test(t)) score += 1
                continue
            }
            if (t.includes(a)) score += 1
        }
        if (score > melhorScore) {
            melhorScore = score
            melhorMacro = macro
        }
    }

    return melhorScore > 0 ? melhorMacro : null
}

function enriquecerTermosPorMacro(filtros: FiltrosConsulta, textoOriginal: string): FiltrosConsulta {
    const macro = detectarMacroNoTexto(textoOriginal)
    if (!macro) return filtros

    const termosNorm = filtros.termos.map((t) => normalizarTextoBusca(t))
    const termosVaziosOuGenericos = termosNorm.length === 0 || termosNorm.every((t) => TERMOS_MACRO_GENERICOS.has(t))
    if (!termosVaziosOuGenericos) return filtros

    const sementes = [macro, ...(TERMOS_EQUIVALENTES[macro] ?? []), ...(ALIASES_MACRO[macro] ?? [])]
    const termosEnriquecidos = Array.from(new Set([...filtros.termos, ...sementes]))
        .map((t) => normalizarTextoBusca(t).trim())
        .filter((t) => t.length >= 2 && !STOPWORDS_SEMANTICAS.has(t))
        .slice(0, 8)

    return {
        ...filtros,
        termos: termosEnriquecidos,
    }
}

function detectarPedidoAmplo(filtros: FiltrosConsulta, textoOriginal?: string): { macro: string; subtipos: string[] } | null {
    const termos = filtros.termos
        .map((t) => normalizarTextoBusca(t).trim())
        .filter((t) => t.length >= 2)

    if (termos.length === 0) return null

    const temDetalheEstrutural =
        filtros.modalidade !== null ||
        filtros.tipo_orgao !== null ||
        filtros.valor_min !== null ||
        filtros.valor_max !== null ||
        filtros.prazo_min_dias !== null ||
        filtros.prazo_max_dias !== null

    const todosMacros = termos.length > 0 && termos.every((t) => TERMOS_MACRO_GENERICOS.has(t))
    const macroPorTexto = textoOriginal ? detectarMacroNoTexto(textoOriginal) : null
    const macroPrincipal = macroPorTexto ?? termos.find((t) => MAPA_MACRO_SUBTIPOS[t]) ?? termos[0]

    if (todosMacros && !temDetalheEstrutural) {
        return {
            macro: macroPrincipal,
            subtipos: MAPA_MACRO_SUBTIPOS[macroPrincipal] ?? [
                'tipo especifico',
                'objeto detalhado',
                'perfil de orgao',
                'faixa de valor',
            ],
        }
    }

    return null
}
function mensagemDesambiguacaoAmpla(macro: string, subtipos: string[], filtros: FiltrosConsulta): string {
    const uf = filtros.ufs.length > 0 ? ` em ${filtros.ufs.join(', ')}` : ''
    const sugestoes = subtipos.slice(0, 4).map((s) => `• ${s}`).join('\n')

    return [
        `🤔 Entendi. "${macro}" é uma categoria ampla${uf}.`,
        '',
        'Para eu buscar com precisão, me diga o que você quer:',
        sugestoes,
        '',
        '💡 Formato ideal:',
        '"[subtipo] em [UF] acima de [valor]"',
        '',
        `_Exemplo: "${subtipos[0]}${uf} acima de 100k"_`,
    ].join('\n')
}
function mensagemRefinamentoBuscaGenerica(): string {
    return [
        '🤔 Entendi seu pedido, mas ele ainda está genérico para eu acertar bons editais.',
        '',
        '💡 Me envie neste formato:',
        '"[tipo] em [UF] acima de [valor]"',
        '',
        'Exemplos que eu entendo bem:',
        '• _"obra de pavimentação em GO acima de 500 mil"_',
        '• _"medicamentos hospitalares em SP"_',
        '• _"serviço de engenharia elétrica em TO para prefeitura"_',
        '• _"TI em todo Brasil acima de 100k"_',
    ].join('\n')
}
export async function handleConsulta(numero: string, texto: string): Promise<string> {
    const supabase = createAdminClient()
    let filtros = await extrairFiltrosConsulta(texto)

    // Fallback lexical caso a IA nao retorne termos
    if (filtros.termos.length === 0) {
        const STOPWORDS = new Set([
            'gostaria', 'quero', 'queria', 'buscar', 'pesquisar', 'encontrar', 'procurar',
            'editais', 'edital', 'licitacoes', 'licitacao', 'sobre', 'focados', 'focado',
            'apenas', 'para', 'como', 'nao', 'mais', 'tipo', 'algum', 'qualquer',
            'mostrar', 'listar', 'lista', 'busca', 'tenho', 'temos', 'meus', 'nosso',
            'todo', 'toda', 'todos', 'todas', 'brasil', 'nacional', 'pais',
            'norte', 'nordeste', 'sudeste', 'sul', 'centro', 'oeste', 'regiao', 'execucao', 'obras',
        ])
        const palavras = texto.toLowerCase()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z\s]/g, '')
            .split(/\s+/)
            .filter((p) => p.length > 3 && !STOPWORDS.has(p))
            .slice(0, 3)
        if (palavras.length > 0) {
            filtros.termos = palavras
            console.log('[Consulta] Termos por fallback NLP:', palavras)
        }
    }

    filtros = enriquecerTermosPorMacro(filtros, texto)

    const resumo = resumirFiltros(filtros)
    const temFiltros = resumo !== null
    const consultaGenerica = buscaGenericaDemais(filtros)
    const pedidoAmplo = detectarPedidoAmplo(filtros, texto)

    try {
        if (pedidoAmplo) {
            await salvarUltimaBusca(numero, [], filtros, 0)
            await registrarTelemetriaBusca(numero, texto, filtros, 0, 'nao_encontrado')
            return mensagemDesambiguacaoAmpla(pedidoAmplo.macro, pedidoAmplo.subtipos, filtros)
        }

        if (consultaGenerica) {
            await salvarUltimaBusca(numero, [], filtros, 0)
            await registrarTelemetriaBusca(numero, texto, filtros, 0, 'nao_encontrado')
            return mensagemRefinamentoBuscaGenerica()
        }

        let editais = await buscarComFiltros(supabase, filtros)
        let origemBusca: 'rpc_semantico' | 'pncp_live' = 'rpc_semantico'

        if (editais.length === 0 && temFiltros) {
            if (filtros.prazo_min_dias !== null || filtros.prazo_max_dias !== null) {
                editais = await buscarComFiltros(supabase, { ...filtros, prazo_min_dias: null, prazo_max_dias: null })
            }
        }
        if (editais.length === 0 && temFiltros) {
            if (filtros.valor_min !== null || filtros.valor_max !== null) {
                editais = await buscarComFiltros(supabase, { ...filtros, prazo_min_dias: null, prazo_max_dias: null, valor_min: null, valor_max: null })
            }
        }
        if (editais.length === 0 && temFiltros) {
            editais = await buscarComFiltros(supabase, { ...filtros, prazo_min_dias: null, prazo_max_dias: null, valor_min: null, valor_max: null, modalidade: null, tipo_orgao: null })
        }

        if (editais.length === 0) {
            const totalUpsertsLive = await buscarPNCPAoVivoEPopularBase(supabase, filtros)
            if (totalUpsertsLive > 0) {
                editais = await buscarComFiltros(supabase, filtros)
                if (editais.length > 0) origemBusca = 'pncp_live'
            }
        }

        if (editais.length === 0) {
            await salvarUltimaBusca(numero, [], filtros, 0)

            if (filtros.ufs.length > 0 && filtros.termos.length > 0) {
                const filtrosNacionais: FiltrosConsulta = {
                    ...filtros,
                    ufs: [],
                }
                const outrosEstados = await buscarComFiltros(supabase, filtrosNacionais, 3, 0)
                if (outrosEstados.length > 0) {
                    await registrarTelemetriaBusca(numero, texto, filtros, 0, 'nao_encontrado')
                    const listaOutros = outrosEstados.map((e, i) => formatarEdital(e, i + 1)).join('\n\n')
                    return [
                        `🚨 Não encontrei editais abertos com esse perfil em ${filtros.ufs.join(', ')} neste momento.`,
                        '',
                        '📢 *Mas encontrei oportunidades em outros estados:*',
                        '',
                        listaOutros,
                        '',
                        '_Se quiser, responda "buscar em todo Brasil" para ampliar automaticamente nas próximas buscas._',
                    ].join('\n')
                }
            }

            await registrarTelemetriaBusca(numero, texto, filtros, 0, 'nao_encontrado')
            const dica = temFiltros
                ? `🚨 Não localizei editais *abertos* para: ${resumo}.`
                : '🚨 Não localizei editais abertos no momento.'
            const termoExemplo = filtros.termos[0] ?? 'engenharia'
            return [
                `${dica}`,
                '',
                '💡 *Sugestões:*',
                '• Tente um refinamento: _"só em SP"_ ou _"acima de 100k"_',
                `• Tente ampliar: _"${termoExemplo} em todo Brasil"_`,
                '• Use termos mais gerais (ex: "engenharia", "saúde", "medicamentos", "obras")',
                '• Os alertas automáticos às *07h* monitoram um volume muito maior de editais',
            ].join('\n')
        }
        await salvarUltimaBusca(numero, editais, filtros, 0)
        await registrarTelemetriaBusca(numero, texto, filtros, editais.length, origemBusca)
        const lista = editais.map((e, i) => formatarEdital(e, i + 1)).join('\n\n')
        const cabecalho = resumo
            ? `📋 *${editais.length} edital(is) encontrado(s)* | ${resumo}`
            : `📋 *${editais.length} edital(is) encontrado(s)*`

        return [
            cabecalho,
            '',
            lista,
            '',
            '_Responda *edital N* (ex: "edital 2") para ver detalhes, análise de compatibilidade e mais._',
            '_Para ver mais resultados da mesma busca, responda *mostrar mais*._',
        ].join('\n')
    } catch (err) {
        console.error('[Consulta] Erro:', err instanceof Error ? err.message : err)
        return '⚠️ Não foi possível realizar a busca no momento. Tente novamente em instantes.'
    }
}

// Refinamento contextual
export async function handleRefinamento(numero: string, texto: string): Promise<string> {
    const supabase = createAdminClient()
    const { data: conversa } = await supabase
        .from('conversas').select('contexto_json').eq('numero_whatsapp', numero).maybeSingle()
    const contexto = (conversa?.contexto_json as ContextoConversa) ?? {}
    const filtrosAnteriores = contexto.ultimos_filtros

    if (!filtrosAnteriores) return handleConsulta(numero, texto)

    let filtros = await extrairFiltrosRefinamento(texto, filtrosAnteriores)
    console.log('[Consulta] Refinamento - filtros mesclados:', JSON.stringify(filtros))

    filtros = enriquecerTermosPorMacro(filtros, texto)

    const resumo = (() => {
        const partes: string[] = []
        if (filtros.termos.length > 0) partes.push(`segmento: _${filtros.termos.join(', ')}_`)
        if (filtros.excluir.length > 0) partes.push(`excluindo: _${filtros.excluir.join(', ')}_`)
        if (filtros.ufs.length > 0) partes.push(`UF: _${filtros.ufs.join(', ')}_`)
        if (filtros.modalidade) partes.push(`modalidade: _${filtros.modalidade}_`)
        if (filtros.valor_min !== null) partes.push(`>= _${filtros.valor_min.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}_`)
        if (filtros.valor_max !== null) partes.push(`<= _${filtros.valor_max.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}_`)
        return partes.length > 0 ? partes.join(' | ') : null
    })()

    const consultaGenerica = buscaGenericaDemais(filtros)
    const pedidoAmplo = detectarPedidoAmplo(filtros, texto)

    try {
        if (pedidoAmplo) {
            await salvarUltimaBusca(numero, [], filtros, 0)
            await registrarTelemetriaBusca(numero, texto, filtros, 0, 'nao_encontrado')
            return mensagemDesambiguacaoAmpla(pedidoAmplo.macro, pedidoAmplo.subtipos, filtros)
        }

        if (consultaGenerica) {
            await salvarUltimaBusca(numero, [], filtros, 0)
            await registrarTelemetriaBusca(numero, texto, filtros, 0, 'nao_encontrado')
            return mensagemRefinamentoBuscaGenerica()
        }

        let editais = await buscarComFiltros(supabase, filtros)
        let origemBusca: 'rpc_semantico' | 'pncp_live' = 'rpc_semantico'

        if (editais.length === 0) {
            editais = await buscarComFiltros(supabase, { ...filtros, prazo_min_dias: null, prazo_max_dias: null })
        }
        if (editais.length === 0) {
            editais = await buscarComFiltros(supabase, { ...filtros, prazo_min_dias: null, prazo_max_dias: null, valor_min: null, valor_max: null })
        }

        if (editais.length === 0) {
            const totalUpsertsLive = await buscarPNCPAoVivoEPopularBase(supabase, filtros)
            if (totalUpsertsLive > 0) {
                editais = await buscarComFiltros(supabase, filtros)
                if (editais.length > 0) origemBusca = 'pncp_live'
            }
        }

        if (editais.length === 0) {
            return [
                resumo ? `🚨 Refinamento: "${resumo}" — nenhum resultado encontrado.` : '🚨 Nenhum resultado encontrado.',
                '',
                '_Tente ampliar os critérios ou faça uma nova busca._',
            ].join('\n')
        }

        await salvarUltimaBusca(numero, editais, filtros, 0)
        await registrarTelemetriaBusca(numero, texto, filtros, editais.length, origemBusca)
        const lista = editais.map((e, i) => formatarEdital(e, i + 1)).join('\n\n')

        return [
            resumo ? `📋 *${editais.length} edital(is) encontrado(s)* | ${resumo}` : `📋 *${editais.length} edital(is)*`,
            '',
            lista,
            '',
            '_Refine mais (ex: "só acima de 100k"), responda *edital N* para detalhes ou *mostrar mais* para próxima página._',
        ].join('\n')
    } catch (err) {
        console.error('[Consulta] Erro no refinamento:', err instanceof Error ? err.message : err)
        return handleConsulta(numero, texto)
    }
}

// Paginacao contextual da ultima busca
export async function handleMaisResultados(numero: string): Promise<string> {
    const supabase = createAdminClient()
    const { data: conversa } = await supabase
        .from('conversas').select('contexto_json').eq('numero_whatsapp', numero).maybeSingle()
    const contexto = (conversa?.contexto_json as ContextoConversa) ?? {}
    const filtros = contexto.ultimos_filtros

    if (!filtros) {
        return [
            '🚨 Não encontrei uma busca recente para paginar.',
            '',
            '_Descreva o que procura (ex: "TI em SP acima de 100k") e eu busco agora._',
        ].join('\n')
    }

    const offsetAtual = contexto.ultimo_offset_busca ?? 0
    const proximoOffset = offsetAtual + MAX_RESULTADOS

    try {
        const editais = await buscarComFiltros(supabase, filtros, MAX_RESULTADOS, proximoOffset)
        if (editais.length === 0) {
            return [
                '✅ Você já viu todos os resultados dessa busca.',
                '',
                '_Se quiser, refine com algo como "só em MG" ou "acima de 200k"._',
            ].join('\n')
        }

        await salvarUltimaBusca(numero, editais, filtros, proximoOffset)
        const lista = editais.map((e, i) => formatarEdital(e, i + 1)).join('\n\n')

        return [
            `➡️ *Mais ${editais.length} resultado(s) da mesma busca*`,
            '',
            lista,
            '',
            '_Responda *edital N* para detalhes ou *mostrar mais* para continuar._',
        ].join('\n')
    } catch (err) {
        console.error('[Consulta] Erro na paginacao:', err instanceof Error ? err.message : err)
        return '⚠️ Não foi possível carregar mais resultados agora. Tente novamente em instantes.'
    }
}




























