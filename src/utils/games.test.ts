import { describe, it, expect } from 'vitest'
import { gameOutcome, byNewest, formatTimeControl } from './games'
import type { Game } from '../types'

function game(over: Partial<Game> & { whiteResult?: string; blackResult?: string }): Game {
  return {
    url: over.url ?? 'https://chess.com/game/1',
    pgn: '',
    time_control: over.time_control ?? '600',
    end_time: over.end_time ?? 1000,
    rated: true,
    white: { username: 'alice', rating: 1200, result: over.whiteResult ?? 'win' },
    black: { username: 'bob', rating: 1180, result: over.blackResult ?? 'resigned' },
  }
}

describe('gameOutcome', () => {
  it('win when the searched player won', () => {
    expect(gameOutcome(game({}), 'alice')).toBe('win')
  })
  it('loss for any losing result code', () => {
    for (const result of ['checkmated', 'resigned', 'timeout', 'abandoned']) {
      expect(gameOutcome(game({ blackResult: result }), 'bob')).toBe('loss')
    }
  })
  it('draw for every draw result code', () => {
    for (const result of ['agreed', 'repetition', 'stalemate', 'insufficient', '50move', 'timevsinsufficient']) {
      expect(gameOutcome(game({ whiteResult: result, blackResult: result }), 'alice')).toBe('draw')
    }
  })
  it('matches usernames case-insensitively', () => {
    expect(gameOutcome(game({}), 'ALICE')).toBe('win')
  })
  it('null when the player is on neither side', () => {
    expect(gameOutcome(game({}), 'carol')).toBeNull()
  })
})

describe('byNewest', () => {
  it('sorts newest first without mutating the input', () => {
    const input = [game({ url: 'a', end_time: 1 }), game({ url: 'c', end_time: 3 }), game({ url: 'b', end_time: 2 })]
    const sorted = byNewest(input)
    expect(sorted.map((g) => g.url)).toEqual(['c', 'b', 'a'])
    expect(input.map((g) => g.url)).toEqual(['a', 'c', 'b']) // untouched
  })
})

describe('formatTimeControl', () => {
  it('whole-minute base', () => {
    expect(formatTimeControl('600')).toBe('10 min')
  })
  it('base plus increment', () => {
    expect(formatTimeControl('180+2')).toBe('3+2')
  })
  it('sub-minute base keeps one decimal', () => {
    expect(formatTimeControl('30')).toBe('0.5 min')
  })
  it('daily games', () => {
    expect(formatTimeControl('1/86400')).toBe('daily')
  })
  it('falls back to the raw string when unparseable', () => {
    expect(formatTimeControl('weird')).toBe('weird')
  })
})
