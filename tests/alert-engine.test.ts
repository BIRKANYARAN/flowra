// tests/alert-engine.test.ts
// Unit tests for lib/engines/alert.engine.ts

import { describe, it, expect } from 'vitest'
import { evaluateAlerts, type AlertInputs } from '@/lib/engines/alert.engine'

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
})
