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

  it('returns [] for two rows on same day with different types and no vendor', () => {
    const rows = [
      mkRow({ expense_date: '2025-01-05', amount_try: 500, expense_type: 'rent' }),
      mkRow({ expense_date: '2025-01-05', amount_try: 500, expense_type: 'utilities' }),
    ]
    expect(detectDuplicates(rows)).toEqual([])
  })

  it('returns [] for very large set of rows all with different amounts', () => {
    const rows = Array.from({ length: 20 }, (_, i) =>
      mkRow({ expense_date: '2025-01-01', amount_try: i * 100 + 1 })
    )
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

  it('HIGH: 1-day gap', () => {
    const rows = [
      mkRow({ expense_date: '2025-07-10', amount_try: 1_200, expense_type: 'logistics' }),
      mkRow({ expense_date: '2025-07-11', amount_try: 1_200, expense_type: 'logistics' }),
    ]
    const result = detectDuplicates(rows)
    expect(result).toHaveLength(1)
    expect(result[0].confidence).toBe('high')
  })

  it('HIGH: 6-day gap (still within 7)', () => {
    const rows = [
      mkRow({ expense_date: '2025-07-01', amount_try: 4_500, expense_type: 'consulting' }),
      mkRow({ expense_date: '2025-07-07', amount_try: 4_500, expense_type: 'consulting' }),
    ]
    const result = detectDuplicates(rows)
    expect(result).toHaveLength(1)
    expect(result[0].confidence).toBe('high')
  })

  it('HIGH: expense_type stored in DuplicateGroup matches original type', () => {
    const rows = [
      mkRow({ expense_date: '2025-08-01', amount_try: 900, expense_type: 'travel' }),
      mkRow({ expense_date: '2025-08-02', amount_try: 900, expense_type: 'travel' }),
    ]
    const result = detectDuplicates(rows)
    expect(result[0].expense_type).toBe('travel')
  })

  it('HIGH: reason string mentions expense type', () => {
    const rows = [
      mkRow({ expense_date: '2025-09-01', amount_try: 600, expense_type: 'insurance' }),
      mkRow({ expense_date: '2025-09-03', amount_try: 600, expense_type: 'insurance' }),
    ]
    const result = detectDuplicates(rows)
    expect(result[0].reason).toContain('insurance')
  })

  it('HIGH: message is a non-empty string', () => {
    const rows = [
      mkRow({ expense_date: '2025-10-01', amount_try: 300, expense_type: 'fuel' }),
      mkRow({ expense_date: '2025-10-02', amount_try: 300, expense_type: 'fuel' }),
    ]
    const result = detectDuplicates(rows)
    expect(typeof result[0].message).toBe('string')
    expect(result[0].message.length).toBeGreaterThan(0)
  })

  it('amount tolerance: rows differing by < 0.01 treated as same amount', () => {
    const rows = [
      mkRow({ expense_date: '2025-11-01', amount_try: 1000.004, expense_type: 'other' }),
      mkRow({ expense_date: '2025-11-02', amount_try: 1000.009, expense_type: 'other' }),
    ]
    // diff = 0.005 < 0.01 → should match
    const result = detectDuplicates(rows)
    expect(result).toHaveLength(1)
    expect(result[0].confidence).toBe('high')
  })

  it('amount tolerance: rows differing by 0.05 treated as different', () => {
    const rows = [
      mkRow({ expense_date: '2025-11-01', amount_try: 1000.00, expense_type: 'other' }),
      mkRow({ expense_date: '2025-11-02', amount_try: 1000.05, expense_type: 'other' }),
    ]
    // diff = 0.05 — threshold is < 0.01, so 0.05 is NOT a match
    const result = detectDuplicates(rows)
    expect(result).toHaveLength(0)
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

  it('MEDIUM: only one row has vendor_name — no match', () => {
    const rows = [
      mkRow({ expense_date: '2025-10-01', amount_try: 2_000, vendor_name: 'VendorX', expense_type: 'general' }),
      mkRow({ expense_date: '2025-10-05', amount_try: 2_000, vendor_name: null,      expense_type: 'logistics' }),
    ]
    expect(detectDuplicates(rows)).toEqual([])
  })

  it('MEDIUM: reason string contains vendor name', () => {
    const rows = [
      mkRow({ expense_date: '2025-11-01', amount_try: 1_100, vendor_name: 'GlobalSupply', expense_type: 'other' }),
      mkRow({ expense_date: '2025-11-08', amount_try: 1_100, vendor_name: 'GlobalSupply', expense_type: 'general' }),
    ]
    const result = detectDuplicates(rows)
    expect(result[0].reason).toContain('GlobalSupply')
  })

  it('MEDIUM: both rows appear in the group', () => {
    const a = mkRow({ expense_date: '2025-12-01', amount_try: 800, vendor_name: 'FastShip', expense_type: 'shipping' })
    const b = mkRow({ expense_date: '2025-12-10', amount_try: 800, vendor_name: 'FastShip', expense_type: 'shipping' })
    const result = detectDuplicates([a, b])
    const rowIds = result[0].rows.map(r => r.id).sort()
    expect(rowIds).toEqual([a.id, b.id].sort())
  })

  it('MEDIUM: 13-day gap still qualifies', () => {
    const rows = [
      mkRow({ expense_date: '2026-01-01', amount_try: 5_000, vendor_name: 'SubCo', expense_type: 'services' }),
      mkRow({ expense_date: '2026-01-14', amount_try: 5_000, vendor_name: 'SubCo', expense_type: 'services' }),
    ]
    const result = detectDuplicates(rows)
    expect(result).toHaveLength(1)
    expect(result[0].confidence).toBe('medium')
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

  it('same type + same vendor + ≤7 days → 1 group only (no double counting)', () => {
    const rows = [
      mkRow({ expense_date: '2025-11-05', amount_try: 3_500, expense_type: 'marketing', vendor_name: 'AdAgency' }),
      mkRow({ expense_date: '2025-11-06', amount_try: 3_500, expense_type: 'marketing', vendor_name: 'adagency' }),
    ]
    const result = detectDuplicates(rows)
    expect(result).toHaveLength(1)
    // HIGH because same type
    expect(result[0].confidence).toBe('high')
  })

  it('pair seen key prevents MEDIUM from re-adding pair already counted as HIGH', () => {
    const rows = [
      mkRow({ expense_date: '2025-12-01', amount_try: 1_000, expense_type: 'rent', vendor_name: 'PropCo' }),
      mkRow({ expense_date: '2025-12-04', amount_try: 1_000, expense_type: 'rent', vendor_name: 'PropCo' }),
    ]
    const result = detectDuplicates(rows)
    // Only one group despite satisfying both HIGH and MEDIUM
    const ids = result.map(r => r.rows.map(x => x.id).sort().join('_'))
    const uniqueIds = new Set(ids)
    expect(uniqueIds.size).toBe(result.length)
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

  it('multiple HIGH groups are sorted by amount descending', () => {
    const rows = [
      mkRow({ expense_date: '2026-01-01', amount_try: 200, expense_type: 'fuel' }),
      mkRow({ expense_date: '2026-01-02', amount_try: 200, expense_type: 'fuel' }),
      mkRow({ expense_date: '2026-01-01', amount_try: 1_500, expense_type: 'rent' }),
      mkRow({ expense_date: '2026-01-03', amount_try: 1_500, expense_type: 'rent' }),
      mkRow({ expense_date: '2026-01-01', amount_try: 800, expense_type: 'travel' }),
      mkRow({ expense_date: '2026-01-04', amount_try: 800, expense_type: 'travel' }),
    ]
    const result = detectDuplicates(rows)
    const highGroups = result.filter(r => r.confidence === 'high')
    for (let i = 0; i < highGroups.length - 1; i++) {
      expect(highGroups[i].amount_try).toBeGreaterThanOrEqual(highGroups[i + 1].amount_try)
    }
  })

  it('all MEDIUM groups come after all HIGH groups', () => {
    const rows = [
      mkRow({ expense_date: '2026-02-01', amount_try: 50, expense_type: 'other' }),
      mkRow({ expense_date: '2026-02-02', amount_try: 50, expense_type: 'other' }),
      mkRow({ expense_date: '2026-02-01', amount_try: 50, vendor_name: 'VX', expense_type: 'general' }),
      mkRow({ expense_date: '2026-02-09', amount_try: 50, vendor_name: 'VX', expense_type: 'logistics' }),
    ]
    const result = detectDuplicates(rows)
    let sawMedium = false
    for (const g of result) {
      if (g.confidence === 'medium') sawMedium = true
      if (sawMedium) expect(g.confidence).toBe('medium')
    }
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

  it('four identical rows produce 6 unique pairs', () => {
    const rows = Array.from({ length: 4 }, (_, i) =>
      mkRow({ expense_date: `2026-02-0${i + 1}`, amount_try: 1_000, expense_type: 'salary' })
    )
    const result = detectDuplicates(rows)
    expect(result).toHaveLength(6) // C(4,2) = 6
    const pairKeys = result.map(g => g.rows.map(r => r.id).sort().join('_'))
    expect(new Set(pairKeys).size).toBe(6)
  })

  it('no pair key appears twice across the full result', () => {
    const rows = [
      mkRow({ expense_date: '2026-03-01', amount_try: 750, expense_type: 'marketing' }),
      mkRow({ expense_date: '2026-03-02', amount_try: 750, expense_type: 'marketing' }),
      mkRow({ expense_date: '2026-03-03', amount_try: 750, expense_type: 'marketing' }),
      mkRow({ expense_date: '2026-03-04', amount_try: 750, expense_type: 'marketing' }),
    ]
    const result = detectDuplicates(rows)
    const pairKeys = result.map(g => g.rows.map(r => r.id).sort().join('_'))
    expect(new Set(pairKeys).size).toBe(pairKeys.length)
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

  it('confidence is either "high" or "medium" — never other values', () => {
    const rows = [
      mkRow({ expense_date: '2026-04-01', amount_try: 999, expense_type: 'rent' }),
      mkRow({ expense_date: '2026-04-03', amount_try: 999, expense_type: 'rent' }),
    ]
    const result = detectDuplicates(rows)
    for (const g of result) {
      expect(['high', 'medium']).toContain(g.confidence)
    }
  })

  it('each group contains exactly 2 rows (pair)', () => {
    const rows = [
      mkRow({ expense_date: '2026-05-01', amount_try: 600, expense_type: 'fuel' }),
      mkRow({ expense_date: '2026-05-02', amount_try: 600, expense_type: 'fuel' }),
    ]
    const result = detectDuplicates(rows)
    expect(result[0].rows).toHaveLength(2)
  })

  it('vendor_name in row matches original value (null preserved)', () => {
    const rows = [
      mkRow({ expense_date: '2026-05-10', amount_try: 400, expense_type: 'general', vendor_name: null }),
      mkRow({ expense_date: '2026-05-11', amount_try: 400, expense_type: 'general', vendor_name: null }),
    ]
    const result = detectDuplicates(rows)
    for (const r of result[0].rows) {
      expect(r.vendor_name).toBeNull()
    }
  })

  it('vendor_name in row matches original string value', () => {
    const rows = [
      mkRow({ expense_date: '2026-05-20', amount_try: 350, expense_type: 'services', vendor_name: 'PartnerLtd' }),
      mkRow({ expense_date: '2026-05-21', amount_try: 350, expense_type: 'services', vendor_name: 'PartnerLtd' }),
    ]
    const result = detectDuplicates(rows)
    expect(result[0].rows[0].vendor_name).toBe('PartnerLtd')
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

  it('same type + different amount → no duplicate regardless of date', () => {
    const rows = [
      mkRow({ expense_date: '2026-02-01', amount_try: 1_000, expense_type: 'rent' }),
      mkRow({ expense_date: '2026-02-01', amount_try: 1_001, expense_type: 'rent' }),
    ]
    expect(detectDuplicates(rows)).toEqual([])
  })

  it('zero-amount rows with same type and date → reported as HIGH (0 == 0, diff < 0.01)', () => {
    const rows = [
      mkRow({ expense_date: '2026-02-05', amount_try: 0, expense_type: 'other' }),
      mkRow({ expense_date: '2026-02-05', amount_try: 0, expense_type: 'other' }),
    ]
    // Implementation: |0 - 0| = 0 < 0.01 → amount match; same type, same day → HIGH
    const result = detectDuplicates(rows)
    expect(result).toHaveLength(1)
    expect(result[0].confidence).toBe('high')
  })

  it('large realistic dataset — no pair beyond 14-day window is reported', () => {
    const base = '2026-03-01'
    const rows = [
      // Pair 1: same type, 2 days → HIGH
      mkRow({ expense_date: '2026-03-01', amount_try: 2_000, expense_type: 'rent' }),
      mkRow({ expense_date: '2026-03-03', amount_try: 2_000, expense_type: 'rent' }),
      // Pair 2: same vendor, 12 days → MEDIUM
      mkRow({ expense_date: '2026-03-01', amount_try: 500, vendor_name: 'PrintCo', expense_type: 'general' }),
      mkRow({ expense_date: '2026-03-13', amount_try: 500, vendor_name: 'PrintCo', expense_type: 'general' }),
      // Noise: 30 days apart — should NOT match
      mkRow({ expense_date: '2026-03-01', amount_try: 3_000, expense_type: 'salary' }),
      mkRow({ expense_date: '2026-03-31', amount_try: 3_000, expense_type: 'salary' }),
    ]
    const result = detectDuplicates(rows)
    // Only the 2 valid pairs should be reported
    expect(result).toHaveLength(2)
    for (const g of result) {
      const dates = g.rows.map(r => new Date(r.expense_date).getTime())
      const daysDiff = Math.abs(dates[0] - dates[1]) / 86_400_000
      expect(daysDiff).toBeLessThanOrEqual(14)
    }
    void base
  })
})
