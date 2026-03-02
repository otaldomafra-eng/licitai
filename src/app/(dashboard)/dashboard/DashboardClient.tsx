'use client'

import { useState } from 'react'
import { EditalCard } from '@/components/dashboard/EditalCard'
import type { MatchEdital } from '@/types'

interface Stats {
  totalMatches: number
  altosScores: number
  propostas: number
}

interface Props {
  matchesIniciais: MatchEdital[]
  stats: Stats
  userId: string
}

type Filtro = 'todos' | 'match' | 'avaliar'

export function DashboardClient({ matchesIniciais, stats, userId }: Props) {
  const [matches, setMatches] = useState<MatchEdital[]>(matchesIniciais)
  const [filtro, setFiltro] = useState<Filtro>('todos')

  const matchesFiltrados = matches.filter((m) => {
    if (filtro === 'match') return m.score >= 80
    if (filtro === 'avaliar') return m.score >= 50 && m.score < 80
    return true
  })

  async function handleGerarProposta(matchId: string) {
    const res = await fetch('/api/ai/proposta', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ match_id: matchId, user_id: userId }),
    })

    if (res.ok) {
      setMatches((prev) =>
        prev.map((m) =>
          m.id === matchId ? { ...m, status: 'proposta_gerada' } : m
        )
      )
    }
  }

  return (
    <div>
      {/* Cabeçalho */}
      <div className="mb-8">
        <h1 className="text-white font-bold text-2xl mb-1">Editais para você</h1>
        <p className="text-slate-400 text-sm">
          A IA analisou os editais mais recentes do PNCP e selecionou os mais compatíveis com seu perfil.
        </p>
      </div>

      {/* Cards de estatísticas */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <p className="text-slate-500 text-xs mb-1">Total analisado</p>
          <p className="text-white font-bold text-2xl">{stats.totalMatches}</p>
        </div>
        <div className="bg-slate-900 border border-green-500/20 rounded-xl p-4">
          <p className="text-slate-500 text-xs mb-1">Alta compatibilidade</p>
          <p className="text-green-400 font-bold text-2xl">{stats.altosScores}</p>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <p className="text-slate-500 text-xs mb-1">Propostas geradas</p>
          <p className="text-blue-400 font-bold text-2xl">{stats.propostas}</p>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex gap-2 mb-6">
        {(['todos', 'match', 'avaliar'] as Filtro[]).map((f) => {
          const label = f === 'todos' ? 'Todos' : f === 'match' ? 'Alta compatibilidade (≥80%)' : 'Avaliar (50–79%)'
          return (
            <button
              key={f}
              onClick={() => setFiltro(f)}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                filtro === f
                  ? 'bg-blue-600 border-blue-500 text-white'
                  : 'bg-slate-900 border-slate-700 text-slate-400 hover:border-slate-500'
              }`}
            >
              {label}
            </button>
          )
        })}
      </div>

      {/* Lista de editais */}
      {matchesFiltrados.length === 0 ? (
        <EmptyState filtro={filtro} />
      ) : (
        <div className="space-y-4">
          {matchesFiltrados.map((match) => (
            <EditalCard
              key={match.id}
              match={match}
              onGerarProposta={handleGerarProposta}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function EmptyState({ filtro }: { filtro: Filtro }) {
  return (
    <div className="text-center py-20">
      <div className="w-14 h-14 bg-slate-800 rounded-2xl flex items-center justify-center mx-auto mb-4">
        <svg className="w-7 h-7 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
      </div>
      <p className="text-slate-400 font-medium mb-1">
        {filtro === 'todos'
          ? 'Nenhum edital analisado ainda'
          : 'Nenhum edital neste filtro'}
      </p>
      <p className="text-slate-600 text-sm">
        {filtro === 'todos'
          ? 'A IA está processando os editais mais recentes do PNCP. Volte em breve.'
          : 'Tente mudar o filtro para ver outros editais.'}
      </p>
    </div>
  )
}
