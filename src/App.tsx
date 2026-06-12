import { useEffect, useState } from 'react'
import { getProfile, getArchives, getGames } from './api/chesscom'
import type { Profile, Game, Score } from './types'
import { useChessGame } from './hooks/useChessGame'
import { useStockfish } from './hooks/useStockfish'
import { useTrainer } from './hooks/useTrainer'
import { useTrends } from './hooks/useTrends'
import { identifyOpening, openingPlyCount } from './utils/opening'
import { extractClocks, parseTimeControl, computeTimeSpent } from './utils/clock'
import { uciOfSan } from './utils/analysis'
import { buildReviewExport } from './utils/reviewExport'
import { ProfileCard } from './components/ProfileCard'
import { GamesList } from './components/GamesList'
import { ChessBoard, type BoardArrow } from './components/ChessBoard'
import { MoveList } from './components/MoveList'
import { MoveInsight } from './components/MoveInsight'
import { AlternativesPanel } from './components/AlternativesPanel'
import { EvalBar } from './components/EvalBar'
import { EvalGraph } from './components/EvalGraph'
import { StatsPanel } from './components/StatsPanel'
import { PhasePanel } from './components/PhasePanel'
import { TimePanel } from './components/TimePanel'
import { TrainerCard } from './components/TrainerCard'
import { TrendsPanel } from './components/TrendsPanel'
import { ShareDialog } from './components/ShareDialog'

const ERROR_QUALITIES = new Set(['inaccuracy', 'mistake', 'blunder', 'miss'])

