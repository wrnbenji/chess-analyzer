import { PIECE_MARKUP } from './pieceSvgs.generated'

export const PIECE_CODES = [
  'wP', 'wN', 'wB', 'wR', 'wQ', 'wK',
  'bP', 'bN', 'bB', 'bR', 'bQ', 'bK',
] as const
export type PieceCode = (typeof PIECE_CODES)[number]

// Standalone, absolutely positioned piece for embedding in a board SVG. The
// artwork is pre-rendered at build time (scripts/generate-piece-svgs.mjs) so
// react-dom/server never enters the client bundle.
export function pieceSvg(code: PieceCode, x: number, y: number, size: number): string {
  return PIECE_MARKUP[code]
    .replace(/^<svg /, `<svg x="${x}" y="${y}" `)
    .replace('width="100%"', `width="${size}"`)
    .replace('height="100%"', `height="${size}"`)
}
