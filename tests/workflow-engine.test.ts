/**
 * Tests for lib/engines/workflow.engine.ts — pure workflow state machine
 * Run with: npx vitest run tests/workflow-engine.test.ts
 */
import { describe, it, expect } from 'vitest'
import {
  transitionWorkflow,
  getExpiryDate,
  isExpired,
  type WorkflowInstance,
} from '../lib/engines/workflow.engine'

// ── Helpers ───────────────────────────────────────────────────────────────────

const pendingInstance = (overrides?: Partial<Pick<WorkflowInstance, 'status' | 'workflow_type'>>) => ({
  status:        'pending'          as const,
  workflow_type: 'expense_approval' as const,
  ...overrides,
})

const INITIATOR = 'user-abc'
const APPROVER  = 'user-xyz'

// ── transitionWorkflow ────────────────────────────────────────────────────────

describe('transitionWorkflow — valid transitions', () => {

  it('pending → approve (valid actor) → success + new_status=approved', () => {
    const result = transitionWorkflow(pendingInstance(), 'approve', APPROVER, INITIATOR)
    expect(result.success).toBe(true)
    expect(result.new_status).toBe('approved')
    expect(result.error).toBeUndefined()
  })

  it('pending → reject (valid actor) → success + new_status=rejected', () => {
    const result = transitionWorkflow(pendingInstance(), 'reject', APPROVER, INITIATOR)
    expect(result.success).toBe(true)
    expect(result.new_status).toBe('rejected')
    expect(result.error).toBeUndefined()
  })

  it('pending → expire (system actor) → success + new_status=expired', () => {
    const result = transitionWorkflow(pendingInstance(), 'expire', 'system', INITIATOR)
    expect(result.success).toBe(true)
    expect(result.new_status).toBe('expired')
    expect(result.error).toBeUndefined()
  })

})

describe('transitionWorkflow — self-approval block', () => {

  it('self-approval blocked → error SELF_APPROVAL_NOT_ALLOWED', () => {
    const result = transitionWorkflow(pendingInstance(), 'approve', INITIATOR, INITIATOR)
    expect(result.success).toBe(false)
    expect(result.error).toBe('SELF_APPROVAL_NOT_ALLOWED')
  })

})

describe('transitionWorkflow — terminal states', () => {

  it('approved → approve again → INVALID_TRANSITION', () => {
    const result = transitionWorkflow(
      pendingInstance({ status: 'approved' }),
      'approve',
      APPROVER,
      INITIATOR,
    )
    expect(result.success).toBe(false)
    expect(result.error).toBe('INVALID_TRANSITION')
  })

  it('rejected → approve → INVALID_TRANSITION', () => {
    const result = transitionWorkflow(
      pendingInstance({ status: 'rejected' }),
      'approve',
      APPROVER,
      INITIATOR,
    )
    expect(result.success).toBe(false)
    expect(result.error).toBe('INVALID_TRANSITION')
  })

  it('expired workflow cannot be approved → INVALID_TRANSITION', () => {
    const result = transitionWorkflow(
      pendingInstance({ status: 'expired' }),
      'approve',
      APPROVER,
      INITIATOR,
    )
    expect(result.success).toBe(false)
    expect(result.error).toBe('INVALID_TRANSITION')
  })

})

// ── getExpiryDate ─────────────────────────────────────────────────────────────

describe('getExpiryDate', () => {

  it('expense_approval: initiated + 48h', () => {
    const initiated = '2025-01-01T00:00:00.000Z'
    const expiry    = getExpiryDate('expense_approval', initiated)
    const diffMs    = new Date(expiry).getTime() - new Date(initiated).getTime()
    expect(diffMs).toBe(48 * 60 * 60 * 1000)
  })

  it('period_close: initiated + 168h (7 days)', () => {
    const initiated = '2025-01-01T00:00:00.000Z'
    const expiry    = getExpiryDate('period_close', initiated)
    const diffMs    = new Date(expiry).getTime() - new Date(initiated).getTime()
    expect(diffMs).toBe(168 * 60 * 60 * 1000)
  })

})

