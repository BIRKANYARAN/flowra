/**
 * Tests for: lib/services/export/certified-export.service.ts
 *
 * These are pure unit tests that validate the structure, checksum logic,
 * and invariants of the CertifiedExportPackage without database access.
 *
 * Run with: npx vitest run tests/certified-export.test.ts
 */

import { describe, it, expect } from 'vitest'
import { createHash } from 'crypto'
import type { CertifiedExportPackage } from '../lib/services/export/certified-export.service'
import { CertifiedExportService } from '../lib/services/export/certified-export.service'

// ── Helpers ────────────────────────────────────────────────────────────────────

function buildManifest(overrides: Partial<CertifiedExportPackage['manifest']> = {}): CertifiedExportPackage['manifest'] {
  return {
    export_id:      'test-uuid-1234',
    company_id:     'company-uuid-5678',
    company_name:   'Test Şirketi A.Ş.',
    generated_by:   'user-uuid-9999',
    generated_at:   '2026-05-26T10:00:00.000Z',
    period_from:    '2026-01-01',
    period_to:      '2026-05-26',
    sections:       ['financial_summary', 'balance_sheet', 'partner_summary', 'receivables_summary', 'corporate_actions_summary', 'governance_summary', 'raw_data'],
    record_counts:  { sales: 2, expenses: 1, partners: 2, corporate_actions: 5, open_receivables: 4 },
    checksum:       'abc123checksum',
    flowra_version: '1.0',
    disclaimer:     'Bu dışa aktarma, Test Şirketi A.Ş. adına Flowra Finansal İşletim Sistemi tarafından 26 Mayıs 2026 tarihinde oluşturulmuştur.',
    ...overrides,
  }
}

function buildPackage(overrides: Partial<CertifiedExportPackage> = {}): CertifiedExportPackage {
  return {
    manifest: buildManifest(),
    financial_summary: {
      period_label:      '2026-01-01 – 2026-05-26',
      revenue_try:       500_000,
      cogs_try:          200_000,
      gross_profit_try:  300_000,
      expenses_try:       80_000,
      net_income_try:    220_000,
      cash_try:          150_000,
    },
    balance_sheet: {
      assets: { cash_try: 150_000, total_assets_try: 500_000 },
      liabilities: { total_liabilities_try: 100_000 },
      equity: { total_equity_try: 400_000 },
    },
    partner_summary: {
      partners: [
        { partner_id: 'p1', partner_name: 'Ortak A', share_ratio_pct: 60, loan_outstanding_try: 50_000 },
        { partner_id: 'p2', partner_name: 'Ortak B', share_ratio_pct: 40, loan_outstanding_try: 20_000 },
      ],
      total_partner_debt_try: 70_000,
      total_partners: 2,
      active_partners: 2,
    },
    receivables_summary: {
      total_receivables_try:   30_000,
      overdue_receivables_try: 10_000,
      receivables_by_status:   { pending: 3, overdue: 1 },
    },
    corporate_actions_summary: {
      total_actions:    5,
      actions_by_type:  { DIVIDEND_DECLARATION: 2, CAPITAL_INCREASE: 1, OTHER: 2 },
      latest_action_date: '2026-04-15',
    },
    governance_summary: {
      open_workflows:         2,
      pending_resolutions:    1,
      audit_readiness_score:  85,
    },
    raw_data: {
      sales: [
        { id: 's1', sale_date: '2026-03-15', total_try: 50_000, payment_status: 'paid', customer_name: 'Müşteri X' },
        { id: 's2', sale_date: '2026-04-20', total_try: 30_000, payment_status: 'pending', customer_name: null },
      ],
      expenses: [
        { id: 'e1', expense_date: '2026-02-10', amount_try: 5_000, payment_status: 'paid', expense_type: 'rent' },
      ],
    },
    ...overrides,
  }
}

// ── Test suite ─────────────────────────────────────────────────────────────────

