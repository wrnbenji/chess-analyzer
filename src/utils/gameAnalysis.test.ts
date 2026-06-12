import { describe, it, expect } from 'vitest'
import { Chess } from 'chess.js'
import { analyzeGamePositions, type PositionAnalyser } from './gameAnalysis'

// Fake engine: every position evaluates to +20 cp, pv echoes a legal move.
const fakeAnalyse: PositionAnalyser = async (fen) => {
  const legal = new Chess(fen).moves()[0]
  return { lines: [{ score: { cp: 20 }, pv: legal ? [legal] : [] }] }
}

function gameFixture(sans: string[]) {
  const chess = new Chess()
  const fens = [chess.fen()]
  const moves = sans.map((san) => {
    const m = chess.move(san)
    fens.push(chess.fen())
    return { san: m.san, color: m.color, fenAfter: m.after, to: m.to }
  })
  return { fens, moves }
}

describe('analyzeGamePositions', () => {
  it('produces one AnalyzedMove per move with phase and clock data', async () => {
    const { fens, moves } = gameFixture(['e4', 'e5', 'Nf3'])
    const out = await analyzeGamePositions(fakeAnalyse, fens, moves, {
      bookPlies: 2,
      clocks: [180, 179, 175],
      timeSpent: [2, 3, 6],
    })
    expect(out).not.toBeNull()
    expect(out!.analyzed).toHaveLength(3)
    expect(out!.analyzed[0].quality).toBe('book')
    expect(out!.analyzed[0].phase).toBe('opening')
    expect(out!.analyzed[2].clockSeconds).toBe(175)
    expect(out!.analyzed[2].timeSpent).toBe(6)
    expect(out!.scores).toHaveLength(4)
  })

  it('reports progress and honours isStale', async () => {
    const { fens, moves } = gameFixture(['e4', 'e5'])
    const seen: number[] = []
    let calls = 0
    const out = await analyzeGamePositions(fakeAnalyse, fens, moves, {
      onProgress: (done) => seen.push(done),
      isStale: () => ++calls > 2, // go stale after two positions
    })
    expect(out).toBeNull()
    expect(seen.length).toBeLessThan(3)
  })

  it('defaults clocks to null when absent', async () => {
    const { fens, moves } = gameFixture(['e4'])
    const out = await analyzeGamePositions(fakeAnalyse, fens, moves, {})
    expect(out!.analyzed[0].clockSeconds).toBeNull()
    expect(out!.analyzed[0].timeSpent).toBeNull()
  })
})
