import type { AnalyzedMove, TacticalMotif } from '../types'
import { QUALITY_COLOR, QUALITY_LABEL } from '../utils/eval'
import { MOTIF_LABEL } from '../utils/analysis'
import { QualityBadge } from './QualityBadge'

const MOTIF_ICON: Record<TacticalMotif, string> = {
  fork: '🍴', pin: '📌', skewer: '🍢', 'discovered-attack': '🎭',
  'double-check': '⚡', 'hanging-piece': '🎯', 'back-rank': '🏰',
  'mate-threat': '☠️', 'trapped-piece': '🕸️', sacrifice: '💥', promotion: '👑',
}

// "a fork" -> "fork" for badge text.
function motifBadgeText(m: TacticalMotif): string {
  return MOTIF_LABEL[m].replace(/^a /, '')
}

function fmtClock(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

export function MoveInsight({ move, moveNumber }: { move: AnalyzedMove; moveNumber: number }) {
  const color = QUALITY_COLOR[move.quality]
  const moverLabel = move.color === 'w' ? `${moveNumber}.` : `${moveNumber}...`
  return (
    <div className="rounded-lg border-l-4 bg-surface-2 p-3 text-sm" style={{ borderColor: color }}>
      <div className="flex flex-wrap items-center gap-2">
        <QualityBadge quality={move.quality} size={24} />
        <span className="font-semibold" style={{ color }}>
          {QUALITY_LABEL[move.quality]}
        </span>
        <span className="text-ink">
          {moverLabel} {move.san}
        </span>
        {move.isSacrifice && (
          <span className="rounded bg-teal-900/40 px-1.5 py-0.5 text-xs text-teal-300">sacrifice</span>
        )}
        {move.mateIn !== null && (
          <span className="rounded bg-red-900/40 px-1.5 py-0.5 text-xs text-red-300">mate in {move.mateIn}</span>
        )}
        {move.motifs.map((m) => (
          <span key={m} className="rounded bg-surface px-1.5 py-0.5 text-xs text-accent">
            {MOTIF_ICON[m]} {motifBadgeText(m)}
          </span>
        ))}
      </div>
      <p className="mt-1 text-ink">{move.explanation}</p>
      {move.missedMotifs.length > 0 && (
        <p className="mt-1 rounded bg-red-900/30 px-2 py-1 text-xs text-red-300">
          Missed: {move.missedMotifs.map((m) => `${MOTIF_ICON[m]} ${motifBadgeText(m)}`).join(', ')}
          {move.bestMoveSan ? ` — ${move.bestMoveSan} was the way.` : ''}
        </p>
      )}
      <div className="mt-1 text-xs text-muted">
        Win chance: <span className="font-semibold">{move.winBefore.toFixed(0)}%</span> →{' '}
        <span className="font-semibold">{move.winAfter.toFixed(0)}%</span>
        {move.winDrop >= 1 && <span className="text-red-400"> (−{move.winDrop.toFixed(0)}%)</span>}
      </div>
      {move.bestLineSan.length > 0 && (
        <div className="mt-1 text-xs text-muted">
          Engine line: <span className="font-mono">{move.bestLineSan.join(' ')}</span>
        </div>
      )}
      {move.timeSpent !== null && move.clockSeconds !== null && (
        <div className="mt-1 text-xs text-muted">
          Thought for <span className="nums font-semibold">{move.timeSpent.toFixed(0)}s</span> · clock{' '}
          <span className="nums font-semibold">{fmtClock(move.clockSeconds)}</span>
          {move.clockSeconds < 30 && <span className="text-orange-400"> · time pressure</span>}
        </div>
      )}
    </div>
  )
}
