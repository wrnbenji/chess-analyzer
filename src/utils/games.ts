import type { Game } from '../types'

export type GameOutcome = 'win' | 'loss' | 'draw'

// Chess.com result codes that score ½–½; 'win' is a win, everything else loses.
const DRAW_RESULTS = new Set([
  'agreed',
  'repetition',
  'stalemate',
  'insufficient',
  '50move',
  'timevsinsufficient',
])

// Outcome from the searched player's perspective; null when they played neither side.
export function gameOutcome(game: Game, username: string): GameOutcome | null {
  const u = username.toLowerCase()
  const side =
    game.white.username.toLowerCase() === u
      ? game.white
      : game.black.username.toLowerCase() === u
        ? game.black
        : null
  if (!side) return null
  if (side.result === 'win') return 'win'
  return DRAW_RESULTS.has(side.result) ? 'draw' : 'loss'
}

export function byNewest(games: Game[]): Game[] {
  return [...games].sort((a, b) => b.end_time - a.end_time)
}

// "600" → "10 min", "180+2" → "3+2", "1/86400" → "daily" (correspondence games).
export function formatTimeControl(tc: string): string {
  if (tc.includes('/')) return 'daily'
  const [baseStr, inc] = tc.split('+')
  const base = Number(baseStr)
  if (!Number.isFinite(base) || base <= 0) return tc
  const mins = Math.round((base / 60) * 10) / 10
  return inc ? `${mins}+${inc}` : `${mins} min`
}
