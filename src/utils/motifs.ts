import { Chess, type Square, type Color, type PieceSymbol } from 'chess.js'

export type TacticalMotif =
  | 'fork'
  | 'pin'
  | 'skewer'
  | 'discovered-attack'
  | 'double-check'
  | 'hanging-piece'
  | 'back-rank'
  | 'mate-threat'
  | 'trapped-piece'
  | 'sacrifice'
  | 'promotion'

const VALUE: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 }

interface PieceOnSquare {
  square: Square
  type: PieceSymbol
  color: Color
}

function piecesOf(chess: Chess, color: Color): PieceOnSquare[] {
  const out: PieceOnSquare[] = []
  for (const row of chess.board()) {
    for (const cell of row) {
      if (cell && cell.color === color) {
        out.push({ square: cell.square, type: cell.type, color: cell.color })
      }
    }
  }
  return out
}

function isDefended(chess: Chess, square: Square, by: Color): boolean {
  return chess.attackers(square, by).length > 0
}

function kingSquare(chess: Chess, color: Color): Square {
  return piecesOf(chess, color).find((p) => p.type === 'k')!.square
}

// Fork: the moved piece attacks 2+ enemy pieces where each target is either
// the king (always a real threat) or more valuable / undefended (real threat).
// Note: fires even when the forking piece is itself capturable — a "losing fork"
// still shows the shape and is worth surfacing to the player.
function detectFork(chess: Chess, to: Square, mover: Color, movedType: PieceSymbol): boolean {
  const enemy: Color = mover === 'w' ? 'b' : 'w'
  const threats = piecesOf(chess, enemy).filter((p) => {
    if (!chess.attackers(p.square, mover).includes(to)) return false
    if (p.type === 'k') return true
    return VALUE[p.type] > VALUE[movedType] || !isDefended(chess, p.square, enemy)
  })
  return threats.length >= 2
}

// Hanging piece: the move leaves an enemy piece (not pawn/king) attacked and
// completely undefended — and it wasn't already hanging before the move, so
// the badge marks the move that created the threat, not every move after it.
function detectHanging(chess: Chess, mover: Color, fenBefore: string): boolean {
  const before = new Chess(fenBefore)
  const enemy: Color = mover === 'w' ? 'b' : 'w'
  return piecesOf(chess, enemy).some((p) => {
    if (p.type === 'k' || p.type === 'p') return false
    const hangingNow =
      chess.attackers(p.square, mover).length > 0 && !isDefended(chess, p.square, enemy)
    if (!hangingNow) return false
    const hangingBefore =
      before.attackers(p.square, mover).length > 0 && !isDefended(before, p.square, enemy)
    return !hangingBefore
  })
}

// ── Ray-based helpers ─────────────────────────────────────────────────────────

const RAY_DIRS: Record<'b' | 'r' | 'q', Array<[number, number]>> = {
  b: [[1, 1], [1, -1], [-1, 1], [-1, -1]],
  r: [[1, 0], [-1, 0], [0, 1], [0, -1]],
  q: [[1, 1], [1, -1], [-1, 1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]],
}

function sq(file: number, rank: number): Square | null {
  if (file < 0 || file > 7 || rank < 0 || rank > 7) return null
  return (String.fromCharCode(97 + file) + String(rank + 1)) as Square
}

function fileOf(s: Square): number {
  return s.charCodeAt(0) - 97
}
function rankOf(s: Square): number {
  return parseInt(s[1], 10) - 1
}

// Walk each ray from a sliding piece; report the first two enemy pieces hit
// (with nothing of ours in between) — the raw material for pin/skewer calls.
function rayPairs(
  chess: Chess,
  from: Square,
  type: 'b' | 'r' | 'q',
  mover: Color,
): Array<{ front: PieceOnSquare; back: PieceOnSquare }> {
  const pairs: Array<{ front: PieceOnSquare; back: PieceOnSquare }> = []
  for (const [df, dr] of RAY_DIRS[type]) {
    let f = fileOf(from) + df
    let r = rankOf(from) + dr
    let front: PieceOnSquare | null = null
    while (true) {
      const s = sq(f, r)
      if (!s) break
      const piece = chess.get(s)
      if (piece) {
        if (piece.color === mover) break // own piece blocks the ray
        const found: PieceOnSquare = { square: s, type: piece.type, color: piece.color }
        if (!front) {
          front = found
        } else {
          pairs.push({ front, back: found })
          break
        }
      }
      f += df
      r += dr
    }
  }
  return pairs
}

// Walk each ray from a sliding piece; return the first enemy piece hit per ray.
function rayFirstEnemy(
  chess: Chess,
  from: Square,
  type: 'b' | 'r' | 'q',
  mover: Color,
): Array<{ target: PieceOnSquare; through: Square[] }> {
  const results: Array<{ target: PieceOnSquare; through: Square[] }> = []
  for (const [df, dr] of RAY_DIRS[type]) {
    let f = fileOf(from) + df
    let r = rankOf(from) + dr
    const through: Square[] = []
    while (true) {
      const s = sq(f, r)
      if (!s) break
      const piece = chess.get(s)
      if (piece) {
        if (piece.color !== mover) {
          results.push({
            target: { square: s, type: piece.type, color: piece.color },
            through,
          })
        }
        break // own piece also stops the ray
      }
      through.push(s)
      f += df
      r += dr
    }
  }
  return results
}

