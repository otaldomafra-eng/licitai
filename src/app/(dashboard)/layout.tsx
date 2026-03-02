import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { NavBar } from '@/components/dashboard/NavBar'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // Busca dados do usuário para a navbar
  const { data: usuario } = await supabase
    .from('usuarios')
    .select('nome, plano, monitoramentos_ativos, limite_monitoramentos')
    .eq('id', user.id)
    .single()

  return (
    <div className="min-h-screen bg-slate-950">
      <NavBar usuario={usuario} email={user.email ?? ''} />
      <main className="max-w-5xl mx-auto px-4 py-8">{children}</main>
    </div>
  )
}
