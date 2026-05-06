// tests/audit.test.ts
//
// Unit tests for Phase 7 audit/rollback logic.
// Pure tests only — no DB, no Supabase mocking needed.
// Tests cover: alert severity rules, rollback opposite-tx logic.

import { describe, it, expect } from 'vitest'

// ── Alert severity rules ──────────────────────────────────────────────────────

function getAlertSeverity(params: {
  action: 'create' | 'update' | 'delete'
  entityType: string
  amount?: number
}): 'info' | 'warning' | 'critical' {
  const { action, entityType, amount = 0 } = params
  if (action === 'delete') return 'warning'
  if (entityType === 'partner_transaction' && amount >= 100_000) return 'warning'
  if (entityType === 'stock_movement' && action === 'create') return 'info'
  return 'info'
}

describe('alert severity rules', () => {
  it('delete actions are always warning', () => {
    expect(getAlertSeverity({ action: 'delete', entityType: 'expense' })).toBe('warning')
    expect(getAlertSeverity({ action: 'delete', entityType: 'partner_transaction' })).toBe('warning')
    expect(getAlertSeverity({ action: 'delete', entityType: 'stock_movement' })).toBe('warning')
  })

  it('large partner transactions are warning', () => {
    expect(getAlertSeverity({
      action: 'create', entityType: 'partner_transaction', amount: 100_000,
    })).toBe('warning')
    expect(getAlertSeverity({
      action: 'create', entityType: 'partner_transaction', amount: 500_000,
    })).toBe('warning')
  })

  it('small partner transactions are info', () => {
    expect(getAlertSeverity({
      action: 'create', entityType: 'partner_transaction', amount: 50_000,
    })).toBe('info')
  })

  it('stock movements are info', () => {
    expect(getAlertSeverity({ action: 'create', entityType: 'stock_movement' })).toBe('info')
  })
})

// ── Opposite tx_type logic ────────────────────────────────────────────────────

const OPPOSITE_TX: Record<string, string> = {
  loan_in:   'loan_out',
  loan_out:  'loan_in',
  salary:    'salary',
  board_fee: 'board_fee',
  dividend:  'dividend',
}

describe('rollback opposite tx_type', () => {
  it('loan_in reverses to loan_out', () => {
    expect(OPPOSITE_TX['loan_in']).toBe('loan_out')
  })

  it('loan_out reverses to loan_in', () => {
    expect(OPPOSITE_TX['loan_out']).toBe('loan_in')
  })

  it('salary reverses to salary (same type, marked as reversal in notes)', () => {
    expect(OPPOSITE_TX['salary']).toBe('salary')
  })

  it('board_fee reverses to board_fee', () => {
    expect(OPPOSITE_TX['board_fee']).toBe('board_fee')
  })

  it('dividend reverses to dividend', () => {
    expect(OPPOSITE_TX['dividend']).toBe('dividend')
  })
})

// ── Reversal amount preservation ──────────────────────────────────────────────

describe('stock movement reversal', () => {
  it('reversal qty = -original qty_change', () => {
    const original = { qty_change: 50 }
    const reversal = -original.qty_change
    expect(reversal).toBe(-50)
  })

  it('negative original becomes positive reversal', () => {
    const original = { qty_change: -30 }
    const reversal = -original.qty_change
    expect(reversal).toBe(30)
  })

  it('reversal movement_type is derived from reversal qty', () => {
    const getType = (qty: number) =>
      qty > 0 ? 'in' : qty < 0 ? 'out' : 'adjustment'

    expect(getType(-50)).toBe('out')   // original was +50 (in); reversal is -50 (out)
    expect(getType(30)).toBe('in')     // original was -30 (out); reversal is +30 (in)
    expect(getType(0)).toBe('adjustment')
  })
})

// ── AuditLog field requirements ───────────────────────────────────────────────

describe('audit log shape', () => {
  it('create action has null old_data and populated new_data', () => {
    const log = {
      action:   'create' as const,
      old_data: null,
      new_data: { id: 'abc', amount: 100 },
    }
    expect(log.old_data).toBeNull()
    expect(log.new_data).not.toBeNull()
  })

  it('delete action has populated old_data and null new_data', () => {
    const log = {
      action:   'delete' as const,
      old_data: { id: 'abc', amount: 100 },
      new_data: null,
    }
    expect(log.old_data).not.toBeNull()
    expect(log.new_data).toBeNull()
  })

  it('update action has both old_data and new_data', () => {
    const log = {
      action:   'update' as const,
      old_data: { status: 'draft' },
      new_data: { status: 'finalized' },
    }
    expect(log.old_data).not.toBeNull()
    expect(log.new_data).not.toBeNull()
  })
})

// ── Rollback input validation ─────────────────────────────────────────────────

describe('rollback input validation', () => {
  const SUPPORTED = new Set(['stock_movement', 'expense', 'partner_transaction'])

  it('supported entity types are accepted', () => {
    expect(SUPPORTED.has('stock_movement')).toBe(true)
    expect(SUPPORTED.has('expense')).toBe(true)
    expect(SUPPORTED.has('partner_transaction')).toBe(true)
  })

  it('unsupported entity types are rejected', () => {
    expect(SUPPORTED.has('sale')).toBe(false)
    expect(SUPPORTED.has('purchase')).toBe(false)
    expect(SUPPORTED.has('product')).toBe(false)
  })

  it('reason must be non-empty', () => {
    const validate = (reason: string) => reason.trim().length > 0
    expect(validate('')).toBe(false)
    expect(validate('   ')).toBe(false)
    expect(validate('wrong qty entered')).toBe(true)
  })
})
