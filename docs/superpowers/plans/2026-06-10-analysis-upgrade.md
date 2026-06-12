# Analysis Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the analyzer to Chess.com Game Review parity and beyond: eval graph, board arrows, phase breakdown, tactical motifs, training mode, top-3 alternatives, time analysis, and multi-game trends — all client-side.

**Architecture:** Extend the data model first (`AnalyzedMove` gains phase/motifs/alternatives/clock fields), feed it from new pure utils (`phase.ts`, `clock.ts`, `motifs.ts`) wired into the existing `analyzeMove` pipeline, then build all UI on that foundation. Game analysis logic is extracted into a shared `gameAnalysis.ts` so both the single-game hook and the multi-game trends hook reuse it.

**Tech Stack:** React 19 + Vite + Tailwind 3 (CSS-variable tokens), chess.js 1.4, react-chessboard 5, Stockfish WASM worker, vitest.

**Spec:** `docs/superpowers/specs/2026-06-10-analysis-upgrade-design.md`

---

## File structure

| File | Responsibility |
|---|---|
| `src/utils/phase.ts` (new) | FEN → opening/middlegame/endgame classification |
| `src/utils/clock.ts` (new) | PGN `%clk` parsing, time-control parsing, per-move time spent |
| `src/utils/motifs.ts` (new) | Rule-based tactical motif detection (fork, pin, …) |
| `src/utils/gameAnalysis.ts` (new) | Shared engine-driven game analysis loop (used by useStockfish + useTrends) |
| `src/utils/trends.ts` (new) | Pure aggregation over multiple analyzed games |
| `src/utils/trendsCache.ts` (new) | localStorage cache for analyzed games |
| `src/types.ts` (modify) | `AnalyzedMove` extension, `AltMove`, `TacticalMotif`, `GamePhase` |
| `src/utils/analysis.ts` (modify) | `analyzeMove` produces alternatives, motifs, missedMotifs |
| `src/hooks/useStockfish.ts` (modify) | depth 18 / MultiPV 3, phase + clock wiring, delegates to gameAnalysis |
| `src/hooks/useTrainer.ts` (new) | Puzzle queue, grading, hint ladder |
| `src/hooks/useTrends.ts` (new) | Batch analysis of last N games with cache + progress |
| `src/index.css` + components (modify) | Dark education-tuned theme |
| `src/components/EvalGraph.tsx` (new) | Full-width win% SVG chart with mistake dots + phase bands |
| `src/components/ChessBoard.tsx` (modify) | Arrow overlay + interactive (click/drag to move) mode |
| `src/components/AlternativesPanel.tsx` (new) | Top-3 engine lines |
| `src/components/MoveInsight.tsx` (modify) | Motif badges, missed-motif line, time info |
| `src/components/PhasePanel.tsx` (new) | Per-phase accuracy + takeaway |
| `src/components/TimePanel.tsx` (new) | Time-spent chart + time-pressure callout |
| `src/components/TrainerCard.tsx` (new) | Training mode UI |
| `src/components/TrendsPanel.tsx` (new) | Multi-game trends UI |
| `src/App.tsx` (modify) | New layout, Review ⇄ Train toggle, trends entry point |

Conventions to follow (from existing code):
- Engine `Score` is always **side-to-move perspective**; `winChance(score)` is the side-to-move's win%.
- `fens[i]` is the position **before** `moves[i]`; ply 0 = start position.
- Tests: vitest, colocated `*.test.ts`, `describe`/`it`/`expect` style. Run with `npx vitest run <file>`.

---

### Task 1: Phase detection util

**Files:**
- Create: `src/utils/phase.ts`
- Test: `src/utils/phase.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/utils/phase.test.ts
import { describe, it, expect } from 'vitest'
import { phaseOfPosition, splitByPhase } from './phase'

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
// Queens off, rooks + minor each: endgame by the queens-off rule.
const QUEENLESS = 'r3k2r/pppb1ppp/2n5/8/8/2N5/PPPB1PPP/R3K2R w KQkq - 0 12'
// Queens on but bare-bones material (Q+N vs Q+N = 12 ≤ 13 per side): endgame.
const LOW_MATERIAL = '4k3/3q4/8/8/8/8/3QN3/4Kn2 w - - 0 40'
// Full middlegame: developed pieces, queens on, lots of material.
const MIDDLEGAME = 'r1bq1rk1/pp2bppp/2n1pn2/3p4/3P4/2NBPN2/PP3PPP/R1BQ1RK1 w - - 0 10'

describe('phaseOfPosition', () => {
  it('start position is opening', () => {
    expect(phaseOfPosition(START, 0, 0)).toBe('opening')
  })
  it('book plies are opening even with developed pieces', () => {
    expect(phaseOfPosition(MIDDLEGAME, 12, 16)).toBe('opening')
  })
  it('developed position past book is middlegame', () => {
    expect(phaseOfPosition(MIDDLEGAME, 30, 8)).toBe('middlegame')
  })
  it('queens off the board is endgame', () => {
    expect(phaseOfPosition(QUEENLESS, 30, 8)).toBe('endgame')
  })
  it('low material with queens on is endgame', () => {
    expect(phaseOfPosition(LOW_MATERIAL, 60, 8)).toBe('endgame')
  })
  it('endgame beats opening fallback (early queen trade)', () => {
    expect(phaseOfPosition(QUEENLESS, 10, 4)).toBe('endgame')
  })
})

describe('splitByPhase', () => {
  it('partitions ply indices by phase', () => {
    const phases = ['opening', 'opening', 'middlegame', 'endgame'] as const
    expect(splitByPhase([...phases])).toEqual({
      opening: [0, 1],
      middlegame: [2],
      endgame: [3],
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/phase.test.ts`
Expected: FAIL — `Cannot find module './phase'`

- [ ] **Step 3: Write the implementation**

```typescript
// src/utils/phase.ts
export type GamePhase = 'opening' | 'middlegame' | 'endgame'

const PIECE_POINTS: Record<string, number> = { n: 3, b: 3, r: 5, q: 9 }

// Endgame threshold: each side's non-pawn material at or below this (13 =
// e.g. R+B+B or Q+N) — the conventional "queens traded or simplified" cutoff.
const ENDGAME_MATERIAL = 13
// Opening can't stretch past this many plies even if development is slow.
const OPENING_MAX_PLY = 24
// Minor pieces still sitting on their home squares; 3+ total means the
// position is still in the development stage.
const UNDEVELOPED_MINORS_FOR_OPENING = 3
const MINOR_HOME: Array<[string, string]> = [
  // [square, piece-char as it appears in FEN board text]
  ['b1', 'N'], ['g1', 'N'], ['c1', 'B'], ['f1', 'B'],
  ['b8', 'n'], ['g8', 'n'], ['c8', 'b'], ['f8', 'b'],
]

// Parse the FEN board field into a square -> piece-char lookup.
function boardMap(fen: string): Map<string, string> {
  const map = new Map<string, string>()
  const rows = fen.split(' ')[0].split('/')
  for (let r = 0; r < 8; r++) {
    let file = 0
    for (const ch of rows[r]) {
      if (/\d/.test(ch)) {
        file += parseInt(ch, 10)
      } else {
        map.set(String.fromCharCode(97 + file) + String(8 - r), ch)
        file++
      }
    }
  }
  return map
}

function nonPawnMaterial(fen: string): { white: number; black: number; queens: number } {
  let white = 0
  let black = 0
  let queens = 0
  for (const ch of fen.split(' ')[0]) {
    const pts = PIECE_POINTS[ch.toLowerCase()]
    if (pts === undefined) continue
    if (ch.toLowerCase() === 'q') queens++
    if (ch === ch.toUpperCase()) white += pts
    else black += pts
  }
  return { white, black, queens }
}

export function phaseOfPosition(fen: string, ply: number, bookPlies: number): GamePhase {
  const { white, black, queens } = nonPawnMaterial(fen)
  if (queens === 0 || (white <= ENDGAME_MATERIAL && black <= ENDGAME_MATERIAL)) {
    return 'endgame'
  }
  if (ply < bookPlies) return 'opening'
  if (ply < OPENING_MAX_PLY) {
    const board = boardMap(fen)
    const undeveloped = MINOR_HOME.filter(([sq, piece]) => board.get(sq) === piece).length
    if (undeveloped >= UNDEVELOPED_MINORS_FOR_OPENING) return 'opening'
  }
  return 'middlegame'
}

// Group ply indices by their phase, for per-phase aggregation.
export function splitByPhase(phases: GamePhase[]): Record<GamePhase, number[]> {
  const out: Record<GamePhase, number[]> = { opening: [], middlegame: [], endgame: [] }
  phases.forEach((p, i) => out[p].push(i))
  return out
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/phase.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add src/utils/phase.ts src/utils/phase.test.ts
git commit -m "feat: add game phase detection (opening/middlegame/endgame)"
```

---

### Task 2: Clock extraction util

**Files:**
- Create: `src/utils/clock.ts`
- Test: `src/utils/clock.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/utils/clock.test.ts
import { describe, it, expect } from 'vitest'
import { parseTimeControl, extractClocks, computeTimeSpent } from './clock'

const PGN_WITH_CLOCKS = `[Event "Live Chess"]
[TimeControl "180+2"]

1. e4 {[%clk 0:03:00]} e5 {[%clk 0:02:58.7]} 2. Nf3 {[%clk 0:02:55]} Nc6 {[%clk 0:02:50.1]} 1-0`

const PGN_NO_CLOCKS = `[Event "Live Chess"]

1. e4 e5 2. Nf3 Nc6 1-0`

describe('parseTimeControl', () => {
  it('parses base+increment', () => {
    expect(parseTimeControl('180+2')).toEqual({ base: 180, inc: 2 })
  })
  it('parses base only', () => {
    expect(parseTimeControl('600')).toEqual({ base: 600, inc: 0 })
  })
  it('handles daily format (1/86400) as no clock info', () => {
    expect(parseTimeControl('1/86400')).toEqual({ base: 86400, inc: 0 })
  })
})

describe('extractClocks', () => {
  it('returns remaining seconds per ply', () => {
    expect(extractClocks(PGN_WITH_CLOCKS)).toEqual([180, 178.7, 175, 170.1])
  })
  it('returns empty array when no clk tags', () => {
    expect(extractClocks(PGN_NO_CLOCKS)).toEqual([])
  })
})

describe('computeTimeSpent', () => {
  it('first move of each side measures from base time', () => {
    const spent = computeTimeSpent([180, 178.7, 175, 170.1], 180, 2)
    // ply 0 (white 1st): 180 - 180 + 2 = 2
    // ply 1 (black 1st): 180 - 178.7 + 2 = 3.3
    // ply 2 (white 2nd): 180 - 175 + 2 = 7
    // ply 3 (black 2nd): 178.7 - 170.1 + 2 = 10.6
    expect(spent.map((s) => s !== null && Math.round(s * 10) / 10)).toEqual([2, 3.3, 7, 10.6])
  })
  it('clamps negative spent (clock corrections) to zero', () => {
    expect(computeTimeSpent([10, 10, 30], 10, 0)[2]).toBe(0)
  })
  it('returns empty for empty clocks', () => {
    expect(computeTimeSpent([], 180, 2)).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/clock.test.ts`
Expected: FAIL — `Cannot find module './clock'`

- [ ] **Step 3: Write the implementation**

```typescript
// src/utils/clock.ts

// Chess.com time_control formats: "180" (seconds), "180+2" (base+increment),
// "1/86400" (daily: moves per period / seconds).
export function parseTimeControl(tc: string): { base: number; inc: number } {
  const daily = tc.match(/^\d+\/(\d+)$/)
  if (daily) return { base: parseInt(daily[1], 10), inc: 0 }
  const [base, inc] = tc.split('+')
  return { base: parseInt(base, 10) || 0, inc: parseInt(inc, 10) || 0 }
}

// Remaining clock (seconds) after each ply, from {[%clk H:MM:SS(.t)]} tags.
// Empty array when the PGN carries no clock data.
export function extractClocks(pgn: string): number[] {
  const out: number[] = []
  const re = /\[%clk\s+(\d+):(\d{1,2}):(\d{1,2}(?:\.\d+)?)\]/g
  let m: RegExpExecArray | null
  while ((m = re.exec(pgn)) !== null) {
    out.push(parseInt(m[1], 10) * 3600 + parseInt(m[2], 10) * 60 + parseFloat(m[3]))
  }
  return out
}

// Seconds the mover spent on each ply: previous own clock − current clock
// + increment. The mover's previous clock is two plies back (same side);
// for each side's first move it is the base time.
export function computeTimeSpent(clocks: number[], base: number, inc: number): (number | null)[] {
  return clocks.map((clk, i) => {
    const prev = i >= 2 ? clocks[i - 2] : base
    return Math.max(0, prev - clk + inc)
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/clock.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add src/utils/clock.ts src/utils/clock.test.ts
git commit -m "feat: add PGN clock extraction and per-move time spent"
```

