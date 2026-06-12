import { describe, it, expect } from 'vitest'
import { phaseStats, timePressureStats } from './phaseStats'
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

describe('phaseStats', () => {
  it('aggregates win-drop and mistakes per phase for one side', () => {
    const moves = [
      mv({ phase: 'opening', winDrop: 0 }),
      mv({ phase: 'opening', color: 'b', winDrop: 2 }),
      mv({ phase: 'middlegame', winDrop: 15, quality: 'mistake' }),
      mv({ phase: 'middlegame', color: 'b', winDrop: 0 }),
      mv({ phase: 'endgame', winDrop: 30, quality: 'blunder' }),
    ]
    const s = phaseStats(moves, 'w')
    expect(s.opening.moves).toBe(1)
    expect(s.middlegame.errors).toBe(1)
    expect(s.endgame.errors).toBe(1)
    expect(s.endgame.totalWinDrop).toBe(30)
  })
})

describe('timePressureStats', () => {
  it('splits errors by clock pressure', () => {
    const moves = [
      mv({ clockSeconds: 200, quality: 'blunder', winDrop: 25 }),
      mv({ clockSeconds: 20, quality: 'blunder', winDrop: 25 }),
      mv({ clockSeconds: 15, quality: 'good' }),
    ]
    const s = timePressureStats(moves, 'w', 30)
    expect(s).not.toBeNull()
    expect(s!.pressureMoves).toBe(2)
    expect(s!.pressureErrors).toBe(1)
    expect(s!.normalErrors).toBe(1)
  })
  it('returns null without clock data', () => {
    expect(timePressureStats([mv({})], 'w', 30)).toBeNull()
  })
})
