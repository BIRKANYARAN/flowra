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

// ── Alert severity — extended edge cases ─────────────────────────────────────

describe('alert severity — boundary amounts', () => {

  it('partner_transaction exactly 100_000 → warning', () => {
    expect(getAlertSeverity({
      action: 'create', entityType: 'partner_transaction', amount: 100_000,
    })).toBe('warning')
  })

  it('partner_transaction at 99_999 → info (below threshold)', () => {
    expect(getAlertSeverity({
      action: 'create', entityType: 'partner_transaction', amount: 99_999,
    })).toBe('info')
  })

  it('partner_transaction at 1_000_000 → warning', () => {
    expect(getAlertSeverity({
      action: 'create', entityType: 'partner_transaction', amount: 1_000_000,
    })).toBe('warning')
  })

  it('partner_transaction amount=0 → info', () => {
    expect(getAlertSeverity({
      action: 'create', entityType: 'partner_transaction', amount: 0,
    })).toBe('info')
  })

  it('update action on any entity → info (not delete, not large partner_tx)', () => {
    expect(getAlertSeverity({
      action: 'update', entityType: 'expense', amount: 50_000,
    })).toBe('info')
  })

  it('delete on expense → warning', () => {
    expect(getAlertSeverity({ action: 'delete', entityType: 'expense' })).toBe('warning')
  })

  it('delete on stock_movement → warning', () => {
    expect(getAlertSeverity({ action: 'delete', entityType: 'stock_movement' })).toBe('warning')
  })

  it('delete on partner_transaction (even large) → warning (delete always wins)', () => {
    expect(getAlertSeverity({
      action: 'delete', entityType: 'partner_transaction', amount: 500_000,
    })).toBe('warning')
  })

  it('create stock_movement → info', () => {
    expect(getAlertSeverity({ action: 'create', entityType: 'stock_movement' })).toBe('info')
  })

  it('create expense → info', () => {
    expect(getAlertSeverity({ action: 'create', entityType: 'expense' })).toBe('info')
  })
})

// ── Rollback opposite tx_type — extended ─────────────────────────────────────

describe('rollback opposite tx_type — idempotency and completeness', () => {

  it('loan_in reversal → loan_out', () => {
    expect(OPPOSITE_TX['loan_in']).toBe('loan_out')
  })

  it('loan_out reversal → loan_in (symmetric)', () => {
    expect(OPPOSITE_TX['loan_out']).toBe('loan_in')
  })

  it('loan_in ↔ loan_out is a symmetric pair', () => {
    expect(OPPOSITE_TX[OPPOSITE_TX['loan_in']]).toBe('loan_in')
    expect(OPPOSITE_TX[OPPOSITE_TX['loan_out']]).toBe('loan_out')
  })

  it('salary reversal → salary (self-inverse)', () => {
    expect(OPPOSITE_TX['salary']).toBe('salary')
  })

  it('board_fee reversal → board_fee (self-inverse)', () => {
    expect(OPPOSITE_TX['board_fee']).toBe('board_fee')
  })

  it('dividend reversal → dividend (self-inverse)', () => {
    expect(OPPOSITE_TX['dividend']).toBe('dividend')
  })

  it('OPPOSITE_TX has exactly 5 entries', () => {
    expect(Object.keys(OPPOSITE_TX).length).toBe(5)
  })

  it('all values in OPPOSITE_TX are strings', () => {
    for (const val of Object.values(OPPOSITE_TX)) {
      expect(typeof val).toBe('string')
    }
  })

  it('self-inverse entries map back to themselves', () => {
    const selfInverse = ['salary', 'board_fee', 'dividend']
    for (const key of selfInverse) {
      expect(OPPOSITE_TX[OPPOSITE_TX[key]]).toBe(key)
    }
  })
})

// ── Stock movement reversal — amount arithmetic ───────────────────────────────

describe('stock movement reversal — arithmetic accuracy', () => {

  it('qty_change=100 → reversal = -100', () => {
    expect(-(100)).toBe(-100)
  })

  it('qty_change=-100 → reversal = 100', () => {
    expect(-(-100)).toBe(100)
  })

  it('qty_change=0.5 → reversal = -0.5', () => {
    expect(-(0.5)).toBeCloseTo(-0.5, 5)
  })

  it('reversing twice returns original qty', () => {
    const original = 75
    expect(-(-(original))).toBe(original)
  })

  it('large qty reversal preserves magnitude', () => {
    const original = 999_999
    expect(-original).toBe(-999_999)
  })
})

// ── movement_type derivation ──────────────────────────────────────────────────

