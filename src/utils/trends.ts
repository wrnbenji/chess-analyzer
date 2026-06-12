import type { AnalyzedMove, Game, GamePhase, TacticalMotif } from '../types'
import { sideAccuracies } from './accuracy'

const ERROR_QUALITIES = new Set(['inaccuracy', 'mistake', 'blunder', 'miss'])

export interface AnalyzedGame {
  game: Game
  userColor: 'w' | 'b'
  opening: { eco: string; name: string } | null
  moves: AnalyzedMove[]
}

export interface TrendsReport {
  accuracySeries: Array<{ url: string; accuracy: number; won: boolean }>
  openings: Array<{ eco: string; name: string; games: number; wins: number; avgAccuracy: number }>
  errorsByPhase: Record<GamePhase, number>
  missedMotifs: Array<{ motif: TacticalMotif; count: number }>
  timePressure: { pressureErrors: number; totalErrors: number } | null
}

export function aggregateTrends(games: AnalyzedGame[]): TrendsReport {
  const accuracySeries = games.map(({ game, userColor, moves }) => {
    const acc = sideAccuracies(moves)
    return {
      url: game.url,
      accuracy: userColor === 'w' ? acc.white : acc.black,
      won: (userColor === 'w' ? game.white.result : game.black.result) === 'win',
    }
  })

  const byEco = new Map<string, { eco: string; name: string; games: number; wins: number; accSum: number }>()
  games.forEach(({ opening }, i) => {
    if (!opening) return
    const entry = byEco.get(opening.eco) ?? { ...opening, games: 0, wins: 0, accSum: 0 }
    entry.games++
    if (accuracySeries[i].won) entry.wins++
    entry.accSum += accuracySeries[i].accuracy
    byEco.set(opening.eco, entry)
  })
  const openings = [...byEco.values()]
    .map(({ accSum, ...rest }) => ({ ...rest, avgAccuracy: accSum / rest.games }))
    .sort((a, b) => b.games - a.games)

  const errorsByPhase: Record<GamePhase, number> = { opening: 0, middlegame: 0, endgame: 0 }
  const motifCounts = new Map<TacticalMotif, number>()
  let pressureErrors = 0
  let totalErrors = 0
  let anyClock = false
  for (const { userColor, moves } of games) {
    for (const m of moves) {
      if (m.color !== userColor) continue
      if (m.clockSeconds !== null) anyClock = true
      if (!ERROR_QUALITIES.has(m.quality)) continue
      errorsByPhase[m.phase]++
      totalErrors++
      if (m.clockSeconds !== null && m.clockSeconds < 30) pressureErrors++
      for (const motif of m.missedMotifs) {
        motifCounts.set(motif, (motifCounts.get(motif) ?? 0) + 1)
      }
    }
  }
  const missedMotifs = [...motifCounts.entries()]
    .map(([motif, count]) => ({ motif, count }))
    .sort((a, b) => b.count - a.count)

  return {
    accuracySeries,
    openings,
    errorsByPhase,
    missedMotifs,
    timePressure: anyClock ? { pressureErrors, totalErrors } : null,
  }
}
