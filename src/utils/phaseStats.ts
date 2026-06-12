import type { AnalyzedMove, GamePhase } from '../types'

const ERROR_QUALITIES = new Set(['inaccuracy', 'mistake', 'blunder', 'miss'])

export interface PhaseSideStats {
  moves: number
  errors: number
  totalWinDrop: number
}

export function phaseStats(
  moves: AnalyzedMove[],
  color: 'w' | 'b',
): Record<GamePhase, PhaseSideStats> {
  const out: Record<GamePhase, PhaseSideStats> = {
    opening: { moves: 0, errors: 0, totalWinDrop: 0 },
    middlegame: { moves: 0, errors: 0, totalWinDrop: 0 },
    endgame: { moves: 0, errors: 0, totalWinDrop: 0 },
  }
  for (const m of moves) {
    if (m.color !== color) continue
    const s = out[m.phase]
    s.moves++
    s.totalWinDrop += m.winDrop
    if (ERROR_QUALITIES.has(m.quality)) s.errors++
  }
  return out
}

export interface TimePressureStats {
  pressureMoves: number
  pressureErrors: number
  normalMoves: number
  normalErrors: number
}

// Errors under vs. above the clock threshold. Null when the game has no clocks.
export function timePressureStats(
  moves: AnalyzedMove[],
  color: 'w' | 'b',
  thresholdSeconds: number,
): TimePressureStats | null {
  const own = moves.filter((m) => m.color === color && m.clockSeconds !== null)
  if (own.length === 0) return null
  const stats: TimePressureStats = { pressureMoves: 0, pressureErrors: 0, normalMoves: 0, normalErrors: 0 }
  for (const m of own) {
    const isError = ERROR_QUALITIES.has(m.quality)
    if ((m.clockSeconds as number) < thresholdSeconds) {
      stats.pressureMoves++
      if (isError) stats.pressureErrors++
    } else {
      stats.normalMoves++
      if (isError) stats.normalErrors++
    }
  }
  return stats
}
