import type { AnalyzedMove } from '../types'
import { scoreToCp } from '../utils/eval'

function fmtScore(alt: AnalyzedMove['alternatives'][number]): string {
  if (alt.score.mate !== undefined) return `#${alt.score.mate}`
  const pawns = scoreToCp(alt.score) / 100
  return `${pawns >= 0 ? '+' : ''}${pawns.toFixed(1)}`
}

// Engine alternatives for the position about to be played. `move` is the
// AnalyzedMove whose fenBefore is on the board (i.e. analyzed[ply]).
export function AlternativesPanel({
  move,
  onPreview,
}: {
  move: AnalyzedMove
  onPreview?: (san: string | null) => void
}) {
  if (move.alternatives.length === 0) return null
  return (
    <div className="card p-3 text-sm">
      <p className="mb-2 text-xs uppercase tracking-wider text-muted">Engine lines</p>
      <ol className="space-y-1.5">
        {move.alternatives.map((alt, i) => (
          <li
            key={i}
            className="flex items-baseline gap-2 rounded px-1.5 py-0.5 hover:bg-surface-2"
            onMouseEnter={() => onPreview?.(alt.san)}
            onMouseLeave={() => onPreview?.(null)}
          >
            <span className="nums w-12 shrink-0 font-semibold text-accent">{fmtScore(alt)}</span>
            <span className="nums w-10 shrink-0 text-xs text-muted">{alt.winPercent.toFixed(0)}%</span>
            <span className="min-w-0 truncate font-mono text-xs text-ink">{alt.lineSan.join(' ')}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}