---

### Task 3: Tactical motifs — core detections (fork, hanging piece, double check, promotion)

**Files:**
- Create: `src/utils/motifs.ts`
- Test: `src/utils/motifs.test.ts`

The detector applies a SAN move to a FEN with chess.js, then inspects the resulting board. chess.js 1.4 provides `chess.attackers(square, color)` (squares of `color`'s pieces attacking `square`) — the workhorse for everything here.

- [ ] **Step 1: Write the failing test**

```typescript
// src/utils/motifs.test.ts
import { describe, it, expect } from 'vitest'
import { detectMotifs } from './motifs'

describe('detectMotifs: fork', () => {
  it('detects a knight fork on king and rook', () => {
    // Nc7+ forks Ke8 and Ra8.
    const fen = 'r3k3/8/8/3N4/8/8/8/4K3 w - - 0 1'
    expect(detectMotifs(fen, 'Nc7+')).toContain('fork')
  })
  it('a quiet developing move is not a fork', () => {
    const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
    expect(detectMotifs(fen, 'Nf3')).toEqual([])
  })
})

describe('detectMotifs: hanging piece', () => {
  it('detects attacking an undefended piece', () => {
    // Re1 attacks the undefended black bishop on e7.
    const fen = '4k3/4b3/8/8/8/8/8/R3K3 w - - 0 1'
    expect(detectMotifs(fen, 'Re1')).toContain('hanging-piece')
  })
  it('attacking a defended piece is not hanging', () => {
    // Same but the bishop is defended by the king on d8.
    const fen = '3k4/4b3/8/8/8/8/8/R3K3 w - - 0 1'
    expect(detectMotifs(fen, 'Re1')).not.toContain('hanging-piece')
  })
})

describe('detectMotifs: double check', () => {
  it('detects double check', () => {
    // Nf6 is check from the knight AND discovered check from the Re1... use a
    // classic: moving knight unmasks rook, knight also checks.
    const fen = '4k3/8/8/8/4N3/8/8/4RK2 w - - 0 1'
    expect(detectMotifs(fen, 'Nd6+')).toContain('double-check')
  })
})

describe('detectMotifs: promotion', () => {
  it('flags promotions', () => {
    const fen = '8/P3k3/8/8/8/8/8/4K3 w - - 0 1'
    expect(detectMotifs(fen, 'a8=Q')).toContain('promotion')
  })
})

describe('detectMotifs: invalid input', () => {
  it('returns empty for illegal moves', () => {
    const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
    expect(detectMotifs(fen, 'Qh5xh7')).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/motifs.test.ts`
Expected: FAIL — `Cannot find module './motifs'`

- [ ] **Step 3: Write the implementation**

```typescript
// src/utils/motifs.ts
import { Chess, type Square, type Color, type PieceSymbol } from 'chess.js'

export type TacticalMotif =
  | 'fork'
  | 'pin'
  | 'skewer'
  | 'discovered-attack'
  | 'double-check'
  | 'hanging-piece'
  | 'back-rank'
  | 'mate-threat'
  | 'trapped-piece'
  | 'sacrifice'
  | 'promotion'

const VALUE: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 }

interface PieceOnSquare {
  square: Square
  type: PieceSymbol
  color: Color
}

function piecesOf(chess: Chess, color: Color): PieceOnSquare[] {
  const out: PieceOnSquare[] = []
  for (const row of chess.board()) {
    for (const cell of row) {
      if (cell && cell.color === color) {
        out.push({ square: cell.square, type: cell.type, color: cell.color })
      }
    }
  }
  return out
}

// Does `attackerSquare` (a piece of `by`) attack `target`?
function attacks(chess: Chess, attackerSquare: Square, target: Square, by: Color): boolean {
  return chess.attackers(target, by).includes(attackerSquare)
}

function isDefended(chess: Chess, square: Square, by: Color): boolean {
  return chess.attackers(square, by).length > 0
}

// Fork: the moved piece attacks 2+ enemy pieces that are each either more
// valuable than it or undefended (so the attack is a real threat on both).
function detectFork(chess: Chess, to: Square, mover: Color, movedType: PieceSymbol): boolean {
  const enemy: Color = mover === 'w' ? 'b' : 'w'
  const targets = piecesOf(chess, enemy).filter((p) => {
    if (!attacks(chess, to, p.square, mover)) return false
    if (p.type === 'k') return true
    return VALUE[p.type] > VALUE[movedType] || !isDefended(chess, p.square, enemy)
  })
  return targets.length >= 2
}

// Hanging piece: the move leaves some enemy piece (not a pawn) attacked by the
// mover and completely undefended.
function detectHanging(chess: Chess, mover: Color): boolean {
  const enemy: Color = mover === 'w' ? 'b' : 'w'
  return piecesOf(chess, enemy).some(
    (p) =>
      p.type !== 'k' &&
      p.type !== 'p' &&
      chess.attackers(p.square, mover).length > 0 &&
      !isDefended(chess, p.square, enemy),
  )
}

function kingSquare(chess: Chess, color: Color): Square {
  return piecesOf(chess, color).find((p) => p.type === 'k')!.square
}

export function detectMotifs(fenBefore: string, san: string): TacticalMotif[] {
  const chess = new Chess(fenBefore)
  let move
  try {
    move = chess.move(san)
  } catch {
    return []
  }
  const mover = move.color
  const enemy: Color = mover === 'w' ? 'b' : 'w'
  const motifs: TacticalMotif[] = []

  if (move.isPromotion()) motifs.push('promotion')

  if (chess.inCheck()) {
    const checkers = chess.attackers(kingSquare(chess, enemy), mover)
    if (checkers.length >= 2) motifs.push('double-check')
  }

  if (detectFork(chess, move.to as Square, mover, move.piece)) motifs.push('fork')
  if (detectHanging(chess, mover)) motifs.push('hanging-piece')

  return motifs
}
```

Note: chess.js 1.4 `Move` has `isPromotion()`; if the installed version lacks it, use `move.flags.includes('p')` instead.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/motifs.test.ts`
Expected: PASS (7 tests). If the double-check FEN doesn't produce a legal `Nd6+`, verify the FEN on a board and adjust the SAN — the intent is knight moves away from the e-file unmasking the e1 rook while itself giving check.

- [ ] **Step 5: Commit**

```bash
git add src/utils/motifs.ts src/utils/motifs.test.ts
git commit -m "feat: add tactical motif detection (fork, hanging, double check, promotion)"
```

---

### Task 4: Tactical motifs — ray-based detections (pin, skewer, discovered attack, back rank, trapped piece)

**Files:**
- Modify: `src/utils/motifs.ts`
- Test: `src/utils/motifs.test.ts` (append)

- [ ] **Step 1: Write the failing tests (append to the existing describe blocks)**

```typescript
// append to src/utils/motifs.test.ts
describe('detectMotifs: pin and skewer', () => {
  it('detects a pin (bishop pins knight to king)', () => {
    // Bb5 pins the c6 knight against the e8 king.
    const fen = 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3'
    expect(detectMotifs(fen, 'Bb5')).toContain('pin')
  })
  it('detects a skewer (rook skewers king to rook)', () => {
    // Re1+ hits the e5 king; behind it on the e-file sits the e8 rook.
    const fen = '4r3/8/8/4k3/8/8/8/R3K3 w - - 0 1'
    expect(detectMotifs(fen, 'Re1')).toContain('skewer')
  })
})

describe('detectMotifs: discovered attack', () => {
  it('detects discovered attack on the queen', () => {
    // Moving the d5 knight opens the d1 rook's file onto the d8 queen.
    const fen = '3q4/4k3/8/3N4/8/8/8/3RK3 w - - 0 1'
    expect(detectMotifs(fen, 'Nb6')).toContain('discovered-attack')
  })
})

describe('detectMotifs: back rank', () => {
  it('flags a back-rank mate', () => {
    // Re8# against a king boxed in by its own pawns.
    const fen = '6k1/5ppp/8/8/8/8/8/4R1K1 w - - 0 1'
    expect(detectMotifs(fen, 'Re8#')).toContain('back-rank')
  })
})

describe('detectMotifs: trapped piece', () => {
  it('detects a cornered, attacked piece with no safe squares', () => {
    // Black knight on h8 attacked by the g6 pawn-supported rook; every knight
    // move lands on a square White attacks.
    const fen = '7n/5k2/6P1/8/8/8/8/4K1R1 w - - 0 1'
    expect(detectMotifs(fen, 'Rh1')).toContain('trapped-piece')
  })
})
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npx vitest run src/utils/motifs.test.ts`
Expected: the 5 new tests FAIL (motifs missing from result); the 7 earlier ones still PASS.

- [ ] **Step 3: Extend the implementation**

Add to `src/utils/motifs.ts` (before `detectMotifs`), then wire the calls in:

```typescript
const RAY_DIRS: Record<'b' | 'r' | 'q', Array<[number, number]>> = {
  b: [[1, 1], [1, -1], [-1, 1], [-1, -1]],
  r: [[1, 0], [-1, 0], [0, 1], [0, -1]],
  q: [[1, 1], [1, -1], [-1, 1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]],
}

function sq(file: number, rank: number): Square | null {
  if (file < 0 || file > 7 || rank < 0 || rank > 7) return null
  return (String.fromCharCode(97 + file) + String(rank + 1)) as Square
}

function fileOf(s: Square): number {
  return s.charCodeAt(0) - 97
}
function rankOf(s: Square): number {
  return parseInt(s[1], 10) - 1
}

// Walk each ray from a sliding piece; report the first two enemy pieces hit
// (with nothing of ours in between) — the raw material for pin/skewer calls.
function rayPairs(
  chess: Chess,
  from: Square,
  type: 'b' | 'r' | 'q',
  mover: Color,
): Array<{ front: PieceOnSquare; back: PieceOnSquare }> {
  const enemy: Color = mover === 'w' ? 'b' : 'w'
  const pairs: Array<{ front: PieceOnSquare; back: PieceOnSquare }> = []
  for (const [df, dr] of RAY_DIRS[type]) {
    let f = fileOf(from) + df
    let r = rankOf(from) + dr
    let front: PieceOnSquare | null = null
    while (true) {
      const s = sq(f, r)
      if (!s) break
      const piece = chess.get(s)
      if (piece) {
        if (piece.color === mover) break // own piece blocks the ray
        const found: PieceOnSquare = { square: s, type: piece.type, color: piece.color }
        if (!front) {
          front = found
        } else {
          pairs.push({ front, back: found })
          break
        }
      }
      f += df
      r += dr
    }
  }
  return pairs
}

// Pin: front piece shields a MORE valuable one behind it (it can't move away).
// Skewer: front piece is MORE valuable and will move, exposing the one behind.
function detectPinSkewer(
  chess: Chess,
  to: Square,
  movedType: PieceSymbol,
  mover: Color,
): TacticalMotif[] {
  if (movedType !== 'b' && movedType !== 'r' && movedType !== 'q') return []
  const out: TacticalMotif[] = []
  for (const { front, back } of rayPairs(chess, to, movedType, mover)) {
    const frontV = VALUE[front.type]
    const backV = VALUE[back.type]
    if (backV > frontV && front.type !== 'k') out.push('pin')
    else if (frontV > backV || front.type === 'k') out.push('skewer')
  }
  return [...new Set(out)]
}

// Discovered attack: after the move, a mover-side sliding piece attacks a
// valuable enemy piece (or king) along a ray passing through the vacated square.
function detectDiscovered(chess: Chess, from: Square, to: Square, mover: Color): boolean {
  const enemy: Color = mover === 'w' ? 'b' : 'w'
  for (const piece of piecesOf(chess, mover)) {
    if (piece.square === to) continue
    if (piece.type !== 'b' && piece.type !== 'r' && piece.type !== 'q') continue
    // The vacated square must lie on the ray between the slider and its target.
    for (const { front } of rayPairs(chess, piece.square, piece.type, mover)) {
      if (front.type !== 'k' && VALUE[front.type] < 5) continue
      if (!onRay(piece.square, from, front.square)) continue
      return true
    }
  }
  return false
}

// Is `mid` strictly between `a` and `b` on a shared rank/file/diagonal?
function onRay(a: Square, mid: Square, b: Square): boolean {
  const df1 = Math.sign(fileOf(mid) - fileOf(a))
  const dr1 = Math.sign(rankOf(mid) - rankOf(a))
  const df2 = Math.sign(fileOf(b) - fileOf(mid))
  const dr2 = Math.sign(rankOf(b) - rankOf(mid))
  if (df1 !== df2 || dr1 !== dr2) return false
  const colinear =
    (fileOf(a) === fileOf(mid) && fileOf(mid) === fileOf(b)) ||
    (rankOf(a) === rankOf(mid) && rankOf(mid) === rankOf(b)) ||
    (Math.abs(fileOf(b) - fileOf(a)) === Math.abs(rankOf(b) - rankOf(a)) &&
      Math.abs(fileOf(mid) - fileOf(a)) === Math.abs(rankOf(mid) - rankOf(a)))
  return colinear
}

// Trapped piece: an enemy piece (minor or better) is attacked, and every legal
// move it has lands on a mover-attacked square — nowhere safe to run.
function detectTrapped(chess: Chess, mover: Color): boolean {
  const enemy: Color = mover === 'w' ? 'b' : 'w'
  // It's the enemy's turn after our move, so chess.moves() generates their moves.
  for (const p of piecesOf(chess, enemy)) {
    if (p.type === 'k' || p.type === 'p') continue
    if (chess.attackers(p.square, mover).length === 0) continue
    if (isDefended(chess, p.square, enemy)) continue
    const escapes = chess.moves({ square: p.square, verbose: true })
    if (escapes.length === 0) continue // can't move at all (could be pinned) — count as trapped
    const allUnsafe = escapes.every((m) => chess.attackers(m.to as Square, mover).length > 0)
    if (allUnsafe) return true
  }
  return false
}
```

Then extend `detectMotifs` — after the existing fork/hanging lines, add:

```typescript
  motifs.push(...detectPinSkewer(chess, move.to as Square, move.piece, mover))
  if (detectDiscovered(chess, move.from as Square, move.to as Square, mover)) {
    motifs.push('discovered-attack')
  }
  if (chess.isCheckmate()) {
    const ksq = kingSquare(chess, enemy)
    const backRank = enemy === 'w' ? '1' : '8'
    if (ksq[1] === backRank) motifs.push('back-rank')
  }
  if (detectTrapped(chess, mover)) motifs.push('trapped-piece')

  return [...new Set(motifs)]
```

(Replace the existing bare `return motifs` with the deduplicated return above.)

- [ ] **Step 4: Run the full motif suite**

Run: `npx vitest run src/utils/motifs.test.ts`
Expected: PASS (12 tests). These positions are hand-constructed — if one fails, print `new Chess(fen).ascii()` in the test to verify the position matches the comment's intent and fix the FEN, not the detector, when they disagree.

- [ ] **Step 5: Commit**

```bash
git add src/utils/motifs.ts src/utils/motifs.test.ts
git commit -m "feat: add ray-based motifs (pin, skewer, discovered attack, back rank, trapped)"
```

---

### Task 5: Extend types and the analyzeMove pipeline

**Files:**
- Modify: `src/types.ts`
- Modify: `src/utils/analysis.ts`
- Test: `src/utils/analysis.test.ts` (append)

- [ ] **Step 1: Extend `src/types.ts`**

Add after the existing `EngineResult` interface:

```typescript
export type GamePhase = 'opening' | 'middlegame' | 'endgame'

// An engine alternative at a position (one MultiPV line).
export interface AltMove {
  san: string
  lineSan: string[] // continuation in SAN, max 6 plies
  score: Score // side-to-move perspective at the position
  winPercent: number // mover's win% if this line is played
}
```

Re-export the motif type so UI imports stay on `types.ts`:

```typescript
export type { TacticalMotif } from './utils/motifs'
```

Add to `AnalyzedMove` (after `isSacrifice`):

```typescript
  phase: GamePhase
  alternatives: AltMove[] // top engine lines at the position, lines[0] first
  motifs: TacticalMotif[] // motifs the played move creates
  missedMotifs: TacticalMotif[] // motifs the best move had that the player skipped
  clockSeconds: number | null // remaining clock after this move (%clk), if known
  timeSpent: number | null // seconds spent on this move, if known
```

(Import `TacticalMotif` at the top of types.ts: `import type { TacticalMotif } from './utils/motifs'`.)

- [ ] **Step 2: Write failing tests for the analyzeMove additions**

Append to `src/utils/analysis.test.ts`:

```typescript
describe('analyzeMove: alternatives and motifs', () => {
  // White to move; Nc7+ forks king and rook. Best line per the fake engine.
  const FEN = 'r3k3/8/8/3N4/8/8/8/4K3 w - - 0 1'
  const resultBefore = {
    lines: [
      { score: { cp: 600 }, pv: ['d5c7', 'e8d8', 'c7a8'] },
      { score: { cp: 100 }, pv: ['e1d2'] },
      { score: { cp: 50 }, pv: ['e1f2'] },
    ],
  }
  const resultAfterBest = { lines: [{ score: { cp: -600 }, pv: [] }] }
  const resultAfterBad = { lines: [{ score: { cp: -50 }, pv: [] }] }

  it('exposes the engine lines as SAN alternatives with win%', () => {
    const a = analyzeMove({
      fenBefore: FEN,
      playedSan: 'Nc7+',
      moverColor: 'w',
      resultBefore,
      resultAfter: resultAfterBest,
      isBook: false,
    })
    expect(a.alternatives).toHaveLength(3)
    expect(a.alternatives[0].san).toBe('Nc7+')
    expect(a.alternatives[0].winPercent).toBeGreaterThan(90)
    expect(a.alternatives[1].san).toBe('Kd2')
  })

  it('tags motifs on the played move', () => {
    const a = analyzeMove({
      fenBefore: FEN,
      playedSan: 'Nc7+',
      moverColor: 'w',
      resultBefore,
      resultAfter: resultAfterBest,
      isBook: false,
    })
    expect(a.motifs).toContain('fork')
    expect(a.missedMotifs).toEqual([])
  })

  it('tags missed motifs when a weaker move skips the tactic', () => {
    const a = analyzeMove({
      fenBefore: FEN,
      playedSan: 'Kd2',
      moverColor: 'w',
      resultBefore,
      resultAfter: resultAfterBad,
      isBook: false,
    })
    expect(a.missedMotifs).toContain('fork')
    expect(a.explanation).toMatch(/fork/i)
  })
})
```

(`analyzeMove` is already imported in this test file; if not, add it to the import list.)

- [ ] **Step 3: Run tests to verify the new ones fail**

Run: `npx vitest run src/utils/analysis.test.ts`
Expected: new tests FAIL (`alternatives` undefined); existing tests PASS.

- [ ] **Step 4: Implement in `src/utils/analysis.ts`**

Add imports at the top:

```typescript
import { detectMotifs, type TacticalMotif } from './motifs'
import type { AltMove } from '../types'
```

Extend the `MoveAnalysis` interface:

```typescript
  alternatives: AltMove[]
  motifs: TacticalMotif[]
  missedMotifs: TacticalMotif[]
```

Inside `analyzeMove`, after `bestLineSan`/`bestMoveSan` are computed, add:

```typescript
  // All engine lines as SAN alternatives — the position's "width".
  const alternatives: AltMove[] = resultBefore.lines
    .map((l) => {
      const lineSan = lineToSan(fenBefore, l.pv, 6)
      return {
        san: lineSan[0] ?? '',
        lineSan,
        score: l.score,
        winPercent: winChance(l.score),
      }
    })
    .filter((a) => a.san !== '')

  const motifs = detectMotifs(fenBefore, playedSan)
  // What the best move would have created, minus what the played move already
  // does — only meaningful when the player chose something clearly worse.
  const missedMotifs: TacticalMotif[] =
    !playedIsBest && bestMoveSan && winDrop >= 4
      ? detectMotifs(fenBefore, bestMoveSan).filter((m) => !motifs.includes(m))
      : []
```

In the explanation section, after the existing "would have been brilliant" / "forced mate" suffixes, add a missed-motif sentence:

```typescript
  const MOTIF_LABEL: Record<TacticalMotif, string> = {
    fork: 'a fork',
    pin: 'a pin',
    skewer: 'a skewer',
    'discovered-attack': 'a discovered attack',
    'double-check': 'a double check',
    'hanging-piece': 'a hanging piece',
    'back-rank': 'a back-rank mate',
    'mate-threat': 'a mate threat',
    'trapped-piece': 'a piece trap',
    sacrifice: 'a sacrifice',
    promotion: 'a promotion',
  }
  if (missedMotifs.length > 0 && bestMoveSan) {
    explanation += ` You missed ${MOTIF_LABEL[missedMotifs[0]]} with ${bestMoveSan}.`
  }
```

(Declare `MOTIF_LABEL` at module scope, not inside the function, and export it — the UI reuses it.)

Add the new fields to the returned object:

```typescript
    alternatives,
    motifs,
    missedMotifs,
```

- [ ] **Step 5: Run the suite, fix compile fallout**

Run: `npx vitest run src/utils/analysis.test.ts && npx tsc -b`
Expected: analysis tests PASS. `tsc` will fail where `AnalyzedMove` objects are constructed without the new fields — that is `src/hooks/useStockfish.ts` (fixed properly in Task 6). For now make it compile by adding placeholder values in `useStockfish.ts`'s move mapping: `phase: 'middlegame' as const, clockSeconds: null, timeSpent: null` (the analysis spread provides `alternatives`/`motifs`/`missedMotifs`). Any test fixtures building `AnalyzedMove` literals (e.g. in `accuracy.test.ts`, `reviewExport.test.ts`, `benchmark.test.ts`) get the same defaults — add a small `makeMove(overrides)` helper in the test file if repetition gets noisy.

- [ ] **Step 6: Commit**

```bash
git add src/types.ts src/utils/analysis.ts src/utils/analysis.test.ts src/hooks/useStockfish.ts src/utils/*.test.ts
git commit -m "feat: analyzeMove returns alternatives, motifs and missed motifs"
```

---

### Task 6: Shared game-analysis core + full wiring (phase, clocks, depth 18 / MultiPV 3)

**Files:**
- Create: `src/utils/gameAnalysis.ts`
- Test: `src/utils/gameAnalysis.test.ts`
- Modify: `src/hooks/useStockfish.ts`
- Modify: `src/App.tsx`

- [ ] **Step 1: Write the failing test**

```typescript
// src/utils/gameAnalysis.test.ts
import { describe, it, expect } from 'vitest'
import { Chess } from 'chess.js'
import { analyzeGamePositions, type PositionAnalyser } from './gameAnalysis'

// Fake engine: every position evaluates to +20 cp, pv echoes a legal move.
const fakeAnalyse: PositionAnalyser = async (fen) => {
  const legal = new Chess(fen).moves()[0]
  return { lines: [{ score: { cp: 20 }, pv: legal ? [legal] : [] }] }
}

function gameFixture(sans: string[]) {
  const chess = new Chess()
  const fens = [chess.fen()]
  const moves = sans.map((san) => {
    const m = chess.move(san)
    fens.push(chess.fen())
    return { san: m.san, color: m.color, fenAfter: m.after, to: m.to }
  })
  return { fens, moves }
}

describe('analyzeGamePositions', () => {
  it('produces one AnalyzedMove per move with phase and clock data', async () => {
    const { fens, moves } = gameFixture(['e4', 'e5', 'Nf3'])
    const out = await analyzeGamePositions(fakeAnalyse, fens, moves, {
      bookPlies: 2,
      clocks: [180, 179, 175],
      timeSpent: [2, 3, 6],
    })
    expect(out).not.toBeNull()
    expect(out!.analyzed).toHaveLength(3)
    expect(out!.analyzed[0].quality).toBe('book')
    expect(out!.analyzed[0].phase).toBe('opening')
    expect(out!.analyzed[2].clockSeconds).toBe(175)
    expect(out!.analyzed[2].timeSpent).toBe(6)
    expect(out!.scores).toHaveLength(4)
  })

  it('reports progress and honours isStale', async () => {
    const { fens, moves } = gameFixture(['e4', 'e5'])
    const seen: number[] = []
    let calls = 0
    const out = await analyzeGamePositions(fakeAnalyse, fens, moves, {
      onProgress: (done) => seen.push(done),
      isStale: () => ++calls > 2, // go stale after two positions
    })
    expect(out).toBeNull()
    expect(seen.length).toBeLessThan(3)
  })

  it('defaults clocks to null when absent', async () => {
    const { fens, moves } = gameFixture(['e4'])
    const out = await analyzeGamePositions(fakeAnalyse, fens, moves, {})
    expect(out!.analyzed[0].clockSeconds).toBeNull()
    expect(out!.analyzed[0].timeSpent).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/gameAnalysis.test.ts`
Expected: FAIL — `Cannot find module './gameAnalysis'`

- [ ] **Step 3: Write the implementation**

```typescript
// src/utils/gameAnalysis.ts
import type { AnalyzedMove, EngineResult, Score } from '../types'
import type { GameMove } from '../hooks/useChessGame'
import { analyzeMove } from './analysis'
import { phaseOfPosition } from './phase'

// One engine call: analyse a FEN, return the MultiPV result. Abstracted so
// tests (and future engines) can swap in a fake.
export type PositionAnalyser = (fen: string) => Promise<EngineResult>

export interface GameAnalysisOptions {
  bookPlies?: number
  clocks?: number[] // remaining seconds after each ply ([] / missing = unknown)
  timeSpent?: (number | null)[]
  onProgress?: (done: number, total: number) => void
  isStale?: () => boolean // checked after each position; true aborts (returns null)
}

export interface GameAnalysisResult {
  analyzed: AnalyzedMove[]
  scores: Score[] // per position, side-to-move perspective
}

// The engine-driven game loop shared by single-game review (useStockfish) and
// multi-game trends (useTrends). fens[i] precedes moves[i].
export async function analyzeGamePositions(
  analyse: PositionAnalyser,
  fens: string[],
  moves: GameMove[],
  { bookPlies = 0, clocks = [], timeSpent = [], onProgress, isStale }: GameAnalysisOptions,
): Promise<GameAnalysisResult | null> {
  const results: EngineResult[] = []
  for (let i = 0; i < fens.length; i++) {
    const result = await analyse(fens[i])
    if (isStale?.()) return null
    results.push(result)
    onProgress?.(i + 1, fens.length)
  }
  const scores: Score[] = results.map((r) => r.lines[0]?.score ?? {})
  const analyzed: AnalyzedMove[] = moves.map((m, i) => {
    const analysis = analyzeMove({
      fenBefore: fens[i],
      playedSan: m.san,
      moverColor: m.color,
      resultBefore: results[i],
      resultAfter: results[i + 1] ?? results[i],
      isBook: i < bookPlies,
    })
    return {
      san: m.san,
      color: m.color,
      fenAfter: m.fenAfter,
      toSquare: m.to,
      phase: phaseOfPosition(fens[i], i, bookPlies),
      clockSeconds: clocks[i] ?? null,
      timeSpent: timeSpent[i] ?? null,
      ...analysis,
    }
  })
  return { analyzed, scores }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/gameAnalysis.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Rewire `useStockfish.ts` onto the shared core**

Replace the body of `analyze` so the hook only owns engine lifecycle + React state. New signature and body:

```typescript
  // fens/moves as before; opts carries book/clock context from the App.
  async function analyze(
    fens: string[],
    moves: GameMove[],
    opts: { bookPlies?: number; clocks?: number[]; timeSpent?: (number | null)[]; depth?: number } = {},
  ) {
    const engine = engineRef.current
    if (!engine) return
    const generation = ++generationRef.current
    engine.reset()
    const isStale = () => generation !== generationRef.current || !mountedRef.current

    setError(null)
    setAnalyzed(null)
    setScores([])
    setProgress({ done: 0, total: fens.length })
    try {
      // MultiPV=3: best line + two alternatives — feeds AlternativesPanel and
      // the trainer's "almost" grading.
      const out = await analyzeGamePositions(
        (fen) => engine.analyse(fen, { depth: opts.depth ?? 18, multipv: 3 }),
        fens,
        moves,
        {
          bookPlies: opts.bookPlies ?? 0,
          clocks: opts.clocks,
          timeSpent: opts.timeSpent,
          isStale,
          onProgress: (done, total) => setProgress({ done, total }),
        },
      )
      if (!out || isStale()) return
      setScores(out.scores)
      setAnalyzed(out.analyzed)
      return out
    } catch {
      if (!isStale()) {
        setError('Failed to load the chess engine')
        setAnalyzed(null)
      }
    }
  }
```

Import `analyzeGamePositions` from `../utils/gameAnalysis`; drop the now-unused `analyzeMove`/`EngineResult` imports and the Task 5 placeholder fields.

- [ ] **Step 6: Update the App call site**

In `src/App.tsx`, replace the analyze effect:

```typescript
import { extractClocks, parseTimeControl, computeTimeSpent } from './utils/clock'

  useEffect(() => {
    if (selected && engine.ready && game.moves.length > 0) {
      const bookPlies = activePgn ? openingPlyCount(activePgn) : 0
      const clocks = activePgn ? extractClocks(activePgn) : []
      const { base, inc } = parseTimeControl(selected.time_control)
      const timeSpent = computeTimeSpent(clocks, base, inc)
      engine.analyze(game.fens, game.moves, { bookPlies, clocks, timeSpent })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, engine.ready, game.moves.length])
```

- [ ] **Step 7: Full check**

Run: `npx vitest run && npx tsc -b`
Expected: all tests PASS, clean compile. Then `npm run dev`, load a game, confirm analysis still completes and the eval bar moves.

- [ ] **Step 8: Commit**

```bash
git add src/utils/gameAnalysis.ts src/utils/gameAnalysis.test.ts src/hooks/useStockfish.ts src/App.tsx
git commit -m "feat: shared game analysis core with phase/clock wiring, depth 18 MultiPV 3"
```

---

### Task 7: Dark education-tuned theme

**Files:**
- Modify: `src/index.css`
- Modify: `src/components/MoveInsight.tsx`, `src/components/MoveList.tsx`, `src/components/GamesList.tsx`, `src/components/StatsPanel.tsx` (replace hardcoded gray classes with tokens)

No unit tests — visual change; verification is `npm run dev` + eyes.

- [ ] **Step 1: Swap the CSS tokens to dark**

In `src/index.css`, replace the `:root` block and color-scheme:

```css
  :root {
    /* Dark, education-tuned palette. */
    --paper: #0d1117;
    --surface: #161b22;
    --surface-2: #1f2937;
    --ink: #e6edf3;
    --muted: #8b949e;
    --line: #30363d;
    --accent: #4fc3f7;
    --accent-press: #29b6f6;

    /* Board squares — muted slate. */
    --board-light: #b8c0cc;
    --board-dark: #5c6b7a;
  }

  html {
    color-scheme: dark;
  }
