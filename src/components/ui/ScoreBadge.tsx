interface ScoreBadgeProps {
  score: number
  size?: 'sm' | 'md' | 'lg'
}

export function ScoreBadge({ score, size = 'md' }: ScoreBadgeProps) {
  const cor =
    score >= 80 ? 'text-green-400 bg-green-400/10 border-green-400/30' :
    score >= 60 ? 'text-yellow-400 bg-yellow-400/10 border-yellow-400/30' :
                  'text-slate-400 bg-slate-400/10 border-slate-400/20'

  const tamanho =
    size === 'lg' ? 'text-2xl font-bold px-4 py-2' :
    size === 'sm' ? 'text-xs font-semibold px-2 py-0.5' :
                    'text-sm font-semibold px-3 py-1'

  return (
    <span className={`inline-flex items-center gap-1 rounded-full border ${cor} ${tamanho}`}>
      {score >= 80 && <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />}
      {score}%
    </span>
  )
}
