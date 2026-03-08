/**
 * assistant.ts - Assistente conversacional do LicitaIA (via Cerebras)
 */

import OpenAI from 'openai'
import { z } from 'zod'
import type { EtapaOnboarding, ContextoConversa, IntencaoMensagem, FiltrosConsulta } from '@/types'

const client = new OpenAI({
    apiKey: process.env.CEREBRAS_API_KEY,
    baseURL: 'https://api.cerebras.ai/v1',
})

const CEREBRAS_MODEL = 'llama3.1-8b'

const SchemaIntencao = z.object({
    intencao: z.enum(['onboarding', 'consulta', 'comando', 'duvida']),
    confianca: z.number().min(0).max(1),
})

const SchemaDadosPerfil = z.object({
    valor_extraido: z.string().optional(),
    dados: z.object({
        descricao: z.string().optional(),
        uf_interesse: z.array(z.string()).optional(),
        valor_min: z.number().nullable().optional(),
        valor_max: z.number().nullable().optional(),
        razao_social: z.string().nullable().optional(),
    }),
})

export async function identificarIntencao(
    texto: string,
    etapaAtual: EtapaOnboarding | null
): Promise<IntencaoMensagem> {
    if (etapaAtual && etapaAtual !== 'concluido') return 'onboarding'

    const textoNorm = texto.toLowerCase().trim()

    const COMANDOS = [
        'planos', 'assinar', 'upgrade', 'meu plano',
        'pausar', 'parar', 'ativar', 'retomar',
        'mudar perfil', 'alterar perfil', 'novo perfil',
        'ajuda', 'help', 'menu', 'suporte',
    ]
    if (COMANDOS.some((c) => textoNorm === c || textoNorm.includes(c))) return 'comando'

    const SAUDACOES = ['oi', 'ola', 'ola', 'bom dia', 'boa tarde', 'boa noite', 'hey', 'hello', 'hi']
    if (SAUDACOES.some((s) => textoNorm === s || textoNorm.startsWith(`${s} `))) return 'onboarding'

    const CONSULTA_KEYWORDS = [
        'busca', 'buscar', 'procura', 'procurar',
        'licitacao', 'licitacao', 'licitacoes', 'licitacoes',
        'edital', 'editais', 'pregao', 'pregao', 'dispensa',
        'oportunidade', 'oportunidades', 'contrato', 'contratos',
    ]
    if (CONSULTA_KEYWORDS.some((c) => textoNorm.includes(c))) return 'consulta'

    try {
        const response = await client.chat.completions.create({
            model: CEREBRAS_MODEL,
            max_tokens: 80,
            temperature: 0,
            messages: [{
                role: 'user',
                content: `Classifique esta mensagem de usuario do LicitaIA (monitoramento de licitacoes publicas brasileiras via WhatsApp).

Categorias:
- "consulta": buscar editais, oportunidades, licitacoes abertas
- "comando": planos, pausar alertas, mudar perfil, suporte
- "onboarding": cadastro inicial
- "duvida": duvida geral

Mensagem: "${texto}"
Responda APENAS com JSON: {"intencao": "<categoria>", "confianca": 0.9}`,
            }],
        })

        const txt = response.choices[0]?.message?.content ?? ''
        const match = txt.match(/\{[\s\S]*\}/)
        if (!match) throw new Error('Sem JSON')
        const parsed = SchemaIntencao.safeParse(JSON.parse(match[0]))
        if (parsed.success) return parsed.data.intencao
    } catch (err) {
        console.warn('[Assistant] Falha ao identificar intencao:', err instanceof Error ? err.message : err)
    }

    return 'duvida'
}

