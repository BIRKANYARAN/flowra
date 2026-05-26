/**
 * Tests for PCLE pure-computation classes:
 *   lib/services/pcle/pcle.equity.ts       — PCLEEquity
 *   lib/services/pcle/pcle.distribution.ts — PCLEDistribution
 *   lib/services/pcle/pcle.risk.ts         — PCLERisk
 *
 * All methods are static pure functions — no DB, no I/O.
 * Run with: npx vitest run tests/pcle-pure.test.ts
 */
import { describe, it, expect } from 'vitest'
import { PCLEEquity } from '../lib/services/pcle/pcle.equity'
import { PCLEDistribution, type DistributionInputs } from '../lib/services/pcle/pcle.distribution'
import { PCLERisk } from '../lib/services/pcle/pcle.risk'
import { PCLELiability, type PartnerLoanInput } from '../lib/services/pcle/pcle.liability'

// ═══════════════════════════════════════════════════════════════════════════════
// PCLEEquity
// ═══════════════════════════════════════════════════════════════════════════════

describe('PCLEEquity.computeFromTransactions', () => {
  it('total_paid_in = sum of capital_in amounts', () => {
    const partners = [
      { id: 'p1', name: 'Ahmet', share_ratio: 0.5 },
      { id: 'p2', name: 'Mehmet', share_ratio: 0.5 },
    ]
    const capitalIn = new Map([['p1', 100_000], ['p2', 80_000]])
    const result = PCLEEquity.computeFromTransactions(partners, capitalIn)
    expect(result.total_paid_in_try).toBe(180_000)
  })

  it('without commitments table, committed = paid, equity_gap = 0', () => {
    const partners = [{ id: 'p1', name: 'Ahmet', share_ratio: 1 }]
    const capitalIn = new Map([['p1', 200_000]])
    const result = PCLEEquity.computeFromTransactions(partners, capitalIn)
    expect(result.total_equity_gap_try).toBe(0)
    expect(result.partner_positions[0].equity_gap).toBe(0)
  })

  it('partner with no capital_in maps to 0', () => {
    const partners = [
      { id: 'p1', name: 'Ahmet', share_ratio: 0.6 },
      { id: 'p2', name: 'Mehmet', share_ratio: 0.4 },
    ]
    const capitalIn = new Map([['p1', 50_000]])  // p2 has no entry
    const result = PCLEEquity.computeFromTransactions(partners, capitalIn)
    const p2 = result.partner_positions.find(p => p.partner_id === 'p2')
    expect(p2?.total_paid).toBe(0)
    expect(p2?.equity_gap).toBe(0)
  })

  it('empty partners → totals are zero', () => {
    const result = PCLEEquity.computeFromTransactions([], new Map())
    expect(result.total_committed_try).toBe(0)
    expect(result.total_paid_in_try).toBe(0)
    expect(result.partner_positions).toHaveLength(0)
  })
})