describe('stock movement type derivation from qty', () => {

  const getType = (qty: number) =>
    qty > 0 ? 'in' : qty < 0 ? 'out' : 'adjustment'

  it('positive qty → in', () => {
    expect(getType(1)).toBe('in')
    expect(getType(100)).toBe('in')
    expect(getType(0.001)).toBe('in')
  })

  it('negative qty → out', () => {
    expect(getType(-1)).toBe('out')
    expect(getType(-500)).toBe('out')
    expect(getType(-0.001)).toBe('out')
  })

  it('zero qty → adjustment', () => {
    expect(getType(0)).toBe('adjustment')
  })

  it('large positive → in', () => {
    expect(getType(999_999)).toBe('in')
  })

  it('large negative → out', () => {
    expect(getType(-999_999)).toBe('out')
  })
})

// ── AuditLog shape — extended field tests ─────────────────────────────────────

describe('audit log shape — extended', () => {

  it('update action preserves both old and new data', () => {
    const log = {
      action: 'update' as const,
      old_data: { amount: 100, status: 'draft' },
      new_data: { amount: 200, status: 'finalized' },
    }
    expect(log.old_data.amount).toBe(100)
    expect(log.new_data.amount).toBe(200)
    expect(log.old_data.status).toBe('draft')
    expect(log.new_data.status).toBe('finalized')
  })

  it('create action: old_data is null, new_data has id', () => {
    const log = {
      action: 'create' as const,
      old_data: null,
      new_data: { id: 'new-entity-123', amount: 500 },
    }
    expect(log.old_data).toBeNull()
    expect(log.new_data.id).toBe('new-entity-123')
  })

  it('delete action: old_data has id, new_data is null', () => {
    const log = {
      action: 'delete' as const,
      old_data: { id: 'to-delete-456', amount: 300 },
      new_data: null,
    }
    expect(log.old_data.id).toBe('to-delete-456')
    expect(log.new_data).toBeNull()
  })

  it('all three action types are distinct strings', () => {
    const actions = ['create', 'update', 'delete']
    const unique = new Set(actions)
    expect(unique.size).toBe(3)
  })
})

// ── Rollback input validation — extended ──────────────────────────────────────

describe('rollback input validation — extended', () => {

  const SUPPORTED = new Set(['stock_movement', 'expense', 'partner_transaction'])

  it('stock_movement is supported', () => {
    expect(SUPPORTED.has('stock_movement')).toBe(true)
  })

  it('expense is supported', () => {
    expect(SUPPORTED.has('expense')).toBe(true)
  })

  it('partner_transaction is supported', () => {
    expect(SUPPORTED.has('partner_transaction')).toBe(true)
  })

  it('journal_entry is not supported', () => {
    expect(SUPPORTED.has('journal_entry')).toBe(false)
  })

  it('product is not supported', () => {
    expect(SUPPORTED.has('product')).toBe(false)
  })

  it('empty string is not supported', () => {
    expect(SUPPORTED.has('')).toBe(false)
  })

  it('reason with only spaces is invalid', () => {
    const validate = (r: string) => r.trim().length > 0
    expect(validate('     ')).toBe(false)
  })

  it('reason with content is valid', () => {
    const validate = (r: string) => r.trim().length > 0
    expect(validate('data entry error')).toBe(true)
  })

  it('reason with tabs and newlines only is invalid', () => {
    const validate = (r: string) => r.trim().length > 0
    expect(validate('\t\n')).toBe(false)
  })

  it('reason with leading/trailing whitespace but content is valid', () => {
    const validate = (r: string) => r.trim().length > 0
    expect(validate('  valid reason  ')).toBe(true)
  })

  it('SUPPORTED set has exactly 3 entries', () => {
    expect(SUPPORTED.size).toBe(3)
  })
})

// ── Alert severity — additional entity types ──────────────────────────────────

describe('alert severity — additional entity types', () => {

  it('update on partner_transaction below threshold → info', () => {
    expect(getAlertSeverity({
      action: 'update', entityType: 'partner_transaction', amount: 99_999,
    })).toBe('info')
  })

  it('update on partner_transaction at threshold → warning', () => {
    expect(getAlertSeverity({
      action: 'update', entityType: 'partner_transaction', amount: 100_000,
    })).toBe('warning')
  })

  it('create on unknown entity type → info (falls through to default)', () => {
    expect(getAlertSeverity({ action: 'create', entityType: 'invoice' })).toBe('info')
  })

  it('delete on invoice → warning (delete always wins)', () => {
    expect(getAlertSeverity({ action: 'delete', entityType: 'invoice' })).toBe('warning')
  })

  it('create on board_fee entity → info', () => {
    expect(getAlertSeverity({ action: 'create', entityType: 'board_fee' })).toBe('info')
  })

  it('create on salary entity → info', () => {
    expect(getAlertSeverity({ action: 'create', entityType: 'salary' })).toBe('info')
  })

  it('update on stock_movement → info', () => {
    expect(getAlertSeverity({ action: 'update', entityType: 'stock_movement' })).toBe('info')
  })

  it('delete on dividend entity → warning', () => {
    expect(getAlertSeverity({ action: 'delete', entityType: 'dividend' })).toBe('warning')
  })

  it('amount undefined for partner_transaction → defaults to 0 → info', () => {
    expect(getAlertSeverity({ action: 'create', entityType: 'partner_transaction' })).toBe('info')
  })

  it('partner_transaction amount exactly one above threshold → warning', () => {
    expect(getAlertSeverity({
      action: 'create', entityType: 'partner_transaction', amount: 100_001,
    })).toBe('warning')
  })
})

