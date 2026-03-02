/**
 * POST /api/whatsapp/webhook
 *
 * Endpoint receptor de mensagens da Z-API.
 * Docs: https://developer.z-api.io/webhooks/on-message-received
 */

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { enviarMensagem, marcarComoLido } from '@/lib/whatsapp/client'
import { identificarIntencao, respostaDuvida, respostaMenu } from '@/lib/ai/assistant'
import { handleOnboarding, reiniciarOnboarding } from '@/lib/whatsapp/handlers/onboarding'
import { createAdminClient } from '@/lib/supabase/server'
import type { EtapaOnboarding } from '@/types'

// ─── Schema Zod — Z-API webhook payload ───────────────────────────────────

const SchemaZAPIWebhook = z.object({
    instanceId: z.string().optional(),
    messageId: z.string(),
    phone: z.string(),           // número do remetente (ex: "5511999999999")
    fromMe: z.boolean(),
    momment: z.number().optional(),
    status: z.string().optional(),
    chatName: z.string().optional(),
    senderPhoto: z.string().optional(),
    senderName: z.string().optional(),
    participantPhone: z.string().nullable().optional(),
    photo: z.string().optional(),
    broadcast: z.boolean().optional(),
    type: z.string(),            // "ReceivedCallback"
    text: z.object({
        message: z.string(),
    }).optional(),
    image: z.object({
        caption: z.string().optional(),
    }).optional(),
    audio: z.object({}).optional(),
    document: z.object({}).optional(),
    isGroup: z.boolean().optional(),
})

// ─── Helpers ──────────────────────────────────────────────────────────────

function extrairTexto(payload: z.infer<typeof SchemaZAPIWebhook>): string | null {
    if (payload.text?.message) return payload.text.message.trim()
    if (payload.image?.caption) return payload.image.caption.trim()
    return null
}

/** Verifica se o número tem cadastro ativo no sistema */
async function usuarioCadastrado(numero: string): Promise<boolean> {
    const supabase = createAdminClient()
    const { data } = await supabase
        .from('usuarios')
        .select('id')
        .eq('numero_whatsapp', numero)
        .maybeSingle()
    return !!data
}

/** Busca a etapa atual de conversa para routing */
async function buscarEtapaConversa(numero: string): Promise<EtapaOnboarding | null> {
    const supabase = createAdminClient()
    const { data } = await supabase
        .from('conversas')
        .select('etapa')
        .eq('numero_whatsapp', numero)
        .maybeSingle()
    return (data?.etapa as EtapaOnboarding) ?? null
}

// ─── Handlers de comandos ─────────────────────────────────────────────────

async function handleComando(numero: string, texto: string): Promise<string> {
    const cmd = texto.toLowerCase().trim()

    if (cmd === 'menu' || cmd === 'ajuda' || cmd === 'help') {
        return respostaMenu()
    }

    if (cmd === 'mudar perfil' || cmd === 'alterar perfil' || cmd === 'novo perfil') {
        return reiniciarOnboarding(numero)
    }

    if (cmd === 'pausar' || cmd === 'parar alertas') {
        return ['⏸️ Alertas pausados por 7 dias.', '', '_Responda *ativar* a qualquer momento para retomar._'].join('\n')
    }

    if (cmd === 'planos' || cmd === 'assinar' || cmd === 'upgrade') {
        const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://licitaia.com.br'
        return [
            '💳 *Planos LicitaIA*',
            '',
            '🆓 *Grátis:* R$ 0/mês — 3 alertas, 10 consultas',
            '⭐ *Básico:* R$ 97/mês — 30 alertas, consultas ilimitadas',
            '🚀 *Pro:* R$ 297/mês — tudo ilimitado + multi-perfil',
            '',
            `👉 ${appUrl}/checkout`,
        ].join('\n')
    }

    return respostaDuvida(texto)
}

// ─── Route Handler ─────────────────────────────────────────────────────────

export async function POST(req: Request): Promise<NextResponse> {
    let body: unknown

    try {
        body = await req.json()
    } catch {
        return NextResponse.json({ erro: 'Payload inválido' }, { status: 400 })
    }

    console.log('[Webhook] Payload recebido:', JSON.stringify(body))

    const parsed = SchemaZAPIWebhook.safeParse(body)
    if (!parsed.success) {
        console.log('[Webhook] Zod falhou:', JSON.stringify(parsed.error.issues))
        // Pode ser outro tipo de evento Z-API (status, etc.) — ignorar
        return NextResponse.json({ ok: true })
    }

    const msg = parsed.data

    // Ignora mensagens enviadas pelo próprio bot
    if (msg.fromMe) return NextResponse.json({ ok: true })

    // Ignora grupos
    if (msg.isGroup) return NextResponse.json({ ok: true })

    // Só processa tipo ReceivedCallback
    if (msg.type !== 'ReceivedCallback') return NextResponse.json({ ok: true })

    const texto = extrairTexto(msg)
    if (!texto) return NextResponse.json({ ok: true })

    const numero = msg.phone
    const messageId = msg.messageId

    console.log(`[Webhook] Mensagem de ${numero}: "${texto.substring(0, 80)}"`)

    // Processa de forma assíncrona sem bloquear
    processarMensagem(numero, messageId, texto).catch((err) => {
        console.error(`[Webhook] Erro ao processar ${numero}:`, err)
    })

    // Z-API exige 200 imediato
    return NextResponse.json({ ok: true })
}

async function processarMensagem(numero: string, messageId: string, texto: string): Promise<void> {
    // Só responde para usuários cadastrados — contatos pessoais são ignorados
    const cadastrado = await usuarioCadastrado(numero)
    if (!cadastrado) {
        console.log(`[Webhook] Número ${numero} não cadastrado — ignorado`)
        return
    }

    marcarComoLido(numero, messageId).catch(() => { })

    const etapaAtual = await buscarEtapaConversa(numero)
    const intencao = await identificarIntencao(texto, etapaAtual)

    console.log(`[Webhook] ${numero} — etapa: ${etapaAtual ?? 'nova'}, intenção: ${intencao}`)

    let resposta: string

    switch (intencao) {
        case 'onboarding':
            resposta = await handleOnboarding(numero, texto)
            break
        case 'comando':
            resposta = await handleComando(numero, texto)
            break
        case 'consulta':
            resposta = [
                '🔍 Função de consulta manual chegando em breve!',
                '',
                '_Por enquanto, seus alertas automáticos são enviados todo dia às 7h._',
            ].join('\n')
            break
        case 'duvida':
        default:
            resposta = await respostaDuvida(texto)
            break
    }

    await enviarMensagem(numero, resposta)
}

// ─── GET — Health check ────────────────────────────────────────────────────

export async function GET(): Promise<NextResponse> {
    return NextResponse.json({ ok: true, service: 'LicitaIA Webhook (Z-API)' })
}
