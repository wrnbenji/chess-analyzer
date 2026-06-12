import { describe, it, expect } from 'vitest'
import { aggregateTrends, type AnalyzedGame } from './trends'
import type { AnalyzedMove, Game } from '../types'

function mv(over: Partial<AnalyzedMove>): AnalyzedMove {
  return {
    san: 'e4', color: 'w', fenAfter: '', toSquare: 'e4', quality: 'good',
    cpDrop: 0, winBefore: 50, winAfter: 50, winDrop: 0, explanation: '',
    bestMoveSan: null, bestLineSan: [], mateIn: null, isSacrifice: false,
    phase: 'middlegame', alternatives: [], motifs: [], missedMotifs: [],
    clockSeconds: null, timeSpent: null,
    ...over,
  }
}

function fakeGame(over: Partial<Game>): Game {
  return {
    url: 'u', pgn: '', time_control: '600', end_time: 1, rated: true,
    white: { username: 'me', rating: 1500, result: 'win' },
    black: { username: 'them', rating: 1500, result: 'resigned' },
    ...over,
  }
}

describe('aggregateTrends', () => {
  const games: AnalyzedGame[] = [
    {
      game: fakeGame({ url: 'g1' }),
      userColor: 'w',
      opening: { eco: 'B20', name: 'Sicilian' },
      moves: [
        mv({ quality: 'blunder', winDrop: 30, phase: 'middlegame', missedMotifs: ['fork'] }),
        mv({ color: 'b' }),
        mv({ quality: 'good' }),
      ],
    },
    {
      game: fakeGame({
        url: 'g2',
        white: { username: 'them', rating: 1500, result: 'win' },
        black: { username: 'me', rating: 1500, result: 'checkmated' },
      }),
      userColor: 'b',
      opening: { eco: 'B20', name: 'Sicilian' },
      moves: [
        mv({ color: 'w' }),
        mv({ color: 'b', quality: 'mistake', winDrop: 12, phase: 'endgame', missedMotifs: ['fork'] }),
      ],
    },
  ]

  it('produces one accuracy point per game with result', () => {
    const t = aggregateTrends(games)
    expect(t.accuracySeries).toHaveLength(2)
    expect(t.accuracySeries[0].won).toBe(true)
    expect(t.accuracySeries[1].won).toBe(false)
  })

  it('groups by opening with win rate', () => {
    const t = aggregateTrends(games)
    expect(t.openings).toHaveLength(1)
    expect(t.openings[0]).toMatchObject({ eco: 'B20', games: 2, wins: 1 })
  })

  it('counts user errors per phase and missed motifs', () => {
    const t = aggregateTrends(games)
    expect(t.errorsByPhase.middlegame).toBe(1)
    expect(t.errorsByPhase.endgame).toBe(1)
    expect(t.missedMotifs[0]).toEqual({ motif: 'fork', count: 2 })
  })
})