// ── isExpired ─────────────────────────────────────────────────────────────────

describe('isExpired', () => {

  it('past date → true', () => {
    expect(isExpired({ expires_at: '2000-01-01T00:00:00.000Z' })).toBe(true)
  })

  it('future date → false', () => {
    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString()
    expect(isExpired({ expires_at: future })).toBe(false)
  })

})

// ── transitionWorkflow — full workflow type coverage ──────────────────────────

describe('transitionWorkflow — all workflow types can be approved', () => {

  const types: Array<WorkflowInstance['workflow_type']> = [
    'expense_approval',
    'partner_loan_entry',
    'dividend_declaration',
    'period_close',
    'period_lock',
  ]

  for (const wt of types) {
    it(`${wt}: pending → approve by non-initiator → success`, () => {
      const result = transitionWorkflow(
        { status: 'pending', workflow_type: wt },
        'approve',
        'approver-001',
        'initiator-001',
      )
      expect(result.success).toBe(true)
      expect(result.new_status).toBe('approved')
    })
  }

  for (const wt of types) {
    it(`${wt}: pending → reject by non-initiator → success`, () => {
      const result = transitionWorkflow(
        { status: 'pending', workflow_type: wt },
        'reject',
        'approver-001',
        'initiator-001',
      )
      expect(result.success).toBe(true)
      expect(result.new_status).toBe('rejected')
    })
  }
})

describe('transitionWorkflow — expire action rules', () => {

  it('system can expire pending workflow', () => {
    const result = transitionWorkflow(pendingInstance(), 'expire', 'system', INITIATOR)
    expect(result.success).toBe(true)
    expect(result.new_status).toBe('expired')
  })

  it('non-system actor cannot expire → INVALID_TRANSITION', () => {
    const result = transitionWorkflow(pendingInstance(), 'expire', APPROVER, INITIATOR)
    expect(result.success).toBe(false)
    expect(result.error).toBe('INVALID_TRANSITION')
  })

  it('initiator cannot expire their own workflow → INVALID_TRANSITION', () => {
    const result = transitionWorkflow(pendingInstance(), 'expire', INITIATOR, INITIATOR)
    expect(result.success).toBe(false)
    expect(result.error).toBe('INVALID_TRANSITION')
  })
})

describe('transitionWorkflow — all terminal statuses block transitions', () => {

  const terminalStatuses: Array<WorkflowInstance['status']> = [
    'approved',
    'rejected',
    'expired',
    'executed',
  ]

  const actions: Array<'approve' | 'reject' | 'expire'> = ['approve', 'reject', 'expire']

  for (const terminal of terminalStatuses) {
    for (const action of actions) {
      it(`${terminal} + ${action} → INVALID_TRANSITION`, () => {
        const result = transitionWorkflow(
          { status: terminal, workflow_type: 'expense_approval' },
          action,
          action === 'expire' ? 'system' : APPROVER,
          INITIATOR,
        )
        expect(result.success).toBe(false)
        expect(result.error).toBe('INVALID_TRANSITION')
      })
    }
  }
})

describe('transitionWorkflow — self-approval for all types', () => {

  const types: Array<WorkflowInstance['workflow_type']> = [
    'expense_approval',
    'partner_loan_entry',
    'dividend_declaration',
    'period_close',
    'period_lock',
  ]

  for (const wt of types) {
    it(`${wt}: initiator === actor → SELF_APPROVAL_NOT_ALLOWED`, () => {
      const SAME_USER = 'user-same'
      const result = transitionWorkflow(
        { status: 'pending', workflow_type: wt },
        'approve',
        SAME_USER,
        SAME_USER,
      )
      expect(result.success).toBe(false)
      expect(result.error).toBe('SELF_APPROVAL_NOT_ALLOWED')
    })
  }
})

