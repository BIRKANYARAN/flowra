import { describe, it, expect } from 'vitest'
import {
  RESOLUTION_STATUS_LABELS,
  ResolutionsService,
  type VotingOutcome,
  type GovernanceResolution,
} from '@/lib/services/governance/resolutions.service'

// ── computeVotingResult ───────────────────────────────────────────────────────

describe('ResolutionsService.computeVotingResult', () => {
  it('returns "passed" when in_favor > against', () => {
    const outcome: VotingOutcome = { in_favor: 5, against: 2, abstained: 1, total: 8 }
    expect(ResolutionsService.computeVotingResult(outcome)).toBe('passed')
  })

  it('returns "failed" when against > in_favor', () => {
    const outcome: VotingOutcome = { in_favor: 2, against: 5, abstained: 1, total: 8 }
    expect(ResolutionsService.computeVotingResult(outcome)).toBe('failed')
  })

  it('returns "tie" when in_favor === against', () => {
    const outcome: VotingOutcome = { in_favor: 3, against: 3, abstained: 2, total: 8 }
    expect(ResolutionsService.computeVotingResult(outcome)).toBe('tie')
  })

  it('returns "tie" when both in_favor and against are 0', () => {
    const outcome: VotingOutcome = { in_favor: 0, against: 0, abstained: 0, total: 0 }
    expect(ResolutionsService.computeVotingResult(outcome)).toBe('tie')
  })

  it('returns "passed" when against is 0', () => {
    const outcome: VotingOutcome = { in_favor: 3, against: 0, abstained: 0, total: 3 }
    expect(ResolutionsService.computeVotingResult(outcome)).toBe('passed')
  })

  it('returns "failed" when in_favor is 0', () => {
    const outcome: VotingOutcome = { in_favor: 0, against: 3, abstained: 0, total: 3 }
    expect(ResolutionsService.computeVotingResult(outcome)).toBe('failed')
  })

  it('handles unanimous approval', () => {
    const outcome: VotingOutcome = { in_favor: 10, against: 0, abstained: 0, total: 10 }
    expect(ResolutionsService.computeVotingResult(outcome)).toBe('passed')
  })

  it('handles unanimous rejection', () => {
    const outcome: VotingOutcome = { in_favor: 0, against: 10, abstained: 0, total: 10 }
    expect(ResolutionsService.computeVotingResult(outcome)).toBe('failed')
  })
})

// ── canApprove ────────────────────────────────────────────────────────────────

describe('ResolutionsService.canApprove', () => {
  it('returns true for draft status', () => {
    expect(ResolutionsService.canApprove({ status: 'draft' })).toBe(true)
  })

  it('returns false for approved status', () => {
    expect(ResolutionsService.canApprove({ status: 'approved' })).toBe(false)
  })

  it('returns false for rejected status', () => {
    expect(ResolutionsService.canApprove({ status: 'rejected' })).toBe(false)
  })

  it('returns false for implemented status', () => {
    expect(ResolutionsService.canApprove({ status: 'implemented' })).toBe(false)
  })

  it('is true only for draft — all statuses checked', () => {
    const statuses = ['draft', 'approved', 'rejected', 'implemented'] as const
    const results = statuses.map(s => ResolutionsService.canApprove({ status: s }))
    expect(results).toEqual([true, false, false, false])
  })
})

// ── canImplement ──────────────────────────────────────────────────────────────

describe('ResolutionsService.canImplement', () => {
  it('returns true for approved status', () => {
    expect(ResolutionsService.canImplement({ status: 'approved' })).toBe(true)
  })

  it('returns false for draft status', () => {
    expect(ResolutionsService.canImplement({ status: 'draft' })).toBe(false)
  })

  it('returns false for rejected status', () => {
    expect(ResolutionsService.canImplement({ status: 'rejected' })).toBe(false)
  })

  it('returns false for implemented status', () => {
    expect(ResolutionsService.canImplement({ status: 'implemented' })).toBe(false)
  })

  it('is true only for approved — all statuses checked', () => {
    const statuses = ['draft', 'approved', 'rejected', 'implemented'] as const
    const results = statuses.map(s => ResolutionsService.canImplement({ status: s }))
    expect(results).toEqual([false, true, false, false])
  })
})

// ── VotingOutcome validation ──────────────────────────────────────────────────

