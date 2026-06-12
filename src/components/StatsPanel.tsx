import type { AnalyzedMove, MoveQuality } from '../types'
import { sideAccuracies } from '../utils/accuracy'

// Columns shown per side, in the order Chess.com lists them.
const COLUMNS: { q: MoveQuality; label: string }[] = [
  { q: 'brilliant', label: '!!' },
  { q: 'great', label: '!' },
  { q: 'best', label: '★' },
  { q: 'excellent', label: '✓' },
  { q: 'miss', label: '✗' },
  { q: 'inaccuracy', label: '?!' },
  { q: 'mistake', label: '?' },
  { q: 'blunder', label: '??' },
]

export function StatsPanel({
  moves,
  opening,
}: {
  moves: AnalyzedMove[]
  opening: { eco: string; name: string } | null
}) {
  const accuracy = sideAccuracies(moves)
  const sides = (['w', 'b'] as const).map((c) => {
    const side = moves.filter((m) => m.color === c)
    const count = (q: MoveQuality) => side.filter((m) => m.quality === q).length
    const avgCpl = side.length ? side.reduce((s, m) => s + m.cpDrop, 0) / side.length : 0
    return {
      color: c === 'w' ? 'White' : 'Black',
      accuracy: (c === 'w' ? accuracy.white : accuracy.black).toFixed(1),
      avgCpl: Math.round(avgCpl),
      counts: COLUMNS.map((col) => count(col.q)),
    }
  })
  return (
    <div className="rounded-lg border border-line bg-surface p-3 text-sm">
      {opening && (
        <div className="mb-2">
          <span className="font-semibold">Opening:</span> {opening.eco} {opening.name}
        </div>
      )}
      <table className="w-full">
        <thead>
          <tr className="text-left text-muted">
            <th>Side</th>
            <th>Accuracy</th>
            <th>Avg CPL</th>
            {COLUMNS.map((col) => (
              <th key={col.q} title={col.q}>
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sides.map((s) => (
            <tr key={s.color}>
              <td>{s.color}</td>
              <td>{s.accuracy}%</td>
              <td>{s.avgCpl}</td>
              {s.counts.map((n, i) => (
                <td key={COLUMNS[i].q}>{n}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
