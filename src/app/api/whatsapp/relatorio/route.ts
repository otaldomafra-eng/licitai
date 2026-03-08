/**
 * POST /api/whatsapp/relatorio
 * Cron semanal (segunda-feira 8h UTC) — envia digest dos melhores matches da semana.
 */

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { enviarMensagem } from '@/lib/whatsapp/client'

export async function POST(req: Request): Promise<NextResponse> {
    const secret = req.headers.get('authorization')?.replace('Bearer ', '')
    if (secret !== process.env.CRON_SECRET) {
        return NextResponse.json({ erro: 'Não autorizado' }, { status: 401 })
    }

    const supabase = createAdminClient()
    const seteDiasAtras = new Date()
    seteDiasAtras.setDate(seteDiasAtras.getDate() - 7)

    let enviados = 0
    let erros = 0

    try {
        // Busca todos os usuários ativos com alertas não pausados
        const { data: usuarios } = await supabase
            .from('usuarios')
            .select('id, whatsapp, nome, alertas_pausados')
            .eq('alertas_pausados', false)

        if (!usuarios?.length) {
            return NextResponse.json({ ok: true, enviados: 0, motivo: 'Nenhum usuário ativo' })
        }

        for (const usuario of usuarios) {
            try {
                // Busca os top matches da semana (score >= 65)
                const { data: matches } = await supabase
                    .from('matches_editais')
                    .select(`
                        score,
                        recomendacao,
                        editais_pncp(nome_orgao, objeto, valor_estimado, uf_orgao, municipio_orgao, data_encerramento, modalidade)
                    `)
                    .eq('usuario_id', usuario.id)
                    .gte('score', 65)
                    .gte('created_at', seteDiasAtras.toISOString())
                    .order('score', { ascending: false })
                    .limit(5)

                if (!matches?.length) continue

                const semana = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
                const semanaAnterior = seteDiasAtras.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })

                const saudacao = usuario.nome ? `, *${usuario.nome}*` : ''

                const linhasEditais = matches.map((m, i) => {
                    const e = m.editais_pncp as unknown as Record<string, unknown> | null
                    if (!e) return ''
                    const valor = e.valor_estimado
                        ? Number(e.valor_estimado).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                        : 'Valor não informado'
                    const diasRestantes = e.data_encerramento
                        ? Math.ceil((new Date(String(e.data_encerramento)).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
                        : null
                    const prazo = diasRestantes !== null && diasRestantes > 0
                        ? `${diasRestantes}d restantes`
                        : diasRestantes === 0 ? 'encerra hoje' : 'encerrado'

                    const icone = m.score >= 80 ? '🟢' : '🟡'
                    return [
                        `${icone} *${i + 1}. Score ${m.score}/100* — ${e.modalidade ?? ''}`,
                        `🏛️ ${e.nome_orgao}`,
                        `📋 ${String(e.objeto).substring(0, 80)}...`,
                        `💰 ${valor} | 📍 ${e.municipio_orgao} - ${e.uf_orgao} | ⏰ ${prazo}`,
                    ].join('\n')
                }).filter(Boolean)

                if (!linhasEditais.length) continue

                const msg = [
                    `📊 *Relatório Semanal LicitaIA${saudacao}*`,
                    `_Período: ${semanaAnterior} a ${semana}_`,
                    '',
                    `*${matches.length} oportunidade(s) identificada(s) para o seu perfil:*`,
                    '',
                    linhasEditais.join('\n\n'),
                    '',
                    '_Para ver detalhes, faça uma busca ou responda com o segmento de interesse._',
                    '_Boa semana e boas licitações!_ 🏆',
                ].join('\n')

                await enviarMensagem(usuario.whatsapp, msg)
                enviados++

                // Respeita rate limit do Z-API (500ms entre envios)
                await new Promise((r) => setTimeout(r, 500))
            } catch (err) {
                console.error(`[Relatório] Erro para usuário ${usuario.id}:`, err)
                erros++
            }
        }

        console.log(`[Relatório] Semana enviada — ${enviados} relatórios | ${erros} erros`)
        return NextResponse.json({ ok: true, enviados, erros })
    } catch (err) {
        const msg = err instanceof Error ? err.message : 'Erro desconhecido'
        console.error('[Relatório] Erro geral:', msg)
        return NextResponse.json({ erro: msg }, { status: 500 })
    }
}
