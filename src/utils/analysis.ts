import { Chess } from 'chess.js'
import type { AltMove, EngineResult, MoveQuality, Score } from '../types'
import { classifyExpectedPointLoss, scoreToCp, winChance } from './eval'
import { detectMotifs, type TacticalMotif } from './motifs'

export const MOTIF_LABEL: Record<TacticalMotif, string> = {
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

const PIECE_VALUE: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 }
const UCI_RE = /^[a-h][1-8][a-h][1-8][qrbn]?$/
// Material (in pawns) the mover must stay down for the line to count as a
// sacrifice — ~1.5 catches exchange sacs (give a rook for a minor) and up.
const SAC_THRESHOLD = 1.5
const CPL_CAP = 1000 // clamp per-move loss so forced-mate scores don't blow up averages

// Net material from the mover's perspective (their pieces minus the opponent's).
export function materialNet(fen: string, mover: 'w' | 'b'): number {
  const board = fen.split(' ')[0]
  let white = 0
  let black = 0
  for (const ch of board) {
    const value = PIECE_VALUE[ch.toLowerCase()]
    if (value === undefined) continue
    if (ch === ch.toUpperCase()) white += value
    else black += value
  }
  const net = white - black
  return (mover === 'w' ? net : -net) || 0 // avoid -0 from negating zero
}

function applyMove(chess: Chess, mv: string): boolean {
  try {
    if (UCI_RE.test(mv)) {
      chess.move({ from: mv.slice(0, 2), to: mv.slice(2, 4), promotion: mv[4] as 'q' | 'r' | 'b' | 'n' | undefined })
    } else {
      chess.move(mv)
    }
    return true
  } catch {
    return false
  }
}

// Convert a line of moves (UCI or SAN) to SAN, stopping at the first illegal move.
export function lineToSan(fen: string, moves: string[], max = 6): string[] {
  const chess = new Chess(fen)
  const out: string[] = []
  for (const mv of moves.slice(0, max)) {
    let res
    try {
      res = UCI_RE.test(mv)
        ? chess.move({ from: mv.slice(0, 2), to: mv.slice(2, 4), promotion: mv[4] as 'q' | 'r' | 'b' | 'n' | undefined })
        : chess.move(mv)
    } catch {
      break
    }
    out.push(res.san)
  }
  return out
}

// Resolve a SAN move at a FEN to its from/to squares (for board arrows).
export function uciOfSan(fen: string, san: string): { from: string; to: string } | null {
  try {
    const m = new Chess(fen).move(san)
    return { from: m.from, to: m.to }
  } catch {
    return null
  }
}

// How much material the mover is DOWN once the forced line settles (positive =
// ended down). Unlike a transient dip, this ignores ordinary trades where the
// opponent captures first and the mover recaptures (those net to zero), so it
// only flags genuine, sustained sacrifices — not normal exchanges.
export function lineMaterialLoss(fen: string, mover: 'w' | 'b', moves: string[]): number {
  const chess = new Chess(fen)
  const initial = materialNet(fen, mover)
  let last = initial
  for (const mv of moves) {
    if (!applyMove(chess, mv)) break
    last = materialNet(chess.fen(), mover)
  }
  return initial - last
}

