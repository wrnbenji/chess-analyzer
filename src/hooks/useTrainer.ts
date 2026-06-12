import { useMemo, useState } from 'react'
import { Chess } from 'chess.js'
import type { AnalyzedMove } from '../types'
import { buildPuzzles, gradeAttempt, type Puzzle, type Grade } from '../utils/trainer'

export interface PuzzleResult {
  puzzle: Puzzle
  solved: boolean // correct or almost without reveal
  hintsUsed: number
}

// Drives training mode: a queue of the player's mistakes re-posed as puzzles.
export function useTrainer(moves: AnalyzedMove[] | null, fens: string[], color: 'w' | 'b') {
  const puzzles = useMemo(
    () => (moves ? buildPuzzles(moves, fens, color) : []),
    [moves, fens, color],
  )
  const [index, setIndex] = useState(0)
  const [hintLevel, setHintLevel] = useState(0) // 0 none, 1 motif, 2 piece, 3 reveal
  const [lastGrade, setLastGrade] = useState<Grade | null>(null)
  const [results, setResults] = useState<PuzzleResult[]>([])

  const current: Puzzle | null = puzzles[index] ?? null
  const done = puzzles.length > 0 && index >= puzzles.length

  // Translate a board move (from/to) into SAN at the puzzle position, grade it,
  // and record the result on success. Returns the grade ('wrong' for illegal).
  function attempt(from: string, to: string): Grade {
    if (!current) return 'wrong'
    let san: string
    try {
      const chess = new Chess(current.fen)
      san = chess.move({ from, to, promotion: 'q' }).san
    } catch {
      return 'wrong'
    }
    const grade = gradeAttempt(current, san)
    setLastGrade(grade)
    if (grade !== 'wrong') {
      setResults((r) => [...r, { puzzle: current, solved: hintLevel < 3, hintsUsed: hintLevel }])
    }
    return grade
  }

  function reveal() {
    if (!current) return
    setHintLevel(3)
    setLastGrade(null)
    setResults((r) => [...r, { puzzle: current, solved: false, hintsUsed: 3 }])
  }

  function next() {
    setIndex((i) => i + 1)
    setHintLevel(0)
    setLastGrade(null)
  }

  function restart() {
    setIndex(0)
    setHintLevel(0)
    setLastGrade(null)
    setResults([])
  }

  return {
    puzzles, current, index, done, results, lastGrade, hintLevel,
    attempt, reveal, next, restart,
    hint: () => setHintLevel((h) => Math.min(h + 1, 3)),
  }
}
