// tests/alert-ids.test.ts
// Verifies stable alert ID semantics introduced in Task 1

import { describe, it, expect } from 'vitest'
import { evaluateAlerts, evaluateCFOAlerts, type AlertInputs, type CFOAccuracyInputs } from '@/lib/engines/alert.engine'

// ── Helpers ──────────────────────────────────────────────────────────────────

const BASE_INPUTS: AlertInputs = {
  overdueCount30:           2,
  overdueTotal30:           50_000,
  overdueCount60:           0,
  overdueTotal60:           0,
  totalReceivables:         50_000,
  cashRunwayDays:          -1,
  monthlyNetIncome:         100_000,
  maxBurdenScoreAbs:        0,
  nextTrancheDueDays:      -1,
  nextTrancheAmount:        0,
  openPeriodDaysOverdue:   -1,
  kdvPayable:               0,
  taxDueDays:              -1,
  bsImbalanceTry:           0,
  legalReserveDeficit:      0,
  equityGapTry:             0,
  equityCallOverdueDays:   -1,
  debtServiceRatio:         0,
  partnerLoanConcentration: 0,
}

const CFO_INPUTS: CFOAccuracyInputs = {
  trialBalanceImbalance:  5.00,
  cashBookBalance:        100_000,
  bankStatementBalance:   99_000,
  fifoIntegrityIssues:    0,
  legalReserveShortfall:  0,
}

const COMPANY_A = 'company-aaa-uuid'
const COMPANY_B = 'company-bbb-uuid'

// ─────────────────────────────────────────────────────────────────────────────
// Stable ID tests
// ─────────────────────────────────────────────────────────────────────────────

