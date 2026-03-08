/**
 * onboarding.ts — Handler do fluxo de onboarding via WhatsApp
 *
 * Etapas: inicio → nome → descricao_empresa → estados → faixa_valor → concluido
 */

import { createAdminClient } from '@/lib/supabase/server'
import {
    extrairDadosPerfil,
    respostaBemVindo,
    respostaBemVindoDeVolta,
    respostaPedirDescricao,
    respostaPedirEstados,
    respostaPedirFaixaValor,
    respostaConcluido,
} from '@/lib/ai/assistant'
import type { ConversaDB, ContextoConversa, EtapaOnboarding } from '@/types'

// ─── Helpers ──────────────────────────────────────────────────────────────

async function buscarOuCriarConversa(numero: string): Promise<ConversaDB> {
    const supabase = createAdminClient()

    const { data: existente, error } = await supabase
        .from('conversas')
        .select('*')
        .eq('numero_whatsapp', numero)
        .maybeSingle()

    if (error) throw new Error(`[Onboarding] Erro ao buscar conversa: ${error.message}`)
    if (existente) return existente as ConversaDB

    const { data: nova, error: errCriacao } = await supabase
        .from('conversas')
        .insert({ numero_whatsapp: numero, etapa: 'inicio', contexto_json: {} })
        .select()
        .single()

    if (errCriacao) throw new Error(`[Onboarding] Erro ao criar conversa: ${errCriacao.message}`)
    return nova as ConversaDB
}

async function atualizarConversa(
    numero: string,
    etapa: EtapaOnboarding,
    contexto: ContextoConversa
): Promise<void> {
    const supabase = createAdminClient()

    const { error } = await supabase
        .from('conversas')
        .update({ etapa, contexto_json: contexto, updated_at: new Date().toISOString() })
        .eq('numero_whatsapp', numero)

    if (error) throw new Error(`[Onboarding] Erro ao atualizar conversa: ${error.message}`)
}

async function salvarPerfilCompleto(
    numero: string,
    contexto: Required<Pick<ContextoConversa, 'descricao'>> & ContextoConversa
): Promise<void> {
    const supabase = createAdminClient()

    // 1. Upsert na tabela usuarios (inclui nome se disponível)
    const { data: usuario, error: errUsuario } = await supabase
        .from('usuarios')
        .upsert(
            {
                whatsapp: numero,
                nome: contexto.nome ?? null,
                updated_at: new Date().toISOString(),
            },
            { onConflict: 'whatsapp' }
        )
        .select('id')
        .single()

    if (errUsuario) throw new Error(`[Onboarding] Erro ao salvar usuário: ${errUsuario.message}`)

    const usuarioId = usuario.id

    // 2. Upsert na tabela perfil_empresa
    const perfilData = {
        usuario_id: usuarioId,
        whatsapp: numero,
        descricao: contexto.descricao,
        uf_interesse: contexto.uf_interesse ?? [],
        valor_min: contexto.valor_min ?? null,
        valor_max: contexto.valor_max ?? null,
        razao_social: contexto.razao_social ?? null,
        palavras_chave: extrairPalavrasChave(contexto.descricao),
        segmentos: inferirSegmentos(contexto.descricao, contexto.uf_interesse ?? []),
        updated_at: new Date().toISOString(),
    }

    const { error: errPerfil } = await supabase
        .from('perfil_empresa')
        .upsert(perfilData, { onConflict: 'usuario_id' })

    if (errPerfil) throw new Error(`[Onboarding] Erro ao salvar perfil: ${errPerfil.message}`)

    await atualizarConversa(numero, 'concluido', contexto)

    console.log(`[Onboarding] Perfil salvo para ${numero} (usuario_id: ${usuarioId})`)
}

function extrairPalavrasChave(descricao: string): string[] {
    const stopwords = new Set(['de', 'do', 'da', 'para', 'com', 'em', 'e', 'o', 'a', 'os', 'as', 'um', 'uma'])
    return descricao
        .toLowerCase()
        .split(/\s+/)
        .filter((p) => p.length > 3 && !stopwords.has(p))
        .slice(0, 10)
}