function normalizeSan(san: string): string {
  return san.replace(/[+#!?]/g, '')
}

function sameMove(a: string, b: string): boolean {
  return normalizeSan(a) === normalizeSan(b)
}

// Eval as pawns from a chosen perspective; `sign` flips it (e.g. -1 to read an
// opponent-perspective score from the mover's side).
function fmtEval(score: Score, sign = 1): string {
  if (score.mate !== undefined) {
    const m = score.mate * sign
    return m > 0 ? `#${m}` : `#-${-m}`
  }
  const cp = scoreToCp(score) * sign
  return `${cp >= 0 ? '+' : ''}${(cp / 100).toFixed(1)}`
}

export interface MoveAnalysisInput {
  fenBefore: string
  playedSan: string
  moverColor: 'w' | 'b'
  resultBefore: EngineResult // engine analysis of fenBefore (mover to move)
  resultAfter: EngineResult // engine analysis of the position after the played move
  isBook: boolean
}

export interface MoveAnalysis {
  quality: MoveQuality
  winBefore: number
  winAfter: number
  winDrop: number
  cpDrop: number
  bestMoveSan: string | null
  bestLineSan: string[]
  mateIn: number | null
  isSacrifice: boolean
  explanation: string
  alternatives: AltMove[]
  motifs: TacticalMotif[]
  missedMotifs: TacticalMotif[]
}

export function analyzeMove(input: MoveAnalysisInput): MoveAnalysis {
  const { fenBefore, playedSan, moverColor, resultBefore, resultAfter, isBook } = input

  const scoreBefore = resultBefore.lines[0]?.score ?? {}
  const scoreAfter = resultAfter.lines[0]?.score ?? {}
  const bestPv = resultBefore.lines[0]?.pv ?? []
  const afterPv = resultAfter.lines[0]?.pv ?? []

  const winBefore = winChance(scoreBefore)
  const winAfter = 100 - winChance(scoreAfter)
  const winDrop = Math.max(0, winBefore - winAfter)
  const expectedPointLoss = winDrop / 100
  const coreQuality = classifyExpectedPointLoss(expectedPointLoss)
  const cpDrop = Math.min(CPL_CAP, Math.max(0, scoreToCp(scoreBefore) + scoreToCp(scoreAfter)))

  const bestLineSan = lineToSan(fenBefore, bestPv, 6)
  const bestMoveSan = bestLineSan[0] ?? null
  const playedIsBest = bestMoveSan !== null && sameMove(bestMoveSan, playedSan)
  const playedIsBestOrNearBest = playedIsBest || coreQuality === 'excellent'

  // Forced mate for the mover at this position, and whether the move kept it.
  const mateForMover = scoreBefore.mate !== undefined && scoreBefore.mate > 0 ? scoreBefore.mate : null
  const playedKeepsMate = scoreAfter.mate !== undefined && scoreAfter.mate < 0

  // "Only move" signal: how much worse the second-best line is (mover's win%).
  const second = resultBefore.lines[1]
  const secondGap = second ? winChance(scoreBefore) - winChance(second.score) : null

  // Sacrifice detection: did the mover stay down material once the forcing line
  // settled? Limited to the immediate combination (first 8 plies) so unrelated
  // trades deeper in the PV don't count.
  const playedLoss = lineMaterialLoss(fenBefore, moverColor, [playedSan, ...afterPv.slice(0, 8)])
  const playedIsSacrifice = playedLoss >= SAC_THRESHOLD
  const bestLoss = lineMaterialLoss(fenBefore, moverColor, bestPv.slice(0, 8))
  const bestIsSacrifice = bestLoss >= SAC_THRESHOLD
  const bestWinAfter = winChance(scoreBefore) // mover's win% if they had played the best move

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
    !playedIsBest && bestMoveSan !== null && winDrop >= 4
      ? detectMotifs(fenBefore, bestMoveSan).filter((m) => !motifs.includes(m))
      : []

  let quality: MoveQuality
  if (isBook) {
    quality = 'book'
  } else if (playedIsBestOrNearBest && playedIsSacrifice && winAfter >= 50 && winBefore >= 12 && winBefore <= 97) {
    // Brilliant: the engine's top move, a real (sustained) sacrifice, still at
    // least equal afterwards — and not from an already-won position.
    quality = 'brilliant'
  } else if (
    playedIsBestOrNearBest &&
    ((mateForMover !== null && playedKeepsMate && mateForMover <= 6) || (secondGap !== null && secondGap >= 12))
  ) {
    quality = 'great'
  } else if (playedIsBest) {
    quality = 'best'
  } else if (mateForMover !== null && !playedKeepsMate && mateForMover <= 5 && winAfter >= 45) {
    quality = 'miss'
  } else if (bestWinAfter >= 80 && winAfter < 62 && winDrop >= 4 && winDrop < 22) {
    quality = 'miss'
  } else {
    quality = coreQuality === 'best' ? 'excellent' : coreQuality
  }

  const beforeEval = fmtEval(scoreBefore)
  const afterEval = fmtEval(scoreAfter, -1)
  const line = bestLineSan.join(' ')
  const playedLineSan = lineToSan(fenBefore, [playedSan, ...afterPv], 6)
  const drop = winDrop.toFixed(0)

  let explanation: string
  switch (quality) {
    case 'book':
      explanation = 'Opening theory — a well-known book move.'
      break
    case 'brilliant':
      explanation = `Brilliant!! ${playedSan} gives up material, but it's sound — the sacrifice is the point.${playedLineSan.length ? ` The follow-up: ${playedLineSan.join(' ')}.` : ''} The position stays ${afterEval} for you.`
      break
    case 'great':
      explanation =
        mateForMover !== null && playedKeepsMate
          ? `Great move! ${playedSan} forces mate in ${mateForMover}: ${line}.`
          : `Great move! ${playedSan} was the only move that holds your edge — every alternative was clearly worse.${line ? ` It keeps the initiative: ${line}.` : ''}`
      break
    case 'best':
      explanation =
        mateForMover !== null && playedKeepsMate
          ? `Best move — it forces mate in ${mateForMover}: ${line}.`
          : `Best move. The engine agrees ${playedSan} is the top choice (${beforeEval}).${line ? ` The plan: ${line}.` : ''}`
      break
    case 'excellent':
      explanation = `Excellent move. ${playedSan} is almost as strong as the engine's top choice${bestMoveSan && !sameMove(bestMoveSan, playedSan) ? `, ${bestMoveSan}${line ? ` (${line})` : ''}` : ''}.`
      break
    case 'good':
      explanation = `Good move. ${playedSan} keeps you on track${bestMoveSan && !sameMove(bestMoveSan, playedSan) ? ` — the engine slightly preferred ${bestMoveSan} (${line})` : ''}.`
      break
    case 'inaccuracy':
      explanation = `Inaccuracy. ${playedSan} lets a little slip (−${drop}% win chance). Stronger was ${bestMoveSan}: ${line}.`
      break
    case 'mistake':
      explanation = `Mistake. This costs ${drop}% of your winning chances (now ${afterEval}). Best was ${bestMoveSan}: ${line}.`
      break
    case 'miss':
      explanation =
        mateForMover !== null
          ? `Missed win! There was a forced mate in ${mateForMover}: ${line}. Instead ${playedSan} only keeps ${afterEval}.`
          : `Missed chance. ${bestMoveSan} was winning (${line}); ${playedSan} lets your opponent back to ${afterEval}.`
      break
    default: // blunder
      explanation = `Blunder?? ${playedSan} throws away ${drop}% win chance (now ${afterEval}). Best was ${bestMoveSan}: ${line}.`
  }

  // A brilliant resource the player walked past — only worth flagging when the
  // engine's move was itself a winning sacrifice and we didn't already call the
  // played move brilliant.
  if (quality !== 'brilliant' && !playedIsBest && bestIsSacrifice && bestWinAfter >= 50 && bestMoveSan) {
    explanation += ` ${bestMoveSan} would have been brilliant — a winning sacrifice.`
  }
  // Note a forced mate that was on the board but not flagged above.
  if (mateForMover !== null && !playedKeepsMate && quality !== 'miss' && quality !== 'great' && quality !== 'best' && quality !== 'brilliant') {
    explanation += ` (A forced mate in ${mateForMover} was available.)`
  }
  if (missedMotifs.length > 0 && bestMoveSan) {
    explanation += ` You missed ${MOTIF_LABEL[missedMotifs[0]]} with ${bestMoveSan}.`
  }

  return {
    quality,
    winBefore,
    winAfter,
    winDrop,
    cpDrop,
    bestMoveSan,
    bestLineSan,
    mateIn: mateForMover,
    isSacrifice: playedIsSacrifice,
    explanation,
    alternatives,
    motifs,
    missedMotifs,
  }
}
