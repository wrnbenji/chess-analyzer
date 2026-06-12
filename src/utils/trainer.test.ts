import { describe, it, expect } from 'vitest'
import { buildPuzzles, gradeAttempt } from './trainer'
import type { AnalyzedMove } from '../types'

function mv(over: Partial<AnalyzedMove>): AnalyzedMove {
  return {
    san: 'e4', color: 'w', fenAfter: '', toSquare: 'e4', quality: 'good',
    cpDrop: 0, winBefore: 50, winAfter: 50, winDrop: 0, explanation: '',
    bestMoveSan: null, bestLineSan: [], mateIn: null, isSacrifice: false,
    phase: 'middlegame', alternatives: [], motifs: [], missedMotifs: [],
    clockSeconds: null, timeSpent: null,
    ...over,
  }
}

const FENS = ['fen0', 'fen1', 'fen2', 'fen3']

describe('buildPuzzles', () => {
  it('collects the chosen color mistakes with their pre-move FEN', () => {
    const moves = [
      mv({ quality: 'best' }),
      mv({ color: 'b', quality: 'blunder', bestMoveSan: 'Nf6', missedMotifs: ['fork'] }),
      mv({ quality: 'mistake', bestMoveSan: 'Qd5' }),
    ]
    const puzzles = buildPuzzles(moves, FENS, 'w')
    expect(puzzles).toHaveLength(1)
    expect(puzzles[0]).toMatchObject({ ply: 3, fen: 'fen2', bestSan: 'Qd5' })
  })
  it('skips mistakes without a known best move', () => {
    const moves = [mv({ quality: 'blunder', bestMoveSan: null })]
    expect(buildPuzzles(moves, FENS, 'w')).toHaveLength(0)
  })
})

describe('gradeAttempt', () => {
  const puzzle = {
    ply: 1, fen: 'fen0', color: 'w' as const, playedSan: 'h3', bestSan: 'Nc7+',
    missedMotifs: ['fork' as const],
    alternatives: [
      { san: 'Nc7+', lineSan: ['Nc7+'], score: { cp: 600 }, winPercent: 90 },
      { san: 'Kd2', lineSan: ['Kd2'], score: { cp: 80 }, winPercent: 87 },
      { san: 'Kf2', lineSan: ['Kf2'], score: { cp: 50 }, winPercent: 60 },
    ],
  }
  it('best move is correct', () => {
    expect(gradeAttempt(puzzle, 'Nc7+')).toBe('correct')
  })
  it('alternative within 5 win% is almost', () => {
    expect(gradeAttempt(puzzle, 'Kd2')).toBe('almost')
  })
  it('weaker alternative is wrong', () => {
    expect(gradeAttempt(puzzle, 'Kf2')).toBe('wrong')
  })
  it('random move is wrong', () => {
    expect(gradeAttempt(puzzle, 'a3')).toBe('wrong')
  })
  it('check/mate suffixes do not matter', () => {
    expect(gradeAttempt(puzzle, 'Nc7')).toBe('correct')
  })
})
