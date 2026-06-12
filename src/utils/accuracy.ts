import type { AnalyzedMove } from '../types'
import { whiteWinSeries } from './winSeries'

// Per-move accuracy from the win% the mover gave up. This is the CAPS-style
// curve Lichess uses (and which closely tracks Chess.com): 0 win% lost ≈ 100%,
// and accuracy falls off exponentially as the move bleeds win probability.
export function moveAccuracy(winDrop: number): number {
  const acc = 103.1668 * Math.exp(-0.04354 * Math.max(0, winDrop)) - 3.1669 + 1
  return Math.max(0, Math.min(100, acc))
}

function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length
}

// Harmonic mean punishes the worst moves harder than an arithmetic mean — a
// single blunder drags the whole game down, which matches how Chess.com scores.
function harmonicMean(xs: number[]): number {
  const safe = xs.map((x) => Math.max(x, 1e-3))
  return safe.length / safe.reduce((a, b) => a + 1 / b, 0)
}

function stdev(xs: number[]): number {
  if (xs.length === 0) return 0
  const m = mean(xs)
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)))
}

// Volatility weight per move: how sharp the position was around it. Lichess
// weights accuracy by local win% standard deviation so a careful move in a
// calm position counts less than the same move in a sharp one. One weight per
// move (the transition series[i] -> series[i+1]).
function volatilityWeights(series: number[]): number[] {
  const windowSize = Math.max(2, Math.min(8, Math.round(series.length / 10)))
  const weights: number[] = []
  for (let i = 0; i < series.length - 1; i++) {
    const start = Math.max(0, i - windowSize + 1)
    const window = series.slice(start, i + 2)
    // Floor so quiet stretches still contribute rather than zeroing out.
    weights.push(Math.max(stdev(window), 0.5))
  }
  return weights
}

function combineSide(accuracies: number[], weights: number[]): number {
  if (accuracies.length === 0) return 100
  const weightTotal = weights.reduce((a, b) => a + b, 0)
  const weighted =
    weightTotal > 0
      ? accuracies.reduce((s, a, i) => s + a * weights[i], 0) / weightTotal
      : mean(accuracies)
  const harmonic = harmonicMean(accuracies)
  // Average of the weighted and harmonic means — the blend Lichess settled on
  // to balance "typical move quality" against "punish the disasters".
  return Math.max(0, Math.min(100, (weighted + harmonic) / 2))
}

// Per-side game accuracy (0–100), computed the way Chess.com/Lichess do:
// win%-based per-move accuracy, blended via volatility-weighted and harmonic
// means over each side's own moves.
export function sideAccuracies(moves: AnalyzedMove[]): { white: number; black: number } {
  const series = whiteWinSeries(moves)
  const weights = volatilityWeights(series)

  const forColor = (color: 'w' | 'b') => {
    const accuracies: number[] = []
    const moveWeights: number[] = []
    moves.forEach((m, i) => {
      if (m.color !== color) return
      accuracies.push(moveAccuracy(m.winDrop))
      moveWeights.push(weights[i] ?? 1)
    })
    return combineSide(accuracies, moveWeights)
  }

  return { white: forColor('w'), black: forColor('b') }
}
