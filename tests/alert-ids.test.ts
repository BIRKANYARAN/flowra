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

// ─────────────────────────────────────────────────────────────────────────────
// evaluateAlerts — additional rule coverage
// ─────────────────────────────────────────────────────────────────────────────

describe('evaluateAlerts — additional rule coverage', () => {

  it('fires PERIOD_NOT_CLOSED when openPeriodDaysOverdue > 10', () => {
    const alerts = evaluateAlerts({ ...BASE_INPUTS, openPeriodDaysOverdue: 11 })
    expect(alerts.some(a => a.rule_type === 'PERIOD_NOT_CLOSED')).toBe(true)
  })

  it('does NOT fire PERIOD_NOT_CLOSED when openPeriodDaysOverdue <= 10', () => {
    const alerts = evaluateAlerts({ ...BASE_INPUTS, openPeriodDaysOverdue: 10 })
    expect(alerts.some(a => a.rule_type === 'PERIOD_NOT_CLOSED')).toBe(false)
  })

  it('does NOT fire PERIOD_NOT_CLOSED when openPeriodDaysOverdue = -1', () => {
    const alerts = evaluateAlerts({ ...BASE_INPUTS, openPeriodDaysOverdue: -1 })
    expect(alerts.some(a => a.rule_type === 'PERIOD_NOT_CLOSED')).toBe(false)
  })

  it('fires TAX_DUE_SOON when taxDueDays <= 7 and kdvPayable > 50', () => {
    const alerts = evaluateAlerts({ ...BASE_INPUTS, taxDueDays: 3, kdvPayable: 1_000 })
    expect(alerts.some(a => a.rule_type === 'TAX_DUE_SOON')).toBe(true)
  })

  it('does NOT fire TAX_DUE_SOON when kdvPayable <= 50', () => {
    const alerts = evaluateAlerts({ ...BASE_INPUTS, taxDueDays: 1, kdvPayable: 50 })
    expect(alerts.some(a => a.rule_type === 'TAX_DUE_SOON')).toBe(false)
  })

  it('does NOT fire TAX_DUE_SOON when taxDueDays = -1', () => {
    const alerts = evaluateAlerts({ ...BASE_INPUTS, taxDueDays: -1, kdvPayable: 100_000 })
    expect(alerts.some(a => a.rule_type === 'TAX_DUE_SOON')).toBe(false)
  })

  it('fires KDV_LARGE when kdvPayable >= 50_000 and tax not imminent', () => {
    const alerts = evaluateAlerts({ ...BASE_INPUTS, taxDueDays: -1, kdvPayable: 50_000 })
    expect(alerts.some(a => a.rule_type === 'KDV_LARGE')).toBe(true)
  })

  it('does NOT fire KDV_LARGE when kdvPayable < 50_000', () => {
    const alerts = evaluateAlerts({ ...BASE_INPUTS, taxDueDays: -1, kdvPayable: 49_999 })
    expect(alerts.some(a => a.rule_type === 'KDV_LARGE')).toBe(false)
  })

  it('fires KDV_LARGE with warning severity', () => {
    const alerts = evaluateAlerts({ ...BASE_INPUTS, taxDueDays: -1, kdvPayable: 100_000 })
    const alert = alerts.find(a => a.rule_type === 'KDV_LARGE')
    expect(alert?.severity).toBe('warning')
  })

  it('KDV_LARGE and TAX_DUE_SOON do not fire simultaneously', () => {
    // TAX_DUE_SOON fires when taxDueDays <= 7 → KDV_LARGE should NOT fire then
    const alerts = evaluateAlerts({ ...BASE_INPUTS, taxDueDays: 5, kdvPayable: 100_000 })
    const hasTaxDueSoon = alerts.some(a => a.rule_type === 'TAX_DUE_SOON')
    const hasKdvLarge   = alerts.some(a => a.rule_type === 'KDV_LARGE')
    // Either one or the other fires (not both)
    expect(hasTaxDueSoon && hasKdvLarge).toBe(false)
  })

  it('fires LEGAL_RESERVE_LOW when legalReserveDeficit > 0', () => {
    const alerts = evaluateAlerts({ ...BASE_INPUTS, legalReserveDeficit: 5_000 })
    expect(alerts.some(a => a.rule_type === 'LEGAL_RESERVE_LOW')).toBe(true)
  })

  it('LEGAL_RESERVE_LOW has warning severity', () => {
    const alerts = evaluateAlerts({ ...BASE_INPUTS, legalReserveDeficit: 10_000 })
    const alert = alerts.find(a => a.rule_type === 'LEGAL_RESERVE_LOW')
    expect(alert?.severity).toBe('warning')
  })

  it('does NOT fire LEGAL_RESERVE_LOW when legalReserveDeficit = 0', () => {
    const alerts = evaluateAlerts({ ...BASE_INPUTS, legalReserveDeficit: 0 })
    expect(alerts.some(a => a.rule_type === 'LEGAL_RESERVE_LOW')).toBe(false)
  })

  it('fires EQUITY_GAP_OVERDUE when equityGapTry > 0 and equityCallOverdueDays > 0', () => {
    const alerts = evaluateAlerts({ ...BASE_INPUTS, equityGapTry: 50_000, equityCallOverdueDays: 5 })
    expect(alerts.some(a => a.rule_type === 'EQUITY_GAP_OVERDUE')).toBe(true)
  })

  it('does NOT fire EQUITY_GAP_OVERDUE when equityGapTry = 0', () => {
    const alerts = evaluateAlerts({ ...BASE_INPUTS, equityGapTry: 0, equityCallOverdueDays: 30 })
    expect(alerts.some(a => a.rule_type === 'EQUITY_GAP_OVERDUE')).toBe(false)
  })

  it('does NOT fire EQUITY_GAP_OVERDUE when equityCallOverdueDays <= 0', () => {
    const alerts = evaluateAlerts({ ...BASE_INPUTS, equityGapTry: 50_000, equityCallOverdueDays: 0 })
    expect(alerts.some(a => a.rule_type === 'EQUITY_GAP_OVERDUE')).toBe(false)
  })

  it('fires CONCENTRATION when partnerLoanConcentration > 0.80', () => {
    const alerts = evaluateAlerts({ ...BASE_INPUTS, partnerLoanConcentration: 0.81 })
    expect(alerts.some(a => a.rule_type === 'CONCENTRATION')).toBe(true)
  })

  it('does NOT fire CONCENTRATION when partnerLoanConcentration = 0.80', () => {
    const alerts = evaluateAlerts({ ...BASE_INPUTS, partnerLoanConcentration: 0.80 })
    expect(alerts.some(a => a.rule_type === 'CONCENTRATION')).toBe(false)
  })

  it('does NOT fire PARTNER_LOAN_DUE when nextTrancheDueDays > 14', () => {
    const alerts = evaluateAlerts({ ...BASE_INPUTS, nextTrancheDueDays: 15, nextTrancheAmount: 50_000 })
    expect(alerts.some(a => a.rule_type === 'PARTNER_LOAN_DUE')).toBe(false)
  })

  it('does NOT fire PARTNER_LOAN_DUE when nextTrancheDueDays = -1 (no tranche)', () => {
    const alerts = evaluateAlerts({ ...BASE_INPUTS, nextTrancheDueDays: -1, nextTrancheAmount: 100_000 })
    expect(alerts.some(a => a.rule_type === 'PARTNER_LOAN_DUE')).toBe(false)
  })

  it('PARTNER_LOAN_DUE has critical severity', () => {
    const alerts = evaluateAlerts({ ...BASE_INPUTS, nextTrancheDueDays: 0, nextTrancheAmount: 50_000 })
    const alert = alerts.find(a => a.rule_type === 'PARTNER_LOAN_DUE')
    expect(alert?.severity).toBe('critical')
  })

  it('CASH_RUNWAY_30 has critical severity', () => {
    const alerts = evaluateAlerts({ ...BASE_INPUTS, cashRunwayDays: 10 })
    const alert = alerts.find(a => a.rule_type === 'CASH_RUNWAY_30')
    expect(alert?.severity).toBe('critical')
  })

  it('CASH_RUNWAY_90 has warning severity', () => {
    const alerts = evaluateAlerts({ ...BASE_INPUTS, cashRunwayDays: 60 })
    const alert = alerts.find(a => a.rule_type === 'CASH_RUNWAY_90')
    expect(alert?.severity).toBe('warning')
  })

  it('cash runway 30 and 90 do not both fire for the same input', () => {
    // cashRunwayDays = 20 → only CASH_RUNWAY_30
    const alerts20 = evaluateAlerts({ ...BASE_INPUTS, cashRunwayDays: 20 })
    expect(alerts20.some(a => a.rule_type === 'CASH_RUNWAY_30')).toBe(true)
    expect(alerts20.some(a => a.rule_type === 'CASH_RUNWAY_90')).toBe(false)
    // cashRunwayDays = 60 → only CASH_RUNWAY_90
    const alerts60 = evaluateAlerts({ ...BASE_INPUTS, cashRunwayDays: 60 })
    expect(alerts60.some(a => a.rule_type === 'CASH_RUNWAY_90')).toBe(true)
    expect(alerts60.some(a => a.rule_type === 'CASH_RUNWAY_30')).toBe(false)
  })

  it('RECEIVABLE_30 has warning severity', () => {
    const alerts = evaluateAlerts({ ...BASE_INPUTS, overdueCount30: 1, overdueTotal30: 1_000 })
    const alert = alerts.find(a => a.rule_type === 'RECEIVABLE_30')
    expect(alert?.severity).toBe('warning')
  })

  it('RECEIVABLE_60 always fires when overdueCount60 > 0 and overdueTotal60 > 500', () => {
    for (const count of [1, 2, 10]) {
      const alerts = evaluateAlerts({ ...BASE_INPUTS, overdueCount60: count, overdueTotal60: 10_000 })
      expect(alerts.some(a => a.rule_type === 'RECEIVABLE_60')).toBe(true)
    }
  })

  it('does NOT fire RECEIVABLE_60 when overdueTotal60 = 0', () => {
    const alerts = evaluateAlerts({ ...BASE_INPUTS, overdueCount60: 5, overdueTotal60: 0 })
    expect(alerts.some(a => a.rule_type === 'RECEIVABLE_60')).toBe(false)
  })

  it('every alert has a non-empty title and detail', () => {
    const alerts = evaluateAlerts({
      ...BASE_INPUTS,
      overdueCount30: 1, overdueTotal30: 1_000,
      overdueCount60: 1, overdueTotal60: 5_000,
      cashRunwayDays: 20,
      legalReserveDeficit: 1_000,
    })
    for (const alert of alerts) {
      expect(alert.title.length).toBeGreaterThan(0)
      expect(alert.detail.length).toBeGreaterThan(0)
    }
  })

  it('every alert has a non-empty actionLabel and actionHref', () => {
    const alerts = evaluateAlerts({
      ...BASE_INPUTS,
      overdueCount30: 1, overdueTotal30: 1_000,
    })
    for (const alert of alerts) {
      expect(alert.actionLabel.length).toBeGreaterThan(0)
      expect(alert.actionHref.length).toBeGreaterThan(0)
    }
  })

  it('DSR_STRAINED does NOT fire when debtServiceRatio = 0.50 exactly', () => {
    const alerts = evaluateAlerts({ ...BASE_INPUTS, debtServiceRatio: 0.50 })
    expect(alerts.some(a => a.rule_type === 'DSR_STRAINED')).toBe(false)
  })

  it('DSR_HIGH does NOT fire for debtServiceRatio = 0.70 exactly', () => {
    const alerts = evaluateAlerts({ ...BASE_INPUTS, debtServiceRatio: 0.70 })
    expect(alerts.some(a => a.rule_type === 'DSR_HIGH')).toBe(false)
  })

  it('DSR_STRAINED fires for debtServiceRatio = 0.51', () => {
    const alerts = evaluateAlerts({ ...BASE_INPUTS, debtServiceRatio: 0.51 })
    expect(alerts.some(a => a.rule_type === 'DSR_STRAINED')).toBe(true)
  })

  it('DSR_HIGH fires for debtServiceRatio = 0.71', () => {
    const alerts = evaluateAlerts({ ...BASE_INPUTS, debtServiceRatio: 0.71 })
    expect(alerts.some(a => a.rule_type === 'DSR_HIGH')).toBe(true)
  })

  it('DSR_STRAINED and DSR_HIGH never both fire simultaneously', () => {
    for (const ratio of [0.55, 0.70, 0.75, 0.90]) {
      const alerts = evaluateAlerts({ ...BASE_INPUTS, debtServiceRatio: ratio })
      const strained = alerts.some(a => a.rule_type === 'DSR_STRAINED')
      const high     = alerts.some(a => a.rule_type === 'DSR_HIGH')
      expect(strained && high).toBe(false)
    }
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// evaluateAlerts — empty results and multi-violation scenarios
// ─────────────────────────────────────────────────────────────────────────────

describe('evaluateAlerts — empty results and multi-violation', () => {
  it('returns empty array with all-safe inputs', () => {
    const safe: AlertInputs = {
      overdueCount30:           0,
      overdueTotal30:           0,
      overdueCount60:           0,
      overdueTotal60:           0,
      totalReceivables:         0,
      cashRunwayDays:          -1,
      monthlyNetIncome:         0,
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
    expect(evaluateAlerts(safe)).toHaveLength(0)
  })

  it('multiple simultaneous violations all appear in result', () => {
    const alerts = evaluateAlerts({
      ...BASE_INPUTS,
      overdueCount30:    3,
      overdueTotal30:    10_000,
      overdueCount60:    1,
      overdueTotal60:    5_000,
      cashRunwayDays:    20,
      bsImbalanceTry:    500,
      debtServiceRatio:  0.80,
      legalReserveDeficit: 2_000,
    })
    const ruleTypes = alerts.map(a => a.rule_type)
    expect(ruleTypes).toContain('RECEIVABLE_30')
    expect(ruleTypes).toContain('RECEIVABLE_60')
    expect(ruleTypes).toContain('CASH_RUNWAY_30')
    expect(ruleTypes).toContain('BS_IMBALANCED')
    expect(ruleTypes).toContain('DSR_HIGH')
    expect(ruleTypes).toContain('LEGAL_RESERVE_LOW')
  })

  it('each alert in multi-violation set has stable id', () => {
    const inputs = {
      ...BASE_INPUTS,
      overdueCount30:   1,
      overdueTotal30:   1_000,
      cashRunwayDays:   10,
      legalReserveDeficit: 500,
    }
    const ids1 = evaluateAlerts(inputs).map(a => a.id)
    const ids2 = evaluateAlerts(inputs).map(a => a.id)
    expect(ids1).toEqual(ids2)
  })

  it('critical severity alerts all appear before warning severity alerts', () => {
    const alerts = evaluateAlerts({
      ...BASE_INPUTS,
      overdueCount60: 2,
      overdueTotal60: 20_000,
      cashRunwayDays: 5,
      overdueCount30: 1,
      overdueTotal30: 2_000,
      openPeriodDaysOverdue: 15,
    })
    let seenWarning = false
    for (const alert of alerts) {
      if (alert.severity === 'warning') seenWarning = true
      if (seenWarning) {
        expect(alert.severity).not.toBe('critical')
      }
    }
  })

  it('alert ids are unique within a single call', () => {
    const alerts = evaluateAlerts({
      ...BASE_INPUTS,
      overdueCount30: 1,
      overdueTotal30: 1_000,
      overdueCount60: 1,
      overdueTotal60: 5_000,
      cashRunwayDays: 10,
      bsImbalanceTry: 200,
    })
    const ids = alerts.map(a => a.id)
    const uniqueIds = new Set(ids)
    expect(uniqueIds.size).toBe(ids.length)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// evaluateAlerts — critical vs warning severity distinction
// ─────────────────────────────────────────────────────────────────────────────

describe('evaluateAlerts — critical vs warning severity distinction', () => {
  it('RECEIVABLE_60 is critical, RECEIVABLE_30 is warning', () => {
    const alerts = evaluateAlerts({
      ...BASE_INPUTS,
      overdueCount60: 1,
      overdueTotal60: 5_000,
      overdueCount30: 1,
      overdueTotal30: 2_000,
    })
    const r60 = alerts.find(a => a.rule_type === 'RECEIVABLE_60')
    const r30 = alerts.find(a => a.rule_type === 'RECEIVABLE_30')
    expect(r60?.severity).toBe('critical')
    expect(r30?.severity).toBe('warning')
  })

  it('CASH_RUNWAY_30 is critical, CASH_RUNWAY_90 is warning', () => {
    const r30 = evaluateAlerts({ ...BASE_INPUTS, cashRunwayDays: 15 })
      .find(a => a.rule_type === 'CASH_RUNWAY_30')
    const r90 = evaluateAlerts({ ...BASE_INPUTS, cashRunwayDays: 60 })
      .find(a => a.rule_type === 'CASH_RUNWAY_90')
    expect(r30?.severity).toBe('critical')
    expect(r90?.severity).toBe('warning')
  })

  it('DSR_HIGH is critical, DSR_STRAINED is warning', () => {
    const high = evaluateAlerts({ ...BASE_INPUTS, debtServiceRatio: 0.75 })
      .find(a => a.rule_type === 'DSR_HIGH')
    const strained = evaluateAlerts({ ...BASE_INPUTS, debtServiceRatio: 0.60 })
      .find(a => a.rule_type === 'DSR_STRAINED')
    expect(high?.severity).toBe('critical')
    expect(strained?.severity).toBe('warning')
  })

  it('BS_IMBALANCED in evaluateAlerts is critical', () => {
    const alert = evaluateAlerts({ ...BASE_INPUTS, bsImbalanceTry: 200 })
      .find(a => a.rule_type === 'BS_IMBALANCED')
    expect(alert?.severity).toBe('critical')
  })

  it('PARTNER_BURDEN is warning', () => {
    const alert = evaluateAlerts({ ...BASE_INPUTS, maxBurdenScoreAbs: 0.25 })
      .find(a => a.rule_type === 'PARTNER_BURDEN')
    expect(alert?.severity).toBe('warning')
  })

  it('PERIOD_NOT_CLOSED is warning', () => {
    const alert = evaluateAlerts({ ...BASE_INPUTS, openPeriodDaysOverdue: 20 })
      .find(a => a.rule_type === 'PERIOD_NOT_CLOSED')
    expect(alert?.severity).toBe('warning')
  })

  it('TAX_DUE_SOON is critical', () => {
    const alert = evaluateAlerts({ ...BASE_INPUTS, taxDueDays: 2, kdvPayable: 5_000 })
      .find(a => a.rule_type === 'TAX_DUE_SOON')
    expect(alert?.severity).toBe('critical')
  })

  it('EQUITY_GAP_OVERDUE is warning', () => {
    const alert = evaluateAlerts({ ...BASE_INPUTS, equityGapTry: 10_000, equityCallOverdueDays: 3 })
      .find(a => a.rule_type === 'EQUITY_GAP_OVERDUE')
    expect(alert?.severity).toBe('warning')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// evaluateCFOAlerts — balanced vs imbalanced trial balance
// ─────────────────────────────────────────────────────────────────────────────

describe('evaluateCFOAlerts — balanced trial balance returns no alert', () => {
  it('trialBalanceImbalance = 0 → no BS_IMBALANCED or BS_ROUNDING', () => {
    const alerts = evaluateCFOAlerts({
      trialBalanceImbalance: 0,
      cashBookBalance:       50_000,
      bankStatementBalance:  50_000,
      fifoIntegrityIssues:   0,
      legalReserveShortfall: 0,
    }, COMPANY_A)
    expect(alerts.some(a => a.rule_type === 'BS_IMBALANCED')).toBe(false)
    expect(alerts.some(a => a.rule_type === 'BS_ROUNDING')).toBe(false)
  })

  it('trialBalanceImbalance = 0.009 (below 0.01) → no rounding alert', () => {
    const alerts = evaluateCFOAlerts({
      trialBalanceImbalance: 0.009,
      cashBookBalance:       50_000,
      bankStatementBalance:  undefined,
      fifoIntegrityIssues:   0,
      legalReserveShortfall: 0,
    }, COMPANY_A)
    expect(alerts.some(a => a.rule_type === 'BS_ROUNDING')).toBe(false)
  })

  it('trialBalanceImbalance = 1.00 → BS_IMBALANCED (critical, not rounding)', () => {
    const alerts = evaluateCFOAlerts({
      trialBalanceImbalance: 1.00,
      cashBookBalance:       50_000,
      bankStatementBalance:  undefined,
      fifoIntegrityIssues:   0,
      legalReserveShortfall: 0,
    }, COMPANY_A)
    expect(alerts.some(a => a.rule_type === 'BS_IMBALANCED' && a.severity === 'critical')).toBe(true)
    expect(alerts.some(a => a.rule_type === 'BS_ROUNDING')).toBe(false)
  })

  it('trialBalanceImbalance = 0.50 → BS_ROUNDING (warning), not BS_IMBALANCED', () => {
    const alerts = evaluateCFOAlerts({
      trialBalanceImbalance: 0.50,
      cashBookBalance:       50_000,
      bankStatementBalance:  undefined,
      fifoIntegrityIssues:   0,
      legalReserveShortfall: 0,
    }, COMPANY_A)
    expect(alerts.some(a => a.rule_type === 'BS_ROUNDING' && a.severity === 'warning')).toBe(true)
    expect(alerts.some(a => a.rule_type === 'BS_IMBALANCED')).toBe(false)
  })

  it('FIFO_INTEGRITY critical severity with multiple issues', () => {
    const alerts = evaluateCFOAlerts({
      trialBalanceImbalance: 0,
      cashBookBalance:       50_000,
      bankStatementBalance:  undefined,
      fifoIntegrityIssues:   5,
      legalReserveShortfall: 0,
    }, COMPANY_A)
    const alert = alerts.find(a => a.rule_type === 'FIFO_INTEGRITY')
    expect(alert).toBeDefined()
    expect(alert?.severity).toBe('critical')
  })

  it('CFO alerts sorted critical before warning', () => {
    const alerts = evaluateCFOAlerts({
      trialBalanceImbalance: 2.00,  // critical
      cashBookBalance:       50_000,
      bankStatementBalance:  49_000, // gap > 100 → warning
      fifoIntegrityIssues:   0,
      legalReserveShortfall: 1_000, // warning
    }, COMPANY_A)
    const severities = alerts.map(a => a.severity)
    const ORDER: Record<string, number> = { critical: 0, warning: 1, info: 2 }
    for (let i = 0; i < severities.length - 1; i++) {
      expect(ORDER[severities[i]]).toBeLessThanOrEqual(ORDER[severities[i + 1]])
    }
  })
})
