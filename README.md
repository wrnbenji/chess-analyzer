<div align="center">

# ♟ Chess Analyzer

**Analyze any Chess.com game for free — Stockfish running entirely in your browser.**

[![License: MIT](https://img.shields.io/badge/license-MIT-22c55e.svg)](LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/wrnbenji/chess-analyzer?style=social)](https://github.com/wrnbenji/chess-analyzer/stargazers)

[Quick start](#-quick-start) • [Features](#-features) • [How it works](#-how-it-works) • [Roadmap](#-roadmap)

</div>

---

> **No account. No server. No subscription.** Type a Chess.com username, pick a game, and get a full Stockfish-annotated review — in the browser, in seconds.

Tired of paying for Chess.com Diamond just to see move analysis? Chess Analyzer pulls any public player's games from the Chess.com API, evaluates every position with Stockfish at depth 18, and gives you the same quality breakdown — brilliants, blunders, accuracy %, eval graph, tactical motifs — entirely client-side.

---

## ✨ Features

- 🔍 Search any public Chess.com username — profile, ratings, and latest games load instantly.
- ⚡ Move-by-move Stockfish analysis at depth 18, running in a Web Worker so the UI never blocks.
- 🏅 Move quality badges — Brilliant !!, Good ✓, Inaccuracy ?!, Mistake ?, Blunder ?? — with color-coded move list.
- 📈 Eval bar + eval graph — click any point to jump to that position.
- 🎯 Top-3 engine alternatives per position, with preview arrows on the board.
- 🧩 Tactical motif detection — fork, pin, skewer, discovered attack, back-rank, sacrifice, and more — automatically labeled on each move.
- 🗂 Phase breakdown — opening / middlegame / endgame accuracy split so you know where you actually lose points.
- ⏱ Time-pressure analysis — see where you spent too long or moved instantly under stress.
- 🎮 Training mode — replay your mistakes as puzzles; the board locks until you find the right move.
- 📊 Multi-game trends — analyze accuracy, mistake rate, and opening stats across your last 5 / 10 / 20 games at once.
- 🎬 Share GIF — export a cinematic 960×540 animated GIF of any move sequence with quality caption, win% swing, and watermark.
- 💾 Export JSON — full machine-readable review for post-processing or archiving.

<details>
<summary>♟ <strong>How move quality is classified</strong></summary>

<br>

Each position is evaluated before and after the played move. The centipawn (CP) drop determines the badge:

| Drop | Badge |
|------|-------|
| Negative (better than engine) | Brilliant !! |
| 0–9 | Good ✓ |
| 10–49 | Inaccuracy ?! |
| 50–149 | Mistake ? |
| 150+ | Blunder ?? |

Win-probability is computed via a logistic curve (`winChance(cp) = 50 + 50 · tanh(0.00184 · cp)`), matching Chess.com's accuracy model as closely as possible without access to their proprietary algorithm.

</details>

<details>
<summary>🧩 <strong>What tactical motifs are detected</strong></summary>

<br>

Motifs are detected with pure chess logic (no extra engine calls) on the played move and on the best move, so you see both what you played and what you missed:

- **Fork** — one piece attacks two enemy pieces simultaneously
- **Pin** — attacker freezes a piece defending something more valuable behind it
- **Skewer** — like a pin, but the valuable piece is in front
- **Discovered attack** — moving one piece reveals an attack from another
- **Double check** — two pieces give check at once
- **Hanging piece** — a move leaves an undefended, capturable piece
- **Back-rank mate threat** — rook/queen threatens back-rank checkmate
- **Trapped piece** — a piece has no safe square to escape to
- **Sacrifice** — intentionally losing material for positional or tactical gain
- **Promotion** — a pawn reaches the 8th rank

</details>

<details>
<summary>🎬 <strong>How Share GIF works</strong></summary>

<br>

Select a from–to ply range (the dialog auto-selects the current combination if consecutive brilliant/good moves are detected). Each move renders as two frames:

- **Before frame (600 ms):** board position + move arrow
- **After frame (900 ms / 1800 ms final):** quality badge on destination square + caption

Frames are rendered as SVG, rasterized to canvas, and encoded with `gifenc` (~3 kB). Output: 960×540 GIF, downloadable or copied directly to clipboard. Everything runs client-side; no file ever leaves your device.

</details>

---

## 🚀 Quick start

**1. Open the app**

[Run it locally](#-local-development) with `npm install && npm run dev`, then open http://localhost:5173.

**2. Search a player**

Type any public Chess.com username and press **Search**. The profile, ratings, and most recent games load from the Chess.com Public API.

**3. Select a game**

Click any game in the list. The board loads and Stockfish begins analyzing every position. A progress bar shows how many moves have been evaluated.

**4. Review**

Navigate moves with the arrow buttons, click the eval graph, or jump between mistakes with **← err / err →**. Toggle **Best move** to see the engine's preferred arrow on the board.

Switch to **🎯 Train** mode to replay your blunders as puzzles. Run **Analyze trends** to compare accuracy across your last N games.

---

## 🔍 How it works

1. **Chess.com Public API** (no auth, CORS-safe) — fetches player profile and game PGN archives.
2. **chess.js** — parses PGN, generates FEN for every position, validates moves.
3. **Stockfish.js WASM** — evaluates each FEN in a Web Worker at depth 18, MultiPV 3. The main thread never blocks.
4. **Analysis pipeline** — CP drop → quality badge, win% delta → motif detection, phase classification, clock extraction.
5. **React UI** — live updates as each position finishes; no waiting for the full game.

No data ever leaves your device. No API keys. No account.

---

## 🆚 Comparison

| | Chess Analyzer | Chess.com (free) | Lichess |
|---|:---:|:---:|:---:|
| Full game analysis | ✅ | ❌ (limited) | ✅ |
| No login required | ✅ | ❌ | ✅ |
| Runs in browser | ✅ | ❌ (server) | ❌ (server) |
| Tactical motif labels | ✅ | ❌ | ❌ |
| Phase breakdown | ✅ | ✅ (Diamond) | ❌ |
| Training mode | ✅ | ✅ (Diamond) | ✅ |
| Multi-game trends | ✅ | ✅ (Diamond) | ❌ |
| Share GIF export | ✅ | ❌ | ❌ |
| Open source | ✅ | ❌ | ✅ |

---

## 🛠 Local development

Requires Node 20+.

```bash
npm install
npm run dev     # Vite dev server at http://localhost:5173
```

```bash
npm test        # 133 tests (vitest)
npm run build   # production build → dist/
npm run lint    # ESLint + TypeScript check
```

**Stack:** React 19 + Vite + Tailwind CSS, chess.js v1.4, react-chessboard v5, Stockfish.js WASM, gifenc.

### Stockfish WASM

The `public/stockfish/` directory must contain:
- `stockfish.js` — JS wrapper
- `stockfish.wasm` — WASM binary (~10 MB)

Download from [stockfishchess.org/download](https://stockfishchess.org/download) or use the [stockfish npm package](https://www.npmjs.com/package/stockfish).

---

## 🚢 Deploy (any static host)

```bash
npm run build
# upload dist/ to your host
```

Configure your host to serve `index.html` for all routes, and set these response headers (needed for Stockfish `SharedArrayBuffer`):

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

---

## 🗺 Roadmap

- [x] Chess.com API integration — profile, archives, game list
- [x] chess.js PGN parsing + board navigation
- [x] Stockfish WASM analysis (depth 18, MultiPV 3)
- [x] Move quality badges + color-coded move list
- [x] Eval bar + eval graph (clickable)
- [x] Top-3 engine alternatives with board arrows
- [x] Tactical motif detection (10 motif types)
- [x] Game phase breakdown panel
- [x] Time-pressure analysis panel
- [x] Training mode (mistake replay as puzzles)
- [x] Multi-game trend analysis
- [x] Share GIF export (cinematic 960×540)
- [x] Export JSON review
- [ ] Opening explorer integration
- [ ] Lichess game support
- [ ] Chrome Extension (in-page analysis on chess.com)
- [ ] Board theme selector
- [ ] Mobile layout

---

## 🤝 Contributing

Issues and PRs are welcome. Please run `npm test` and `npm run build` before opening a PR.

---

## 📄 License

[MIT](LICENSE) © 2026 Benjamin Waron

---

<div align="center">

If Chess Analyzer saves you a Chess.com subscription, a ⭐ helps others find it.

</div>
