import { useRef, useState } from 'react'
import { Chess } from 'chess.js'
import type { Game } from '../types'
import type { StockfishEngine } from '../engine/stockfish'
import { analyzeGamePositions } from '../utils/gameAnalysis'
import { aggregateTrends, type AnalyzedGame, type TrendsReport } from '../utils/trends'
import { readCachedMoves, writeCachedMoves } from '../utils/trendsCache'
import { identifyOpening, openingPlyCount } from '../utils/opening'
import { extractClocks, parseTimeControl, computeTimeSpent } from '../utils/clock'

const TREND_DEPTH = 12 // shallower than single-game review to keep N games tractable

export interface TrendsProgress {
  game: number
  totalGames: number
  move: number
  totalMoves: number
}

export function useTrends(engineRef: React.RefObject<StockfishEngine | null>) {
  const [report, setReport] = useState<TrendsReport | null>(null)
  const [progress, setProgress] = useState<TrendsProgress | null>(null)
  const [error, setError] = useState<string | null>(null)
  const cancelRef = useRef(false)

  async function run(games: Game[], username: string) {
    const engine = engineRef.current
    if (!engine) return
    cancelRef.current = false
    setError(null)
    setReport(null)
    const analyzed: AnalyzedGame[] = []
    try {
      for (let g = 0; g < games.length; g++) {
        if (cancelRef.current) return
        const game = games[g]
        const userColor: 'w' | 'b' =
          game.white.username.toLowerCase() === username.toLowerCase() ? 'w' : 'b'
        const opening = identifyOpening(game.pgn)

        const cached = readCachedMoves(game.url, TREND_DEPTH)
        if (cached) {
          analyzed.push({ game, userColor, opening, moves: cached })
          setProgress({ game: g + 1, totalGames: games.length, move: 0, totalMoves: 0 })
          continue
        }

        const chess = new Chess()
        try {
          chess.loadPgn(game.pgn)
        } catch {
          continue // unparseable PGN (variants etc.) — skip the game
        }
        const verbose = chess.history({ verbose: true })
        const moves = verbose.map((m) => ({ san: m.san, color: m.color, fenAfter: m.after, to: m.to }))
        const fens = [new Chess().fen(), ...moves.map((m) => m.fenAfter)]
        const clocks = extractClocks(game.pgn)
        // Daily/unparseable time controls give no usable base time — skip timeSpent.
        const tc = parseTimeControl(game.time_control)
        const timeSpent = tc ? computeTimeSpent(clocks, tc.base, tc.inc) : []

        const out = await analyzeGamePositions(
          (fen) => engine.analyse(fen, { depth: TREND_DEPTH, multipv: 3 }),
          fens,
          moves,
          {
            bookPlies: openingPlyCount(game.pgn),
            clocks,
            timeSpent,
            isStale: () => cancelRef.current,
            onProgress: (done, total) =>
              setProgress({ game: g + 1, totalGames: games.length, move: done, totalMoves: total }),
          },
        )
        if (!out) return // cancelled
        writeCachedMoves(game.url, TREND_DEPTH, out.analyzed)
        analyzed.push({ game, userColor, opening, moves: out.analyzed })
      }
      setReport(aggregateTrends(analyzed))
    } catch {
      setError('Trend analysis failed')
    } finally {
      setProgress(null)
    }
  }

  function cancel() {
    cancelRef.current = true
    setProgress(null)
  }

  return { report, progress, error, run, cancel, clear: () => setReport(null) }
}
