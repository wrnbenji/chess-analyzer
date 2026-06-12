import type { AnalyzedMove, AltMove, TacticalMotif } from '../types'

const PUZZLE_QUALITIES = new Set(['miss', 'mistake', 'blunder'])
// An alternative this close to the best line (win%) earns an "almost".
const ALMOST_WIN_GAP = 5

export interface Puzzle {
  ply: number // 1-based ply of the mistake (board shows fens[ply - 1])
  fen: string // position before the mistake — the one to solve
  color: 'w' | 'b'
  playedSan: string
  bestSan: string
  missedMotifs: TacticalMotif[]
  alternatives: AltMove[]
}

export type Grade = 'correct' | 'almost' | 'wrong'

function normalize(san: string): string {
  return san.replace(/[+#!?]/g, '')
}

// fens[i] is the position BEFORE moves[i] (the useChessGame convention).
export function buildPuzzles(moves: AnalyzedMove[], fens: string[], color: 'w' | 'b'): Puzzle[] {
  return moves.flatMap((m, i) => {
    if (m.color !== color || !PUZZLE_QUALITIES.has(m.quality) || !m.bestMoveSan) return []
    return [{
      ply: i + 1,
      fen: fens[i],
      color: m.color,
      playedSan: m.san,
      bestSan: m.bestMoveSan,
      missedMotifs: m.missedMotifs,
      alternatives: m.alternatives,
    }]
  })
}

export function gradeAttempt(puzzle: Puzzle, attemptSan: string): Grade {
  const attempt = normalize(attemptSan)
  if (attempt === normalize(puzzle.bestSan)) return 'correct'
  const best = puzzle.alternatives[0]
  const alt = puzzle.alternatives.find((a) => normalize(a.san) === attempt)
  if (alt && best && best.winPercent - alt.winPercent <= ALMOST_WIN_GAP) return 'almost'
  return 'wrong'
}