// Pin: front piece shields a MORE valuable one behind it (it can't move away).
// Skewer: front piece is MORE valuable and will move, exposing the one behind.
function detectPinSkewer(
  chess: Chess,
  to: Square,
  movedType: PieceSymbol,
  mover: Color,
): TacticalMotif[] {
  if (movedType !== 'b' && movedType !== 'r' && movedType !== 'q') return []
  // A slider that lands en-prise (attacked by enemy and undefended) creates no real
  // pin/skewer — it will simply be captured, so the "threat" is noise.
  const enemy: Color = mover === 'w' ? 'b' : 'w'
  if (chess.attackers(to, enemy).length > 0 && !isDefended(chess, to, mover)) return []
  const out: TacticalMotif[] = []
  for (const { front, back } of rayPairs(chess, to, movedType, mover)) {
    const frontV = VALUE[front.type]
    const backV = VALUE[back.type]
    // Absolute pin (king behind) or a relative pin against a major piece —
    // pawn-shields-knight style "pins" are noise, not motifs worth a badge.
    if (front.type !== 'k' && (back.type === 'k' || (backV > frontV && backV >= 5))) out.push('pin')
    else if (front.type === 'k' || (frontV > backV && frontV >= 5)) out.push('skewer')
  }
  return [...new Set(out)]
}

// Discovered attack: after the move, a mover-side sliding piece attacks a
// valuable enemy piece (or king) along a ray that passes through the vacated
// square (`from`). Uses rayFirstEnemy so it fires even when the target is the
// only enemy piece on that ray (no second piece needed).
function detectDiscovered(chess: Chess, from: Square, to: Square, mover: Color): boolean {
  for (const piece of piecesOf(chess, mover)) {
    if (piece.square === to) continue // skip the piece that just moved
    if (piece.type !== 'b' && piece.type !== 'r' && piece.type !== 'q') continue
    for (const { target, through } of rayFirstEnemy(chess, piece.square, piece.type, mover)) {
      if (target.type !== 'k' && VALUE[target.type] < 5) continue // skip pawns, knights, bishops (VALUE < 5); rooks, queens and the king are worth a discovered hit
      // After the move `from` is empty; if the ray passes through it, it appears in `through`.
      // That means the moved piece was blocking this attack before — discovered attack!
      if (through.includes(from)) return true
    }
  }
  return false
}

// Trapped piece: an enemy piece (minor or better) is attacked, undefended, and
// every legal move it has lands on a mover-attacked square — nowhere safe.
function detectTrapped(chess: Chess, mover: Color): boolean {
  const enemy: Color = mover === 'w' ? 'b' : 'w'
  // It's the enemy's turn after our move, so chess.moves() generates their moves.
  for (const p of piecesOf(chess, enemy)) {
    if (p.type === 'k' || p.type === 'p') continue
    if (chess.attackers(p.square, mover).length === 0) continue
    if (isDefended(chess, p.square, enemy)) continue // intentionally skip defended pieces — defended-but-trapped is a known false-negative; skipping keeps badge noise low
    const escapes = chess.moves({ square: p.square, verbose: true })
    if (escapes.length === 0) continue // can't move (might be pinned) — skip, the pin/hanging motifs cover it
    const allUnsafe = escapes.every((m) => chess.attackers(m.to as Square, mover).length > 0)
    if (allUnsafe) return true
  }
  return false
}

export function detectMotifs(fenBefore: string, san: string): TacticalMotif[] {
  const chess = new Chess(fenBefore)
  let move
  try {
    move = chess.move(san)
  } catch {
    return []
  }
  const mover = move.color
  const enemy: Color = mover === 'w' ? 'b' : 'w'
  const motifs: TacticalMotif[] = []

  if (move.isPromotion()) motifs.push('promotion')

  if (chess.inCheck()) {
    const checkers = chess.attackers(kingSquare(chess, enemy), mover)
    if (checkers.length >= 2) motifs.push('double-check')
  }

  if (detectFork(chess, move.to as Square, mover, move.piece)) motifs.push('fork')
  if (detectHanging(chess, mover, fenBefore)) motifs.push('hanging-piece')

  motifs.push(...detectPinSkewer(chess, move.to as Square, move.piece, mover))
  if (detectDiscovered(chess, move.from as Square, move.to as Square, mover)) {
    motifs.push('discovered-attack')
  }
  if (chess.isCheckmate()) {
    const ksq = kingSquare(chess, enemy)
    const backRank = enemy === 'w' ? '1' : '8'
    if (ksq[1] === backRank) motifs.push('back-rank')
  }
  if (detectTrapped(chess, mover)) motifs.push('trapped-piece')

  return [...new Set(motifs)]
}
