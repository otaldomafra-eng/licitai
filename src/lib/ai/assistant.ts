/**
 * assistant.ts — Claude como assistente conversacional do LicitaIA
 *
 * DIFERENTE do matcher.ts (que analisa compatibilidade edital↔empresa),
 * este módulo gerencia a conversa com o usuário via WhatsApp:
 * - Identifica intenção da mensagem
 * - Extrai dados estruturados em cada etapa do onboarding
 * - Formata respostas adequadas para WhatsApp
 */

import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import type { EtapaOnboarding, ContextoConversa, IntencaoMensagem } from '@/types'

const client = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
})

// ─── Schemas Zod ────────────────────────────────────────────────────────

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

// ─── Identificação de intenção ───────────────────────────────────────────

/**
 * Usa Claude para identificar a intenção da mensagem recebida.
 * Retorna 'onboarding' se o usuário ainda está se cadastrando.
 */
export async function identificarIntencao(
    texto: string,
    etapaAtual: EtapaOnboarding | null
): Promise<IntencaoMensagem> {
    // Se usuário ainda está em onboarding incompleto, sempre roteia para onboarding
    if (etapaAtual && etapaAtual !== 'concluido') {
        return 'onboarding'
    }

    // Heurísticas rápidas antes de chamar a IA (sem custo de API)
    const textoNorm = texto.toLowerCase().trim()

    const COMANDOS = ['planos', 'assinar', 'pausar', 'parar', 'cancelar', 'mudar perfil', 'ajuda', 'help', 'menu']
    if (COMANDOS.some((c) => textoNorm.includes(c))) return 'comando'

    const SAUDACOES = ['oi', 'olá', 'ola', 'bom dia', 'boa tarde', 'boa noite', 'hey', 'hello', 'hi']
    if (SAUDACOES.some((s) => textoNorm === s || textoNorm.startsWith(s + ' '))) return 'onboarding'

    // Para dúvidas sobre licitações específicas
    const CONSULTA_KEYWORDS = ['busca', 'procura', 'encontra', 'licitação', 'licitacoes', 'edital', 'pregão', 'dispensa']
    if (CONSULTA_KEYWORDS.some((c) => textoNorm.includes(c))) return 'consulta'

    // Fallback via IA para mensagens ambíguas
    try {
        const prompt = `Você é um classificador de mensagens para o LicitaIA, assistente de licitações públicas via WhatsApp.

Classifique a mensagem do usuário em uma das categorias:
- "onboarding": usuário quer se cadastrar, fazer setup inicial, ou não tem perfil ainda
- "consulta": usuário quer buscar ou consultar licitações/editais específicos
- "comando": usuário quer executar um comando (ver planos, pausar alertas, alterar perfil)
- "duvida": dúvida geral sobre licitações ou o produto

Mensagem: "${texto}"

Responda APENAS com JSON: {"intencao": "<categoria>", "confianca": <0.0 a 1.0>}`

        const response = await client.messages.create({
            model: 'claude-sonnet-4-6',
            max_tokens: 100,
            messages: [{ role: 'user', content: prompt }],
        })

        const conteudo = response.content[0]
        if (conteudo.type !== 'text') return 'duvida'

        const texto_limpo = conteudo.text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
        const parsed = SchemaIntencao.safeParse(JSON.parse(texto_limpo))
        if (parsed.success) return parsed.data.intencao
    } catch (err) {
        console.warn('[Assistant] Falha ao identificar intenção:', err instanceof Error ? err.message : err)
    }

    return 'duvida'
}

// ─── Extração de dados do onboarding ─────────────────────────────────────

/**
 * Extrai dados estruturados da mensagem do usuário para a etapa atual do onboarding.
 * Ex: etapa 'estados' + texto 'SP e MG' → { uf_interesse: ['SP', 'MG'] }
 */
export async function extrairDadosPerfil(
    etapa: EtapaOnboarding,
    texto: string
): Promise<Partial<ContextoConversa>> {
    const prompts: Record<EtapaOnboarding, string | null> = {
        inicio: null,
        concluido: null,
        descricao_empresa: `Extraia a descrição do negócio da mensagem. Retorne JSON:
{"dados": {"descricao": "<descrição clara do que a empresa faz>", "razao_social": "<nome da empresa se mencionado, ou null>"}}

Mensagem: "${texto}"`,

        estados: `Extraia os estados brasileiros (UFs) mencionados. Aceite variações: "todo Brasil", "todos os estados", nomes completos, siglas.
Se for todo Brasil, retorne todas as 27 UFs. Retorne JSON:
{"dados": {"uf_interesse": ["UF1", "UF2", ...]}}

UFs válidas: AC,AL,AM,AP,BA,CE,DF,ES,GO,MA,MG,MS,MT,PA,PB,PE,PI,PR,RJ,RN,RO,RR,RS,SC,SE,SP,TO

Mensagem: "${texto}"`,

        faixa_valor: `Extraia a faixa de valor monetário para licitações de interesse.
Exemplos:
- "acima de 100 mil" → valor_min: 100000, valor_max: null
- "entre 50k e 2M" → valor_min: 50000, valor_max: 2000000
- "até 500 mil" → valor_min: null, valor_max: 500000
- "qualquer valor" → valor_min: null, valor_max: null

Retorne JSON:
{"dados": {"valor_min": <número ou null>, "valor_max": <número ou null>}}

Mensagem: "${texto}"`,
    }

    const promptTexto = prompts[etapa]
    if (!promptTexto) return {}

    try {
        const response = await client.messages.create({
            model: 'claude-sonnet-4-6',
            max_tokens: 300,
            messages: [{ role: 'user', content: promptTexto }],
        })

        const conteudo = response.content[0]
        if (conteudo.type !== 'text') return {}

        const textoLimpo = conteudo.text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
        const parsed = SchemaDadosPerfil.safeParse(JSON.parse(textoLimpo))
        if (parsed.success) return parsed.data.dados
    } catch (err) {
        console.warn('[Assistant] Erro ao extrair dados:', err instanceof Error ? err.message : err)
    }

    return {}
}

