import { describe, it, expect } from 'vitest'
import { detectMotifs } from './motifs'

describe('detectMotifs: fork', () => {
  it('detects a knight fork on king and rook', () => {
    // Nc7+ forks Ke8 (via c7->e8 knight jump) and Ra8 (via c7->a8 knight jump).
    // White: Nd5, Ke1. Black: Ra8, Ke8.
    const fen = 'r3k3/8/8/3N4/8/8/8/4K3 w - - 0 1'
    expect(detectMotifs(fen, 'Nc7+')).toContain('fork')
  })
  it('a quiet developing move is not a fork', () => {
    const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
    expect(detectMotifs(fen, 'Nf3')).toEqual([])
  })
})

describe('detectMotifs: hanging piece', () => {
  it('detects attacking an undefended piece', () => {
    // Re1 attacks the undefended black bishop on e7.
    // White: Ra1, Kf1. Black: Be7, Ka8.
    // The e-file is clear between e1 and e7 (e2..e6 empty).
    const fen = 'k7/4b3/8/8/8/8/8/R4K2 w Q - 0 1'
    expect(detectMotifs(fen, 'Re1')).toContain('hanging-piece')
  })
  it('attacking a defended piece is not hanging', () => {
    // Re1 attacks the black bishop on e7, but the bishop is defended by the knight on d5.
    // d5->e7 is a valid knight jump (2 files, 1 rank).
    // White: Ra1, Kf1. Black: Be7, Nd5, Ka8.
    const fen = 'k7/4b3/8/3n4/8/8/8/R4K2 w Q - 0 1'
    expect(detectMotifs(fen, 'Re1')).not.toContain('hanging-piece')
  })
})

describe('detectMotifs: double check', () => {
  it('detects double check', () => {
    // Nd6+ — knight moves from e4 to d6, giving check. The move also
    // unmasks the e1 rook, which checks along the e-file through e8. Double check.
    // White: Ne4, Re1, Kf1. Black: Ke8.
    const fen = '4k3/8/8/8/4N3/8/8/4RK2 w - - 0 1'
    expect(detectMotifs(fen, 'Nd6+')).toContain('double-check')
  })
})

describe('detectMotifs: promotion', () => {
  it('flags promotions', () => {
    // White pawn on a7 promotes to queen.
    // White: Pa7, Ke1. Black: Ke7.
    const fen = '8/P3k3/8/8/8/8/8/4K3 w - - 0 1'
    expect(detectMotifs(fen, 'a8=Q')).toContain('promotion')
  })
})

describe('detectMotifs: hanging piece is move-created, not carried over', () => {
  it('does not flag a move when the piece was already hanging before it', () => {
    // Black bishop on e7 is already attacked by the white rook on e1 (e-file clear)
    // and completely undefended before the move. White plays Kg2 (unrelated king move).
    // The badge must NOT fire because the hanging situation pre-existed.
    const fen = 'k7/4b3/8/8/8/8/8/4R1K1 w - - 0 1'
    expect(detectMotifs(fen, 'Kg2')).not.toContain('hanging-piece')
  })
})

describe('detectMotifs: invalid input', () => {
  it('returns empty for illegal moves', () => {
    const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
    expect(detectMotifs(fen, 'Qh5xh7')).toEqual([])
  })
})

describe('detectMotifs: pin and skewer', () => {
  it('detects a pin (bishop pins knight to king)', () => {
    // White: Bc4, Ke1. Black: Nc6, Ke8.
    // Bb5 pins the c6 knight against the e8 king along the b5-c6-d7-e8 diagonal.
    // d7 is empty so the ray goes straight through: bishop → knight → king.
    const fen = '4k3/8/2n5/8/2B5/8/8/4K3 w - - 0 1'
    expect(detectMotifs(fen, 'Bb5')).toContain('pin')
  })
  it('detects a skewer (rook skewers king to rook)', () => {
    // Re1+ hits the e5 king; behind it on the e-file sits the e8 rook.
    // White: Ra1, Kg1. Black: Ke5, Re8.
    const fen = '4r3/8/8/4k3/8/8/8/R5K1 w - - 0 1'
    expect(detectMotifs(fen, 'Re1+')).toContain('skewer')
  })
})

describe('detectMotifs: discovered attack', () => {
  it('detects discovered attack on the queen', () => {
    // Moving the d5 knight opens the d1 rook's file onto the d8 queen.
    // White: Nd5, Rd1, Ke1. Black: Qd8, Kf7.
    // Black king is on f7 (not e7) to avoid being in check from the d5 knight.
    const fen = '3q4/5k2/8/3N4/8/8/8/3RK3 w - - 0 1'
    expect(detectMotifs(fen, 'Nb6')).toContain('discovered-attack')
  })
})

describe('detectMotifs: back rank', () => {
  it('flags a back-rank mate', () => {
    // Re8# against a king boxed in by its own pawns on f7/g7/h7.
    const fen = '6k1/5ppp/8/8/8/8/8/4R1K1 w - - 0 1'
    expect(detectMotifs(fen, 'Re8#')).toContain('back-rank')
  })
})

describe('detectMotifs: pin/skewer noise guards', () => {
  it('does not call a pawn shielding a knight a pin', () => {
    // White: Qb1, Pa2, Ke1. Black: pc4, ne6, ke8.
    // After Qb3: ray NE from b3 → c4 pawn (front, val=1), e6 knight (back, val=3).
    // backV(3) > frontV(1) but back is a minor (val < 5, not king) → no pin.
    // The a2 pawn defends b3 so the en-prise guard does not suppress first.
    const fen = '4k3/8/4n3/8/2p5/8/P7/1Q2K3 w - - 0 1'
    expect(detectMotifs(fen, 'Qb3')).not.toContain('pin')
  })
  it('does not call an en-prise slider a pinner', () => {
    // White: Bf1, Ke1. Black: nc6, rb4, ke8.
    // After Bb5: ray NE → c6 knight (front), e8 king (back) = absolute pin geometry.
    // But the bishop on b5 is attacked by the b4 rook and undefended → en-prise guard suppresses.
    const fen = '4k3/8/2n5/8/1r6/8/8/4KB2 w - - 0 1'
    expect(detectMotifs(fen, 'Bb5')).not.toContain('pin')
  })
})

describe('detectMotifs: trapped piece', () => {
  it('detects a cornered, attacked piece with no safe squares', () => {
    // White: Ke1, Rg1, Pf5. Black: Kf7, Nh8.
    // After Rh1, the rook attacks h8. The knight's only escape is g6, which is
    // attacked by the f5 pawn. All escape squares are covered → trapped.
    const fen = '7n/5k2/8/5P2/8/8/8/4K1R1 w - - 0 1'
    expect(detectMotifs(fen, 'Rh1')).toContain('trapped-piece')
  })
})
