/**
 * KPI Threshold Service — unit tests
 *
 * Tests all pure computation functions in kpi-threshold.service.ts.
 * No DB or network calls — pure function tests only.
 *
 * 120+ tests total.
 */

import { describe, it, expect } from 'vitest'
import {
  DEFAULT_KPI_THRESHOLDS,
  evaluateThreshold,
  evaluateAllThresholds,
  filterTriggeredAlerts,
  prioritizeAlertsBySeverity,
  countAlertsBySeverity,
  computeAlertHealthScore,
  classifyAlertHealthLevel,
  mergeWithCustomThresholds,
  generateAlertSummaryNarrative,
} from '../lib/services/intelligence/kpi-threshold.service'
import type {
  KpiThreshold,
  ThresholdEvaluation,
} from '../lib/services/intelligence/kpi-threshold.service'

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeThreshold(overrides: Partial<KpiThreshold> & { kpi_key: string }): KpiThreshold {
  return {
    kpi_key:            overrides.kpi_key,
    kpi_label_tr:       overrides.kpi_label_tr       ?? 'Test KPI',
    category:           overrides.category            ?? 'financial',
    direction:          overrides.direction           ?? 'below',
    warning_threshold:  overrides.warning_threshold  ?? 20,
    critical_threshold: overrides.critical_threshold ?? 10,
    unit:               overrides.unit               ?? '%',
    is_higher_better:   overrides.is_higher_better   ?? true,
    ...overrides,
  }
}

function makeEvaluation(overrides: Partial<ThresholdEvaluation>): ThresholdEvaluation {
  return {
    kpi_key:            overrides.kpi_key            ?? 'test_kpi',
    kpi_label_tr:       overrides.kpi_label_tr       ?? 'Test KPI',
    current_value:      overrides.current_value      ?? null,
    warning_threshold:  overrides.warning_threshold  ?? 20,
    critical_threshold: overrides.critical_threshold ?? 10,
    triggered:          overrides.triggered          ?? false,
    severity:           overrides.severity           ?? null,
    message_tr:         overrides.message_tr         ?? '',
    ...overrides,
  }
}

// ── DEFAULT_KPI_THRESHOLDS ─────────────────────────────────────────────────────

describe('DEFAULT_KPI_THRESHOLDS', () => {

  it('1. is exported as a non-empty array', () => {
    expect(Array.isArray(DEFAULT_KPI_THRESHOLDS)).toBe(true)
    expect(DEFAULT_KPI_THRESHOLDS.length).toBeGreaterThan(0)
  })

  it('2. has exactly 13 entries', () => {
    expect(DEFAULT_KPI_THRESHOLDS).toHaveLength(13)
  })

  it('3. all entries have required fields', () => {
    for (const t of DEFAULT_KPI_THRESHOLDS) {
      expect(t.kpi_key).toBeTruthy()
      expect(t.kpi_label_tr).toBeTruthy()
      expect(['financial', 'commercial', 'operational', 'partner']).toContain(t.category)
      expect(['above', 'below', 'between', 'outside']).toContain(t.direction)
      expect(typeof t.unit).toBe('string')
      expect(typeof t.is_higher_better).toBe('boolean')
    }
  })

  it('4. all kpi_keys are unique', () => {
    const keys = DEFAULT_KPI_THRESHOLDS.map(t => t.kpi_key)
    const unique = new Set(keys)
    expect(unique.size).toBe(keys.length)
  })

  it('5. gross_margin_pct has correct defaults', () => {
    const t = DEFAULT_KPI_THRESHOLDS.find(x => x.kpi_key === 'gross_margin_pct')!
    expect(t).toBeDefined()
    expect(t.category).toBe('financial')
    expect(t.direction).toBe('below')
    expect(t.warning_threshold).toBe(20)
    expect(t.critical_threshold).toBe(10)
    expect(t.unit).toBe('%')
    expect(t.is_higher_better).toBe(true)
  })

  it('6. cash_runway_months has correct defaults', () => {
    const t = DEFAULT_KPI_THRESHOLDS.find(x => x.kpi_key === 'cash_runway_months')!
    expect(t).toBeDefined()
    expect(t.direction).toBe('below')
    expect(t.warning_threshold).toBe(6)
    expect(t.critical_threshold).toBe(3)
    expect(t.unit).toBe(' ay')
  })

  it('7. dso_days direction is above', () => {
    const t = DEFAULT_KPI_THRESHOLDS.find(x => x.kpi_key === 'dso_days')!
    expect(t.direction).toBe('above')
    expect(t.warning_threshold).toBe(60)
    expect(t.critical_threshold).toBe(90)
    expect(t.is_higher_better).toBe(false)
  })

  it('8. expense_ratio_pct is above direction with is_higher_better=false', () => {
    const t = DEFAULT_KPI_THRESHOLDS.find(x => x.kpi_key === 'expense_ratio_pct')!
    expect(t.direction).toBe('above')
    expect(t.is_higher_better).toBe(false)
    expect(t.category).toBe('financial')
  })

  it('9. partner category entries are present', () => {
    const partnerEntries = DEFAULT_KPI_THRESHOLDS.filter(t => t.category === 'partner')
    expect(partnerEntries.length).toBeGreaterThanOrEqual(2)
  })

  it('10. operational category entries are present', () => {
    const opEntries = DEFAULT_KPI_THRESHOLDS.filter(t => t.category === 'operational')
    expect(opEntries.length).toBeGreaterThanOrEqual(2)
  })

  it('11. revenue_concentration_hhi has fractional thresholds', () => {
    const t = DEFAULT_KPI_THRESHOLDS.find(x => x.kpi_key === 'revenue_concentration_hhi')!
    expect(t.warning_threshold).toBe(0.25)
    expect(t.critical_threshold).toBe(0.50)
  })

  it('12. capital_fulfillment_pct direction is below', () => {
    const t = DEFAULT_KPI_THRESHOLDS.find(x => x.kpi_key === 'capital_fulfillment_pct')!
    expect(t.direction).toBe('below')
    expect(t.is_higher_better).toBe(true)
  })

  it('13. burn_efficiency_ratio has fractional thresholds', () => {
    const t = DEFAULT_KPI_THRESHOLDS.find(x => x.kpi_key === 'burn_efficiency_ratio')!
    expect(t.warning_threshold).toBe(0.75)
    expect(t.critical_threshold).toBe(0.5)
  })

})