```

Update `.card` box-shadow to a dark-friendly one: `box-shadow: 0 1px 2px rgb(0 0 0 / 0.4);`. `.btn-primary` color stays readable: set `color: #0d1117`.

- [ ] **Step 2: Replace gray utility classes with tokens**

- `MoveInsight.tsx`: `bg-gray-50` → `bg-surface-2`; `text-gray-700` → `text-ink`; `text-gray-600`/`text-gray-500` → `text-muted`; the teal/red badge backgrounds: `bg-teal-100 text-teal-800` → `bg-teal-900/40 text-teal-300`, `bg-red-100 text-red-800` → `bg-red-900/40 text-red-300`.
- `MoveList.tsx`: `text-gray-400` → `text-muted`; active `bg-gray-200` → `bg-surface-2`.
- `GamesList.tsx`: `text-gray-500` → `text-muted`; `hover:bg-gray-50` → `hover:bg-surface-2`; `divide-y rounded-lg border` → `divide-y divide-line rounded-lg border border-line`.
- `StatsPanel.tsx`: `text-gray-500` → `text-muted`; `rounded-lg border` → `rounded-lg border border-line bg-surface`.

- [ ] **Step 3: Verify visually**

Run: `npm run dev` — search a user, open a game. Background near-black, cards `#161b22`, readable text, eval bar and board visible, no leftover white patches.

