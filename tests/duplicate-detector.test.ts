/**
 * Tests for lib/engines/duplicate-detector.ts — detectDuplicates()
 *
 * Rule-based duplicate expense detection:
 *   HIGH:   same expense_type + same amount + ≤7 days
 *   MEDIUM: same vendor_name  + same amount + ≤14 days
 *
 * Pure function — no DB, no I/O.
 * Run with: npx vitest run tests/duplicate-detector.test.ts
 */
import { describe, it, expect } from 'vitest'
import { detectDuplicates, type ExpenseRow } from '../lib/engines/duplicate-detector'

// ── Helper ─────────────────────────────────────────────────────────────────

let _id = 0
function mkRow(overrides: Partial<ExpenseRow> & Pick<ExpenseRow, 'expense_date' | 'amount_try'>): ExpenseRow {
  _id++
  return {
    id:           `row-${_id}`,
    expense_type: 'general',
    vendor_name:  null,
    description:  null,
    ...overrides,
  }
}

// ── Empty / single-row cases ───────────────────────────────────────────────

describe('detectDuplicates — empty and single-row inputs', () => {
  it('returns [] for empty array', () => {
    expect(detectDuplicates([])).toEqual([])
  })

  it('returns [] for single row (cannot form a pair)', () => {
    const rows = [mkRow({ expense_date: '2025-01-01', amount_try: 1_000 })]
    expect(detectDuplicates(rows)).toEqual([])
  })

  it('returns [] for two rows with different amounts', () => {
    const rows = [
      mkRow({ expense_date: '2025-01-01', amount_try: 1_000 }),
      mkRow({ expense_date: '2025-01-02', amount_try: 2_000 }),
    ]
    expect(detectDuplicates(rows)).toEqual([])
  })
})

// ── HIGH confidence: same type + same amount + ≤7 days ───────────────────

describe('detectDuplicates — HIGH confidence (same type + same amount + ≤7 days)', () => {
  it('detects HIGH duplicate: same day', () => {
    const rows = [
      mkRow({ expense_date: '2025-03-01', amount_try: 5_000, expense_type: 'rent' }),
      mkRow({ expense_date: '2025-03-01', amount_try: 5_000, expense_type: 'rent' }),
    ]
    const result = detectDuplicates(rows)
    expect(result).toHaveLength(1)
    expect(result[0].confidence).toBe('high')
  })

  it('detects HIGH duplicate: 7-day gap (boundary)', () => {
    const rows = [
      mkRow({ expense_date: '2025-03-01', amount_try: 3_000, expense_type: 'software' }),
      mkRow({ expense_date: '2025-03-08', amount_try: 3_000, expense_type: 'software' }),
    ]
    const result = detectDuplicates(rows)
    expect(result).toHaveLength(1)
    expect(result[0].confidence).toBe('high')
  })

  it('no HIGH duplicate at 8-day gap (just outside window)', () => {
    const rows = [
      mkRow({ expense_date: '2025-03-01', amount_try: 3_000, expense_type: 'software' }),
      mkRow({ expense_date: '2025-03-09', amount_try: 3_000, expense_type: 'software' }),
    ]
    // 8 days apart, same type → no HIGH; check for MEDIUM (no vendor → none)
    const result = detectDuplicates(rows)
    expect(result.every(r => r.confidence !== 'high')).toBe(true)
  })

  it('HIGH confidence group has both rows', () => {
    const a = mkRow({ expense_date: '2025-04-10', amount_try: 1_500, expense_type: 'marketing' })
    const b = mkRow({ expense_date: '2025-04-12', amount_try: 1_500, expense_type: 'marketing' })
    const result = detectDuplicates([a, b])
    expect(result[0].rows).toHaveLength(2)
    const ids = result[0].rows.map(r => r.id).sort()
    expect(ids).toEqual([a.id, b.id].sort())
  })

  it('HIGH confidence: amount_try field matches group amount', () => {
    const rows = [
      mkRow({ expense_date: '2025-05-01', amount_try: 7_777, expense_type: 'salary' }),
      mkRow({ expense_date: '2025-05-02', amount_try: 7_777, expense_type: 'salary' }),
    ]
    const result = detectDuplicates(rows)
    expect(result[0].amount_try).toBe(7_777)
  })

  it('different expense_type — no HIGH even within 7 days', () => {
    const rows = [
      mkRow({ expense_date: '2025-06-01', amount_try: 2_000, expense_type: 'rent' }),
      mkRow({ expense_date: '2025-06-02', amount_try: 2_000, expense_type: 'utilities' }),
    ]
    // Different types → not HIGH; no vendor → not MEDIUM
    expect(detectDuplicates(rows)).toEqual([])
  })
})

// ── MEDIUM confidence: same vendor + same amount + ≤14 days ──────────────

