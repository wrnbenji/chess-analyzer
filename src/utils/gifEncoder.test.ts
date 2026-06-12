import { describe, it, expect } from 'vitest'
import { encodeGif, type Rasterize } from './gifEncoder'

// Fake rasterizer: solid red frame, no DOM needed.
const fakeRasterize: Rasterize = async (_svg, width, height) => {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 200
    data[i + 3] = 255
  }
  return { data, width, height }
}

describe('encodeGif', () => {
  const frames = [
    { svg: '<svg/>', durationMs: 600 },
    { svg: '<svg/>', durationMs: 900 },
  ]

  it('produces a GIF blob with the GIF89a magic bytes', async () => {
    const blob = await encodeGif(frames, { width: 32, height: 32, rasterize: fakeRasterize })
    expect(blob.type).toBe('image/gif')
    const head = new Uint8Array(await blob.arrayBuffer()).slice(0, 6)
    expect(String.fromCharCode(...head)).toBe('GIF89a')
  })

  it('reports progress per frame', async () => {
    const seen: number[] = []
    await encodeGif(frames, { width: 16, height: 16, rasterize: fakeRasterize, onProgress: (done, total) => seen.push(done / total) })
    expect(seen).toEqual([0.5, 1])
  })

  it('aborts when cancelled', async () => {
    await expect(
      encodeGif(frames, { width: 16, height: 16, rasterize: fakeRasterize, isCancelled: () => true }),
    ).rejects.toThrow('cancelled')
  })
})
