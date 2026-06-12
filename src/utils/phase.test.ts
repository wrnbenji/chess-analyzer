import { describe, it, expect } from 'vitest'
import { phaseOfPosition, splitByPhase } from './phase'

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
// Queens off, rooks + minor each: endgame by the queens-off rule.
const QUEENLESS = 'r3k2r/pppb1ppp/2n5/8/8/2N5/PPPB1PPP/R3K2R w KQkq - 0 12'
// Queens on but bare-bones material (Q+N vs Q+N = 12 ≤ 13 per side): endgame.
const LOW_MATERIAL = '4k3/3q4/8/8/8/8/3QN3/4Kn2 w - - 0 40'
// Full middlegame: developed pieces, queens on, lots of material.
const MIDDLEGAME = 'r1bq1rk1/pp2bppp/2n1pn2/3p4/3P4/2NBPN2/PP3PPP/R1BQ1RK1 w - - 0 10'

describe('phaseOfPosition', () => {
  it('start position is opening', () => {
    expect(phaseOfPosition(START, 0, 0)).toBe('opening')
  })
  it('book plies are opening even with developed pieces', () => {
    expect(phaseOfPosition(MIDDLEGAME, 12, 16)).toBe('opening')
  })
  it('developed position past book is middlegame', () => {
    expect(phaseOfPosition(MIDDLEGAME, 30, 8)).toBe('middlegame')
  })
  it('queens off the board is endgame', () => {
    expect(phaseOfPosition(QUEENLESS, 30, 8)).toBe('endgame')
  })
  it('low material with queens on is endgame', () => {
    expect(phaseOfPosition(LOW_MATERIAL, 60, 8)).toBe('endgame')
  })
  it('endgame beats opening fallback (early queen trade)', () => {
    expect(phaseOfPosition(QUEENLESS, 10, 4)).toBe('endgame')
  })
})

describe('splitByPhase', () => {
  it('partitions ply indices by phase', () => {
    const phases = ['opening', 'opening', 'middlegame', 'endgame'] as const
    expect(splitByPhase([...phases])).toEqual({
      opening: [0, 1],
      middlegame: [2],
      endgame: [3],
    })
  })
})
