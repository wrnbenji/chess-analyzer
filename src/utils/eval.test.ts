import { describe, it, expect } from 'vitest'
import {
  scoreToCp,
  computeDrop,
  classifyWinDrop,
  classifyExpectedPointLoss,
  computeExpectedPointLoss,
  winChance,
  computeWinDrop,
  QUALITY_COLOR,
  QUALITY_SYMBOL,
} from './eval'

describe('scoreToCp', () => {
  it('returns cp directly', () => {
    expect(scoreToCp({ cp: 55 })).toBe(55)
    expect(scoreToCp({ cp: -300 })).toBe(-300)
  })
  it('maps positive mate to large positive', () => {
    expect(scoreToCp({ mate: 3 })).toBe(100000 - 300)
  })
  it('maps negative mate to large negative', () => {
    expect(scoreToCp({ mate: -1 })).toBe(-100000 + 100)
  })
  it('defaults missing score to 0', () => {
    expect(scoreToCp({})).toBe(0)
  })
})

describe('computeDrop', () => {
  it('zero drop when mover keeps equal eval', () => {
    expect(computeDrop({ cp: 30 }, { cp: -30 })).toBe(0)
  })
  it('positive drop when mover worsens', () => {
    expect(computeDrop({ cp: 30 }, { cp: 120 })).toBe(150)
  })
  it('clamps improvement to zero', () => {
    expect(computeDrop({ cp: 0 }, { cp: -200 })).toBe(0)
  })
})

describe('winChance', () => {
  it('is 50% at equality', () => {
    expect(winChance({ cp: 0 })).toBeCloseTo(50, 1)
  })
  it('rises above 50 for the side to move when ahead', () => {
    expect(winChance({ cp: 200 })).toBeGreaterThan(50)
    expect(winChance({ cp: -200 })).toBeLessThan(50)
  })
  it('saturates near 100/0 for decisive evals', () => {
    expect(winChance({ mate: 1 })).toBeGreaterThan(99)
    expect(winChance({ mate: -1 })).toBeLessThan(1)
  })
})

describe('computeWinDrop', () => {
  it('zero when the mover keeps an equal eval', () => {
    // before from mover view (+30), after from opponent view (-30) => same position.
    expect(computeWinDrop({ cp: 30 }, { cp: -30 })).toBeCloseTo(0, 5)
  })
  it('positive when the mover worsens the position', () => {
    expect(computeWinDrop({ cp: 30 }, { cp: 120 })).toBeGreaterThan(0)
  })
  it('clamps an improvement to zero', () => {
    expect(computeWinDrop({ cp: 0 }, { cp: -400 })).toBe(0)
  })
})

describe('computeExpectedPointLoss', () => {
  it('returns the mover expected-points loss on a 0..1 scale', () => {
    expect(computeExpectedPointLoss({ cp: 30 }, { cp: -30 })).toBeCloseTo(0, 5)
    expect(computeExpectedPointLoss({ cp: 30 }, { cp: 120 })).toBeGreaterThan(0)
    expect(computeExpectedPointLoss({ cp: 0 }, { cp: -400 })).toBe(0)
  })
})

describe('classifyExpectedPointLoss', () => {
  it('uses Chess.com-style core expected-points cutoffs', () => {
    expect(classifyExpectedPointLoss(0)).toBe('best')
    expect(classifyExpectedPointLoss(0.0001)).toBe('excellent')
    expect(classifyExpectedPointLoss(0.0199)).toBe('excellent')
    expect(classifyExpectedPointLoss(0.02)).toBe('good')
    expect(classifyExpectedPointLoss(0.0499)).toBe('good')
    expect(classifyExpectedPointLoss(0.05)).toBe('inaccuracy')
    expect(classifyExpectedPointLoss(0.0999)).toBe('inaccuracy')
    expect(classifyExpectedPointLoss(0.10)).toBe('mistake')
    expect(classifyExpectedPointLoss(0.1999)).toBe('mistake')
    expect(classifyExpectedPointLoss(0.20)).toBe('blunder')
  })
})

describe('classifyWinDrop', () => {
  it('classifies by expected-points loss expressed as win% lost', () => {
    expect(classifyWinDrop(0)).toBe('best')
    expect(classifyWinDrop(1.9)).toBe('excellent')
    expect(classifyWinDrop(2)).toBe('good')
    expect(classifyWinDrop(4.9)).toBe('good')
    expect(classifyWinDrop(5)).toBe('inaccuracy')
    expect(classifyWinDrop(9.9)).toBe('inaccuracy')
    expect(classifyWinDrop(10)).toBe('mistake')
    expect(classifyWinDrop(19.9)).toBe('mistake')
    expect(classifyWinDrop(20)).toBe('blunder')
  })
})

describe('maps', () => {
  it('has a color and symbol per quality', () => {
    for (const q of ['best', 'excellent', 'good', 'inaccuracy', 'mistake', 'blunder'] as const) {
      expect(QUALITY_COLOR[q]).toMatch(/^#/)
      expect(typeof QUALITY_SYMBOL[q]).toBe('string')
    }
  })
})