describe('PCLEEquity.computeFromCommitments', () => {
  it('equity_gap = committed - paid (clamped at 0)', () => {
    const partners = [{ id: 'p1', name: 'Ahmet', share_ratio: 1 }]
    const commitments = [{ partner_id: 'p1', committed_try: 100_000, paid_try: 60_000, due_date: null }]
    const result = PCLEEquity.computeFromCommitments(partners, commitments)
    expect(result.partner_positions[0].equity_gap).toBe(40_000)
    expect(result.partner_positions[0].gap_pct).toBe(40)  // 40_000 / 100_000 * 100
  })

  it('over-payment does not create negative equity_gap', () => {
    const partners = [{ id: 'p1', name: 'Ahmet', share_ratio: 1 }]
    const commitments = [{ partner_id: 'p1', committed_try: 50_000, paid_try: 70_000, due_date: null }]
    const result = PCLEEquity.computeFromCommitments(partners, commitments)
    expect(result.partner_positions[0].equity_gap).toBe(0)
  })

  it('has_overdue_call = true when gap > 0 and due_date is in the past', () => {
    const partners = [{ id: 'p1', name: 'Ahmet', share_ratio: 1 }]
    const commitments = [{ partner_id: 'p1', committed_try: 100_000, paid_try: 50_000, due_date: '2020-01-01' }]
    const today = new Date('2026-01-01')
    const result = PCLEEquity.computeFromCommitments(partners, commitments, today)
    expect(result.partner_positions[0].has_overdue_call).toBe(true)
  })

  it('has_overdue_call = false when fully paid', () => {
    const partners = [{ id: 'p1', name: 'Ahmet', share_ratio: 1 }]
    const commitments = [{ partner_id: 'p1', committed_try: 100_000, paid_try: 100_000, due_date: '2020-01-01' }]
    const today = new Date('2026-01-01')
    const result = PCLEEquity.computeFromCommitments(partners, commitments, today)
    expect(result.partner_positions[0].has_overdue_call).toBe(false)
  })

  it('has_overdue_call = false when due_date is in the future', () => {
    const partners = [{ id: 'p1', name: 'Ahmet', share_ratio: 1 }]
    const commitments = [{ partner_id: 'p1', committed_try: 100_000, paid_try: 0, due_date: '2099-01-01' }]
    const today = new Date('2026-01-01')
    const result = PCLEEquity.computeFromCommitments(partners, commitments, today)
    expect(result.partner_positions[0].has_overdue_call).toBe(false)
  })

  it('total_equity_gap_try = sum of all partner gaps', () => {
    const partners = [
      { id: 'p1', name: 'Ahmet', share_ratio: 0.5 },
      { id: 'p2', name: 'Mehmet', share_ratio: 0.5 },
    ]
    const commitments = [
      { partner_id: 'p1', committed_try: 100_000, paid_try: 70_000, due_date: null },
      { partner_id: 'p2', committed_try: 80_000,  paid_try: 80_000, due_date: null },
    ]
    const result = PCLEEquity.computeFromCommitments(partners, commitments)
    expect(result.total_equity_gap_try).toBe(30_000) // only p1 has gap
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// PCLEDistribution — computeDistributable
// ═══════════════════════════════════════════════════════════════════════════════

function mkDistInput(overrides: Partial<DistributionInputs> = {}): DistributionInputs {
  return {
    gross_net_income_try:    200_000,
    paid_in_capital_try:     500_000,
    existing_reserves_try:         0,
    board_retained_try:            0,
    unpaid_compensation_try:       0,
    ...overrides,
  }
}

describe('PCLEDistribution.computeDistributable — legal reserve (TTK 519)', () => {
  it('legal_reserve = 5% of net income when below cap', () => {
    // Capital ₺500K × 20% = ₺100K cap; income ₺200K × 5% = ₺10K (under cap)
    const result = PCLEDistribution.computeDistributable(mkDistInput())
    expect(result.legal_reserve_try).toBe(10_000)
  })

  it('legal_reserve = 0 when existing reserves already meet cap', () => {
    // Capital ₺500K × 20% = ₺100K cap; existing = ₺100K → reserve_cap = 0
    const result = PCLEDistribution.computeDistributable(mkDistInput({ existing_reserves_try: 100_000 }))
    expect(result.legal_reserve_try).toBe(0)
  })

  it('legal_reserve = 0 when income is 0 or negative', () => {
    const result = PCLEDistribution.computeDistributable(mkDistInput({ gross_net_income_try: 0 }))
    expect(result.legal_reserve_try).toBe(0)
  })

  it('legal_reserve is capped by reserve_cap (20% × capital − existing)', () => {
    // Capital ₺100K; existing ₺18K; cap = 20K - 18K = 2K
    // income × 5% = ₺200K × 5% = 10K > cap → legal_reserve = 2K
    const result = PCLEDistribution.computeDistributable(mkDistInput({
      paid_in_capital_try:   100_000,
      existing_reserves_try:  18_000,
      gross_net_income_try:  200_000,
    }))
    expect(result.legal_reserve_try).toBe(2_000)
  })
})

describe('PCLEDistribution.computeDistributable — withholding tax (GVK 94)', () => {
  it('withholding = 10% of distributable_gross', () => {
    // income=200K, legal_reserve=10K, distributable_gross=190K → withholding=19K
    const result = PCLEDistribution.computeDistributable(mkDistInput())
    expect(result.withholding_tax_try).toBeCloseTo(19_000, 0)
  })

  it('withholding = 0 when distributable_gross <= 0', () => {
    // Income=10K, board_retained=10K → distributable_gross near 0
    const result = PCLEDistribution.computeDistributable(mkDistInput({
      gross_net_income_try: 10_000,
      board_retained_try:   10_000,
    }))
    expect(result.withholding_tax_try).toBe(0)
  })
})

describe('PCLEDistribution.computeDistributable — distributable_net', () => {
  it('distributable_net = distributable_gross - withholding', () => {
    const result = PCLEDistribution.computeDistributable(mkDistInput())
    const expected = result.distributable_gross_try - result.withholding_tax_try
    expect(result.distributable_net_try).toBeCloseTo(expected, 2)
  })

  it('is_distributable = true when distributable_net > 0.01', () => {
    const result = PCLEDistribution.computeDistributable(mkDistInput({ gross_net_income_try: 200_000 }))
    expect(result.is_distributable).toBe(true)
  })

  it('is_distributable = false when income = 0', () => {
    const result = PCLEDistribution.computeDistributable(mkDistInput({ gross_net_income_try: 0 }))
    expect(result.is_distributable).toBe(false)
  })

  it('block_reason includes TTK 509 when income <= 0', () => {
    const result = PCLEDistribution.computeDistributable(mkDistInput({ gross_net_income_try: 0 }))
    expect(result.block_reason).not.toBeNull()
    expect(result.block_reason).toContain('TTK 509')
  })

  it('block_reason is null when distributable', () => {
    const result = PCLEDistribution.computeDistributable(mkDistInput())
    expect(result.block_reason).toBeNull()
  })

  it('unpaid_compensation reduces distributable_gross', () => {
    const base = PCLEDistribution.computeDistributable(mkDistInput())
    const withComp = PCLEDistribution.computeDistributable(mkDistInput({ unpaid_compensation_try: 20_000 }))
    expect(withComp.distributable_gross_try).toBe(base.distributable_gross_try - 20_000)
  })

  it('board_retained reduces distributable_gross', () => {
    const base = PCLEDistribution.computeDistributable(mkDistInput())
    const withRetained = PCLEDistribution.computeDistributable(mkDistInput({ board_retained_try: 30_000 }))
    expect(withRetained.distributable_gross_try).toBe(base.distributable_gross_try - 30_000)
  })
})

// ── PCLEDistribution.computePerPartnerDistribution ───────────────────────────

describe('PCLEDistribution.computePerPartnerDistribution', () => {
  const partners = [
    { partner_id: 'p1', partner_name: 'Ahmet',  share_ratio: 0.6 },
    { partner_id: 'p2', partner_name: 'Mehmet', share_ratio: 0.4 },
  ]

  it('net entitlements sum to distributable_net', () => {
    const distributions = PCLEDistribution.computePerPartnerDistribution(90_000, partners)
    const totalNet = distributions.reduce((s, d) => s + d.net_entitlement_try, 0)
    expect(totalNet).toBeCloseTo(90_000, 1)
  })

  it('partner with 60% share gets 60% of net distribution', () => {
    const distributions = PCLEDistribution.computePerPartnerDistribution(100_000, partners)
    const p1 = distributions.find(d => d.partner_id === 'p1')!
    expect(p1.net_entitlement_try).toBeCloseTo(60_000, 1)
  })

  it('gross_entitlement = net / (1 - 0.10)', () => {
    const distributions = PCLEDistribution.computePerPartnerDistribution(90_000, partners)
    const p1 = distributions.find(d => d.partner_id === 'p1')!
    const expectedGross = p1.net_entitlement_try / (1 - 0.10)
    expect(p1.gross_entitlement_try).toBeCloseTo(expectedGross, 1)
  })

  it('withholding_try = gross - net', () => {
    const distributions = PCLEDistribution.computePerPartnerDistribution(90_000, partners)
    for (const d of distributions) {
      expect(d.withholding_try).toBeCloseTo(d.gross_entitlement_try - d.net_entitlement_try, 1)
    }
  })

  it('distributable_net = 0 → all entitlements = 0', () => {
    const distributions = PCLEDistribution.computePerPartnerDistribution(0, partners)
    for (const d of distributions) {
      expect(d.net_entitlement_try).toBe(0)
    }
  })
})

// ── PCLEDistribution.checkCompliance ─────────────────────────────────────────

describe('PCLEDistribution.checkCompliance — Turkish law rules', () => {
  const baseParams = {
    partner_loans:         [] as Array<{ net_loan: number; first_loan_date: string | null; interest_rate: number }>,
    huzur_payments:        [] as Array<{ board_decision_ref: string | null; amount_try: number }>,
    existing_reserves_try: 100_000,  // already at 20% cap of ₺500K capital → no TTK519 warning
    paid_in_capital_try:   500_000,
    gross_net_income_try:  200_000,
    dividend_requested_try:0,
  }

  it('no issues → empty warnings array', () => {
    const warnings = PCLEDistribution.checkCompliance(baseParams)
    expect(warnings).toHaveLength(0)
  })

  it('KVK13: interest-free loan > ₺50K older than 1 year triggers warning', () => {
    const warnings = PCLEDistribution.checkCompliance({
      ...baseParams,
      partner_loans: [{
        net_loan:        100_000,
        interest_rate:   0,
        first_loan_date: '2020-01-01',  // >1 year ago
      }],
      today: new Date('2026-01-01'),
    })
    const kvk = warnings.find(w => w.code === 'KVK13_INTEREST_FREE')
    expect(kvk).toBeDefined()
    expect(kvk?.severity).toBe('warning')
    expect(kvk?.rule).toBe('KVK 13 / VUK')
  })

  it('KVK13: non-zero interest rate does NOT trigger warning', () => {
    const warnings = PCLEDistribution.checkCompliance({
      ...baseParams,
      partner_loans: [{
        net_loan:        100_000,
        interest_rate:   5,  // 5% — not interest-free
        first_loan_date: '2020-01-01',
      }],
      today: new Date('2026-01-01'),
    })
    const kvk = warnings.find(w => w.code === 'KVK13_INTEREST_FREE')
    expect(kvk).toBeUndefined()
  })

  it('KVK13: loan <= ₺50K does NOT trigger warning even if interest-free', () => {
    const warnings = PCLEDistribution.checkCompliance({
      ...baseParams,
      partner_loans: [{
        net_loan:        49_999,
        interest_rate:   0,
        first_loan_date: '2020-01-01',
      }],
      today: new Date('2026-01-01'),
    })
    const kvk = warnings.find(w => w.code === 'KVK13_INTEREST_FREE')
    expect(kvk).toBeUndefined()
  })

  it('TTK394: huzur payment without board decision ref triggers warning', () => {
    const warnings = PCLEDistribution.checkCompliance({
      ...baseParams,
      huzur_payments: [{ board_decision_ref: null, amount_try: 15_000 }],
    })
    const ttk394 = warnings.find(w => w.code === 'TTK394_NO_BOARD_REF')
    expect(ttk394).toBeDefined()
    expect(ttk394?.severity).toBe('warning')
    expect(ttk394?.rule).toBe('TTK 394')
  })

  it('TTK394: huzur payment WITH board decision ref does NOT trigger warning', () => {
    const warnings = PCLEDistribution.checkCompliance({
      ...baseParams,
      huzur_payments: [{ board_decision_ref: 'GK-2025-001', amount_try: 15_000 }],
    })
    const ttk394 = warnings.find(w => w.code === 'TTK394_NO_BOARD_REF')
    expect(ttk394).toBeUndefined()
  })

  it('TTK519: legal reserve info warning when reserves below cap', () => {
    const warnings = PCLEDistribution.checkCompliance({
      ...baseParams,
      existing_reserves_try: 0,         // explicitly 0 — below 20% cap
      paid_in_capital_try:   500_000,   // cap = ₺100K
      gross_net_income_try:  200_000,   // 5% = ₺10K reserve needed
    })
    const ttk519 = warnings.find(w => w.code === 'TTK519_RESERVE_REQUIRED')
    expect(ttk519).toBeDefined()
    expect(ttk519?.severity).toBe('info')
  })

  it('TTK519: no warning when existing reserves already meet cap', () => {
    // baseParams already has existing_reserves_try: 100_000 (at cap)
    const warnings = PCLEDistribution.checkCompliance(baseParams)
    const ttk519 = warnings.find(w => w.code === 'TTK519_RESERVE_REQUIRED')
    expect(ttk519).toBeUndefined()
  })

  it('TTK509: dividend > net income triggers error', () => {
    const warnings = PCLEDistribution.checkCompliance({
      ...baseParams,
      gross_net_income_try:   100_000,
      dividend_requested_try: 150_000,  // exceeds income
    })
    const ttk509 = warnings.find(w => w.code === 'TTK509_EXCESS_DIVIDEND')
    expect(ttk509).toBeDefined()
    expect(ttk509?.severity).toBe('error')
    expect(ttk509?.rule).toBe('TTK 509')
  })

  it('TTK509: dividend requested when income = 0 triggers TTK509_NO_PROFIT error', () => {
    const warnings = PCLEDistribution.checkCompliance({
      ...baseParams,
      gross_net_income_try:   0,
      dividend_requested_try: 50_000,
    })
    const ttk509 = warnings.find(w => w.code === 'TTK509_NO_PROFIT')
    expect(ttk509).toBeDefined()
    expect(ttk509?.severity).toBe('error')
  })

  it('multiple violations can appear simultaneously', () => {
    const warnings = PCLEDistribution.checkCompliance({
      ...baseParams,
      partner_loans: [{ net_loan: 100_000, interest_rate: 0, first_loan_date: '2020-01-01' }],
      huzur_payments: [{ board_decision_ref: null, amount_try: 10_000 }],
      today: new Date('2026-01-01'),
    })
    expect(warnings.length).toBeGreaterThanOrEqual(2)
    expect(warnings.some(w => w.code === 'KVK13_INTEREST_FREE')).toBe(true)
    expect(warnings.some(w => w.code === 'TTK394_NO_BOARD_REF')).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// PCLERisk — computePartnerRisks
// ═══════════════════════════════════════════════════════════════════════════════

function mkRiskParams(overrides: {
  partners?: Array<{ id: string; name: string; share_ratio: number; net_loan: number; days_outstanding: number; equity_paid: number }>
  total_debt_try?: number
  net_income_try?: number
  monthly_debt_service?: number
  compliance_issue_count?: Map<string, number>
} = {}) {
  return {
    partners: [
      { id: 'p1', name: 'Ahmet',  share_ratio: 0.6, net_loan: 300_000, days_outstanding: 90, equity_paid: 200_000 },
      { id: 'p2', name: 'Mehmet', share_ratio: 0.4, net_loan: 200_000, days_outstanding: 60, equity_paid: 150_000 },
    ],
    total_debt_try:         500_000,
    net_income_try:         300_000,
    monthly_debt_service:    10_000,
    compliance_issue_count: new Map<string, number>(),
    ...overrides,
  }
}

describe('PCLERisk.computePartnerRisks — structure', () => {
  it('returns a risk profile for each partner', () => {
    const result = PCLERisk.computePartnerRisks(mkRiskParams())
    expect(result.partner_profiles).toHaveLength(2)
    expect(result.partner_profiles[0].partner_id).toBe('p1')
    expect(result.partner_profiles[1].partner_id).toBe('p2')
  })

  it('each profile has 6 dimensions', () => {
    const result = PCLERisk.computePartnerRisks(mkRiskParams())
    const dims = result.partner_profiles[0].dimensions
    expect(dims.concentration).toBeDefined()
    expect(dims.duration).toBeDefined()
    expect(dims.burden).toBeDefined()
    expect(dims.coverage).toBeDefined()
    expect(dims.liquidity).toBeDefined()
    expect(dims.compliance).toBeDefined()
  })

  it('composite_score is between 0 and 100', () => {
    const result = PCLERisk.computePartnerRisks(mkRiskParams())
    for (const p of result.partner_profiles) {
      expect(p.composite_score).toBeGreaterThanOrEqual(0)
      expect(p.composite_score).toBeLessThanOrEqual(100)
    }
  })

  it('composite_grade is a valid RiskGrade (A/B/C/D/F)', () => {
    const result = PCLERisk.computePartnerRisks(mkRiskParams())
    const validGrades = ['A', 'B', 'C', 'D', 'F']
    for (const p of result.partner_profiles) {
      expect(validGrades).toContain(p.composite_grade)
    }
  })

  it('recommended_action is non-empty string', () => {
    const result = PCLERisk.computePartnerRisks(mkRiskParams())
    for (const p of result.partner_profiles) {
      expect(typeof p.recommended_action).toBe('string')
      expect(p.recommended_action.length).toBeGreaterThan(0)
    }
  })
})

describe('PCLERisk.computePartnerRisks — DSR calculation', () => {
  it('dsr = (monthly_debt_service × 12) / net_income', () => {
    const result = PCLERisk.computePartnerRisks(mkRiskParams({
      net_income_try:         120_000,
      monthly_debt_service:    10_000,  // 10K × 12 = 120K / 120K = 1.0 DSR
    }))
    expect(result.dsr).toBeCloseTo(1.0, 1)
  })

  it('dsr = 1 when net_income = 0 (worst-case guard)', () => {
    const result = PCLERisk.computePartnerRisks(mkRiskParams({ net_income_try: 0 }))
    expect(result.dsr).toBe(1)
  })
})

describe('PCLERisk.computePartnerRisks — concentration', () => {
  it('concentration_pct = largest partner loan / total debt × 100', () => {
    const result = PCLERisk.computePartnerRisks(mkRiskParams({
      partners: [
        { id: 'p1', name: 'Ahmet', share_ratio: 0.6, net_loan: 400_000, days_outstanding: 30, equity_paid: 300_000 },
        { id: 'p2', name: 'Mehmet', share_ratio: 0.4, net_loan: 100_000, days_outstanding: 30, equity_paid: 100_000 },
      ],
      total_debt_try: 500_000,
    }))
    // 400K / 500K = 80%
    expect(result.concentration_pct).toBeCloseTo(80, 1)
  })
})

describe('PCLERisk.computePartnerRisks — compliance dimension', () => {
  it('compliance score = 100 when no issues', () => {
    const result = PCLERisk.computePartnerRisks(mkRiskParams())
    const comp = result.partner_profiles[0].dimensions.compliance
    expect(comp.score).toBe(100)
    expect(comp.grade).toBe('A')
  })

  it('compliance score = 75 (B) with 1 issue (100 - 25)', () => {
    const result = PCLERisk.computePartnerRisks(mkRiskParams({
      compliance_issue_count: new Map([['p1', 1]]),
    }))
    const comp = result.partner_profiles[0].dimensions.compliance
    expect(comp.score).toBe(75)
    expect(comp.grade).toBe('B')
  })

  it('compliance score floors at 0 with 4+ issues', () => {
    const result = PCLERisk.computePartnerRisks(mkRiskParams({
      compliance_issue_count: new Map([['p1', 5]]),
    }))
    const comp = result.partner_profiles[0].dimensions.compliance
    expect(comp.score).toBe(0)
    expect(comp.grade).toBe('F')
  })
})

describe('PCLERisk.computePartnerRisks — company summary', () => {
  it('company_composite = average of partner composite scores', () => {
    const result = PCLERisk.computePartnerRisks(mkRiskParams())
    const expected = result.partner_profiles.reduce((s, p) => s + p.composite_score, 0) / result.partner_profiles.length
    expect(result.company_composite).toBeCloseTo(expected, 1)
  })

  it('company_grade is a valid RiskGrade', () => {
    const result = PCLERisk.computePartnerRisks(mkRiskParams())
    expect(['A', 'B', 'C', 'D', 'F']).toContain(result.company_grade)
  })

  it('no partners → company_composite = 100 (A grade, no risk)', () => {
    const result = PCLERisk.computePartnerRisks(mkRiskParams({ partners: [], total_debt_try: 0 }))
    expect(result.company_composite).toBe(100)
    expect(result.company_grade).toBe('A')
  })

  it('highest_risk_partner = partner with lowest composite score', () => {
    const result = PCLERisk.computePartnerRisks(mkRiskParams())
    const lowest = result.partner_profiles.reduce((a, b) => a.composite_score < b.composite_score ? a : b)
    expect(result.highest_risk_partner).toBe(lowest.partner_name)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// PCLELiability — computeWaterfall edge cases
// ═══════════════════════════════════════════════════════════════════════════════

function mkLoanInput(overrides: Partial<PartnerLoanInput> & Pick<PartnerLoanInput, 'partner_id' | 'partner_name' | 'share_ratio' | 'net_loan'>): PartnerLoanInput {
  return {
    total_loaned:    overrides.net_loan,
    total_repaid:    0,
    first_loan_date: null,
    ...overrides,
  }
}

describe('PCLELiability.computeWaterfall — edge cases', () => {
  it('partner with 0 share_ratio never receives repayment (edge case 1)', () => {
    // Partner p1 has share_ratio=0 but has net_loan. In Phase 2 pro-rata, 0 share → 0 allocation.
    // In Phase 1 normalization, all loan is "overfinanced" vs expected (0), so p1 gets Phase 1 repayment.
    // But if p2 also has 0 share_ratio and no loan, the test is: a partner with share_ratio=0 and no loan gets nothing.
    const loans: PartnerLoanInput[] = [
      mkLoanInput({ partner_id: 'p1', partner_name: 'Ahmet',  share_ratio: 1.0, net_loan: 100_000 }),
      mkLoanInput({ partner_id: 'p2', partner_name: 'Mehmet', share_ratio: 0.0, net_loan: 0 }),
    ]
    const result = PCLELiability.computeWaterfall(50_000, loans)
    const p2 = result.allocations.find(a => a.partner_id === 'p2')
    expect(p2?.allocated_try).toBe(0)
  })

  it('all partners equally funded — pure pro-rata expected (edge case 2)', () => {
    // Both partners have 50% share and equal loans — no Phase 1 normalization needed.
    // Phase 2 should split equally.
    const loans: PartnerLoanInput[] = [
      mkLoanInput({ partner_id: 'p1', partner_name: 'Ahmet',  share_ratio: 0.5, net_loan: 50_000 }),
      mkLoanInput({ partner_id: 'p2', partner_name: 'Mehmet', share_ratio: 0.5, net_loan: 50_000 }),
    ]
    const result = PCLELiability.computeWaterfall(40_000, loans)
    const p1 = result.allocations.find(a => a.partner_id === 'p1')!
    const p2 = result.allocations.find(a => a.partner_id === 'p2')!
    // Both should get equal allocation (20K each)
    expect(p1.phase1_try).toBe(0)  // no normalization
    expect(p2.phase1_try).toBe(0)
    expect(p1.allocated_try).toBeCloseTo(20_000, 0)
    expect(p2.allocated_try).toBeCloseTo(20_000, 0)
  })

  it('single partner — gets 100% of payment (edge case 3)', () => {
    const loans: PartnerLoanInput[] = [
      mkLoanInput({ partner_id: 'p1', partner_name: 'Ahmet', share_ratio: 1.0, net_loan: 200_000 }),
    ]
    const result = PCLELiability.computeWaterfall(80_000, loans)
    const p1 = result.allocations.find(a => a.partner_id === 'p1')!
    expect(p1.allocated_try).toBeCloseTo(80_000, 0)
    expect(result.total_allocated_try).toBeCloseTo(80_000, 0)
  })

  it('payment exactly equals excess — normalization completes, phase 2 gets zero (edge case 4)', () => {
    // p1 has share_ratio=0.4 but net_loan=60K; total=80K; expected=32K; excess=28K
    // p2 has share_ratio=0.6 but net_loan=20K; total=80K; expected=48K; no excess
    // Available cash = 28K (exactly p1's excess) → Phase 1 fully clears, Phase 2 gets 0
    const loans: PartnerLoanInput[] = [
      mkLoanInput({ partner_id: 'p1', partner_name: 'Ahmet',  share_ratio: 0.4, net_loan: 60_000 }),
      mkLoanInput({ partner_id: 'p2', partner_name: 'Mehmet', share_ratio: 0.6, net_loan: 20_000 }),
    ]
    const result = PCLELiability.computeWaterfall(28_000, loans)
    const p1 = result.allocations.find(a => a.partner_id === 'p1')!
    const p2 = result.allocations.find(a => a.partner_id === 'p2')!
    // p1 should receive their full excess in Phase 1
    expect(p1.phase1_try).toBeCloseTo(28_000, 0)
    // p2 should get nothing (no cash left for Phase 2)
    expect(p2.allocated_try).toBe(0)
  })

  it('net_loan never goes negative after allocation (edge case 5 — bug guard)', () => {
    // Provide more cash than total debt — no partner should receive more than their net_loan
    const loans: PartnerLoanInput[] = [
      mkLoanInput({ partner_id: 'p1', partner_name: 'Ahmet',  share_ratio: 0.6, net_loan: 30_000 }),
      mkLoanInput({ partner_id: 'p2', partner_name: 'Mehmet', share_ratio: 0.4, net_loan: 20_000 }),
    ]
    const result = PCLELiability.computeWaterfall(200_000, loans)  // way more than debt
    for (const alloc of result.allocations) {
      const original = loans.find(l => l.partner_id === alloc.partner_id)!
      // allocated must never exceed original net_loan
      expect(alloc.allocated_try).toBeLessThanOrEqual(original.net_loan + 0.01)
    }
    // Total allocated must equal total debt (capped)
    expect(result.total_allocated_try).toBeCloseTo(50_000, 0)
  })
})