export default function App() {
  const [username, setUsername] = useState('')
  const [profile, setProfile] = useState<Profile | null>(null)
  const [games, setGames] = useState<Game[]>([])
  const [selected, setSelected] = useState<Game | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showBestArrow, setShowBestArrow] = useState(true)
  const [previewSan, setPreviewSan] = useState<string | null>(null)
  const [mode, setMode] = useState<'review' | 'train'>('review')
  const [shareOpen, setShareOpen] = useState(false)

  const activePgn = selected?.pgn
  const game = useChessGame(activePgn ?? null)
  const engine = useStockfish()
  const trends = useTrends(engine.engineRef)
  const [trendCount, setTrendCount] = useState(10)

  // Trigger batch analysis once a game is selected, parsed, and the engine is ready.
  useEffect(() => {
    if (selected && engine.ready && game.moves.length > 0) {
      const bookPlies = activePgn ? openingPlyCount(activePgn) : 0
      const clocks = activePgn ? extractClocks(activePgn) : []
      // Daily/unparseable time controls give no usable base time — skip timeSpent.
      const tc = parseTimeControl(selected.time_control)
      const timeSpent = tc ? computeTimeSpent(clocks, tc.base, tc.inc) : []
      engine.analyze(game.fens, game.moves, { bookPlies, clocks, timeSpent })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, engine.ready, game.moves.length])

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    setError(null); setLoading(true); setSelected(null); setProfile(null); setGames([])
    setMode('review'); setShareOpen(false)
    trends.clear()
    try {
      const p = await getProfile(username.trim())
      setProfile(p)
      const archives = await getArchives(username.trim())
      if (archives.length === 0) { setGames([]); return }
      const latest = await getGames(archives[archives.length - 1])
      setGames(latest)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  const opening = activePgn ? identifyOpening(activePgn) : null

  // The side the searched user played — the education panels focus on them.
  const userColor: 'w' | 'b' | null = !selected || !profile
    ? null
    : selected.white.username.toLowerCase() === profile.username.toLowerCase()
      ? 'w'
      : selected.black.username.toLowerCase() === profile.username.toLowerCase()
        ? 'b'
        : 'w' // analyzing two strangers: default to White

  const trainer = useTrainer(engine.analyzed, game.fens, userColor ?? 'w')

  function handleExportReview() {
    if (!selected || !engine.analyzed) return
    const exported = buildReviewExport({ game: selected, moves: engine.analyzed, opening })
    const blob = new Blob([JSON.stringify(exported, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    const white = selected.white.username.replace(/[^a-z0-9_-]/gi, '_')
    const black = selected.black.username.replace(/[^a-z0-9_-]/gi, '_')
    link.href = url
    link.download = `review-${white}-vs-${black}-${selected.end_time}.json`
    link.click()
    URL.revokeObjectURL(url)
  }

  // engine.scores[ply] is from the side-to-move's perspective at that position.
  // Normalize to White: even ply (White to move) keep sign; odd ply negate.
  // Preserve mate when negating so downstream consumers keep the mate field.
  const raw = engine.scores[game.ply] ?? { cp: 0 }
  const whiteScore: Score =
    game.ply % 2 === 0
      ? raw
      : raw.mate !== undefined
        ? { mate: -raw.mate }
        : { cp: -(raw.cp ?? 0) }

  const progressPct = engine.progress.total
    ? Math.round((engine.progress.done / engine.progress.total) * 100)
    : 0

  // Arrows for the position on the board: the engine's best move from here
  // (green). engine.analyzed[ply] is the move about to be played.
  const currentAnalysis = engine.analyzed?.[game.ply] ?? null
  const lastMove = game.ply > 0 ? engine.analyzed?.[game.ply - 1] ?? null : null
  const arrows: BoardArrow[] = []
  if (showBestArrow && currentAnalysis?.alternatives[0]) {
    const bestUci = uciOfSan(game.currentFen, currentAnalysis.alternatives[0].san)
    if (bestUci) arrows.push({ from: bestUci.from, to: bestUci.to, color: '#5c8a3c' })
  }
  if (previewSan) {
    const uci = uciOfSan(game.currentFen, previewSan)
    if (uci) arrows.push({ from: uci.from, to: uci.to, color: '#4fc3f7' })
  }
  // On a mistake ply, show the played move as a faint red arrow (from the
  // position it was played in, which is one ply back).
  if (lastMove && ERROR_QUALITIES.has(lastMove.quality)) {
    const uci = uciOfSan(game.fens[game.ply - 1], lastMove.san)
    if (uci) arrows.push({ from: uci.from, to: uci.to, color: 'rgb(204 51 51 / 0.6)' })
  }

  // Plies (1-based, "after move i" positions) where the user erred.
  const mistakePlies = (engine.analyzed ?? [])
    .map((m, i) => ({ m, ply: i + 1 }))
    .filter(({ m }) => m.color === userColor && ERROR_QUALITIES.has(m.quality))
    .map(({ ply }) => ply)

  const nextMistake = () => {
    const target = mistakePlies.find((p) => p > game.ply)
    if (target !== undefined) game.goTo(target)
  }
  const prevMistake = () => {
    const target = [...mistakePlies].reverse().find((p) => p < game.ply)
    if (target !== undefined) game.goTo(target)
  }

  // Train mode: the board shows the puzzle position and accepts moves.
  const training = mode === 'train' && trainer.current !== null
  const boardFen = training ? trainer.current!.fen : game.currentFen
  const boardOnMove = training
    ? (from: string, to: string) => trainer.attempt(from, to) !== 'wrong'
    : undefined

  return (
    <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8 sm:py-12">
      <header className="flex flex-col gap-5 border-b border-line pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.28em] text-muted">Game Review</p>
          <h1 className="mt-1 font-display text-4xl font-semibold leading-none tracking-tight">
            Chess Analyzer
          </h1>
          <p className="mt-2 max-w-prose text-sm text-muted">
            Stockfish-annotated review of any Chess.com game — read it like a book.
          </p>
          <a
            href="https://github.com/wrnbenji/chess-analyzer"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-[#30363d] bg-[#21262d] px-3 py-1.5 text-xs font-medium text-[#e6edf3] transition-colors hover:bg-[#30363d] hover:border-[#8b949e]"
          >
            <svg height="14" width="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
              <path d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z" />
            </svg>
            <svg height="12" width="12" viewBox="0 0 16 16" fill="#e3b341" aria-hidden="true">
              <path d="M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.751.751 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25Z" />
            </svg>
            Star on GitHub
          </a>
        </div>
        <form onSubmit={handleSearch} className="flex w-full max-w-sm gap-2">
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Chess.com username"
            className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted focus:border-accent"
          />
          <button className="btn btn-primary px-4 py-2 text-sm" disabled={loading}>
            {loading ? 'Loading…' : 'Search'}
          </button>
        </form>
      </header>

      {error && (
        <p className="mt-6 rounded-lg bg-surface-2 px-4 py-3 text-sm text-accent-press">{error}</p>
      )}

      {profile && (
        <div className="mt-6">
          <ProfileCard profile={profile} />
        </div>
      )}

      {!selected && profile && (
        <div className="mt-6">
          <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
            <select
              value={trendCount}
              onChange={(e) => setTrendCount(Number(e.target.value))}
              className="rounded-lg border border-line bg-surface px-2 py-1.5"
            >
              {[5, 10, 20].map((n) => (
                <option key={n} value={n}>last {n}</option>
              ))}
            </select>
            <button
              onClick={() => trends.run(games.slice(-trendCount), profile.username)}
              disabled={!engine.ready || trends.progress !== null || games.length === 0}
              className="btn btn-primary px-3 py-1.5 text-sm"
            >
              Analyze trends
            </button>
            {trends.progress && (
              <span className="text-muted">
                Game {trends.progress.game}/{trends.progress.totalGames}, move{' '}
                {trends.progress.move}/{trends.progress.totalMoves}
                <button onClick={trends.cancel} className="btn btn-ghost ml-2 px-2 py-1 text-xs">
                  Cancel
                </button>
              </span>
            )}
          </div>
          {trends.error && <p className="mb-3 text-sm text-accent-press">{trends.error}</p>}
          {trends.report && (
            <div className="mb-4">
              <TrendsPanel report={trends.report} />
            </div>
          )}
          <GamesList games={games} onSelect={setSelected} />
        </div>
      )}

      {selected && (
        <div className="mt-6 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <button
              onClick={() => { setSelected(null); setMode('review'); setShareOpen(false) }}
              className="btn btn-ghost px-3 py-1.5 text-sm"
            >
              ← All games
            </button>
            <div className="flex items-center gap-3">
              {engine.analyzed && (
                <div className="flex overflow-hidden rounded-lg border border-line text-sm">
                  {(['review', 'train'] as const).map((m) => (
                    <button
                      key={m}
                      onClick={() => setMode(m)}
                      className={`px-3 py-1.5 ${mode === m ? 'bg-accent text-paper' : 'text-muted hover:bg-surface-2'}`}
                    >
                      {m === 'review' ? '📖 Review' : '🎯 Train'}
                    </button>
                  ))}
                </div>
              )}
              {!engine.analyzed && !engine.error && (
                <div className="flex items-center gap-2 text-sm text-muted">
                  <span className="nums">{engine.progress.done}/{engine.progress.total}</span>
                  <span className="relative h-1.5 w-28 overflow-hidden rounded-full bg-surface-2">
                    <span
                      className="absolute inset-y-0 left-0 rounded-full bg-accent transition-[width] duration-300"
                      style={{ width: `${progressPct}%` }}
                    />
                  </span>
                  <span>Analyzing</span>
                </div>
              )}
              {engine.analyzed && (
                <>
                  <button onClick={() => setShareOpen(true)} className="btn btn-ghost px-3 py-1.5 text-sm">
                    Share GIF
                  </button>
                  <button onClick={handleExportReview} className="btn btn-ghost px-3 py-1.5 text-sm">
                    Export JSON
                  </button>
                </>
              )}
            </div>
          </div>

          {engine.error && (
            <p className="rounded-lg bg-surface-2 px-4 py-3 text-sm text-accent-press">{engine.error}</p>
          )}

          <div className="grid gap-6 lg:grid-cols-[auto_minmax(0,1fr)]">
            {/* items-start: the grid row is as tall as the move-list column;
                without it the board/eval bar stretch to that height. */}
            <div className="flex items-start gap-3">
              {/* The eval bar tracks the review position; in train mode it would
                  mislead (the board shows the puzzle, not game.ply). */}
              {mode === 'review' && <EvalBar score={whiteScore} />}
              <ChessBoard
                fen={boardFen}
                orientation={userColor === 'b' ? 'black' : 'white'}
                arrows={mode === 'train' ? [] : arrows}
                onMove={boardOnMove}
                badge={
                  mode === 'review' && engine.analyzed && game.ply > 0 && engine.analyzed[game.ply - 1]
                    ? { square: engine.analyzed[game.ply - 1].toSquare, quality: engine.analyzed[game.ply - 1].quality }
                    : null
                }
              />
            </div>

            <div className="flex min-w-0 flex-col gap-4">
              {mode === 'train' ? (
                <TrainerCard trainer={trainer} />
              ) : (
                <>
                  <div className="flex flex-wrap gap-1.5">
                    <button onClick={game.start} className="btn btn-ghost h-9 w-9 text-base" aria-label="Start">⏮</button>
                    <button onClick={game.prev} className="btn btn-ghost h-9 w-9 text-base" aria-label="Previous">◀</button>
                    <button onClick={game.next} className="btn btn-ghost h-9 w-9 text-base" aria-label="Next">▶</button>
                    <button onClick={game.end} className="btn btn-ghost h-9 w-9 text-base" aria-label="End">⏭</button>
                    <button
                      onClick={() => setShowBestArrow((v) => !v)}
                      className={`btn h-9 px-3 text-sm ${showBestArrow ? 'btn-primary' : 'btn-ghost'}`}
                    >
                      Best move
                    </button>
                    {mistakePlies.length > 0 && (
                      <>
                        <button onClick={prevMistake} className="btn btn-ghost h-9 px-2 text-sm" aria-label="Previous mistake">← err</button>
                        <button onClick={nextMistake} className="btn btn-ghost h-9 px-2 text-sm" aria-label="Next mistake">err →</button>
                      </>
                    )}
                  </div>

                  {engine.analyzed && game.ply > 0 && engine.analyzed[game.ply - 1] && (
                    <MoveInsight move={engine.analyzed[game.ply - 1]} moveNumber={Math.floor((game.ply - 1) / 2) + 1} />
                  )}

                  {currentAnalysis && (
                    <AlternativesPanel move={currentAnalysis} onPreview={setPreviewSan} />
                  )}

                  {engine.analyzed && (
                    <MoveList moves={engine.analyzed} ply={game.ply} onSelectPly={game.goTo} />
                  )}
                </>
              )}
            </div>
          </div>

          {engine.analyzed && (
            <EvalGraph moves={engine.analyzed} ply={game.ply} onSelectPly={game.goTo} />
          )}

          {engine.analyzed && userColor && (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <StatsPanel moves={engine.analyzed} opening={opening} />
              <PhasePanel moves={engine.analyzed} color={userColor} />
              <TimePanel moves={engine.analyzed} color={userColor} />
            </div>
          )}

          {shareOpen && engine.analyzed && selected && (
            <ShareDialog
              moves={engine.analyzed}
              fens={game.fens}
              currentPly={game.ply}
              white={selected.white.username}
              black={selected.black.username}
              onClose={() => setShareOpen(false)}
            />
          )}
        </div>
      )}
    </div>
  )
}