// ── evaluateThreshold ─────────────────────────────────────────────────────────

describe('evaluateThreshold', () => {

  // null value
  it('14. null value returns triggered=false, severity=null', () => {
    const t = makeThreshold({ kpi_key: 'test', direction: 'below' })
    const result = evaluateThreshold(t, null)
    expect(result.triggered).toBe(false)
    expect(result.severity).toBeNull()
  })

  it('15. null value message is "Veri mevcut değil"', () => {
    const t = makeThreshold({ kpi_key: 'test', direction: 'below' })
    const result = evaluateThreshold(t, null)
    expect(result.message_tr).toBe('Veri mevcut değil')
  })

  it('16. null value preserves kpi_key and kpi_label_tr', () => {
    const t = makeThreshold({ kpi_key: 'gross_margin_pct', kpi_label_tr: 'Brüt Kar Marjı' })
    const result = evaluateThreshold(t, null)
    expect(result.kpi_key).toBe('gross_margin_pct')
    expect(result.kpi_label_tr).toBe('Brüt Kar Marjı')
  })

  it('17. null value preserves threshold values', () => {
    const t = makeThreshold({ kpi_key: 'test', warning_threshold: 20, critical_threshold: 10 })
    const result = evaluateThreshold(t, null)
    expect(result.warning_threshold).toBe(20)
    expect(result.critical_threshold).toBe(10)
  })

  // direction: 'below'
  it('18. below: value above warning → not triggered', () => {
    const t = makeThreshold({ kpi_key: 'test', direction: 'below', warning_threshold: 20, critical_threshold: 10 })
    const result = evaluateThreshold(t, 25)
    expect(result.triggered).toBe(false)
    expect(result.severity).toBeNull()
  })

  it('19. below: value exactly at warning → not triggered', () => {
    const t = makeThreshold({ kpi_key: 'test', direction: 'below', warning_threshold: 20, critical_threshold: 10 })
    const result = evaluateThreshold(t, 20)
    expect(result.triggered).toBe(false)
  })

  it('20. below: value below warning but above critical → warning', () => {
    const t = makeThreshold({ kpi_key: 'test', direction: 'below', warning_threshold: 20, critical_threshold: 10 })
    const result = evaluateThreshold(t, 15)
    expect(result.triggered).toBe(true)
    expect(result.severity).toBe('warning')
  })

  it('21. below: value exactly at critical → critical', () => {
    const t = makeThreshold({ kpi_key: 'test', direction: 'below', warning_threshold: 20, critical_threshold: 10 })
    const result = evaluateThreshold(t, 10)
    expect(result.triggered).toBe(true)
    expect(result.severity).toBe('critical')
  })

  it('22. below: value below critical → critical', () => {
    const t = makeThreshold({ kpi_key: 'test', direction: 'below', warning_threshold: 20, critical_threshold: 10 })
    const result = evaluateThreshold(t, 5)
    expect(result.triggered).toBe(true)
    expect(result.severity).toBe('critical')
  })

  it('23. below: value of 0 when critical is 0 → critical', () => {
    const t = makeThreshold({ kpi_key: 'net_margin_pct', direction: 'below', warning_threshold: 5, critical_threshold: 0 })
    const result = evaluateThreshold(t, 0)
    expect(result.triggered).toBe(true)
    expect(result.severity).toBe('critical')
  })

  it('24. below: negative value → critical', () => {
    const t = makeThreshold({ kpi_key: 'net_margin_pct', direction: 'below', warning_threshold: 5, critical_threshold: 0 })
    const result = evaluateThreshold(t, -5)
    expect(result.triggered).toBe(true)
    expect(result.severity).toBe('critical')
  })

  // direction: 'above'
  it('25. above: value below warning → not triggered', () => {
    const t = makeThreshold({ kpi_key: 'dso', direction: 'above', warning_threshold: 60, critical_threshold: 90 })
    const result = evaluateThreshold(t, 45)
    expect(result.triggered).toBe(false)
    expect(result.severity).toBeNull()
  })

  it('26. above: value exactly at warning → not triggered', () => {
    const t = makeThreshold({ kpi_key: 'dso', direction: 'above', warning_threshold: 60, critical_threshold: 90 })
    const result = evaluateThreshold(t, 60)
    expect(result.triggered).toBe(false)
  })

  it('27. above: value above warning but below critical → warning', () => {
    const t = makeThreshold({ kpi_key: 'dso', direction: 'above', warning_threshold: 60, critical_threshold: 90 })
    const result = evaluateThreshold(t, 75)
    expect(result.triggered).toBe(true)
    expect(result.severity).toBe('warning')
  })

  it('28. above: value exactly at critical → critical', () => {
    const t = makeThreshold({ kpi_key: 'dso', direction: 'above', warning_threshold: 60, critical_threshold: 90 })
    const result = evaluateThreshold(t, 90)
    expect(result.triggered).toBe(true)
    expect(result.severity).toBe('critical')
  })

  it('29. above: value above critical → critical', () => {
    const t = makeThreshold({ kpi_key: 'dso', direction: 'above', warning_threshold: 60, critical_threshold: 90 })
    const result = evaluateThreshold(t, 120)
    expect(result.triggered).toBe(true)
    expect(result.severity).toBe('critical')
  })

  // direction: 'between'
  it('30. between: value within range → not triggered', () => {
    const t = makeThreshold({ kpi_key: 'test', direction: 'between', warning_threshold: 10, critical_threshold: 90 })
    const result = evaluateThreshold(t, 50)
    expect(result.triggered).toBe(false)
  })

  it('31. between: value below warning → warning triggered', () => {
    const t = makeThreshold({ kpi_key: 'test', direction: 'between', warning_threshold: 10, critical_threshold: 90 })
    const result = evaluateThreshold(t, 5)
    expect(result.triggered).toBe(true)
    expect(result.severity).toBe('warning')
  })

  it('32. between: value above critical → critical triggered', () => {
    const t = makeThreshold({ kpi_key: 'test', direction: 'between', warning_threshold: 10, critical_threshold: 90 })
    const result = evaluateThreshold(t, 100)
    expect(result.triggered).toBe(true)
    expect(result.severity).toBe('critical')
  })

  it('33. between: value at lower boundary → not triggered', () => {
    const t = makeThreshold({ kpi_key: 'test', direction: 'between', warning_threshold: 10, critical_threshold: 90 })
    const result = evaluateThreshold(t, 10)
    expect(result.triggered).toBe(false)
  })

  // direction: 'outside'
  it('34. outside: value within range → triggered (warning)', () => {
    const t = makeThreshold({ kpi_key: 'test', direction: 'outside', warning_threshold: 40, critical_threshold: 60 })
    const result = evaluateThreshold(t, 50)
    expect(result.triggered).toBe(true)
    expect(result.severity).toBe('warning')
  })

  it('35. outside: value at lower boundary → triggered', () => {
    const t = makeThreshold({ kpi_key: 'test', direction: 'outside', warning_threshold: 40, critical_threshold: 60 })
    const result = evaluateThreshold(t, 40)
    expect(result.triggered).toBe(true)
  })

  it('36. outside: value at upper boundary → triggered', () => {
    const t = makeThreshold({ kpi_key: 'test', direction: 'outside', warning_threshold: 40, critical_threshold: 60 })
    const result = evaluateThreshold(t, 60)
    expect(result.triggered).toBe(true)
  })

  it('37. outside: value below range → not triggered', () => {
    const t = makeThreshold({ kpi_key: 'test', direction: 'outside', warning_threshold: 40, critical_threshold: 60 })
    const result = evaluateThreshold(t, 20)
    expect(result.triggered).toBe(false)
  })

  it('38. outside: value above range → not triggered', () => {
    const t = makeThreshold({ kpi_key: 'test', direction: 'outside', warning_threshold: 40, critical_threshold: 60 })
    const result = evaluateThreshold(t, 80)
    expect(result.triggered).toBe(false)
  })

  // Message content
  it('39. triggered message includes kpi_label_tr', () => {
    const t = makeThreshold({ kpi_key: 'gross_margin_pct', kpi_label_tr: 'Brüt Kar Marjı', direction: 'below', warning_threshold: 20, critical_threshold: 10, unit: '%' })
    const result = evaluateThreshold(t, 12)
    expect(result.message_tr).toContain('Brüt Kar Marjı')
  })

  it('40. triggered message includes current value', () => {
    const t = makeThreshold({ kpi_key: 'gross_margin_pct', kpi_label_tr: 'Brüt Kar Marjı', direction: 'below', warning_threshold: 20, critical_threshold: 10, unit: '%' })
    const result = evaluateThreshold(t, 12)
    expect(result.message_tr).toContain('12')
  })

  it('41. non-triggered message includes "hedef seviyede"', () => {
    const t = makeThreshold({ kpi_key: 'test', direction: 'below', warning_threshold: 20, critical_threshold: 10 })
    const result = evaluateThreshold(t, 25)
    expect(result.message_tr).toContain('hedef seviyede')
  })

  // current_value is preserved
  it('42. current_value is preserved in result', () => {
    const t = makeThreshold({ kpi_key: 'test', direction: 'below', warning_threshold: 20, critical_threshold: 10 })
    const result = evaluateThreshold(t, 15)
    expect(result.current_value).toBe(15)
  })

  it('43. below: critical takes priority over warning when both triggered', () => {
    const t = makeThreshold({ kpi_key: 'test', direction: 'below', warning_threshold: 20, critical_threshold: 10 })
    const result = evaluateThreshold(t, 5)  // below both
    expect(result.severity).toBe('critical')
  })

  it('44. above: critical takes priority when above both thresholds', () => {
    const t = makeThreshold({ kpi_key: 'dso', direction: 'above', warning_threshold: 60, critical_threshold: 90 })
    const result = evaluateThreshold(t, 100)  // above both
    expect(result.severity).toBe('critical')
  })

  // Real KPI spot-checks
  it('45. gross_margin_pct at 8 triggers critical', () => {
    const t = DEFAULT_KPI_THRESHOLDS.find(x => x.kpi_key === 'gross_margin_pct')!
    const result = evaluateThreshold(t, 8)
    expect(result.severity).toBe('critical')
    expect(result.triggered).toBe(true)
  })

  it('46. gross_margin_pct at 15 triggers warning', () => {
    const t = DEFAULT_KPI_THRESHOLDS.find(x => x.kpi_key === 'gross_margin_pct')!
    const result = evaluateThreshold(t, 15)
    expect(result.severity).toBe('warning')
  })

  it('47. gross_margin_pct at 25 does not trigger', () => {
    const t = DEFAULT_KPI_THRESHOLDS.find(x => x.kpi_key === 'gross_margin_pct')!
    const result = evaluateThreshold(t, 25)
    expect(result.triggered).toBe(false)
  })

  it('48. cash_runway_months at 2 triggers critical', () => {
    const t = DEFAULT_KPI_THRESHOLDS.find(x => x.kpi_key === 'cash_runway_months')!
    const result = evaluateThreshold(t, 2)
    expect(result.severity).toBe('critical')
  })

  it('49. cash_runway_months at 4 triggers warning', () => {
    const t = DEFAULT_KPI_THRESHOLDS.find(x => x.kpi_key === 'cash_runway_months')!
    const result = evaluateThreshold(t, 4)
    expect(result.severity).toBe('warning')
  })

  it('50. cash_runway_months at 8 does not trigger', () => {
    const t = DEFAULT_KPI_THRESHOLDS.find(x => x.kpi_key === 'cash_runway_months')!
    const result = evaluateThreshold(t, 8)
    expect(result.triggered).toBe(false)
  })

  it('51. expense_ratio_pct at 95 triggers critical', () => {
    const t = DEFAULT_KPI_THRESHOLDS.find(x => x.kpi_key === 'expense_ratio_pct')!
    const result = evaluateThreshold(t, 95)
    expect(result.severity).toBe('critical')
  })

  it('52. expense_ratio_pct at 80 triggers warning', () => {
    const t = DEFAULT_KPI_THRESHOLDS.find(x => x.kpi_key === 'expense_ratio_pct')!
    const result = evaluateThreshold(t, 80)
    expect(result.severity).toBe('warning')
  })

  it('53. dso_days at 100 triggers critical', () => {
    const t = DEFAULT_KPI_THRESHOLDS.find(x => x.kpi_key === 'dso_days')!
    const result = evaluateThreshold(t, 100)
    expect(result.severity).toBe('critical')
  })

  it('54. partner_loan_to_equity_pct at 250 triggers critical', () => {
    const t = DEFAULT_KPI_THRESHOLDS.find(x => x.kpi_key === 'partner_loan_to_equity_pct')!
    const result = evaluateThreshold(t, 250)
    expect(result.severity).toBe('critical')
  })

  it('55. capital_fulfillment_pct at 40 triggers critical', () => {
    const t = DEFAULT_KPI_THRESHOLDS.find(x => x.kpi_key === 'capital_fulfillment_pct')!
    const result = evaluateThreshold(t, 40)
    expect(result.severity).toBe('critical')
  })

  it('56. capital_fulfillment_pct at 100 does not trigger', () => {
    const t = DEFAULT_KPI_THRESHOLDS.find(x => x.kpi_key === 'capital_fulfillment_pct')!
    const result = evaluateThreshold(t, 100)
    expect(result.triggered).toBe(false)
  })

})

