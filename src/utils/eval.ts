import type { Score, MoveQuality } from '../types'
import { cpToWinPercent } from './winChance'

const MATE_BASE = 100000

export function scoreToCp(score: Score): number {
  if (score.mate !== undefined) {
    return score.mate > 0
      ? MATE_BASE - score.mate * 100
      : -MATE_BASE - score.mate * 100
  }
  if (score.cp !== undefined) return score.cp
  return 0
}

// before: from mover's perspective. after: from opponent's perspective (engine convention).
// Mover's value after = -scoreToCp(after). Drop = cpBefore - moverValueAfter.
export function computeDrop(before: Score, after: Score): number {
  const cpBefore = scoreToCp(before)
  const moverValueAfter = -scoreToCp(after)
  const drop = cpBefore - moverValueAfter
  return Math.max(0, drop)
}

// Win probability (0–100) for the side to move at this evaluation.
export function winChance(score: Score): number {
  return cpToWinPercent(scoreToCp(score))
}

// Win% the mover gave up. before: mover's perspective; after: opponent's
// perspective (the engine flips sides after the move), so the mover's win%
// after the move is 100 - winChance(after).
export function computeWinDrop(before: Score, after: Score): number {
  const winBefore = winChance(before)
  const moverWinAfter = 100 - winChance(after)
  return Math.max(0, winBefore - moverWinAfter)
}

// Expected-points loss on a 0..1 scale. Chess.com Classification V2 documents
// its core move buckets in expected points, not raw centipawns.
export function computeExpectedPointLoss(before: Score, after: Score): number {
  return computeWinDrop(before, after) / 100
}

export function classifyExpectedPointLoss(loss: number): MoveQuality {
  const epLoss = Math.max(0, loss)
  if (epLoss === 0) return 'best'
  if (epLoss < 0.02) return 'excellent'
  if (epLoss < 0.05) return 'good'
  if (epLoss < 0.10) return 'inaccuracy'
  if (epLoss < 0.20) return 'mistake'
  return 'blunder'
}

// Compatibility helper for callers that already store loss as win percentage
// points instead of expected points.
export function classifyWinDrop(winDrop: number): MoveQuality {
  return classifyExpectedPointLoss(winDrop / 100)
}

export const QUALITY_COLOR: Record<MoveQuality, string> = {
  brilliant: '#1baca6',
  great: '#5c8bb0',
  best: '#5c8a3c',
  excellent: '#6aa84f',
  good: '#7fa650',
  book: '#a88865',
  inaccuracy: '#f0c040',
  mistake: '#e07000',
  miss: '#d2691e',
  blunder: '#cc3333',
}

export const QUALITY_SYMBOL: Record<MoveQuality, string> = {
  brilliant: '!!',
  great: '!',
  best: '★',
  excellent: '✓',
  good: '',
  book: '📖',
  inaccuracy: '?!',
  mistake: '?',
  miss: '✗',
  blunder: '??',
}

export const QUALITY_LABEL: Record<MoveQuality, string> = {
  brilliant: 'Brilliant',
  great: 'Great move',
  best: 'Best move',
  excellent: 'Excellent',
  good: 'Good',
  book: 'Book',
  inaccuracy: 'Inaccuracy',
  mistake: 'Mistake',
  miss: 'Miss',
  blunder: 'Blunder',
}
