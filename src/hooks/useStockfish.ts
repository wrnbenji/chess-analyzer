import { useEffect, useRef, useState } from 'react'
import { StockfishEngine } from '../engine/stockfish'
import type { Score, AnalyzedMove } from '../types'
import type { GameMove } from './useChessGame'
import { analyzeGamePositions } from '../utils/gameAnalysis'

export interface AnalyzeOptions {
  bookPlies?: number
  clocks?: number[]
  timeSpent?: number[]
  depth?: number
}

export function useStockfish() {
  const engineRef = useRef<StockfishEngine | null>(null)
  const mountedRef = useRef(true)
  // Bumped on every analyze() call; a stale run sees a newer value and bails.
  const generationRef = useRef(0)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [analyzed, setAnalyzed] = useState<AnalyzedMove[] | null>(null)
  const [scores, setScores] = useState<Score[]>([])

  useEffect(() => {
    mountedRef.current = true
    try {
      engineRef.current = new StockfishEngine()
      queueMicrotask(() => {
        if (mountedRef.current) setReady(true)
      })
    } catch {
      queueMicrotask(() => {
        if (mountedRef.current) setError('Failed to load the chess engine')
      })
    }
    return () => {
      mountedRef.current = false
      engineRef.current?.terminate()
    }
  }, [])

  // fens: [startFen, afterMove1, ...] aligned so fens[i] precedes moves[i].
  // opts carries book/clock context from the App (see utils/clock.ts).
  async function analyze(fens: string[], moves: GameMove[], opts: AnalyzeOptions = {}) {
    const engine = engineRef.current
    if (!engine) return
    // Supersede any in-flight analysis: drop its queue and invalidate its run.
    const generation = ++generationRef.current
    engine.reset()
    const isStale = () => generation !== generationRef.current || !mountedRef.current

    setError(null)
    setAnalyzed(null)
    setScores([])
    setProgress({ done: 0, total: fens.length })
    try {
      // MultiPV=3: best line + two alternatives — feeds the alternatives panel
      // and the trainer's "almost" grading.
      const out = await analyzeGamePositions(
        (fen) => engine.analyse(fen, { depth: opts.depth ?? 18, multipv: 3 }),
        fens,
        moves,
        {
          bookPlies: opts.bookPlies ?? 0,
          clocks: opts.clocks,
          timeSpent: opts.timeSpent,
          isStale,
          onProgress: (done, total) => setProgress({ done, total }),
        },
      )
      if (!out || isStale()) return
      setScores(out.scores)
      setAnalyzed(out.analyzed)
      return out
    } catch {
      if (!isStale()) {
        setError('Failed to load the chess engine')
        setAnalyzed(null)
      }
    }
  }

  return { ready, error, progress, analyzed, scores, analyze, engineRef }
}
