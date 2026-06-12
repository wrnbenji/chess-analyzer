import type { AnalyzedMove, MoveQuality } from '../types'

export type PredictedQuality = MoveQuality | 'missing'

export interface ExpectedMoveLabel {
  ply: number
  expected: MoveQuality
  san?: string
}

export interface BenchmarkMismatch {
  ply: number
  san: string | null
  expected: MoveQuality
  predicted: PredictedQuality
}

export interface BenchmarkQualitySummary {
  total: number
  matches: number
}

export interface BenchmarkReport {
  total: number
  matches: number
  agreement: number
  mismatches: BenchmarkMismatch[]
  byExpected: Partial<Record<MoveQuality, BenchmarkQualitySummary>>
  confusion: Partial<Record<MoveQuality, Partial<Record<PredictedQuality, number>>>>
}

function incrementConfusion(
  confusion: BenchmarkReport['confusion'],
  expected: MoveQuality,
  predicted: PredictedQuality,
) {
  const row = confusion[expected] ?? {}
  row[predicted] = (row[predicted] ?? 0) + 1
  confusion[expected] = row
}

export function compareMoveLabels(
  predictedMoves: Pick<AnalyzedMove, 'san' | 'quality'>[],
  expectedLabels: ExpectedMoveLabel[],
): BenchmarkReport {
  let matches = 0
  const mismatches: BenchmarkMismatch[] = []
  const byExpected: BenchmarkReport['byExpected'] = {}
  const confusion: BenchmarkReport['confusion'] = {}

  for (const label of expectedLabels) {
    const predictedMove = predictedMoves[label.ply - 1]
    const predicted = predictedMove?.quality ?? 'missing'
    const san = label.san ?? predictedMove?.san ?? null
    const matched = predicted === label.expected

    const expectedSummary = byExpected[label.expected] ?? { total: 0, matches: 0 }
    expectedSummary.total += 1
    if (matched) {
      matches += 1
      expectedSummary.matches += 1
    } else {
      mismatches.push({ ply: label.ply, san, expected: label.expected, predicted })
    }
    byExpected[label.expected] = expectedSummary
    incrementConfusion(confusion, label.expected, predicted)
  }

  const total = expectedLabels.length
  return {
    total,
    matches,
    agreement: total === 0 ? 0 : matches / total,
    mismatches,
    byExpected,
    confusion,
  }
}

export function meetsAgreementTarget({ agreement }: Pick<BenchmarkReport, 'agreement'>, target = 0.8) {
  return agreement >= target
}
