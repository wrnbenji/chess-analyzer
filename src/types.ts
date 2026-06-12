// Engine score from the side-to-move's perspective.
export interface Score {
  cp?: number    // centipawns
  mate?: number  // moves to mate (signed: positive = side-to-move mates)
}

// GamePhase is defined in utils/phase.ts; types.ts is the canonical import
// point for UI code — re-export it here so consumers only need one import.
import type { GamePhase } from './utils/phase'
export type { GamePhase }

import type { TacticalMotif } from './utils/motifs'
export type { TacticalMotif }

// An engine alternative at a position (one MultiPV line).
export interface AltMove {
  san: string
  lineSan: string[] // continuation in SAN, max 6 plies
  score: Score // side-to-move perspective at the position
  winPercent: number // mover's win% if this line is played
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

export type MoveQuality =
  | 'brilliant'
  | 'great'
  | 'best'
  | 'excellent'
  | 'good'
  | 'book'
  | 'inaccuracy'
  | 'mistake'
  | 'miss'
  | 'blunder'

// One engine line for a position (best line, second best, ...).
export interface EngineLine {
  score: Score // from the side-to-move's perspective at this position
  pv: string[] // principal variation, UCI moves
}

// Full multi-PV result for a position; lines[0] is the engine's best line.
export interface EngineResult {
  lines: EngineLine[]
}

export interface AnalyzedMove {
  san: string
  color: 'w' | 'b'
  fenAfter: string
  toSquare: string // destination square of the move, e.g. 'e4'
  quality: MoveQuality
  cpDrop: number // centipawn loss from the mover's perspective, >= 0
  winBefore: number // mover's win probability (0–100) before the move
  winAfter: number // mover's win probability (0–100) after the move
  winDrop: number // win% lost by the move (winBefore - winAfter, >= 0)
  explanation: string // human-readable account of why the move earned its mark
  bestMoveSan: string | null // the engine's top move at this position
  bestLineSan: string[] // engine's principal continuation, in SAN
  mateIn: number | null // forced mate available for the mover (plies/2), if any
  isSacrifice: boolean // the move (or its forced line) gives up material
  phase: GamePhase // position phase at the time of this move
  alternatives: AltMove[] // top engine lines at the position, lines[0] first
  motifs: TacticalMotif[] // motifs the played move creates
  missedMotifs: TacticalMotif[] // motifs the best move had that the player skipped
  clockSeconds: number | null // remaining clock after this move (%clk), if known
  timeSpent: number | null // seconds spent on this move, if known
}
