/**
 * alerta.ts — Handler de alertas proativos via WhatsApp
 *
 * Chamado pelo cron /api/ai/process após processar matches.
 * Formata e envia alertas de editais compatíveis para os usuários.
 */

import { enviarAlerta, aguardar } from '@/lib/whatsapp/client'
import type { MatchEdital, EditalDB } from '@/types'

export interface DadosAlerta {
    numero: string
    match: Pick<MatchEdital, 'score' | 'justificativa' | 'pontos_fortes' | 'riscos' | 'id'>
    edital: Pick<
        EditalDB,
        'nome_orgao' | 'objeto' | 'valor_estimado' | 'data_encerramento' | 'link_sistema_origem' | 'municipio_orgao' | 'uf_orgao'
    >
}

/**
 * Envia alerta de match para um único usuário.
 * @returns true se enviado com sucesso, false se falhou
 */
export async function enviarAlertaMatch(dados: DadosAlerta): Promise<boolean> {
    try {
        await enviarAlerta(dados.numero, dados.match, dados.edital)
        console.log(
            `[Alerta] Enviado para ${dados.numero} — edital: ${dados.edital.nome_orgao} (score: ${dados.match.score})`
        )
        return true
    } catch (err) {
        console.error(
            `[Alerta] Falha ao enviar para ${dados.numero}:`,
            err instanceof Error ? err.message : err
        )
        return false
    }
}

/**
 * Envia alertas em lote para múltiplos usuários.
 * Respeita o rate limit da Evolution API com delay de 60ms entre envios.
 *
 * @returns Estatísticas de envio
 */
export async function enviarAlertasEmLote(
    alertas: DadosAlerta[]
): Promise<{ enviados: number; falhas: number }> {
    let enviados = 0
    let falhas = 0

    for (const alerta of alertas) {
        const sucesso = await enviarAlertaMatch(alerta)
        if (sucesso) enviados++
        else falhas++

        // Rate limit: máximo ~16 msg/s (60ms de delay)
        if (alertas.indexOf(alerta) < alertas.length - 1) {
            await aguardar(60)
        }
    }

    console.log(`[Alerta] Lote concluído: ${enviados} enviados, ${falhas} falhas`)
    return { enviados, falhas }
}
