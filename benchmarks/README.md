# Chess.com Label Benchmark

This folder is for measuring how closely the local analyzer matches Chess.com
Game Review move labels.

## Workflow

1. Run the app and analyze a completed game.
2. Click `Export JSON` after analysis finishes.
3. Open the same completed game in Chess.com Game Review.
4. Fill each exported move's `expected` field with the Chess.com label.
5. Save the labeled file under `benchmarks/fixtures/`.
6. Run:

```bash
npm run benchmark -- benchmarks/fixtures/your-game.json --target=0.8
```

Accepted labels:

```text
brilliant
great
best
excellent
good
book
inaccuracy
mistake
miss
blunder
```

Leave `expected` as `null` for moves you have not labeled yet. The benchmark
ignores unlabeled moves.

## Target

The current goal is at least `80%` exact agreement against Chess.com labels.
Use at least 20-50 fully labeled games before trusting the score. A single game
can be noisy because engine depth, rating, opening book choices, and Chess.com
review strength all affect labels.

Only benchmark completed games. Do not use this tool for live games.