describe('CertifiedExportPackage', () => {

  // Test 1: Required manifest fields
  it('manifest has all required fields', () => {
    const pkg = buildPackage()
    const m = pkg.manifest

    expect(m).toHaveProperty('export_id')
    expect(m).toHaveProperty('company_id')
    expect(m).toHaveProperty('company_name')
    expect(m).toHaveProperty('generated_by')
    expect(m).toHaveProperty('generated_at')
    expect(m).toHaveProperty('period_from')
    expect(m).toHaveProperty('period_to')
    expect(m).toHaveProperty('sections')
    expect(m).toHaveProperty('record_counts')
    expect(m).toHaveProperty('checksum')
    expect(m).toHaveProperty('flowra_version')
    expect(m).toHaveProperty('disclaimer')

    expect(m.flowra_version).toBe('1.0')
    expect(Array.isArray(m.sections)).toBe(true)
    expect(typeof m.record_counts).toBe('object')
  })

  // Test 2: Checksum changes when data changes
  it('checksum changes when data changes', () => {
    const data1 = {
      financial_summary: { revenue_try: 100_000 },
      balance_sheet: {},
    }
    const data2 = {
      financial_summary: { revenue_try: 200_000 },
      balance_sheet: {},
    }
    const checksum1 = CertifiedExportService.computeChecksum(data1)
    const checksum2 = CertifiedExportService.computeChecksum(data2)

    expect(checksum1).not.toBe(checksum2)
  })

  // Test 3: Checksum is deterministic
  it('checksum is deterministic — same input always produces same output', () => {
    const data = {
      financial_summary: { revenue_try: 500_000, expenses_try: 80_000 },
      raw_data: { sales: [{ id: 's1', total_try: 50_000 }] },
    }
    const run1 = CertifiedExportService.computeChecksum(data)
    const run2 = CertifiedExportService.computeChecksum(data)
    const run3 = CertifiedExportService.computeChecksum(data)

    expect(run1).toBe(run2)
    expect(run2).toBe(run3)
    expect(run1).toHaveLength(64) // SHA-256 hex = 64 chars
  })

  // Test 4: Disclaimer includes company name
  it('disclaimer text includes company name', () => {
    const companyName = 'Test Şirketi A.Ş.'
    const manifest = buildManifest({
      company_name: companyName,
      disclaimer: `Bu dışa aktarma, ${companyName} adına Flowra Finansal İşletim Sistemi tarafından oluşturulmuştur.`,
    })

    expect(manifest.disclaimer).toContain(companyName)
    expect(manifest.disclaimer).toContain('Flowra')
  })

  // Test 5: Record counts match data lengths
  it('record counts match actual data array lengths', () => {
    const pkg = buildPackage()

    expect(pkg.manifest.record_counts.sales).toBe(pkg.raw_data.sales.length)
    expect(pkg.manifest.record_counts.expenses).toBe(pkg.raw_data.expenses.length)
    expect(pkg.manifest.record_counts.partners).toBe(pkg.partner_summary.partners.length)
  })

  // Test 6: period_from and period_to match requested period
  it('period_from and period_to in manifest match the requested period', () => {
    const periodFrom = '2026-01-01'
    const periodTo   = '2026-06-30'
    const pkg = buildPackage({
      manifest: buildManifest({ period_from: periodFrom, period_to: periodTo }),
    })

    expect(pkg.manifest.period_from).toBe(periodFrom)
    expect(pkg.manifest.period_to).toBe(periodTo)
  })

  // Test 7: sections list matches included data sections
  it('sections list matches what was included in the package', () => {
    const pkg = buildPackage()
    const expectedSections = [
      'financial_summary',
      'balance_sheet',
      'partner_summary',
      'receivables_summary',
      'corporate_actions_summary',
      'governance_summary',
      'raw_data',
    ]

    for (const section of expectedSections) {
      expect(pkg.manifest.sections).toContain(section)
    }
    expect(pkg.manifest.sections).toHaveLength(expectedSections.length)
  })

  // Test 8: Empty export (no data) still has valid structure
  it('empty export has valid structure with zeros and empty arrays', () => {
    const emptyPkg = buildPackage({
      financial_summary: {
        period_label:     '2026-01-01 – 2026-01-31',
        revenue_try:      0,
        cogs_try:         0,
        gross_profit_try: 0,
        expenses_try:     0,
        net_income_try:   0,
        cash_try:         0,
      },
      partner_summary: {
        partners:               [],
        total_partner_debt_try: 0,
        total_partners:         0,
        active_partners:        0,
      },
      receivables_summary: {
        total_receivables_try:   0,
        overdue_receivables_try: 0,
        receivables_by_status:   {},
      },
      corporate_actions_summary: {
        total_actions:     0,
        actions_by_type:   {},
        latest_action_date: null,
      },
      governance_summary: {
        open_workflows:        0,
        pending_resolutions:   0,
        audit_readiness_score: null,
      },
      raw_data: {
        sales:    [],
        expenses: [],
      },
    })

    // Structure is valid even with empty data
    expect(emptyPkg.manifest).toBeTruthy()
    expect(emptyPkg.manifest.flowra_version).toBe('1.0')
    expect(emptyPkg.raw_data.sales).toEqual([])
    expect(emptyPkg.raw_data.expenses).toEqual([])
    expect(emptyPkg.partner_summary.partners).toEqual([])
    expect(emptyPkg.financial_summary.revenue_try).toBe(0)
    expect(emptyPkg.corporate_actions_summary.latest_action_date).toBeNull()
    expect(emptyPkg.governance_summary.audit_readiness_score).toBeNull()
  })

  // Bonus test: computeChecksum uses SHA-256
  it('computeChecksum produces a valid SHA-256 hex string', () => {
    const data = { test: 'value', num: 42 }
    const result = CertifiedExportService.computeChecksum(data)

    // Independently compute expected value
    const expected = createHash('sha256').update(JSON.stringify(data)).digest('hex')
    expect(result).toBe(expected)
    expect(result).toMatch(/^[a-f0-9]{64}$/)
  })
})

