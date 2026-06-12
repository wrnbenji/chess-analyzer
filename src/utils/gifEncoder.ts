import { GIFEncoder, quantize, applyPalette } from 'gifenc'
import type { FrameSpec } from './shareFrames'

export interface RasterFrame {
  data: Uint8ClampedArray
  width: number
  height: number
}

// SVG markup → RGBA pixels. Injectable so tests avoid the DOM entirely.
export type Rasterize = (svg: string, width: number, height: number) => Promise<RasterFrame>

export interface EncodeOptions {
  width: number
  height: number
  rasterize?: Rasterize
  onProgress?: (done: number, total: number) => void
  isCancelled?: () => boolean
}

// Browser rasterizer: SVG → object URL → <img> → canvas → ImageData.
export const domRasterize: Rasterize = async (svg, width, height) => {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
  try {
    const img = new Image()
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('Failed to rasterize frame'))
      img.src = url
    })
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas 2D unavailable')
    ctx.drawImage(img, 0, 0, width, height)
    const data = ctx.getImageData(0, 0, width, height)
    return { data: data.data, width, height }
  } finally {
    URL.revokeObjectURL(url)
  }
}

export async function encodeGif(frames: FrameSpec[], opts: EncodeOptions): Promise<Blob> {
  const { width, height, rasterize = domRasterize, onProgress, isCancelled } = opts
  const gif = GIFEncoder()
  for (let i = 0; i < frames.length; i++) {
    if (isCancelled?.()) throw new Error('cancelled')
    const raster = await rasterize(frames[i].svg, width, height)
    // gifenc's quantize and applyPalette both accept Uint8ClampedArray natively
    // (documented in README: "flat Uint8Array or Uint8ClampedArray of per-pixel RGBA data").
    // No conversion needed.
    const palette = quantize(raster.data, 256)
    const index = applyPalette(raster.data, palette)
    // gifenc's writeFrame `delay` option is in MILLISECONDS — confirmed in README:
    // "delay (number, default 0) — the frame delay in milliseconds"
    // gifenc converts to GIF centiseconds (÷10) internally. No division needed here.
    gif.writeFrame(index, width, height, { palette, delay: frames[i].durationMs })
    onProgress?.(i + 1, frames.length)
  }
  gif.finish()
  return new Blob([gif.bytes()], { type: 'image/gif' })
}
