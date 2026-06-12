import type { AnalyzedMove } from '../types'

// White-perspective win% at every position, reconstructed from the move list.
// Index 0 is before move 0; index i+1 is after move i.
export function whiteWinSeries(moves: AnalyzedMove[]): number[] {
  if (moves.length === 0) return []
  const first = moves[0]
  const series = [first.color === 'w' ? first.winBefore : 100 - first.winBefore]
  for (const m of moves) {
    series.push(m.color === 'w' ? m.winAfter : 100 - m.winAfter)
  }
  return series
}
