import type { MoveQuality } from '../types'
import { QUALITY_COLOR, QUALITY_SYMBOL } from './eval'
import { pieceSvg, type PieceCode } from './pieceSvgs'

// Dark-theme board colors (match the app's --board-light / --board-dark).
const LIGHT = '#b8c0cc'
const DARK = '#5c6b7a'

export interface BoardSvgOptions {
  size: number
  orientation?: 'white' | 'black'
  badge?: { square: string; quality: MoveQuality } | null
  arrow?: { from: string; to: string; color: string } | null
}

// phase.ts has a similar FEN walk (boardMap) with a different output shape; kept separate on purpose.
// FEN board field → list of { code, file, rank } (file/rank 0-7, a1 = 0,0).
function piecesFromFen(fen: string): Array<{ code: PieceCode; file: number; rank: number }> {
  const out: Array<{ code: PieceCode; file: number; rank: number }> = []
  const rows = fen.split(' ')[0].split('/')
  for (let r = 0; r < 8; r++) {
    let file = 0
    for (const ch of rows[r]) {
      if (/\d/.test(ch)) {
        file += parseInt(ch, 10)
      } else {
        const color = ch === ch.toUpperCase() ? 'w' : 'b'
        out.push({ code: (color + ch.toUpperCase()) as PieceCode, file, rank: 7 - r })
        file++
      }
    }
  }
  return out
}

// Square top-left corner in pixels for the given orientation.
function squareXY(square: string, sq: number, orientation: 'white' | 'black') {
  const file = square.charCodeAt(0) - 97
  const rank = parseInt(square[1], 10) - 1
  const col = orientation === 'white' ? file : 7 - file
  const row = orientation === 'white' ? 7 - rank : rank
  return { x: col * sq, y: row * sq }
}

export function renderBoardSvg(fen: string, opts: BoardSvgOptions): string {
  const { size, orientation = 'white', badge = null, arrow = null } = opts
  const sq = size / 8
  const parts: string[] = []

  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const light = (row + col) % 2 === 0
      parts.push(
        `<rect x="${col * sq}" y="${row * sq}" width="${sq}" height="${sq}" fill="${light ? LIGHT : DARK}"/>`,
      )
    }
  }

  for (const p of piecesFromFen(fen)) {
    const col = orientation === 'white' ? p.file : 7 - p.file
    const row = orientation === 'white' ? 7 - p.rank : p.rank
    parts.push(pieceSvg(p.code, col * sq, row * sq, sq))
  }

  if (arrow) {
    const a = squareXY(arrow.from, sq, orientation)
    const b = squareXY(arrow.to, sq, orientation)
    const ax = a.x + sq / 2
    const ay = a.y + sq / 2
    const bx = b.x + sq / 2
    const by = b.y + sq / 2
    // Shorten so the head sits inside the target square.
    const len = Math.hypot(bx - ax, by - ay) || 1
    const ux = (bx - ax) / len
    const uy = (by - ay) / len
    const tipX = bx - ux * sq * 0.3
    const tipY = by - uy * sq * 0.3
    const headSize = sq * 0.28
    parts.push(
      `<line x1="${ax}" y1="${ay}" x2="${tipX - ux * headSize}" y2="${tipY - uy * headSize}" stroke="${arrow.color}" stroke-width="${sq * 0.18}" stroke-linecap="round" opacity="0.85"/>`,
      `<polygon points="${tipX},${tipY} ${tipX - ux * headSize - uy * headSize * 0.7},${tipY - uy * headSize + ux * headSize * 0.7} ${tipX - ux * headSize + uy * headSize * 0.7},${tipY - uy * headSize - ux * headSize * 0.7}" fill="${arrow.color}" opacity="0.85"/>`,
    )
  }

  if (badge) {
    const pos = squareXY(badge.square, sq, orientation)
    const cx = pos.x + sq
    const cy = pos.y
    const r = sq * 0.24
    parts.push(
      `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${QUALITY_COLOR[badge.quality]}" stroke="#0d1117" stroke-width="1.5"/>`,
      `<text x="${cx}" y="${cy + r * 0.45}" text-anchor="middle" font-size="${r * 1.15}" font-weight="bold" fill="#fff" font-family="system-ui, sans-serif">${QUALITY_SYMBOL[badge.quality]}</text>`,
    )
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" overflow="visible">${parts.join('')}</svg>`
}
