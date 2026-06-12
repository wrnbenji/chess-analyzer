import { describe, it, expect } from 'vitest'
import { renderBoardSvg } from './boardSvg'

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

describe('renderBoardSvg', () => {
  it('renders 64 squares and 32 pieces for the start position', () => {
    const svg = renderBoardSvg(START, { size: 480 })
    expect(svg.match(/<rect /g)).toHaveLength(64)
    expect(svg.match(/viewBox="0 0 45 45"/g)).toHaveLength(32)
    expect(svg).toMatch(/^<svg[^>]*width="480"/)
  })
  it('places a white-orientation piece correctly (a1 rook bottom-left)', () => {
    const svg = renderBoardSvg('8/8/8/8/8/8/8/R7 w - - 0 1', { size: 480 })
    // a1 with white orientation: col 0, row 7 → x=0, y=7*60=420
    expect(svg).toContain('x="0" y="420"')
  })
  it('flips coordinates for black orientation', () => {
    const svg = renderBoardSvg('8/8/8/8/8/8/8/R7 w - - 0 1', { size: 480, orientation: 'black' })
    // a1 with black orientation: col 7, row 0 → x=420, y=0
    expect(svg).toContain('x="420" y="0"')
  })
  it('draws the quality badge on the destination square', () => {
    const svg = renderBoardSvg(START, { size: 480, badge: { square: 'e4', quality: 'brilliant' } })
    expect(svg).toContain('!!')
    expect(svg).toContain('#1baca6') // brilliant color from QUALITY_COLOR
  })
  it('draws an arrow between squares', () => {
    const svg = renderBoardSvg(START, { size: 480, arrow: { from: 'e2', to: 'e4', color: '#5c8a3c' } })
    expect(svg).toContain('<line')
    expect(svg).toContain('#5c8a3c')
  })
})
