// Chess.com time_control formats: "180" (seconds), "180+2" (base+increment),
// "1/86400" (daily: moves per period / seconds).
export function parseTimeControl(tc: string): { base: number; inc: number } | null {
  const daily = tc.match(/^\d+\/(\d+)$/)
  if (daily) return null
  const [base, inc] = tc.split('+')
  const baseParsed = parseInt(base, 10)
  if (!baseParsed || baseParsed <= 0) return null
  return { base: baseParsed, inc: parseInt(inc, 10) || 0 }
}

// Remaining clock (seconds) after each ply, from {[%clk H:MM:SS(.t)]} tags.
// Empty array when the PGN carries no clock data.
// Malformed tags simply don't match and are skipped.
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
export function computeTimeSpent(clocks: number[], base: number, inc: number): number[] {
  return clocks.map((clk, i) => {
    const prev = i >= 2 ? clocks[i - 2] : base
    return Math.max(0, prev - clk + inc)
  })
}