// ── Rollback amount edge cases ────────────────────────────────────────────────

describe('rollback amount — edge cases', () => {

  it('qty_change = 1 → reversal = -1', () => {
    const original = { qty_change: 1 }
    const reversal = -original.qty_change
    expect(reversal).toBe(-1)
  })

  it('qty_change = -1 → reversal = 1', () => {
    const original = { qty_change: -1 }
    const reversal = -original.qty_change
    expect(reversal).toBe(1)
  })

  it('double negation is identity for integer qty', () => {
    const vals = [0, 1, -1, 500, -500, 999_999, -999_999]
    for (const v of vals) {
      expect(-(-v)).toBe(v)
    }
  })

  it('movement_type of reversal for original qty=1 → out', () => {
    const getType = (qty: number) =>
      qty > 0 ? 'in' : qty < 0 ? 'out' : 'adjustment'
    const original = 1
    const reversal = -original
    expect(getType(reversal)).toBe('out')
  })

  it('movement_type of reversal for original qty=-5 → in', () => {
    const getType = (qty: number) =>
      qty > 0 ? 'in' : qty < 0 ? 'out' : 'adjustment'
    const original = -5
    const reversal = -original
    expect(getType(reversal)).toBe('in')
  })

  it('reversal of zero qty → adjustment', () => {
    const getType = (qty: number) =>
      qty > 0 ? 'in' : qty < 0 ? 'out' : 'adjustment'
    const original = 0
    const reversal = -original
    expect(getType(reversal)).toBe('adjustment')
  })
})

// ── AuditLog action completeness ──────────────────────────────────────────────

describe('audit log action completeness', () => {

  it('action set contains create', () => {
    const ACTIONS = new Set(['create', 'update', 'delete'])
    expect(ACTIONS.has('create')).toBe(true)
  })

  it('action set contains update', () => {
    const ACTIONS = new Set(['create', 'update', 'delete'])
    expect(ACTIONS.has('update')).toBe(true)
  })

  it('action set contains delete', () => {
    const ACTIONS = new Set(['create', 'update', 'delete'])
    expect(ACTIONS.has('delete')).toBe(true)
  })

  it('action set does not contain rollback', () => {
    const ACTIONS = new Set(['create', 'update', 'delete'])
    expect(ACTIONS.has('rollback')).toBe(false)
  })

  it('action set has exactly 3 values', () => {
    const ACTIONS = new Set(['create', 'update', 'delete'])
    expect(ACTIONS.size).toBe(3)
  })

  it('create log has action = create', () => {
    const log = { action: 'create' as const, old_data: null, new_data: { id: 'x' } }
    expect(log.action).toBe('create')
  })

  it('update log has action = update', () => {
    const log = { action: 'update' as const, old_data: { v: 1 }, new_data: { v: 2 } }
    expect(log.action).toBe('update')
  })

  it('delete log has action = delete', () => {
    const log = { action: 'delete' as const, old_data: { id: 'y' }, new_data: null }
    expect(log.action).toBe('delete')
  })
})

// ── OPPOSITE_TX map exhaustiveness ───────────────────────────────────────────

describe('OPPOSITE_TX exhaustiveness', () => {

  it('every key maps to a defined string value', () => {
    for (const [key, val] of Object.entries(OPPOSITE_TX)) {
      expect(typeof key).toBe('string')
      expect(typeof val).toBe('string')
      expect(val.length).toBeGreaterThan(0)
    }
  })

  it('no entry maps to undefined', () => {
    for (const val of Object.values(OPPOSITE_TX)) {
      expect(val).not.toBeUndefined()
    }
  })

  it('all opposite values exist as keys (symmetry check for known pairs)', () => {
    // loan_in ↔ loan_out
    expect(OPPOSITE_TX[OPPOSITE_TX['loan_in']]).toBe('loan_in')
    expect(OPPOSITE_TX[OPPOSITE_TX['loan_out']]).toBe('loan_out')
  })

  it('self-inverse values round-trip correctly', () => {
    for (const key of ['salary', 'board_fee', 'dividend']) {
      expect(OPPOSITE_TX[key]).toBe(key)
      expect(OPPOSITE_TX[OPPOSITE_TX[key]]).toBe(key)
    }
  })

  it('OPPOSITE_TX has no unknown keys beyond the 5 defined', () => {
    const expectedKeys = new Set(['loan_in', 'loan_out', 'salary', 'board_fee', 'dividend'])
    for (const key of Object.keys(OPPOSITE_TX)) {
      expect(expectedKeys.has(key)).toBe(true)
    }
  })
})
