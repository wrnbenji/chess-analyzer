import eco from '../openings/eco.json'

interface EcoEntry { eco: string; name: string; moves: string }

// Turn a raw PGN into a normalized "1. e4 e5 2. Nf3 ..." move string.
export function extractMoves(pgn: string): string {
  return pgn
    .replace(/\[[^\]]*\]/g, '')        // header tags
    .replace(/\{[^}]*\}/g, '')         // comments / clocks
    .replace(/\b(1-0|0-1|1\/2-1\/2|\*)\s*$/g, '') // result
    .replace(/\$\d+/g, '')             // NAGs
    .replace(/\s+/g, ' ')
    .trim()
}

// Count half-moves (plies) in a normalized move string, ignoring move numbers.
function countPlies(moveStr: string): number {
  return moveStr.split(/\s+/).filter((t) => t && !/^\d+\.(\.\.)?$/.test(t)).length
}

// How many opening half-moves the longest matching ECO line covers, so callers
// can mark those plies as "book" moves.
export function openingPlyCount(pgn: string): number {
  const moveStr = extractMoves(pgn)
  let bestLen = -1
  let bestPlies = 0
  for (const entry of eco as EcoEntry[]) {
    if (moveStr.startsWith(entry.moves) && entry.moves.length > bestLen) {
      bestLen = entry.moves.length
      bestPlies = countPlies(entry.moves)
    }
  }
  return bestPlies
}

export function identifyOpening(pgn: string): { eco: string; name: string } | null {
  const moveStr = extractMoves(pgn)
  let best: { eco: string; name: string } | null = null
  let bestLen = -1
  for (const entry of eco as EcoEntry[]) {
    if (moveStr.startsWith(entry.moves) && entry.moves.length > bestLen) {
      best = { eco: entry.eco, name: entry.name }
      bestLen = entry.moves.length
    }
  }
  return best
}
