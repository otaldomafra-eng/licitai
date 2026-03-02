/**
 * client.ts — Abstração sobre a Z-API (WhatsApp)
 *
 * Documentação: https://developer.z-api.io
 * Todas as chamadas à API passam por aqui.
 */

import type { MatchEdital, EditalDB } from '@/types'

const ZAPI_INSTANCE = process.env.ZAPI_INSTANCE_ID!
const ZAPI_TOKEN = process.env.ZAPI_TOKEN!
const ZAPI_BASE = `https://api.z-api.io/instances/${ZAPI_INSTANCE}/token/${ZAPI_TOKEN}`

// ─── Helpers internos ──────────────────────────────────────────────────

/** Normaliza número para formato Z-API (apenas dígitos com DDI 55) */
function normalizarNumero(numero: string): string {
    const limpo = numero.replace(/\D/g, '')
    return limpo.startsWith('55') ? limpo : `55${limpo}`
}

/** Formata valor monetário para mensagem WhatsApp */
function formatarValor(valor: number | null): string {
    if (!valor) return 'Não informado'
    return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

/** Formata data ISO para dd/mm/aaaa */
function formatarData(dataISO: string | null): string {
    if (!dataISO) return 'Não informado'
    try {
        return new Date(dataISO).toLocaleDateString('pt-BR')
    } catch {
        return dataISO
    }
}

async function chamarZAPI(endpoint: string, body: unknown): Promise<unknown> {
    const url = `${ZAPI_BASE}/${endpoint}`

    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
    }
    if (process.env.ZAPI_CLIENT_TOKEN) {
        headers['Client-Token'] = process.env.ZAPI_CLIENT_TOKEN
    }

    const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
    })

    if (!res.ok) {
        const texto = await res.text().catch(() => res.statusText)
        throw new Error(`[Z-API] ${res.status} /${endpoint}: ${texto}`)
    }

    return res.json()
}

// ─── Funções públicas ─────────────────────────────────────────────────

/**
 * Envia mensagem de texto simples via WhatsApp.
 * @param numero - número sem formatação (ex: "11999999999")
 * @param texto  - texto da mensagem (aceita formatação WhatsApp: *bold*, _italic_)
 */
export async function enviarMensagem(numero: string, texto: string): Promise<void> {
    const phone = normalizarNumero(numero)

    await chamarZAPI('send-text', {
        phone,
        message: texto,
    })
}

/**
 * Envia mensagem com lista de opções numeradas.
 */
export async function enviarMensagemComBotoes(
    numero: string,
    texto: string,
    botoes: string[]
): Promise<void> {
    const opcoes = botoes.map((b, i) => `${i + 1}. ${b}`).join('\n')
    await enviarMensagem(numero, `${texto}\n\n${opcoes}`)
}

/**
 * Envia alerta proativo de match de edital para o usuário.
 */
export async function enviarAlerta(
    numero: string,
    match: Pick<MatchEdital, 'score' | 'justificativa' | 'pontos_fortes' | 'riscos'>,
    edital: Pick<EditalDB, 'nome_orgao' | 'objeto' | 'valor_estimado' | 'data_encerramento' | 'link_sistema_origem'>
): Promise<void> {
    const pontosFortes = match.pontos_fortes
        .slice(0, 3)
        .map((p) => `✅ ${p}`)
        .join('\n')

    const riscos = match.riscos
        .slice(0, 2)
        .map((r) => `⚠️ ${r}`)
        .join('\n')

    const mensagem = [
        `🔔 *Novo edital compatível!*`,
        ``,
        `🏛️ *Órgão:* ${edital.nome_orgao}`,
        `📋 *Objeto:* ${edital.objeto.substring(0, 200)}${edital.objeto.length > 200 ? '...' : ''}`,
        `💰 *Valor:* ${formatarValor(edital.valor_estimado)}`,
        `📅 *Encerra:* ${formatarData(edital.data_encerramento)}`,
        `📊 *Compatibilidade:* ${match.score}%`,
        ``,
        pontosFortes || '',
        riscos || '',
        ``,
        `_Responda:_`,
        `1️⃣ Mais detalhes`,
        `2️⃣ Ignorar edital`,
        `3️⃣ Link do PNCP`,
    ]
        .filter((l) => l !== '')
        .join('\n')

    await enviarMensagem(numero, mensagem)
}

/**
 * Marca mensagem como lida na Z-API.
 */
export async function marcarComoLido(_numero: string, _messageId: string): Promise<void> {
    // Z-API marca automaticamente como lido ao processar
    // Mantemos a função por compatibilidade com o webhook
}

/**
 * Delay entre envios em lote para respeitar rate limit Z-API.
 */
export async function aguardar(ms = 100): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
}
