import { describe, it, expect } from 'vitest'
import { moveAccuracy, sideAccuracies } from './accuracy'
import type { AnalyzedMove } from '../types'

function move(color: 'w' | 'b', winBefore: number, winAfter: number): AnalyzedMove {
  return {
    san: 'x',
    color,
    fenAfter: '',
    toSquare: 'e4',
    quality: 'best',
    cpDrop: 0,
    winBefore,
    winAfter,
    winDrop: Math.max(0, winBefore - winAfter),
    explanation: '',
    bestMoveSan: null,
    bestLineSan: [],
    mateIn: null,
    isSacrifice: false,
    phase: 'middlegame',
    alternatives: [],
    motifs: [],
    missedMotifs: [],
    clockSeconds: null,
    timeSpent: null,
  }
}

describe('moveAccuracy', () => {
  it('is ~100 when no win% is lost', () => {
    expect(moveAccuracy(0)).toBeCloseTo(100, 0)
  })
  it('decreases as win% lost grows', () => {
    expect(moveAccuracy(5)).toBeGreaterThan(moveAccuracy(30))
  })
  it('stays within 0..100', () => {
    const v = moveAccuracy(100)
    expect(v).toBeGreaterThanOrEqual(0)
    expect(v).toBeLessThanOrEqual(100)
  })
})

describe('sideAccuracies', () => {
  it('is 100 for both sides with no moves', () => {
    expect(sideAccuracies([])).toEqual({ white: 100, black: 100 })
  })

  it('gives a near-perfect game high accuracy', () => {
    const moves = [
      move('w', 50, 50),
      move('b', 50, 50),
      move('w', 50, 49),
      move('b', 50, 50),
    ]
    const { white, black } = sideAccuracies(moves)
    expect(white).toBeGreaterThan(95)
    expect(black).toBeGreaterThan(95)
  })

  it('drops the side that blunders below the side that does not', () => {
    const moves = [
      move('w', 50, 50), // white fine
      move('b', 50, 20), // black blunders 30 win%
      move('w', 50, 50), // white fine
      move('b', 50, 48), // black ok
    ]
    const { white, black } = sideAccuracies(moves)
    expect(white).toBeGreaterThan(black)
    expect(black).toBeLessThan(80)
  })

  it('stays within 0..100', () => {
    const moves = [move('w', 90, 5), move('b', 95, 10)]
    const { white, black } = sideAccuracies(moves)
    for (const v of [white, black]) {
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(100)
    }
  })
})
