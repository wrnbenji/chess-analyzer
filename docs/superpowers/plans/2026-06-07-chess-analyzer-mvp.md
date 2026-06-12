# Chess Analyzer MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Working browser-only MVP: a Chess.com username → game list → open one game → board + color-coded move list + Stockfish move-by-move analysis with accuracy and summary stats.

**Architecture:** React + Vite + TypeScript SPA. Layered: pure `api/` fetch wrapper, `engine/` Stockfish Web Worker wrapper with a serial command queue, pure `utils/` logic (move classification, accuracy, opening lookup), `hooks/` for chess.js state and engine batch analysis, presentational `components/`. No server, no auth, no persistence.

**Tech Stack:** Vite, React 18, TypeScript, Tailwind CSS, chess.js 1.x, react-chessboard 5.x, stockfish 18 (single-threaded lite WASM), Vitest for unit tests.

**Key facts the engineer must know:**
- chess.js 1.x: `import { Chess } from 'chess.js'`. `chess.loadPgn(pgn)` throws on invalid PGN. `chess.history({ verbose: true })` returns moves each with `.san`, `.color` (`'w'`/`'b'`), `.before` (FEN before move), `.after` (FEN after move). Use these FENs directly — no manual replay needed.
- react-chessboard 5.x: `import { Chessboard } from 'react-chessboard'`. Render `<Chessboard options={{ position: fen, boardOrientation, allowDragging: false }} />`. `position` is a FEN string; `boardOrientation` is `'white'` | `'black'`.
- Stockfish single-threaded build files live in `node_modules/stockfish/bin/stockfish-18-lite-single.js` and `stockfish-18-lite-single.wasm`. Copy BOTH into `public/stockfish/`. Single-threaded = no `SharedArrayBuffer` = no COOP/COEP headers needed. Instantiate via `new Worker('/stockfish/stockfish-18-lite-single.js')`.
- Stockfish UCI protocol: send `uci`, `isready`, `position fen <FEN>`, `go depth <N>`. It streams `info ... score cp <X>` or `info ... score mate <N>` lines, then a final `bestmove <move>` line. Score is from the side-to-move's perspective.
- Evaluation default depth: **15**.

---

## File Structure

```
chess-analyzer/
  index.html
  package.json
  vite.config.ts
  tailwind.config.ts
  postcss.config.js
  tsconfig.json
  tsconfig.node.json
  vitest.config.ts
  public/
    stockfish/
      stockfish-18-lite-single.js
      stockfish-18-lite-single.wasm
  src/
    index.css
    main.tsx
    App.tsx
    types.ts                  # shared domain types (Score, Profile, Game, MoveQuality, AnalyzedMove)
    api/chesscom.ts
    api/chesscom.test.ts
    engine/uci.ts             # pure UCI line parsing (testable without a Worker)
    engine/uci.test.ts
    engine/stockfish.ts       # StockfishEngine class wrapping the Worker
    utils/eval.ts
    utils/eval.test.ts
    utils/accuracy.ts
    utils/accuracy.test.ts
    utils/opening.ts
    utils/opening.test.ts
    openings/eco.json
    hooks/useChessGame.ts
    hooks/useStockfish.ts
    components/ProfileCard.tsx
    components/GamesList.tsx
    components/ChessBoard.tsx
    components/MoveList.tsx
    components/EvalBar.tsx
    components/StatsPanel.tsx
```

---

## Task 1: Project scaffold + tooling

**Files:**
- Create: `package.json`, `vite.config.ts`, `vitest.config.ts`, `tsconfig.json`, `tsconfig.node.json`, `tailwind.config.ts`, `postcss.config.js`, `index.html`, `src/main.tsx`, `src/App.tsx`, `src/index.css`

- [ ] **Step 1: Scaffold Vite React-TS project in place**

Run (the working dir already contains `CLAUDE.md` + `docs/`, so scaffold into a temp dir and move files in):

```bash
npm create vite@latest .vite-tmp -- --template react-ts
cp -r .vite-tmp/. . && rm -rf .vite-tmp
```

- [ ] **Step 2: Install dependencies**

```bash
npm install chess.js@^1 react-chessboard@^5 stockfish@^18
npm install -D tailwindcss@^3 postcss autoprefixer vitest@^4 @testing-library/react @testing-library/jest-dom jsdom
```

- [ ] **Step 3: Configure Tailwind**

Create `tailwind.config.ts`:

```ts
import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: { extend: {} },
  plugins: [],
} satisfies Config
```

Create `postcss.config.js`:

```js
export default {
  plugins: { tailwindcss: {}, autoprefixer: {} },
}
```

Replace `src/index.css` with:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Step 4: Configure Vitest**

Create `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: [],
  },
})
```

Add to `package.json` `scripts`: `"test": "vitest run"`, `"test:watch": "vitest"`.

- [ ] **Step 5: Minimal App placeholder**

Replace `src/App.tsx`:

```tsx
export default function App() {
  return <div className="p-8 text-2xl font-bold">Chess Analyzer</div>
}
```

Ensure `src/main.tsx` imports `./index.css`.

- [ ] **Step 6: Verify build and dev server**

Run: `npm run build`
Expected: build succeeds, `dist/` produced, no TypeScript errors.

- [ ] **Step 7: Copy Stockfish WASM assets into public/**

```bash
mkdir -p public/stockfish
cp node_modules/stockfish/bin/stockfish-18-lite-single.js public/stockfish/
cp node_modules/stockfish/bin/stockfish-18-lite-single.wasm public/stockfish/
```

Verify: `ls public/stockfish/` shows both files.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "chore: scaffold Vite React-TS project with Tailwind, Vitest, Stockfish assets"
```

---

## Task 2: Shared domain types

**Files:**
- Create: `src/types.ts`

- [ ] **Step 1: Define shared types**

Create `src/types.ts`:

```ts
// Engine score from the side-to-move's perspective.
export interface Score {
  cp?: number    // centipawns
  mate?: number  // moves to mate (signed: positive = side-to-move mates)
}

export interface Profile {
  username: string
  avatar?: string
  url: string
}

export interface PlayerSide {
  username: string
  rating: number
  result: string
}

export interface Game {
  url: string
  pgn: string
  time_control: string
  end_time: number
  rated: boolean
  white: PlayerSide
  black: PlayerSide
}

export type MoveQuality = 'best' | 'good' | 'inaccuracy' | 'mistake' | 'blunder'

export interface AnalyzedMove {
  san: string
  color: 'w' | 'b'
  fenAfter: string
  quality: MoveQuality
  cpDrop: number // centipawn loss from the mover's perspective, >= 0
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/types.ts
git commit -m "feat: add shared domain types"
```

---

## Task 3: UCI line parsing (pure, testable)

**Files:**
- Create: `src/engine/uci.ts`, `src/engine/uci.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/engine/uci.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { parseScore, isBestMove } from './uci'

describe('parseScore', () => {
  it('parses centipawn score', () => {
    const line = 'info depth 15 seldepth 20 multipv 1 score cp 34 nodes 1000 pv e2e4'
    expect(parseScore(line)).toEqual({ cp: 34 })
  })

  it('parses negative centipawn score', () => {
    expect(parseScore('info depth 12 score cp -128 pv d7d5')).toEqual({ cp: -128 })
  })

  it('parses mate score', () => {
    expect(parseScore('info depth 18 score mate 3 pv h5f7')).toEqual({ mate: 3 })
  })

  it('parses negative mate score', () => {
    expect(parseScore('info depth 18 score mate -2 pv')).toEqual({ mate: -2 })
  })

  it('returns null for lines without a score', () => {
    expect(parseScore('info depth 1 currmove e2e4 currmovenumber 1')).toBeNull()
  })
})

describe('isBestMove', () => {
  it('detects bestmove lines', () => {
    expect(isBestMove('bestmove e2e4 ponder e7e5')).toBe(true)
    expect(isBestMove('info depth 15 score cp 10')).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/engine/uci.test.ts`
Expected: FAIL — `parseScore`/`isBestMove` not exported.

- [ ] **Step 3: Implement**

Create `src/engine/uci.ts`:

```ts
import type { Score } from '../types'

export function parseScore(line: string): Score | null {
  const mate = line.match(/score mate (-?\d+)/)
  if (mate) return { mate: parseInt(mate[1], 10) }
  const cp = line.match(/score cp (-?\d+)/)
  if (cp) return { cp: parseInt(cp[1], 10) }
  return null
}

export function isBestMove(line: string): boolean {
  return line.startsWith('bestmove')
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/engine/uci.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/engine/uci.ts src/engine/uci.test.ts
git commit -m "feat: add pure UCI score line parsing"
```

---

## Task 4: Move classification

**Files:**
- Create: `src/utils/eval.ts`, `src/utils/eval.test.ts`

**Domain rules:**
- `scoreToCp(score)` converts a `Score` to a single centipawn number from the side-to-move's perspective. Mate is mapped to a large value: `mate > 0` → `100000 - mate*100`; `mate < 0` → `-100000 - mate*100` (so `mate -1` ≈ `-99900`). Missing both → `0`.
- A move is evaluated by comparing the position BEFORE the move (side-to-move = mover) and AFTER the move (side-to-move = opponent). Both engine scores are from the side-to-move's perspective, so to express both from the mover's perspective we NEGATE the after-score. `cpDrop = cpBeforeFromMover - (-cpAfterFromOpponent) = cpBefore + cpAfter`... — careful. Implement and test `cpDrop` directly:
  - `cpBefore` = engine score at the pre-move position, perspective = mover.
  - `cpAfter` = engine score at the post-move position, perspective = opponent. Mover's value = `-cpAfter`.
  - `cpDrop = cpBefore - (-cpAfter)` is WRONG. Correct: drop = how much the mover lost = `cpBefore - moverValueAfter = cpBefore - (-cpAfter) = cpBefore + cpAfter`. Clamp negative drops (mover improved beyond engine estimate) to 0.
- Thresholds on `cpDrop`: `<20` best, `<50` good, `<100` inaccuracy, `<250` mistake, else blunder.

- [ ] **Step 1: Write the failing test**

Create `src/utils/eval.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { scoreToCp, computeDrop, classifyDrop, QUALITY_COLOR, QUALITY_SYMBOL } from './eval'

describe('scoreToCp', () => {
  it('returns cp directly', () => {
    expect(scoreToCp({ cp: 55 })).toBe(55)
    expect(scoreToCp({ cp: -300 })).toBe(-300)
  })
  it('maps positive mate to large positive', () => {
    expect(scoreToCp({ mate: 3 })).toBe(100000 - 300)
  })
  it('maps negative mate to large negative', () => {
    expect(scoreToCp({ mate: -1 })).toBe(-100000 + 100)
  })
  it('defaults missing score to 0', () => {
    expect(scoreToCp({})).toBe(0)
  })
})

describe('computeDrop', () => {
  // before: mover perspective; after: opponent perspective (engine convention)
  it('zero drop when mover keeps equal eval', () => {
    // mover was +30; after move opponent is at -30 (i.e. mover still +30)
    expect(computeDrop({ cp: 30 }, { cp: -30 })).toBe(0)
  })
  it('positive drop when mover worsens', () => {
    // mover was +30; after move opponent is at +120 (mover now -120) => lost 150
    expect(computeDrop({ cp: 30 }, { cp: 120 })).toBe(150)
  })
  it('clamps improvement to zero', () => {
    // mover was 0; after move opponent at -200 (mover +200) => negative drop -> 0
    expect(computeDrop({ cp: 0 }, { cp: -200 })).toBe(0)
  })
})

describe('classifyDrop', () => {
  it('classifies by threshold', () => {
    expect(classifyDrop(0)).toBe('best')
    expect(classifyDrop(19)).toBe('best')
    expect(classifyDrop(20)).toBe('good')
    expect(classifyDrop(49)).toBe('good')
    expect(classifyDrop(50)).toBe('inaccuracy')
    expect(classifyDrop(99)).toBe('inaccuracy')
    expect(classifyDrop(100)).toBe('mistake')
    expect(classifyDrop(249)).toBe('mistake')
    expect(classifyDrop(250)).toBe('blunder')
  })
})

describe('maps', () => {
  it('has a color and symbol per quality', () => {
    for (const q of ['best', 'good', 'inaccuracy', 'mistake', 'blunder'] as const) {
      expect(QUALITY_COLOR[q]).toMatch(/^#/)
      expect(typeof QUALITY_SYMBOL[q]).toBe('string')
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/eval.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/utils/eval.ts`:

```ts
import type { Score, MoveQuality } from '../types'

const MATE_BASE = 100000

export function scoreToCp(score: Score): number {
  if (score.mate !== undefined) {
    return score.mate > 0
      ? MATE_BASE - score.mate * 100
      : -MATE_BASE - score.mate * 100
  }
  if (score.cp !== undefined) return score.cp
  return 0
}

// before: from mover's perspective. after: from opponent's perspective (engine convention).
// Mover's value after = -scoreToCp(after). Drop = cpBefore - moverValueAfter.
export function computeDrop(before: Score, after: Score): number {
  const cpBefore = scoreToCp(before)
  const moverValueAfter = -scoreToCp(after)
  const drop = cpBefore - moverValueAfter
  return Math.max(0, drop)
}

export function classifyDrop(drop: number): MoveQuality {
  if (drop < 20) return 'best'
  if (drop < 50) return 'good'
  if (drop < 100) return 'inaccuracy'
  if (drop < 250) return 'mistake'
  return 'blunder'
}

export const QUALITY_COLOR: Record<MoveQuality, string> = {
  best: '#5c8a3c',
  good: '#7fa650',
  inaccuracy: '#f0c040',
  mistake: '#e07000',
  blunder: '#cc3333',
}

export const QUALITY_SYMBOL: Record<MoveQuality, string> = {
  best: '✓',
  good: '',
  inaccuracy: '?!',
  mistake: '?',
  blunder: '??',
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/eval.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/eval.ts src/utils/eval.test.ts
git commit -m "feat: add move classification with mover-perspective drop"
```

---

## Task 5: Accuracy calculation

**Files:**
- Create: `src/utils/accuracy.ts`, `src/utils/accuracy.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/utils/accuracy.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { calcAccuracy } from './accuracy'

describe('calcAccuracy', () => {
  it('returns 100 for empty input', () => {
    expect(calcAccuracy([])).toBe(100)
  })
  it('returns ~100 for zero drops', () => {
    expect(calcAccuracy([0, 0, 0])).toBeCloseTo(100, 0)
  })
  it('decreases as drops grow', () => {
    const low = calcAccuracy([10, 10])
    const high = calcAccuracy([300, 300])
    expect(low).toBeGreaterThan(high)
  })
  it('stays within 0..100', () => {
    const v = calcAccuracy([5000, 5000])
    expect(v).toBeGreaterThanOrEqual(0)
    expect(v).toBeLessThanOrEqual(100)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/accuracy.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/utils/accuracy.ts`:

```ts
// Approximation — Chess.com's exact algorithm is not public.
export function calcAccuracy(drops: number[]): number {
  if (drops.length === 0) return 100
  const avgDrop = drops.reduce((a, b) => a + b, 0) / drops.length
  const accuracy = 103.1668 * Math.exp(-0.04354 * (avgDrop / 100)) - 3.1669
  return Math.max(0, Math.min(100, accuracy))
}
```

Note: drops are in centipawns; the curve constant expects pawn-scaled input, hence `avgDrop / 100`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/accuracy.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/accuracy.ts src/utils/accuracy.test.ts
git commit -m "feat: add accuracy approximation"
```

---

## Task 6: Opening identification

**Files:**
- Create: `src/openings/eco.json`, `src/utils/opening.ts`, `src/utils/opening.test.ts`

- [ ] **Step 1: Create a minimal ECO dataset**

Create `src/openings/eco.json` (small seed set; the longest matching prefix wins):

```json
[
  { "eco": "C20", "name": "King's Pawn Game", "moves": "1. e4 e5" },
  { "eco": "C40", "name": "King's Knight Opening", "moves": "1. e4 e5 2. Nf3" },
  { "eco": "C60", "name": "Ruy Lopez", "moves": "1. e4 e5 2. Nf3 Nc6 3. Bb5" },
  { "eco": "B20", "name": "Sicilian Defense", "moves": "1. e4 c5" },
  { "eco": "B27", "name": "Sicilian Defense", "moves": "1. e4 c5 2. Nf3" },
  { "eco": "D02", "name": "Queen's Pawn Game", "moves": "1. d4 d5" },
  { "eco": "D30", "name": "Queen's Gambit", "moves": "1. d4 d5 2. c4" },
  { "eco": "A40", "name": "Queen's Pawn Opening", "moves": "1. d4" },
  { "eco": "B00", "name": "King's Pawn Opening", "moves": "1. e4" }
]
```

- [ ] **Step 2: Write the failing test**

Create `src/utils/opening.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { extractMoves, identifyOpening } from './opening'

const PGN = `[Event "Live Chess"]
[Site "Chess.com"]
[White "a"]
[Black "b"]

1. e4 {[%clk 0:09:59]} e5 {[%clk 0:09:58]} 2. Nf3 {[%clk 0:09:55]} Nc6 1-0`

describe('extractMoves', () => {
  it('strips headers, clocks, and result, keeping move-numbered SAN', () => {
    expect(extractMoves(PGN)).toBe('1. e4 e5 2. Nf3 Nc6')
  })
})

describe('identifyOpening', () => {
  it('returns the longest matching opening', () => {
    expect(identifyOpening(PGN)).toEqual({ eco: 'C40', name: "King's Knight Opening" })
  })
  it('returns null when nothing matches', () => {
    expect(identifyOpening('[White "x"]\n\n1. h4 h5')).toBeNull()
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/utils/opening.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement**

Create `src/utils/opening.ts`:

```ts
import eco from '../openings/eco.json'

interface EcoEntry { eco: string; name: string; moves: string }

// Turn a raw PGN into a normalized "1. e4 e5 2. Nf3 ..." move string.
export function extractMoves(pgn: string): string {
  return pgn
    .replace(/\[[^\]]*\]/g, '')        // header tags
    .replace(/\{[^}]*\}/g, '')         // comments / clocks
    .replace(/\b(1-0|0-1|1\/2-1\/2|\*)\s*$/g, '') // result
    .replace(/\$\d+/g, '')             // NAGs
    .replace(/\s+/g, ' ')
    .trim()
}

export function identifyOpening(pgn: string): { eco: string; name: string } | null {
  const moveStr = extractMoves(pgn)
  let best: { eco: string; name: string } | null = null
  let bestLen = -1
  for (const entry of eco as EcoEntry[]) {
    if (moveStr.startsWith(entry.moves) && entry.moves.length > bestLen) {
      best = { eco: entry.eco, name: entry.name }
      bestLen = entry.moves.length
    }
  }
  return best
}
```

Ensure `tsconfig.json` has `"resolveJsonModule": true` (Vite's default react-ts tsconfig includes it; verify and add if missing).

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/utils/opening.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/openings/eco.json src/utils/opening.ts src/utils/opening.test.ts
git commit -m "feat: add ECO opening identification with SAN normalization"
```

---

## Task 7: Chess.com API wrapper

**Files:**
- Create: `src/api/chesscom.ts`, `src/api/chesscom.test.ts`

- [ ] **Step 1: Write the failing test (mock fetch)**

Create `src/api/chesscom.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import { getProfile, getArchives, getGames } from './chesscom'

afterEach(() => vi.restoreAllMocks())

function mockFetch(status: number, body: unknown) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }))
}

describe('getProfile', () => {
  it('returns profile json on success', async () => {
    mockFetch(200, { username: 'magnus', url: 'u', avatar: 'a' })
    const p = await getProfile('magnus')
    expect(p.username).toBe('magnus')
  })
  it('throws "Player not found" on 404', async () => {
    mockFetch(404, {})
    await expect(getProfile('nobody')).rejects.toThrow('Player not found')
  })
  it('throws rate-limit message on 429', async () => {
    mockFetch(429, {})
    await expect(getProfile('x')).rejects.toThrow(/Too many requests/)
  })
})

describe('getArchives', () => {
  it('returns the archives array', async () => {
    mockFetch(200, { archives: ['url1', 'url2'] })
    expect(await getArchives('magnus')).toEqual(['url1', 'url2'])
  })
})

describe('getGames', () => {
  it('returns the games array', async () => {
    mockFetch(200, { games: [{ url: 'g1' }] })
    const g = await getGames('archiveUrl')
    expect(g).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/api/chesscom.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/api/chesscom.ts`:

```ts
import type { Profile, Game } from '../types'

const BASE = 'https://api.chess.com/pub'

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (res.status === 404) throw new Error('Player not found')
  if (res.status === 429) throw new Error('Too many requests, try again shortly')
  if (!res.ok) throw new Error(`Request failed (${res.status})`)
  return res.json() as Promise<T>
}

export async function getProfile(username: string): Promise<Profile> {
  return getJson<Profile>(`${BASE}/player/${username.toLowerCase()}`)
}

export async function getArchives(username: string): Promise<string[]> {
  const data = await getJson<{ archives: string[] }>(
    `${BASE}/player/${username.toLowerCase()}/games/archives`,
  )
  return data.archives
}

export async function getGames(archiveUrl: string): Promise<Game[]> {
  const data = await getJson<{ games: Game[] }>(archiveUrl)
  return data.games
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/api/chesscom.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/api/chesscom.ts src/api/chesscom.test.ts
git commit -m "feat: add Chess.com API wrapper with error handling"
```

---

## Task 8: StockfishEngine wrapper (serial queue)

**Files:**
- Create: `src/engine/stockfish.ts`

No unit test (requires a real Worker + WASM; verified manually in the browser via Task 13). The pure parsing it relies on is already covered in Task 3.

- [ ] **Step 1: Implement the engine wrapper**

Create `src/engine/stockfish.ts`:

```ts
import type { Score } from '../types'
import { parseScore, isBestMove } from './uci'

interface QueueItem {
  fen: string
  depth: number
  resolve: (score: Score) => void
}

export class StockfishEngine {
  private worker: Worker
  private queue: QueueItem[] = []
  private busy = false
  private current: QueueItem | null = null
  private lastScore: Score = {}

  constructor(url = '/stockfish/stockfish-18-lite-single.js') {
    this.worker = new Worker(url)
    this.worker.onmessage = (e: MessageEvent) => this.onMessage(String(e.data))
    this.post('uci')
    this.post('isready')
  }

  private post(cmd: string) {
    this.worker.postMessage(cmd)
  }

  private onMessage(line: string) {
    if (!this.current) return
    const score = parseScore(line)
    if (score) this.lastScore = score
    if (isBestMove(line)) {
      const item = this.current
      this.current = null
      this.busy = false
      item.resolve(this.lastScore)
      this.next()
    }
  }

  private next() {
    if (this.busy) return
    const item = this.queue.shift()
    if (!item) return
    this.busy = true
    this.current = item
    this.lastScore = {}
    this.post(`position fen ${item.fen}`)
    this.post(`go depth ${item.depth}`)
  }

  evaluate(fen: string, depth = 15): Promise<Score> {
    return new Promise((resolve) => {
      this.queue.push({ fen, depth, resolve })
      this.next()
    })
  }

  terminate() {
    this.worker.terminate()
  }
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/engine/stockfish.ts
git commit -m "feat: add StockfishEngine with serial evaluation queue"
```

---

## Task 9: useChessGame hook

**Files:**
- Create: `src/hooks/useChessGame.ts`

**Behavior:** Given a PGN, parse it once. Expose the verbose move list, a FEN list (start FEN + each move's `after` FEN), a current ply index, the current FEN, and navigation functions. Ply `0` = starting position.

- [ ] **Step 1: Implement the hook**

Create `src/hooks/useChessGame.ts`:

```ts
import { useMemo, useState } from 'react'
import { Chess } from 'chess.js'

export interface GameMove {
  san: string
  color: 'w' | 'b'
  fenAfter: string
}

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

export function useChessGame(pgn: string | null) {
  const { moves, fens } = useMemo(() => {
    if (!pgn) return { moves: [] as GameMove[], fens: [START_FEN] }
    const chess = new Chess()
    try {
      chess.loadPgn(pgn)
    } catch {
      return { moves: [] as GameMove[], fens: [START_FEN] }
    }
    const verbose = chess.history({ verbose: true })
    const moves: GameMove[] = verbose.map((m) => ({
      san: m.san,
      color: m.color,
      fenAfter: m.after,
    }))
    const fens = [START_FEN, ...moves.map((m) => m.fenAfter)]
    return { moves, fens }
  }, [pgn])

  // ply 0 = start; ply i (1..moves.length) = after move i.
  const [ply, setPly] = useState(0)
  const maxPly = moves.length

  const goTo = (p: number) => setPly(Math.max(0, Math.min(maxPly, p)))
  const next = () => goTo(ply + 1)
  const prev = () => goTo(ply - 1)
  const start = () => goTo(0)
  const end = () => goTo(maxPly)

  const currentFen = fens[Math.min(ply, fens.length - 1)] ?? START_FEN

  return { moves, fens, ply, maxPly, currentFen, goTo, next, prev, start, end }
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useChessGame.ts
git commit -m "feat: add useChessGame hook for PGN parsing and navigation"
```

---

## Task 10: useStockfish hook (batch analysis)

**Files:**
- Create: `src/hooks/useStockfish.ts`

**Behavior:** Owns a single `StockfishEngine` for the component's lifetime. `analyze(fens)` evaluates every FEN serially, reporting progress, and resolves with a `Score[]` aligned to the FEN list. Builds `AnalyzedMove[]` from the scores via `eval.ts`.

- [ ] **Step 1: Implement the hook**

Create `src/hooks/useStockfish.ts`:

```ts
import { useEffect, useRef, useState } from 'react'
import { StockfishEngine } from '../engine/stockfish'
import type { Score, AnalyzedMove } from '../types'
import type { GameMove } from './useChessGame'
import { computeDrop, classifyDrop } from '../utils/eval'

export function useStockfish() {
  const engineRef = useRef<StockfishEngine | null>(null)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [analyzed, setAnalyzed] = useState<AnalyzedMove[] | null>(null)
  const [scores, setScores] = useState<Score[]>([])

  useEffect(() => {
    try {
      engineRef.current = new StockfishEngine()
      setReady(true)
    } catch {
      setError('Failed to load the chess engine')
    }
    return () => engineRef.current?.terminate()
  }, [])

  // fens: [startFen, afterMove1, afterMove2, ...] aligned so fens[i] precedes moves[i].
  async function analyze(fens: string[], moves: GameMove[], depth = 15) {
    const engine = engineRef.current
    if (!engine) return
    setAnalyzed(null)
    setProgress({ done: 0, total: fens.length })
    const scores: Score[] = []
    for (let i = 0; i < fens.length; i++) {
      scores.push(await engine.evaluate(fens[i], depth))
      setProgress({ done: i + 1, total: fens.length })
    }
    const result: AnalyzedMove[] = moves.map((m, i) => {
      const drop = computeDrop(scores[i], scores[i + 1] ?? scores[i])
      return {
        san: m.san,
        color: m.color,
        fenAfter: m.fenAfter,
        quality: classifyDrop(drop),
        cpDrop: drop,
      }
    })
    setScores(scores)
    setAnalyzed(result)
    return { result, scores }
  }

  return { ready, error, progress, analyzed, scores, analyze }
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useStockfish.ts
git commit -m "feat: add useStockfish batch analysis hook"
```

---

## Task 11: Presentational components

**Files:**
- Create: `src/components/ProfileCard.tsx`, `GamesList.tsx`, `ChessBoard.tsx`, `MoveList.tsx`, `EvalBar.tsx`, `StatsPanel.tsx`

- [ ] **Step 1: ProfileCard**

Create `src/components/ProfileCard.tsx`:

```tsx
import type { Profile } from '../types'

export function ProfileCard({ profile }: { profile: Profile }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border p-3">
      {profile.avatar && (
        <img src={profile.avatar} alt="" className="h-12 w-12 rounded-full" />
      )}
      <div>
        <div className="font-semibold">{profile.username}</div>
        <a href={profile.url} className="text-sm text-blue-600" target="_blank" rel="noreferrer">
          View on Chess.com
        </a>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: GamesList**

Create `src/components/GamesList.tsx`:

```tsx
import type { Game } from '../types'

export function GamesList({ games, onSelect }: { games: Game[]; onSelect: (g: Game) => void }) {
  if (games.length === 0) {
    return <div className="p-4 text-gray-500">No games found for this period.</div>
  }
  return (
    <ul className="divide-y rounded-lg border">
      {games.map((g) => (
        <li key={g.url}>
          <button
            onClick={() => onSelect(g)}
            className="flex w-full justify-between gap-4 p-3 text-left hover:bg-gray-50"
          >
            <span>
              {g.white.username} ({g.white.rating}) vs {g.black.username} ({g.black.rating})
            </span>
            <span className="text-sm text-gray-500">{g.white.result} / {g.black.result}</span>
          </button>
        </li>
      ))}
    </ul>
  )
}
```

- [ ] **Step 3: ChessBoard**

Create `src/components/ChessBoard.tsx`:

```tsx
import { Chessboard } from 'react-chessboard'

export function ChessBoard({
  fen,
  orientation = 'white',
}: {
  fen: string
  orientation?: 'white' | 'black'
}) {
  return (
    <div className="w-full max-w-[480px]">
      <Chessboard options={{ position: fen, boardOrientation: orientation, allowDragging: false }} />
    </div>
  )
}
```

- [ ] **Step 4: MoveList**

Create `src/components/MoveList.tsx`:

```tsx
import type { AnalyzedMove } from '../types'
import { QUALITY_COLOR, QUALITY_SYMBOL } from '../utils/eval'

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
            {isWhite && <div className="text-gray-400">{moveNo}.</div>}
            {!isWhite && i === 0 && <div className="text-gray-400">1...</div>}
            <button
              onClick={() => onSelectPly(i + 1)}
              className={`rounded px-1 text-left ${active ? 'bg-gray-200 font-semibold' : ''} ${isWhite ? 'col-start-2' : 'col-start-3'}`}
              style={{ color: QUALITY_COLOR[m.quality] }}
            >
              {m.san} {QUALITY_SYMBOL[m.quality]}
            </button>
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 5: EvalBar**

Create `src/components/EvalBar.tsx`:

```tsx
import type { Score } from '../types'
import { scoreToCp } from '../utils/eval'

// score is from White's perspective here (caller normalizes).
export function EvalBar({ score }: { score: Score }) {
  const cp = scoreToCp(score)
  // Map cp to a 0..100 white-share via a logistic squash.
  const whiteShare = 100 / (1 + Math.exp(-cp / 400))
  return (
    <div className="flex h-[480px] w-6 flex-col overflow-hidden rounded border bg-black">
      <div className="bg-white transition-all" style={{ height: `${100 - whiteShare}%` }} />
      <div className="flex-1 bg-neutral-800" />
    </div>
  )
}
```

- [ ] **Step 6: StatsPanel**

Create `src/components/StatsPanel.tsx`:

```tsx
import type { AnalyzedMove, MoveQuality } from '../types'
import { calcAccuracy } from '../utils/accuracy'

export function StatsPanel({
  moves,
  opening,
}: {
  moves: AnalyzedMove[]
  opening: { eco: string; name: string } | null
}) {
  const sides = (['w', 'b'] as const).map((c) => {
    const side = moves.filter((m) => m.color === c)
    const accuracy = calcAccuracy(side.map((m) => m.cpDrop))
    const count = (q: MoveQuality) => side.filter((m) => m.quality === q).length
    return {
      color: c === 'w' ? 'White' : 'Black',
      accuracy: accuracy.toFixed(1),
      inaccuracy: count('inaccuracy'),
      mistake: count('mistake'),
      blunder: count('blunder'),
    }
  })
  return (
    <div className="rounded-lg border p-3 text-sm">
      {opening && (
        <div className="mb-2">
          <span className="font-semibold">Opening:</span> {opening.eco} {opening.name}
        </div>
      )}
      <table className="w-full">
        <thead>
          <tr className="text-left text-gray-500">
            <th>Side</th><th>Accuracy</th><th>?!</th><th>?</th><th>??</th>
          </tr>
        </thead>
        <tbody>
          {sides.map((s) => (
            <tr key={s.color}>
              <td>{s.color}</td><td>{s.accuracy}%</td>
              <td>{s.inaccuracy}</td><td>{s.mistake}</td><td>{s.blunder}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 7: Verify compile**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add src/components
git commit -m "feat: add presentational components"
```

---

## Task 12: App wiring

**Files:**
- Modify: `src/App.tsx`

**Behavior:** Single-page flow with three views driven by state: `search` → `games` → `analysis`. On username submit, fetch profile + archives + latest archive's games. On game select, switch to analysis: parse with `useChessGame`, run `useStockfish.analyze`, show board + eval bar + move list + stats.

- [ ] **Step 1: Implement App**

Replace `src/App.tsx`. The analysis is triggered by a `useEffect` (never call hooks inside event handlers), and the eval bar reads the raw `scores` exposed by `useStockfish`, normalized to White's perspective:

```tsx
import { useEffect, useState } from 'react'
import { getProfile, getArchives, getGames } from './api/chesscom'
import type { Profile, Game } from './types'
import { useChessGame } from './hooks/useChessGame'
import { useStockfish } from './hooks/useStockfish'
import { identifyOpening } from './utils/opening'
import { scoreToCp } from './utils/eval'
import { ProfileCard } from './components/ProfileCard'
import { GamesList } from './components/GamesList'
import { ChessBoard } from './components/ChessBoard'
import { MoveList } from './components/MoveList'
import { EvalBar } from './components/EvalBar'
import { StatsPanel } from './components/StatsPanel'

export default function App() {
  const [username, setUsername] = useState('')
  const [profile, setProfile] = useState<Profile | null>(null)
  const [games, setGames] = useState<Game[]>([])
  const [selected, setSelected] = useState<Game | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const game = useChessGame(selected?.pgn ?? null)
  const engine = useStockfish()

  // Trigger batch analysis once a game is selected, parsed, and the engine is ready.
  useEffect(() => {
    if (selected && engine.ready && game.moves.length > 0) {
      engine.analyze(game.fens, game.moves)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, engine.ready, game.moves.length])

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    setError(null); setLoading(true); setSelected(null); setProfile(null); setGames([])
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

  const opening = selected ? identifyOpening(selected.pgn) : null

  // engine.scores[ply] is from the side-to-move's perspective at that position.
  // Normalize to White: even ply (White to move) keep sign; odd ply negate.
  const raw = engine.scores[game.ply] ?? { cp: 0 }
  const whiteScore = game.ply % 2 === 0 ? raw : { cp: -scoreToCp(raw) }

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-6">
      <h1 className="text-2xl font-bold">Chess Analyzer</h1>

      <form onSubmit={handleSearch} className="flex gap-2">
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Chess.com username"
          className="flex-1 rounded border px-3 py-2"
        />
        <button className="rounded bg-blue-600 px-4 py-2 text-white" disabled={loading}>
          {loading ? 'Loading…' : 'Search'}
        </button>
      </form>

      {error && <div className="rounded bg-red-50 p-3 text-red-700">{error}</div>}
      {profile && <ProfileCard profile={profile} />}

      {!selected && profile && <GamesList games={games} onSelect={setSelected} />}

      {selected && (
        <div className="space-y-4">
          <button onClick={() => setSelected(null)} className="text-sm text-blue-600">
            ← Back to games
          </button>

          {engine.error && <div className="rounded bg-red-50 p-3 text-red-700">{engine.error}</div>}
          {!engine.analyzed && !engine.error && (
            <div className="text-sm text-gray-600">
              Analyzing… {engine.progress.done}/{engine.progress.total}
            </div>
          )}

          <div className="flex flex-wrap gap-4">
            <EvalBar score={whiteScore} />
            <ChessBoard fen={game.currentFen} />
            <div className="flex-1 space-y-3">
              <div className="flex gap-2">
                <button onClick={game.start} className="rounded border px-2">⏮</button>
                <button onClick={game.prev} className="rounded border px-2">◀</button>
                <button onClick={game.next} className="rounded border px-2">▶</button>
                <button onClick={game.end} className="rounded border px-2">⏭</button>
              </div>
              {engine.analyzed && (
                <MoveList moves={engine.analyzed} ply={game.ply} onSelectPly={game.goTo} />
              )}
            </div>
          </div>

          {engine.analyzed && <StatsPanel moves={engine.analyzed} opening={opening} />}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify compile and build**

Run: `npx tsc --noEmit && npm run build`
Expected: no type errors, build succeeds.

- [ ] **Step 3: Run the full test suite**

Run: `npm run test`
Expected: all unit tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "feat: wire App flow search -> games -> analysis with live eval bar"
```

---

## Task 13: Manual browser verification

**Files:** none (verification only)

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`
Open the printed localhost URL.

- [ ] **Step 2: Verify the happy path**

- Enter a known public username (e.g. `hikaru`). Submit.
- Expected: ProfileCard appears, GamesList lists this month's games (or an empty-state message if none).
- Click a game. Expected: "Analyzing… N/total" progress, then the board, eval bar, move list (color-coded), and stats panel appear.
- Click moves / use nav buttons. Expected: board and eval bar update to the selected ply.

- [ ] **Step 3: Verify error states**

- Search a non-existent username (e.g. `zzzznotarealuser999`). Expected: "Player not found".

- [ ] **Step 4: Confirm Stockfish loaded (no header errors)**

- Open DevTools console. Expected: no `SharedArrayBuffer is not defined` or COOP/COEP errors; engine evaluates positions.

- [ ] **Step 5: Final commit (if any tweaks were needed)**

```bash
git add -A
git commit -m "fix: manual verification adjustments" || echo "nothing to commit"
```

---

## Notes on known limitations (carried from spec)

- Accuracy % is an approximation; Chess.com's exact algorithm is not public.
- Depth 15 keeps analysis responsive; a full game (~80 positions) still takes time — progress is shown.
- ECO dataset here is a small seed; expanding `eco.json` improves opening coverage without code changes.
- "Brilliant" classification is intentionally deferred to v2.