// ─── Respostas formatadas para WhatsApp ───────────────────────────────────

/** Resposta de boas-vindas / início do onboarding */
export function respostaBemVindo(): string {
    return [
        '👋 Olá! Sou o *LicitaIA* 🤖',
        '',
        'Vou te ajudar a encontrar licitações públicas compatíveis com o seu negócio e te avisar quando surgirem novas oportunidades.',
        '',
        '📋 Para começar, me conta: *o que sua empresa faz?*',
        '',
        '_Ex: "Desenvolvemos software para prefeituras" ou "Prestamos serviços de limpeza"_',
    ].join('\n')
}

/** Resposta após receber a descrição da empresa */
export function respostaPedirEstados(): string {
    return [
        '✅ Entendido!',
        '',
        '🗺️ Em quais *estados* você quer monitorar licitações?',
        '',
        '_Ex: SP, RJ — ou responda "todo Brasil" para monitorar todo o país_',
    ].join('\n')
}

/** Resposta após receber os estados */
export function respostaPedirFaixaValor(ufs: string[]): string {
    const listaUFs = ufs.length > 5
        ? `${ufs.slice(0, 5).join(', ')} e mais ${ufs.length - 5} estado(s)`
        : ufs.join(', ')

    return [
        `📍 Monitorando: *${listaUFs}*`,
        '',
        '💰 Qual *faixa de valor* te interessa?',
        '',
        '_Ex: "acima de R$ 100 mil", "entre 50k e 2M", ou "qualquer valor"_',
    ].join('\n')
}

/** Resposta de conclusão do onboarding */
export function respostaConcluido(descricao: string, ufs: string[], valorMin: number | null, valorMax: number | null): string {
    const faixaValor = (() => {
        if (valorMin && valorMax) return `R$ ${valorMin.toLocaleString('pt-BR')} a R$ ${valorMax.toLocaleString('pt-BR')}`
        if (valorMin) return `Acima de R$ ${valorMin.toLocaleString('pt-BR')}`
        if (valorMax) return `Até R$ ${valorMax.toLocaleString('pt-BR')}`
        return 'Qualquer valor'
    })()

    const listaUFs = ufs.length > 5
        ? `${ufs.slice(0, 5).join(', ')} e mais ${ufs.length - 5}`
        : ufs.join(', ')

    return [
        '🎉 *Perfil salvo com sucesso!*',
        '',
        '📋 Resumo do seu monitoramento:',
        `• Empresa: ${descricao.substring(0, 80)}...`,
        `• Estados: ${listaUFs}`,
        `• Valores: ${faixaValor}`,
        '',
        '⏰ Analisarei novos editais todo dia às *07h* e te aviso sobre as melhores oportunidades.',
        '',
        '🆓 *Plano Grátis:* 3 alertas/mês',
        '',
        '_Para upgrade, responda *planos* a qualquer momento._',
    ].join('\n')
}

/** Resposta genérica para dúvidas não identificadas */
export async function respostaDuvida(texto: string): Promise<string> {
    try {
        const prompt = `Você é o assistente do LicitaIA, um serviço de monitoramento de licitações públicas brasileiras via WhatsApp.

Responda a dúvida do usuário de forma concisa e útil, formatando para WhatsApp (*negrito*, _itálico_).
Use no máximo 5 linhas. Seja direto. Se não souber, sugira responder "menu" ou "ajuda".

Dúvida: "${texto}"`

        const response = await client.messages.create({
            model: 'claude-sonnet-4-6',
            max_tokens: 300,
            messages: [{ role: 'user', content: prompt }],
        })

        const conteudo = response.content[0]
        if (conteudo.type === 'text') return conteudo.text
    } catch (err) {
        console.warn('[Assistant] Erro ao responder dúvida:', err instanceof Error ? err.message : err)
    }

    return [
        '🤔 Não entendi bem sua mensagem.',
        '',
        'Você pode:',
        '• Responder *menu* para ver opções',
        '• Responder *ajuda* para suporte',
        '• Fazer uma pergunta sobre licitações',
    ].join('\n')
}

/** Resposta para comandos não reconhecidos / menu */
export function respostaMenu(): string {
    return [
        '📱 *LicitaIA — Menu*',
        '',
        '• *planos* — Ver planos e preços',
        '• *mudar perfil* — Atualizar meu perfil',
        '• *pausar* — Pausar alertas temporariamente',
        '• *ajuda* — Falar com suporte',
        '',
        '_Ou simplesmente faça uma pergunta sobre licitações!_',
    ].join('\n')
}
