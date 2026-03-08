/**
 * /api/whatsapp/webhook
 *
 * Recebe mensagens da Meta WhatsApp Cloud API.
 * Docs: https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks
 *
 * GET  â†’ verificaÃ§Ã£o do webhook (hub.challenge)
 * POST â†’ mensagens recebidas
 */

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { enviarMensagem, marcarComoLido } from '@/lib/whatsapp/client'
import { identificarIntencao, respostaDuvida, respostaMenu } from '@/lib/ai/assistant'
import { handleOnboarding, reiniciarOnboarding } from '@/lib/whatsapp/handlers/onboarding'
import { handleConsulta, handleDetalheEdital, handleAcaoEdital, handleRefinamento, handleMaisResultados } from '@/lib/whatsapp/handlers/consulta'
import { consultarPlano, alternarAlertas, respostaSuporte } from '@/lib/whatsapp/handlers/ajuda'
import { listarFavoritos } from '@/lib/whatsapp/handlers/favoritos'
import { createAdminClient } from '@/lib/supabase/server'
import { executarPipelineWebhook } from '@/lib/whatsapp/webhook-pipeline'
import type { EtapaOnboarding, ContextoConversa } from '@/types'

// â”€â”€â”€ Schema Zod â€” Meta Cloud API webhook payload â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const SchemaMetaMensagem = z.object({
    from: z.string(),
    id: z.string(),
    timestamp: z.string(),
    type: z.string(),
    text: z.object({ body: z.string() }).optional(),
    image: z.object({ caption: z.string().optional(), mime_type: z.string().optional() }).optional(),
    audio: z.object({}).optional(),
    document: z.object({}).optional(),
    sticker: z.object({}).optional(),
    reaction: z.object({}).optional(),
})

const SchemaMetaWebhook = z.object({
    object: z.string(),
    entry: z.array(z.object({
        id: z.string(),
        changes: z.array(z.object({
            value: z.object({
                messaging_product: z.string().optional(),
                metadata: z.object({
                    display_phone_number: z.string(),
                    phone_number_id: z.string(),
                }).optional(),
                contacts: z.array(z.object({
                    profile: z.object({ name: z.string() }).optional(),
                    wa_id: z.string(),
                })).optional(),
                messages: z.array(SchemaMetaMensagem).optional(),
                statuses: z.array(z.any()).optional(),
            }),
            field: z.string(),
        })),
    })),
})

type MetaMensagem = z.infer<typeof SchemaMetaMensagem>

// â”€â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function extrairTexto(msg: MetaMensagem): string | null {
    if (msg.type === 'text' && msg.text?.body) return msg.text.body.trim()
    if (msg.type === 'image' && msg.image?.caption) return msg.image.caption.trim()
    return null
}

/** Verifica se o nÃºmero tem cadastro ativo no sistema */
async function usuarioCadastrado(numero: string): Promise<boolean> {
    const supabase = createAdminClient()
    const { data } = await supabase
        .from('usuarios')
        .select('id')
        .eq('whatsapp', numero)
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

/** Busca o contexto completo da conversa */
async function buscarContextoConversa(numero: string): Promise<ContextoConversa | null> {
    const supabase = createAdminClient()
    const { data } = await supabase
        .from('conversas')
        .select('contexto_json')
        .eq('numero_whatsapp', numero)
        .maybeSingle()
    return (data?.contexto_json as ContextoConversa) ?? null
}

// â”€â”€â”€ DetecÃ§Ã£o de reclamaÃ§Ã£o sobre resultados â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * Detecta quando o usuÃ¡rio estÃ¡ reclamando dos resultados (nÃ£o fazendo nova busca).
 * Ex: "mas esses nÃ£o sÃ£o o que pedi", "resultados errados", "nÃ£o Ã© isso"
 */

async function registrarInteracao(numero: string, textoUsuario: string, textoAssistente: string): Promise<void> {
    try {
        const supabase = createAdminClient()
        const { data } = await supabase
            .from('conversas')
            .select('contexto_json')
            .eq('numero_whatsapp', numero)
            .maybeSingle()

        const contexto = (data?.contexto_json as ContextoConversa) ?? {}
        const historico = contexto.historico_mensagens ?? []
        const agora = new Date().toISOString()

        const atualizado = [
            ...historico,
            { role: 'user' as const, texto: textoUsuario, at: agora },
            { role: 'assistant' as const, texto: textoAssistente, at: agora },
        ].slice(-12)

        await supabase
            .from('conversas')
            .update({
                contexto_json: {
                    ...contexto,
                    historico_mensagens: atualizado,
                },
            })
            .eq('numero_whatsapp', numero)
    } catch (err) {
        console.warn('[Webhook] Erro ao registrar historico:', err instanceof Error ? err.message : err)
    }
}
async function handleComando(numero: string, texto: string, contexto?: ContextoConversa): Promise<string> {
    const cmd = texto.toLowerCase().trim()

    if (cmd === 'menu' || cmd === 'ajuda' || cmd === 'help') {
        return respostaMenu()
    }

    if (cmd === 'suporte') {
        return respostaSuporte()
    }

    if (cmd === 'mudar perfil' || cmd === 'alterar perfil' || cmd === 'novo perfil') {
        return reiniciarOnboarding(numero)
    }

    if (cmd === 'pausar' || cmd === 'parar alertas' || cmd === 'parar') {
        return alternarAlertas(numero, true)
    }

    if (cmd === 'ativar' || cmd === 'retomar alertas' || cmd === 'retomar') {
        return alternarAlertas(numero, false)
    }

    if (cmd === 'planos' || cmd === 'assinar' || cmd === 'upgrade' || cmd === 'meu plano') {
        return consultarPlano(numero)
    }

    if (cmd === 'meus editais' || cmd === 'favoritos' || cmd === 'editais salvos' || cmd === 'seguindo') {
        return listarFavoritos(numero)
    }

    return respostaDuvida(texto, contexto)
}

// â”€â”€â”€ GET â€” VerificaÃ§Ã£o do webhook Meta â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export async function GET(req: Request): Promise<NextResponse> {
    const { searchParams } = new URL(req.url)
    const mode      = searchParams.get('hub.mode')
    const token     = searchParams.get('hub.verify_token')
    const challenge = searchParams.get('hub.challenge')

    if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
        console.log('[Webhook] Meta webhook verificado com sucesso')
        return new NextResponse(challenge, { status: 200 })
    }

    console.warn('[Webhook] Falha na verificaÃ§Ã£o:', { mode, token })
    return NextResponse.json({ erro: 'Token invÃ¡lido' }, { status: 403 })
}

