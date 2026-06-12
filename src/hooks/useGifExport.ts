import { useRef, useState } from 'react'
import type { FrameSpec } from '../utils/shareFrames'
import { encodeGif } from '../utils/gifEncoder'
import { FRAME_W, FRAME_H } from '../utils/shareFrames'

export type GifExportState =
  | { status: 'idle' }
  | { status: 'working'; progress: number }
  | { status: 'done'; blob: Blob }
  | { status: 'error'; message: string }

export function useGifExport() {
  const [state, setState] = useState<GifExportState>({ status: 'idle' })
  const generationRef = useRef(0)

  async function generate(frames: FrameSpec[]) {
    const generation = ++generationRef.current
    const isCancelled = () => generation !== generationRef.current
    setState({ status: 'working', progress: 0 })
    try {
      const blob = await encodeGif(frames, {
        width: FRAME_W,
        height: FRAME_H,
        isCancelled,
        onProgress: (done, total) => {
          if (!isCancelled()) setState({ status: 'working', progress: done / total })
        },
      })
      if (!isCancelled()) setState({ status: 'done', blob })
    } catch (err) {
      if (!isCancelled()) {
        setState({ status: 'error', message: err instanceof Error ? err.message : 'GIF generation failed' })
      }
    }
  }

  function cancel() {
    generationRef.current++
    setState({ status: 'idle' })
  }

  function download(filename: string) {
    if (state.status !== 'done') return
    const url = URL.createObjectURL(state.blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    link.click()
    URL.revokeObjectURL(url)
  }

  return { state, generate, cancel, download }
}
