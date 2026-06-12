import { describe, it, expect } from 'vitest'
import { buildShareFrames, defaultRange, FRAME_W, FRAME_H, BOARD_SIZE } from './shareFrames'
import { renderBoardSvg } from './boardSvg'
import type { AnalyzedMove } from '../types'

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

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
const AFTER_E4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPPPPPP/RNBQKBNR b KQkq e3 0 1'
const AFTER_E5 = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPPPPPP/RNBQKBNR w KQkq e6 0 2'

describe('buildShareFrames', () => {
  const moves = [
    mv({ san: 'e4', quality: 'brilliant', winBefore: 36, winAfter: 81, toSquare: 'e4', fenAfter: AFTER_E4, explanation: 'Brilliant!! e4 gives up material, but it is sound.' }),
    mv({ san: 'e5', color: 'b', quality: 'good', toSquare: 'e5', fenAfter: AFTER_E5 }),
  ]
  const fens = [START, AFTER_E4, AFTER_E5]

  it('emits one intro frame plus one frame per move, last frame held', () => {
    const frames = buildShareFrames({ moves, fens, fromPly: 1, toPly: 2, white: 'me', black: 'them' })
    expect(frames).toHaveLength(3) // intro + 2 moves — each position appears exactly once
    expect(frames[0].durationMs).toBe(800)
    expect(frames[1].durationMs).toBe(900)
    expect(frames[2].durationMs).toBe(1800) // final frame held
  })

  it('puts the cinematic caption and win swing on the move frame, not the intro', () => {
    const frames = buildShareFrames({ moves, fens, fromPly: 1, toPly: 1, white: 'me', black: 'them' })
    expect(frames[1].svg).toContain('BRILLIANT')
    expect(frames[1].svg).toContain('36%')
    expect(frames[1].svg).toContain('81%')
    expect(frames[1].svg).toContain('chess-analyzer')
    expect(frames[0].svg).not.toContain('BRILLIANT') // intro shows only the starting position
    expect(frames[0].svg).not.toContain('1. e4') // no move caption before the move is on the board
  })

  it('frames are full cinematic canvases', () => {
    const frames = buildShareFrames({ moves, fens, fromPly: 1, toPly: 1, white: 'me', black: 'them' })
    expect(frames[0].svg).toContain(`width="${FRAME_W}"`)
    expect(frames[0].svg).toContain(`height="${FRAME_H}"`)
  })

  it('draws no arrows on any frame', () => {
    const frames = buildShareFrames({ moves, fens, fromPly: 1, toPly: 2, white: 'me', black: 'them' })
    for (const frame of frames) {
      // '<line ' with a space — '<line' alone would match <linearGradient>.
      expect(frame.svg).not.toContain('<line ')
      expect(frame.svg).not.toContain('<polygon')
    }
  })

  it('keeps one orientation for the whole range, set by the first move', () => {
    // Range starts with White's move → every board is from White's view,
    // including Black's reply (no 180° flip mid-GIF).
    const frames = buildShareFrames({ moves, fens, fromPly: 1, toPly: 2, white: 'me', black: 'them' })
    const whiteViewAfterE4 = renderBoardSvg(AFTER_E4, {
      size: BOARD_SIZE,
      orientation: 'white',
      badge: { square: 'e4', quality: 'brilliant' },
    })
    expect(frames[1].svg).toContain(whiteViewAfterE4) // White's move frame, White's view

    // Range starting with Black's move → Black's view throughout.
    const blackFirst = buildShareFrames({ moves, fens, fromPly: 2, toPly: 2, white: 'me', black: 'them' })
    const fromBlackView = renderBoardSvg(AFTER_E4, { size: BOARD_SIZE, orientation: 'black' })
    expect(blackFirst[0].svg).toContain(fromBlackView)
  })

  it('truncates long explanations', () => {
    const long = mv({ explanation: 'x'.repeat(200), quality: 'mistake', fenAfter: AFTER_E4 })
    const frames = buildShareFrames({ moves: [long], fens: [START, AFTER_E4], fromPly: 1, toPly: 1, white: 'a', black: 'b' })
    const story = frames[1].svg.match(/x+/)?.[0] ?? ''
    expect(story.length).toBeLessThanOrEqual(52)
  })
})

describe('defaultRange', () => {
  it("expands across the mover's consecutive strong moves", () => {
    const moves = [
      mv({ quality: 'best' }),       // ply 1 (w)
      mv({ color: 'b' }),            // ply 2
      mv({ quality: 'brilliant' }),  // ply 3 (w) — current
      mv({ color: 'b' }),            // ply 4
      mv({ quality: 'great' }),      // ply 5 (w)
      mv({ color: 'b' }),            // ply 6
      mv({ quality: 'mistake' }),    // ply 7 (w) — breaks the run
    ]
    expect(defaultRange(moves, 3)).toEqual({ fromPly: 1, toPly: 5 })
  })
  it('single move when not part of a combination', () => {
    const moves = [mv({ quality: 'good' }), mv({ color: 'b', quality: 'good' })]
    expect(defaultRange(moves, 2)).toEqual({ fromPly: 2, toPly: 2 })
  })
})
