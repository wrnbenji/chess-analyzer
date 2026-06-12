import type { AnalyzedMove, Game, MoveQuality } from '../types'

export interface ReviewExportMove {
  ply: number
  moveNumber: number
  color: 'w' | 'b'
  san: string
  predicted: MoveQuality
  expected: MoveQuality | null
  winBefore: number
  winAfter: number
  winDrop: number
  cpDrop: number
  bestMoveSan: string | null
  bestLineSan: string[]
}

export interface ReviewExport {
  schemaVersion: 1
  generatedAt: string
  game: {
    url: string
    timeControl: string
    rated: boolean
    endTime: number
    white: Game['white']
    black: Game['black']
  }
  opening: { eco: string; name: string } | null
  moves: ReviewExportMove[]
}

export function buildReviewExport({
  game,
  moves,
  opening,
  generatedAt = new Date().toISOString(),
}: {
  game: Game
  moves: AnalyzedMove[]
  opening: { eco: string; name: string } | null
  generatedAt?: string
}): ReviewExport {
  return {
    schemaVersion: 1,
    generatedAt,
    game: {
      url: game.url,
      timeControl: game.time_control,
      rated: game.rated,
      endTime: game.end_time,
      white: game.white,
      black: game.black,
    },
    opening,
    moves: moves.map((move, index) => ({
      ply: index + 1,
      moveNumber: Math.floor(index / 2) + 1,
      color: move.color,
      san: move.san,
      predicted: move.quality,
      expected: null,
      winBefore: move.winBefore,
      winAfter: move.winAfter,
      winDrop: move.winDrop,
      cpDrop: move.cpDrop,
      bestMoveSan: move.bestMoveSan,
      bestLineSan: move.bestLineSan,
    })),
  }
}
