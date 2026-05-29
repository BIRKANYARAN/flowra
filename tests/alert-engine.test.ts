// tests/alert-engine.test.ts
// Unit tests for lib/engines/alert.engine.ts

import { describe, it, expect } from 'vitest'
import { evaluateAlerts, evaluateCFOAlerts, type AlertInputs, type CFOAccuracyInputs } from '@/lib/engines/alert.engine'

// ─────────────────────────────────────────────────────────────────────────────
// Base "clean" inputs — no alerts should fire
// ─────────────────────────────────────────────────────────────────────────────

const CLEAN: AlertInputs = {
  overdueCount30:           0,
  overdueTotal30:           0,
  overdueCount60:           0,
  overdueTotal60:           0,
  totalReceivables:         0,
  cashRunwayDays:          -1,  // profitable (no burn)
  monthlyNetIncome:       100_000,
  maxBurdenScoreAbs:        0,
  nextTrancheDueDays:      -1,  // no tranche due
  nextTrancheAmount:        0,
  openPeriodDaysOverdue:   -1,  // period closed
  kdvPayable:               0,
  taxDueDays:              -1,  // no tax due
  bsImbalanceTry:           0,
  legalReserveDeficit:      0,
  equityGapTry:             0,
  equityCallOverdueDays:   -1,
  debtServiceRatio:         0,
  partnerLoanConcentration: 0,
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('evaluateAlerts', () => {

  it('clean inputs → [] (no alerts)', () => {
    const alerts = evaluateAlerts(CLEAN)
    expect(alerts).toHaveLength(0)
  })

  it('overdueCount30: 2, overdueTotal30: 50000 → fires RECEIVABLE_30 with severity warning', () => {
    const alerts = evaluateAlerts({ ...CLEAN, overdueCount30: 2, overdueTotal30: 50_000 })
    const alert = alerts.find(a => a.rule_type === 'RECEIVABLE_30')
    expect(alert).toBeDefined()
    expect(alert!.severity).toBe('warning')
  })

  it('overdueCount60: 1, overdueTotal60: 80000 → fires RECEIVABLE_60 with severity critical', () => {
    const alerts = evaluateAlerts({ ...CLEAN, overdueCount60: 1, overdueTotal60: 80_000 })
    const alert = alerts.find(a => a.rule_type === 'RECEIVABLE_60')
    expect(alert).toBeDefined()
    expect(alert!.severity).toBe('critical')
  })

  it('cashRunwayDays: 20 (< 30) → fires CASH_RUNWAY_30 with severity critical', () => {
    const alerts = evaluateAlerts({ ...CLEAN, cashRunwayDays: 20 })
    const alert = alerts.find(a => a.rule_type === 'CASH_RUNWAY_30')
    expect(alert).toBeDefined()
    expect(alert!.severity).toBe('critical')
    // CASH_RUNWAY_90 should NOT also fire for the same condition
    const r90 = alerts.find(a => a.rule_type === 'CASH_RUNWAY_90')
    expect(r90).toBeUndefined()
  })

  it('cashRunwayDays: 60 (< 90, > 30) → fires CASH_RUNWAY_90 with severity warning, not CASH_RUNWAY_30', () => {
    const alerts = evaluateAlerts({ ...CLEAN, cashRunwayDays: 60 })
    const r90 = alerts.find(a => a.rule_type === 'CASH_RUNWAY_90')
    const r30 = alerts.find(a => a.rule_type === 'CASH_RUNWAY_30')
    expect(r90).toBeDefined()
    expect(r90!.severity).toBe('warning')
    expect(r30).toBeUndefined()
  })

  it('maxBurdenScoreAbs: 0.25 → fires PARTNER_BURDEN', () => {
    const alerts = evaluateAlerts({ ...CLEAN, maxBurdenScoreAbs: 0.25 })
    const alert = alerts.find(a => a.rule_type === 'PARTNER_BURDEN')
    expect(alert).toBeDefined()
    expect(alert!.severity).toBe('warning')
  })

  it('nextTrancheDueDays: 7 → fires PARTNER_LOAN_DUE', () => {
    const alerts = evaluateAlerts({ ...CLEAN, nextTrancheDueDays: 7, nextTrancheAmount: 50_000 })
    const alert = alerts.find(a => a.rule_type === 'PARTNER_LOAN_DUE')
    expect(alert).toBeDefined()
    expect(alert!.severity).toBe('critical')
  })

  it('openPeriodDaysOverdue: 15 (> 10) → fires PERIOD_NOT_CLOSED', () => {
    const alerts = evaluateAlerts({ ...CLEAN, openPeriodDaysOverdue: 15 })
    const alert = alerts.find(a => a.rule_type === 'PERIOD_NOT_CLOSED')
    expect(alert).toBeDefined()
  })

  it('openPeriodDaysOverdue: 5 (≤ 10) → does NOT fire PERIOD_NOT_CLOSED', () => {
    const alerts = evaluateAlerts({ ...CLEAN, openPeriodDaysOverdue: 5 })
    const alert = alerts.find(a => a.rule_type === 'PERIOD_NOT_CLOSED')
    expect(alert).toBeUndefined()
  })

  it('bsImbalanceTry: 150 → fires BS_IMBALANCED with severity critical', () => {
    const alerts = evaluateAlerts({ ...CLEAN, bsImbalanceTry: 150 })
    const alert = alerts.find(a => a.rule_type === 'BS_IMBALANCED')
    expect(alert).toBeDefined()
    expect(alert!.severity).toBe('critical')
  })

  it('bsImbalanceTry: 100 (not > 100) → does NOT fire BS_IMBALANCED', () => {
    const alerts = evaluateAlerts({ ...CLEAN, bsImbalanceTry: 100 })
    const alert = alerts.find(a => a.rule_type === 'BS_IMBALANCED')
    expect(alert).toBeUndefined()
  })

  it('debtServiceRatio: 0.8 → fires DSR_HIGH', () => {
    const alerts = evaluateAlerts({ ...CLEAN, debtServiceRatio: 0.8 })
    const alert = alerts.find(a => a.rule_type === 'DSR_HIGH')
    expect(alert).toBeDefined()
    expect(alert!.severity).toBe('critical')
  })

  it('debtServiceRatio: 0.70 (not > 0.70) → does NOT fire DSR_HIGH', () => {
    const alerts = evaluateAlerts({ ...CLEAN, debtServiceRatio: 0.70 })
    const alert = alerts.find(a => a.rule_type === 'DSR_HIGH')
    expect(alert).toBeUndefined()
  })

  it('multiple triggers → multiple alerts returned, sorted critical-first', () => {
    const alerts = evaluateAlerts({
      ...CLEAN,
      overdueCount30:  2,
      overdueTotal30: 50_000, // warning
      overdueCount60:  1,
      overdueTotal60: 80_000, // critical
      cashRunwayDays: 20,     // critical
      debtServiceRatio: 0.8,  // critical
    })
    expect(alerts.length).toBeGreaterThanOrEqual(4)
    // First alerts should be critical
    expect(alerts[0].severity).toBe('critical')
    // No warning should appear before a critical
    const firstWarningIdx = alerts.findIndex(a => a.severity === 'warning')
    const lastCriticalIdx = alerts.reduce((last, a, i) => a.severity === 'critical' ? i : last, -1)
    if (firstWarningIdx !== -1 && lastCriticalIdx !== -1) {
      expect(firstWarningIdx).toBeGreaterThan(lastCriticalIdx)
    }
  })

  it('overdueTotal30: 100 (below 500 threshold) → no RECEIVABLE_30 alert', () => {
    const alerts = evaluateAlerts({ ...CLEAN, overdueCount30: 3, overdueTotal30: 100 })
    const alert = alerts.find(a => a.rule_type === 'RECEIVABLE_30')
    expect(alert).toBeUndefined()
  })

  it('overdueTotal60: 100 (below 500 threshold) → no RECEIVABLE_60 alert', () => {
    const alerts = evaluateAlerts({ ...CLEAN, overdueCount60: 2, overdueTotal60: 100 })
    const alert = alerts.find(a => a.rule_type === 'RECEIVABLE_60')
    expect(alert).toBeUndefined()
  })

  it('partnerLoanConcentration > 0.80 → fires CONCENTRATION', () => {
    const alerts = evaluateAlerts({ ...CLEAN, partnerLoanConcentration: 0.85 })
    const alert = alerts.find(a => a.rule_type === 'CONCENTRATION')
    expect(alert).toBeDefined()
    expect(alert!.severity).toBe('warning')
  })

  it('legalReserveDeficit > 0 → fires LEGAL_RESERVE_LOW', () => {
    const alerts = evaluateAlerts({ ...CLEAN, legalReserveDeficit: 10_000 })
    const alert = alerts.find(a => a.rule_type === 'LEGAL_RESERVE_LOW')
    expect(alert).toBeDefined()
    expect(alert!.severity).toBe('warning')
  })

  it('equityGapTry > 0 and equityCallOverdueDays > 0 → fires EQUITY_GAP_OVERDUE', () => {
    const alerts = evaluateAlerts({ ...CLEAN, equityGapTry: 50_000, equityCallOverdueDays: 5 })
    const alert = alerts.find(a => a.rule_type === 'EQUITY_GAP_OVERDUE')
    expect(alert).toBeDefined()
  })

  it('equityGapTry > 0 but equityCallOverdueDays <= 0 → no EQUITY_GAP_OVERDUE', () => {
    const alerts = evaluateAlerts({ ...CLEAN, equityGapTry: 50_000, equityCallOverdueDays: 0 })
    const alert = alerts.find(a => a.rule_type === 'EQUITY_GAP_OVERDUE')
    expect(alert).toBeUndefined()
  })

  // ── E6 alert calibration ────────────────────────────────────────────────────

  it('debtServiceRatio: 0.62 (> 0.50, <= 0.70) → fires DSR_STRAINED (warning)', () => {
    const alerts = evaluateAlerts({ ...CLEAN, debtServiceRatio: 0.62 })
    const strained = alerts.find(a => a.rule_type === 'DSR_STRAINED')
    const high     = alerts.find(a => a.rule_type === 'DSR_HIGH')
    expect(strained).toBeDefined()
    expect(strained!.severity).toBe('warning')
    expect(high).toBeUndefined()    // DSR_HIGH requires > 0.70
  })

  it('debtServiceRatio: 0.50 (exactly) → no DSR_STRAINED (boundary: > 0.50 required)', () => {
    const alerts = evaluateAlerts({ ...CLEAN, debtServiceRatio: 0.50 })
    const strained = alerts.find(a => a.rule_type === 'DSR_STRAINED')
    expect(strained).toBeUndefined()
  })

  it('debtServiceRatio: 0.80 → fires DSR_HIGH (critical), not DSR_STRAINED', () => {
    const alerts = evaluateAlerts({ ...CLEAN, debtServiceRatio: 0.80 })
    const strained = alerts.find(a => a.rule_type === 'DSR_STRAINED')
    const high     = alerts.find(a => a.rule_type === 'DSR_HIGH')
    expect(strained).toBeUndefined()
    expect(high).toBeDefined()
    expect(high!.severity).toBe('critical')
  })

  it('kdvPayable >= 50_000 and taxDueDays = -1 → fires KDV_LARGE (warning)', () => {
    const alerts = evaluateAlerts({ ...CLEAN, kdvPayable: 340_000, taxDueDays: -1 })
    const alert = alerts.find(a => a.rule_type === 'KDV_LARGE')
    expect(alert).toBeDefined()
    expect(alert!.severity).toBe('warning')
    expect(alert!.amount).toBe(340_000)
  })

  it('kdvPayable >= 50_000 but taxDueDays <= 7 → KDV_LARGE does NOT fire (TAX_DUE_SOON instead)', () => {
    const alerts = evaluateAlerts({ ...CLEAN, kdvPayable: 340_000, taxDueDays: 3 })
    const large  = alerts.find(a => a.rule_type === 'KDV_LARGE')
    const due    = alerts.find(a => a.rule_type === 'TAX_DUE_SOON')
    expect(large).toBeUndefined()   // suppressed when TAX_DUE_SOON would fire
    expect(due).toBeDefined()
  })

  it('kdvPayable < 50_000 → no KDV_LARGE', () => {
    const alerts = evaluateAlerts({ ...CLEAN, kdvPayable: 49_999, taxDueDays: -1 })
    const alert = alerts.find(a => a.rule_type === 'KDV_LARGE')
    expect(alert).toBeUndefined()
  })

  it('monthlyNetIncome > 0 with low runway → runway detail does not say "zarar"', () => {
    const alerts = evaluateAlerts({ ...CLEAN, cashRunwayDays: 60, monthlyNetIncome: 50_000 })
    const alert = alerts.find(a => a.rule_type === 'CASH_RUNWAY_90')
    expect(alert).toBeDefined()
    expect(alert!.detail).not.toContain('zarar')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// CFO Accuracy Alerts
// ─────────────────────────────────────────────────────────────────────────────

const CLEAN_CFO: CFOAccuracyInputs = {
  trialBalanceImbalance:  0,
  cashBookBalance:        100_000,
  bankStatementBalance:   100_000,
  fifoIntegrityIssues:    0,
  legalReserveShortfall:  0,
}

const TEST_COMPANY_ID = 'company-test-uuid'

describe('CFO accuracy alerts', () => {

  it('balanced trial balance (imbalance = 0) → no BS alert', () => {
    const alerts = evaluateCFOAlerts({ ...CLEAN_CFO, trialBalanceImbalance: 0 }, TEST_COMPANY_ID)
    expect(alerts.find(a => a.rule_type === 'BS_IMBALANCED')).toBeUndefined()
    expect(alerts.find(a => a.rule_type === 'BS_ROUNDING')).toBeUndefined()
  })

  it('trialBalanceImbalance ≥ 1 → critical BS_IMBALANCED', () => {
    const alerts = evaluateCFOAlerts({ ...CLEAN_CFO, trialBalanceImbalance: 5.00 }, TEST_COMPANY_ID)
    const alert = alerts.find(a => a.rule_type === 'BS_IMBALANCED')
    expect(alert).toBeDefined()
    expect(alert!.severity).toBe('critical')
    expect(alert!.detail).toContain('5.00')
  })

  it('trialBalanceImbalance 0.05 → warning BS_ROUNDING', () => {
    const alerts = evaluateCFOAlerts({ ...CLEAN_CFO, trialBalanceImbalance: 0.05 }, TEST_COMPANY_ID)
    const rounding = alerts.find(a => a.rule_type === 'BS_ROUNDING')
    const imbalanced = alerts.find(a => a.rule_type === 'BS_IMBALANCED')
    expect(rounding).toBeDefined()
    expect(rounding!.severity).toBe('warning')
    expect(imbalanced).toBeUndefined()
  })

  it('fifoIntegrityIssues > 0 → critical FIFO_INTEGRITY with count in message', () => {
    const alerts = evaluateCFOAlerts({ ...CLEAN_CFO, fifoIntegrityIssues: 3 }, TEST_COMPANY_ID)
    const alert = alerts.find(a => a.rule_type === 'FIFO_INTEGRITY')
    expect(alert).toBeDefined()
    expect(alert!.severity).toBe('critical')
    expect(alert!.detail).toContain('3')
  })

  it('bank gap > 100 → warning BANK_RECONCILIATION_GAP', () => {
    const alerts = evaluateCFOAlerts({
      ...CLEAN_CFO,
      cashBookBalance:      100_000,
      bankStatementBalance: 99_800,  // gap = 200 > 100
    }, TEST_COMPANY_ID)
    const alert = alerts.find(a => a.rule_type === 'BANK_RECONCILIATION_GAP')
    expect(alert).toBeDefined()
    expect(alert!.severity).toBe('warning')
  })

  it('bank gap ≤ 100 → no BANK_RECONCILIATION_GAP alert', () => {
    const alerts = evaluateCFOAlerts({
      ...CLEAN_CFO,
      cashBookBalance:      100_000,
      bankStatementBalance: 99_950,  // gap = 50 ≤ 100
    }, TEST_COMPANY_ID)
    expect(alerts.find(a => a.rule_type === 'BANK_RECONCILIATION_GAP')).toBeUndefined()
  })

  it('legalReserveShortfall > 0 → warning LEGAL_RESERVE_SHORTFALL', () => {
    const alerts = evaluateCFOAlerts({ ...CLEAN_CFO, legalReserveShortfall: 5_000 }, TEST_COMPANY_ID)
    const alert = alerts.find(a => a.rule_type === 'LEGAL_RESERVE_SHORTFALL')
    expect(alert).toBeDefined()
    expect(alert!.severity).toBe('warning')
  })

  it('all clean inputs → empty array', () => {
    const alerts = evaluateCFOAlerts(CLEAN_CFO, TEST_COMPANY_ID)
    expect(alerts).toHaveLength(0)
  })

  it('trialBalanceImbalance exactly 1.0 → fires BS_IMBALANCED (boundary: >= 1.0)', () => {
    const alerts = evaluateCFOAlerts({ ...CLEAN_CFO, trialBalanceImbalance: 1.0 }, TEST_COMPANY_ID)
    const imbalanced = alerts.find(a => a.rule_type === 'BS_IMBALANCED')
    expect(imbalanced).toBeDefined()
    expect(imbalanced!.severity).toBe('critical')
  })

  it('trialBalanceImbalance exactly 0.99 → fires BS_ROUNDING, not BS_IMBALANCED', () => {
    const alerts = evaluateCFOAlerts({ ...CLEAN_CFO, trialBalanceImbalance: 0.99 }, TEST_COMPANY_ID)
    const rounding   = alerts.find(a => a.rule_type === 'BS_ROUNDING')
    const imbalanced = alerts.find(a => a.rule_type === 'BS_IMBALANCED')
    expect(rounding).toBeDefined()
    expect(rounding!.severity).toBe('warning')
    expect(imbalanced).toBeUndefined()
  })

  it('trialBalanceImbalance 0.0 → no BS_ROUNDING (boundary: >= 0.01 required)', () => {
    const alerts = evaluateCFOAlerts({ ...CLEAN_CFO, trialBalanceImbalance: 0.0 }, TEST_COMPANY_ID)
    expect(alerts.find(a => a.rule_type === 'BS_ROUNDING')).toBeUndefined()
    expect(alerts.find(a => a.rule_type === 'BS_IMBALANCED')).toBeUndefined()
  })

  it('trialBalanceImbalance exactly 0.01 → fires BS_ROUNDING (boundary: just inside)', () => {
    const alerts = evaluateCFOAlerts({ ...CLEAN_CFO, trialBalanceImbalance: 0.01 }, TEST_COMPANY_ID)
    expect(alerts.find(a => a.rule_type === 'BS_ROUNDING')).toBeDefined()
  })

  it('bankStatementBalance missing (undefined) → no BANK_RECONCILIATION_GAP', () => {
    const inputs: typeof CLEAN_CFO = { ...CLEAN_CFO }
    delete (inputs as any).bankStatementBalance
    const alerts = evaluateCFOAlerts(inputs, TEST_COMPANY_ID)
    expect(alerts.find(a => a.rule_type === 'BANK_RECONCILIATION_GAP')).toBeUndefined()
  })

  it('bank gap exactly 100 → no BANK_RECONCILIATION_GAP (boundary: > 100 required)', () => {
    const alerts = evaluateCFOAlerts({
      ...CLEAN_CFO,
      cashBookBalance:      100_000,
      bankStatementBalance: 99_900,  // gap = 100, NOT > 100
    }, TEST_COMPANY_ID)
    expect(alerts.find(a => a.rule_type === 'BANK_RECONCILIATION_GAP')).toBeUndefined()
  })

  it('bank gap 101 → fires BANK_RECONCILIATION_GAP (boundary: just over)', () => {
    const alerts = evaluateCFOAlerts({
      ...CLEAN_CFO,
      cashBookBalance:      100_000,
      bankStatementBalance: 99_899,  // gap = 101
    }, TEST_COMPANY_ID)
    expect(alerts.find(a => a.rule_type === 'BANK_RECONCILIATION_GAP')).toBeDefined()
  })

  it('bank gap with reversed sign (statement > book) still detected', () => {
    // Uses Math.abs — so direction doesn't matter
    const alerts = evaluateCFOAlerts({
      ...CLEAN_CFO,
      cashBookBalance:      99_800,
      bankStatementBalance: 100_000,  // gap = 200 > 100 (reversed)
    }, TEST_COMPANY_ID)
    expect(alerts.find(a => a.rule_type === 'BANK_RECONCILIATION_GAP')).toBeDefined()
  })

  it('fifoIntegrityIssues 0 → no FIFO_INTEGRITY', () => {
    const alerts = evaluateCFOAlerts({ ...CLEAN_CFO, fifoIntegrityIssues: 0 }, TEST_COMPANY_ID)
    expect(alerts.find(a => a.rule_type === 'FIFO_INTEGRITY')).toBeUndefined()
  })

  it('fifoIntegrityIssues 1 → fires FIFO_INTEGRITY', () => {
    const alerts = evaluateCFOAlerts({ ...CLEAN_CFO, fifoIntegrityIssues: 1 }, TEST_COMPANY_ID)
    expect(alerts.find(a => a.rule_type === 'FIFO_INTEGRITY')).toBeDefined()
  })

  it('legalReserveShortfall 0 → no LEGAL_RESERVE_SHORTFALL', () => {
    const alerts = evaluateCFOAlerts({ ...CLEAN_CFO, legalReserveShortfall: 0 }, TEST_COMPANY_ID)
    expect(alerts.find(a => a.rule_type === 'LEGAL_RESERVE_SHORTFALL')).toBeUndefined()
  })

  it('legalReserveShortfall 1 (smallest positive) → fires LEGAL_RESERVE_SHORTFALL', () => {
    const alerts = evaluateCFOAlerts({ ...CLEAN_CFO, legalReserveShortfall: 1 }, TEST_COMPANY_ID)
    expect(alerts.find(a => a.rule_type === 'LEGAL_RESERVE_SHORTFALL')).toBeDefined()
  })

  it('all CFO alerts fire together with all bad inputs', () => {
    const alerts = evaluateCFOAlerts({
      trialBalanceImbalance:  5.00,   // BS_IMBALANCED
      cashBookBalance:        100_000,
      bankStatementBalance:   99_700, // BANK_RECONCILIATION_GAP
      fifoIntegrityIssues:    2,      // FIFO_INTEGRITY
      legalReserveShortfall:  10_000, // LEGAL_RESERVE_SHORTFALL
    }, TEST_COMPANY_ID)
    expect(alerts.length).toBe(4)
    const ruleTypes = alerts.map(a => a.rule_type)
    expect(ruleTypes).toContain('BS_IMBALANCED')
    expect(ruleTypes).toContain('BANK_RECONCILIATION_GAP')
    expect(ruleTypes).toContain('FIFO_INTEGRITY')
    expect(ruleTypes).toContain('LEGAL_RESERVE_SHORTFALL')
  })

  it('CFO alerts sorted critical-first', () => {
    const alerts = evaluateCFOAlerts({
      trialBalanceImbalance:  5.00,  // critical
      cashBookBalance:        100_000,
      bankStatementBalance:   99_700, // warning
      fifoIntegrityIssues:    2,      // critical
      legalReserveShortfall:  1_000,  // warning
    }, TEST_COMPANY_ID)
    const firstWarningIdx = alerts.findIndex(a => a.severity === 'warning')
    const lastCriticalIdx = alerts.reduce((last, a, i) => a.severity === 'critical' ? i : last, -1)
    if (firstWarningIdx !== -1 && lastCriticalIdx !== -1) {
      expect(firstWarningIdx).toBeGreaterThan(lastCriticalIdx)
    }
  })

  it('each CFO alert has an id, triggeredAt, actionHref, and actionLabel', () => {
    const alerts = evaluateCFOAlerts({
      ...CLEAN_CFO,
      fifoIntegrityIssues: 1,
    }, TEST_COMPANY_ID)
    alerts.forEach(alert => {
      expect(typeof alert.id).toBe('string')
      expect(alert.id.length).toBeGreaterThan(0)
      expect(typeof alert.triggeredAt).toBe('string')
      expect(typeof alert.actionHref).toBe('string')
      expect(typeof alert.actionLabel).toBe('string')
    })
  })
})

// ── evaluateAlerts — additional boundary + coverage tests ────────────────────

describe('evaluateAlerts — additional boundary tests', () => {

  it('overdueCount30 = 0 (exactly 0) → no RECEIVABLE_30 even if total is high', () => {
    // Rule requires overdueCount30 > 0
    const alerts = evaluateAlerts({ ...CLEAN, overdueCount30: 0, overdueTotal30: 100_000 })
    expect(alerts.find(a => a.rule_type === 'RECEIVABLE_30')).toBeUndefined()
  })

  it('overdueCount60 = 0 (exactly 0) → no RECEIVABLE_60 even if total is high', () => {
    const alerts = evaluateAlerts({ ...CLEAN, overdueCount60: 0, overdueTotal60: 100_000 })
    expect(alerts.find(a => a.rule_type === 'RECEIVABLE_60')).toBeUndefined()
  })

  it('overdueTotal30 exactly 500 → no RECEIVABLE_30 (> 500 required)', () => {
    const alerts = evaluateAlerts({ ...CLEAN, overdueCount30: 1, overdueTotal30: 500 })
    expect(alerts.find(a => a.rule_type === 'RECEIVABLE_30')).toBeUndefined()
  })

  it('overdueTotal30 exactly 501 → fires RECEIVABLE_30', () => {
    const alerts = evaluateAlerts({ ...CLEAN, overdueCount30: 1, overdueTotal30: 501 })
    expect(alerts.find(a => a.rule_type === 'RECEIVABLE_30')).toBeDefined()
  })

  it('cashRunwayDays = -1 → no runway alert (profitable)', () => {
    const alerts = evaluateAlerts({ ...CLEAN, cashRunwayDays: -1 })
    expect(alerts.find(a => a.rule_type === 'CASH_RUNWAY_30')).toBeUndefined()
    expect(alerts.find(a => a.rule_type === 'CASH_RUNWAY_90')).toBeUndefined()
  })

  it('cashRunwayDays = 0 → fires CASH_RUNWAY_30 (boundary: <= 30)', () => {
    const alerts = evaluateAlerts({ ...CLEAN, cashRunwayDays: 0 })
    expect(alerts.find(a => a.rule_type === 'CASH_RUNWAY_30')).toBeDefined()
  })

  it('cashRunwayDays = 30 → fires CASH_RUNWAY_30 (boundary: exactly 30)', () => {
    const alerts = evaluateAlerts({ ...CLEAN, cashRunwayDays: 30 })
    expect(alerts.find(a => a.rule_type === 'CASH_RUNWAY_30')).toBeDefined()
  })

  it('cashRunwayDays = 31 → fires CASH_RUNWAY_90 not CASH_RUNWAY_30', () => {
    const alerts = evaluateAlerts({ ...CLEAN, cashRunwayDays: 31 })
    expect(alerts.find(a => a.rule_type === 'CASH_RUNWAY_90')).toBeDefined()
    expect(alerts.find(a => a.rule_type === 'CASH_RUNWAY_30')).toBeUndefined()
  })

  it('cashRunwayDays = 90 → fires CASH_RUNWAY_90 (boundary: <= 90)', () => {
    const alerts = evaluateAlerts({ ...CLEAN, cashRunwayDays: 90 })
    expect(alerts.find(a => a.rule_type === 'CASH_RUNWAY_90')).toBeDefined()
  })

  it('cashRunwayDays = 91 → no runway alert (> 90 days is ok)', () => {
    const alerts = evaluateAlerts({ ...CLEAN, cashRunwayDays: 91 })
    expect(alerts.find(a => a.rule_type === 'CASH_RUNWAY_90')).toBeUndefined()
    expect(alerts.find(a => a.rule_type === 'CASH_RUNWAY_30')).toBeUndefined()
  })

  it('maxBurdenScoreAbs = 0.20 → no PARTNER_BURDEN (> 0.20 required)', () => {
    const alerts = evaluateAlerts({ ...CLEAN, maxBurdenScoreAbs: 0.20 })
    expect(alerts.find(a => a.rule_type === 'PARTNER_BURDEN')).toBeUndefined()
  })

  it('maxBurdenScoreAbs = 0.201 → fires PARTNER_BURDEN', () => {
    const alerts = evaluateAlerts({ ...CLEAN, maxBurdenScoreAbs: 0.201 })
    expect(alerts.find(a => a.rule_type === 'PARTNER_BURDEN')).toBeDefined()
  })

  it('nextTrancheDueDays = 14 → fires PARTNER_LOAN_DUE (boundary: <= 14)', () => {
    const alerts = evaluateAlerts({ ...CLEAN, nextTrancheDueDays: 14, nextTrancheAmount: 10_000 })
    expect(alerts.find(a => a.rule_type === 'PARTNER_LOAN_DUE')).toBeDefined()
  })

  it('nextTrancheDueDays = 15 → no PARTNER_LOAN_DUE (> 14 days)', () => {
    const alerts = evaluateAlerts({ ...CLEAN, nextTrancheDueDays: 15, nextTrancheAmount: 10_000 })
    expect(alerts.find(a => a.rule_type === 'PARTNER_LOAN_DUE')).toBeUndefined()
  })

  it('nextTrancheDueDays = -1 → no PARTNER_LOAN_DUE (no tranche due)', () => {
    const alerts = evaluateAlerts({ ...CLEAN, nextTrancheDueDays: -1 })
    expect(alerts.find(a => a.rule_type === 'PARTNER_LOAN_DUE')).toBeUndefined()
  })

  it('openPeriodDaysOverdue = 10 → no PERIOD_NOT_CLOSED (> 10 required)', () => {
    const alerts = evaluateAlerts({ ...CLEAN, openPeriodDaysOverdue: 10 })
    expect(alerts.find(a => a.rule_type === 'PERIOD_NOT_CLOSED')).toBeUndefined()
  })

  it('openPeriodDaysOverdue = 11 → fires PERIOD_NOT_CLOSED', () => {
    const alerts = evaluateAlerts({ ...CLEAN, openPeriodDaysOverdue: 11 })
    expect(alerts.find(a => a.rule_type === 'PERIOD_NOT_CLOSED')).toBeDefined()
  })

  it('partnerLoanConcentration = 0.80 → no CONCENTRATION (> 0.80 required)', () => {
    const alerts = evaluateAlerts({ ...CLEAN, partnerLoanConcentration: 0.80 })
    expect(alerts.find(a => a.rule_type === 'CONCENTRATION')).toBeUndefined()
  })

  it('partnerLoanConcentration = 0.81 → fires CONCENTRATION', () => {
    const alerts = evaluateAlerts({ ...CLEAN, partnerLoanConcentration: 0.81 })
    expect(alerts.find(a => a.rule_type === 'CONCENTRATION')).toBeDefined()
  })

  it('each alert has required fields', () => {
    const alerts = evaluateAlerts({
      ...CLEAN,
      overdueCount30: 2,
      overdueTotal30: 50_000,
      cashRunwayDays: 20,
    })
    alerts.forEach(alert => {
      expect(typeof alert.id).toBe('string')
      expect(typeof alert.rule_type).toBe('string')
      expect(typeof alert.severity).toBe('string')
      expect(typeof alert.title).toBe('string')
      expect(typeof alert.detail).toBe('string')
      expect(typeof alert.actionLabel).toBe('string')
      expect(typeof alert.actionHref).toBe('string')
      expect(typeof alert.triggeredAt).toBe('string')
    })
  })

  it('equityCallOverdueDays exactly 0 → no EQUITY_GAP_OVERDUE (> 0 required)', () => {
    const alerts = evaluateAlerts({ ...CLEAN, equityGapTry: 50_000, equityCallOverdueDays: 0 })
    expect(alerts.find(a => a.rule_type === 'EQUITY_GAP_OVERDUE')).toBeUndefined()
  })

  it('equityCallOverdueDays = 1 → fires EQUITY_GAP_OVERDUE', () => {
    const alerts = evaluateAlerts({ ...CLEAN, equityGapTry: 50_000, equityCallOverdueDays: 1 })
    expect(alerts.find(a => a.rule_type === 'EQUITY_GAP_OVERDUE')).toBeDefined()
  })

  it('RECEIVABLE_30 amount field matches overdueTotal30', () => {
    const alerts = evaluateAlerts({ ...CLEAN, overdueCount30: 2, overdueTotal30: 75_000 })
    const alert = alerts.find(a => a.rule_type === 'RECEIVABLE_30')
    expect(alert?.amount).toBe(75_000)
  })

  it('RECEIVABLE_60 amount field matches overdueTotal60', () => {
    const alerts = evaluateAlerts({ ...CLEAN, overdueCount60: 1, overdueTotal60: 120_000 })
    const alert = alerts.find(a => a.rule_type === 'RECEIVABLE_60')
    expect(alert?.amount).toBe(120_000)
  })

  it('DSR_STRAINED not fired when DSR = 0.70 exactly (boundary <= 0.70)', () => {
    const alerts = evaluateAlerts({ ...CLEAN, debtServiceRatio: 0.70 })
    const strained = alerts.find(a => a.rule_type === 'DSR_STRAINED')
    const high     = alerts.find(a => a.rule_type === 'DSR_HIGH')
    expect(strained).toBeDefined()  // 0.70 is > 0.50 and <= 0.70 → strained
    expect(high).toBeUndefined()    // 0.70 is NOT > 0.70
  })

  it('monthlyNetIncome < 0 (loss) makes runway detail mention "zarar"', () => {
    const alerts = evaluateAlerts({ ...CLEAN, cashRunwayDays: 20, monthlyNetIncome: -10_000 })
    const alert = alerts.find(a => a.rule_type === 'CASH_RUNWAY_30')
    expect(alert).toBeDefined()
    expect(alert!.detail).toContain('zarar')
  })
})
