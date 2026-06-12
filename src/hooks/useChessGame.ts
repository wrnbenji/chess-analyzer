import { useMemo, useState } from 'react'
import { Chess } from 'chess.js'

export interface GameMove {
  san: string
  color: 'w' | 'b'
  fenAfter: string
  to: string // destination square, e.g. 'e4'
}

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

export function useChessGame(pgn: string | null) {
  const { moves, fens } = useMemo(() => {
    if (!pgn) return { moves: [] as GameMove[], fens: [START_FEN] }
    const chess = new Chess()
    try {
      chess.loadPgn(pgn)
    } catch {
      return { moves: [] as GameMove[], fens: [START_FEN] }
    }
    const verbose = chess.history({ verbose: true })
    const moves: GameMove[] = verbose.map((m) => ({
      san: m.san,
      color: m.color,
      fenAfter: m.after,
      to: m.to,
    }))
    const fens = [START_FEN, ...moves.map((m) => m.fenAfter)]
    return { moves, fens }
  }, [pgn])

  // ply 0 = start; ply i (1..moves.length) = after move i.
  const [ply, setPly] = useState(0)
  const maxPly = moves.length

  const goTo = (p: number) => setPly(Math.max(0, Math.min(maxPly, p)))
  const next = () => goTo(ply + 1)
  const prev = () => goTo(ply - 1)
  const start = () => goTo(0)
  const end = () => goTo(maxPly)

  const currentFen = fens[Math.min(ply, fens.length - 1)] ?? START_FEN

  return { moves, fens, ply, maxPly, currentFen, goTo, next, prev, start, end }
}