// ── evaluateAllThresholds ──────────────────────────────────────────────────────

describe('evaluateAllThresholds', () => {

  it('57. returns an array with same length as thresholds', () => {
    const thresholds = [
      makeThreshold({ kpi_key: 'a' }),
      makeThreshold({ kpi_key: 'b' }),
      makeThreshold({ kpi_key: 'c' }),
    ]
    const result = evaluateAllThresholds(thresholds, {})
    expect(result).toHaveLength(3)
  })

  it('58. missing key in kpiValues → current_value=null', () => {
    const t = makeThreshold({ kpi_key: 'missing_key' })
    const results = evaluateAllThresholds([t], {})
    expect(results[0].current_value).toBeNull()
  })

  it('59. explicit null in kpiValues → current_value=null', () => {
    const t = makeThreshold({ kpi_key: 'test' })
    const results = evaluateAllThresholds([t], { test: null })
    expect(results[0].current_value).toBeNull()
  })

  it('60. evaluates correctly when value is provided', () => {
    const t = makeThreshold({ kpi_key: 'gross_margin_pct', direction: 'below', warning_threshold: 20, critical_threshold: 10 })
    const results = evaluateAllThresholds([t], { gross_margin_pct: 15 })
    expect(results[0].triggered).toBe(true)
    expect(results[0].severity).toBe('warning')
  })

  it('61. multiple thresholds all evaluated independently', () => {
    const thresholds = [
      makeThreshold({ kpi_key: 'a', direction: 'below', warning_threshold: 20, critical_threshold: 10 }),
      makeThreshold({ kpi_key: 'b', direction: 'above', warning_threshold: 60, critical_threshold: 90 }),
    ]
    const results = evaluateAllThresholds(thresholds, { a: 5, b: 100 })
    expect(results[0].severity).toBe('critical')
    expect(results[1].severity).toBe('critical')
  })

  it('62. uses full DEFAULT_KPI_THRESHOLDS without error', () => {
    const kpiValues: Record<string, number | null> = {}
    for (const t of DEFAULT_KPI_THRESHOLDS) {
      kpiValues[t.kpi_key] = null
    }
    const results = evaluateAllThresholds(DEFAULT_KPI_THRESHOLDS, kpiValues)
    expect(results).toHaveLength(DEFAULT_KPI_THRESHOLDS.length)
  })

  it('63. results preserve kpi_key from threshold', () => {
    const t = makeThreshold({ kpi_key: 'my_special_kpi' })
    const results = evaluateAllThresholds([t], {})
    expect(results[0].kpi_key).toBe('my_special_kpi')
  })

  it('64. empty thresholds array returns empty array', () => {
    const results = evaluateAllThresholds([], { someKey: 100 })
    expect(results).toHaveLength(0)
  })

})

