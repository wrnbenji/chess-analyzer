import { useEffect, useMemo, useState } from 'react'
import type { AnalyzedMove } from '../types'
import { buildShareFrames, defaultRange } from '../utils/shareFrames'
import { useGifExport } from '../hooks/useGifExport'
import { QualityBadge } from './QualityBadge'

const MAX_MOVES = 20

export function ShareDialog({
  moves,
  fens,
  currentPly,
  white,
  black,
  onClose,
}: {
  moves: AnalyzedMove[]
  fens: string[]
  currentPly: number
  white: string
  black: string
  onClose: () => void
}) {
  const initial = defaultRange(moves, Math.max(1, currentPly))
  const [fromPly, setFromPly] = useState(initial.fromPly)
  const [toPly, setToPly] = useState(initial.toPly)
  const gif = useGifExport()
  const [copyNote, setCopyNote] = useState<string | null>(null)

  const rangeCount = toPly - fromPly + 1
  const tooLong = rangeCount > MAX_MOVES

  // Preview: only the first frame — building the full range on every keystroke
  // would churn ~1MB of SVG strings per change.
  const previewFrame = useMemo(
    () => (tooLong ? null : buildShareFrames({ moves, fens, fromPly, toPly: fromPly, white, black })[0] ?? null),
    [moves, fens, fromPly, white, black, tooLong],
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // A generated GIF belongs to the range it was built from — reset on change.
  useEffect(() => {
    gif.cancel()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromPly, toPly])

  function clampFrom(v: number) {
    setFromPly(Math.max(1, Math.min(v, toPly)))
  }
  function clampTo(v: number) {
    setToPly(Math.min(moves.length, Math.max(v, fromPly)))
  }

  async function handleCopy() {
    const result = await gif.copyToClipboard()
    setCopyNote(result === 'gif' ? 'Copied to clipboard ✓' : 'Not supported here — use Download')
  }

  const filename = `${white.replace(/[^a-z0-9_-]/gi, '_')}-vs-${black.replace(/[^a-z0-9_-]/gi, '_')}-move${fromPly}.gif`

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="card max-h-[90vh] w-full max-w-2xl overflow-y-auto p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-ink">Share GIF</h2>
          <button onClick={onClose} className="btn btn-ghost h-8 w-8" aria-label="Close">✕</button>
        </div>

        <div className="mb-3 flex flex-wrap items-center gap-3 text-sm">
          <label className="flex items-center gap-1.5 text-muted">
            From
            <input
              type="number" min={1} max={toPly} value={fromPly}
              onChange={(e) => clampFrom(Number(e.target.value))}
              className="w-16 rounded border border-line bg-surface px-2 py-1 text-ink"
            />
          </label>
          <label className="flex items-center gap-1.5 text-muted">
            To
            <input
              type="number" min={fromPly} max={moves.length} value={toPly}
              onChange={(e) => clampTo(Number(e.target.value))}
              className="w-16 rounded border border-line bg-surface px-2 py-1 text-ink"
            />
          </label>
          <span className="text-xs text-muted">{rangeCount} moves</span>
        </div>

        <div className="mb-3 flex flex-wrap gap-1.5 text-xs">
          {moves.slice(fromPly - 1, toPly).map((m, i) => (
            <span key={i} className="flex items-center gap-1 rounded bg-surface-2 px-1.5 py-0.5 text-ink">
              {m.san} <QualityBadge quality={m.quality} size={12} />
            </span>
          ))}
        </div>

        {tooLong && (
          <p className="mb-3 rounded bg-red-900/30 px-3 py-2 text-xs text-red-300">
            A GIF can hold at most {MAX_MOVES} moves — narrow the selection.
          </p>
        )}

        {/* Safe: SVG is our own generated output; usernames are XML-escaped via esc() in buildShareFrames. */}
        {previewFrame !== null && (
          <div
            className="mb-4 overflow-hidden rounded-lg border border-line"
            dangerouslySetInnerHTML={{ __html: previewFrame.svg.replace('<svg ', '<svg style="width:100%;height:auto" ') }}
          />
        )}

        <div className="flex flex-wrap items-center gap-2">
          {gif.state.status !== 'working' && (
            <button
              onClick={() => gif.generate(buildShareFrames({ moves, fens, fromPly, toPly, white, black }))}
              disabled={tooLong || previewFrame === null}
              className="btn btn-primary px-4 py-2 text-sm"
            >
              Create GIF
            </button>
          )}
          {gif.state.status === 'working' && (
            <>
              <span className="relative h-1.5 w-40 overflow-hidden rounded-full bg-surface-2">
                <span
                  className="absolute inset-y-0 left-0 rounded-full bg-accent transition-[width]"
                  style={{ width: `${Math.round(gif.state.progress * 100)}%` }}
                />
              </span>
              <button onClick={gif.cancel} className="btn btn-ghost px-3 py-1.5 text-sm">Cancel</button>
            </>
          )}
          {gif.state.status === 'done' && (
            <>
              <button onClick={() => gif.download(filename)} className="btn btn-primary px-4 py-2 text-sm">
                Download
              </button>
              <button onClick={handleCopy} className="btn btn-ghost px-4 py-2 text-sm">Copy</button>
              {copyNote && <span className="text-xs text-muted">{copyNote}</span>}
            </>
          )}
          {gif.state.status === 'error' && (
            <span className="rounded bg-red-900/30 px-3 py-2 text-xs text-red-300">{gif.state.message}</span>
          )}
        </div>
      </div>
    </div>
  )
}
