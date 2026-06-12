export type GamePhase = 'opening' | 'middlegame' | 'endgame'

const PIECE_POINTS: Record<string, number> = { n: 3, b: 3, r: 5, q: 9 }

// Endgame threshold: each side's non-pawn material at or below this (13 =
// e.g. R+B+B or Q+N) — the conventional "queens traded or simplified" cutoff.
const ENDGAME_MATERIAL = 13
// Opening can't stretch past this many plies even if development is slow.
const OPENING_MAX_PLY = 24
// Minor pieces still sitting on their home squares; 3+ total means the
// position is still in the development stage.
const UNDEVELOPED_MINORS_FOR_OPENING = 3
const MINOR_HOME: Array<[string, string]> = [
  // [square, piece-char as it appears in FEN board text]
  ['b1', 'N'], ['g1', 'N'], ['c1', 'B'], ['f1', 'B'],
  ['b8', 'n'], ['g8', 'n'], ['c8', 'b'], ['f8', 'b'],
]

// Parse the FEN board field into a square -> piece-char lookup.
function boardMap(fen: string): Map<string, string> {
  const map = new Map<string, string>()
  const rows = fen.split(' ')[0].split('/')
  for (let r = 0; r < 8; r++) {
    let file = 0
    for (const ch of rows[r]) {
      if (/\d/.test(ch)) {
        file += parseInt(ch, 10)
      } else {
        map.set(String.fromCharCode(97 + file) + String(8 - r), ch)
        file++
      }
    }
  }
  return map
}

function nonPawnMaterial(fen: string): { white: number; black: number; queens: number } {
  let white = 0
  let black = 0
  let queens = 0
  for (const ch of fen.split(' ')[0]) {
    const pts = PIECE_POINTS[ch.toLowerCase()]
    if (pts === undefined) continue
    if (ch.toLowerCase() === 'q') queens++
    if (ch === ch.toUpperCase()) white += pts
    else black += pts
  }
  return { white, black, queens }
}

export function phaseOfPosition(fen: string, ply: number, bookPlies: number): GamePhase {
  const { white, black, queens } = nonPawnMaterial(fen)
  if (queens === 0 || (white <= ENDGAME_MATERIAL && black <= ENDGAME_MATERIAL)) {
    return 'endgame'
  }
  if (ply < bookPlies) return 'opening'
  if (ply < OPENING_MAX_PLY) {
    const board = boardMap(fen)
    const undeveloped = MINOR_HOME.filter(([sq, piece]) => board.get(sq) === piece).length
    if (undeveloped >= UNDEVELOPED_MINORS_FOR_OPENING) return 'opening'
  }
  return 'middlegame'
}

// Group ply indices by their phase, for per-phase aggregation.
export function splitByPhase(phases: GamePhase[]): Record<GamePhase, number[]> {
  const out: Record<GamePhase, number[]> = { opening: [], middlegame: [], endgame: [] }
  phases.forEach((p, i) => out[p].push(i))
  return out
}