// ── filterTriggeredAlerts ─────────────────────────────────────────────────────

describe('filterTriggeredAlerts', () => {

  it('65. empty array returns empty array', () => {
    expect(filterTriggeredAlerts([])).toHaveLength(0)
  })

  it('66. all non-triggered → empty result', () => {
    const evals = [
      makeEvaluation({ triggered: false }),
      makeEvaluation({ triggered: false }),
    ]
    expect(filterTriggeredAlerts(evals)).toHaveLength(0)
  })

  it('67. all triggered → all returned', () => {
    const evals = [
      makeEvaluation({ triggered: true, severity: 'warning' }),
      makeEvaluation({ triggered: true, severity: 'critical' }),
    ]
    expect(filterTriggeredAlerts(evals)).toHaveLength(2)
  })

  it('68. mixed → only triggered returned', () => {
    const evals = [
      makeEvaluation({ kpi_key: 'a', triggered: true,  severity: 'warning' }),
      makeEvaluation({ kpi_key: 'b', triggered: false, severity: null }),
      makeEvaluation({ kpi_key: 'c', triggered: true,  severity: 'critical' }),
    ]
    const result = filterTriggeredAlerts(evals)
    expect(result).toHaveLength(2)
    expect(result.map(e => e.kpi_key)).toEqual(['a', 'c'])
  })

  it('69. does not mutate original array', () => {
    const evals = [
      makeEvaluation({ triggered: true, severity: 'warning' }),
      makeEvaluation({ triggered: false }),
    ]
    const original = [...evals]
    filterTriggeredAlerts(evals)
    expect(evals).toEqual(original)
  })

})

