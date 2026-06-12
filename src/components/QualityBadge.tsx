import type { MoveQuality } from '../types'
import { QUALITY_COLOR, QUALITY_LABEL } from '../utils/eval'

// Glyph drawn inside each badge. Kept short so it stays legible in the circle.
const GLYPH: Record<MoveQuality, string> = {
  brilliant: '!!',
  great: '!',
  best: '✓',
  excellent: '✓',
  good: '✓',
  book: '♟',
  inaccuracy: '?!',
  mistake: '?',
  miss: '✕',
  blunder: '??',
}

// Chess.com-style move badge: a colored disc with a white glyph.
export function QualityBadge({ quality, size = 22 }: { quality: MoveQuality; size?: number }) {
  const color = QUALITY_COLOR[quality]
  const glyph = GLYPH[quality]
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      role="img"
      aria-label={QUALITY_LABEL[quality]}
    >
      <title>{QUALITY_LABEL[quality]}</title>
      <circle cx="12" cy="12" r="11" fill={color} stroke="#fff" strokeWidth="1.5" />
      <text
        x="12"
        y="12.5"
        textAnchor="middle"
        dominantBaseline="central"
        fontFamily="system-ui, sans-serif"
        fontSize={glyph.length > 1 ? 9 : 13}
        fontWeight="700"
        fill="#fff"
      >
        {glyph}
      </text>
    </svg>
  )
}
