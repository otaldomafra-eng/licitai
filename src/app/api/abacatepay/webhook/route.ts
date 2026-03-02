/**
 * POST /api/abacatepay/webhook
 *
 * Recebe notificação de pagamento PIX do AbacatePay.
 * Ao confirmar pagamento, atualiza o plano do usuário no Supabase
 * e envia mensagem de confirmação via WhatsApp.
 */

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/server'
import { enviarMensagem } from '@/lib/whatsapp/client'
import crypto from 'crypto'

// ─── Schema do webhook AbacatePay ─────────────────────────────────────────

const SchemaAbacatePayWebhook = z.object({
    event: z.string(),
    billing: z.object({
        id: z.string(),
        status: z.string(),
        amount: z.number(),
        customer: z.object({
            cellphone: z.string().optional(),
            email: z.string().optional(),
        }).optional(),
        metadata: z.record(z.string(), z.string()).optional(),
    }),
})

type AbacatePayWebhook = z.infer<typeof SchemaAbacatePayWebhook>

// ─── Helpers ──────────────────────────────────────────────────────────────

/** Verifica assinatura HMAC do webhook */
function verificarAssinatura(body: string, signature: string | null): boolean {
    const secret = process.env.ABACATEPAY_WEBHOOK_SECRET
    if (!secret || !signature) return false

    const hmac = crypto.createHmac('sha256', secret).update(body).digest('hex')
    return crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(signature))
}

/** Mapeia plano para configuração de assinatura */
function configuracaoPlano(plano: string): { alertas_mes: number; consultas_mes: number } {
    switch (plano) {
        case 'pro': return { alertas_mes: -1, consultas_mes: -1 } // -1 = ilimitado
        case 'basico': return { alertas_mes: 30, consultas_mes: -1 }
        default: return { alertas_mes: 3, consultas_mes: 10 }
    }
}

/** Mensagem de confirmação de plano para WhatsApp */
function mensagemConfirmacao(plano: string): string {
    const nomes: Record<string, string> = {
        basico: '⭐ Básico',
        pro: '🚀 Pro',
    }

    const nomePlano = nomes[plano] ?? plano

    return [
        `✅ *Pagamento confirmado!*`,
        ``,
        `Seu plano *${nomePlano}* está ativo.`,
        ``,
        `🔔 Seus alertas foram atualizados. A próxima varredura de editais acontece amanhã às *7h*.`,
        ``,
        `_Obrigado por assinar o LicitaIA! 🎉_`,
    ].join('\n')
}

// ─── Route Handler ────────────────────────────────────────────────────────

export async function POST(req: Request): Promise<NextResponse> {
    const rawBody = await req.text()

    // Verifica assinatura do webhook
    const signature = req.headers.get('x-abacatepay-signature')
    if (!verificarAssinatura(rawBody, signature)) {
        console.warn('[AbacatePay] Assinatura inválida')
        return NextResponse.json({ erro: 'Assinatura inválida' }, { status: 401 })
    }

    let body: unknown
    try {
        body = JSON.parse(rawBody)
    } catch {
        return NextResponse.json({ erro: 'JSON inválido' }, { status: 400 })
    }

    const parsed = SchemaAbacatePayWebhook.safeParse(body)
    if (!parsed.success) {
        console.warn('[AbacatePay] Payload inválido:', parsed.error.flatten())
        return NextResponse.json({ ok: true }) // ignorar eventos desconhecidos
    }

    const { event, billing } = parsed.data

    // Só processa eventos de pagamento confirmado
    if (event !== 'billing.paid' && billing.status !== 'ACTIVE') {
        return NextResponse.json({ ok: true })
    }

    const supabase = createAdminClient()

    // Recupera metadados: plano e número WhatsApp (passados no momento de criação do billing)
    const plano = billing.metadata?.plano ?? 'basico'
    const numero: string | undefined =
        (billing.metadata?.numero) ??
        billing.customer?.cellphone?.replace(/\D/g, '')

    if (!numero) {
        console.error('[AbacatePay] Pagamento sem número WhatsApp:', billing.id)
        return NextResponse.json({ ok: true })
    }

    try {
        // 1. Busca ou cria usuário pelo WhatsApp
        const { data: usuario, error: errUsuario } = await supabase
            .from('usuarios')
            .upsert({ whatsapp: numero }, { onConflict: 'whatsapp' })
            .select('id')
            .single()

        if (errUsuario) throw new Error(errUsuario.message)

        const config = configuracaoPlano(plano)
        const validade = new Date()
        validade.setMonth(validade.getMonth() + 1)

        // 2. Upsert na tabela assinaturas
        const { error: errAssinatura } = await supabase
            .from('assinaturas')
            .upsert(
                {
                    usuario_id: usuario.id,
                    plano,
                    status: 'ativo',
                    validade: validade.toISOString(),
                    abacatepay_billing_id: billing.id,
                    alertas_mes: config.alertas_mes,
                    consultas_mes: config.consultas_mes,
                    updated_at: new Date().toISOString(),
                },
                { onConflict: 'usuario_id' }
            )

        if (errAssinatura) throw new Error(errAssinatura.message)

        console.log(`[AbacatePay] Plano ${plano} ativado para ${numero}`)

        // 3. Envia confirmação via WhatsApp
        await enviarMensagem(numero, mensagemConfirmacao(plano))

        return NextResponse.json({ ok: true })
    } catch (err) {
        const mensagem = err instanceof Error ? err.message : 'Erro desconhecido'
        console.error('[AbacatePay] Erro ao processar pagamento:', mensagem)
        return NextResponse.json({ erro: mensagem }, { status: 500 })
    }
}
