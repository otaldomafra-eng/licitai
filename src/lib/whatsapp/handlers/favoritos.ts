/**
 * favoritos.ts â€” Seguir editais e lembretes de prazo
 *
 * Fluxo:
 * - UsuÃ¡rio escolhe opÃ§Ã£o "4ï¸âƒ£ Seguir" no menu pÃ³s-detalhe
 * - Edital Ã© salvo em `editais_seguidos`
 * - Cron /api/whatsapp/lembretes envia avisos 72h e 24h antes do encerramento
 * - Comando "meus editais" lista editais seguidos com status do prazo
 */

import { createAdminClient } from '@/lib/supabase/server'
import type { EditalDB } from '@/types'
import { resolverLinkEditalDB } from '@/lib/pncp/links'

// â”€â”€â”€ Seguir edital â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export async function seguirEdital(numero: string, editalId: string): Promise<string> {
    const supabase = createAdminClient()

    // Busca ID do usuÃ¡rio
    const { data: usuario } = await supabase
        .from('usuarios').select('id').eq('whatsapp', numero).maybeSingle()
    if (!usuario) return 'âŒ UsuÃ¡rio nÃ£o encontrado. Envie *oi* para se cadastrar.'

    // Busca dados do edital
    const { data: edital } = await supabase
        .from('editais_pncp').select('nome_orgao, objeto, data_encerramento').eq('id', editalId).maybeSingle()
    if (!edital) return 'âŒ Edital nÃ£o encontrado.'

    // Verifica se jÃ¡ segue
    const { data: existente } = await supabase
        .from('editais_seguidos')
        .select('id')
        .eq('usuario_id', usuario.id)
        .eq('edital_id', editalId)
        .maybeSingle()

    if (existente) {
        return [
            'â­ VocÃª jÃ¡ estÃ¡ seguindo este edital.',
            '',
            '_Envie *meus editais* para ver todos os editais que vocÃª acompanha._',
        ].join('\n')
    }

    // Salva favorito
    const { error } = await supabase
        .from('editais_seguidos')
        .insert({ usuario_id: usuario.id, edital_id: editalId })

    if (error) {
        console.error('[Favoritos] Erro ao salvar:', error.message)
        return 'âš ï¸ NÃ£o foi possÃ­vel salvar o edital. Tente novamente.'
    }

    const encerramento = edital.data_encerramento
        ? new Date(edital.data_encerramento).toLocaleDateString('pt-BR')
        : 'prazo nÃ£o informado'

    return [
        `â­ *Edital salvo com sucesso!*`,
        '',
        `ðŸ“‹ ${String(edital.objeto).substring(0, 100)}...`,
        `ðŸ›ï¸ ${edital.nome_orgao}`,
        `â° Encerra: ${encerramento}`,
        '',
        '_VocÃª receberÃ¡ lembretes automÃ¡ticos 72h e 24h antes do prazo encerrar._',
        '_Envie *meus editais* para ver todos os editais acompanhados._',
    ].join('\n')
}

// â”€â”€â”€ Listar favoritos â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export async function listarFavoritos(numero: string): Promise<string> {
    const supabase = createAdminClient()

    const { data: usuario } = await supabase
        .from('usuarios').select('id').eq('whatsapp', numero).maybeSingle()
    if (!usuario) return 'âŒ UsuÃ¡rio nÃ£o encontrado.'

    const { data: seguidos } = await supabase
        .from('editais_seguidos')
        .select('edital_id, created_at, editais_pncp(nome_orgao, objeto, data_encerramento, status, link_sistema_origem)')
        .eq('usuario_id', usuario.id)
        .order('created_at', { ascending: false })
        .limit(10)

    if (!seguidos?.length) {
        return [
            'â­ *VocÃª nÃ£o estÃ¡ seguindo nenhum edital ainda.*',
            '',
            '_ApÃ³s ver os detalhes de um edital, escolha a opÃ§Ã£o_',
            '_*4ï¸âƒ£ Seguir este edital* para acompanhÃ¡-lo._',
        ].join('\n')
    }

    const linhas = seguidos.map((s, i) => {
        const e = s.editais_pncp as unknown as EditalDB | null
        if (!e) return ''

        const diasRestantes = e.data_encerramento
            ? Math.ceil((new Date(e.data_encerramento).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
            : null

        const prazoIcon =
            diasRestantes === null ? 'ðŸ“…' :
            diasRestantes <= 0    ? 'ðŸ”´ Encerrado' :
            diasRestantes <= 1    ? `âš¡ ${diasRestantes}d restante` :
            diasRestantes <= 3    ? `âš¡ ${diasRestantes}d restantes` :
            diasRestantes <= 7    ? `â³ ${diasRestantes}d restantes` :
                                    `ðŸ“… ${diasRestantes}d restantes`

        return [
            `*${i + 1}. ${e.nome_orgao}*`,
            `ðŸ“‹ ${e.objeto.substring(0, 90)}...`,
            prazoIcon,
        ].join('\n')
    }).filter(Boolean)

    return [
        `â­ *Seus editais acompanhados (${seguidos.length}):*`,
        '',
        linhas.join('\n\n'),
        '',
        '_Os editais encerrados serÃ£o removidos automaticamente em 7 dias._',
    ].join('\n')
}

// â”€â”€â”€ Enviador de lembretes (chamado pelo cron) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export interface LembreteResult {
    enviados: number
    erros: number
}

