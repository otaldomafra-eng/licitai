import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { processarLoteEditais } from '@/lib/ai/matcher'
import { enviarAlertasEmLote } from '@/lib/whatsapp/handlers/alerta'
import type { EditalDB, PerfilEmpresa } from '@/types'

const SCORE_MINIMO_MATCH = 80   // acima disso notifica o usuário
const EDITAIS_POR_CICLO = 20    // quantos editais processar por execução

function autenticarCron(req: Request): boolean {
  const auth = req.headers.get('authorization')
  return auth === `Bearer ${process.env.CRON_SECRET}`
}

export async function POST(req: Request) {
  if (!autenticarCron(req)) {
    return NextResponse.json({ erro: 'Não autorizado' }, { status: 401 })
  }

  const supabase = createAdminClient()
  const inicio = Date.now()
  const estatisticas = { matches_criados: 0, notificacoes: 0, erros: 0 }

  try {
    // 1. Busca editais ainda não processados pela IA
    const { data: editais, error: errEditais } = await supabase
      .from('editais_pncp')
      .select('*')
      .eq('processado_ia', false)
      .eq('status', 'Recebendo Proposta')
      .order('data_publicacao', { ascending: false })
      .limit(EDITAIS_POR_CICLO)

    if (errEditais) throw new Error(errEditais.message)
    if (!editais?.length) {
      return NextResponse.json({ sucesso: true, mensagem: 'Nenhum edital pendente de análise' })
    }

    // 2. Busca todos os perfis ativos de usuários
    const { data: perfis, error: errPerfis } = await supabase
      .from('perfil_empresa')
      .select('*')
      .not('descricao', 'is', null)

    if (errPerfis) throw new Error(errPerfis.message)
    if (!perfis?.length) {
      return NextResponse.json({ sucesso: true, mensagem: 'Nenhum perfil de empresa cadastrado' })
    }

    // 3. Para cada perfil, analisa os editais pendentes com a IA
    for (const perfil of perfis as PerfilEmpresa[]) {
      const resultados = await processarLoteEditais(
        editais as EditalDB[],
        perfil,
        (atual, total) =>
          console.log(`[AI Process] Perfil ${perfil.usuario_id}: ${atual}/${total}`)
      )

      // 4. Salva os resultados no banco
      const matchesParaSalvar = resultados
        .filter((r) => r.resultado !== null)
        .map((r) => ({
          usuario_id: perfil.usuario_id,
          edital_id: r.edital_id,
          score: r.resultado!.score,
          justificativa: r.resultado!.justificativa,
          pontos_fortes: r.resultado!.pontos_fortes,
          riscos: r.resultado!.riscos,
          status: 'novo',
          notificado: false,
        }))

      if (matchesParaSalvar.length > 0) {
        const { error: errMatch } = await supabase
          .from('matches_editais')
          .upsert(matchesParaSalvar, {
            onConflict: 'usuario_id,edital_id',
            ignoreDuplicates: false,
          })

        if (errMatch) {
          console.error('[AI Process] Erro ao salvar matches:', errMatch)
          estatisticas.erros++
        } else {
          estatisticas.matches_criados += matchesParaSalvar.length
        }
      }

      // 5. Envia alertas WhatsApp para matches acima do limiar
      const paraNotificar = matchesParaSalvar.filter((m) => m.score >= SCORE_MINIMO_MATCH)

      if (paraNotificar.length > 0) {
        await supabase
          .from('matches_editais')
          .update({ notificado: true })
          .eq('usuario_id', perfil.usuario_id)
          .in('edital_id', paraNotificar.map((m: { edital_id: string }) => m.edital_id))

        // Busca número WhatsApp do usuário
        const { data: usuario } = await supabase
          .from('usuarios')
          .select('whatsapp')
          .eq('id', perfil.usuario_id)
          .maybeSingle()

        const whatsapp = usuario?.whatsapp as string | null | undefined
        if (whatsapp) {
          // Monta lista de alertas para envio em lote
          const alertas: import('@/lib/whatsapp/handlers/alerta').DadosAlerta[] = []
          for (const m of paraNotificar) {
            const edital = editais.find((e) => e.id === m.edital_id)
            const resultado = resultados.find((r) => r.edital_id === m.edital_id)?.resultado
            if (!edital || !resultado) continue
            alertas.push({
              numero: whatsapp as string,
              match: { ...resultado, id: m.edital_id },
              edital: edital as EditalDB,
            })
          }

          const { enviados, falhas } = await enviarAlertasEmLote(alertas)
          estatisticas.notificacoes += enviados
          if (falhas > 0) estatisticas.erros += falhas
        } else {
          console.warn(`[AI Process] Usuário ${perfil.usuario_id} sem WhatsApp cadastrado`)
          estatisticas.notificacoes += paraNotificar.length
        }
      }

      estatisticas.erros += resultados.filter((r) => r.erro).length
    }

    // 6. Marca editais como processados pela IA
    await supabase
      .from('editais_pncp')
      .update({ processado_ia: true })
      .in('id', editais.map((e) => e.id))

    const duracao = ((Date.now() - inicio) / 1000).toFixed(2)

    return NextResponse.json({
      sucesso: true,
      editais_analisados: editais.length,
      perfis_processados: perfis.length,
      ...estatisticas,
      duracao_segundos: Number(duracao),
    })
  } catch (err) {
    const mensagem = err instanceof Error ? err.message : 'Erro desconhecido'
    console.error('[AI Process] Falha:', mensagem)
    return NextResponse.json({ erro: mensagem }, { status: 500 })
  }
}
