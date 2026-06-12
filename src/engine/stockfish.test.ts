import { afterEach, describe, expect, it, vi } from 'vitest'
import { StockfishEngine } from './stockfish'

class FakeWorker {
  onmessage: ((event: MessageEvent<string>) => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null
  messages: string[] = []
  terminated = false

  postMessage(message: string) {
    this.messages.push(message)
  }

  terminate() {
    this.terminated = true
  }

  emitError(message = 'worker failed') {
    this.onerror?.(new ErrorEvent('error', { message }))
  }

  emit(line: string) {
    this.onmessage?.({ data: line } as MessageEvent<string>)
  }
}

describe('StockfishEngine', () => {
  it('rejects pending evaluations when the worker fails', async () => {
    const worker = new FakeWorker()
    const engine = new StockfishEngine('/stockfish.js', () => worker as unknown as Worker)
    const evaluation = engine.evaluate('startpos', 1)

    worker.emitError('wasm blocked')

    await expect(evaluation).rejects.toThrow('wasm blocked')
  })

  it('assembles multipv lines (best first) with their PVs', async () => {
    const worker = new FakeWorker()
    const engine = new StockfishEngine('/stockfish.js', () => worker as unknown as Worker)
    const pending = engine.analyse('somefen', { depth: 1, multipv: 2 })

    worker.emit('info depth 18 multipv 1 score cp 55 pv e2e4 e7e5')
    worker.emit('info depth 18 multipv 2 score cp 20 pv d2d4 d7d5')
    worker.emit('bestmove e2e4 ponder e7e5')

    const result = await pending
    expect(result.lines).toHaveLength(2)
    expect(result.lines[0]).toEqual({ score: { cp: 55 }, pv: ['e2e4', 'e7e5'] })
    expect(result.lines[1]).toEqual({ score: { cp: 20 }, pv: ['d2d4', 'd7d5'] })
    // It requested MultiPV from the engine.
    expect(worker.messages).toContain('setoption name MultiPV value 2')
  })

  // Posting 'go' while a previous search is still running crashes the
  // single-threaded WASM build ('unreachable' trap). After reset() the engine
  // must drain the in-flight search (wait for its bestmove) before starting
  // queued work.
  it('does not start a new search until the stopped one emits bestmove', async () => {
    const worker = new FakeWorker()
    const engine = new StockfishEngine('/stockfish.js', () => worker as unknown as Worker)

    void engine.analyse('fen-one', { depth: 18 })
    expect(worker.messages.filter((m) => m.startsWith('go'))).toHaveLength(1)

    engine.reset() // supersede mid-search: posts 'stop', resolves the promise
    const second = engine.analyse('fen-two', { depth: 18 })

    // The first search has not emitted bestmove yet — no second 'go' allowed.
    expect(worker.messages.filter((m) => m.startsWith('go'))).toHaveLength(1)
    expect(worker.messages).toContain('stop')

    // The stopped search finally reports; only now may the next one start.
    worker.emit('bestmove e2e4')
    expect(worker.messages).toContain('position fen fen-two')
    expect(worker.messages.filter((m) => m.startsWith('go'))).toHaveLength(2)

    worker.emit('info depth 18 multipv 1 score cp 10 pv d2d4')
    worker.emit('bestmove d2d4')
    const result = await second
    expect(result.lines[0]).toEqual({ score: { cp: 10 }, pv: ['d2d4'] })
  })

  describe('safety timeout', () => {
    afterEach(() => {
      vi.useRealTimers()
    })

    it('drains the overrunning search before starting the next', async () => {
      vi.useFakeTimers()
      const worker = new FakeWorker()
      const engine = new StockfishEngine('/stockfish.js', () => worker as unknown as Worker)

      const slow = engine.analyse('fen-slow', { depth: 18 })
      const queued = engine.analyse('fen-next', { depth: 18 })
      worker.emit('info depth 12 multipv 1 score cp 33 pv e2e4')

      // Safety timer fires: the slow search resolves with partial data...
      vi.advanceTimersByTime(15000)
      const partial = await slow
      expect(partial.lines[0]).toEqual({ score: { cp: 33 }, pv: ['e2e4'] })

      // ...but the engine is still searching — the queued item must wait.
      expect(worker.messages.filter((m) => m.startsWith('go'))).toHaveLength(1)
      expect(worker.messages).toContain('stop')

      worker.emit('bestmove e2e4')
      expect(worker.messages.filter((m) => m.startsWith('go'))).toHaveLength(2)

      worker.emit('bestmove g1f3')
      await queued
    })
  })

  it('recreates the worker after a crash so the next analysis works', async () => {
    const workers: FakeWorker[] = []
    const engine = new StockfishEngine('/stockfish.js', () => {
      const w = new FakeWorker()
      workers.push(w)
      return w as unknown as Worker
    })

    const dying = engine.analyse('fen-one', { depth: 18 })
    workers[0].emitError('unreachable')
    await expect(dying).rejects.toThrow('unreachable')
    expect(workers[0].terminated).toBe(true)

    // A fresh worker is spun up; the engine is usable again.
    const revived = engine.analyse('fen-two', { depth: 18 })
    expect(workers).toHaveLength(2)
    expect(workers[1].messages).toContain('position fen fen-two')
    workers[1].emit('info depth 18 multipv 1 score cp 5 pv e2e4')
    workers[1].emit('bestmove e2e4')
    const result = await revived
    expect(result.lines[0]).toEqual({ score: { cp: 5 }, pv: ['e2e4'] })
  })
})