describe('detectDuplicates — MEDIUM confidence (same vendor + same amount + ≤14 days)', () => {
  it('detects MEDIUM duplicate: same vendor within 14 days', () => {
    const rows = [
      mkRow({ expense_date: '2025-07-01', amount_try: 4_000, vendor_name: 'Acme Ltd', expense_type: 'general' }),
      mkRow({ expense_date: '2025-07-10', amount_try: 4_000, vendor_name: 'Acme Ltd', expense_type: 'logistics' }),
    ]
    const result = detectDuplicates(rows)
    expect(result).toHaveLength(1)
    expect(result[0].confidence).toBe('medium')
  })

  it('MEDIUM: 14-day gap (boundary)', () => {
    const rows = [
      mkRow({ expense_date: '2025-07-01', amount_try: 2_500, vendor_name: 'BetaCo', expense_type: 'other' }),
      mkRow({ expense_date: '2025-07-15', amount_try: 2_500, vendor_name: 'BetaCo', expense_type: 'other' }),
    ]
    const result = detectDuplicates(rows)
    expect(result).toHaveLength(1)
    expect(result[0].confidence).toBe('medium')
  })

  it('no MEDIUM at 15-day gap (just outside window)', () => {
    const rows = [
      mkRow({ expense_date: '2025-07-01', amount_try: 2_500, vendor_name: 'BetaCo', expense_type: 'other' }),
      mkRow({ expense_date: '2025-07-16', amount_try: 2_500, vendor_name: 'BetaCo', expense_type: 'other' }),
    ]
    expect(detectDuplicates(rows)).toEqual([])
  })

  it('MEDIUM: vendor comparison is case-insensitive', () => {
    const rows = [
      mkRow({ expense_date: '2025-08-01', amount_try: 1_800, vendor_name: 'acme ltd', expense_type: 'software' }),
      mkRow({ expense_date: '2025-08-05', amount_try: 1_800, vendor_name: 'ACME LTD', expense_type: 'marketing' }),
    ]
    const result = detectDuplicates(rows)
    expect(result).toHaveLength(1)
    expect(result[0].confidence).toBe('medium')
  })

  it('MEDIUM: vendor comparison trims whitespace', () => {
    const rows = [
      mkRow({ expense_date: '2025-08-01', amount_try: 900, vendor_name: '  Gamma Inc  ', expense_type: 'other' }),
      mkRow({ expense_date: '2025-08-03', amount_try: 900, vendor_name: 'Gamma Inc',     expense_type: 'general' }),
    ]
    const result = detectDuplicates(rows)
    expect(result).toHaveLength(1)
    expect(result[0].confidence).toBe('medium')
  })

  it('no MEDIUM when vendor_name is null on either row', () => {
    const rows = [
      mkRow({ expense_date: '2025-09-01', amount_try: 3_000, vendor_name: null, expense_type: 'rent' }),
      mkRow({ expense_date: '2025-09-05', amount_try: 3_000, vendor_name: null, expense_type: 'utilities' }),
    ]
    expect(detectDuplicates(rows)).toEqual([])
  })

  it('no MEDIUM when vendors differ', () => {
    // Different vendors + different expense_types (so HIGH is also excluded)
    const rows = [
      mkRow({ expense_date: '2025-09-01', amount_try: 500, vendor_name: 'SupplierA', expense_type: 'rent' }),
      mkRow({ expense_date: '2025-09-03', amount_try: 500, vendor_name: 'SupplierB', expense_type: 'utilities' }),
    ]
    expect(detectDuplicates(rows)).toEqual([])
  })
})

// ── Priority: HIGH wins over MEDIUM for same pair ────────────────────────

describe('detectDuplicates — HIGH takes priority over MEDIUM', () => {
  it('same type + same vendor + same amount + ≤7 days → only HIGH reported', () => {
    // This pair satisfies both conditions; HIGH wins because it's checked first
    const rows = [
      mkRow({ expense_date: '2025-10-01', amount_try: 6_000, expense_type: 'software', vendor_name: 'GitCo' }),
      mkRow({ expense_date: '2025-10-03', amount_try: 6_000, expense_type: 'software', vendor_name: 'GitCo' }),
    ]
    const result = detectDuplicates(rows)
    // The pair should appear once — as HIGH
    expect(result).toHaveLength(1)
    expect(result[0].confidence).toBe('high')
  })
})

// ── Sorting: HIGH first, then by amount descending ────────────────────────

