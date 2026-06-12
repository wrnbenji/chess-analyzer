import type { Game } from '../types'
import { byNewest, formatTimeControl, gameOutcome, type GameOutcome } from '../utils/games'

const OUTCOME_STYLE: Record<GameOutcome, { dot: string; text: string; label: string }> = {
  win: { dot: 'bg-emerald-400', text: 'text-emerald-400', label: 'Win' },
  loss: { dot: 'bg-red-400', text: 'text-red-400', label: 'Loss' },
  draw: { dot: 'bg-zinc-500', text: 'text-muted', label: 'Draw' },
}

function formatDate(endTime: number): string {
  const d = new Date(endTime * 1000)
  const sameYear = d.getFullYear() === new Date().getFullYear()
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) })
}

export function GamesList({
  games,
  username,
  onSelect,
}: {
  games: Game[]
  username: string
  onSelect: (g: Game) => void
}) {
  if (games.length === 0) {
    return <div className="p-4 text-muted">No games found for this period.</div>
  }
  const isSearched = (name: string) => name.toLowerCase() === username.toLowerCase()
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line">
      {byNewest(games).map((g) => {
        const outcome = gameOutcome(g, username)
        const style = outcome ? OUTCOME_STYLE[outcome] : null
        return (
          <li key={g.url}>
            <button
              onClick={() => onSelect(g)}
              className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none"
            >
              <span className={`h-2 w-2 shrink-0 rounded-full ${style?.dot ?? 'bg-zinc-600'}`} aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate text-sm">
                <span className={isSearched(g.white.username) ? 'font-semibold text-ink' : undefined}>
                  {g.white.username}
                </span>
                <span className="nums text-xs text-muted"> {g.white.rating}</span>
                <span className="text-muted"> vs </span>
                <span className={isSearched(g.black.username) ? 'font-semibold text-ink' : undefined}>
                  {g.black.username}
                </span>
                <span className="nums text-xs text-muted"> {g.black.rating}</span>
              </span>
              <span className="nums hidden shrink-0 text-xs text-muted sm:inline">{formatTimeControl(g.time_control)}</span>
              <span className="nums shrink-0 text-xs text-muted">{formatDate(g.end_time)}</span>
              <span className={`w-9 shrink-0 text-right text-xs font-semibold ${style?.text ?? 'text-muted'}`}>
                {style?.label ?? '—'}
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
