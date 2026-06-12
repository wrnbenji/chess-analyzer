import { describe, expect, it } from 'vitest'
import { benchmarkReviewExport, formatBenchmarkReport } from './benchmark-review.mjs'

describe('benchmark-review script helpers', () => {
  it('benchmarks only moves that have expected labels', () => {
    const report = benchmarkReviewExport({
      moves: [
        { ply: 1, san: 'e4', predicted: 'book', expected: 'book' },
        { ply: 2, san: 'e5', predicted: 'best', expected: 'best' },
        { ply: 3, san: 'Nf3', predicted: 'excellent', expected: 'good' },
        { ply: 4, san: 'Nc6', predicted: 'best', expected: null },
      ],
    })

    expect(report.total).toBe(3)
    expect(report.matches).toBe(2)
    expect(report.agreement).toBeCloseTo(2 / 3, 5)
    expect(report.mismatches).toEqual([
      { ply: 3, san: 'Nf3', expected: 'good', predicted: 'excellent' },
    ])
  })

  it('formats the benchmark target status', () => {
    const text = formatBenchmarkReport({
      total: 3,
      matches: 2,
      agreement: 2 / 3,
      mismatches: [{ ply: 3, san: 'Nf3', expected: 'good', predicted: 'excellent' }],
    })

    expect(text).toContain('Agreement: 66.7% (2/3)')
    expect(text).toContain('Target: FAIL (<80.0%)')
    expect(text).toContain('3. Nf3: expected good, predicted excellent')
  })
})