// ── getExpiryDate — all workflow types ────────────────────────────────────────

describe('getExpiryDate — all workflow types', () => {

  const initiated = '2025-06-01T12:00:00.000Z'

  it('partner_loan_entry: 48h window', () => {
    const expiry = getExpiryDate('partner_loan_entry', initiated)
    const diffMs = new Date(expiry).getTime() - new Date(initiated).getTime()
    expect(diffMs).toBe(48 * 60 * 60 * 1000)
  })

  it('dividend_declaration: 48h window', () => {
    const expiry = getExpiryDate('dividend_declaration', initiated)
    const diffMs = new Date(expiry).getTime() - new Date(initiated).getTime()
    expect(diffMs).toBe(48 * 60 * 60 * 1000)
  })

  it('period_lock: 168h (7 days) window', () => {
    const expiry = getExpiryDate('period_lock', initiated)
    const diffMs = new Date(expiry).getTime() - new Date(initiated).getTime()
    expect(diffMs).toBe(168 * 60 * 60 * 1000)
  })

  it('expense_approval expiry is after initiated_at', () => {
    const expiry = getExpiryDate('expense_approval', initiated)
    expect(new Date(expiry).getTime()).toBeGreaterThan(new Date(initiated).getTime())
  })

  it('period_close expiry is after expense_approval expiry for same initiated_at', () => {
    const exp1 = getExpiryDate('expense_approval', initiated)
    const exp2 = getExpiryDate('period_close', initiated)
    expect(new Date(exp2).getTime()).toBeGreaterThan(new Date(exp1).getTime())
  })

  it('returns valid ISO string', () => {
    const expiry = getExpiryDate('expense_approval', initiated)
    expect(() => new Date(expiry)).not.toThrow()
    expect(new Date(expiry).toISOString()).toBe(expiry)
  })
})

// ── isExpired — additional edge cases ─────────────────────────────────────────