function inferirSegmentos(descricao: string, _ufs: string[]): string[] {
    const desc = descricao.toLowerCase()
    const segmentos: string[] = []

    const mapeamento: Record<string, string[]> = {
        'Tecnologia da Informação': ['software', 'sistema', 'ti ', 'tecnologia', 'desenvolvimento', 'aplicativo', 'app', 'digital'],
        'Construção Civil': ['construção', 'obra', 'engenharia', 'reforma', 'pavimentação', 'arquitetura'],
        'Saúde': ['saúde', 'hospital', 'médico', 'farmácia', 'equipamento médico'],
        'Educação': ['educação', 'escola', 'ensino', 'treinamento', 'capacitação'],
        'Limpeza e Conservação': ['limpeza', 'conservação', 'higienização', 'zeladoria'],
        'Segurança': ['segurança', 'vigilância', 'monitoramento'],
        'Alimentação': ['alimentação', 'merenda', 'refeição', 'fornecimento de alimentos'],
        'Transporte': ['transporte', 'logística', 'frete', 'veículo'],
        'Consultoria': ['consultoria', 'assessoria', 'gestão'],
    }

    for (const [segmento, palavras] of Object.entries(mapeamento)) {
        if (palavras.some((p) => desc.includes(p))) {
            segmentos.push(segmento)
        }
    }

    return segmentos.length > 0 ? segmentos : ['Outros']
}

/**
 * Parser de valor robusto — checa unidade na string capturada, não no texto completo.
 * Evita o bug de "acima" (contém "m") ativar multiplicador de milhão.
 */
function parseValor(s: string): number {
    const sLower = s.toLowerCase().replace(/\./g, '').replace(',', '.')
    const n = parseFloat(sLower.replace(/[^\d.]/g, ''))
    if (isNaN(n)) return 0

    // Verifica unidade explícita na string capturada
    if (/milh[aã]o|milh[oõ]es/.test(sLower) || /^\d+(\.\d+)?\s*m$/.test(sLower.trim())) {
        return n * 1_000_000
    }
    if (/\bmil\b/.test(sLower) || /^\d+(\.\d+)?\s*k$/.test(sLower.trim())) {
        return n * 1_000
    }
    return n
}

// ─── Handler principal ────────────────────────────────────────────────────