- [ ] **Step 4: Commit**

```bash
git add src/index.css src/components/MoveInsight.tsx src/components/MoveList.tsx src/components/GamesList.tsx src/components/StatsPanel.tsx
git commit -m "feat: dark education-tuned theme"
```

---

### Task 8: EvalGraph component

**Files:**
- Create: `src/components/EvalGraph.tsx`
- Create: `src/utils/winSeries.ts` (extract the white-win% series so graph + accuracy share it)
- Test: `src/utils/winSeries.test.ts`
- Modify: `src/utils/accuracy.ts` (reuse the extracted series)

- [ ] **Step 1: Write the failing test for the series util**

```typescript
// src/utils/winSeries.test.ts
import { describe, it, expect } from 'vitest'
import { whiteWinSeries } from './winSeries'
import type { AnalyzedMove } from '../types'

function mv(over: Partial<AnalyzedMove>): AnalyzedMove {
  return {
    san: 'e4', color: 'w', fenAfter: '', toSquare: 'e4', quality: 'good',
    cpDrop: 0, winBefore: 50, winAfter: 50, winDrop: 0, explanation: '',
    bestMoveSan: null, bestLineSan: [], mateIn: null, isSacrifice: false,
    phase: 'middlegame', alternatives: [], motifs: [], missedMotifs: [],
    clockSeconds: null, timeSpent: null,
    ...over,
  }
}

describe('whiteWinSeries', () => {
  it('starts from the first move and flips black perspectives', () => {
    const moves = [
      mv({ color: 'w', winBefore: 52, winAfter: 55 }),
      mv({ color: 'b', winBefore: 45, winAfter: 40 }),
    ]
    // index 0: before move 0 (white view 52); 1: after move 0 (55);
    // 2: after move 1 (black 40 -> white 60).
    expect(whiteWinSeries(moves)).toEqual([52, 55, 60])
  })
  it('empty game gives empty series', () => {
    expect(whiteWinSeries([])).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/winSeries.test.ts`
Expected: FAIL — `Cannot find module './winSeries'`

- [ ] **Step 3: Extract the util and rewire accuracy.ts**

```typescript
// src/utils/winSeries.ts
import type { AnalyzedMove } from '../types'

// White-perspective win% at every position, reconstructed from the move list.
// Index 0 is before move 0; index i+1 is after move i.
export function whiteWinSeries(moves: AnalyzedMove[]): number[] {
  if (moves.length === 0) return []
  const first = moves[0]
  const series = [first.color === 'w' ? first.winBefore : 100 - first.winBefore]
  for (const m of moves) {
    series.push(m.color === 'w' ? m.winAfter : 100 - m.winAfter)
  }
  return series
}
```

In `src/utils/accuracy.ts`, delete the private `whiteWinSeries` and import it: `import { whiteWinSeries } from './winSeries'`.

Run: `npx vitest run src/utils/winSeries.test.ts src/utils/accuracy.test.ts`
Expected: PASS.

- [ ] **Step 4: Build the EvalGraph component**

```tsx
// src/components/EvalGraph.tsx
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

  // Phase boundaries: first ply index where the phase changes.
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
        {/* White-advantage area above the midline tint */}
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
```

- [ ] **Step 5: Mount it in App (temporary slot; final layout in Task 12)**

In `src/App.tsx`, under the existing grid `</div>` (after the board/movelist grid, before StatsPanel):

```tsx
          {engine.analyzed && (
            <EvalGraph moves={engine.analyzed} ply={game.ply} onSelectPly={game.goTo} />
          )}
```

Import: `import { EvalGraph } from './components/EvalGraph'`.

- [ ] **Step 6: Verify**

Run: `npx vitest run && npx tsc -b`, then `npm run dev` — analyze a game: graph renders full-width, dots on mistakes, clicking jumps the board, vertical marker follows navigation.

