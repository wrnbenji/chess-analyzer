import type { Game } from '../types'

export function GamesList({ games, onSelect }: { games: Game[]; onSelect: (g: Game) => void }) {
  if (games.length === 0) {
    return <div className="p-4 text-muted">No games found for this period.</div>
  }
  return (
    <ul className="divide-y divide-line rounded-lg border border-line">
      {games.map((g) => (
        <li key={g.url}>
          <button
            onClick={() => onSelect(g)}
            className="flex w-full justify-between gap-4 p-3 text-left hover:bg-surface-2"
          >
            <span>
              {g.white.username} ({g.white.rating}) vs {g.black.username} ({g.black.rating})
            </span>
            <span className="text-sm text-muted">{g.white.result} / {g.black.result}</span>
          </button>
        </li>
      ))}
    </ul>
  )
}
