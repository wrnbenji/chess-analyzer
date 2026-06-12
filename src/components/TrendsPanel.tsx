import type { TrendsReport } from '../utils/trends'
import { MOTIF_LABEL } from '../utils/analysis'

export function TrendsPanel({ report }: { report: TrendsReport }) {
  const phases = Object.entries(report.errorsByPhase).filter(([, n]) => n > 0)
  const worstPhase = [...phases].sort((a, b) => b[1] - a[1])[0]
  return (
    <div className="space-y-4">
      <div className="card p-3 text-sm">
        <p className="mb-2 text-xs uppercase tracking-wider text-muted">
          Accuracy, last {report.accuracySeries.length} games
        </p>
        <div className="flex h-24 items-end gap-1">
          {report.accuracySeries.map((p, i) => (
            <span
              key={i}
              className="min-w-[6px] flex-1 rounded-t"
              style={{
                height: `${p.accuracy}%`,
                backgroundColor: p.won ? '#5c8a3c' : '#cc3333',
              }}
              title={`${p.accuracy.toFixed(1)}% ${p.won ? 'won' : 'lost'}`}
            />
          ))}
        </div>
      </div>

      {report.openings.length > 0 && (
        <div className="card p-3 text-sm">
          <p className="mb-2 text-xs uppercase tracking-wider text-muted">Openings</p>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-muted">
                <th className="pb-1">Opening</th>
                <th>Games</th>
                <th>Wins</th>
                <th>Avg acc</th>
              </tr>
            </thead>
            <tbody>
              {report.openings.slice(0, 6).map((o) => (
                <tr key={o.eco}>
                  <td className="py-0.5">{o.eco} {o.name}</td>
                  <td className="nums">{o.games}</td>
                  <td className="nums">{o.wins}</td>
                  <td className="nums">{o.avgAccuracy.toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="card p-3 text-sm">
          <p className="mb-2 text-xs uppercase tracking-wider text-muted">Errors by phase</p>
          {phases.map(([phase, n]) => (
            <p key={phase} className="text-xs text-ink">
              {phase}: <span className="nums font-semibold">{n}</span>
            </p>
          ))}
          {worstPhase && (
            <p className="mt-1 text-xs text-orange-300">Most errors come in the {worstPhase[0]}.</p>
          )}
          {phases.length === 0 && <p className="text-xs text-muted">No errors — impressive.</p>}
        </div>
        <div className="card p-3 text-sm">
          <p className="mb-2 text-xs uppercase tracking-wider text-muted">Missed tactics</p>
          {report.missedMotifs.slice(0, 5).map(({ motif, count }) => (
            <p key={motif} className="text-xs text-ink">
              {MOTIF_LABEL[motif]}: <span className="nums font-semibold">{count}×</span>
            </p>
          ))}
          {report.missedMotifs.length === 0 && <p className="text-xs text-muted">None spotted — nice.</p>}
        </div>
      </div>

      {report.timePressure && report.timePressure.totalErrors > 0 && (
        <div className="card p-3 text-sm">
          <p className="text-xs text-orange-300">
            {report.timePressure.pressureErrors} of {report.timePressure.totalErrors} errors happened with
            under 30s on the clock.
          </p>
        </div>
      )}
    </div>
  )
}
