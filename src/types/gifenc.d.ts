declare module 'gifenc' {
  export function GIFEncoder(): {
    writeFrame(index: Uint8Array, width: number, height: number, opts: { palette: number[][]; delay?: number }): void
    finish(): void
    // bytes() returns a slice of the internal buffer — always a plain ArrayBuffer at runtime.
    bytes(): Uint8Array<ArrayBuffer>
  }
  export function quantize(rgba: Uint8Array | Uint8ClampedArray, maxColors: number): number[][]
  export function applyPalette(rgba: Uint8Array | Uint8ClampedArray, palette: number[][]): Uint8Array
}
