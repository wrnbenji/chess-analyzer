import type { useTrainer } from '../hooks/useTrainer'
import { MOTIF_LABEL } from '../utils/analysis'

const HINT_BTN = 'btn btn-ghost px-3 py-1.5 text-sm'

const PIECE_NAME: Record<string, string> = {
  K: 'king', Q: 'queen', R: 'rook', B: 'bishop', N: 'knight', O: 'king',
}

function pieceOfSan(san: string): string {
  const first = san[0]
  return first >= 'A' && first <= 'Z' ? PIECE_NAME[first] ?? 'piece' : 'pawn'
}

export function TrainerCard({ trainer }: { trainer: ReturnType<typeof useTrainer> }) {
  const { current, index, puzzles, done, results, lastGrade, hintLevel } = trainer

  if (puzzles.length === 0) {
    return <div className="card p-4 text-sm text-muted">No mistakes to train on — clean game!</div>
  }

  if (done) {
    const solved = results.filter((r) => r.solved).length
    const weakMotifs = [...new Set(results.filter((r) => !r.solved).flatMap((r) => r.puzzle.missedMotifs))]
    return (
      <div className="card p-4 text-sm">
        <p className="font-semibold text-ink">Training done: {solved}/{results.length} found</p>
        {weakMotifs.length > 0 && (
          <p className="mt-1 text-muted">Worth drilling: {weakMotifs.map((m) => MOTIF_LABEL[m]).join(', ')}.</p>
        )}
        <button onClick={trainer.restart} className="btn btn-primary mt-3 px-3 py-1.5 text-sm">Again</button>
      </div>
    )
  }

  if (!current) return null
  const solvedThis = lastGrade === 'correct' || lastGrade === 'almost' || hintLevel >= 3

  return (
    <div className="card border-l-4 p-4 text-sm" style={{ borderLeftColor: '#ffd54f' }}>
      <div className="flex items-center justify-between">
        <p className="font-semibold text-ink">🎯 Your move — find the best one!</p>
        <span className="nums text-xs text-muted">{index + 1}/{puzzles.length}</span>
      </div>

      {hintLevel >= 1 && current.missedMotifs.length > 0 && (
        <p className="mt-2 rounded bg-surface-2 px-2 py-1 text-xs text-accent">
          💡 Look for {MOTIF_LABEL[current.missedMotifs[0]]}.
        </p>
      )}
      {hintLevel === 1 && current.missedMotifs.length === 0 && (
        <p className="mt-2 rounded bg-surface-2 px-2 py-1 text-xs text-accent">
          💡 There is a clearly stronger move here than the one played.
        </p>
      )}
      {hintLevel >= 2 && (
        <p className="mt-1 rounded bg-surface-2 px-2 py-1 text-xs text-accent">
          💡 The {pieceOfSan(current.bestSan)} moves.
        </p>
      )}
      {hintLevel >= 3 && (
        <p className="mt-1 rounded bg-surface-2 px-2 py-1 text-xs text-ink">
          The move was <span className="font-mono font-semibold">{current.bestSan}</span> (you played{' '}
          {current.playedSan}).
        </p>
      )}

      {lastGrade === 'correct' && <p className="mt-2 text-green-400">✓ Exactly — {current.bestSan}!</p>}
      {lastGrade === 'almost' && (
        <p className="mt-2 text-yellow-300">Almost — also good, but {current.bestSan} is stronger.</p>
      )}
      {lastGrade === 'wrong' && <p className="mt-2 text-red-300">✗ Not that one — try again.</p>}

      <div className="mt-3 flex gap-2">
        {!solvedThis && hintLevel < 2 && (
          <button onClick={trainer.hint} className={HINT_BTN}>Hint 💡</button>
        )}
        {!solvedThis && <button onClick={trainer.reveal} className={HINT_BTN}>Show me</button>}
        {solvedThis && (
          <button onClick={trainer.next} className="btn btn-primary px-3 py-1.5 text-sm">
            {index + 1 === puzzles.length ? 'Finish' : 'Next puzzle →'}
          </button>
        )}
      </div>
    </div>
  )
}