// ── CertifiedExportService.computeChecksum ─────────────────────────────────────

describe('CertifiedExportService.computeChecksum — edge cases', () => {

  it('empty object produces a valid 64-char hex string', () => {
    const result = CertifiedExportService.computeChecksum({})
    expect(result).toMatch(/^[a-f0-9]{64}$/)
  })

  it('two different objects always produce different checksums', () => {
    const a = CertifiedExportService.computeChecksum({ revenue: 100_000 })
    const b = CertifiedExportService.computeChecksum({ revenue: 100_001 })
    expect(a).not.toBe(b)
  })

  it('key order matters — different key order may produce different result', () => {
    const obj1 = { a: 1, b: 2 }
    const obj2 = { b: 2, a: 1 }
    // JSON.stringify preserves insertion order — so this may differ
    // We just confirm the function is stable for each input
    const c1 = CertifiedExportService.computeChecksum(obj1)
    const c2 = CertifiedExportService.computeChecksum(obj1)
    expect(c1).toBe(c2)  // same object → always same
    // Note: c1 may or may not equal the checksum of obj2; we just confirm determinism
    const c3 = CertifiedExportService.computeChecksum(obj2)
    const c4 = CertifiedExportService.computeChecksum(obj2)
    expect(c3).toBe(c4)
  })

  it('nested objects produce a checksum', () => {
    const data = { financial_summary: { revenue: 500_000, expenses: 200_000 }, raw_data: { sales: [] } }
    const result = CertifiedExportService.computeChecksum(data)
    expect(result).toHaveLength(64)
  })

  it('null values in object are included in checksum', () => {
    const withNull    = CertifiedExportService.computeChecksum({ key: null })
    const withString  = CertifiedExportService.computeChecksum({ key: 'null' })
    expect(withNull).not.toBe(withString)
  })

  it('arrays in object produce correct checksum', () => {
    const data = { items: [1, 2, 3] }
    const expected = createHash('sha256').update(JSON.stringify(data)).digest('hex')
    expect(CertifiedExportService.computeChecksum(data)).toBe(expected)
  })
})