describe('VotingOutcome validation logic', () => {
  function isValid(vo: VotingOutcome): boolean {
    if (vo.total <= 0) return false
    return vo.in_favor + vo.against + vo.abstained <= vo.total
  }

  it('accepts valid outcome where sum equals total', () => {
    const vo: VotingOutcome = { in_favor: 3, against: 2, abstained: 1, total: 6 }
    expect(isValid(vo)).toBe(true)
  })

  it('accepts valid outcome where sum is less than total (some members absent)', () => {
    const vo: VotingOutcome = { in_favor: 3, against: 2, abstained: 0, total: 10 }
    expect(isValid(vo)).toBe(true)
  })

  it('rejects outcome where sum exceeds total', () => {
    const vo: VotingOutcome = { in_favor: 4, against: 4, abstained: 4, total: 6 }
    expect(isValid(vo)).toBe(false)
  })

  it('rejects outcome where total is zero', () => {
    const vo: VotingOutcome = { in_favor: 0, against: 0, abstained: 0, total: 0 }
    expect(isValid(vo)).toBe(false)
  })

  it('rejects outcome where total is negative', () => {
    const vo: VotingOutcome = { in_favor: 0, against: 0, abstained: 0, total: -1 }
    expect(isValid(vo)).toBe(false)
  })

  it('accepts outcome where only abstentions exist', () => {
    const vo: VotingOutcome = { in_favor: 0, against: 0, abstained: 5, total: 5 }
    expect(isValid(vo)).toBe(true)
  })

  it('rejects when in_favor alone exceeds total', () => {
    const vo: VotingOutcome = { in_favor: 7, against: 0, abstained: 0, total: 5 }
    expect(isValid(vo)).toBe(false)
  })
})

// ── RESOLUTION_STATUS_LABELS ──────────────────────────────────────────────────

describe('RESOLUTION_STATUS_LABELS', () => {
  it('has all 4 required keys', () => {
    const requiredKeys = ['draft', 'approved', 'rejected', 'implemented'] as const
    for (const key of requiredKeys) {
      expect(RESOLUTION_STATUS_LABELS[key]).toBeTruthy()
    }
  })

  it('has exactly 4 keys', () => {
    expect(Object.keys(RESOLUTION_STATUS_LABELS).length).toBe(4)
  })

  it('draft label is Turkish', () => {
    expect(RESOLUTION_STATUS_LABELS.draft).toBe('Taslak')
  })

  it('approved label is Turkish', () => {
    expect(RESOLUTION_STATUS_LABELS.approved).toBe('Onaylandı')
  })

  it('rejected label is Turkish', () => {
    expect(RESOLUTION_STATUS_LABELS.rejected).toBe('Reddedildi')
  })

  it('implemented label is Turkish', () => {
    expect(RESOLUTION_STATUS_LABELS.implemented).toBe('Uygulandı')
  })
})

// ── State machine invariants ──────────────────────────────────────────────────

describe('state machine invariants', () => {
  it('only draft can be approved', () => {
    const statuses = ['draft', 'approved', 'rejected', 'implemented'] as const
    const approvable = statuses.filter(s => ResolutionsService.canApprove({ status: s }))
    expect(approvable).toEqual(['draft'])
  })

  it('only approved can be implemented', () => {
    const statuses = ['draft', 'approved', 'rejected', 'implemented'] as const
    const implementable = statuses.filter(s => ResolutionsService.canImplement({ status: s }))
    expect(implementable).toEqual(['approved'])
  })

  it('rejected is a terminal state (cannot approve or implement)', () => {
    expect(ResolutionsService.canApprove({ status: 'rejected' })).toBe(false)
    expect(ResolutionsService.canImplement({ status: 'rejected' })).toBe(false)
  })

  it('implemented is a terminal state (cannot approve or implement)', () => {
    expect(ResolutionsService.canApprove({ status: 'implemented' })).toBe(false)
    expect(ResolutionsService.canImplement({ status: 'implemented' })).toBe(false)
  })

  it('draft cannot be directly implemented', () => {
    expect(ResolutionsService.canImplement({ status: 'draft' })).toBe(false)
  })
})

// ── computeVotingResult edge cases ────────────────────────────────────────────

describe('computeVotingResult edge cases', () => {
  it('handles large vote counts correctly', () => {
    const outcome: VotingOutcome = { in_favor: 1000, against: 999, abstained: 1, total: 2000 }
    expect(ResolutionsService.computeVotingResult(outcome)).toBe('passed')
  })

  it('handles exactly equal large vote counts', () => {
    const outcome: VotingOutcome = { in_favor: 500, against: 500, abstained: 0, total: 1000 }
    expect(ResolutionsService.computeVotingResult(outcome)).toBe('tie')
  })

  it('single vote in favor passes', () => {
    const outcome: VotingOutcome = { in_favor: 1, against: 0, abstained: 0, total: 1 }
    expect(ResolutionsService.computeVotingResult(outcome)).toBe('passed')
  })

  it('single vote against fails', () => {
    const outcome: VotingOutcome = { in_favor: 0, against: 1, abstained: 0, total: 1 }
    expect(ResolutionsService.computeVotingResult(outcome)).toBe('failed')
  })
})