describe('alert stable IDs', () => {

  it('same inputs produce the same alert ids on repeated calls', () => {
    const run1 = evaluateAlerts(BASE_INPUTS).map(a => a.id)
    const run2 = evaluateAlerts(BASE_INPUTS).map(a => a.id)
    expect(run1).toEqual(run2)
  })

  it('different companyIds produce different CFO alert ids', () => {
    const alertsA = evaluateCFOAlerts(CFO_INPUTS, COMPANY_A)
    const alertsB = evaluateCFOAlerts(CFO_INPUTS, COMPANY_B)

    const idsA = alertsA.map(a => a.id)
    const idsB = alertsB.map(a => a.id)

    // Both should fire alerts, and their ids should differ
    expect(idsA.length).toBeGreaterThan(0)
    expect(idsB.length).toBeGreaterThan(0)
    // At least one id from A is not in B's id set (different company suffix)
    const bSet = new Set(idsB)
    expect(idsA.some(id => !bSet.has(id))).toBe(true)
  })

  it('alert id format matches TYPE_resourceId pattern', () => {
    const alerts = evaluateAlerts(BASE_INPUTS)
    expect(alerts.length).toBeGreaterThan(0)
    for (const alert of alerts) {
      // id must be non-empty and contain an underscore separator
      expect(alert.id).toBeTruthy()
      expect(alert.id).toContain('_')
      // id should start with the rule_type
      expect(alert.id.startsWith(alert.rule_type)).toBe(true)
    }
  })

  it('triggeredAt is a valid ISO string', () => {
    const alerts = evaluateAlerts(BASE_INPUTS)
    expect(alerts.length).toBeGreaterThan(0)
    for (const alert of alerts) {
      expect(alert.triggeredAt).toBeTruthy()
      // Must parse as a valid date
      const d = new Date(alert.triggeredAt)
      expect(d.getTime()).not.toBeNaN()
      // Must have the ISO format signature (contains 'T' and 'Z' or offset)
      expect(alert.triggeredAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    }
  })

  it('resolvedWhen is a non-empty string when present', () => {
    const alerts = evaluateAlerts(BASE_INPUTS)
    expect(alerts.length).toBeGreaterThan(0)
    for (const alert of alerts) {
      if (alert.resolvedWhen !== undefined) {
        expect(typeof alert.resolvedWhen).toBe('string')
        expect(alert.resolvedWhen.length).toBeGreaterThan(0)
      }
    }
    // Verify at least one alert in the set has a resolvedWhen
    const withResolved = alerts.filter(a => a.resolvedWhen)
    expect(withResolved.length).toBeGreaterThan(0)
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// evaluateAlerts — threshold / boundary tests
// ─────────────────────────────────────────────────────────────────────────────

describe('evaluateAlerts — thresholds', () => {

  it('fires RECEIVABLE_30 when overdueCount30 > 0 and overdueTotal30 > 500', () => {
    const alerts = evaluateAlerts({ ...BASE_INPUTS, overdueCount30: 1, overdueTotal30: 501 })
    expect(alerts.some(a => a.rule_type === 'RECEIVABLE_30')).toBe(true)
  })

  it('does NOT fire RECEIVABLE_30 when overdueTotal30 <= 500', () => {
    const alerts = evaluateAlerts({ ...BASE_INPUTS, overdueCount30: 5, overdueTotal30: 500 })
    expect(alerts.some(a => a.rule_type === 'RECEIVABLE_30')).toBe(false)
  })

  it('does NOT fire RECEIVABLE_30 when overdueCount30 is 0', () => {
    const alerts = evaluateAlerts({ ...BASE_INPUTS, overdueCount30: 0, overdueTotal30: 50_000 })
    expect(alerts.some(a => a.rule_type === 'RECEIVABLE_30')).toBe(false)
  })

  it('fires RECEIVABLE_60 with critical severity', () => {
    const alerts = evaluateAlerts({
      ...BASE_INPUTS,
      overdueCount60: 1,
      overdueTotal60: 10_000,
    })
    const alert = alerts.find(a => a.rule_type === 'RECEIVABLE_60')
    expect(alert).toBeDefined()
    expect(alert?.severity).toBe('critical')
  })

  it('fires CASH_RUNWAY_90 when cashRunwayDays is between 31 and 90', () => {
    const alerts = evaluateAlerts({ ...BASE_INPUTS, cashRunwayDays: 60 })
    expect(alerts.some(a => a.rule_type === 'CASH_RUNWAY_90')).toBe(true)
  })

  it('fires CASH_RUNWAY_30 when cashRunwayDays is 0–30', () => {
    const alerts = evaluateAlerts({ ...BASE_INPUTS, cashRunwayDays: 15 })
    expect(alerts.some(a => a.rule_type === 'CASH_RUNWAY_30')).toBe(true)
  })

  it('does NOT fire cash runway when cashRunwayDays is -1 (profitable)', () => {
    const alerts = evaluateAlerts({ ...BASE_INPUTS, cashRunwayDays: -1 })
    expect(alerts.some(a => a.rule_type === 'CASH_RUNWAY_30')).toBe(false)
    expect(alerts.some(a => a.rule_type === 'CASH_RUNWAY_90')).toBe(false)
  })

  it('fires PARTNER_BURDEN when maxBurdenScoreAbs > 0.20', () => {
    const alerts = evaluateAlerts({ ...BASE_INPUTS, maxBurdenScoreAbs: 0.21 })
    expect(alerts.some(a => a.rule_type === 'PARTNER_BURDEN')).toBe(true)
  })

  it('does NOT fire PARTNER_BURDEN when maxBurdenScoreAbs <= 0.20', () => {
    const alerts = evaluateAlerts({ ...BASE_INPUTS, maxBurdenScoreAbs: 0.20 })
    expect(alerts.some(a => a.rule_type === 'PARTNER_BURDEN')).toBe(false)
  })

  it('fires PARTNER_LOAN_DUE when nextTrancheDueDays <= 14', () => {
    const alerts = evaluateAlerts({
      ...BASE_INPUTS,
      nextTrancheDueDays: 7,
      nextTrancheAmount: 50_000,
    })
    expect(alerts.some(a => a.rule_type === 'PARTNER_LOAN_DUE')).toBe(true)
  })

  it('fires BS_IMBALANCED when bsImbalanceTry > 100', () => {
    const alerts = evaluateAlerts({ ...BASE_INPUTS, bsImbalanceTry: 101 })
    const alert = alerts.find(a => a.rule_type === 'BS_IMBALANCED')
    expect(alert).toBeDefined()
    expect(alert?.severity).toBe('critical')
  })

  it('does NOT fire BS_IMBALANCED when bsImbalanceTry <= 100', () => {
    const alerts = evaluateAlerts({ ...BASE_INPUTS, bsImbalanceTry: 100 })
    expect(alerts.some(a => a.rule_type === 'BS_IMBALANCED')).toBe(false)
  })

  it('fires DSR_STRAINED for debtServiceRatio in (0.50, 0.70]', () => {
    const alerts = evaluateAlerts({ ...BASE_INPUTS, debtServiceRatio: 0.60 })
    expect(alerts.some(a => a.rule_type === 'DSR_STRAINED')).toBe(true)
    expect(alerts.some(a => a.rule_type === 'DSR_HIGH')).toBe(false)
  })

  it('fires DSR_HIGH for debtServiceRatio > 0.70', () => {
    const alerts = evaluateAlerts({ ...BASE_INPUTS, debtServiceRatio: 0.75 })
    expect(alerts.some(a => a.rule_type === 'DSR_HIGH')).toBe(true)
    expect(alerts.some(a => a.rule_type === 'DSR_STRAINED')).toBe(false)
  })

  it('fires CONCENTRATION when partnerLoanConcentration > 0.80', () => {
    const alerts = evaluateAlerts({ ...BASE_INPUTS, partnerLoanConcentration: 0.85 })
    expect(alerts.some(a => a.rule_type === 'CONCENTRATION')).toBe(true)
  })

  it('returns alerts sorted: critical before warning before info', () => {
    const alerts = evaluateAlerts({
      ...BASE_INPUTS,
      overdueCount60: 1,
      overdueTotal60: 10_000,
      overdueCount30: 2,
      overdueTotal30: 50_000,
    })
    const severities = alerts.map(a => a.severity)
    for (let i = 0; i < severities.length - 1; i++) {
      const order: Record<string, number> = { critical: 0, warning: 1, info: 2 }
      expect(order[severities[i]]).toBeLessThanOrEqual(order[severities[i + 1]])
    }
  })

  it('fires no alerts when all inputs are at safe levels', () => {
    const safeInputs: AlertInputs = {
      overdueCount30:           0,
      overdueTotal30:           0,
      overdueCount60:           0,
      overdueTotal60:           0,
      totalReceivables:         0,
      cashRunwayDays:          -1,
      monthlyNetIncome:         50_000,
      maxBurdenScoreAbs:        0,
      nextTrancheDueDays:      -1,
      nextTrancheAmount:        0,
      openPeriodDaysOverdue:   -1,
      kdvPayable:               0,
      taxDueDays:              -1,
      bsImbalanceTry:           0,
      legalReserveDeficit:      0,
      equityGapTry:             0,
      equityCallOverdueDays:   -1,
      debtServiceRatio:         0,
      partnerLoanConcentration: 0,
    }
    const alerts = evaluateAlerts(safeInputs)
    expect(alerts).toHaveLength(0)
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// evaluateCFOAlerts — threshold tests
// ─────────────────────────────────────────────────────────────────────────────

describe('evaluateCFOAlerts — thresholds', () => {

  it('fires BS_IMBALANCED (critical) for trialBalanceImbalance >= 1.00', () => {
    const alerts = evaluateCFOAlerts({ ...CFO_INPUTS, trialBalanceImbalance: 1.00, bankStatementBalance: undefined }, COMPANY_A)
    expect(alerts.some(a => a.rule_type === 'BS_IMBALANCED' && a.severity === 'critical')).toBe(true)
  })

  it('fires BS_ROUNDING (warning) for imbalance in [0.01, 1.00)', () => {
    const alerts = evaluateCFOAlerts({
      ...CFO_INPUTS,
      trialBalanceImbalance: 0.50,
      bankStatementBalance: undefined,
    }, COMPANY_A)
    expect(alerts.some(a => a.rule_type === 'BS_ROUNDING' && a.severity === 'warning')).toBe(true)
  })

  it('does NOT fire BS_ROUNDING when imbalance is 0', () => {
    const alerts = evaluateCFOAlerts({
      ...CFO_INPUTS,
      trialBalanceImbalance: 0,
      bankStatementBalance: undefined,
    }, COMPANY_A)
    expect(alerts.some(a => a.rule_type === 'BS_ROUNDING')).toBe(false)
  })

  it('fires BANK_RECONCILIATION_GAP when |cashBook - bankStatement| > 100', () => {
    const alerts = evaluateCFOAlerts({
      ...CFO_INPUTS,
      trialBalanceImbalance: 0,
      cashBookBalance:      100_000,
      bankStatementBalance: 99_000,
    }, COMPANY_A)
    expect(alerts.some(a => a.rule_type === 'BANK_RECONCILIATION_GAP')).toBe(true)
  })

  it('does NOT fire BANK_RECONCILIATION_GAP when bankStatementBalance is undefined', () => {
    const alerts = evaluateCFOAlerts({
      ...CFO_INPUTS,
      trialBalanceImbalance: 0,
      bankStatementBalance: undefined,
    }, COMPANY_A)
    expect(alerts.some(a => a.rule_type === 'BANK_RECONCILIATION_GAP')).toBe(false)
  })

  it('fires FIFO_INTEGRITY when fifoIntegrityIssues > 0', () => {
    const alerts = evaluateCFOAlerts({
      ...CFO_INPUTS,
      trialBalanceImbalance: 0,
      bankStatementBalance: undefined,
      fifoIntegrityIssues: 3,
    }, COMPANY_A)
    const alert = alerts.find(a => a.rule_type === 'FIFO_INTEGRITY')
    expect(alert).toBeDefined()
    expect(alert?.severity).toBe('critical')
  })

  it('fires LEGAL_RESERVE_SHORTFALL when legalReserveShortfall > 0', () => {
    const alerts = evaluateCFOAlerts({
      ...CFO_INPUTS,
      trialBalanceImbalance: 0,
      bankStatementBalance: undefined,
      legalReserveShortfall: 5_000,
    }, COMPANY_A)
    expect(alerts.some(a => a.rule_type === 'LEGAL_RESERVE_SHORTFALL')).toBe(true)
  })

  it('CFO alert ids embed the companyId', () => {
    const alerts = evaluateCFOAlerts(CFO_INPUTS, COMPANY_A)
    for (const alert of alerts) {
      expect(alert.id).toContain(COMPANY_A)
    }
  })

  it('returns empty array when all CFO inputs are at safe levels', () => {
    const safeInputs: CFOAccuracyInputs = {
      trialBalanceImbalance: 0,
      cashBookBalance:       100_000,
      bankStatementBalance:  100_000,
      fifoIntegrityIssues:   0,
      legalReserveShortfall: 0,
    }
    const alerts = evaluateCFOAlerts(safeInputs, COMPANY_A)
    expect(alerts).toHaveLength(0)
  })

})