export async function handleOnboarding(
    numero: string,
    texto: string
): Promise<string> {
    const conversa = await buscarOuCriarConversa(numero)
    const etapa = conversa.etapa
    const contexto: ContextoConversa = conversa.contexto_json ?? {}

    // ── Etapa: inicio → pedir nome ─────────────────────────────────────────
    if (etapa === 'inicio') {
        await atualizarConversa(numero, 'nome', contexto)
        return respostaBemVindo()
    }

    // ── Etapa: concluido → boas-vindas de volta ────────────────────────────
    if (etapa === 'concluido') {
        return respostaBemVindoDeVolta(contexto.nome)
    }

    // ── Etapa: nome → pedir descrição da empresa ───────────────────────────
    if (etapa === 'nome') {
        if (texto.trim().length < 2) {
            return 'Por favor, informe o seu nome para continuarmos.'
        }
        // Usa apenas o primeiro nome
        const nome = texto.trim().split(/\s+/)[0]
        const novoContexto: ContextoConversa = { ...contexto, nome }
        await atualizarConversa(numero, 'descricao_empresa', novoContexto)
        return respostaPedirDescricao(nome)
    }

    // ── Etapa: descricao_empresa → pedir estados ───────────────────────────
    if (etapa === 'descricao_empresa') {
        if (texto.trim().length < 10) {
            return [
                '📝 Preciso de uma descrição mais detalhada.',
                '',
                '_Por favor, descreva em uma frase o produto ou serviço principal da sua empresa._',
                '',
                '_Ex: "Prestamos serviços de desenvolvimento de software para órgãos públicos"_',
            ].join('\n')
        }

        const dados = await extrairDadosPerfil('descricao_empresa', texto)
        const descricao = dados.descricao && dados.descricao.length >= 10
            ? dados.descricao
            : texto.trim()

        const novoContexto: ContextoConversa = {
            ...contexto,
            descricao,
            razao_social: dados.razao_social ?? null,
        }

        await atualizarConversa(numero, 'estados', novoContexto)
        return respostaPedirEstados(contexto.nome)
    }

    // ── Etapa: estados → pedir faixa de valor ─────────────────────────────
    if (etapa === 'estados') {
        const textoNorm = texto.toLowerCase()
        const TODAS_UFS = ['AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT','PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO']

        let ufsManual: string[] = []
        if (textoNorm.includes('todo brasil') || textoNorm.includes('todos') || textoNorm.includes('nacional')) {
            ufsManual = TODAS_UFS
        } else {
            ufsManual = TODAS_UFS.filter(uf => new RegExp(`\\b${uf}\\b`, 'i').test(texto))
        }

        const dados = await extrairDadosPerfil('estados', texto)
        const ufs = (dados.uf_interesse && dados.uf_interesse.length > 0)
            ? dados.uf_interesse
            : ufsManual

        if (!ufs || ufs.length === 0) {
            return [
                '🗺️ Não foi possível identificar os estados.',
                '',
                '_Por favor, informe as siglas separadas por vírgula._',
                '_Ex: SP, RJ, MG — ou "todo Brasil"_',
            ].join('\n')
        }

        const novoContexto: ContextoConversa = { ...contexto, uf_interesse: ufs }
        await atualizarConversa(numero, 'faixa_valor', novoContexto)
        return respostaPedirFaixaValor(ufs, contexto.nome)
    }

    // ── Etapa: faixa_valor → concluir onboarding ──────────────────────────
    if (etapa === 'faixa_valor') {
        const dados = await extrairDadosPerfil('faixa_valor', texto)

        let valorMinFallback: number | null = null
        let valorMaxFallback: number | null = null

        if (dados.valor_min === undefined && dados.valor_max === undefined) {
            const t = texto.toLowerCase().replace(/\./g, '').replace(',', '.')

            const acima = t.match(/acima\s+de\s+([\d.,]+\s*(?:milh[aã]o|milh[oõ]es|mil|[km])?)/i)
            const ate   = t.match(/até\s+([\d.,]+\s*(?:milh[aã]o|milh[oõ]es|mil|[km])?)/i)
            const entre = t.match(/entre\s+([\d.,]+\s*[km]?)\s+e\s+([\d.,]+\s*[km]?)/i)
            const simples = t.match(/^([\d]+)\s*([mk])$/i)

            if (entre) {
                valorMinFallback = parseValor(entre[1])
                valorMaxFallback = parseValor(entre[2])
            } else if (acima) {
                valorMinFallback = parseValor(acima[1])
            } else if (ate) {
                valorMaxFallback = parseValor(ate[1])
            } else if (simples) {
                const num = parseInt(simples[1])
                const unidade = simples[2].toLowerCase()
                valorMinFallback = unidade === 'm' ? num * 1_000_000 : num * 1_000
            }
        }

        const novoContexto: ContextoConversa = {
            ...contexto,
            valor_min: dados.valor_min ?? valorMinFallback,
            valor_max: dados.valor_max ?? valorMaxFallback,
        }

        if (!novoContexto.descricao) {
            await atualizarConversa(numero, 'inicio', {})
            return respostaBemVindo()
        }

        await salvarPerfilCompleto(numero, novoContexto as Required<Pick<ContextoConversa, 'descricao'>> & ContextoConversa)

        return respostaConcluido(
            novoContexto.nome,
            novoContexto.descricao!,
            novoContexto.uf_interesse ?? [],
            novoContexto.valor_min ?? null,
            novoContexto.valor_max ?? null
        )
    }

    return respostaBemVindo()
}

/** Reinicia o onboarding (usado em "mudar perfil") */
export async function reiniciarOnboarding(numero: string): Promise<string> {
    const supabase = createAdminClient()

    await supabase
        .from('conversas')
        .update({ etapa: 'nome', contexto_json: {}, updated_at: new Date().toISOString() })
        .eq('numero_whatsapp', numero)

    return respostaBemVindo()
}
