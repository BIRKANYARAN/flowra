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
