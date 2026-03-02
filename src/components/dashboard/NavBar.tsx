'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

interface NavBarProps {
  email: string
  usuario: {
    nome: string | null
    plano: string
    monitoramentos_ativos: number
    limite_monitoramentos: number
  } | null
}

const LABEL_PLANO: Record<string, string> = {
  gratuito: 'Grátis',
  basico: 'Básico',
  profissional: 'Pro',
}

export function NavBar({ email, usuario }: NavBarProps) {
  const router = useRouter()

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur-sm sticky top-0 z-10">
      <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
        {/* Logo */}
        <Link href="/dashboard" className="flex items-center gap-2">
          <div className="w-7 h-7 bg-blue-500 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-xs">L</span>
          </div>
          <span className="text-white font-semibold">LicitaIA</span>
        </Link>

        {/* Nav */}
        <nav className="hidden sm:flex items-center gap-1">
          <Link
            href="/dashboard"
            className="text-slate-400 hover:text-white text-sm px-3 py-1.5 rounded-lg hover:bg-slate-800 transition-colors"
          >
            Editais
          </Link>
          <Link
            href="/dashboard/perfil"
            className="text-slate-400 hover:text-white text-sm px-3 py-1.5 rounded-lg hover:bg-slate-800 transition-colors"
          >
            Meu Perfil
          </Link>
          <Link
            href="/dashboard/planos"
            className="text-slate-400 hover:text-white text-sm px-3 py-1.5 rounded-lg hover:bg-slate-800 transition-colors"
          >
            Planos
          </Link>
        </nav>

        {/* User info */}
        <div className="flex items-center gap-3">
          {usuario && (
            <div className="hidden sm:flex items-center gap-2">
              <span className="text-xs text-slate-500">
                {usuario.monitoramentos_ativos}/{usuario.limite_monitoramentos} mon.
              </span>
              <span className="text-xs text-blue-400 bg-blue-400/10 border border-blue-400/20 px-2 py-0.5 rounded-full">
                {LABEL_PLANO[usuario.plano] ?? usuario.plano}
              </span>
            </div>
          )}
          <button
            onClick={handleLogout}
            className="text-slate-400 hover:text-white text-xs px-3 py-1.5 rounded-lg border border-slate-700 hover:border-slate-500 transition-colors"
          >
            Sair
          </button>
        </div>
      </div>
    </header>
  )
}
