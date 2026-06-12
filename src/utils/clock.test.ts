import { describe, it, expect } from 'vitest'
import { parseTimeControl, extractClocks, computeTimeSpent } from './clock'

const PGN_WITH_CLOCKS = `[Event "Live Chess"]
[TimeControl "180+2"]

1. e4 {[%clk 0:03:00]} e5 {[%clk 0:02:58.7]} 2. Nf3 {[%clk 0:02:55]} Nc6 {[%clk 0:02:50.1]} 1-0`

const PGN_NO_CLOCKS = `[Event "Live Chess"]

1. e4 e5 2. Nf3 Nc6 1-0`

describe('parseTimeControl', () => {
  it('parses base+increment', () => {
    expect(parseTimeControl('180+2')).toEqual({ base: 180, inc: 2 })
  })
  it('parses base only', () => {
    expect(parseTimeControl('600')).toEqual({ base: 600, inc: 0 })
  })
  it('returns null for daily format (no usable clock info)', () => {
    expect(parseTimeControl('1/86400')).toBeNull()
  })
  it('returns null for unrecognised strings', () => {
    expect(parseTimeControl('bullet')).toBeNull()
  })
})

describe('extractClocks', () => {
  it('returns remaining seconds per ply', () => {
    expect(extractClocks(PGN_WITH_CLOCKS)).toEqual([180, 178.7, 175, 170.1])
  })
  it('returns empty array when no clk tags', () => {
    expect(extractClocks(PGN_NO_CLOCKS)).toEqual([])
  })
})

describe('computeTimeSpent', () => {
  it('first move of each side measures from base time', () => {
    const spent = computeTimeSpent([180, 178.7, 175, 170.1], 180, 2)
    // ply 0 (white 1st): 180 - 180 + 2 = 2
    // ply 1 (black 1st): 180 - 178.7 + 2 = 3.3
    // ply 2 (white 2nd): 180 - 175 + 2 = 7
    // ply 3 (black 2nd): 178.7 - 170.1 + 2 = 10.6
    expect(spent.map((s) => Math.round(s * 10) / 10)).toEqual([2, 3.3, 7, 10.6])
  })
  it('clamps negative spent (clock corrections) to zero', () => {
    expect(computeTimeSpent([10, 10, 30], 10, 0)[2]).toBe(0)
  })
  it('returns empty for empty clocks', () => {
    expect(computeTimeSpent([], 180, 2)).toEqual([])
  })
})
