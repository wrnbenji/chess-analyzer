import type { AnalyzedMove } from '../types'

const PREFIX = 'chess-analyzer:review:'

// localStorage round-trip for analyzed games; quota/JSON failures degrade to
// "no cache" silently — the analysis just re-runs.
export function cacheKey(gameUrl: string, depth: number): string {
  return `${PREFIX}${gameUrl}:d${depth}`
}

export function readCachedMoves(gameUrl: string, depth: number): AnalyzedMove[] | null {
  try {
    const raw = localStorage.getItem(cacheKey(gameUrl, depth))
    return raw ? (JSON.parse(raw) as AnalyzedMove[]) : null
  } catch {
    return null
  }
}

export function writeCachedMoves(gameUrl: string, depth: number, moves: AnalyzedMove[]): void {
  try {
    localStorage.setItem(cacheKey(gameUrl, depth), JSON.stringify(moves))
  } catch {
    /* quota exceeded or storage disabled — memory-only this session */
  }
}