- [ ] **Step 7: Commit**

```bash
git add src/components/EvalGraph.tsx src/utils/winSeries.ts src/utils/winSeries.test.ts src/utils/accuracy.ts src/App.tsx
git commit -m "feat: add clickable eval graph with mistake dots and phase bands"
```

---

### Task 9: Board arrows + interactive move input

**Files:**
- Modify: `src/components/ChessBoard.tsx`
- Modify: `src/App.tsx` (arrow toggle state + best-move arrow wiring)

react-chessboard v5 takes everything through the `options` prop. The two capabilities used here: `arrows` (array of `{ startSquare, endSquare, color }`) and drag-to-move via `onPieceDrop` + `allowDragging`. **First verify the exact option names against the installed version** (`node_modules/react-chessboard/dist/index.d.ts`) — if they differ (e.g. `customArrows` from v4), adapt the property names, not the design.

- [ ] **Step 1: Extend ChessBoard**

```tsx
// src/components/ChessBoard.tsx — new props and options
export interface BoardArrow {
  from: string
  to: string
  color: string // CSS color
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
    <div className="relative w-full max-w-[480px]">
      <Chessboard
        options={{
          position: fen,
          boardOrientation: orientation,
          allowDragging: onMove !== undefined,
          arrows: arrows.map((a) => ({ startSquare: a.from, endSquare: a.to, color: a.color })),
          onPieceDrop: onMove
            ? ({ sourceSquare, targetSquare }) =>
                targetSquare ? onMove(sourceSquare, targetSquare) : false
            : undefined,
        }}
      />
      {/* badge overlay unchanged */}
    </div>
  )
}
```

- [ ] **Step 2: Wire the best-move arrow in App**

Add state + derived arrows in `App.tsx`:

```tsx
  const [showBestArrow, setShowBestArrow] = useState(true)

  // Arrows for the position currently shown: the engine's best move from here
  // (green), and on mistakes the move that was actually played (faint red).
  const currentAnalysis = engine.analyzed?.[game.ply] ?? null // move about to be played
  const lastMove = game.ply > 0 ? engine.analyzed?.[game.ply - 1] ?? null : null
  const arrows: BoardArrow[] = []
  if (showBestArrow && currentAnalysis?.alternatives[0]) {
    const bestUci = uciOfSan(game.currentFen, currentAnalysis.alternatives[0].san)
    if (bestUci) arrows.push({ from: bestUci.from, to: bestUci.to, color: '#5c8a3c' })
  }
```

Add the tiny SAN→from/to helper to `src/utils/analysis.ts` (exported, beside `lineToSan`):

```typescript
// Resolve a SAN move at a FEN to its from/to squares (for board arrows).
export function uciOfSan(fen: string, san: string): { from: string; to: string } | null {
  try {
    const m = new Chess(fen).move(san)
    return { from: m.from, to: m.to }
  } catch {
    return null
  }
}
```

Pass to the board: `<ChessBoard fen={game.currentFen} badge={...} arrows={arrows} />`. Add a toggle button next to the navigation buttons:

```tsx
<button
  onClick={() => setShowBestArrow((v) => !v)}
  className={`btn h-9 px-3 text-sm ${showBestArrow ? 'btn-primary' : 'btn-ghost'}`}
>
  Best move
</button>
```

- [ ] **Step 3: Verify**