describe('detectDuplicates — output sorting', () => {
  it('HIGH confidence groups come before MEDIUM', () => {
    const rows = [
      // MEDIUM pair (same vendor, different types, 10 days)
      mkRow({ expense_date: '2025-11-01', amount_try: 1_000, vendor_name: 'VendorX', expense_type: 'rent' }),
      mkRow({ expense_date: '2025-11-11', amount_try: 1_000, vendor_name: 'VendorX', expense_type: 'utilities' }),
      // HIGH pair (same type, 2 days)
      mkRow({ expense_date: '2025-11-01', amount_try: 500, expense_type: 'marketing' }),
      mkRow({ expense_date: '2025-11-03', amount_try: 500, expense_type: 'marketing' }),
    ]
    const result = detectDuplicates(rows)
    expect(result.length).toBeGreaterThanOrEqual(2)
    const highIdx  = result.findIndex(r => r.confidence === 'high')
    const medIdx   = result.findIndex(r => r.confidence === 'medium')
    expect(highIdx).toBeLessThan(medIdx)
  })

  it('within same confidence tier, higher amount comes first', () => {
    const rows = [
      // Two HIGH pairs with different amounts
      mkRow({ expense_date: '2025-12-01', amount_try: 100, expense_type: 'other' }),
      mkRow({ expense_date: '2025-12-02', amount_try: 100, expense_type: 'other' }),
      mkRow({ expense_date: '2025-12-03', amount_try: 9_000, expense_type: 'software' }),
      mkRow({ expense_date: '2025-12-04', amount_try: 9_000, expense_type: 'software' }),
    ]
    const result = detectDuplicates(rows)
    const highGroups = result.filter(r => r.confidence === 'high')
    expect(highGroups.length).toBeGreaterThanOrEqual(2)
    expect(highGroups[0].amount_try).toBeGreaterThanOrEqual(highGroups[1].amount_try)
  })
})

// ── De-duplication: a pair is only reported once ──────────────────────────

describe('detectDuplicates — each pair reported once', () => {
  it('three identical rows produce 3 pairs, each unique', () => {
    const rows = [
      mkRow({ expense_date: '2026-01-01', amount_try: 500, expense_type: 'rent' }),
      mkRow({ expense_date: '2026-01-02', amount_try: 500, expense_type: 'rent' }),
      mkRow({ expense_date: '2026-01-03', amount_try: 500, expense_type: 'rent' }),
    ]
    // 3 pairs: (0,1), (0,2), (1,2) — all within 7 days + same type
    const result = detectDuplicates(rows)
    expect(result).toHaveLength(3)
    // All unique pair keys — verify by checking row id combos
    const pairKeys = result.map(g => g.rows.map(r => r.id).sort().join('_'))
    expect(new Set(pairKeys).size).toBe(3)
  })
})

// ── Output shape ──────────────────────────────────────────────────────────

describe('detectDuplicates — output shape', () => {
  it('group has confidence, reason, amount_try, expense_type, rows, message', () => {
    const rows = [
      mkRow({ expense_date: '2026-02-01', amount_try: 2_000, expense_type: 'salary' }),
      mkRow({ expense_date: '2026-02-02', amount_try: 2_000, expense_type: 'salary' }),
    ]
    const result = detectDuplicates(rows)
    const g = result[0]
    expect(typeof g.confidence).toBe('string')
    expect(typeof g.reason).toBe('string')
    expect(typeof g.amount_try).toBe('number')
    expect(typeof g.expense_type).toBe('string')
    expect(Array.isArray(g.rows)).toBe(true)
    expect(typeof g.message).toBe('string')
    expect(g.message.length).toBeGreaterThan(0)
  })

  it('each row in group has id, expense_date, vendor_name', () => {
    const rows = [
      mkRow({ expense_date: '2026-02-10', amount_try: 800, expense_type: 'software', vendor_name: 'Jira Inc' }),
      mkRow({ expense_date: '2026-02-11', amount_try: 800, expense_type: 'software', vendor_name: 'Jira Inc' }),
    ]
    const result = detectDuplicates(rows)
    for (const r of result[0].rows) {
      expect(typeof r.id).toBe('string')
      expect(typeof r.expense_date).toBe('string')
      expect('vendor_name' in r).toBe(true)
    }
  })

  it('amount_try is rounded to 2 decimal places', () => {
    const rows = [
      mkRow({ expense_date: '2026-03-01', amount_try: 1000.1234, expense_type: 'other' }),
      mkRow({ expense_date: '2026-03-02', amount_try: 1000.1234, expense_type: 'other' }),
    ]
    const result = detectDuplicates(rows)
    expect(result[0].amount_try).toBeCloseTo(1000.12, 2)
  })
})

// ── Large gap — no false positives ────────────────────────────────────────

describe('detectDuplicates — no false positives beyond windows', () => {
  it('same type + same amount but 30 days apart → no duplicate', () => {
    const rows = [
      mkRow({ expense_date: '2026-01-01', amount_try: 5_000, expense_type: 'rent' }),
      mkRow({ expense_date: '2026-01-31', amount_try: 5_000, expense_type: 'rent' }),
    ]
    expect(detectDuplicates(rows)).toEqual([])
  })

  it('same vendor + same amount but 60 days apart → no duplicate', () => {
    const rows = [
      mkRow({ expense_date: '2026-01-01', amount_try: 1_200, vendor_name: 'SaasCo', expense_type: 'software' }),
      mkRow({ expense_date: '2026-03-01', amount_try: 1_200, vendor_name: 'SaasCo', expense_type: 'software' }),
    ]
    expect(detectDuplicates(rows)).toEqual([])
  })
})