// â”€â”€â”€ POST â€” Mensagens recebidas â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export async function POST(req: Request): Promise<NextResponse> {
    let body: unknown

    try {
        body = await req.json()
    } catch {
        return NextResponse.json({ erro: 'Payload invÃ¡lido' }, { status: 400 })
    }

    console.log('[Webhook] Payload recebido:', JSON.stringify(body))

    const parsed = SchemaMetaWebhook.safeParse(body)
    if (!parsed.success) {
        // Meta envia outros eventos (status, read receipts) â€” retorna 200 sempre
        console.log('[Webhook] Schema nÃ£o reconhecido (provÃ¡vel status update) â€” ignorado')
        return NextResponse.json({ ok: true })
    }

    // Processa cada entry â†’ change â†’ message
    for (const entry of parsed.data.entry) {
        for (const change of entry.changes) {
            if (change.field !== 'messages') continue

            const messages = change.value.messages
            if (!messages?.length) continue // status update sem mensagem

            for (const msg of messages) {
                const texto = extrairTexto(msg)
                if (!texto) continue // Ã¡udio, documento, sticker â€” ignora

                const numero    = msg.from
                const messageId = msg.id

                console.log(`[Webhook] Mensagem de ${numero}: "${texto.substring(0, 80)}"`)

                try {
                    await processarMensagem(numero, messageId, texto)
                } catch (err) {
                    console.error(`[Webhook] Erro ao processar ${numero}:`, err)
                    await enviarMensagem(numero, 'âš ï¸ Ocorreu um erro interno. Tente novamente em instantes.').catch(() => {})
                }
            }
        }
    }

    return NextResponse.json({ ok: true })
}

// â”€â”€â”€ Processamento principal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function processarMensagem(numero: string, messageId: string, texto: string): Promise<void> {
    try {
        console.log(`[Webhook] Iniciando processarMensagem para ${numero}`)

        const cadastrado = await usuarioCadastrado(numero)
        console.log(`[Webhook] Cadastrado: ${cadastrado}`)
        if (!cadastrado) {
            console.log(`[Webhook] N??mero ${numero} n??o cadastrado ??? ignorado`)
            return
        }

        marcarComoLido(numero, messageId).catch(() => { })

        const etapaAtual = await buscarEtapaConversa(numero)
        let contextoAtual: ContextoConversa = (await buscarContextoConversa(numero)) ?? {}
        console.log(`[Webhook] Etapa atual: ${etapaAtual ?? 'nova'}`)

        const responder = async (mensagem: string): Promise<void> => {
            await enviarMensagem(numero, mensagem)
            await registrarInteracao(numero, texto, mensagem)
        }

        const resultadoPipeline = await executarPipelineWebhook({
            numero,
            texto,
            etapaAtual,
            contextoAtual,
            atualizarContextoConversa,
            responder,
            identificarIntencao,
            resolverConsulta: handleConsulta,
            resolverDuvida: respostaDuvida,
            resolverAcaoEdital: handleAcaoEdital,
            resolverDetalheEdital: handleDetalheEdital,
            resolverMaisResultados: handleMaisResultados,
            resolverRefinamento: handleRefinamento,
            resolverOnboarding: handleOnboarding,
            resolverComando: handleComando,
        })

        contextoAtual = resultadoPipeline.contextoAtual
        if (resultadoPipeline.intencao) {
            console.log(`[Webhook] ${numero} - etapa: ${etapaAtual ?? 'nova'}, intencao: ${resultadoPipeline.intencao}`)
        }

        if (resultadoPipeline.handled) return

        const fallback = await respostaDuvida(texto, contextoAtual ?? undefined)
        await responder(fallback)
    } catch (err) {
        const detalhes = err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : String(err)
        console.error(`[Webhook] Falha dentro de processarMensagem (${numero}): ${detalhes}`)

        const mensagemResiliente = [
            '⚠️ Desculpe, tive uma instabilidade nesta busca.',
            'Pode me enviar no formato: "segmento em UF acima de valor"?',
            '_Exemplo: "obras em SP acima de 100k"_',
        ].join('\n')

        await enviarMensagem(numero, mensagemResiliente).catch(() => { })
    }
}



async function atualizarContextoConversa(numero: string, patch: Partial<ContextoConversa>): Promise<ContextoConversa | null> {
    const supabase = createAdminClient()
    const { data } = await supabase
        .from('conversas')
        .select('contexto_json')
        .eq('numero_whatsapp', numero)
        .maybeSingle()

    const atual = (data?.contexto_json as ContextoConversa) ?? {}
    const proximo: ContextoConversa = { ...atual, ...patch }

    await supabase
        .from('conversas')
        .update({ contexto_json: proximo })
        .eq('numero_whatsapp', numero)

    return proximo
}