// ── prioritizeAlertsBySeverity ────────────────────────────────────────────────

describe('prioritizeAlertsBySeverity', () => {

  it('70. empty array returns empty array', () => {
    expect(prioritizeAlertsBySeverity([])).toHaveLength(0)
  })

  it('71. critical comes before warning', () => {
    const evals = [
      makeEvaluation({ kpi_key: 'a', triggered: true, severity: 'warning' }),
      makeEvaluation({ kpi_key: 'b', triggered: true, severity: 'critical' }),
    ]
    const result = prioritizeAlertsBySeverity(evals)
    expect(result[0].severity).toBe('critical')
    expect(result[1].severity).toBe('warning')
  })

  it('72. warning comes before info', () => {
    const evals = [
      makeEvaluation({ kpi_key: 'a', triggered: true, severity: 'info' }),
      makeEvaluation({ kpi_key: 'b', triggered: true, severity: 'warning' }),
    ]
    const result = prioritizeAlertsBySeverity(evals)
    expect(result[0].severity).toBe('warning')
    expect(result[1].severity).toBe('info')
  })

  it('73. critical before warning before info in mixed array', () => {
    const evals = [
      makeEvaluation({ kpi_key: 'a', triggered: true, severity: 'info' }),
      makeEvaluation({ kpi_key: 'b', triggered: true, severity: 'critical' }),
      makeEvaluation({ kpi_key: 'c', triggered: true, severity: 'warning' }),
    ]
    const result = prioritizeAlertsBySeverity(evals)
    expect(result[0].severity).toBe('critical')
    expect(result[1].severity).toBe('warning')
    expect(result[2].severity).toBe('info')
  })

  it('74. same severity preserves relative order (stable sort)', () => {
    const evals = [
      makeEvaluation({ kpi_key: 'first',  triggered: true, severity: 'warning' }),
      makeEvaluation({ kpi_key: 'second', triggered: true, severity: 'warning' }),
      makeEvaluation({ kpi_key: 'third',  triggered: true, severity: 'warning' }),
    ]
    const result = prioritizeAlertsBySeverity(evals)
    expect(result[0].kpi_key).toBe('first')
    expect(result[1].kpi_key).toBe('second')
    expect(result[2].kpi_key).toBe('third')
  })

  it('75. null severity (not triggered) sorted to end', () => {
    const evals = [
      makeEvaluation({ kpi_key: 'a', triggered: false, severity: null }),
      makeEvaluation({ kpi_key: 'b', triggered: true,  severity: 'critical' }),
    ]
    const result = prioritizeAlertsBySeverity(evals)
    expect(result[0].severity).toBe('critical')
  })

  it('76. does not mutate original array', () => {
    const evals = [
      makeEvaluation({ kpi_key: 'a', triggered: true, severity: 'warning' }),
      makeEvaluation({ kpi_key: 'b', triggered: true, severity: 'critical' }),
    ]
    const originalOrder = evals.map(e => e.kpi_key)
    prioritizeAlertsBySeverity(evals)
    expect(evals.map(e => e.kpi_key)).toEqual(originalOrder)
  })

  it('77. single-element array returns same element', () => {
    const evals = [makeEvaluation({ triggered: true, severity: 'critical' })]
    expect(prioritizeAlertsBySeverity(evals)).toHaveLength(1)
  })

})

