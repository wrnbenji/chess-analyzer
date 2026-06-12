# Chess Analyzer — MVP vertikális szelet (design)

**Dátum:** 2026-06-07
**Scope:** Working end-to-end MVP. Username → meccslista → egy meccs megnyitása → tábla + színkódolt lépéslista + Stockfish move-by-move elemzés. Minden a böngészőben, szerver nélkül. Nyelv: TypeScript (React + Vite + Tailwind).

**Kulcsdöntések:** ChessBoard = `react-chessboard` library. Stockfish = **egyszálú** WASM build (nincs `SharedArrayBuffer`, így nem kell COOP/COEP header) — `stockfish.js` a `public/stockfish/`-ba másolva (npm `stockfish` csomagból vagy CDN-ről). Elemzési default mélység: **depth 15** (a 18 böngészőben lassú; konstansként könnyen állítható).

## Cél

Egy publikus Chess.com username megadásával le lehet kérni egy meccset, és Stockfish WASM-mal pozíciónként kiértékelni, lépésminőséget osztályozni, accuracy-t és összesítő statisztikát mutatni — első működő vertikális szelet, amelyre a többi fázis ráépül.

## Architektúra

Réteges felépítés, tiszta határokkal. Minden unit önállóan érthető és tesztelhető.

```
src/
  api/chesscom.ts      → tiszta fetch wrapper, csak adat (Profile, Game[] típusok)
  engine/stockfish.ts  → StockfishEngine osztály, soros parancs-queue, UCI parse
  utils/eval.ts        → classifyMove (lépő-szemszög + mate-kezelés)
  utils/accuracy.ts    → drops[] → accuracy %
  utils/opening.ts     → SAN-normalizált ECO lookup
  hooks/useChessGame.ts→ chess.js state (lépésnavigáció, FEN-lista)
  hooks/useStockfish.ts→ engine életciklus + batch elemzés progress-szel
  components/          → tiszta prezentáció, adat propból
  App.tsx              → összekötés, view state
public/stockfish/      → stockfish.js + stockfish.wasm
```

### Unit-felelősségek

- **api/chesscom.ts** — `getProfile(username)`, `getArchives(username)`, `getGames(archiveUrl)`. Csak fetch + típusolt visszatérés. Hibák explicit Error-ral (404 → "Player not found"). Függ: fetch, típusdefiníciók. Nincs UI-tudás.
- **engine/stockfish.ts** — `StockfishEngine` Web Worker köré (egyszálú stockfish.js). `evaluate(fen, depth=15): Promise<Score>` ahol `Score = { cp?: number; mate?: number }`. Soros parancs-queue: egyszerre egy `go` fut, a következő hívás vár. Hívásonként saját message-handler, `bestmove`-nál resolve + leiratkozás. Mate score parse-olva. Függ: Worker, stockfish.js.
- **utils/eval.ts** — `classifyMove(scoreBefore, scoreAfter, sideToMove)` → `MoveQuality`. A cp-t a lépő oldaláról normalizálja. Mate ±10000 cp-be konvertálva a drop-számításhoz. Kategóriák MVP-ben: `best | good | inaccuracy | mistake | blunder`. Szín- és szimbólum-térkép. Brilliant NEM része az MVP-nek.
- **utils/accuracy.ts** — `calcAccuracy(drops: number[]): number` logisztikus közelítés (a spec képlete), 0–100 közé vágva.
- **utils/opening.ts** — `identifyOpening(pgn)`: PGN-ből SAN-lista kinyerés (headerek, órajelek `{...}`, lépésszámok eltávolítása, normalizálás), majd leghosszabb prefix-match az ECO JSON ellen.
- **hooks/useChessGame.ts** — chess.js köré: PGN parse, lépéslista, navigáció (start/prev/next/end + ugrás indexre), aktuális FEN, az összes pozíció FEN-listája (elemzéshez).
- **hooks/useStockfish.ts** — engine példány életciklusa (mount/unmount), `analyzeAll(fens)` sorban kiértékel, progress-t (kész/összes) ad vissza, eredmény: pozíciónkénti Score-ok.
- **components** — `ProfileCard`, `GamesList`, `ChessBoard` (`react-chessboard` köré, FEN propból + flip), `MoveList`, `EvalBar`, `StatsPanel`. Mind prezentációs, adat propból.

## Adatfolyam

1. `App` view state: `search | games | analysis`.
2. Username → `getProfile` + `getArchives` → utolsó archív URL → `getGames` → `GamesList`.
3. Meccs kiválasztva → `useChessGame` PGN parse → FEN-lista.
4. `useStockfish.analyzeAll(fens)` sorban kiértékel, progress bar.
5. Pozíciónkénti Score-okból `eval.ts` lépésminőség; `MoveList` színkódol; `EvalBar` aktuális előny; `StatsPanel` összesít (accuracy, blunder/mistake/inaccuracy count, megnyitó).

## Hibakezelés

- Nem létező user (404) → "Player not found".
- Privát profil / üres archív → explicit üres-állapot üzenet.
- Rate-limit (429) → "Too many requests, try again".
- Stockfish betöltési hiba → fallback üzenet, az app nem dől be (meccslista/tábla továbbra is működik).
- Mate pozíciók → helyes ±10000 normalizálás, nem 0-ra esik.

## Tesztelés

Vitest unit tesztek a tiszta logikára — ezek a hibagócok:
- `eval.ts`: lépő-szemszög normalizálás (fehér és fekete lépés), mate-kezelés, kategóriahatárok.
- `accuracy.ts`: 0 drop → 100, nagy drop → ~0, üres → 100.
- `opening.ts`: SAN kinyerés órajeles/kommentes PGN-ből, leghosszabb match.
- Stockfish UCI-parse: `score cp`, `score mate`, `bestmove` sorok.

Komponensek: kézi/böngészős verifikáció az MVP-ben.

## Kihagyva (későbbi fázis)

Chrome extension, BestMoves/MultiPV, tábla-forgatás, responsive polish, Vercel deploy, brilliant-osztály, ECO teljes 500-as DB finomhangolás.

## Eltérések az eredeti CLAUDE.md spectől (szándékos javítások)

1. `classifyMove`: lépő-szemszögű normalizálás (nem fix "fehér szemszög"), különben fekete lépéseknél előjelhiba.
2. Engine: soros queue az `onmessage` felülírásos race helyett.
3. Mate score parse hozzáadva (`score mate N` → ±10000), különben mattnál hibás eval.
4. `identifyOpening`: SAN-normalizálás a nyers PGN-startsWith helyett.
5. Brilliant kategória elhalasztva v2-re (megbízható heurisztika hiányában).
6. ChessBoard: saját SVG helyett `react-chessboard` (kevesebb hibafelület MVP-re).
7. Stockfish: egyszálú build (COOP/COEP header elkerülése); default depth 18 → 15 (böngésző-perf).
