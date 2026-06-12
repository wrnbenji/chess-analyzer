# Share GIF — Design

**Date:** 2026-06-11
**Goal:** Share a selected move sequence from a reviewed game as a polished, "cinematic" animated GIF — generated entirely in the browser.

## Scope

One shareable artifact: an animated **move-sequence GIF**. The user selects a from–to range of moves in the analyzed game; the app renders each position as a styled frame and encodes them into a GIF for download or clipboard copy.

Out of scope (possible later, same foundation): static summary card, puzzle card, whole-game replay, Web Share API, server-side rendering (the project is client-only by principle).

## Frame design ("cinematic")

Dark gradient background (`#0d1117 → #1a2535`). Board on the left with a soft accent glow; right column with:
- Large quality caption (e.g. **BRILLIANT!!**) in the quality's color
- One-line story text derived from the move's existing `explanation` (truncated ~60 chars)
- Win% transition (`36% → 81%`) in accent blue
- Small `♟ chess-analyzer` watermark bottom-right

Board frame details: dark-theme slate squares (`--board-light`/`--board-dark` values), pieces from the react-chessboard SVG paths, quality badge on the move's destination square, move arrow for the played move.

Timing: per move two frames — position before (600 ms), position after with badge/caption (900 ms); final frame held 1800 ms. A 5-move range ≈ 10 frames.

Output: ~960×540 raster (2× scale for sharpness), GIF via `gifenc`.

## Architecture

| Module | Responsibility |
|---|---|
| `src/utils/pieceSvgs.ts` (new) | Piece SVG path data extracted from react-chessboard, framework-free |
| `src/utils/boardSvg.ts` (new) | Pure: FEN + options (orientation, badge, arrow, size) → SVG string of the board |
| `src/utils/shareFrames.ts` (new) | Pure: `AnalyzedMove[]` + fens + from/to ply → frame descriptors (full-frame SVG string + duration each), cinematic layout |
| `src/utils/gifEncoder.ts` (new) | Async: SVG strings → `<img>` → canvas raster → `gifenc` → GIF `Blob`; progress callback; cancellable (generation pattern) |
| `src/hooks/useGifExport.ts` (new) | React state: start/progress/blob/error; download + clipboard actions |
| `src/components/ShareDialog.tsx` (new) | Modal: range picker, live preview (first frame SVG inline), generate with progress, Download + Copy buttons |
| `src/App.tsx` (modify) | "Share GIF" button in the review header (next to Export JSON), dialog mount |

Data flow:
```
App (Share gomb) → ShareDialog(analyzed, fens, game, ply)
  → shareFrames() → boardSvg() per frame
  → useGifExport: SVG → canvas → gifenc → Blob
  → download (a.download) / clipboard (ClipboardItem)
```

New runtime dependency: `gifenc` (~3 kB). No React imports inside the render utils.

## UI details

- **Share GIF button:** review header, enabled only when analysis is complete.
- **Range picker:** two number steppers (from/to ply); selected moves listed in SAN with quality icons. Max 20 moves — beyond that the generate button is disabled with an explanatory note.
- **Default range:** the currently viewed move; if it is part of a combination (consecutive `best`/`great`/`brilliant` moves by the same player), the whole combination is preselected.
- **Live preview:** first frame's SVG rendered inline in the dialog — WYSIWYG.
- **Generate:** progress bar across rasterization + encoding; Cancel aborts via generation counter.
- **Done state:** Download (`<white>-vs-<black>-move<N>.gif`) and Copy-to-clipboard buttons.
- Dialog closes on Escape / backdrop click.

## Error handling

- Clipboard: if `ClipboardItem` GIF support is missing (Safari/Firefox vary), copy the first frame as PNG instead and show a note ("GIF available via download").
- Rasterization failure: error strip in the dialog; app unaffected.
- Moves without analysis data (book moves) render without badge; caption falls back to the SAN.

## Testing

- `boardSvg`: assert piece paths appear with expected transforms for a given FEN; badge on the correct square; mirrored coordinates for black orientation.
- `shareFrames`: frame counts, durations, caption content (BRILLIANT!! for brilliant, win% format).
- `gifEncoder`: output starts with `GIF89a` magic bytes for a minimal frame (canvas mocked in jsdom); manual verification via headless Chrome.
- Manual E2E: 5-move range on a long game → download → play back the GIF.