export async function enviarLembretesPrazo(
    enviarMensagemFn: (numero: string, texto: string) => Promise<void>
): Promise<LembreteResult> {
    const supabase = createAdminClient()
    const agora = new Date()

    // Janelas de lembrete: 24h e 72h antes do encerramento
    const JANELAS = [
        { horas: 24,  campo: 'lembrete_24h_enviado',  label: '24 horas' },
        { horas: 72,  campo: 'lembrete_72h_enviado',  label: '72 horas' },
    ]

    let enviados = 0
    let erros = 0

    for (const janela of JANELAS) {
        // Janela de Â±12h para compensar execuÃ§Ã£o diÃ¡ria (Hobby plan)
        const inicio = new Date(agora.getTime() + (janela.horas - 12) * 3600 * 1000)
        const fim    = new Date(agora.getTime() + (janela.horas + 12) * 3600 * 1000)

        // Busca editais_seguidos com prazo na janela (sem nested select para evitar parser do TS)
        const { data: registros } = await supabase
            .from('editais_seguidos')
            .select('id, edital_id, usuario_id, lembrete_24h_enviado, lembrete_72h_enviado')
            .eq(janela.campo, false)

        if (!registros?.length) continue

        for (const reg of registros) {
            // Carrega edital e usuÃ¡rio separadamente
            const { data: editalRow } = await supabase
                .from('editais_pncp')
                .select('nome_orgao, objeto, data_encerramento, link_sistema_origem, status, numero_controle_pncp, cnpj_orgao, ano_compra, sequencial_compra')
                .eq('id', reg.edital_id)
                .maybeSingle()

            if (!editalRow) continue
            if (!editalRow.data_encerramento) continue

            const encDate = new Date(editalRow.data_encerramento)
            if (encDate < inicio || encDate > fim) continue

            const { data: usuarioRow } = await supabase
                .from('usuarios')
                .select('whatsapp, alertas_pausados')
                .eq('id', reg.usuario_id)
                .maybeSingle()

            const usuario = usuarioRow
            const edital  = editalRow as unknown as EditalDB

            if (!usuario || usuario.alertas_pausados) continue

            const encerramento = edital.data_encerramento
                ? new Date(edital.data_encerramento).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                : 'em breve'

            const msg = [
                `â° *Lembrete de Prazo â€” LicitaIA*`,
                '',
                `Faltam *${janela.label}* para o encerramento do edital que vocÃª estÃ¡ acompanhando:`,
                '',
                `ðŸ›ï¸ *${edital.nome_orgao}*`,
                `ðŸ“‹ ${edital.objeto.substring(0, 100)}...`,
                `â° Encerra: *${encerramento}*`,
                '',
                `Acesse: ${resolverLinkEditalDB(edital)}`,
                '',
                '_Responda *meus editais* para ver todos os editais acompanhados._',
            ].join('\n')

            try {
                await enviarMensagemFn(usuario.whatsapp, msg)
                await supabase
                    .from('editais_seguidos')
                    .update({ [janela.campo]: true })
                    .eq('id', reg.id)
                enviados++
            } catch (err) {
                console.error('[Favoritos] Erro ao enviar lembrete:', err)
                erros++
            }
        }
    }

    return { enviados, erros }
}
