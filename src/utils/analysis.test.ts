import { describe, it, expect } from 'vitest'
import { materialNet, lineToSan, lineMaterialLoss, analyzeMove } from './analysis'
import type { EngineResult } from '../types'

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

describe('materialNet', () => {
  it('is balanced at the start', () => {
    expect(materialNet(START, 'w')).toBe(0)
    expect(materialNet(START, 'b')).toBe(0)
  })
  it('counts a one-side material edge from the mover perspective', () => {
    const whiteUpQueen = 'rnb1kbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1' // black missing queen
    expect(materialNet(whiteUpQueen, 'w')).toBe(9)
    expect(materialNet(whiteUpQueen, 'b')).toBe(-9)
  })
})

describe('lineToSan', () => {
  it('renders a UCI line as SAN', () => {
    expect(lineToSan(START, ['e2e4', 'e7e5', 'g1f3'])).toEqual(['e4', 'e5', 'Nf3'])
  })
  it('stops at the first illegal move', () => {
    expect(lineToSan(START, ['e2e4', 'e2e4'])).toEqual(['e4'])
  })
})

describe('lineMaterialLoss', () => {
  it('is zero for an even trade', () => {
    expect(lineMaterialLoss(START, 'w', ['e2e4', 'd7d5', 'e4d5', 'd8d5'])).toBe(0)
  })
  it('is zero when the opponent captures first and the mover recaptures', () => {
    // The classic false-sacrifice: a transient dip that settles back to even.
    // White: Ke1, Ne4, Pf3; Black: Ke8, Nf6. Ke2, Nxe4, fxe4 — nets to zero.
    const loss = lineMaterialLoss('4k3/8/5n2/8/4N3/5P2/8/4K3 w - - 0 1', 'w', ['e1e2', 'f6e4', 'f3e4'])
    expect(loss).toBe(0)
  })
  it('reports a queen sacrifice that the opponent keeps', () => {
    // White gives the queen with check; Black captures it and keeps it.
    const loss = lineMaterialLoss('k7/8/8/8/8/8/1Q6/K7 w - - 0 1', 'w', ['b2b7', 'a8b7'])
    expect(loss).toBe(9)
  })
})

function result(cp: number, pv: string[], second?: { cp: number }): EngineResult {
  const lines = [{ score: { cp }, pv }]
  if (second) lines.push({ score: { cp: second.cp }, pv: [] })
  return { lines }
}

describe('analyzeMove', () => {
  it('marks the engine top move as best', () => {
    const a = analyzeMove({
      fenBefore: START,
      playedSan: 'e4',
      moverColor: 'w',
      resultBefore: result(30, ['e2e4', 'e7e5'], { cp: 20 }),
      resultAfter: result(-28, ['g1f3']),
      isBook: false,
    })
    expect(a.quality).toBe('best')
    expect(a.bestMoveSan).toBe('e4')
  })

  it('marks a near-top move as excellent using expected-points loss', () => {
    const a = analyzeMove({
      fenBefore: START,
      playedSan: 'd4',
      moverColor: 'w',
      resultBefore: result(30, ['e2e4', 'e7e5'], { cp: 25 }),
      resultAfter: result(-10, ['g1f3']),
      isBook: false,
    })
    expect(a.quality).toBe('excellent')
  })

  it('marks an opening move as book when flagged', () => {
    const a = analyzeMove({
      fenBefore: START,
      playedSan: 'e4',
      moverColor: 'w',
      resultBefore: result(30, ['e2e4'], { cp: 20 }),
      resultAfter: result(-28, ['g1f3']),
      isBook: true,
    })
    expect(a.quality).toBe('book')
  })

  it('marks a large win% loss as a blunder and names the best move', () => {
    const a = analyzeMove({
      fenBefore: START,
      playedSan: 'a3',
      moverColor: 'w',
      resultBefore: result(30, ['e2e4'], { cp: 20 }),
      resultAfter: result(450, ['d7d5']), // opponent now winning big
      isBook: false,
    })
    expect(a.quality).toBe('blunder')
    expect(a.explanation).toContain('e4')
  })

  it('flags a missed forced mate as a miss', () => {
    const a = analyzeMove({
      fenBefore: START,
      playedSan: 'a3',
      moverColor: 'w',
      resultBefore: { lines: [{ score: { mate: 2 }, pv: ['e2e4'] }] },
      resultAfter: result(-40, ['d7d5']), // still fine for the mover, but mate gone
      isBook: false,
    })
    expect(a.quality).toBe('miss')
    expect(a.mateIn).toBe(2)
    expect(a.explanation.toLowerCase()).toContain('mate')
  })
})

describe('analyzeMove: alternatives and motifs', () => {
  // White to move; Nc7+ forks king and rook. Best line per the fake engine.
  const FEN = 'r3k3/8/8/3N4/8/8/8/4K3 w - - 0 1'
  const resultBefore = {
    lines: [
      { score: { cp: 600 }, pv: ['d5c7', 'e8d8', 'c7a8'] },
      { score: { cp: 100 }, pv: ['e1d2'] },
      { score: { cp: 50 }, pv: ['e1f2'] },
    ],
  }
  const resultAfterBest = { lines: [{ score: { cp: -600 }, pv: [] }] }
  const resultAfterBad = { lines: [{ score: { cp: -50 }, pv: [] }] }

  it('exposes the engine lines as SAN alternatives with win%', () => {
    const a = analyzeMove({
      fenBefore: FEN,
      playedSan: 'Nc7+',
      moverColor: 'w',
      resultBefore,
      resultAfter: resultAfterBest,
      isBook: false,
    })
    expect(a.alternatives).toHaveLength(3)
    expect(a.alternatives[0].san).toBe('Nc7+')
    expect(a.alternatives[0].winPercent).toBeGreaterThan(90)
    expect(a.alternatives[1].san).toBe('Kd2')
  })

  it('tags motifs on the played move', () => {
    const a = analyzeMove({
      fenBefore: FEN,
      playedSan: 'Nc7+',
      moverColor: 'w',
      resultBefore,
      resultAfter: resultAfterBest,
      isBook: false,
    })
    expect(a.motifs).toContain('fork')
    expect(a.missedMotifs).toEqual([])
  })

  it('tags missed motifs when a weaker move skips the tactic', () => {
    const a = analyzeMove({
      fenBefore: FEN,
      playedSan: 'Kd2',
      moverColor: 'w',
      resultBefore,
      resultAfter: resultAfterBad,
      isBook: false,
    })
    expect(a.missedMotifs).toContain('fork')
    expect(a.explanation).toMatch(/fork/i)
  })
})