// ── CertifiedExportPackage — financial_summary invariants ─────────────────────

describe('CertifiedExportPackage — financial_summary arithmetic invariants', () => {

  it('gross_profit = revenue - cogs', () => {
    const pkg = buildPackage()
    const fs  = pkg.financial_summary
    expect(fs.gross_profit_try).toBe(fs.revenue_try - fs.cogs_try)
  })

  it('net_income = gross_profit - expenses', () => {
    const pkg = buildPackage()
    const fs  = pkg.financial_summary
    expect(fs.net_income_try).toBe(fs.gross_profit_try - fs.expenses_try)
  })

  it('net_income is negative when expenses exceed gross_profit', () => {
    const pkg = buildPackage({
      financial_summary: {
        period_label:     '2026-01-01 – 2026-05-26',
        revenue_try:      100_000,
        cogs_try:          80_000,
        gross_profit_try:  20_000,
        expenses_try:      50_000,
        net_income_try:   -30_000,
        cash_try:         10_000,
      },
    })
    expect(pkg.financial_summary.net_income_try).toBeLessThan(0)
  })

  it('zero-revenue package has non-positive net income', () => {
    const pkg = buildPackage({
      financial_summary: {
        period_label:     '2026-01-01 – 2026-01-31',
        revenue_try:       0,
        cogs_try:          0,
        gross_profit_try:  0,
        expenses_try:     10_000,
        net_income_try:  -10_000,
        cash_try:          5_000,
      },
    })
    expect(pkg.financial_summary.net_income_try).toBeLessThanOrEqual(0)
  })
})

// ── CertifiedExportPackage — partner_summary invariants ───────────────────────

describe('CertifiedExportPackage — partner_summary invariants', () => {

  it('total_partners equals partners array length', () => {
    const pkg = buildPackage()
    expect(pkg.partner_summary.total_partners).toBe(pkg.partner_summary.partners.length)
  })

  it('active_partners <= total_partners', () => {
    const pkg = buildPackage()
    expect(pkg.partner_summary.active_partners).toBeLessThanOrEqual(pkg.partner_summary.total_partners)
  })

  it('total_partner_debt_try is the sum of individual partner loan amounts', () => {
    const pkg = buildPackage()
    const sumLoans = pkg.partner_summary.partners.reduce(
      (s, p) => s + p.loan_outstanding_try,
      0,
    )
    expect(pkg.partner_summary.total_partner_debt_try).toBe(sumLoans)
  })

  it('share_ratio_pct values sum to 100 for full partnership', () => {
    const pkg  = buildPackage()
    const sumPct = pkg.partner_summary.partners.reduce((s, p) => s + p.share_ratio_pct, 0)
    expect(sumPct).toBeCloseTo(100, 1)
  })

  it('empty partners list has total_partner_debt_try of 0', () => {
    const pkg = buildPackage({
      partner_summary: {
        partners:               [],
        total_partner_debt_try: 0,
        total_partners:         0,
        active_partners:        0,
      },
    })
    expect(pkg.partner_summary.total_partner_debt_try).toBe(0)
    expect(pkg.partner_summary.partners).toHaveLength(0)
  })
})

// ── CertifiedExportPackage — receivables and governance ───────────────────────