export async function extrairDadosPerfil(
    etapa: EtapaOnboarding,
    texto: string
): Promise<Partial<ContextoConversa>> {
    const prompts: Record<EtapaOnboarding, string | null> = {
        inicio: null,
        nome: null,
        concluido: null,
        descricao_empresa: `Extraia a descricao do negocio da mensagem. Retorne JSON:\n{"dados": {"descricao": "<descricao clara>", "razao_social": "<nome se citado ou null>"}}\n\nMensagem: "${texto}"`,
        estados: `Extraia UFs mencionadas. Se for "todo Brasil", retorne as 27 UFs. JSON:\n{"dados": {"uf_interesse": ["UF1", "UF2"]}}\n\nUFs validas: AC,AL,AM,AP,BA,CE,DF,ES,GO,MA,MG,MS,MT,PA,PB,PE,PI,PR,RJ,RN,RO,RR,RS,SC,SE,SP,TO\n\nMensagem: "${texto}"`,
        faixa_valor: `Extraia faixa de valor para licitacoes. JSON:\n{"dados": {"valor_min": <numero ou null>, "valor_max": <numero ou null>}}\n\nMensagem: "${texto}"`,
    }

    const promptTexto = prompts[etapa]
    if (!promptTexto) return {}

    try {
        const response = await client.chat.completions.create({
            model: CEREBRAS_MODEL,
            max_tokens: 300,
            temperature: 0,
            messages: [{ role: 'user', content: promptTexto }],
        })

        const txt = response.choices[0]?.message?.content ?? ''
        const match = txt.match(/\{[\s\S]*\}/)
        if (!match) throw new Error('Sem JSON')
        const parsed = SchemaDadosPerfil.safeParse(JSON.parse(match[0]))
        if (parsed.success) return parsed.data.dados
    } catch (err) {
        console.warn('[Assistant] Erro ao extrair dados:', err instanceof Error ? err.message : err)
    }

    return {}
}

export function respostaBemVindo(): string {
    return [
        '👋 Seja bem-vindo ao *LicitaIA*!',
        '',
        'Sou seu assistente de monitoramento de licitações públicas brasileiras.',
        '',
        'Para começarmos, qual é o seu *nome*?',
    ].join('\n')
}

export function respostaPedirDescricao(nome: string): string {
    return [
        `😊 Prazer, *${nome}*!`,
        '',
        'Agora me fale sobre sua empresa: *o que ela faz?*',
        '',
        '_Ex: "Prestamos serviços de engenharia para órgãos públicos"_',
    ].join('\n')
}

export function respostaPedirEstados(nome?: string): string {
    const s = nome ? `Certo, *${nome}*! ` : ''
    return [
        `✅ ${s}Perfil registrado.`,
        '',
        '🗺️ Em quais *estados* deseja monitorar licitações?',
        '',
        '_Ex: SP, RJ, MG ou "todo Brasil"_',
    ].join('\n')
}

export function respostaPedirFaixaValor(ufs: string[], _nome?: string): string {
    const listaUFs = ufs.length > 5 ? `${ufs.slice(0, 5).join(', ')} e mais ${ufs.length - 5}` : ufs.join(', ')
    return [
        `📍 Cobertura: *${listaUFs}*`,
        '',
        '💰 Qual a *faixa de valor* de interesse?',
        '',
        '_Ex: "acima de 50 mil", "entre 100k e 2M", "qualquer valor"_',
    ].join('\n')
}

export function respostaConcluido(
    nome: string | undefined,
    descricao: string,
    ufs: string[],
    valorMin: number | null,
    valorMax: number | null
): string {
    const faixa = (() => {
        if (valorMin && valorMax) return `R$ ${valorMin.toLocaleString('pt-BR')} a R$ ${valorMax.toLocaleString('pt-BR')}`
        if (valorMin) return `Acima de R$ ${valorMin.toLocaleString('pt-BR')}`
        if (valorMax) return `Ate R$ ${valorMax.toLocaleString('pt-BR')}`
        return 'Qualquer valor'
    })()

    const listaUFs = ufs.length > 5 ? `${ufs.slice(0, 5).join(', ')} e mais ${ufs.length - 5}` : ufs.join(', ')
    const saudacao = nome ? `, *${nome}*` : ''

    return [
        `🎉 *Monitoramento configurado com sucesso${saudacao}!*`,
        '',
        '📋 Resumo do perfil:',
        `• Empresa: ${descricao.substring(0, 80)}${descricao.length > 80 ? '...' : ''}`,
        `• Estados: ${listaUFs}`,
        `• Faixa de valor: ${faixa}`,
        '',
        '⏰ Todos os dias às *07h* eu monitoro e envio alertas relevantes.',
    ].join('\n')
}

