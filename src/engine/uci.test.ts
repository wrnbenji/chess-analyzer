import { describe, it, expect } from 'vitest'
import { parseScore, isBestMove, parseInfo } from './uci'

describe('parseScore', () => {
  it('parses centipawn score', () => {
    const line = 'info depth 15 seldepth 20 multipv 1 score cp 34 nodes 1000 pv e2e4'
    expect(parseScore(line)).toEqual({ cp: 34 })
  })
  it('parses negative centipawn score', () => {
    expect(parseScore('info depth 12 score cp -128 pv d7d5')).toEqual({ cp: -128 })
  })
  it('parses mate score', () => {
    expect(parseScore('info depth 18 score mate 3 pv h5f7')).toEqual({ mate: 3 })
  })
  it('parses negative mate score', () => {
    expect(parseScore('info depth 18 score mate -2 pv')).toEqual({ mate: -2 })
  })
  it('returns null for lines without a score', () => {
    expect(parseScore('info depth 1 currmove e2e4 currmovenumber 1')).toBeNull()
  })
})

describe('parseInfo', () => {
  it('parses multipv, score and pv', () => {
    const line = 'info depth 18 seldepth 24 multipv 1 score cp 41 nodes 100 pv e2e4 e7e5 g1f3'
    expect(parseInfo(line)).toEqual({ multipv: 1, score: { cp: 41 }, pv: ['e2e4', 'e7e5', 'g1f3'] })
  })
  it('defaults multipv to 1 when absent', () => {
    expect(parseInfo('info depth 10 score cp -20 pv d2d4')).toEqual({ multipv: 1, score: { cp: -20 }, pv: ['d2d4'] })
  })
  it('parses the second line', () => {
    const line = 'info depth 18 multipv 2 score mate 2 pv d8h4 g2g3 h4g3'
    expect(parseInfo(line)).toEqual({ multipv: 2, score: { mate: 2 }, pv: ['d8h4', 'g2g3', 'h4g3'] })
  })
  it('returns null for scoreless info lines', () => {
    expect(parseInfo('info depth 1 currmove e2e4 currmovenumber 1')).toBeNull()
    expect(parseInfo('bestmove e2e4')).toBeNull()
  })
})

describe('isBestMove', () => {
  it('detects bestmove lines', () => {
    expect(isBestMove('bestmove e2e4 ponder e7e5')).toBe(true)
    expect(isBestMove('info depth 15 score cp 10')).toBe(false)
  })
})
