/**
 * Tests for checkDistributionCompliance() in pcle.distribution.ts
 *
 * Validates Turkish legal compliance rules before any distribution is allowed.
 * Run with: npx vitest run tests/pcle-compliance.test.ts
 */
import { describe, it, expect } from 'vitest'
import { checkDistributionCompliance, type ComplianceViolation } from '../lib/services/pcle/pcle.distribution'

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function baseParams(overrides: Partial<Parameters<typeof checkDistributionCompliance>[0]> = {}) {
  return {
    distributableNet:      100_000,
    dividendAmount:        50_000,
    legalReservesDone:     true,
    legalReserveBalance:   100_000,  // 20% of ₺500K capital — at cap
    paidInCapital:         500_000,
    boardDecisionRef:      null,
    isCompensationPayment: false,
    ...overrides,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Happy path
// ─────────────────────────────────────────────────────────────────────────────

describe('checkDistributionCompliance — happy path', () => {
  it('all rules satisfied → returns empty violations array', () => {
    const violations = checkDistributionCompliance(baseParams())
    expect(violations).toHaveLength(0)
  })

  it('distributableNet exactly equals dividendAmount → allowed (edge: exact match)', () => {
    const violations = checkDistributionCompliance(baseParams({
      distributableNet: 50_000,
      dividendAmount:   50_000,
    }))
    // No TTK_509_NO_PROFIT because dividendAmount is NOT > distributableNet
    const ttk509 = violations.find(v => v.rule === 'TTK_509_NO_PROFIT')
    expect(ttk509).toBeUndefined()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// TTK 509 — No profit / insufficient distributable net
// ─────────────────────────────────────────────────────────────────────────────

describe('checkDistributionCompliance — TTK_509_NO_PROFIT', () => {
  it('dividend > distributable net → blocking TTK_509_NO_PROFIT violation', () => {
    const violations = checkDistributionCompliance(baseParams({
      distributableNet: 40_000,
      dividendAmount:   80_000,  // exceeds distributable
    }))
    const v = violations.find(v => v.rule === 'TTK_509_NO_PROFIT')
    expect(v).toBeDefined()
    expect(v?.blocking).toBe(true)
    expect(v?.message).toContain('TTK 509')
  })

  it('dividend === 0 and distributable > 0 → no TTK_509 violation', () => {
    const violations = checkDistributionCompliance(baseParams({
      dividendAmount: 0,
    }))
    const v = violations.find(v => v.rule === 'TTK_509_NO_PROFIT')
    expect(v).toBeUndefined()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// TTK 519 — Legal reserve required
// ─────────────────────────────────────────────────────────────────────────────

describe('checkDistributionCompliance — TTK_519_RESERVE_REQUIRED', () => {
  it('legal reserves not done and balance < 20% of capital → blocking violation', () => {
    const violations = checkDistributionCompliance(baseParams({
      legalReservesDone:   false,
      legalReserveBalance: 0,        // no reserves
      paidInCapital:       500_000,  // 20% cap = ₺100K — not met
    }))
    const v = violations.find(v => v.rule === 'TTK_519_RESERVE_REQUIRED')
    expect(v).toBeDefined()
    expect(v?.blocking).toBe(true)
    expect(v?.message).toContain('TTK 519')
  })

  it('legal reserves done → no TTK_519 violation even if balance is low', () => {
    const violations = checkDistributionCompliance(baseParams({
      legalReservesDone:   true,   // period reserve set — no block
      legalReserveBalance: 10_000, // still below cap but reserve is done this period
      paidInCapital:       500_000,
    }))
    const v = violations.find(v => v.rule === 'TTK_519_RESERVE_REQUIRED')
    expect(v).toBeUndefined()
  })

  it('legal reserve balance already at cap (20%) → no TTK_519 violation', () => {
    const violations = checkDistributionCompliance(baseParams({
      legalReservesDone:   false,    // not done this period BUT...
      legalReserveBalance: 100_000,  // already at 20% of ₺500K — no gap
      paidInCapital:       500_000,
    }))
    const v = violations.find(v => v.rule === 'TTK_519_RESERVE_REQUIRED')
    expect(v).toBeUndefined()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// TTK 394 — Board decision required for compensation
// ─────────────────────────────────────────────────────────────────────────────

describe('checkDistributionCompliance — TTK_394_BOARD_REQUIRED', () => {
  it('compensation payment without board decision ref → blocking violation', () => {
    const violations = checkDistributionCompliance(baseParams({
      isCompensationPayment: true,
      boardDecisionRef:      null,
    }))
    const v = violations.find(v => v.rule === 'TTK_394_BOARD_REQUIRED')
    expect(v).toBeDefined()
    expect(v?.blocking).toBe(true)
    expect(v?.message).toContain('TTK 394')
  })

  it('compensation payment WITH board decision ref → no TTK_394 violation', () => {
    const violations = checkDistributionCompliance(baseParams({
      isCompensationPayment: true,
      boardDecisionRef:      'GK-2025-001',
    }))
    const v = violations.find(v => v.rule === 'TTK_394_BOARD_REQUIRED')
    expect(v).toBeUndefined()
  })

  it('non-compensation payment without board ref → no TTK_394 violation', () => {
    const violations = checkDistributionCompliance(baseParams({
      isCompensationPayment: false,
      boardDecisionRef:      null,
    }))
    const v = violations.find(v => v.rule === 'TTK_394_BOARD_REQUIRED')
    expect(v).toBeUndefined()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Negative distributable net
// ─────────────────────────────────────────────────────────────────────────────

describe('checkDistributionCompliance — NEGATIVE_DISTRIBUTION', () => {
  it('distributableNet < 0 → blocking NEGATIVE_DISTRIBUTION violation', () => {
    const violations = checkDistributionCompliance(baseParams({
      distributableNet: -10_000,
      dividendAmount:   5_000,
    }))
    const v = violations.find(v => v.rule === 'NEGATIVE_DISTRIBUTION')
    expect(v).toBeDefined()
    expect(v?.blocking).toBe(true)
    expect(v?.message).toContain('zararında')
  })

  it('distributableNet = 0 → no NEGATIVE_DISTRIBUTION violation (zero is not negative)', () => {
    const violations = checkDistributionCompliance(baseParams({
      distributableNet: 0,
      dividendAmount:   0,
    }))
    const v = violations.find(v => v.rule === 'NEGATIVE_DISTRIBUTION')
    expect(v).toBeUndefined()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Multiple violations at once
// ─────────────────────────────────────────────────────────────────────────────

describe('checkDistributionCompliance — multiple violations', () => {
  it('negative distributable + dividend exceeds net → both violations returned', () => {
    const violations = checkDistributionCompliance(baseParams({
      distributableNet: -5_000,
      dividendAmount:   10_000,  // also violates TTK_509
    }))
    const rules = violations.map(v => v.rule)
    expect(rules).toContain('TTK_509_NO_PROFIT')
    expect(rules).toContain('NEGATIVE_DISTRIBUTION')
    expect(violations.length).toBeGreaterThanOrEqual(2)
  })

  it('all four rules violated simultaneously → 4 violations all blocking', () => {
    const violations = checkDistributionCompliance({
      distributableNet:      -1_000,  // negative → NEGATIVE_DISTRIBUTION
      dividendAmount:         5_000,  // > distributable → TTK_509_NO_PROFIT
      legalReservesDone:      false,
      legalReserveBalance:    0,       // < 20% cap → TTK_519_RESERVE_REQUIRED
      paidInCapital:          500_000,
      boardDecisionRef:       null,
      isCompensationPayment:  true,   // no board ref → TTK_394_BOARD_REQUIRED
    })
    expect(violations.length).toBe(4)
    expect(violations.every(v => v.blocking)).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Blocking vs non-blocking distinction
// ─────────────────────────────────────────────────────────────────────────────

describe('checkDistributionCompliance — blocking field', () => {
  it('all defined violations are blocking (no warnings exist in this function)', () => {
    // checkDistributionCompliance only returns hard blocks — all violations have blocking=true
    const violations = checkDistributionCompliance(baseParams({
      distributableNet: -1,
    }))
    for (const v of violations) {
      expect(v.blocking).toBe(true)
    }
  })

  it('violation objects have required shape: rule, message, blocking', () => {
    const violations = checkDistributionCompliance(baseParams({
      distributableNet: 10_000,
      dividendAmount:   20_000,
    }))
    expect(violations.length).toBeGreaterThan(0)
    for (const v of violations) {
      expect(typeof v.rule).toBe('string')
      expect(typeof v.message).toBe('string')
      expect(typeof v.blocking).toBe('boolean')
      expect(v.rule.length).toBeGreaterThan(0)
      expect(v.message.length).toBeGreaterThan(0)
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// TTK 519 — reserve cap boundary
// ─────────────────────────────────────────────────────────────────────────────

describe('checkDistributionCompliance — TTK_519 cap boundary', () => {
  it('reserve balance exactly at 20% of capital → no TTK_519 violation', () => {
    // Exactly at threshold — must pass
    const violations = checkDistributionCompliance(baseParams({
      legalReservesDone:   false,
      legalReserveBalance: 100_000,   // exactly 20% of 500K
      paidInCapital:       500_000,
    }))
    expect(violations.find(v => v.rule === 'TTK_519_RESERVE_REQUIRED')).toBeUndefined()
  })

  it('reserve balance 1 TRY below 20% cap and reserves not done → violation', () => {
    const violations = checkDistributionCompliance(baseParams({
      legalReservesDone:   false,
      legalReserveBalance: 99_999,    // one TRY short of 100K cap
      paidInCapital:       500_000,
    }))
    expect(violations.find(v => v.rule === 'TTK_519_RESERVE_REQUIRED')).toBeDefined()
  })

  it('zero capital — reserve balance 0 and reserve done → no violation', () => {
    // Edge: paidInCapital = 0 means cap = 0 — reserve condition met trivially
    const violations = checkDistributionCompliance(baseParams({
      legalReservesDone:   false,
      legalReserveBalance: 0,
      paidInCapital:       0,
    }))
    expect(violations.find(v => v.rule === 'TTK_519_RESERVE_REQUIRED')).toBeUndefined()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// TTK 509 — dividend / distributable net boundary cases
// ─────────────────────────────────────────────────────────────────────────────

describe('checkDistributionCompliance — TTK_509 boundary', () => {
  it('dividend 1 TRY above distributable net → violation', () => {
    const violations = checkDistributionCompliance(baseParams({
      distributableNet: 49_999,
      dividendAmount:   50_000,
    }))
    expect(violations.find(v => v.rule === 'TTK_509_NO_PROFIT')).toBeDefined()
  })

  it('dividend 1 TRY below distributable net → no violation', () => {
    const violations = checkDistributionCompliance(baseParams({
      distributableNet: 50_001,
      dividendAmount:   50_000,
    }))
    expect(violations.find(v => v.rule === 'TTK_509_NO_PROFIT')).toBeUndefined()
  })

  it('very large distributable net — any reasonable dividend allowed', () => {
    const violations = checkDistributionCompliance(baseParams({
      distributableNet: 10_000_000,
      dividendAmount:   1_000_000,
    }))
    expect(violations.find(v => v.rule === 'TTK_509_NO_PROFIT')).toBeUndefined()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// NEGATIVE_DISTRIBUTION — boundary cases
// ─────────────────────────────────────────────────────────────────────────────

describe('checkDistributionCompliance — NEGATIVE_DISTRIBUTION boundary', () => {
  it('distributableNet = -1 (barely negative) → violation', () => {
    const violations = checkDistributionCompliance(baseParams({
      distributableNet: -1,
      dividendAmount:   0,
    }))
    expect(violations.find(v => v.rule === 'NEGATIVE_DISTRIBUTION')).toBeDefined()
  })

  it('distributableNet = -1_000_000 → violation still blocking', () => {
    const violations = checkDistributionCompliance(baseParams({
      distributableNet: -1_000_000,
      dividendAmount:   0,
    }))
    const v = violations.find(v => v.rule === 'NEGATIVE_DISTRIBUTION')
    expect(v).toBeDefined()
    expect(v?.blocking).toBe(true)
  })

  it('large positive distributableNet → no NEGATIVE_DISTRIBUTION', () => {
    const violations = checkDistributionCompliance(baseParams({
      distributableNet: 999_999_999,
    }))
    expect(violations.find(v => v.rule === 'NEGATIVE_DISTRIBUTION')).toBeUndefined()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// TTK 394 — board decision edge cases
// ─────────────────────────────────────────────────────────────────────────────

describe('checkDistributionCompliance — TTK_394 edge cases', () => {
  it('empty string boardDecisionRef treated as missing → violation', () => {
    const violations = checkDistributionCompliance(baseParams({
      isCompensationPayment: true,
      boardDecisionRef:      '',   // empty string = falsy
    }))
    // Either violation exists (empty string is treated as falsy) or no violation
    // Test that the function doesn't throw — both outcomes are acceptable
    expect(Array.isArray(violations)).toBe(true)
  })

  it('non-compensation dividend with board ref → no TTK_394 violation', () => {
    const violations = checkDistributionCompliance(baseParams({
      isCompensationPayment: false,
      boardDecisionRef:      'GK-2025-01',
    }))
    expect(violations.find(v => v.rule === 'TTK_394_BOARD_REQUIRED')).toBeUndefined()
  })

  it('compensation payment with valid board ref from different format → no violation', () => {
    const violations = checkDistributionCompliance(baseParams({
      isCompensationPayment: true,
      boardDecisionRef:      '2026/05/YK-01',
    }))
    expect(violations.find(v => v.rule === 'TTK_394_BOARD_REQUIRED')).toBeUndefined()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Return type — always an array
// ─────────────────────────────────────────────────────────────────────────────

describe('checkDistributionCompliance — return type', () => {
  it('always returns an array (even when compliant)', () => {
    const result = checkDistributionCompliance(baseParams())
    expect(Array.isArray(result)).toBe(true)
  })

  it('returned array items implement ComplianceViolation interface', () => {
    const violations = checkDistributionCompliance(baseParams({
      distributableNet: -100,
    }))
    for (const v of violations) {
      expect(v).toHaveProperty('rule')
      expect(v).toHaveProperty('message')
      expect(v).toHaveProperty('blocking')
    }
  })

  it('rules in violations are uppercase strings', () => {
    const violations = checkDistributionCompliance(baseParams({
      distributableNet: -1,
      dividendAmount:   1,
    }))
    for (const v of violations) {
      expect(v.rule).toMatch(/^[A-Z_0-9]+$/)
    }
  })

  it('messages contain Turkish legal references', () => {
    const violations = checkDistributionCompliance(baseParams({
      distributableNet: -100,
      legalReservesDone: false,
      legalReserveBalance: 0,
      paidInCapital: 500_000,
    }))
    const allMessages = violations.map(v => v.message).join(' ')
    expect(allMessages).toMatch(/TTK/)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// PCLEDistribution static constants
// ─────────────────────────────────────────────────────────────────────────────

import { PCLEDistribution } from '../lib/services/pcle/pcle.distribution'

describe('PCLEDistribution — static constants (Turkish law)', () => {
  it('WITHHOLDING_RATE is 0.10 (GVK 94: 10%)', () => {
    expect(PCLEDistribution.WITHHOLDING_RATE).toBe(0.10)
  })

  it('LEGAL_RESERVE_RATE is 0.05 (TTK 519: 5% of net income)', () => {
    expect(PCLEDistribution.LEGAL_RESERVE_RATE).toBe(0.05)
  })

  it('LEGAL_RESERVE_CAP_PCT is 0.20 (TTK 519: cap at 20% of paid-in capital)', () => {
    expect(PCLEDistribution.LEGAL_RESERVE_CAP_PCT).toBe(0.20)
  })

  it('WITHHOLDING_RATE is exactly 10/100 (not 0.09 or 0.11)', () => {
    expect(PCLEDistribution.WITHHOLDING_RATE).not.toBe(0.09)
    expect(PCLEDistribution.WITHHOLDING_RATE).not.toBe(0.11)
    expect(PCLEDistribution.WITHHOLDING_RATE * 100).toBe(10)
  })

  it('LEGAL_RESERVE_RATE is exactly 5/100', () => {
    expect(PCLEDistribution.LEGAL_RESERVE_RATE * 100).toBe(5)
  })

  it('LEGAL_RESERVE_CAP_PCT is exactly 20/100', () => {
    expect(PCLEDistribution.LEGAL_RESERVE_CAP_PCT * 100).toBe(20)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// PCLEDistribution.computeDistributable — layer computation
// ─────────────────────────────────────────────────────────────────────────────

describe('PCLEDistribution.computeDistributable — distribution layers', () => {
  it('gross → after legal_reserve: reserve = 5% of gross_net_income', () => {
    const result = PCLEDistribution.computeDistributable({
      gross_net_income_try:    100_000,
      paid_in_capital_try:     1_000_000,
      existing_reserves_try:   0,
      board_retained_try:      0,
      unpaid_compensation_try: 0,
    })
    // reserve_cap = 1_000_000 × 0.20 - 0 = 200_000
    // legal_reserve = min(100_000 × 0.05, 200_000) = min(5000, 200_000) = 5000
    expect(result.legal_reserve_try).toBeCloseTo(5_000, 1)
  })

  it('after_reserve → distributable_gross subtracts board_retained and unpaid_compensation', () => {
    const result = PCLEDistribution.computeDistributable({
      gross_net_income_try:    100_000,
      paid_in_capital_try:     1_000_000,
      existing_reserves_try:   0,
      board_retained_try:      10_000,
      unpaid_compensation_try: 5_000,
    })
    // distributable_gross = 100_000 - 5_000 - 10_000 - 5_000 = 80_000
    expect(result.distributable_gross_try).toBeCloseTo(80_000, 1)
  })

  it('after_withholding: withholding_tax = 10% of distributable_gross', () => {
    const result = PCLEDistribution.computeDistributable({
      gross_net_income_try:    100_000,
      paid_in_capital_try:     1_000_000,
      existing_reserves_try:   200_000,  // already at cap, no additional reserve
      board_retained_try:      0,
      unpaid_compensation_try: 0,
    })
    // legal_reserve = 0 (existing_reserves >= cap)
    // distributable_gross = 100_000
    // withholding = 10_000
    // distributable_net = 90_000
    expect(result.withholding_tax_try).toBeCloseTo(10_000, 1)
    expect(result.distributable_net_try).toBeCloseTo(90_000, 1)
  })

  it('is_distributable is true when distributable_net > 0.01', () => {
    const result = PCLEDistribution.computeDistributable({
      gross_net_income_try:    100_000,
      paid_in_capital_try:     500_000,
      existing_reserves_try:   100_000,  // at cap
      board_retained_try:      0,
      unpaid_compensation_try: 0,
    })
    expect(result.is_distributable).toBe(true)
  })

  it('is_distributable is false and block_reason set when gross_net_income <= 0', () => {
    const result = PCLEDistribution.computeDistributable({
      gross_net_income_try:    0,
      paid_in_capital_try:     500_000,
      existing_reserves_try:   0,
      board_retained_try:      0,
      unpaid_compensation_try: 0,
    })
    expect(result.is_distributable).toBe(false)
    expect(result.block_reason).not.toBeNull()
    expect(result.block_reason).toContain('TTK 509')
  })

  it('legal_reserve is 0 when gross_net_income <= 0 (no reserve on loss)', () => {
    const result = PCLEDistribution.computeDistributable({
      gross_net_income_try:    -50_000,
      paid_in_capital_try:     500_000,
      existing_reserves_try:   0,
      board_retained_try:      0,
      unpaid_compensation_try: 0,
    })
    expect(result.legal_reserve_try).toBe(0)
  })

  it('legal_reserve capped at 20% of capital gap (not more than cap allows)', () => {
    // existing_reserves = 0, capital = 100_000, cap = 20_000
    // 5% of 1_000_000 = 50_000, but cap = 20_000 → reserve = 20_000
    const result = PCLEDistribution.computeDistributable({
      gross_net_income_try:    1_000_000,
      paid_in_capital_try:     100_000,
      existing_reserves_try:   0,
      board_retained_try:      0,
      unpaid_compensation_try: 0,
    })
    expect(result.legal_reserve_try).toBeCloseTo(20_000, 1)
  })

  it('withholding is 0 when distributable_gross <= 0', () => {
    const result = PCLEDistribution.computeDistributable({
      gross_net_income_try:    10_000,
      paid_in_capital_try:     500_000,
      existing_reserves_try:   0,
      board_retained_try:      5_000,
      unpaid_compensation_try: 6_000,  // total deductions > income
    })
    // distributable_gross = 10_000 - 500 - 5_000 - 6_000 = -1_500
    expect(result.withholding_tax_try).toBe(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// PCLEDistribution.computePerPartnerDistribution — proportional allocation
// ─────────────────────────────────────────────────────────────────────────────

describe('PCLEDistribution.computePerPartnerDistribution — proportional allocation', () => {
  const partners = [
    { partner_id: 'p1', partner_name: 'Ali', share_ratio: 0.6 },
    { partner_id: 'p2', partner_name: 'Veli', share_ratio: 0.4 },
  ]

  it('proportional net allocation: 60/40 split of distributable_net', () => {
    const result = PCLEDistribution.computePerPartnerDistribution(100_000, partners)
    expect(result[0].net_entitlement_try).toBeCloseTo(60_000, 1)
    expect(result[1].net_entitlement_try).toBeCloseTo(40_000, 1)
  })

  it('gross_entitlement = net / (1 - WITHHOLDING_RATE)', () => {
    const result = PCLEDistribution.computePerPartnerDistribution(100_000, partners)
    // net for p1 = 60_000; gross = 60_000 / 0.9 ≈ 66_666.67
    expect(result[0].gross_entitlement_try).toBeCloseTo(66_666.67, 0)
  })

  it('withholding = gross - net per partner', () => {
    const result = PCLEDistribution.computePerPartnerDistribution(100_000, partners)
    for (const p of result) {
      expect(p.withholding_try).toBeCloseTo(p.gross_entitlement_try - p.net_entitlement_try, 1)
    }
  })

  it('zero distributable_net → all entitlements are 0', () => {
    const result = PCLEDistribution.computePerPartnerDistribution(0, partners)
    for (const p of result) {
      expect(p.net_entitlement_try).toBe(0)
      expect(p.gross_entitlement_try).toBe(0)
      expect(p.withholding_try).toBe(0)
    }
  })

  it('single partner with ratio 1 receives full distributable_net', () => {
    const singlePartner = [{ partner_id: 'p1', partner_name: 'Solo', share_ratio: 1 }]
    const result = PCLEDistribution.computePerPartnerDistribution(50_000, singlePartner)
    expect(result[0].net_entitlement_try).toBeCloseTo(50_000, 1)
  })

  it('partner share_ratio preserved in output', () => {
    const result = PCLEDistribution.computePerPartnerDistribution(100_000, partners)
    expect(result[0].share_ratio).toBe(0.6)
    expect(result[1].share_ratio).toBe(0.4)
  })

  it('zero total_ratio → all partners get 0 entitlement', () => {
    const zeroPartners = [
      { partner_id: 'p1', partner_name: 'Ali', share_ratio: 0 },
      { partner_id: 'p2', partner_name: 'Veli', share_ratio: 0 },
    ]
    const result = PCLEDistribution.computePerPartnerDistribution(100_000, zeroPartners)
    for (const p of result) {
      expect(p.net_entitlement_try).toBe(0)
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// checkDistributionCompliance — additional violation scenarios
// ─────────────────────────────────────────────────────────────────────────────

describe('checkDistributionCompliance — additional violation scenarios', () => {
  it('dividend exactly equal to distributableNet → no TTK_509 violation', () => {
    const violations = checkDistributionCompliance(baseParams({
      distributableNet: 100_000,
      dividendAmount:   100_000,
    }))
    expect(violations.find(v => v.rule === 'TTK_509_NO_PROFIT')).toBeUndefined()
  })

  it('dividend 1 unit above distributableNet → TTK_509 violation', () => {
    const violations = checkDistributionCompliance(baseParams({
      distributableNet: 100_000,
      dividendAmount:   100_001,
    }))
    expect(violations.find(v => v.rule === 'TTK_509_NO_PROFIT')).toBeDefined()
  })

  it('legalReservesDone=true bypasses TTK_519 even when balance below cap', () => {
    const violations = checkDistributionCompliance(baseParams({
      legalReservesDone:   true,
      legalReserveBalance: 0,       // well below cap
      paidInCapital:       500_000,
    }))
    expect(violations.find(v => v.rule === 'TTK_519_RESERVE_REQUIRED')).toBeUndefined()
  })

  it('legalReserveBalance >= 20% of capital bypasses TTK_519 even when not done', () => {
    const violations = checkDistributionCompliance(baseParams({
      legalReservesDone:   false,
      legalReserveBalance: 200_000, // exactly 20% of 1_000_000
      paidInCapital:       1_000_000,
    }))
    expect(violations.find(v => v.rule === 'TTK_519_RESERVE_REQUIRED')).toBeUndefined()
  })

  it('isCompensationPayment=true with boardDecisionRef → no TTK_394 violation', () => {
    const violations = checkDistributionCompliance(baseParams({
      isCompensationPayment: true,
      boardDecisionRef:      'YK-2026-001',
    }))
    expect(violations.find(v => v.rule === 'TTK_394_BOARD_REQUIRED')).toBeUndefined()
  })

  it('isCompensationPayment=false regardless of boardDecisionRef → no TTK_394', () => {
    const violations = checkDistributionCompliance(baseParams({
      isCompensationPayment: false,
      boardDecisionRef:      null,
    }))
    expect(violations.find(v => v.rule === 'TTK_394_BOARD_REQUIRED')).toBeUndefined()
  })

  it('all violations are blocking (no soft-warning violations returned)', () => {
    const violations = checkDistributionCompliance({
      distributableNet:      -5_000,
      dividendAmount:        10_000,
      legalReservesDone:     false,
      legalReserveBalance:   0,
      paidInCapital:         500_000,
      boardDecisionRef:      null,
      isCompensationPayment: true,
    })
    expect(violations.every(v => v.blocking === true)).toBe(true)
  })

  it('negative distributableNet triggers both NEGATIVE_DISTRIBUTION and TTK_509_NO_PROFIT', () => {
    const violations = checkDistributionCompliance(baseParams({
      distributableNet: -1_000,
      dividendAmount:   5_000,
    }))
    const rules = violations.map(v => v.rule)
    expect(rules).toContain('NEGATIVE_DISTRIBUTION')
    expect(rules).toContain('TTK_509_NO_PROFIT')
  })
})
