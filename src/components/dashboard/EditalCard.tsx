'use client'

import { useState } from 'react'
import { ScoreBadge } from '@/components/ui/ScoreBadge'
import type { MatchEdital } from '@/types'

interface EditalCardProps {
  match: MatchEdital
  onGerarProposta: (matchId: string) => Promise<void>
}

function formatarValor(valor: number | null | undefined): string {
  if (!valor) return 'Não informado'
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatarData(data: string | null | undefined): string {
  if (!data) return '—'
  return new Date(data).toLocaleDateString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  })
}

export function EditalCard({ match, onGerarProposta }: EditalCardProps) {
  const [expandido, setExpandido] = useState(false)
  const [gerando, setGerando] = useState(false)

  const edital = match.editais_pncp
  const ehMatch = match.score >= 80

  async function handleGerarProposta() {
    setGerando(true)
    await onGerarProposta(match.id)
    setGerando(false)
  }

  return (
    <div
      className={`bg-slate-900 border rounded-xl overflow-hidden transition-colors ${
        ehMatch
          ? 'border-green-500/30 hover:border-green-500/50'
          : 'border-slate-800 hover:border-slate-700'
      }`}
    >
      {/* Header */}
      <div className="p-5">
        <div className="flex items-start justify-between gap-4 mb-3">
          <div className="flex-1 min-w-0">
            {/* Órgão */}
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs text-slate-500 bg-slate-800 px-2 py-0.5 rounded">
                {edital?.uf_orgao ?? '—'} · {edital?.modalidade ?? 'Pregão'}
              </span>
              {match.status === 'novo' && (
                <span className="text-xs text-blue-400 bg-blue-400/10 border border-blue-400/20 px-2 py-0.5 rounded">
                  Novo
                </span>
              )}
            </div>
            <p className="text-slate-300 text-xs mb-2 truncate">{edital?.nome_orgao}</p>
            {/* Objeto */}
            <p className="text-white text-sm font-medium leading-snug line-clamp-2">
              {edital?.objeto}
            </p>
          </div>
          <ScoreBadge score={match.score} size="md" />
        </div>

        {/* Metadados */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-3">
          <div className="text-xs text-slate-500">
            Valor estimado:{' '}
            <span className="text-slate-300">{formatarValor(edital?.valor_estimado)}</span>
          </div>
          <div className="text-xs text-slate-500">
            Encerra em:{' '}
            <span className="text-slate-300">{formatarData(edital?.data_encerramento)}</span>
          </div>
        </div>
      </div>

      {/* Justificativa da IA */}
      <div className="px-5 pb-4">
        <p className="text-slate-400 text-xs italic leading-relaxed">
          &ldquo;{match.justificativa}&rdquo;
        </p>
      </div>

      {/* Expansível: pontos fortes e riscos */}
      {expandido && (
        <div className="px-5 pb-4 border-t border-slate-800 pt-4 grid grid-cols-2 gap-4">
          <div>
            <p className="text-green-400 text-xs font-semibold mb-2">Pontos fortes</p>
            <ul className="space-y-1">
              {match.pontos_fortes?.map((p, i) => (
                <li key={i} className="text-xs text-slate-300 flex gap-1.5">
                  <span className="text-green-400 mt-0.5 shrink-0">✓</span>
                  {p}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-yellow-400 text-xs font-semibold mb-2">Atenção</p>
            <ul className="space-y-1">
              {match.riscos?.map((r, i) => (
                <li key={i} className="text-xs text-slate-300 flex gap-1.5">
                  <span className="text-yellow-400 mt-0.5 shrink-0">!</span>
                  {r}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Footer: ações */}
      <div className="px-5 py-3 bg-slate-800/50 border-t border-slate-800 flex items-center justify-between gap-3">
        <div className="flex gap-2">
          <button
            onClick={() => setExpandido((p) => !p)}
            className="text-xs text-slate-400 hover:text-slate-200 transition-colors"
          >
            {expandido ? 'Ver menos ↑' : 'Ver análise ↓'}
          </button>
          {edital?.link_sistema_origem && (
            <a
              href={edital.link_sistema_origem}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
            >
              Abrir no PNCP ↗
            </a>
          )}
        </div>

        {ehMatch && (
          <button
            onClick={handleGerarProposta}
            disabled={gerando || match.status === 'proposta_gerada'}
            className="bg-green-600 hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-semibold px-4 py-1.5 rounded-lg transition-colors whitespace-nowrap"
          >
            {gerando
              ? 'Gerando...'
              : match.status === 'proposta_gerada'
              ? 'Proposta gerada ✓'
              : 'Gerar Esboço de Proposta'}
          </button>
        )}
      </div>
    </div>
  )
}
