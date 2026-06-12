import { describe, expect, it } from 'vitest'
import { buildReviewExport } from './reviewExport'
import type { AnalyzedMove, Game } from '../types'

const game: Game = {
  url: 'https://www.chess.com/game/live/123',
  pgn: '[Event "Live Chess"]\n1. e4 e5',
  time_control: '60',
  end_time: 1760000000,
  rated: true,
  white: { username: 'WhitePlayer', rating: 1500, result: 'win' },
  black: { username: 'BlackPlayer', rating: 1490, result: 'resigned' },
}

function move(san: string, quality: AnalyzedMove['quality'], color: 'w' | 'b'): AnalyzedMove {
  return {
    san,
    color,
    fenAfter: '',
    toSquare: 'e4',
    quality,
    cpDrop: 12,
    winBefore: 55,
    winAfter: 54,
    winDrop: 1,
    explanation: 'Excellent move.',
    bestMoveSan: 'e4',
    bestLineSan: ['e4', 'e5'],
    mateIn: null,
    isSacrifice: false,
    phase: 'middlegame',
    alternatives: [],
    motifs: [],
    missedMotifs: [],
    clockSeconds: null,
    timeSpent: null,
  }
}

describe('buildReviewExport', () => {
  it('exports predicted labels with blank expected labels for benchmarking', () => {
    const exported = buildReviewExport({
      game,
      moves: [move('e4', 'book', 'w'), move('e5', 'excellent', 'b')],
      opening: { eco: 'C20', name: 'King Pawn Game' },
      generatedAt: '2026-06-09T18:00:00.000Z',
    })

    expect(exported.schemaVersion).toBe(1)
    expect(exported.game.url).toBe(game.url)
    expect(exported.opening).toEqual({ eco: 'C20', name: 'King Pawn Game' })
    expect(exported.moves).toMatchObject([
      { ply: 1, moveNumber: 1, color: 'w', san: 'e4', predicted: 'book', expected: null },
      { ply: 2, moveNumber: 1, color: 'b', san: 'e5', predicted: 'excellent', expected: null },
    ])
  })
})
