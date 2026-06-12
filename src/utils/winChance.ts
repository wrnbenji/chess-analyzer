// Convert a centipawn evaluation (from one side's perspective) into that side's
// win probability on a 0–100 scale.
//
// This logistic curve is the expected-points model that both Lichess and
// Chess.com base their accuracy/classification on. The constant was fitted
// against millions of real games — it is the calibrated "model" that makes a
// given eval mean the same thing whether the position is equal or lopsided.
// A 1.5-pawn swing near equality costs a lot of win%, the same swing at +9
// costs almost none, which is exactly why raw centipawn loss never matches
// Chess.com's numbers but win% does.
export function cpToWinPercent(cp: number): number {
  const win = 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1)
  return Math.max(0, Math.min(100, win))
}
