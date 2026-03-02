/**
 * onboarding.ts — Handler do fluxo de onboarding via WhatsApp
 *
 * Gerencia a coleta de perfil da empresa em etapas sequenciais:
 * inicio → descricao_empresa → estados → faixa_valor → concluido
 *
 * Persiste o estado em `conversas` (Supabase) a cada mensagem.
 * Ao concluir, salva o perfil em `usuarios` e `perfil_empresa`.
 */

import { createAdminClient } from '@/lib/supabase/server'
import {
    extrairDadosPerfil,
    respostaBemVindo,
    respostaPedirEstados,
    respostaPedirFaixaValor,
    respostaConcluido,
} from '@/lib/ai/assistant'
import type { ConversaDB, ContextoConversa, EtapaOnboarding } from '@/types'

// ─── Helpers ──────────────────────────────────────────────────────────────

/** Busca ou cria o registro de conversa para um número */
async function buscarOuCriarConversa(numero: string): Promise<ConversaDB> {
    const supabase = createAdminClient()

    const { data: existente, error } = await supabase
        .from('conversas')
        .select('*')
        .eq('numero_whatsapp', numero)
        .maybeSingle()

    if (error) throw new Error(`[Onboarding] Erro ao buscar conversa: ${error.message}`)

    if (existente) return existente as ConversaDB

    // Cria novo registro de conversa
    const { data: nova, error: errCriacao } = await supabase
        .from('conversas')
        .insert({ numero_whatsapp: numero, etapa: 'inicio', contexto_json: {} })
        .select()
        .single()

    if (errCriacao) throw new Error(`[Onboarding] Erro ao criar conversa: ${errCriacao.message}`)
    return nova as ConversaDB
}

/** Atualiza o estado da conversa no banco */
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

/**
 * Ao concluir o onboarding, salva o perfil completo no Supabase.
 * Usa o número WhatsApp como chave para criar/atualizar o usuário.
 */
async function salvarPerfilCompleto(
    numero: string,
    contexto: Required<Pick<ContextoConversa, 'descricao'>> & ContextoConversa
): Promise<void> {
    const supabase = createAdminClient()

    // 1. Upsert na tabela usuarios (chave: whatsapp)
    const { data: usuario, error: errUsuario } = await supabase
        .from('usuarios')
        .upsert(
            { whatsapp: numero, updated_at: new Date().toISOString() },
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

    // 3. Marca conversa como concluída
    await atualizarConversa(numero, 'concluido', contexto)

    console.log(`[Onboarding] Perfil salvo para ${numero} (usuario_id: ${usuarioId})`)
}

/** Extrai palavras-chave simples da descrição */
function extrairPalavrasChave(descricao: string): string[] {
    const stopwords = new Set(['de', 'do', 'da', 'para', 'com', 'em', 'e', 'o', 'a', 'os', 'as', 'um', 'uma'])
    return descricao
        .toLowerCase()
        .split(/\s+/)
        .filter((p) => p.length > 3 && !stopwords.has(p))
        .slice(0, 10)
}

/** Infere segmentos a partir da descrição */
function inferirSegmentos(descricao: string, _ufs: string[]): string[] {
    const desc = descricao.toLowerCase()
    const segmentos: string[] = []

    const mapeamento: Record<string, string[]> = {
        'Tecnologia da Informação': ['software', 'sistema', 'ti ', 'tecnologia', 'desenvolvimento', 'aplicativo', 'app', 'digital'],
        'Construção Civil': ['construção', 'obra', 'engenharia', 'reforma', 'pavimentação'],
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

// ─── Handler principal ────────────────────────────────────────────────────

/**
 * Processa mensagem no contexto do onboarding.
 * @returns Texto de resposta a ser enviado ao usuário
 */
export async function handleOnboarding(
    numero: string,
    texto: string
): Promise<string> {
    const conversa = await buscarOuCriarConversa(numero)
    const etapa = conversa.etapa
    const contexto: ContextoConversa = conversa.contexto_json ?? {}

    // ── Etapa: inicio (saudação → pedir descrição da empresa) ──────────────
    if (etapa === 'inicio' || etapa === 'concluido') {
        // Se já tem perfil concluído mas mandou "oi", oferece menu
        if (etapa === 'concluido') {
            return [
                '👋 Bem-vindo de volta!',
                '',
                'Seu perfil já está configurado e estou monitorando licitações para você.',
                '',
                '_Responda *menu* para ver opções ou faça uma pergunta sobre licitações._',
            ].join('\n')
        }

        await atualizarConversa(numero, 'descricao_empresa', contexto)
        return respostaBemVindo()
    }

    // ── Etapa: descricao_empresa → pedir estados ───────────────────────────
    if (etapa === 'descricao_empresa') {
        const dados = await extrairDadosPerfil('descricao_empresa', texto)

        if (!dados.descricao || dados.descricao.length < 10) {
            return [
                '📝 Preciso entender melhor o que sua empresa faz.',
                '',
                '_Por favor, descreva em uma frase o produto ou serviço principal da sua empresa._',
                '',
                '_Ex: "Prestamos serviços de desenvolvimento de software para órgãos públicos"_',
            ].join('\n')
        }

        const novoContexto: ContextoConversa = {
            ...contexto,
            descricao: dados.descricao,
            razao_social: dados.razao_social ?? null,
        }

        await atualizarConversa(numero, 'estados', novoContexto)
        return respostaPedirEstados()
    }

    // ── Etapa: estados → pedir faixa de valor ─────────────────────────────
    if (etapa === 'estados') {
        const dados = await extrairDadosPerfil('estados', texto)

        if (!dados.uf_interesse || dados.uf_interesse.length === 0) {
            return [
                '🗺️ Não consegui identificar os estados.',
                '',
                '_Por favor, informe as siglas dos estados separadas por vírgula._',
                '_Ex: SP, RJ, MG — ou "todo Brasil"_',
            ].join('\n')
        }

        const novoContexto: ContextoConversa = {
            ...contexto,
            uf_interesse: dados.uf_interesse,
        }

        await atualizarConversa(numero, 'faixa_valor', novoContexto)
        return respostaPedirFaixaValor(dados.uf_interesse)
    }

    // ── Etapa: faixa_valor → concluir onboarding ──────────────────────────
    if (etapa === 'faixa_valor') {
        const dados = await extrairDadosPerfil('faixa_valor', texto)

        const novoContexto: ContextoConversa = {
            ...contexto,
            valor_min: dados.valor_min ?? null,
            valor_max: dados.valor_max ?? null,
        }

        // Valida que temos a descrição (obrigatória)
        if (!novoContexto.descricao) {
            await atualizarConversa(numero, 'inicio', {})
            return respostaBemVindo()
        }

        // Salva perfil completo no Supabase
        await salvarPerfilCompleto(numero, novoContexto as Required<Pick<ContextoConversa, 'descricao'>> & ContextoConversa)

        return respostaConcluido(
            novoContexto.descricao!,
            novoContexto.uf_interesse ?? [],
            novoContexto.valor_min ?? null,
            novoContexto.valor_max ?? null
        )
    }

    // Fallback
    return respostaBemVindo()
}

/** Reinicia o onboarding para um número (usado em "mudar perfil") */
export async function reiniciarOnboarding(numero: string): Promise<string> {
    const supabase = createAdminClient()

    await supabase
        .from('conversas')
        .update({ etapa: 'inicio', contexto_json: {}, updated_at: new Date().toISOString() })
        .eq('numero_whatsapp', numero)

    await atualizarConversa(numero, 'descricao_empresa', {})
    return respostaBemVindo()
}