export function respostaBemVindoDeVolta(nome?: string): string {
    const s = nome ? `, *${nome}*` : ''
    return [
        `👋 Bem-vindo de volta${s}!`,
        '',
        '✅ Seu perfil está ativo.',
        '_Responda *menu* para opções ou descreva o edital que procura._',
    ].join('\n')
}

function normalizarTextoBase(texto: string): string {
    return texto.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

function montarContextoBuscaParaPrompt(contexto?: ContextoConversa): string {
    const busca = contexto?.ultima_busca ?? []
    if (busca.length === 0) return 'Sem busca recente.'

    return busca.slice(0, 5).map((item) => {
        const valor = item.valor_estimado !== undefined && item.valor_estimado !== null
            ? `R$ ${Number(item.valor_estimado).toLocaleString('pt-BR')}`
            : 'valor nao informado'
        const prazo = item.data_encerramento ?? 'prazo nao informado'
        return `${item.indice}) ${item.nome_orgao} | ${item.modalidade ?? 'modalidade nao informada'} | ${valor} | encerra: ${prazo} | objeto: ${item.objeto}`
    }).join('\n')
}

function montarHistoricoConversaParaPrompt(contexto?: ContextoConversa): string {
    const historico = contexto?.historico_mensagens ?? []
    if (historico.length === 0) return 'Sem historico recente.'
    return historico.slice(-6).map((m) => `${m.role === 'user' ? 'Usuario' : 'Assistente'}: ${m.texto}`).join('\n')
}

function montarDiretrizPerfil(perfil?: ContextoConversa['perfil_comunicacao']): string {
    if (perfil === 'direto') {
        return [
            '- Seja objetivo e curto',
            '- Priorize respostas em 2 a 4 linhas',
            '- Evite rodeios',
        ].join('\n')
    }

    return [
        '- Mantenha tom consultivo e didatico',
        '- Linguagem simples e pratica',
        '- Quando fizer sentido, indique o proximo passo',
    ].join('\n')
}

function respostaAnaliticaUltimaBusca(texto: string, contexto?: ContextoConversa): string | null {
    const busca = contexto?.ultima_busca ?? []
    if (busca.length === 0) return null

    const t = normalizarTextoBase(texto)
    const comValor = busca.filter((b) => b.valor_estimado !== null && b.valor_estimado !== undefined)
    const comPrazo = busca.filter((b) => b.data_encerramento)

    if (/(mais urgente|vence primeiro|prazo|encerr)/.test(t) && comPrazo.length > 0) {
        const top = [...comPrazo].sort((a, b) => new Date(a.data_encerramento as string).getTime() - new Date(b.data_encerramento as string).getTime())[0]
        return [
            `O edital *${top.indice}* parece o mais urgente da ultima lista.`,
            `Encerra em *${new Date(top.data_encerramento as string).toLocaleDateString('pt-BR')}* (${top.nome_orgao}).`,
            `_Se quiser, responda *edital ${top.indice}* para detalhes._`,
        ].join('\n')
    }

    if (/(mais caro|maior valor|valor maior|alto valor)/.test(t) && comValor.length > 0) {
        const top = [...comValor].sort((a, b) => Number(b.valor_estimado) - Number(a.valor_estimado))[0]
        return [
            `Maior valor estimado: edital *${top.indice}*.`,
            `Orgao: *${top.nome_orgao}* | Valor: *R$ ${Number(top.valor_estimado).toLocaleString('pt-BR')}*`,
            `_Responda *edital ${top.indice}* para abrir._`,
        ].join('\n')
    }

    return null
}

export async function respostaDuvida(texto: string, contexto?: ContextoConversa): Promise<string> {
    const respostaContextual = respostaAnaliticaUltimaBusca(texto, contexto)
    if (respostaContextual) return respostaContextual

    const contextoBusca = montarContextoBuscaParaPrompt(contexto)
    const historicoRecente = montarHistoricoConversaParaPrompt(contexto)
    const perfilComunicacao = contexto?.perfil_comunicacao ?? 'consultivo'
    const diretrizPerfil = montarDiretrizPerfil(perfilComunicacao)

    try {
        const response = await client.chat.completions.create({
            model: CEREBRAS_MODEL,
            max_tokens: 420,
            temperature: 0.5,
            messages: [{
                role: 'system',
                content: `Voce e o assistente especialista do LicitaIA, plataforma de monitoramento de licitacoes publicas brasileiras via WhatsApp.

SOBRE O LICITAIA:
- Score 0-100 de compatibilidade
- Alertas diarios
- Busca manual e favoritos por WhatsApp

COMANDOS RAPIDOS:
menu | pausar | ativar | mudar perfil | planos | suporte
Busca: "engenharia civil em SP acima de 100k"
Detalhe: "edital 2" apos ver lista

CONTEXTO DA CONVERSA (ULTIMA BUSCA):
${contextoBusca}

HISTORICO RECENTE:
${historicoRecente}

ESTILO DE RESPOSTA:
- Use *negrito* e _italico_
- Se a pergunta for ambigua, finalize com 1 pergunta objetiva
- Nunca invente dados sobre editais especificos

PERFIL DE COMUNICACAO DO USUARIO:
- Perfil atual: ${perfilComunicacao}
${diretrizPerfil}`,
            }, {
                role: 'user',
                content: texto,
            }],
        })

        const txt = response.choices[0]?.message?.content
        if (txt) return txt
    } catch (err) {
        console.warn('[Assistant] Erro ao responder duvida:', err instanceof Error ? err.message : err)
    }

    return [
        '😕 Não consegui processar sua mensagem agora.',
        '',
        '• Responda *menu* para ver opções',
        '• Responda *suporte* para falar com a equipe',
    ].join('\n')
}

const SchemaFiltros = z.object({
    termos: z.array(z.string()),
    ufs: z.array(z.string()),
    prazo_min_dias: z.number().nullable(),
    prazo_max_dias: z.number().nullable(),
    valor_min: z.number().nullable(),
    valor_max: z.number().nullable(),
    modalidade: z.string().nullable(),
    tipo_orgao: z.string().nullable(),
    excluir: z.array(z.string()).default([]),
})

function normalizarTextoFiltro(texto: string): string {
    return texto
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
}

const UF_SIGLAS_VALIDAS = new Set([
    'AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS', 'MT',
    'PA', 'PB', 'PE', 'PI', 'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO',
])

const UF_POR_NOME: Record<string, string> = {
    acre: 'AC',
    alagoas: 'AL',
    amapa: 'AP',
    amazonas: 'AM',
    bahia: 'BA',
    ceara: 'CE',
    'distrito federal': 'DF',
    'espirito santo': 'ES',
    goias: 'GO',
    maranhao: 'MA',
    'mato grosso': 'MT',
    'mato grosso do sul': 'MS',
    'minas gerais': 'MG',
    paraiba: 'PB',
    parana: 'PR',
    pernambuco: 'PE',
    piaui: 'PI',
    'rio de janeiro': 'RJ',
    'rio grande do norte': 'RN',
    'rio grande do sul': 'RS',
    rondonia: 'RO',
    roraima: 'RR',
    'santa catarina': 'SC',
    'sao paulo': 'SP',
    sergipe: 'SE',
    tocantins: 'TO',
}
const UFS_POR_REGIAO: Record<'norte' | 'nordeste' | 'centro_oeste' | 'sudeste' | 'sul', string[]> = {
    norte: ['AC', 'AM', 'AP', 'PA', 'RO', 'RR', 'TO'],
    nordeste: ['AL', 'BA', 'CE', 'MA', 'PB', 'PE', 'PI', 'RN', 'SE'],
    centro_oeste: ['DF', 'GO', 'MS', 'MT'],
    sudeste: ['ES', 'MG', 'RJ', 'SP'],
    sul: ['PR', 'RS', 'SC'],
}

function textoMencionaUfPorSigla(textoNormalizado: string, uf: string): boolean {
    const ufLower = uf.toLowerCase()
    return new RegExp(`(?:^|[\\s,;:/()\\-])${ufLower}(?:$|[\\s,;:/()\\-])`).test(textoNormalizado)
}

function termoEhRuidoGeograficoOuEscopo(termo: string): boolean {
    return [
        /\b(todo o brasil|todo brasil|em todo brasil|brasil inteiro|nacional|pais inteiro)\b/,
        /\b(norte do brasil|nordeste|sudeste|sul do brasil|centro oeste|centro-oeste|regiao norte|regiao nordeste|regiao sudeste|regiao sul|regiao centro oeste)\b/,
        /\bqualquer valor\b/,
    ].some((regex) => regex.test(termo))
}

function extrairUFsDoTexto(textoOriginal: string, ufsBase: string[]): string[] {
    const t = normalizarTextoFiltro(textoOriginal)
    const coletadas: string[] = []

    // Escopo nacional explicito -> sem filtro de UF.
    if (/\b(todo o brasil|todo brasil|em todo brasil|nacional|brasil inteiro|pais inteiro)\b/.test(t)) {
        return []
    }

    for (const uf of UF_SIGLAS_VALIDAS) {
        if (textoMencionaUfPorSigla(t, uf)) coletadas.push(uf)
    }

    // Mantem UFs extraidas pelo modelo apenas se a sigla aparecer no texto do usuario.
    for (const uf of ufsBase) {
        const sigla = uf.toUpperCase().trim()
        if (UF_SIGLAS_VALIDAS.has(sigla) && textoMencionaUfPorSigla(t, sigla)) coletadas.push(sigla)
    }

    // Evita falso positivo de PA quando o usuario usa a preposicao "para".
    if (/\bestado do para\b/.test(t) || /\bno para\b/.test(t) || /\bem para\b/.test(t)) {
        coletadas.push('PA')
    }

    for (const [nome, sigla] of Object.entries(UF_POR_NOME)) {
        if (new RegExp(`\\b${nome}\\b`).test(t)) coletadas.push(sigla)
    }

    // Regioes do Brasil -> expansao para UFs
    if (/\b(norte do brasil|regiao norte|norte)\b/.test(t)) coletadas.push(...UFS_POR_REGIAO.norte)
    if (/\b(nordeste|regiao nordeste)\b/.test(t)) coletadas.push(...UFS_POR_REGIAO.nordeste)
    if (/\b(centro oeste|centro-oeste|regiao centro oeste|regiao centro-oeste)\b/.test(t)) coletadas.push(...UFS_POR_REGIAO.centro_oeste)
    if (/\b(sudeste|regiao sudeste)\b/.test(t)) coletadas.push(...UFS_POR_REGIAO.sudeste)
    if (/\b(sul do brasil|regiao sul|sul)\b/.test(t)) coletadas.push(...UFS_POR_REGIAO.sul)

    return Array.from(new Set(coletadas))
}

function sanitizarFiltrosConsulta(base: FiltrosConsulta, textoOriginal: string): FiltrosConsulta {
    const stopwords = new Set([
        'quero', 'queria', 'gostaria', 'buscar', 'busca', 'pesquisar', 'procurar',
        'informacao', 'informacoes', 'edital', 'editais', 'licitacao', 'licitacoes',
        'me', 'para', 'com', 'sem', 'de', 'do', 'da', 'no', 'na', 'em', 'por', 'favor',
        'mostrar', 'lista', 'sobre', 'dados', 'qualquer', 'valor', 'valores',
        'todo', 'toda', 'todos', 'todas', 'brasil', 'nacional', 'pais',
        'norte', 'nordeste', 'sudeste', 'sul', 'centro oeste', 'centro-oeste',
        'execucao', 'execucoes',
    ])

    const ufsBloqueadas = new Set([
        ...Object.keys(UF_POR_NOME),
        ...Array.from(UF_SIGLAS_VALIDAS).map((s) => s.toLowerCase()),
    ])

    const termos = base.termos
        .map((x) => normalizarTextoFiltro(x))
        .filter((x) => (x.length >= 3 || x === 'ti') && !stopwords.has(x))
        .filter((x) => !termoEhRuidoGeograficoOuEscopo(x))
        .filter((x) => !ufsBloqueadas.has(x))
        .filter((x) => !/\d/.test(x))
        .filter((x) => !/\b(acima|abaixo|entre|ate|maior|menor|minimo|maximo)\b/.test(x))

    const termosUnicos = Array.from(new Set(termos)).slice(0, 4)

    const t = normalizarTextoFiltro(textoOriginal)

    const mencionaModalidade = /(pregao|dispensa|concorrencia|credenciamento)/.test(t)
    const mencionaTipoOrgao = /(prefeitura|municipal|federal|estadual|universidade|autarquia)/.test(t)
    const mencionaExclusao = /\b(sem|exceto|tirando|excluir|exclua|nao quero)\b/.test(t)
    const excluirSanitizado = Array.from(new Set(
        base.excluir
            .map((x) => normalizarTextoFiltro(x))
            .filter((x) => x.length >= 3 && !stopwords.has(x))
            .filter((x) => !/\d/.test(x))
            .filter((x) => !/\b(acima|abaixo|entre|ate|maior|menor|minimo|maximo)\b/.test(x))
    ))

    return {
        ...base,
        termos: termosUnicos,
        ufs: extrairUFsDoTexto(textoOriginal, base.ufs),
        modalidade: mencionaModalidade ? base.modalidade : null,
        tipo_orgao: mencionaTipoOrgao ? base.tipo_orgao : null,
        excluir: mencionaExclusao ? excluirSanitizado : [],
    }
}
export async function extrairFiltrosConsulta(texto: string): Promise<FiltrosConsulta> {
    const FILTROS_VAZIOS: FiltrosConsulta = {
        termos: [],
        ufs: [],
        prazo_min_dias: null,
        prazo_max_dias: null,
        valor_min: null,
        valor_max: null,
        modalidade: null,
        tipo_orgao: null,
        excluir: [],
    }

    try {
        const response = await client.chat.completions.create({
            model: CEREBRAS_MODEL,
            max_tokens: 300,
            temperature: 0,
            messages: [{
                role: 'user',
                content: `Voce e um extrator de filtros para busca de licitacoes publicas brasileiras.
Data atual: ${new Date().toLocaleDateString('pt-BR')}

Extraia filtros e retorne APENAS JSON valido:
{
  "termos": ["<palavras-chave>"],
  "ufs": ["<siglas UF>"],
  "prazo_min_dias": <numero ou null>,
  "prazo_max_dias": <numero ou null>,
  "valor_min": <numero ou null>,
  "valor_max": <numero ou null>,
  "modalidade": "<pregao|dispensa|concorrencia|credenciamento|null>",
  "tipo_orgao": "<prefeitura|federal|estadual|universidade|autarquia|null>",
  "excluir": ["<termos a excluir>"]
}

Mensagem: "${texto}"`,
            }],
        })

        const txt = response.choices[0]?.message?.content ?? ''
        const match = txt.match(/\{[\s\S]*\}/)
        if (!match) throw new Error('Nenhum JSON')
        const parsed = SchemaFiltros.safeParse(JSON.parse(match[0]))
        if (parsed.success) return sanitizarFiltrosConsulta(parsed.data, texto)
    } catch (err) {
        console.warn('[Assistant] Erro ao extrair filtros:', err instanceof Error ? err.message : err)
    }

    return FILTROS_VAZIOS
}
export async function extrairFiltrosRefinamento(
    texto: string,
    filtrosAnteriores: FiltrosConsulta
): Promise<FiltrosConsulta> {
    const novos = await extrairFiltrosConsulta(texto)
    const t = normalizarTextoFiltro(texto)
    const ampliarBrasil =
        /\b(em\s+)?todo\s+o?\s*brasil\b/.test(t) ||
        /\bnacional\b/.test(t)
    const manterExclusao = /\b(sem|exceto|tirando|excluir|exclua|nao quero)\b/.test(t)
    const excluirRefinado = manterExclusao
        ? [...new Set([...filtrosAnteriores.excluir, ...novos.excluir])]
        : []

    if (ampliarBrasil) {
        return {
            termos:         novos.termos.length > 0 ? novos.termos : filtrosAnteriores.termos,
            ufs:            [],
            prazo_min_dias: novos.prazo_min_dias !== null ? novos.prazo_min_dias : filtrosAnteriores.prazo_min_dias,
            prazo_max_dias: novos.prazo_max_dias !== null ? novos.prazo_max_dias : filtrosAnteriores.prazo_max_dias,
            valor_min:      novos.valor_min !== null ? novos.valor_min : filtrosAnteriores.valor_min,
            valor_max:      novos.valor_max !== null ? novos.valor_max : filtrosAnteriores.valor_max,
            modalidade:     novos.modalidade !== null ? novos.modalidade : filtrosAnteriores.modalidade,
            tipo_orgao:     novos.tipo_orgao !== null ? novos.tipo_orgao : filtrosAnteriores.tipo_orgao,
            excluir:        excluirRefinado,
        }
    }

    return {
        termos:         novos.termos.length > 0 ? novos.termos : filtrosAnteriores.termos,
        ufs:            novos.ufs.length > 0 ? novos.ufs : filtrosAnteriores.ufs,
        prazo_min_dias: novos.prazo_min_dias !== null ? novos.prazo_min_dias : filtrosAnteriores.prazo_min_dias,
        prazo_max_dias: novos.prazo_max_dias !== null ? novos.prazo_max_dias : filtrosAnteriores.prazo_max_dias,
        valor_min:      novos.valor_min !== null ? novos.valor_min : filtrosAnteriores.valor_min,
        valor_max:      novos.valor_max !== null ? novos.valor_max : filtrosAnteriores.valor_max,
        modalidade:     novos.modalidade !== null ? novos.modalidade : filtrosAnteriores.modalidade,
        tipo_orgao:     novos.tipo_orgao !== null ? novos.tipo_orgao : filtrosAnteriores.tipo_orgao,
        excluir:        excluirRefinado,
    }
}

export function respostaMenu(): string {
    return [
        '📌 *LicitaIA — Central*',
        '',
        '🔍 *Busca:*',
        '_Descreva o que procura (ex: "engenharia em SP acima de 100k")_',
        '_Depois responda "edital 2" para detalhes_',
        '_Use "mostrar mais" para paginar_',
        '',
        '⚙️ *Comandos:*',
        '• *meus editais* — editais que você acompanha',
        '• *planos* — ver ou alterar seu plano',
        '• *mudar perfil* — atualizar dados da empresa',
        '• *pausar / ativar* — controlar alertas',
        '• *suporte* — falar com a equipe',
    ].join('\n')
}







