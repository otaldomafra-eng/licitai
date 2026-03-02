import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { DashboardClient } from './DashboardClient'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // Verifica se tem perfil cadastrado
  const { data: perfil } = await supabase
    .from('perfil_empresa')
    .select('id, descricao')
    .eq('usuario_id', user.id)
    .single()

  if (!perfil?.descricao) redirect('/onboarding')

  // Busca matches com os dados do edital
  const { data: matches } = await supabase
    .from('matches_editais')
    .select(`
      *,
      editais_pncp (
        id, pncp_id, objeto, nome_orgao, uf_orgao, municipio_orgao,
        modalidade, valor_estimado, data_encerramento,
        link_sistema_origem, status
      )
    `)
    .eq('usuario_id', user.id)
    .neq('status', 'descartado')
    .order('score', { ascending: false })
    .limit(50)

  // Estatísticas rápidas
  const totalMatches = matches?.length ?? 0
  const altosScores = matches?.filter((m) => m.score >= 80).length ?? 0
  const propostas = matches?.filter((m) => m.status === 'proposta_gerada').length ?? 0

  return (
    <DashboardClient
      matchesIniciais={matches ?? []}
      stats={{ totalMatches, altosScores, propostas }}
      userId={user.id}
    />
  )
}
