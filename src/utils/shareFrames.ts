import type { AnalyzedMove } from '../types'
import { QUALITY_COLOR, QUALITY_LABEL, QUALITY_SYMBOL } from './eval'
import { renderBoardSvg } from './boardSvg'
import { uciOfSan } from './analysis'

export const FRAME_W = 960
export const FRAME_H = 540
const BOARD_SIZE = 460
const BOARD_X = 40
const BOARD_Y = (FRAME_H - BOARD_SIZE) / 2
const TEXT_X = BOARD_X + BOARD_SIZE + 48
const STORY_MAX = 52
// 52 chars ≈ 416px at 15px system-ui — fits the 412px text column with the ellipsis
// Strong-move qualities that chain into a shareable "combination".
// 'excellent' is deliberately excluded: combinations are runs of engine-endorsed moves, and excellent means "close but not the engine's choice".
const COMBO_QUALITIES = new Set(['best', 'great', 'brilliant'])

export interface FrameSpec {
  svg: string
  durationMs: number
}

export interface ShareFramesInput {
  moves: AnalyzedMove[]
  fens: string[] // fens[i] precedes moves[i]
  fromPly: number // 1-based, inclusive
  toPly: number // 1-based, inclusive
  white: string
  black: string
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1) + '…'
}

// Wrap a board SVG plus optional right-column texts in the cinematic canvas.
function cinematicFrame(boardSvg: string, texts: string[]): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${FRAME_W}" height="${FRAME_H}" viewBox="0 0 ${FRAME_W} ${FRAME_H}">` +
    `<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">` +
    `<stop offset="0" stop-color="#0d1117"/><stop offset="1" stop-color="#1a2535"/>` +
    `</linearGradient></defs>` +
    `<rect width="${FRAME_W}" height="${FRAME_H}" fill="url(#bg)"/>` +
    `<g transform="translate(${BOARD_X},${BOARD_Y})">${boardSvg}</g>` +
    texts.join('') +
    `<text x="${FRAME_W - 24}" y="${FRAME_H - 18}" text-anchor="end" font-size="13" fill="#555" font-family="system-ui, sans-serif">♟ chess-analyzer</text>` +
    `</svg>`
  )
}

function moveLabel(index: number, move: AnalyzedMove): string {
  const moveNo = Math.floor(index / 2) + 1
  return move.color === 'w' ? `${moveNo}. ${move.san}` : `${moveNo}... ${move.san}`
}

export function buildShareFrames({ moves, fens, fromPly, toPly, white, black }: ShareFramesInput): FrameSpec[] {
  const frames: FrameSpec[] = []
  const font = 'font-family="system-ui, sans-serif"'

  for (let ply = fromPly; ply <= toPly; ply++) {
    const move = moves[ply - 1]
    if (!move) continue
    const orientation = move.color === 'b' ? 'black' : 'white'
    const playersLine =
      `<text x="${TEXT_X}" y="90" font-size="16" fill="#8b949e" ${font}>${esc(truncate(white, 18))} vs ${esc(truncate(black, 18))}</text>`

    // Before-frame: anticipation — position with the move drawn as an arrow.
    const uci = uciOfSan(fens[ply - 1], move.san)
    const beforeBoard = renderBoardSvg(fens[ply - 1], {
      size: BOARD_SIZE,
      orientation,
      arrow: uci ? { from: uci.from, to: uci.to, color: QUALITY_COLOR[move.quality] } : null,
    })
    frames.push({
      svg: cinematicFrame(beforeBoard, [
        playersLine,
        `<text x="${TEXT_X}" y="260" font-size="26" fill="#e6edf3" font-weight="600" ${font}>${esc(moveLabel(ply - 1, move))}</text>`,
      ]),
      durationMs: 600,
    })

    // After-frame: the move landed — badge, big caption, story, win swing.
    const afterFen = move.fenAfter || fens[ply]
    // fenAfter is always set on real AnalyzedMoves; fens[ply] covers test fixtures.
    const afterBoard = renderBoardSvg(afterFen, {
      size: BOARD_SIZE,
      orientation,
      badge: { square: move.toSquare, quality: move.quality },
    })
    const caption = `${QUALITY_LABEL[move.quality].toUpperCase()}${QUALITY_SYMBOL[move.quality]}`
    const story = truncate(move.explanation, STORY_MAX)
    frames.push({
      svg: cinematicFrame(afterBoard, [
        playersLine,
        `<text x="${TEXT_X}" y="225" font-size="40" fill="${QUALITY_COLOR[move.quality]}" font-weight="800" ${font}>${esc(caption)}</text>`,
        `<text x="${TEXT_X}" y="262" font-size="20" fill="#e6edf3" font-weight="600" ${font}>${esc(moveLabel(ply - 1, move))}</text>`,
        story
          ? `<text x="${TEXT_X}" y="295" font-size="15" fill="#8b949e" ${font}>${esc(story)}</text>`
          : '',
        `<text x="${TEXT_X}" y="340" font-size="26" fill="#4fc3f7" font-weight="700" ${font}>${move.winBefore.toFixed(0)}% → ${move.winAfter.toFixed(0)}%</text>`,
      ]),
      durationMs: ply === toPly ? 1800 : 900,
    })
  }
  return frames
}

// Default selection: the viewed move; if it sits in a run of the same player's
// strong moves (best/great/brilliant), preselect the whole combination.
export function defaultRange(moves: AnalyzedMove[], currentPly: number): { fromPly: number; toPly: number } {
  const i = currentPly - 1
  const move = moves[i]
  if (!move || !COMBO_QUALITIES.has(move.quality)) {
    return { fromPly: currentPly, toPly: currentPly }
  }
  let from = i
  while (from - 2 >= 0 && COMBO_QUALITIES.has(moves[from - 2].quality)) from -= 2
  let to = i
  while (to + 2 < moves.length && COMBO_QUALITIES.has(moves[to + 2].quality)) to += 2
  return { fromPly: from + 1, toPly: to + 1 }
}
