# Analysis Upgrade — Design

**Date:** 2026-06-10
**Goal:** Bring the analyzer to parity with (or beyond) Chess.com's Game Review: richer per-move insight, tactical education, time analysis, training mode, and multi-game trends — all client-side.

## Scope

Eight features, chosen by the user:

1. Eval graph across the whole game
2. Engine best-move arrow on the board
3. Phase breakdown (opening / middlegame / endgame accuracy)
4. Tactical motif detection (fork, pin, skewer, …) — named, not just "blunder"
5. Mistake tour (jump between mistakes) + interactive training mode (toggle)
6. Top-3 alternative engine lines per position
7. Time-pressure analysis from PGN clock tags
8. Multi-game trend analysis (last N games)

**Layout:** vertical unified view — board, insight, eval graph, stat panels all visible at once (no tabs).
**Theme:** dark, education-tuned — `#0d1117` background, colored left-border insight cards, motif badges.
**Approach:** extend the data model first (B), then build all UI on that foundation.

## 1. Data model & analysis pipeline

### Extended `AnalyzedMove`

```typescript
interface AnalyzedMove {
  // existing fields kept: san, color, fenAfter, toSquare, quality, cpDrop,
  // winBefore, winAfter, winDrop, explanation, bestMoveSan, bestLineSan,
  // mateIn, isSacrifice
  phase: 'opening' | 'middlegame' | 'endgame'
  alternatives: AltMove[]        // top engine lines at the position (up to 3)
  motifs: TacticalMotif[]        // motifs present in the played move
  missedMotifs: TacticalMotif[]  // motifs in the best move the player skipped
  clockSeconds: number | null    // remaining clock after the move (%clk tag)
  timeSpent: number | null       // seconds spent on this move
}

interface AltMove {
  san: string
  lineSan: string[]   // continuation, max 6 plies
  score: Score
  winPercent: number
}

type TacticalMotif =
  | 'fork' | 'pin' | 'skewer' | 'discovered-attack' | 'double-check'
  | 'hanging-piece' | 'back-rank' | 'mate-threat' | 'trapped-piece'
  | 'sacrifice' | 'promotion'
```

### Phase detection — `utils/phase.ts`

Deterministic, FEN-only heuristic:

- **Opening:** while the ply is a book move, OR until minor pieces are developed and castling has happened (~ply 20-24 fallback).
- **Endgame:** queens off the board, OR both sides' non-pawn material ≤ 13 points.
- **Middlegame:** everything between.

Pure function `phaseOfPosition(fen, ply, bookPlies): Phase`, unit-tested.

### Tactical motif detector — `utils/motifs.ts`

Rule-based board inspection via chess.js (no engine dependency):

- **Fork:** after the move, one piece attacks 2+ higher-value or undefended pieces.
- **Pin / skewer:** ray pieces (R/B/Q) x-raying through a piece to a more (pin) or less (skewer) valuable one behind it.
- **Discovered attack:** moving piece unmasks an attack from a piece behind it.
- **Double check:** two pieces give check simultaneously.
- **Hanging piece:** an attacked, undefended piece left en prise.
- **Back-rank:** mate threat pattern on the back rank.
- **Mate threat / trapped piece / sacrifice / promotion:** from engine lines + material analysis (sacrifice detection already exists in `analysis.ts`).

`detectMotifs(fenBefore, move): TacticalMotif[]`. `missedMotifs` = same detector run on the position after the *best* move when the player chose worse — enables "you missed a fork".

### Clock extraction — `utils/clock.ts`

Chess.com PGNs embed `{[%clk 0:09:58.1]}` per move. Parse into per-move remaining seconds; `timeSpent` = previous own clock − current clock + increment (increment parsed from `time_control`, e.g. `"180+2"`). No clk tags → all `null`, time panels hidden.

### Engine settings

`depth 16 → 18`, `MultiPV 2 → 3`. ~30-50% slower per game; acceptable with existing progress bar. Multi-game batch analysis runs at `depth 12` to keep total time reasonable.

## 2. UI components & layout

### Theme