describe('CertifiedExportPackage — receivables and governance invariants', () => {

  it('overdue_receivables_try <= total_receivables_try', () => {
    const pkg = buildPackage()
    const rs  = pkg.receivables_summary
    expect(rs.overdue_receivables_try).toBeLessThanOrEqual(rs.total_receivables_try)
  })

  it('total_receivables_try is non-negative', () => {
    const pkg = buildPackage()
    expect(pkg.receivables_summary.total_receivables_try).toBeGreaterThanOrEqual(0)
  })

  it('audit_readiness_score is either null or in range 0-100', () => {
    const pkg   = buildPackage()
    const score = pkg.governance_summary.audit_readiness_score
    if (score !== null) {
      expect(score).toBeGreaterThanOrEqual(0)
      expect(score).toBeLessThanOrEqual(100)
    }
  })

  it('corporate_actions total_actions >= 0', () => {
    const pkg = buildPackage()
    expect(pkg.corporate_actions_summary.total_actions).toBeGreaterThanOrEqual(0)
  })

  it('governance pending_resolutions and open_workflows are non-negative integers', () => {
    const pkg = buildPackage()
    const gs  = pkg.governance_summary
    expect(gs.open_workflows).toBeGreaterThanOrEqual(0)
    expect(gs.pending_resolutions).toBeGreaterThanOrEqual(0)
    expect(Number.isInteger(gs.open_workflows)).toBe(true)
    expect(Number.isInteger(gs.pending_resolutions)).toBe(true)
  })
})

// ── CertifiedExportPackage — raw_data integrity ───────────────────────────────

describe('CertifiedExportPackage — raw_data integrity', () => {

  it('all sales have an id field', () => {
    const pkg = buildPackage()
    for (const sale of pkg.raw_data.sales) {
      expect(sale).toHaveProperty('id')
      expect(typeof sale.id).toBe('string')
    }
  })

  it('all expenses have an id and amount_try field', () => {
    const pkg = buildPackage()
    for (const exp of pkg.raw_data.expenses) {
      expect(exp).toHaveProperty('id')
      expect(exp).toHaveProperty('amount_try')
    }
  })

  it('sale customer_name can be null (anonymous customer)', () => {
    const pkg = buildPackage()
    const anonymousSale = pkg.raw_data.sales.find(s => s.customer_name === null)
    expect(anonymousSale).toBeDefined()
  })

  it('record_counts.sales equals raw_data.sales length', () => {
    const pkg = buildPackage()
    expect(pkg.manifest.record_counts.sales).toBe(pkg.raw_data.sales.length)
  })

  it('record_counts.expenses equals raw_data.expenses length', () => {
    const pkg = buildPackage()
    expect(pkg.manifest.record_counts.expenses).toBe(pkg.raw_data.expenses.length)
  })

  it('empty raw_data package has record_counts of 0', () => {
    const pkg = buildPackage({
      raw_data: { sales: [], expenses: [] },
      manifest: buildManifest({
        record_counts: { sales: 0, expenses: 0, partners: 2, corporate_actions: 5, open_receivables: 4 },
      }),
    })
    expect(pkg.raw_data.sales).toHaveLength(0)
    expect(pkg.raw_data.expenses).toHaveLength(0)
    expect(pkg.manifest.record_counts.sales).toBe(0)
  })
})

// ── computeChecksum — returns non-empty string ────────────────────────────────

describe('computeChecksum — non-empty output guarantee', () => {
  it('returns a non-empty string for any object', () => {
    const result = CertifiedExportService.computeChecksum({ key: 'value' })
    expect(result).toBeTruthy()
    expect(result.length).toBeGreaterThan(0)
  })

  it('returns a non-empty string for an empty object', () => {
    const result = CertifiedExportService.computeChecksum({})
    expect(result).toBeTruthy()
    expect(result.length).toBeGreaterThan(0)
  })

  it('returns a non-empty string for deeply nested object', () => {
    const data = { a: { b: { c: { d: { e: 'deep' } } } } }
    const result = CertifiedExportService.computeChecksum(data)
    expect(result).toBeTruthy()
    expect(result.length).toBeGreaterThan(0)
  })

  it('returns a non-empty string for object with numeric values', () => {
    const result = CertifiedExportService.computeChecksum({ revenue: 0, expenses: 0 })
    expect(result).toBeTruthy()
    expect(result).toMatch(/^[a-f0-9]+$/)
  })
})