// ── countAlertsBySeverity ─────────────────────────────────────────────────────

describe('countAlertsBySeverity', () => {

  it('78. empty array returns all zeros', () => {
    const result = countAlertsBySeverity([])
    expect(result).toEqual({ critical: 0, warning: 0, info: 0, total: 0 })
  })

  it('79. counts critical correctly', () => {
    const evals = [
      makeEvaluation({ severity: 'critical' }),
      makeEvaluation({ severity: 'critical' }),
    ]
    expect(countAlertsBySeverity(evals).critical).toBe(2)
  })

  it('80. counts warning correctly', () => {
    const evals = [
      makeEvaluation({ severity: 'warning' }),
      makeEvaluation({ severity: 'warning' }),
      makeEvaluation({ severity: 'warning' }),
    ]
    expect(countAlertsBySeverity(evals).warning).toBe(3)
  })

  it('81. counts info correctly', () => {
    const evals = [makeEvaluation({ severity: 'info' })]
    expect(countAlertsBySeverity(evals).info).toBe(1)
  })

  it('82. total equals sum of all severities', () => {
    const evals = [
      makeEvaluation({ severity: 'critical' }),
      makeEvaluation({ severity: 'warning' }),
      makeEvaluation({ severity: 'info' }),
    ]
    const result = countAlertsBySeverity(evals)
    expect(result.total).toBe(result.critical + result.warning + result.info)
    expect(result.total).toBe(3)
  })

  it('83. null severity not counted in any bucket', () => {
    const evals = [
      makeEvaluation({ severity: null }),
      makeEvaluation({ severity: 'warning' }),
    ]
    const result = countAlertsBySeverity(evals)
    expect(result.warning).toBe(1)
    expect(result.critical).toBe(0)
    expect(result.info).toBe(0)
    expect(result.total).toBe(1)
  })

  it('84. mixed severities counted correctly', () => {
    const evals = [
      makeEvaluation({ severity: 'critical' }),
      makeEvaluation({ severity: 'critical' }),
      makeEvaluation({ severity: 'warning' }),
      makeEvaluation({ severity: 'info' }),
      makeEvaluation({ severity: null }),
    ]
    const result = countAlertsBySeverity(evals)
    expect(result.critical).toBe(2)
    expect(result.warning).toBe(1)
    expect(result.info).toBe(1)
    expect(result.total).toBe(4)
  })

})

