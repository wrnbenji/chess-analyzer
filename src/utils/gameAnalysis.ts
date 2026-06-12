import type { AnalyzedMove, EngineResult, Score } from '../types'
import type { GameMove } from '../hooks/useChessGame'
import { analyzeMove } from './analysis'
import { phaseOfPosition } from './phase'

// One engine call: analyse a FEN, return the MultiPV result. Abstracted so
// tests (and future engines) can swap in a fake.
export type PositionAnalyser = (fen: string) => Promise<EngineResult>

export interface GameAnalysisOptions {
  bookPlies?: number
  clocks?: number[] // remaining seconds after each ply ([] / missing = unknown)
  timeSpent?: number[]
  onProgress?: (done: number, total: number) => void
  isStale?: () => boolean // checked after each position; true aborts (returns null)
}

export interface GameAnalysisResult {
  analyzed: AnalyzedMove[]
  scores: Score[] // per position, side-to-move perspective
}

// The engine-driven game loop shared by single-game review (useStockfish) and
// multi-game trends (useTrends). fens[i] precedes moves[i].
export async function analyzeGamePositions(
  analyse: PositionAnalyser,
  fens: string[],
  moves: GameMove[],
  { bookPlies = 0, clocks = [], timeSpent = [], onProgress, isStale }: GameAnalysisOptions,
): Promise<GameAnalysisResult | null> {
  const results: EngineResult[] = []
  for (let i = 0; i < fens.length; i++) {
    const result = await analyse(fens[i])
    if (isStale?.()) return null
    results.push(result)
    onProgress?.(i + 1, fens.length)
  }
  const scores: Score[] = results.map((r) => r.lines[0]?.score ?? {})
  const analyzed: AnalyzedMove[] = moves.map((m, i) => {
    const analysis = analyzeMove({
      fenBefore: fens[i],
      playedSan: m.san,
      moverColor: m.color,
      resultBefore: results[i],
      resultAfter: results[i + 1] ?? results[i],
      isBook: i < bookPlies,
    })
    return {
      san: m.san,
      color: m.color,
      fenAfter: m.fenAfter,
      toSquare: m.to,
      phase: phaseOfPosition(fens[i], i, bookPlies),
      clockSeconds: clocks[i] ?? null,
      timeSpent: timeSpent[i] ?? null,
      ...analysis,
    }
  })
  return { analyzed, scores }
}