// ── computeChecksum — determinism (same input = same output) ─────────────────

describe('computeChecksum — determinism', () => {
  it('same simple object produces same checksum on 5 calls', () => {
    const data = { revenue_try: 500_000, period: '2026-Q1' }
    const results = Array.from({ length: 5 }, () => CertifiedExportService.computeChecksum(data))
    const unique = new Set(results)
    expect(unique.size).toBe(1)
  })

  it('object with array values is deterministic', () => {
    const data = { items: [1, 2, 3], label: 'test' }
    const c1 = CertifiedExportService.computeChecksum(data)
    const c2 = CertifiedExportService.computeChecksum(data)
    expect(c1).toBe(c2)
  })

  it('object with null values is deterministic', () => {
    const data = { a: null, b: 'hello', c: 42 }
    const c1 = CertifiedExportService.computeChecksum(data)
    const c2 = CertifiedExportService.computeChecksum(data)
    expect(c1).toBe(c2)
  })

  it('checksum is stable across independent calls with same full package data', () => {
    const data = {
      financial_summary: { revenue_try: 100_000, expenses_try: 50_000 },
      raw_data: { sales: [{ id: 's1', total_try: 50_000 }] },
    }
    const hash1 = CertifiedExportService.computeChecksum(data)
    const hash2 = CertifiedExportService.computeChecksum(data)
    const hash3 = CertifiedExportService.computeChecksum(data)
    expect(hash1).toBe(hash2)
    expect(hash2).toBe(hash3)
  })
})

// ── computeChecksum — different input = different output ─────────────────────

describe('computeChecksum — different input produces different checksum', () => {
  it('changing a number value changes the checksum', () => {
    const base = { value: 100 }
    const changed = { value: 101 }
    expect(CertifiedExportService.computeChecksum(base)).not.toBe(
      CertifiedExportService.computeChecksum(changed)
    )
  })

  it('changing a string value changes the checksum', () => {
    const a = CertifiedExportService.computeChecksum({ label: 'foo' })
    const b = CertifiedExportService.computeChecksum({ label: 'bar' })
    expect(a).not.toBe(b)
  })

  it('adding a new key changes the checksum', () => {
    const a = CertifiedExportService.computeChecksum({ key: 'value' })
    const b = CertifiedExportService.computeChecksum({ key: 'value', extra: true })
    expect(a).not.toBe(b)
  })

  it('null vs string value produces different checksums', () => {
    const a = CertifiedExportService.computeChecksum({ key: null })
    const b = CertifiedExportService.computeChecksum({ key: 'null' })
    expect(a).not.toBe(b)
  })

  it('empty array vs non-empty array produces different checksums', () => {
    const a = CertifiedExportService.computeChecksum({ items: [] })
    const b = CertifiedExportService.computeChecksum({ items: [1] })
    expect(a).not.toBe(b)
  })
})

// ── computeChecksum — empty object checksum ───────────────────────────────────

describe('computeChecksum — empty object', () => {
  it('empty object produces a 64-char hex string', () => {
    const result = CertifiedExportService.computeChecksum({})
    expect(result).toHaveLength(64)
    expect(result).toMatch(/^[a-f0-9]{64}$/)
  })

  it('empty object checksum matches manually computed SHA-256("{}")', () => {
    const { createHash } = require('crypto')
    const expected = createHash('sha256').update('{}').digest('hex')
    expect(CertifiedExportService.computeChecksum({})).toBe(expected)
  })

  it('empty object checksum is deterministic across calls', () => {
    const c1 = CertifiedExportService.computeChecksum({})
    const c2 = CertifiedExportService.computeChecksum({})
    expect(c1).toBe(c2)
  })
})

// ── computeChecksum — large nested object ─────────────────────────────────────

