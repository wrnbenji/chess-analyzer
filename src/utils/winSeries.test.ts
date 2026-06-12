import { describe, it, expect } from 'vitest'
import { whiteWinSeries } from './winSeries'
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

describe('whiteWinSeries', () => {
  it('starts from the first move and flips black perspectives', () => {
    const moves = [
      mv({ color: 'w', winBefore: 52, winAfter: 55 }),
      mv({ color: 'b', winBefore: 45, winAfter: 40 }),
    ]
    // index 0: before move 0 (white view 52); 1: after move 0 (55);
    // 2: after move 1 (black 40 -> white 60).
    expect(whiteWinSeries(moves)).toEqual([52, 55, 60])
  })
  it('empty game gives empty series', () => {
    expect(whiteWinSeries([])).toEqual([])
  })
})
