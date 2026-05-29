/**
 * alert-engine-ceo.test.ts
 *
 * Pure-function tests for the three exported helpers in alert.engine.ts:
 *   - classifyAlertSeverity
 *   - buildAlertId
 *   - sortAlertsByPriority
 *
 * Also covers the RECEIVABLE_CONCENTRATION rule and DSR_HIGH in evaluateAlerts.
 *
 * DO NOT modify existing alert tests (alert-engine.test.ts, alert-rules.test.ts, etc.)
 */

import { describe, it, expect } from 'vitest'
import {
  classifyAlertSeverity,
  buildAlertId,
  sortAlertsByPriority,
  evaluateAlerts,
  type DecisionAlert,
  type AlertInputs,
} from '../lib/engines/alert.engine'

// ── Minimal valid AlertInputs helper ─────────────────────────────────────────
function baseInputs(overrides: Partial<AlertInputs> = {}): AlertInputs {
  return {
    overdueCount30:            0,
    overdueTotal30:            0,
    overdueCount60:            0,
    overdueTotal60:            0,
    totalReceivables:          0,
    cashRunwayDays:            -1,
    monthlyNetIncome:          100_000,
    maxBurdenScoreAbs:         0,
    nextTrancheDueDays:        -1,
    nextTrancheAmount:         0,
    openPeriodDaysOverdue:     -1,
    kdvPayable:                0,
    taxDueDays:                -1,
    bsImbalanceTry:            0,
    legalReserveDeficit:       0,
    equityGapTry:              0,
    equityCallOverdueDays:     -1,
    debtServiceRatio:          0,
    partnerLoanConcentration:  0,
    maxCustomerReceivableShare: 0,
    ...overrides,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// classifyAlertSeverity
// ─────────────────────────────────────────────────────────────────────────────

describe('classifyAlertSeverity', () => {
  it('returns info when daysOverdue is 0', () => {
    expect(classifyAlertSeverity(0, 10_000)).toBe('info')
  })

  it('returns info when amount is 0', () => {
    expect(classifyAlertSeverity(90, 0)).toBe('info')
  })

  it('returns info when daysOverdue is negative', () => {
    expect(classifyAlertSeverity(-5, 5_000)).toBe('info')
  })

  it('returns info when both daysOverdue and amount are 0', () => {
    expect(classifyAlertSeverity(0, 0)).toBe('info')
  })

  it('returns warning for 1 day overdue with positive amount', () => {
    expect(classifyAlertSeverity(1, 1)).toBe('warning')
  })

  it('returns warning for 30 days overdue, amount ≤ 10_000', () => {
    expect(classifyAlertSeverity(30, 5_000)).toBe('warning')
  })

  it('returns warning for 31 days overdue, amount = 10_000 (not strictly >)', () => {
    // boundary: must be > 10_000 for critical with 31 days
    expect(classifyAlertSeverity(31, 10_000)).toBe('warning')
  })

  it('returns warning for 60 days overdue, amount ≤ 500', () => {
    // boundary: must be > 500 for critical with 60 days
    expect(classifyAlertSeverity(60, 500)).toBe('warning')
  })

  it('returns critical for >60 days overdue and amount > 500', () => {
    expect(classifyAlertSeverity(61, 501)).toBe('critical')
  })

  it('returns critical for >60 days overdue and large amount', () => {
    expect(classifyAlertSeverity(90, 100_000)).toBe('critical')
  })

  it('returns critical for >30 days and amount > 10_000', () => {
    expect(classifyAlertSeverity(31, 10_001)).toBe('critical')
  })

  it('returns critical for exactly 61 days and 501 amount (boundary)', () => {
    expect(classifyAlertSeverity(61, 501)).toBe('critical')
  })

  it('returns warning for exactly 45 days and 600 amount (between rules)', () => {
    // 45 > 30 but not > 60; amount 600 not > 10_000 → warning
    expect(classifyAlertSeverity(45, 600)).toBe('warning')
  })

  it('returns critical when both critical conditions apply simultaneously', () => {
    expect(classifyAlertSeverity(100, 50_000)).toBe('critical')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// buildAlertId
// ─────────────────────────────────────────────────────────────────────────────

describe('buildAlertId', () => {
  it('concatenates type and resourceId with underscore', () => {
    expect(buildAlertId('RECEIVABLE_30', 'cust-001')).toBe('RECEIVABLE_30_cust-001')
  })

  it('produces the same output on repeated calls (stable)', () => {
    const id1 = buildAlertId('DSR_HIGH', 'company-42')
    const id2 = buildAlertId('DSR_HIGH', 'company-42')
    expect(id1).toBe(id2)
  })

  it('replaces spaces in type with underscores', () => {
    const id = buildAlertId('CASH RUNWAY', 'all')
    expect(id).not.toContain(' ')
    expect(id).toBe('CASH_RUNWAY_all')
  })

  it('replaces spaces in resourceId with underscores', () => {
    const id = buildAlertId('TAX_DUE', 'company abc')
    expect(id).not.toContain(' ')
    expect(id).toBe('TAX_DUE_company_abc')
  })

  it('handles empty resourceId gracefully', () => {
    const id = buildAlertId('BS_IMBALANCED', '')
    expect(id).toBe('BS_IMBALANCED_')
  })

  it('handles empty type gracefully', () => {
    const id = buildAlertId('', 'res-1')
    expect(id).toBe('_res-1')
  })

  it('does not contain any spaces in output for arbitrary inputs', () => {
    const id = buildAlertId('SOME RULE TYPE', 'some resource id')
    expect(id).not.toContain(' ')
  })

  it('preserves hyphens and numeric chars', () => {
    const id = buildAlertId('RULE-01', 'partner-99')
    expect(id).toBe('RULE-01_partner-99')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// sortAlertsByPriority
// ─────────────────────────────────────────────────────────────────────────────

function makeAlert(
  severity: 'info' | 'warning' | 'critical',
  amount?: number,
  id = 'test',
): DecisionAlert {
  return {
    id,
    rule_type:   id,
    severity,
    title:       `${severity} alert`,
    detail:      '',
    actionLabel: 'Go',
    actionHref:  '/',
    triggeredAt: new Date().toISOString(),
    amount,
  }
}

describe('sortAlertsByPriority', () => {
  it('places critical before warning', () => {
    const alerts = [makeAlert('warning', 1000), makeAlert('critical', 500)]
    const sorted = sortAlertsByPriority(alerts)
    expect(sorted[0].severity).toBe('critical')
    expect(sorted[1].severity).toBe('warning')
  })

  it('places critical before info', () => {
    const alerts = [makeAlert('info', 9999), makeAlert('critical', 1)]
    const sorted = sortAlertsByPriority(alerts)
    expect(sorted[0].severity).toBe('critical')
  })

  it('places warning before info', () => {
    const alerts = [makeAlert('info', 5000), makeAlert('warning', 100)]
    const sorted = sortAlertsByPriority(alerts)
    expect(sorted[0].severity).toBe('warning')
    expect(sorted[1].severity).toBe('info')
  })

  it('sorts critical → warning → info order with mixed input', () => {
    const alerts = [
      makeAlert('info',     100,  'i1'),
      makeAlert('critical', 200,  'c1'),
      makeAlert('warning',  300,  'w1'),
    ]
    const sorted = sortAlertsByPriority(alerts)
    expect(sorted.map(a => a.severity)).toEqual(['critical', 'warning', 'info'])
  })

  it('within same severity, sorts by amount descending', () => {
    const alerts = [
      makeAlert('warning', 100, 'w-low'),
      makeAlert('warning', 900, 'w-high'),
      makeAlert('warning', 500, 'w-mid'),
    ]
    const sorted = sortAlertsByPriority(alerts)
    expect(sorted[0].id).toBe('w-high')
    expect(sorted[1].id).toBe('w-mid')
    expect(sorted[2].id).toBe('w-low')
  })

  it('treats undefined amount as 0 in sort', () => {
    const alerts = [
      makeAlert('warning', undefined, 'no-amount'),
      makeAlert('warning', 1,         'w-1'),
    ]
    const sorted = sortAlertsByPriority(alerts)
    expect(sorted[0].id).toBe('w-1')
    expect(sorted[1].id).toBe('no-amount')
  })

  it('returns a new array (does not mutate input)', () => {
    const alerts = [makeAlert('critical', 100), makeAlert('warning', 200)]
    const original = [...alerts]
    sortAlertsByPriority(alerts)
    expect(alerts[0].severity).toBe(original[0].severity)
    expect(alerts[1].severity).toBe(original[1].severity)
  })

  it('handles empty array', () => {
    expect(sortAlertsByPriority([])).toEqual([])
  })

  it('handles single-element array', () => {
    const a = [makeAlert('critical', 999)]
    expect(sortAlertsByPriority(a)).toHaveLength(1)
  })

  it('within critical tier, highest amount first', () => {
    const alerts = [
      makeAlert('critical', 50_000, 'c-small'),
      makeAlert('critical', 500_000, 'c-large'),
    ]
    const sorted = sortAlertsByPriority(alerts)
    expect(sorted[0].id).toBe('c-large')
  })

  it('correctly orders all three tiers with amounts', () => {
    const alerts = [
      makeAlert('info',     10_000, 'i-big'),
      makeAlert('warning',  1,      'w-small'),
      makeAlert('critical', 50,     'c-tiny'),
      makeAlert('warning',  5_000,  'w-big'),
    ]
    const sorted = sortAlertsByPriority(alerts)
    expect(sorted[0].id).toBe('c-tiny')   // critical first regardless of amount
    expect(sorted[1].id).toBe('w-big')    // warning, higher amount
    expect(sorted[2].id).toBe('w-small')  // warning, lower amount
    expect(sorted[3].id).toBe('i-big')    // info last
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// RECEIVABLE_CONCENTRATION rule in evaluateAlerts
// ─────────────────────────────────────────────────────────────────────────────

describe('evaluateAlerts — RECEIVABLE_CONCENTRATION rule', () => {
  it('fires when single customer exceeds 40% of total receivables', () => {
    const result = evaluateAlerts(baseInputs({
      totalReceivables:           100_000,
      maxCustomerReceivableShare: 0.45,
    }))
    const alert = result.find(a => a.rule_type === 'RECEIVABLE_CONCENTRATION')
    expect(alert).toBeDefined()
    expect(alert!.severity).toBe('warning')
  })

  it('does not fire at exactly 40% (boundary — rule requires >40%)', () => {
    const result = evaluateAlerts(baseInputs({
      totalReceivables:           100_000,
      maxCustomerReceivableShare: 0.40,
    }))
    expect(result.find(a => a.rule_type === 'RECEIVABLE_CONCENTRATION')).toBeUndefined()
  })

  it('does not fire when totalReceivables is 0 even if share is high', () => {
    const result = evaluateAlerts(baseInputs({
      totalReceivables:           0,
      maxCustomerReceivableShare: 0.90,
    }))
    expect(result.find(a => a.rule_type === 'RECEIVABLE_CONCENTRATION')).toBeUndefined()
  })

  it('does not fire when maxCustomerReceivableShare is 0', () => {
    const result = evaluateAlerts(baseInputs({
      totalReceivables:           500_000,
      maxCustomerReceivableShare: 0,
    }))
    expect(result.find(a => a.rule_type === 'RECEIVABLE_CONCENTRATION')).toBeUndefined()
  })

  it('alert amount reflects the concentrated receivable value', () => {
    const result = evaluateAlerts(baseInputs({
      totalReceivables:           200_000,
      maxCustomerReceivableShare: 0.50,
    }))
    const alert = result.find(a => a.rule_type === 'RECEIVABLE_CONCENTRATION')
    expect(alert).toBeDefined()
    expect(alert!.amount).toBeCloseTo(100_000, 1)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// DSR_HIGH rule in evaluateAlerts
// ─────────────────────────────────────────────────────────────────────────────

describe('evaluateAlerts — DSR_HIGH rule', () => {
  it('fires as critical when DSR > 0.70', () => {
    const result = evaluateAlerts(baseInputs({ debtServiceRatio: 0.75 }))
    const alert = result.find(a => a.rule_type === 'DSR_HIGH')
    expect(alert).toBeDefined()
    expect(alert!.severity).toBe('critical')
  })

  it('does not fire when DSR is exactly 0.70 (boundary)', () => {
    const result = evaluateAlerts(baseInputs({ debtServiceRatio: 0.70 }))
    expect(result.find(a => a.rule_type === 'DSR_HIGH')).toBeUndefined()
  })

  it('fires DSR_STRAINED (warning) in range 0.50 < DSR <= 0.70', () => {
    const result = evaluateAlerts(baseInputs({ debtServiceRatio: 0.60 }))
    expect(result.find(a => a.rule_type === 'DSR_STRAINED')).toBeDefined()
    expect(result.find(a => a.rule_type === 'DSR_HIGH')).toBeUndefined()
  })

  it('output is sorted critical-first when DSR_HIGH fires with other alerts', () => {
    const result = evaluateAlerts(baseInputs({
      debtServiceRatio:   0.80,
      overdueCount30:     3,
      overdueTotal30:     1_000,
    }))
    expect(result[0].severity).toBe('critical')
  })
})
