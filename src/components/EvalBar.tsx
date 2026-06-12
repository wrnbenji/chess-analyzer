import type { Score } from '../types'
import { scoreToCp } from '../utils/eval'
import { cpToWinPercent } from '../utils/winChance'

// score is from White's perspective here (caller normalizes).
export function EvalBar({ score }: { score: Score }) {
  // White's win probability via the calibrated model, so the bar matches the
  // win% used in move analysis.
  const whiteShare = cpToWinPercent(scoreToCp(score))
  const label =
    score.mate !== undefined
      ? `M${Math.abs(score.mate)}`
      : `${scoreToCp(score) >= 0 ? '+' : ''}${(scoreToCp(score) / 100).toFixed(1)}`
  return (
    <div className="relative h-[480px] w-7 overflow-hidden rounded border bg-neutral-800 text-[10px] font-semibold">
      <div
        className="absolute bottom-0 left-0 w-full bg-white transition-all"
        style={{ height: `${whiteShare}%` }}
      />
      {/* Eval readout pinned to whichever side is ahead. */}
      <span
        className={`absolute left-0 w-full text-center ${whiteShare >= 50 ? 'bottom-0.5 text-neutral-800' : 'top-0.5 text-white'}`}
      >
        {label}
      </span>
    </div>
  )
}