Whole app switches to dark: background `#0d1117`, cards `#1f2937`, quality-colored left borders on insight cards, motif badges as colored pills. Implemented by re-pointing existing Tailwind tokens (`surface`, `surface-2`, `line`, `accent`, `muted`) — component class names largely unchanged.

### New components

**`EvalGraph.tsx`** — full-width SVG area chart below the board row:
- Y axis is win% (White up, Black down, centerline = equal) — win% scale avoids +8 positions flattening the rest.
- Mistakes plotted as colored dots (yellow `?!`, orange `?`, red `??`, teal `!!`).
- Click → board jumps to that ply; current ply marked with a vertical line.
- Phase boundaries shown as faint vertical bands.

**Board arrows** — `ChessBoard` gains an SVG arrow overlay:
- Green arrow = engine best move (toggleable).
- Faint red arrow = the played bad move (only on mistakes).

**`AlternativesPanel.tsx`** — under MoveInsight: up to 3 engine lines, each with move + eval + win% + SAN continuation. Hover/click previews the line's first move as an arrow.

**`MoveInsight` extension** — motif badges (🍴 fork, 📌 pin, …); "You missed: fork on f7" line from `missedMotifs`; time info ("spent 14s, 0:42 left").

**`PhasePanel.tsx`** — per-phase accuracy + error-count bar chart, plus a highlighted takeaway sentence ("Most of your lost win% came in the middlegame").

**`TimePanel.tsx`** — only when clock data exists: per-move time-spent chart and a correlation callout ("2 of your 3 blunders came with under 30s on the clock").

### Layout (top to bottom)

```
[← All games]                  [Review ⇄ Train toggle] [Export]
[EvalBar][   Board + arrows  ][ MoveInsight + motifs    ]
                               [ AlternativesPanel       ]
                               [ MoveList                ]
[              EvalGraph — full width                    ]
[ StatsPanel ][ PhasePanel ][ TimePanel ]
```

Collapses to a single column on mobile.

## 3. Training mode & multi-game trends

### Training mode (Review ⇄ Train toggle)

`useTrainer.ts` hook + `TrainerCard.tsx`:

- Train collects mistakes (miss/mistake/blunder; inaccuracies optional) into an ordered queue.
- Each puzzle: board shows the position *before* the mistake, oriented to the player's color — "Your move — find the best one!"
- The player must make the move **on the board** (click from→to or drag); `ChessBoard` gains an interactive mode with chess.js legality checking.
- Grading: best move = ✓; a top-3 alternative within 5 win% of the best = "almost — also good, but Nf3 is stronger"; anything else = ✗ with retry.
- Hint ladder: 1) motif name ("look for the fork"), 2) which piece moves, 3) reveal.
- End summary: 3/5 found, which motifs are strong/weak.
- Review mode also gets "← Prev mistake / Next mistake →" jump buttons alongside normal navigation.

### Multi-game trends

`TrendsPanel.tsx` + `useTrends.ts`:

- New button atop GamesList: **"Analyze last N games"** (N = 5/10/20).
- Batch analyzes sequentially at depth 12; progress "Game 3/10, move 24/61"; cancellable (extends existing generation mechanism).
- Results cached in memory + `localStorage` (key: game URL + depth); revisits skip re-analysis. On quota overflow, falls back to memory-only.
- Panel shows:
  - **Accuracy trend** — per-game line chart, win/loss colored.
  - **Opening stats** — grouped by ECO: games, win rate, avg accuracy.
  - **Error profile** — blunder/mistake frequency per phase, aggregated.
  - **Motif weaknesses** — toplist of missed motifs ("8 forks missed in 10 games").
  - **Time profile** — aggregated time-pressure blunder rate.

## Error handling & testing

- All new utils (phase, motifs, clock, trend aggregation) are pure functions with vitest unit tests, following the existing test style.
- Motif detector tested against known tactical positions (fixed FENs).
- Graceful degradation: PGNs without clk tags, games < 5 moves, all-book games — panels hide or show "not enough data".
- Batch analysis is cancellable; localStorage failures are non-fatal.

## Out of scope

- Backend/server, auth, Lichess support (per CLAUDE.md MVP rules).
- Neural-net move explanation; explanations remain template-based.
- Chrome extension changes (the new UI ships in the web app first).