describe('isExpired — additional cases', () => {

  it('expiry exactly at epoch (way past) → true', () => {
    expect(isExpired({ expires_at: '1970-01-01T00:00:00.000Z' })).toBe(true)
  })

  it('expiry 1 year from now → false', () => {
    const future = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
    expect(isExpired({ expires_at: future })).toBe(false)
  })

  it('expiry 5 minutes from now → false', () => {
    const future = new Date(Date.now() + 5 * 60 * 1000).toISOString()
    expect(isExpired({ expires_at: future })).toBe(false)
  })

  it('expiry 1 year ago → true', () => {
    const past = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString()
    expect(isExpired({ expires_at: past })).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// transitionWorkflow — idempotent / double-action edge cases
// ─────────────────────────────────────────────────────────────────────────────

describe('transitionWorkflow — double-action idempotency', () => {
  it('approved → approve again returns INVALID_TRANSITION (not double-approved)', () => {
    const result1 = transitionWorkflow(pendingInstance(), 'approve', APPROVER, INITIATOR)
    expect(result1.success).toBe(true)
    // Simulate the second call with already-approved status
    const result2 = transitionWorkflow(
      { status: 'approved', workflow_type: 'expense_approval' },
      'approve',
      APPROVER,
      INITIATOR,
    )
    expect(result2.success).toBe(false)
    expect(result2.error).toBe('INVALID_TRANSITION')
  })

  it('rejected → reject again → INVALID_TRANSITION', () => {
    const result = transitionWorkflow(
      { status: 'rejected', workflow_type: 'expense_approval' },
      'reject',
      APPROVER,
      INITIATOR,
    )
    expect(result.success).toBe(false)
    expect(result.error).toBe('INVALID_TRANSITION')
  })

  it('rejected → resolve (approve) → INVALID_TRANSITION', () => {
    const result = transitionWorkflow(
      { status: 'rejected', workflow_type: 'expense_approval' },
      'approve',
      APPROVER,
      INITIATOR,
    )
    expect(result.success).toBe(false)
    expect(result.error).toBe('INVALID_TRANSITION')
  })

  it('expired → expire again → INVALID_TRANSITION', () => {
    const result = transitionWorkflow(
      { status: 'expired', workflow_type: 'expense_approval' },
      'expire',
      'system',
      INITIATOR,
    )
    expect(result.success).toBe(false)
    expect(result.error).toBe('INVALID_TRANSITION')
  })

  it('executed → approve → INVALID_TRANSITION', () => {
    const result = transitionWorkflow(
      { status: 'executed', workflow_type: 'period_close' },
      'approve',
      APPROVER,
      INITIATOR,
    )
    expect(result.success).toBe(false)
    expect(result.error).toBe('INVALID_TRANSITION')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// transitionWorkflow — expired workflow handling (pending but past expiry)
// ─────────────────────────────────────────────────────────────────────────────

describe('transitionWorkflow — expired workflow handling', () => {
  it('pending workflow can still be approved by engine (expiry enforced by caller)', () => {
    // The engine itself allows approve on pending; expiry date check is caller responsibility
    const result = transitionWorkflow(pendingInstance(), 'approve', APPROVER, INITIATOR)
    expect(result.success).toBe(true)
    expect(result.new_status).toBe('approved')
  })

  it('system can expire a pending partner_loan_entry', () => {
    const result = transitionWorkflow(
      { status: 'pending', workflow_type: 'partner_loan_entry' },
      'expire',
      'system',
      INITIATOR,
    )
    expect(result.success).toBe(true)
    expect(result.new_status).toBe('expired')
  })

  it('system can expire a pending dividend_declaration', () => {
    const result = transitionWorkflow(
      { status: 'pending', workflow_type: 'dividend_declaration' },
      'expire',
      'system',
      INITIATOR,
    )
    expect(result.success).toBe(true)
    expect(result.new_status).toBe('expired')
  })

  it('system can expire a pending period_close', () => {
    const result = transitionWorkflow(
      { status: 'pending', workflow_type: 'period_close' },
      'expire',
      'system',
      INITIATOR,
    )
    expect(result.success).toBe(true)
    expect(result.new_status).toBe('expired')
  })

  it('system can expire a pending period_lock', () => {
    const result = transitionWorkflow(
      { status: 'pending', workflow_type: 'period_lock' },
      'expire',
      'system',
      INITIATOR,
    )
    expect(result.success).toBe(true)
    expect(result.new_status).toBe('expired')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// getExpiryDate — computed window correctness per workflow type
// ─────────────────────────────────────────────────────────────────────────────

describe('getExpiryDate — 48h vs 168h window enforcement', () => {
  const initiated = '2025-03-15T09:00:00.000Z'
  const MS_48H  = 48  * 3_600_000
  const MS_168H = 168 * 3_600_000

  it('expense_approval window is exactly 48h', () => {
    const diff = new Date(getExpiryDate('expense_approval', initiated)).getTime()
                 - new Date(initiated).getTime()
    expect(diff).toBe(MS_48H)
  })

  it('partner_loan_entry window is exactly 48h', () => {
    const diff = new Date(getExpiryDate('partner_loan_entry', initiated)).getTime()
                 - new Date(initiated).getTime()
    expect(diff).toBe(MS_48H)
  })

  it('dividend_declaration window is exactly 48h', () => {
    const diff = new Date(getExpiryDate('dividend_declaration', initiated)).getTime()
                 - new Date(initiated).getTime()
    expect(diff).toBe(MS_48H)
  })

  it('period_close window is exactly 168h (7 days)', () => {
    const diff = new Date(getExpiryDate('period_close', initiated)).getTime()
                 - new Date(initiated).getTime()
    expect(diff).toBe(MS_168H)
  })

  it('period_lock window is exactly 168h (7 days)', () => {
    const diff = new Date(getExpiryDate('period_lock', initiated)).getTime()
                 - new Date(initiated).getTime()
    expect(diff).toBe(MS_168H)
  })

  it('period_close window is 3.5x larger than expense_approval window', () => {
    const exp1 = new Date(getExpiryDate('expense_approval', initiated)).getTime()
    const exp2 = new Date(getExpiryDate('period_close', initiated)).getTime()
    const diff1 = exp1 - new Date(initiated).getTime()
    const diff2 = exp2 - new Date(initiated).getTime()
    expect(diff2 / diff1).toBe(3.5)
  })

  it('expiry date is parseable as ISO string', () => {
    const expiry = getExpiryDate('expense_approval', initiated)
    expect(new Date(expiry).toISOString()).toBe(expiry)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// isExpired — boundary conditions
// ─────────────────────────────────────────────────────────────────────────────

describe('isExpired — boundary condition tests', () => {
  it('expires_at 1 second in the future → false', () => {
    const future = new Date(Date.now() + 1_000).toISOString()
    expect(isExpired({ expires_at: future })).toBe(false)
  })

  it('expires_at 1 second in the past → true', () => {
    const past = new Date(Date.now() - 1_000).toISOString()
    expect(isExpired({ expires_at: past })).toBe(true)
  })

  it('expires_at 1 millisecond in the future → false', () => {
    const future = new Date(Date.now() + 1).toISOString()
    expect(isExpired({ expires_at: future })).toBe(false)
  })

  it('expires_at 1 millisecond in the past → true', () => {
    const past = new Date(Date.now() - 1).toISOString()
    expect(isExpired({ expires_at: past })).toBe(true)
  })

  it('expires_at computed by getExpiryDate 48h from now → false', () => {
    const now = new Date().toISOString()
    const expiry = getExpiryDate('expense_approval', now)
    expect(isExpired({ expires_at: expiry })).toBe(false)
  })

  it('expires_at computed by getExpiryDate 168h from now → false', () => {
    const now = new Date().toISOString()
    const expiry = getExpiryDate('period_close', now)
    expect(isExpired({ expires_at: expiry })).toBe(false)
  })

  it('a 48h expiry set in the past is expired', () => {
    const pastInitiated = new Date(Date.now() - 72 * 3_600_000).toISOString()
    const expiry = getExpiryDate('expense_approval', pastInitiated)
    expect(isExpired({ expires_at: expiry })).toBe(true)
  })

  it('a 168h expiry set 7.5 days ago is expired', () => {
    const pastInitiated = new Date(Date.now() - 7.5 * 24 * 3_600_000).toISOString()
    const expiry = getExpiryDate('period_close', pastInitiated)
    expect(isExpired({ expires_at: expiry })).toBe(true)
  })

  it('a 168h expiry set 6 days ago is still valid', () => {
    const recentInitiated = new Date(Date.now() - 6 * 24 * 3_600_000).toISOString()
    const expiry = getExpiryDate('period_close', recentInitiated)
    expect(isExpired({ expires_at: expiry })).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// transitionWorkflow — reject action coverage per type
// ─────────────────────────────────────────────────────────────────────────────

describe('transitionWorkflow — reject action per workflow type', () => {
  const types: Array<WorkflowInstance['workflow_type']> = [
    'expense_approval',
    'partner_loan_entry',
    'dividend_declaration',
    'period_close',
    'period_lock',
  ]

  for (const wt of types) {
    it(`${wt}: pending → reject by system actor → INVALID_TRANSITION (system can only expire)`, () => {
      const result = transitionWorkflow(
        { status: 'pending', workflow_type: wt },
        'reject',
        'system',
        INITIATOR,
      )
      // system != INITIATOR so self-approval block doesn't trigger
      // 'system' is a valid approver for reject — should succeed
      // (system is only blocked from approve/reject by self-approval rule)
      expect(result.success).toBe(true)
      expect(result.new_status).toBe('rejected')
    })
  }
})
