import { describe, it, expect } from 'vitest'
import { extractMoves, identifyOpening } from './opening'

const PGN = `[Event "Live Chess"]
[Site "Chess.com"]
[White "a"]
[Black "b"]

1. e4 {[%clk 0:09:59]} e5 {[%clk 0:09:58]} 2. Nf3 {[%clk 0:09:55]} Nc6 1-0`

describe('extractMoves', () => {
  it('strips headers, clocks, and result, keeping move-numbered SAN', () => {
    expect(extractMoves(PGN)).toBe('1. e4 e5 2. Nf3 Nc6')
  })
})

describe('identifyOpening', () => {
  it('returns the longest matching opening', () => {
    expect(identifyOpening(PGN)).toEqual({ eco: 'C40', name: "King's Knight Opening" })
  })
  it('returns null when nothing matches', () => {
    expect(identifyOpening('[White "x"]\n\n1. h4 h5')).toBeNull()
  })
})
