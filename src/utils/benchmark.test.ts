import { describe, expect, it } from 'vitest'
import { compareMoveLabels, meetsAgreementTarget } from './benchmark'
import type { AnalyzedMove } from '../types'

function move(san: string, quality: AnalyzedMove['quality']): AnalyzedMove {
  return {
    san,
    color: 'w',
    fenAfter: '',
    toSquare: 'e4',
    quality,
    cpDrop: 0,
    winBefore: 50,
    winAfter: 50,
    winDrop: 0,
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

describe('compareMoveLabels', () => {
  it('measures exact agreement against Chess.com labels', () => {
    const report = compareMoveLabels(
      [move('e4', 'book'), move('e5', 'best'), move('Nf3', 'excellent')],
      [
        { ply: 1, san: 'e4', expected: 'book' },
        { ply: 2, san: 'e5', expected: 'best' },
        { ply: 3, san: 'Nf3', expected: 'good' },
      ],
    )

    expect(report.total).toBe(3)
    expect(report.matches).toBe(2)
    expect(report.agreement).toBeCloseTo(2 / 3, 5)
    expect(report.mismatches).toEqual([
      { ply: 3, san: 'Nf3', expected: 'good', predicted: 'excellent' },
    ])
    expect(report.byExpected.good).toEqual({ total: 1, matches: 0 })
    expect(report.confusion.good?.excellent).toBe(1)
  })

  it('counts missing predicted moves as mismatches', () => {
    const report = compareMoveLabels([move('e4', 'book')], [
      { ply: 1, san: 'e4', expected: 'book' },
      { ply: 2, san: 'e5', expected: 'best' },
    ])

    expect(report.matches).toBe(1)
    expect(report.mismatches[0]).toEqual({
      ply: 2,
      san: 'e5',
      expected: 'best',
      predicted: 'missing',
    })
    expect(report.confusion.best?.missing).toBe(1)
  })
})

describe('meetsAgreementTarget', () => {
  it('checks the configured target threshold', () => {
    expect(meetsAgreementTarget({ agreement: 0.8 })).toBe(true)
    expect(meetsAgreementTarget({ agreement: 0.799 })).toBe(false)
    expect(meetsAgreementTarget({ agreement: 0.75 }, 0.7)).toBe(true)
  })
})
