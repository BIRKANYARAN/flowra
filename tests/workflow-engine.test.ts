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