Run: `npx tsc -b && npm run dev` — green arrow shows the engine move at each position and follows navigation; the toggle hides it. (The red played-move arrow arrives with the trainer's review polish in Task 13 — skip it here, YAGNI until mistake navigation exists.)

- [ ] **Step 4: Commit**

```bash
git add src/components/ChessBoard.tsx src/utils/analysis.ts src/App.tsx
git commit -m "feat: engine best-move arrow on the board with toggle"
```

---

### Task 10: AlternativesPanel

**Files:**
- Create: `src/components/AlternativesPanel.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Build the component**

```tsx
// src/components/AlternativesPanel.tsx
import type { AnalyzedMove } from '../types'
import { scoreToCp } from '../utils/eval'

function fmtScore(alt: AnalyzedMove['alternatives'][number]): string {
  if (alt.score.mate !== undefined) return `#${alt.score.mate}`
  const pawns = scoreToCp(alt.score) / 100
  return `${pawns >= 0 ? '+' : ''}${pawns.toFixed(1)}`
}

// Engine alternatives for the position about to be played. `move` is the
// AnalyzedMove whose fenBefore is on the board (i.e. analyzed[ply]).
export function AlternativesPanel({
  move,
  onPreview,
}: {
  move: AnalyzedMove
  onPreview?: (san: string | null) => void
}) {
  if (move.alternatives.length === 0) return null
  return (
    <div className="card p-3 text-sm">
      <p className="mb-2 text-xs uppercase tracking-wider text-muted">Engine lines</p>
      <ol className="space-y-1.5">
        {move.alternatives.map((alt, i) => (
          <li
            key={i}
            className="flex items-baseline gap-2 rounded px-1.5 py-0.5 hover:bg-surface-2"
            onMouseEnter={() => onPreview?.(alt.san)}
            onMouseLeave={() => onPreview?.(null)}
          >
            <span className="nums w-12 shrink-0 font-semibold text-accent">{fmtScore(alt)}</span>
            <span className="nums w-10 shrink-0 text-xs text-muted">{alt.winPercent.toFixed(0)}%</span>
            <span className="min-w-0 truncate font-mono text-xs text-ink">{alt.lineSan.join(' ')}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}
```

- [ ] **Step 2: Mount in App with hover-preview arrow**

In `App.tsx` add preview state and merge into the arrows array from Task 9:

```tsx
  const [previewSan, setPreviewSan] = useState<string | null>(null)
  // in the arrows construction, after the best-move arrow:
  if (previewSan) {
    const uci = uciOfSan(game.currentFen, previewSan)
    if (uci) arrows.push({ from: uci.from, to: uci.to, color: '#4fc3f7' })
  }
```

Mount under MoveInsight (inside the right-hand column):

```tsx
  {currentAnalysis && (
    <AlternativesPanel move={currentAnalysis} onPreview={setPreviewSan} />
  )}
```

- [ ] **Step 3: Verify**

`npm run dev` — three lines listed with eval + win% + continuation; hovering a line draws a blue arrow for its first move.

- [ ] **Step 4: Commit**

```bash
git add src/components/AlternativesPanel.tsx src/App.tsx
git commit -m "feat: top-3 engine alternatives panel with hover arrow preview"
```

---

### Task 11: MoveInsight extension — motif badges, missed motifs, time info

**Files:**
- Modify: `src/components/MoveInsight.tsx`

- [ ] **Step 1: Extend the component**

Add badge metadata at the top of the file:

```tsx
import type { TacticalMotif } from '../types'
import { MOTIF_LABEL } from '../utils/analysis'

const MOTIF_ICON: Record<TacticalMotif, string> = {
  fork: '🍴', pin: '📌', skewer: '🍢', 'discovered-attack': '🎭',
  'double-check': '⚡', 'hanging-piece': '🎯', 'back-rank': '🏰',
  'mate-threat': '☠️', 'trapped-piece': '🕸️', sacrifice: '💥', promotion: '👑',
}

function fmtClock(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}
```

In the JSX, after the existing sacrifice/mate badges, render motif badges:

```tsx
  {move.motifs.map((m) => (
    <span key={m} className="rounded bg-surface px-1.5 py-0.5 text-xs text-accent">
      {MOTIF_ICON[m]} {MOTIF_LABEL[m].replace(/^a /, '')}
    </span>
  ))}
```

After the explanation paragraph, a missed-motif callout (red-tinted, education-first):

```tsx
  {move.missedMotifs.length > 0 && (
    <p className="mt-1 rounded bg-red-900/30 px-2 py-1 text-xs text-red-300">
      Missed: {move.missedMotifs.map((m) => `${MOTIF_ICON[m]} ${MOTIF_LABEL[m].replace(/^a /, '')}`).join(', ')}
      {move.bestMoveSan ? ` — ${move.bestMoveSan} was the way.` : ''}
    </p>
  )}
```

And a time line at the bottom (only when clock data exists):

```tsx
  {move.timeSpent !== null && move.clockSeconds !== null && (
    <div className="mt-1 text-xs text-muted">
      Thought for <span className="nums font-semibold">{move.timeSpent.toFixed(0)}s</span> · clock{' '}
      <span className="nums font-semibold">{fmtClock(move.clockSeconds)}</span>
      {move.clockSeconds < 30 && <span className="text-orange-400"> · time pressure</span>}
    </div>
  )}
```

`MOTIF_LABEL` was exported from `analysis.ts` in Task 5 (values like "a fork" — hence the `replace(/^a /, '')` for badge text).

- [ ] **Step 2: Verify**

`npx tsc -b && npm run dev` — play through a game with tactics: badges appear on forking moves, a red "Missed:" strip on mistakes that skipped a tactic, time info under each insight for games with clocks.

- [ ] **Step 3: Commit**

```bash
git add src/components/MoveInsight.tsx
git commit -m "feat: motif badges, missed-motif callout and time info in move insight"
```

---

### Task 12: PhasePanel + TimePanel + final layout

**Files:**
- Create: `src/components/PhasePanel.tsx`
- Create: `src/components/TimePanel.tsx`
- Create: `src/utils/phaseStats.ts`
- Test: `src/utils/phaseStats.test.ts`
- Modify: `src/App.tsx` (final layout per the spec)

- [ ] **Step 1: Write the failing test for the stats util**

```typescript
// src/utils/phaseStats.test.ts
import { describe, it, expect } from 'vitest'
import { phaseStats, timePressureStats } from './phaseStats'
import type { AnalyzedMove } from '../types'

function mv(over: Partial<AnalyzedMove>): AnalyzedMove {
  return {
    san: 'e4', color: 'w', fenAfter: '', toSquare: 'e4', quality: 'good',
    cpDrop: 0, winBefore: 50, winAfter: 50, winDrop: 0, explanation: '',
    bestMoveSan: null, bestLineSan: [], mateIn: null, isSacrifice: false,
    phase: 'middlegame', alternatives: [], motifs: [], missedMotifs: [],
    clockSeconds: null, timeSpent: null,
    ...over,
  }
}

describe('phaseStats', () => {
  it('aggregates win-drop and mistakes per phase for one side', () => {
    const moves = [
      mv({ phase: 'opening', winDrop: 0 }),
      mv({ phase: 'opening', color: 'b', winDrop: 2 }),
      mv({ phase: 'middlegame', winDrop: 15, quality: 'mistake' }),
      mv({ phase: 'middlegame', color: 'b', winDrop: 0 }),
      mv({ phase: 'endgame', winDrop: 30, quality: 'blunder' }),
    ]
    const s = phaseStats(moves, 'w')
    expect(s.opening.moves).toBe(1)
    expect(s.middlegame.errors).toBe(1)
    expect(s.endgame.errors).toBe(1)
    expect(s.endgame.totalWinDrop).toBe(30)
  })
})

describe('timePressureStats', () => {
  it('splits errors by clock pressure', () => {
    const moves = [
      mv({ clockSeconds: 200, quality: 'blunder', winDrop: 25 }),
      mv({ clockSeconds: 20, quality: 'blunder', winDrop: 25 }),
      mv({ clockSeconds: 15, quality: 'good' }),
    ]
    const s = timePressureStats(moves, 'w', 30)
    expect(s).not.toBeNull()
    expect(s!.pressureMoves).toBe(2)
    expect(s!.pressureErrors).toBe(1)
    expect(s!.normalErrors).toBe(1)
  })
  it('returns null without clock data', () => {
    expect(timePressureStats([mv({})], 'w', 30)).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/phaseStats.test.ts`
Expected: FAIL — `Cannot find module './phaseStats'`

- [ ] **Step 3: Write the implementation**

```typescript
// src/utils/phaseStats.ts
import type { AnalyzedMove, GamePhase } from '../types'

const ERROR_QUALITIES = new Set(['inaccuracy', 'mistake', 'blunder', 'miss'])

export interface PhaseSideStats {
  moves: number
  errors: number
  totalWinDrop: number
}

export function phaseStats(
  moves: AnalyzedMove[],
  color: 'w' | 'b',
): Record<GamePhase, PhaseSideStats> {
  const out: Record<GamePhase, PhaseSideStats> = {
    opening: { moves: 0, errors: 0, totalWinDrop: 0 },
    middlegame: { moves: 0, errors: 0, totalWinDrop: 0 },
    endgame: { moves: 0, errors: 0, totalWinDrop: 0 },
  }
  for (const m of moves) {
    if (m.color !== color) continue
    const s = out[m.phase]
    s.moves++
    s.totalWinDrop += m.winDrop
    if (ERROR_QUALITIES.has(m.quality)) s.errors++
  }
  return out
}

export interface TimePressureStats {
  pressureMoves: number
  pressureErrors: number
  normalMoves: number
  normalErrors: number
}

// Errors under vs. above the clock threshold. Null when the game has no clocks.
export function timePressureStats(
  moves: AnalyzedMove[],
  color: 'w' | 'b',
  thresholdSeconds: number,
): TimePressureStats | null {
  const own = moves.filter((m) => m.color === color && m.clockSeconds !== null)
  if (own.length === 0) return null
  const stats: TimePressureStats = { pressureMoves: 0, pressureErrors: 0, normalMoves: 0, normalErrors: 0 }
  for (const m of own) {
    const isError = ERROR_QUALITIES.has(m.quality)
    if ((m.clockSeconds as number) < thresholdSeconds) {
      stats.pressureMoves++
      if (isError) stats.pressureErrors++
    } else {
      stats.normalMoves++
      if (isError) stats.normalErrors++
    }
  }
  return stats
}
```

Run: `npx vitest run src/utils/phaseStats.test.ts` — PASS.

- [ ] **Step 4: Build PhasePanel**

```tsx
// src/components/PhasePanel.tsx
import type { AnalyzedMove, GamePhase } from '../types'
import { phaseStats } from '../utils/phaseStats'

const PHASES: GamePhase[] = ['opening', 'middlegame', 'endgame']
const PHASE_LABEL: Record<GamePhase, string> = {
  opening: 'Opening', middlegame: 'Middlegame', endgame: 'Endgame',
}

export function PhasePanel({ moves, color }: { moves: AnalyzedMove[]; color: 'w' | 'b' }) {
  const stats = phaseStats(moves, color)
  const played = PHASES.filter((p) => stats[p].moves > 0)
  if (played.length < 2) return null // a single-phase game has nothing to compare
  const worst = played.reduce((a, b) =>
    stats[b].totalWinDrop / stats[b].moves > stats[a].totalWinDrop / stats[a].moves ? b : a,
  )
  const maxDrop = Math.max(...played.map((p) => stats[p].totalWinDrop), 1)
  return (
    <div className="card p-3 text-sm">
      <p className="mb-2 text-xs uppercase tracking-wider text-muted">By phase ({color === 'w' ? 'White' : 'Black'})</p>
      <div className="space-y-1.5">
        {played.map((p) => (
          <div key={p} className="flex items-center gap-2">
            <span className="w-24 shrink-0 text-xs text-muted">{PHASE_LABEL[p]}</span>
            <span className="relative h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
              <span
                className="absolute inset-y-0 left-0 rounded-full"
                style={{
                  width: `${(stats[p].totalWinDrop / maxDrop) * 100}%`,
                  backgroundColor: p === worst ? '#e07000' : 'var(--accent)',
                }}
              />
            </span>
            <span className="nums w-16 shrink-0 text-right text-xs text-muted">
              {stats[p].errors} err
            </span>
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-orange-300">
        Most win% was lost in the {PHASE_LABEL[worst].toLowerCase()}.
      </p>
    </div>
  )
}
```

- [ ] **Step 5: Build TimePanel**

```tsx
// src/components/TimePanel.tsx
import type { AnalyzedMove } from '../types'
import { timePressureStats } from '../utils/phaseStats'
import { QUALITY_COLOR } from '../utils/eval'

const PRESSURE_SECONDS = 30

export function TimePanel({ moves, color }: { moves: AnalyzedMove[]; color: 'w' | 'b' }) {
  const stats = timePressureStats(moves, color, PRESSURE_SECONDS)
  if (!stats) return null
  const own = moves.filter((m) => m.color === color && m.timeSpent !== null)
  const maxSpent = Math.max(...own.map((m) => m.timeSpent as number), 1)
  return (
    <div className="card p-3 text-sm">
      <p className="mb-2 text-xs uppercase tracking-wider text-muted">Time use ({color === 'w' ? 'White' : 'Black'})</p>
      <div className="flex h-16 items-end gap-px">
        {own.map((m, i) => (
          <span
            key={i}
            className="min-w-[3px] flex-1 rounded-t"
            style={{
              height: `${((m.timeSpent as number) / maxSpent) * 100}%`,
              backgroundColor:
                m.quality === 'blunder' || m.quality === 'mistake'
                  ? QUALITY_COLOR[m.quality]
                  : 'var(--surface-2)',
            }}
            title={`${m.san}: ${(m.timeSpent as number).toFixed(0)}s`}
          />
        ))}
      </div>
      {stats.pressureMoves > 0 && (
        <p className="mt-2 text-xs text-orange-300">
          {stats.pressureErrors} of {stats.pressureErrors + stats.normalErrors} errors came with under{' '}
          {PRESSURE_SECONDS}s on the clock ({stats.pressureMoves} such moves).
        </p>
      )}
    </div>
  )
}
```

- [ ] **Step 6: Final layout in App**

Arrange the analysis view per the spec (the board grid is already in place from earlier tasks; this step settles the bottom row). Replace the lone `<StatsPanel … />` mount with:

```tsx
          {engine.analyzed && userColor && (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <StatsPanel moves={engine.analyzed} opening={opening} />
              <PhasePanel moves={engine.analyzed} color={userColor} />
              <TimePanel moves={engine.analyzed} color={userColor} />
            </div>
          )}
```

`userColor` — the side the searched user played (the education panels focus on them):

```tsx
  const userColor: 'w' | 'b' | null = !selected || !profile
    ? null
    : selected.white.username.toLowerCase() === profile.username.toLowerCase()
      ? 'w'
      : selected.black.username.toLowerCase() === profile.username.toLowerCase()
        ? 'b'
        : 'w' // analyzing two strangers: default to White
```

Also flip the board to the user's side: `<ChessBoard … orientation={userColor === 'b' ? 'black' : 'white'} />`.

- [ ] **Step 7: Verify + commit**

Run: `npx vitest run && npx tsc -b`, then `npm run dev` — full flow: stats row shows three cards (TimePanel only for games with clocks), phase takeaway sentence reads correctly, board oriented to the searched user.

```bash
git add src/components/PhasePanel.tsx src/components/TimePanel.tsx src/utils/phaseStats.ts src/utils/phaseStats.test.ts src/App.tsx
git commit -m "feat: phase breakdown and time-pressure panels with final layout"
```

---

### Task 13: Mistake navigation in review mode

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Add prev/next-mistake jumps**

In `App.tsx`, beside the existing navigation buttons:

```tsx
  const ERROR_QUALITIES = new Set(['inaccuracy', 'mistake', 'blunder', 'miss'])
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
```

Buttons (after the ⏭ button):

```tsx
  {mistakePlies.length > 0 && (
    <>
      <button onClick={prevMistake} className="btn btn-ghost h-9 px-2 text-sm" aria-label="Previous mistake">← err</button>
      <button onClick={nextMistake} className="btn btn-ghost h-9 px-2 text-sm" aria-label="Next mistake">err →</button>
    </>
  )}
```

Also add the played-move red arrow when sitting on a mistake (extends the Task 9 arrows construction):

```tsx
  if (lastMove && ERROR_QUALITIES.has(lastMove.quality)) {
    const uci = uciOfSan(game.fens[game.ply - 1], lastMove.san)
    if (uci) arrows.push({ from: uci.from, to: uci.to, color: 'rgb(204 51 51 / 0.6)' })
  }
```

- [ ] **Step 2: Verify + commit**

`npm run dev` — "err →" hops through the user's mistakes only; on a mistake ply the played move shows as a faint red arrow next to the green best-move arrow (which points from the *previous* position — verify both render).

```bash
git add src/App.tsx
git commit -m "feat: mistake navigation and played-move arrow in review"
```

---

### Task 14: Trainer hook

**Files:**
- Create: `src/hooks/useTrainer.ts`
- Create: `src/utils/trainer.ts` (pure logic: puzzle building + grading)
- Test: `src/utils/trainer.test.ts`

- [ ] **Step 1: Write the failing test for the pure logic**

```typescript
// src/utils/trainer.test.ts
import { describe, it, expect } from 'vitest'
import { buildPuzzles, gradeAttempt } from './trainer'
import type { AnalyzedMove } from '../types'

function mv(over: Partial<AnalyzedMove>): AnalyzedMove {
  return {
    san: 'e4', color: 'w', fenAfter: '', toSquare: 'e4', quality: 'good',
    cpDrop: 0, winBefore: 50, winAfter: 50, winDrop: 0, explanation: '',
    bestMoveSan: null, bestLineSan: [], mateIn: null, isSacrifice: false,
    phase: 'middlegame', alternatives: [], motifs: [], missedMotifs: [],
    clockSeconds: null, timeSpent: null,
    ...over,
  }
}

const FENS = ['fen0', 'fen1', 'fen2', 'fen3']

describe('buildPuzzles', () => {
  it('collects the chosen color mistakes with their pre-move FEN', () => {
    const moves = [
      mv({ quality: 'best' }),
      mv({ color: 'b', quality: 'blunder', bestMoveSan: 'Nf6', missedMotifs: ['fork'] }),
      mv({ quality: 'mistake', bestMoveSan: 'Qd5' }),
    ]
    const puzzles = buildPuzzles(moves, FENS, 'w')
    expect(puzzles).toHaveLength(1)
    expect(puzzles[0]).toMatchObject({ ply: 3, fen: 'fen2', bestSan: 'Qd5' })
  })
  it('skips mistakes without a known best move', () => {
    const moves = [mv({ quality: 'blunder', bestMoveSan: null })]
    expect(buildPuzzles(moves, FENS, 'w')).toHaveLength(0)
  })
})

describe('gradeAttempt', () => {
  const puzzle = {
    ply: 0, fen: 'fen0', color: 'w' as const, playedSan: 'h3', bestSan: 'Nc7+',
    missedMotifs: ['fork' as const],
    alternatives: [
      { san: 'Nc7+', lineSan: ['Nc7+'], score: { cp: 600 }, winPercent: 90 },
      { san: 'Kd2', lineSan: ['Kd2'], score: { cp: 80 }, winPercent: 87 },
      { san: 'Kf2', lineSan: ['Kf2'], score: { cp: 50 }, winPercent: 60 },
    ],
  }
  it('best move is correct', () => {
    expect(gradeAttempt(puzzle, 'Nc7+')).toBe('correct')
  })
  it('alternative within 5 win% is almost', () => {
    expect(gradeAttempt(puzzle, 'Kd2')).toBe('almost')
  })
  it('weaker alternative is wrong', () => {
    expect(gradeAttempt(puzzle, 'Kf2')).toBe('wrong')
  })
  it('random move is wrong', () => {
    expect(gradeAttempt(puzzle, 'a3')).toBe('wrong')
  })
  it('check/mate suffixes do not matter', () => {
    expect(gradeAttempt(puzzle, 'Nc7')).toBe('correct')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/trainer.test.ts`
Expected: FAIL — `Cannot find module './trainer'`

- [ ] **Step 3: Write the pure logic**

```typescript
// src/utils/trainer.ts
import type { AnalyzedMove, AltMove, TacticalMotif } from '../types'

const PUZZLE_QUALITIES = new Set(['miss', 'mistake', 'blunder'])
// An alternative this close to the best line (win%) earns an "almost".
const ALMOST_WIN_GAP = 5

export interface Puzzle {
  ply: number // 1-based ply of the mistake (board shows fens[ply - 1])
  fen: string // position before the mistake — the one to solve
  color: 'w' | 'b'
  playedSan: string
  bestSan: string
  missedMotifs: TacticalMotif[]
  alternatives: AltMove[]
}

export type Grade = 'correct' | 'almost' | 'wrong'

function normalize(san: string): string {
  return san.replace(/[+#!?]/g, '')
}

// fens[i] is the position BEFORE moves[i] (the useChessGame convention).
export function buildPuzzles(moves: AnalyzedMove[], fens: string[], color: 'w' | 'b'): Puzzle[] {
  return moves.flatMap((m, i) => {
    if (m.color !== color || !PUZZLE_QUALITIES.has(m.quality) || !m.bestMoveSan) return []
    return [{
      ply: i + 1,
      fen: fens[i],
      color: m.color,
      playedSan: m.san,
      bestSan: m.bestMoveSan,
      missedMotifs: m.missedMotifs,
      alternatives: m.alternatives,
    }]
  })
}

export function gradeAttempt(puzzle: Puzzle, attemptSan: string): Grade {
  const attempt = normalize(attemptSan)
  if (attempt === normalize(puzzle.bestSan)) return 'correct'
  const best = puzzle.alternatives[0]
  const alt = puzzle.alternatives.find((a) => normalize(a.san) === attempt)
  if (alt && best && best.winPercent - alt.winPercent <= ALMOST_WIN_GAP) return 'almost'
  return 'wrong'
}
```

Run: `npx vitest run src/utils/trainer.test.ts` — PASS (7 tests).

- [ ] **Step 4: Write the hook**

```typescript
// src/hooks/useTrainer.ts
import { useMemo, useState } from 'react'
import { Chess } from 'chess.js'
import type { AnalyzedMove } from '../types'
import { buildPuzzles, gradeAttempt, type Puzzle, type Grade } from '../utils/trainer'

export interface PuzzleResult {
  puzzle: Puzzle
  solved: boolean // correct or almost without reveal
  hintsUsed: number
}

// Drives training mode: a queue of the player's mistakes re-posed as puzzles.
export function useTrainer(moves: AnalyzedMove[] | null, fens: string[], color: 'w' | 'b') {
  const puzzles = useMemo(
    () => (moves ? buildPuzzles(moves, fens, color) : []),
    [moves, fens, color],
  )
  const [index, setIndex] = useState(0)
  const [hintLevel, setHintLevel] = useState(0) // 0 none, 1 motif, 2 piece, 3 reveal
  const [lastGrade, setLastGrade] = useState<Grade | null>(null)
  const [results, setResults] = useState<PuzzleResult[]>([])

  const current: Puzzle | null = puzzles[index] ?? null
  const done = puzzles.length > 0 && index >= puzzles.length

  // Translate a board move (from/to) into SAN at the puzzle position, grade it,
  // and record the result on success. Returns the grade ('wrong' for illegal).
  function attempt(from: string, to: string): Grade {
    if (!current) return 'wrong'
    let san: string
    try {
      const chess = new Chess(current.fen)
      san = chess.move({ from, to, promotion: 'q' }).san
    } catch {
      return 'wrong'
    }
    const grade = gradeAttempt(current, san)
    setLastGrade(grade)
    if (grade !== 'wrong') {
      setResults((r) => [...r, { puzzle: current, solved: hintLevel < 3, hintsUsed: hintLevel }])
    }
    return grade
  }

  function reveal() {
    if (!current) return
    setHintLevel(3)
    setLastGrade(null)
    setResults((r) => [...r, { puzzle: current, solved: false, hintsUsed: 3 }])
  }

  function next() {
    setIndex((i) => i + 1)
    setHintLevel(0)
    setLastGrade(null)
  }

  function restart() {
    setIndex(0)
    setHintLevel(0)
    setLastGrade(null)
    setResults([])
  }

  return {
    puzzles, current, index, done, results, lastGrade, hintLevel,
    attempt, reveal, next, restart,
    hint: () => setHintLevel((h) => Math.min(h + 1, 3)),
  }
}
```

- [ ] **Step 5: Verify + commit**

Run: `npx vitest run && npx tsc -b`

```bash
git add src/utils/trainer.ts src/utils/trainer.test.ts src/hooks/useTrainer.ts
git commit -m "feat: trainer logic — puzzle queue, grading, hint ladder"
```

---

### Task 15: TrainerCard UI + Review ⇄ Train toggle

**Files:**
- Create: `src/components/TrainerCard.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Build TrainerCard**

```tsx
// src/components/TrainerCard.tsx
import type { useTrainer } from '../hooks/useTrainer'
import { MOTIF_LABEL } from '../utils/analysis'

const HINT_BTN = 'btn btn-ghost px-3 py-1.5 text-sm'

export function TrainerCard({ trainer }: { trainer: ReturnType<typeof useTrainer> }) {
  const { current, index, puzzles, done, results, lastGrade, hintLevel } = trainer

  if (puzzles.length === 0) {
    return <div className="card p-4 text-sm text-muted">No mistakes to train on — clean game!</div>
  }

  if (done) {
    const solved = results.filter((r) => r.solved).length
    const weakMotifs = [...new Set(results.filter((r) => !r.solved).flatMap((r) => r.puzzle.missedMotifs))]
    return (
      <div className="card p-4 text-sm">
        <p className="font-semibold text-ink">Training done: {solved}/{results.length} found</p>
        {weakMotifs.length > 0 && (
          <p className="mt-1 text-muted">Worth drilling: {weakMotifs.map((m) => MOTIF_LABEL[m]).join(', ')}.</p>
        )}
        <button onClick={trainer.restart} className="btn btn-primary mt-3 px-3 py-1.5 text-sm">Again</button>
      </div>
    )
  }

  if (!current) return null
  const solvedThis = lastGrade === 'correct' || lastGrade === 'almost' || hintLevel >= 3

  return (
    <div className="card border-l-4 p-4 text-sm" style={{ borderLeftColor: '#ffd54f' }}>
      <div className="flex items-center justify-between">
        <p className="font-semibold text-ink">🎯 Your move — find the best one!</p>
        <span className="nums text-xs text-muted">{index + 1}/{puzzles.length}</span>
      </div>

      {hintLevel >= 1 && current.missedMotifs.length > 0 && (
        <p className="mt-2 rounded bg-surface-2 px-2 py-1 text-xs text-accent">
          💡 Look for {MOTIF_LABEL[current.missedMotifs[0]]}.
        </p>
      )}
      {hintLevel >= 2 && (
        <p className="mt-1 rounded bg-surface-2 px-2 py-1 text-xs text-accent">
          💡 The {current.bestSan[0] >= 'A' && current.bestSan[0] <= 'Z' ? { K: 'king', Q: 'queen', R: 'rook', B: 'bishop', N: 'knight', O: 'king' }[current.bestSan[0]] ?? 'piece' : 'pawn'} moves.
        </p>
      )}
      {hintLevel >= 3 && (
        <p className="mt-1 rounded bg-surface-2 px-2 py-1 text-xs text-ink">
          The move was <span className="font-mono font-semibold">{current.bestSan}</span> (you played {current.playedSan}).
        </p>
      )}

      {lastGrade === 'correct' && <p className="mt-2 text-green-400">✓ Exactly — {current.bestSan}!</p>}
      {lastGrade === 'almost' && (
        <p className="mt-2 text-yellow-300">Almost — also good, but {current.bestSan} is stronger.</p>
      )}
      {lastGrade === 'wrong' && <p className="mt-2 text-red-300">✗ Not that one — try again.</p>}

      <div className="mt-3 flex gap-2">
        {!solvedThis && hintLevel < 2 && (
          <button onClick={trainer.hint} className={HINT_BTN}>Hint 💡</button>
        )}
        {!solvedThis && <button onClick={trainer.reveal} className={HINT_BTN}>Show me</button>}
        {solvedThis && (
          <button onClick={trainer.next} className="btn btn-primary px-3 py-1.5 text-sm">
            {index + 1 === puzzles.length ? 'Finish' : 'Next puzzle →'}
          </button>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Wire training mode into App**

```tsx
  const [mode, setMode] = useState<'review' | 'train'>('review')
  const trainer = useTrainer(engine.analyzed, game.fens, userColor ?? 'w')
```

Toggle in the header row of the analysis view (next to Export):

```tsx
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
```

In train mode the board shows the puzzle position, accepts moves, and the right column shows the TrainerCard instead of insight/alternatives/movelist:

```tsx
  const boardFen = mode === 'train' && trainer.current ? trainer.current.fen : game.currentFen
  const boardOnMove =
    mode === 'train' && trainer.current
      ? (from: string, to: string) => trainer.attempt(from, to) !== 'wrong'
      : undefined
```

Pass `fen={boardFen}` and `onMove={boardOnMove}` to `<ChessBoard>`; hide best-move/preview arrows and the quality badge while training (`arrows={mode === 'train' ? [] : arrows}`, `badge={mode === 'train' ? null : …}`). Render the right column conditionally:

```tsx
  {mode === 'train' ? (
    <TrainerCard trainer={trainer} />
  ) : (
    <> {/* existing MoveInsight + AlternativesPanel + MoveList */} </>
  )}
```

Reset to review when switching games: in `handleSearch` and the back-button handler, add `setMode('review')`.

- [ ] **Step 3: Verify + commit**

`npm run dev` — analyze a game with mistakes → Train: board jumps to the first mistake position oriented to the player, dragging the best move shows ✓ and Next, wrong move snaps back with "try again", hints escalate, summary lists weak motifs.

```bash
git add src/components/TrainerCard.tsx src/App.tsx
git commit -m "feat: interactive training mode with hint ladder and summary"
```

---

### Task 16: Multi-game trends

**Files:**
- Create: `src/utils/trends.ts`
- Test: `src/utils/trends.test.ts`
- Create: `src/utils/trendsCache.ts`
- Create: `src/hooks/useTrends.ts`
- Create: `src/components/TrendsPanel.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Write the failing test for aggregation**

```typescript
// src/utils/trends.test.ts
import { describe, it, expect } from 'vitest'
import { aggregateTrends, type AnalyzedGame } from './trends'
import type { AnalyzedMove, Game } from '../types'

function mv(over: Partial<AnalyzedMove>): AnalyzedMove {
  return {
    san: 'e4', color: 'w', fenAfter: '', toSquare: 'e4', quality: 'good',
    cpDrop: 0, winBefore: 50, winAfter: 50, winDrop: 0, explanation: '',
    bestMoveSan: null, bestLineSan: [], mateIn: null, isSacrifice: false,
    phase: 'middlegame', alternatives: [], motifs: [], missedMotifs: [],
    clockSeconds: null, timeSpent: null,
    ...over,
  }
}

function fakeGame(over: Partial<Game>): Game {
  return {
    url: 'u', pgn: '', time_control: '600', end_time: 1, rated: true,
    white: { username: 'me', rating: 1500, result: 'win' },
    black: { username: 'them', rating: 1500, result: 'resigned' },
    ...over,
  }
}

describe('aggregateTrends', () => {
  const games: AnalyzedGame[] = [
    {
      game: fakeGame({ url: 'g1' }),
      userColor: 'w',
      opening: { eco: 'B20', name: 'Sicilian' },
      moves: [
        mv({ quality: 'blunder', winDrop: 30, phase: 'middlegame', missedMotifs: ['fork'] }),
        mv({ color: 'b' }),
        mv({ quality: 'good' }),
      ],
    },
    {
      game: fakeGame({ url: 'g2', white: { username: 'them', rating: 1500, result: 'win' }, black: { username: 'me', rating: 1500, result: 'checkmated' } }),
      userColor: 'b',
      opening: { eco: 'B20', name: 'Sicilian' },
      moves: [
        mv({ color: 'w' }),
        mv({ color: 'b', quality: 'mistake', winDrop: 12, phase: 'endgame', missedMotifs: ['fork'] }),
      ],
    },
  ]

  it('produces one accuracy point per game with result', () => {
    const t = aggregateTrends(games)
    expect(t.accuracySeries).toHaveLength(2)
    expect(t.accuracySeries[0].won).toBe(true)
    expect(t.accuracySeries[1].won).toBe(false)
  })

  it('groups by opening with win rate', () => {
    const t = aggregateTrends(games)
    expect(t.openings).toHaveLength(1)
    expect(t.openings[0]).toMatchObject({ eco: 'B20', games: 2, wins: 1 })
  })

  it('counts user errors per phase and missed motifs', () => {
    const t = aggregateTrends(games)
    expect(t.errorsByPhase.middlegame).toBe(1)
    expect(t.errorsByPhase.endgame).toBe(1)
    expect(t.missedMotifs[0]).toEqual({ motif: 'fork', count: 2 })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/trends.test.ts`
Expected: FAIL — `Cannot find module './trends'`

- [ ] **Step 3: Write the aggregation**

```typescript
// src/utils/trends.ts
import type { AnalyzedMove, Game, GamePhase, TacticalMotif } from '../types'
import { sideAccuracies } from './accuracy'

const ERROR_QUALITIES = new Set(['inaccuracy', 'mistake', 'blunder', 'miss'])

export interface AnalyzedGame {
  game: Game
  userColor: 'w' | 'b'
  opening: { eco: string; name: string } | null
  moves: AnalyzedMove[]
}

export interface TrendsReport {
  accuracySeries: Array<{ url: string; accuracy: number; won: boolean }>
  openings: Array<{ eco: string; name: string; games: number; wins: number; avgAccuracy: number }>
  errorsByPhase: Record<GamePhase, number>
  missedMotifs: Array<{ motif: TacticalMotif; count: number }>
  timePressure: { pressureErrors: number; totalErrors: number } | null
}

export function aggregateTrends(games: AnalyzedGame[]): TrendsReport {
  const accuracySeries = games.map(({ game, userColor, moves }) => {
    const acc = sideAccuracies(moves)
    return {
      url: game.url,
      accuracy: userColor === 'w' ? acc.white : acc.black,
      won: (userColor === 'w' ? game.white.result : game.black.result) === 'win',
    }
  })

  const byEco = new Map<string, { eco: string; name: string; games: number; wins: number; accSum: number }>()
  games.forEach(({ opening }, i) => {
    if (!opening) return
    const entry = byEco.get(opening.eco) ?? { ...opening, games: 0, wins: 0, accSum: 0 }
    entry.games++
    if (accuracySeries[i].won) entry.wins++
    entry.accSum += accuracySeries[i].accuracy
    byEco.set(opening.eco, entry)
  })
  const openings = [...byEco.values()]
    .map(({ accSum, ...rest }) => ({ ...rest, avgAccuracy: accSum / rest.games }))
    .sort((a, b) => b.games - a.games)

  const errorsByPhase: Record<GamePhase, number> = { opening: 0, middlegame: 0, endgame: 0 }
  const motifCounts = new Map<TacticalMotif, number>()
  let pressureErrors = 0
  let totalErrors = 0
  let anyClock = false
  for (const { userColor, moves } of games) {
    for (const m of moves) {
      if (m.color !== userColor) continue
      if (m.clockSeconds !== null) anyClock = true
      if (!ERROR_QUALITIES.has(m.quality)) continue
      errorsByPhase[m.phase]++
      totalErrors++
      if (m.clockSeconds !== null && m.clockSeconds < 30) pressureErrors++
      for (const motif of m.missedMotifs) {
        motifCounts.set(motif, (motifCounts.get(motif) ?? 0) + 1)
      }
    }
  }
  const missedMotifs = [...motifCounts.entries()]
    .map(([motif, count]) => ({ motif, count }))
    .sort((a, b) => b.count - a.count)

  return {
    accuracySeries,
    openings,
    errorsByPhase,
    missedMotifs,
    timePressure: anyClock ? { pressureErrors, totalErrors } : null,
  }
}
```

Run: `npx vitest run src/utils/trends.test.ts` — PASS.

- [ ] **Step 4: Cache + batch hook**

```typescript
// src/utils/trendsCache.ts
import type { AnalyzedMove } from '../types'

const PREFIX = 'chess-analyzer:review:'

// localStorage round-trip for analyzed games; quota/JSON failures degrade to
// "no cache" silently — the analysis just re-runs.
export function cacheKey(gameUrl: string, depth: number): string {
  return `${PREFIX}${gameUrl}:d${depth}`
}

export function readCachedMoves(gameUrl: string, depth: number): AnalyzedMove[] | null {
  try {
    const raw = localStorage.getItem(cacheKey(gameUrl, depth))
    return raw ? (JSON.parse(raw) as AnalyzedMove[]) : null
  } catch {
    return null
  }
}

export function writeCachedMoves(gameUrl: string, depth: number, moves: AnalyzedMove[]): void {
  try {
    localStorage.setItem(cacheKey(gameUrl, depth), JSON.stringify(moves))
  } catch {
    /* quota exceeded or storage disabled — memory-only this session */
  }
}
```

```typescript
// src/hooks/useTrends.ts
import { useRef, useState } from 'react'
import { Chess } from 'chess.js'
import type { Game } from '../types'
import type { StockfishEngine } from '../engine/stockfish'
import { analyzeGamePositions } from '../utils/gameAnalysis'
import { aggregateTrends, type AnalyzedGame, type TrendsReport } from '../utils/trends'
import { readCachedMoves, writeCachedMoves } from '../utils/trendsCache'
import { identifyOpening, openingPlyCount } from '../utils/opening'
import { extractClocks, parseTimeControl, computeTimeSpent } from '../utils/clock'

const TREND_DEPTH = 12 // shallower than single-game review to keep N games tractable

export interface TrendsProgress {
  game: number
  totalGames: number
  move: number
  totalMoves: number
}

export function useTrends(engineRef: React.RefObject<StockfishEngine | null>) {
  const [report, setReport] = useState<TrendsReport | null>(null)
  const [progress, setProgress] = useState<TrendsProgress | null>(null)
  const [error, setError] = useState<string | null>(null)
  const cancelRef = useRef(false)

  async function run(games: Game[], username: string) {
    const engine = engineRef.current
    if (!engine) return
    cancelRef.current = false
    setError(null)
    setReport(null)
    const analyzed: AnalyzedGame[] = []
    try {
      for (let g = 0; g < games.length; g++) {
        if (cancelRef.current) return
        const game = games[g]
        const userColor: 'w' | 'b' =
          game.white.username.toLowerCase() === username.toLowerCase() ? 'w' : 'b'
        const opening = identifyOpening(game.pgn)

        const cached = readCachedMoves(game.url, TREND_DEPTH)
        if (cached) {
          analyzed.push({ game, userColor, opening, moves: cached })
          setProgress({ game: g + 1, totalGames: games.length, move: 0, totalMoves: 0 })
          continue
        }

        const chess = new Chess()
        try {
          chess.loadPgn(game.pgn)
        } catch {
          continue // unparseable PGN (variants etc.) — skip the game
        }
        const verbose = chess.history({ verbose: true })
        const moves = verbose.map((m) => ({ san: m.san, color: m.color, fenAfter: m.after, to: m.to }))
        const fens = [new Chess().fen(), ...moves.map((m) => m.fenAfter)]
        const clocks = extractClocks(game.pgn)
        const { base, inc } = parseTimeControl(game.time_control)

        const out = await analyzeGamePositions(
          (fen) => engine.analyse(fen, { depth: TREND_DEPTH, multipv: 3 }),
          fens,
          moves,
          {
            bookPlies: openingPlyCount(game.pgn),
            clocks,
            timeSpent: computeTimeSpent(clocks, base, inc),
            isStale: () => cancelRef.current,
            onProgress: (done, total) =>
              setProgress({ game: g + 1, totalGames: games.length, move: done, totalMoves: total }),
          },
        )
        if (!out) return // cancelled
        writeCachedMoves(game.url, TREND_DEPTH, out.analyzed)
        analyzed.push({ game, userColor, opening, moves: out.analyzed })
      }
      setReport(aggregateTrends(analyzed))
    } catch {
      setError('Trend analysis failed')
    } finally {
      setProgress(null)
    }
  }

  function cancel() {
    cancelRef.current = true
    setProgress(null)
  }

  return { report, progress, error, run, cancel, clear: () => setReport(null) }
}
```

`useStockfish` must expose its engine ref for this: add `engineRef` to its return value (`return { ready, error, progress, analyzed, scores, analyze, engineRef }`).

- [ ] **Step 5: TrendsPanel UI**

```tsx
// src/components/TrendsPanel.tsx
import type { TrendsReport } from '../utils/trends'
import { MOTIF_LABEL } from '../utils/analysis'

export function TrendsPanel({ report }: { report: TrendsReport }) {
  const maxAcc = 100
  const phases = Object.entries(report.errorsByPhase).filter(([, n]) => n > 0)
  const worstPhase = phases.sort((a, b) => b[1] - a[1])[0]
  return (
    <div className="space-y-4">
      <div className="card p-3 text-sm">
        <p className="mb-2 text-xs uppercase tracking-wider text-muted">Accuracy, last {report.accuracySeries.length} games</p>
        <div className="flex h-24 items-end gap-1">
          {report.accuracySeries.map((p, i) => (
            <span
              key={i}
              className="min-w-[6px] flex-1 rounded-t"
              style={{
                height: `${(p.accuracy / maxAcc) * 100}%`,
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
                <th className="pb-1">Opening</th><th>Games</th><th>Wins</th><th>Avg acc</th>
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
```

- [ ] **Step 6: Wire into App**

```tsx
  const trends = useTrends(engine.engineRef)
  const [trendCount, setTrendCount] = useState(10)
```

Above `<GamesList … />` (only when `!selected`):

```tsx
  <div className="mb-3 flex items-center gap-2 text-sm">
    <select
      value={trendCount}
      onChange={(e) => setTrendCount(Number(e.target.value))}
      className="rounded-lg border border-line bg-surface px-2 py-1.5"
    >
      {[5, 10, 20].map((n) => <option key={n} value={n}>last {n}</option>)}
    </select>
    <button
      onClick={() => profile && trends.run(games.slice(-trendCount), profile.username)}
      disabled={!engine.ready || trends.progress !== null}
      className="btn btn-primary px-3 py-1.5 text-sm"
    >
      Analyze trends
    </button>
    {trends.progress && (
      <span className="text-muted">
        Game {trends.progress.game}/{trends.progress.totalGames}, move {trends.progress.move}/{trends.progress.totalMoves}
        <button onClick={trends.cancel} className="btn btn-ghost ml-2 px-2 py-1 text-xs">Cancel</button>
      </span>
    )}
  </div>
  {trends.error && <p className="mb-3 text-sm text-accent-press">{trends.error}</p>}
  {trends.report && <div className="mb-4"><TrendsPanel report={trends.report} /></div>}
```

Note: trend analysis and single-game review share one engine; starting a trend run while a game analysis is in flight will interleave queues. Guard the button with `disabled={!engine.ready || trends.progress !== null}` as above, and clear trends state on new search (`trends.clear()` in `handleSearch`).

- [ ] **Step 7: Verify + commit**

Run: `npx vitest run && npx tsc -b`, then `npm run dev` — "Analyze trends" over last 5: progress ticks per game/move, panel renders accuracy bars, openings table, phase + motif breakdowns; rerunning is instant (cache hit); Cancel stops mid-run.

```bash
git add src/utils/trends.ts src/utils/trends.test.ts src/utils/trendsCache.ts src/hooks/useTrends.ts src/components/TrendsPanel.tsx src/hooks/useStockfish.ts src/App.tsx
git commit -m "feat: multi-game trend analysis with cache and progress"
```

---

### Task 17: Final verification sweep

**Files:** none new.

- [ ] **Step 1: Full test + build**

Run: `npx vitest run && npm run build && npm run lint`
Expected: all green. Fix anything that isn't.

- [ ] **Step 2: Manual end-to-end pass**

`npm run dev`, then walk the whole flow: search → trends over 5 games → open a game → watch progress → review (graph clicks, arrows, alternatives hover, motif badges, mistake nav, phase/time panels) → train (solve, hint, reveal, summary) → back → export JSON still works.

- [ ] **Step 3: Commit any fixes**

```bash
git add -A && git commit -m "fix: post-integration polish from end-to-end pass"
```

---

## Self-review notes

- **Spec coverage:** eval graph (T8), arrows (T9, T13), phase breakdown (T1, T12), motifs (T3, T4, T5, T11), mistake tour + training (T13–T15), alternatives (T5, T10), time analysis (T2, T11, T12), trends (T16), dark theme (T7), depth/MultiPV bump (T6). All eight spec features have tasks.
- **Known soft spots called out in-task:** react-chessboard v5 option names (T9 step 0 check), hand-built motif FENs (T3/T4 verify-with-ascii note), shared-engine contention between review and trends (T16 guard).
- **Type thread:** `AnalyzedMove` fields are defined once in T5 and the same `mv()` fixture shape is repeated in every later test file — if T5 changes a field name, update the fixtures.
