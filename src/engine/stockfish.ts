import type { Score, EngineResult, EngineLine } from '../types'
import { parseScore, parseInfo, isBestMove, type InfoLine } from './uci'

interface QueueItem {
  fen: string
  depth: number
  multipv: number
  resolve: (result: EngineResult) => void
  reject: (error: Error) => void
}

type WorkerFactory = (url: string) => Worker

// Safety net: if the engine never emits `bestmove` (bad FEN, init failure),
// resolve with whatever lines we last saw so the analysis loop can't hang.
const EVAL_TIMEOUT_MS = 15000

function resultFromInfos(infos: Map<number, InfoLine>): EngineResult {
  const lines: EngineLine[] = [...infos.values()]
    .sort((a, b) => a.multipv - b.multipv)
    .map((info) => ({ score: info.score, pv: info.pv }))
  return { lines }
}

export class StockfishEngine {
  private worker: Worker
  private readonly url: string
  private readonly createWorker: WorkerFactory
  private queue: QueueItem[] = []
  private busy = false
  private current: QueueItem | null = null
  private infos: Map<number, InfoLine> = new Map()
  private lastScore: Score = {}
  private currentMultipv = 1
  private timer: ReturnType<typeof setTimeout> | null = null
  // True between posting `go` and receiving its `bestmove`. The single-threaded
  // WASM build traps ('unreachable') if a second `go` lands while a search is
  // live, so nothing may start until the previous search has reported.
  private searching = false
  // The current item was resolved early (reset or timeout) while its search was
  // still running: hold all queued work until the orphaned `bestmove` arrives.
  private draining = false

  constructor(url = '/stockfish/stockfish-18-lite-single.js', createWorker: WorkerFactory = (workerUrl) => new Worker(workerUrl)) {
    this.url = url
    this.createWorker = createWorker
    this.worker = this.spawn()
  }

  private spawn(): Worker {
    const worker = this.createWorker(this.url)
    worker.onmessage = (e: MessageEvent) => this.onMessage(String(e.data))
    worker.onerror = (e: ErrorEvent) => this.onWorkerError(new Error(e.message || 'Stockfish worker failed'))
    worker.postMessage('uci')
    worker.postMessage('isready')
    return worker
  }

  private post(cmd: string) {
    this.worker.postMessage(cmd)
  }

  private clearTimer() {
    if (this.timer !== null) {
      clearTimeout(this.timer)
      this.timer = null
    }
  }

  // The worker crashed (WASM trap, script failure). Reject everything in
  // flight and start a fresh worker so the next analysis can succeed instead
  // of every future call failing on a dead engine.
  private onWorkerError(error: Error) {
    this.clearTimer()
    const items = [...(this.current ? [this.current] : []), ...this.queue]
    this.current = null
    this.queue = []
    this.busy = false
    this.searching = false
    this.draining = false
    this.currentMultipv = 1
    this.worker.terminate()
    this.worker = this.spawn()
    for (const item of items) item.reject(error)
  }

  private finishCurrent() {
    const item = this.current
    if (!item) return
    this.clearTimer()
    const result = this.infos.size > 0 ? resultFromInfos(this.infos) : { lines: [{ score: this.lastScore, pv: [] }] }
    this.current = null
    this.busy = false
    item.resolve(result)
    this.next()
  }

  private onMessage(line: string) {
    if (isBestMove(line)) {
      this.searching = false
      if (this.draining) {
        // Orphaned report from a superseded/timed-out search — the engine is
        // finally idle, so queued work may start.
        this.draining = false
        this.next()
        return
      }
    }
    if (!this.current) return
    const info = parseInfo(line)
    if (info) {
      // Later lines are deeper, so the latest per multipv index wins.
      this.infos.set(info.multipv, info)
      this.lastScore = this.infos.get(1)?.score ?? info.score
    } else {
      const score = parseScore(line)
      if (score) this.lastScore = score
    }
    if (isBestMove(line)) this.finishCurrent()
  }

  private next() {
    if (this.busy || this.draining) return
    const item = this.queue.shift()
    if (!item) return
    this.busy = true
    this.current = item
    this.infos = new Map()
    this.lastScore = {}
    if (item.multipv !== this.currentMultipv) {
      this.post(`setoption name MultiPV value ${item.multipv}`)
      this.currentMultipv = item.multipv
    }
    this.post(`position fen ${item.fen}`)
    this.post(`go depth ${item.depth}`)
    this.searching = true
    this.timer = setTimeout(() => this.onTimeout(), EVAL_TIMEOUT_MS)
  }

  // Safety timeout: resolve with the partial lines we saw, but drain the
  // still-running search before anything else is allowed to start.
  private onTimeout() {
    const item = this.current
    if (!item) return
    this.clearTimer()
    const result = this.infos.size > 0 ? resultFromInfos(this.infos) : { lines: [{ score: this.lastScore, pv: [] }] }
    this.current = null
    this.busy = false
    item.resolve(result)
    if (this.searching) {
      this.draining = true
      this.post('stop')
    } else {
      this.next()
    }
  }

  // Full analysis of a position: top `multipv` lines, each with score + PV.
  analyse(fen: string, { depth = 18, multipv = 1 }: { depth?: number; multipv?: number } = {}): Promise<EngineResult> {
    return new Promise((resolve, reject) => {
      this.queue.push({ fen, depth, multipv, resolve, reject })
      this.next()
    })
  }

  // Convenience: just the best-line score, for callers that don't need PVs.
  evaluate(fen: string, depth = 18): Promise<Score> {
    return this.analyse(fen, { depth }).then((r) => r.lines[0]?.score ?? {})
  }

  // Drop all pending and in-flight work, resolving their promises so awaiting
  // loops settle. Used when a new analysis supersedes the current one.
  reset() {
    this.clearTimer()
    if (this.current) {
      this.current.resolve({ lines: [] })
      this.current = null
    }
    for (const item of this.queue) item.resolve({ lines: [] })
    this.queue = []
    this.busy = false
    if (this.searching) {
      this.draining = true
      this.post('stop')
    }
  }

  terminate() {
    this.reset()
    this.worker.terminate()
  }
}
