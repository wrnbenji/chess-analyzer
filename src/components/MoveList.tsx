import type { AnalyzedMove } from '../types'
import { QUALITY_COLOR } from '../utils/eval'
import { QualityBadge } from './QualityBadge'

export function MoveList({
  moves,
  ply,
  onSelectPly,
}: {
  moves: AnalyzedMove[]
  ply: number
  onSelectPly: (ply: number) => void
}) {
  return (
    <div className="grid grid-cols-[auto_1fr_1fr] gap-x-2 gap-y-1 text-sm">
      {moves.map((m, i) => {
        const isWhite = m.color === 'w'
        const moveNo = Math.floor(i / 2) + 1
        const active = ply === i + 1
        return (
          <div key={i} className="contents">
            {isWhite && <div className="text-muted">{moveNo}.</div>}
            {!isWhite && i === 0 && <div className="text-muted">1...</div>}
            <button
              onClick={() => onSelectPly(i + 1)}
              className={`flex items-center gap-1 rounded px-1 text-left ${active ? 'bg-surface-2 font-semibold' : ''} ${isWhite ? 'col-start-2' : 'col-start-3'}`}
              style={{ color: QUALITY_COLOR[m.quality] }}
            >
              <span>{m.san}</span>
              <QualityBadge quality={m.quality} size={15} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
