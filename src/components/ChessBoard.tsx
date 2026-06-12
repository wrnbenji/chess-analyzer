import { Chessboard } from 'react-chessboard'
import type { MoveQuality } from '../types'
import { QualityBadge } from './QualityBadge'

export interface BoardArrow {
  from: string
  to: string
  color: string // CSS color
}

// Top-right corner of a square as a percentage of the board, accounting for
// board orientation, so the badge sits on the move's destination square.
function squareCorner(square: string, orientation: 'white' | 'black') {
  const file = square.charCodeAt(0) - 97 // a..h -> 0..7
  const rank = parseInt(square[1], 10) - 1 // 1..8 -> 0..7
  const col = orientation === 'white' ? file : 7 - file
  const row = orientation === 'white' ? 7 - rank : rank
  return { left: ((col + 1) / 8) * 100, top: (row / 8) * 100 }
}

export function ChessBoard({
  fen,
  orientation = 'white',
  badge,
  arrows = [],
  onMove,
}: {
  fen: string
  orientation?: 'white' | 'black'
  badge?: { square: string; quality: MoveQuality } | null
  arrows?: BoardArrow[]
  // When set, the board accepts drag moves; return false to snap the piece back.
  onMove?: (from: string, to: string) => boolean
}) {
  const pos = badge ? squareCorner(badge.square, orientation) : null
  return (
    // aspect-square: react-chessboard's internal board uses height:100%, so if
    // this wrapper is ever stretched taller than its width (e.g. by a flex/grid
    // cell sized to a long move list), the rank rows spread apart with gaps.
    // Locking the wrapper to 1:1 makes that geometry impossible.
    <div className="relative aspect-square w-full max-w-[480px]">
      <Chessboard
        options={{
          position: fen,
          boardOrientation: orientation,
          // No move animations: this board jumps between arbitrary positions
          // (graph clicks, mistake jumps). react-chessboard infers piece
          // "moves" between unrelated FENs and slides many pieces at once,
          // and overlapping animation timeouts can strand pieces on stale
          // squares — the board visually falls apart. Instant snap is both
          // correct and robust for an analysis board.
          showAnimations: false,
          allowDragging: onMove !== undefined,
          arrows: arrows.map((a) => ({ startSquare: a.from, endSquare: a.to, color: a.color })),
          onPieceDrop: onMove
            ? ({ sourceSquare, targetSquare }) =>
                targetSquare ? onMove(sourceSquare, targetSquare) : false
            : undefined,
        }}
      />
      {badge && pos && (
        <div
          className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 drop-shadow"
          style={{ left: `${pos.left}%`, top: `${pos.top}%` }}
        >
          <QualityBadge quality={badge.quality} size={28} />
        </div>
      )}
    </div>
  )
}