describe('computeChecksum — large nested object', () => {
  it('large object with 100 keys produces a 64-char hash', () => {
    const large: Record<string, number> = {}
    for (let i = 0; i < 100; i++) {
      large[`key_${i}`] = i * 1000
    }
    const result = CertifiedExportService.computeChecksum(large)
    expect(result).toHaveLength(64)
    expect(result).toMatch(/^[a-f0-9]{64}$/)
  })

  it('deeply nested object produces a valid SHA-256 hash', () => {
    const data = {
      level1: {
        level2: {
          level3: {
            level4: {
              value: 'deep-value',
              numbers: [1, 2, 3, 4, 5],
            },
          },
        },
      },
    }
    const result = CertifiedExportService.computeChecksum(data)
    expect(result).toHaveLength(64)
    expect(result).toMatch(/^[a-f0-9]{64}$/)
  })

  it('large array in object produces correct checksum', () => {
    const { createHash } = require('crypto')
    const data = { items: Array.from({ length: 1000 }, (_, i) => i) }
    const expected = createHash('sha256').update(JSON.stringify(data)).digest('hex')
    expect(CertifiedExportService.computeChecksum(data)).toBe(expected)
  })

  it('changing a single item deep in a large nested object changes the checksum', () => {
    const base = { data: { items: [1, 2, 3, 4, 5] } }
    const modified = { data: { items: [1, 2, 3, 4, 6] } }  // last item changed
    expect(CertifiedExportService.computeChecksum(base)).not.toBe(
      CertifiedExportService.computeChecksum(modified)
    )
  })
})

// ── computeChecksum — output is 64-char hex (SHA-256) ────────────────────────

describe('computeChecksum — output format: 64-char hex', () => {
  const testCases = [
    { label: 'empty object',   data: {} },
    { label: 'simple object',  data: { x: 1 } },
    { label: 'nested object',  data: { a: { b: 2 } } },
    { label: 'array value',    data: { arr: [1, 2] } },
    { label: 'null value',     data: { n: null } },
    { label: 'boolean value',  data: { flag: true } },
  ]

  for (const { label, data } of testCases) {
    it(`output is 64-char hex for: ${label}`, () => {
      const result = CertifiedExportService.computeChecksum(data)
      expect(result).toHaveLength(64)
      expect(result).toMatch(/^[a-f0-9]{64}$/)
    })
  }
})

// ── manifest structure validation ─────────────────────────────────────────────

describe('manifest structure validation — required fields present', () => {
  const requiredFields = [
    'export_id', 'company_id', 'company_name', 'generated_by',
    'generated_at', 'period_from', 'period_to', 'sections',
    'record_counts', 'checksum', 'flowra_version', 'disclaimer',
  ]

  for (const field of requiredFields) {
    it(`manifest has required field: ${field}`, () => {
      const pkg = buildPackage()
      expect(pkg.manifest).toHaveProperty(field)
    })
  }

  it('manifest.sections is an array with at least one element', () => {
    const pkg = buildPackage()
    expect(Array.isArray(pkg.manifest.sections)).toBe(true)
    expect(pkg.manifest.sections.length).toBeGreaterThan(0)
  })

  it('manifest.record_counts is an object (not array)', () => {
    const pkg = buildPackage()
    expect(typeof pkg.manifest.record_counts).toBe('object')
    expect(Array.isArray(pkg.manifest.record_counts)).toBe(false)
  })

  it('manifest.flowra_version is a non-empty string', () => {
    const pkg = buildPackage()
    expect(typeof pkg.manifest.flowra_version).toBe('string')
    expect(pkg.manifest.flowra_version.length).toBeGreaterThan(0)
  })

  it('manifest.export_id is a non-empty string', () => {
    const pkg = buildPackage()
    expect(typeof pkg.manifest.export_id).toBe('string')
    expect(pkg.manifest.export_id.length).toBeGreaterThan(0)
  })
})