// ── computeAlertHealthScore ────────────────────────────────────────────────────

describe('computeAlertHealthScore', () => {

  it('85. no triggered alerts → score 100', () => {
    const evals = [
      makeEvaluation({ triggered: false, severity: null }),
      makeEvaluation({ triggered: false, severity: null }),
    ]
    expect(computeAlertHealthScore(evals)).toBe(100)
  })

  it('86. empty array → score 100', () => {
    expect(computeAlertHealthScore([])).toBe(100)
  })

  it('87. one critical triggered → score 80', () => {
    const evals = [makeEvaluation({ triggered: true, severity: 'critical' })]
    expect(computeAlertHealthScore(evals)).toBe(80)
  })

  it('88. one warning triggered → score 90', () => {
    const evals = [makeEvaluation({ triggered: true, severity: 'warning' })]
    expect(computeAlertHealthScore(evals)).toBe(90)
  })

  it('89. two critical triggered → score 60', () => {
    const evals = [
      makeEvaluation({ triggered: true, severity: 'critical' }),
      makeEvaluation({ triggered: true, severity: 'critical' }),
    ]
    expect(computeAlertHealthScore(evals)).toBe(60)
  })

  it('90. five critical → score floors at 0', () => {
    const evals = Array.from({ length: 5 }, () =>
      makeEvaluation({ triggered: true, severity: 'critical' }),
    )
    expect(computeAlertHealthScore(evals)).toBe(0)
  })

  it('91. six critical → score floors at 0 (not negative)', () => {
    const evals = Array.from({ length: 6 }, () =>
      makeEvaluation({ triggered: true, severity: 'critical' }),
    )
    expect(computeAlertHealthScore(evals)).toBe(0)
  })

  it('92. mixed critical and warning deducted correctly', () => {
    const evals = [
      makeEvaluation({ triggered: true, severity: 'critical' }),
      makeEvaluation({ triggered: true, severity: 'warning' }),
    ]
    // 100 - 20 - 10 = 70
    expect(computeAlertHealthScore(evals)).toBe(70)
  })

  it('93. non-triggered evaluations with severity not counted', () => {
    const evals = [
      makeEvaluation({ triggered: false, severity: 'critical' }),  // not triggered — should NOT deduct
      makeEvaluation({ triggered: true,  severity: 'warning' }),
    ]
    expect(computeAlertHealthScore(evals)).toBe(90)
  })

  it('94. score never exceeds 100', () => {
    const score = computeAlertHealthScore([])
    expect(score).toBeLessThanOrEqual(100)
  })

})

// ── classifyAlertHealthLevel ──────────────────────────────────────────────────

describe('classifyAlertHealthLevel', () => {

  it('95. score 100 → healthy', () => {
    expect(classifyAlertHealthLevel(100)).toBe('healthy')
  })

  it('96. score 80 → healthy (boundary)', () => {
    expect(classifyAlertHealthLevel(80)).toBe('healthy')
  })

  it('97. score 79 → watch', () => {
    expect(classifyAlertHealthLevel(79)).toBe('watch')
  })

  it('98. score 60 → watch (boundary)', () => {
    expect(classifyAlertHealthLevel(60)).toBe('watch')
  })

  it('99. score 59 → concern', () => {
    expect(classifyAlertHealthLevel(59)).toBe('concern')
  })

  it('100. score 40 → concern (boundary)', () => {
    expect(classifyAlertHealthLevel(40)).toBe('concern')
  })

  it('101. score 39 → critical', () => {
    expect(classifyAlertHealthLevel(39)).toBe('critical')
  })

  it('102. score 0 → critical', () => {
    expect(classifyAlertHealthLevel(0)).toBe('critical')
  })

  it('103. score 70 → watch', () => {
    expect(classifyAlertHealthLevel(70)).toBe('watch')
  })

  it('104. score 50 → concern', () => {
    expect(classifyAlertHealthLevel(50)).toBe('concern')
  })

})

// ── mergeWithCustomThresholds ─────────────────────────────────────────────────

