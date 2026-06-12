import type { AnalyzedMove, GamePhase } from '../types'
import { phaseStats } from '../utils/phaseStats'

const PHASES: GamePhase[] = ['opening', 'middlegame', 'endgame']
const PHASE_LABEL: Record<GamePhase, string> = {
  opening: 'Opening', middlegame: 'Middlegame', endgame: 'Endgame',
}

export function PhasePanel({ moves, color }: { moves: AnalyzedMove[]; color: 'w' | 'b' }) {
  const stats = phaseStats(moves, color)
  const played = PHASES.filter((p) => stats[p].moves > 0)
  if (played.length < 2) return null // a single-phase game has nothing to compare
  const worst = played.reduce((a, b) =>
    stats[b].totalWinDrop / stats[b].moves > stats[a].totalWinDrop / stats[a].moves ? b : a,
  )
  const maxDrop = Math.max(...played.map((p) => stats[p].totalWinDrop), 1)
  return (
    <div className="card p-3 text-sm">
      <p className="mb-2 text-xs uppercase tracking-wider text-muted">
        By phase ({color === 'w' ? 'White' : 'Black'})
      </p>
      <div className="space-y-1.5">
        {played.map((p) => (
          <div key={p} className="flex items-center gap-2">
            <span className="w-24 shrink-0 text-xs text-muted">{PHASE_LABEL[p]}</span>
            <span className="relative h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
              <span
                className="absolute inset-y-0 left-0 rounded-full"
                style={{
                  width: `${(stats[p].totalWinDrop / maxDrop) * 100}%`,
                  backgroundColor: p === worst ? '#e07000' : 'var(--accent)',
                }}
              />
            </span>
            <span className="nums w-16 shrink-0 text-right text-xs text-muted">
              {stats[p].errors} err
            </span>
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-orange-300">
        Most win% was lost in the {PHASE_LABEL[worst].toLowerCase()}.
      </p>
    </div>
  )
}
