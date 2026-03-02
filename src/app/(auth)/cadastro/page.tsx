'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

export default function CadastroPage() {
  const router = useRouter()

  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [sucesso, setSucesso] = useState(false)

  async function handleCadastro(e: React.FormEvent) {
    e.preventDefault()
    setCarregando(true)
    setErro(null)

    const supabase = createClient()

    const { error } = await supabase.auth.signUp({
      email,
      password: senha,
      options: {
        data: { nome },
        emailRedirectTo: `${window.location.origin}/api/auth/callback?next=/onboarding`,
      },
    })

    if (error) {
      setErro(
        error.message === 'User already registered'
          ? 'Este e-mail já está cadastrado.'
          : 'Erro ao criar conta. Tente novamente.'
      )
      setCarregando(false)
      return
    }

    setSucesso(true)
    setCarregando(false)
  }

  if (sucesso) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="w-full max-w-md text-center">
          <div className="w-16 h-16 bg-green-500/10 border border-green-500/30 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-white font-semibold text-xl mb-2">Verifique seu e-mail</h2>
          <p className="text-slate-400 text-sm">
            Enviamos um link de confirmação para <span className="text-white">{email}</span>.
            Clique no link para ativar sua conta e configurar seu perfil.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-2">
            <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">L</span>
            </div>
            <span className="text-white font-semibold text-xl">LicitaIA</span>
          </div>
          <p className="text-slate-400 text-sm">Comece grátis — 3 monitoramentos incluídos</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8">
          <h1 className="text-white font-semibold text-xl mb-6">Criar sua conta</h1>

          {erro && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm rounded-lg px-4 py-3 mb-4">
              {erro}
            </div>
          )}

          <form onSubmit={handleCadastro} className="space-y-4">
            <div>
              <label className="block text-slate-300 text-sm font-medium mb-1.5">
                Seu nome
              </label>
              <input
                type="text"
                required
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="João Silva"
                className="w-full bg-slate-800 border border-slate-700 text-white placeholder-slate-500 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-slate-300 text-sm font-medium mb-1.5">
                E-mail corporativo
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="joao@empresa.com.br"
                className="w-full bg-slate-800 border border-slate-700 text-white placeholder-slate-500 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-slate-300 text-sm font-medium mb-1.5">
                Senha
              </label>
              <input
                type="password"
                required
                minLength={8}
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                placeholder="Mínimo 8 caracteres"
                className="w-full bg-slate-800 border border-slate-700 text-white placeholder-slate-500 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <button
              type="submit"
              disabled={carregando}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg px-4 py-2.5 text-sm transition-colors"
            >
              {carregando ? 'Criando conta...' : 'Criar conta grátis'}
            </button>
          </form>

          <p className="text-center text-slate-500 text-xs mt-4">
            Ao criar sua conta, você concorda com nossos Termos de Uso e Política de Privacidade.
          </p>

          <p className="text-center text-slate-400 text-sm mt-4">
            Já tem conta?{' '}
            <Link href="/login" className="text-blue-400 hover:text-blue-300 font-medium">
              Entrar
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