describe('mergeWithCustomThresholds', () => {

  const defaults: KpiThreshold[] = [
    makeThreshold({ kpi_key: 'gross_margin_pct', warning_threshold: 20, critical_threshold: 10 }),
    makeThreshold({ kpi_key: 'dso_days',         warning_threshold: 60, critical_threshold: 90 }),
  ]

  it('105. no custom overrides → returns defaults unchanged', () => {
    const result = mergeWithCustomThresholds(defaults, [])
    expect(result).toHaveLength(2)
    expect(result[0].kpi_key).toBe('gross_margin_pct')
    expect(result[1].kpi_key).toBe('dso_days')
  })

  it('106. custom override changes warning_threshold', () => {
    const result = mergeWithCustomThresholds(defaults, [
      { kpi_key: 'gross_margin_pct', warning_threshold: 30 },
    ])
    const gm = result.find(t => t.kpi_key === 'gross_margin_pct')!
    expect(gm.warning_threshold).toBe(30)
  })

  it('107. custom override does not affect non-overridden fields', () => {
    const result = mergeWithCustomThresholds(defaults, [
      { kpi_key: 'gross_margin_pct', warning_threshold: 30 },
    ])
    const gm = result.find(t => t.kpi_key === 'gross_margin_pct')!
    expect(gm.critical_threshold).toBe(10)  // unchanged
    expect(gm.direction).toBe('below')       // unchanged
  })

  it('108. custom override does not affect other defaults', () => {
    const result = mergeWithCustomThresholds(defaults, [
      { kpi_key: 'gross_margin_pct', warning_threshold: 30 },
    ])
    const dso = result.find(t => t.kpi_key === 'dso_days')!
    expect(dso.warning_threshold).toBe(60)  // unchanged
  })

  it('109. new kpi_key in custom appended to result', () => {
    const newKpi: Partial<KpiThreshold> & { kpi_key: string } = {
      kpi_key: 'custom_kpi',
      kpi_label_tr: 'Özel KPI',
      category: 'operational',
      direction: 'above',
      warning_threshold: 50,
      critical_threshold: 80,
      unit: '%',
      is_higher_better: false,
    }
    const result = mergeWithCustomThresholds(defaults, [newKpi])
    expect(result).toHaveLength(3)
    const custom = result.find(t => t.kpi_key === 'custom_kpi')!
    expect(custom).toBeDefined()
    expect(custom.warning_threshold).toBe(50)
  })

  it('110. multiple overrides applied independently', () => {
    const result = mergeWithCustomThresholds(defaults, [
      { kpi_key: 'gross_margin_pct', critical_threshold: 5 },
      { kpi_key: 'dso_days',         warning_threshold: 45 },
    ])
    const gm  = result.find(t => t.kpi_key === 'gross_margin_pct')!
    const dso = result.find(t => t.kpi_key === 'dso_days')!
    expect(gm.critical_threshold).toBe(5)
    expect(dso.warning_threshold).toBe(45)
  })

  it('111. empty defaults with custom → custom appended', () => {
    const result = mergeWithCustomThresholds([], [
      { kpi_key: 'my_kpi', warning_threshold: 10, critical_threshold: 5 } as Partial<KpiThreshold> & { kpi_key: string },
    ])
    expect(result).toHaveLength(1)
    expect(result[0].kpi_key).toBe('my_kpi')
  })

  it('112. does not mutate original defaults array', () => {
    const originalLength = defaults.length
    mergeWithCustomThresholds(defaults, [{ kpi_key: 'new_one', warning_threshold: 10 }])
    expect(defaults).toHaveLength(originalLength)
  })

})

// ── generateAlertSummaryNarrative ─────────────────────────────────────────────

describe('generateAlertSummaryNarrative', () => {

  it('113. healthy with 0 alerts → "Tüm KPI\'lar hedef seviyelerde" message', () => {
    const result = generateAlertSummaryNarrative(0, 0, 'healthy')
    expect(result).toContain("Tüm KPI'lar hedef seviyelerde")
    expect(result).toContain('aktif uyarı bulunmuyor')
  })

  it('114. watch level includes warning count', () => {
    const result = generateAlertSummaryNarrative(0, 3, 'watch')
    expect(result).toContain('3')
    expect(result).toContain('uyarı')
  })

  it('115. watch level mentions "yakın takip"', () => {
    const result = generateAlertSummaryNarrative(0, 2, 'watch')
    expect(result).toContain('yakın takip')
  })

  it('116. concern level includes both critical and warning counts', () => {
    const result = generateAlertSummaryNarrative(2, 3, 'concern')
    expect(result).toContain('2')
    expect(result).toContain('3')
  })

  it('117. concern level mentions "aksiyona geçilmeli"', () => {
    const result = generateAlertSummaryNarrative(1, 2, 'concern')
    expect(result).toContain('aksiyona geçilmeli')
  })

  it('118. critical level starts with "KRİTİK"', () => {
    const result = generateAlertSummaryNarrative(3, 0, 'critical')
    expect(result).toContain('KRİTİK')
  })

  it('119. critical level mentions "acil müdahale"', () => {
    const result = generateAlertSummaryNarrative(2, 1, 'critical')
    expect(result).toContain('acil müdahale')
  })

  it('120. critical level includes critical count', () => {
    const result = generateAlertSummaryNarrative(4, 2, 'critical')
    expect(result).toContain('4')
  })

  it('121. returns a non-empty string for all health levels', () => {
    for (const level of ['healthy', 'watch', 'concern', 'critical'] as const) {
      const result = generateAlertSummaryNarrative(1, 1, level)
      expect(typeof result).toBe('string')
      expect(result.length).toBeGreaterThan(0)
    }
  })

})
