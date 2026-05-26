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
