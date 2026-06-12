import { useMemo, type MouseEvent } from 'react'
import type { AnalyzedMove, GamePhase } from '../types'
import { QUALITY_COLOR } from '../utils/eval'
import { whiteWinSeries } from '../utils/winSeries'

const W = 800
const H = 120
const DOT_QUALITIES = new Set(['inaccuracy', 'mistake', 'blunder', 'miss', 'brilliant', 'great'])

// y for a white win% value: 100% -> top, 0% -> bottom.
function y(win: number): number {
  return H - (win / 100) * H
}

export function EvalGraph({
  moves,
  ply,
  onSelectPly,
}: {
  moves: AnalyzedMove[]
  ply: number
  onSelectPly: (ply: number) => void
}) {
  const series = useMemo(() => whiteWinSeries(moves), [moves])
  if (series.length < 2) return null
  const x = (i: number) => (i / (series.length - 1)) * W

  const linePoints = series.map((win, i) => `${x(i)},${y(win)}`).join(' ')
  const areaPoints = `0,${H} ${linePoints} ${W},${H}`

  // Phase bands: contiguous runs of moves sharing a phase.
  const phaseBands: Array<{ from: number; to: number; phase: GamePhase }> = []
  moves.forEach((m, i) => {
    const last = phaseBands[phaseBands.length - 1]
    if (!last || last.phase !== m.phase) phaseBands.push({ from: i, to: i + 1, phase: m.phase })
    else last.to = i + 1
  })

  function handleClick(e: MouseEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    const frac = (e.clientX - rect.left) / rect.width
    onSelectPly(Math.round(frac * (series.length - 1)))
  }

  return (
    <div className="card overflow-hidden p-2">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="block h-28 w-full cursor-pointer"
        onClick={handleClick}
        role="img"
        aria-label="Evaluation graph"
        preserveAspectRatio="none"
      >
        {phaseBands.map((b, i) => (
          <rect
            key={i}
            x={x(b.from)}
            y={0}
            width={x(b.to) - x(b.from)}
            height={H}
            fill={b.phase === 'middlegame' ? 'rgb(255 255 255 / 0.03)' : 'transparent'}
          />
        ))}
        {/* White-advantage area fill */}
        <polygon points={areaPoints} fill="rgb(79 195 247 / 0.15)" />
        <line x1={0} y1={H / 2} x2={W} y2={H / 2} stroke="var(--line)" strokeWidth={1} />
        <polyline points={linePoints} fill="none" stroke="var(--accent)" strokeWidth={1.5} />
        {moves.map((m, i) =>
          DOT_QUALITIES.has(m.quality) ? (
            <circle
              key={i}
              cx={x(i + 1)}
              cy={y(series[i + 1])}
              r={3.5}
              fill={QUALITY_COLOR[m.quality]}
              stroke="var(--paper)"
              strokeWidth={1}
            />
          ) : null,
        )}
        {/* Current ply marker */}
        <line x1={x(ply)} y1={0} x2={x(ply)} y2={H} stroke="var(--ink)" strokeWidth={1} opacity={0.5} />
      </svg>
    </div>
  )
}
