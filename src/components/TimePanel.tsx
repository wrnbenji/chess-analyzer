import type { AnalyzedMove } from '../types'
import { timePressureStats } from '../utils/phaseStats'
import { QUALITY_COLOR } from '../utils/eval'

const PRESSURE_SECONDS = 30

export function TimePanel({ moves, color }: { moves: AnalyzedMove[]; color: 'w' | 'b' }) {
  const stats = timePressureStats(moves, color, PRESSURE_SECONDS)
  if (!stats) return null
  const own = moves.filter((m) => m.color === color && m.timeSpent !== null)
  if (own.length === 0) return null
  const maxSpent = Math.max(...own.map((m) => m.timeSpent as number), 1)
  return (
    <div className="card p-3 text-sm">
      <p className="mb-2 text-xs uppercase tracking-wider text-muted">
        Time use ({color === 'w' ? 'White' : 'Black'})
      </p>
      <div className="flex h-16 items-end gap-px">
        {own.map((m, i) => (
          <span
            key={i}
            className="min-w-[3px] flex-1 rounded-t"
            style={{
              height: `${((m.timeSpent as number) / maxSpent) * 100}%`,
              backgroundColor:
                m.quality === 'blunder' || m.quality === 'mistake'
                  ? QUALITY_COLOR[m.quality]
                  : 'var(--surface-2)',
            }}
            title={`${m.san}: ${(m.timeSpent as number).toFixed(0)}s`}
          />
        ))}
      </div>
      {stats.pressureMoves > 0 && (
        <p className="mt-2 text-xs text-orange-300">
          {stats.pressureErrors} of {stats.pressureErrors + stats.normalErrors} errors came with under{' '}
          {PRESSURE_SECONDS}s on the clock ({stats.pressureMoves} such moves).
        </p>
      )}
    </div>
  )
}
