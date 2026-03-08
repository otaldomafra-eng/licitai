/**
 * POST /api/whatsapp/lembretes
 * Cron horário — envia lembretes de prazo (72h e 24h) para editais seguidos.
 */

import { NextResponse } from 'next/server'
import { enviarMensagem } from '@/lib/whatsapp/client'
import { enviarLembretesPrazo } from '@/lib/whatsapp/handlers/favoritos'

export async function POST(req: Request): Promise<NextResponse> {
    const secret = req.headers.get('authorization')?.replace('Bearer ', '')
    if (secret !== process.env.CRON_SECRET) {
        return NextResponse.json({ erro: 'Não autorizado' }, { status: 401 })
    }

    try {
        const resultado = await enviarLembretesPrazo(
            (numero, texto) => enviarMensagem(numero, texto)
        )

        console.log(`[Lembretes] Enviados: ${resultado.enviados} | Erros: ${resultado.erros}`)
        return NextResponse.json({ ok: true, ...resultado })
    } catch (err) {
        const msg = err instanceof Error ? err.message : 'Erro desconhecido'
        console.error('[Lembretes] Erro geral:', msg)
        return NextResponse.json({ erro: msg }, { status: 500 })
    }
}
