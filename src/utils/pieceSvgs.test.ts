import { describe, it, expect } from 'vitest'
import { pieceSvg, PIECE_CODES } from './pieceSvgs'

describe('pieceSvg', () => {
  it('renders every piece as positioned standalone svg markup', () => {
    for (const code of PIECE_CODES) {
      const svg = pieceSvg(code, 100, 200, 60)
      expect(svg).toContain('<svg')
      expect(svg).toContain('x="100"')
      expect(svg).toContain('y="200"')
      expect(svg).toContain('width="60"')
      expect(svg).toContain('height="60"')
      expect(svg).toContain('viewBox="0 0 45 45"')
      expect(svg).toContain('<path') // real piece artwork, not a placeholder
    }
  })
  it('covers all 12 piece codes', () => {
    expect(PIECE_CODES).toHaveLength(12)
    expect(PIECE_CODES).toContain('wK')
    expect(PIECE_CODES).toContain('bP')
  })
})
