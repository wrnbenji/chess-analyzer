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

export interface InfoLine {
  multipv: number // 1 = best line, 2 = second best, ...
  score: Score // from the side-to-move's perspective at the evaluated position
  pv: string[] // principal variation as UCI moves (e.g. ['e2e4', 'e7e5'])
}

// Parse a UCI `info ... multipv N score ... pv ...` line. Returns null for
// lines without a score (e.g. `info string ...`, `info depth N currmove ...`).
export function parseInfo(line: string): InfoLine | null {
  if (!line.startsWith('info') || !line.includes('score')) return null
  const score = parseScore(line)
  if (!score) return null
  const mpv = line.match(/multipv (\d+)/)
  const multipv = mpv ? parseInt(mpv[1], 10) : 1
  const pvMatch = line.match(/ pv (.+)$/)
  const pv = pvMatch ? pvMatch[1].trim().split(/\s+/) : []
  return { multipv, score, pv }
}
