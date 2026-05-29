/**
 * Alert Rules Engine — unit tests
 *
 * Tests all pure computation functions in alert-rules.service.ts.
 * No DB or network calls — pure function tests only.
 *
 * 42 tests total.
 */

import { describe, it, expect } from 'vitest'
import {
  ALERT_RULES,
  createAlert,
  prioritizeAlerts,
  deduplicateAlerts,
  computeAlertSummary,
  filterAlertsByCategory,
  isAlertActive,
  computeAlertHealthScore,
} from '../lib/services/intelligence/alert-rules.service'
import type { Alert, AlertCategory } from '../lib/services/intelligence/alert-rules.service'

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeAlert(overrides: Partial<Alert>): Alert {
  return {
    id:           overrides.id           ?? 'test_id',
    severity:     overrides.severity     ?? 'info',
    category:     overrides.category     ?? 'performance',
    title:        overrides.title        ?? 'Test',
    detail:       overrides.detail       ?? 'Test detail',
    action_label: overrides.action_label ?? 'İncele',
    action_href:  overrides.action_href  ?? '/dashboard',
    triggered_at: overrides.triggered_at ?? '2026-05-29',
    ...overrides,
  }
}

// ── ALERT_RULES catalogue ──────────────────────────────────────────────────────

describe('ALERT_RULES catalogue', () => {

  // Test 1: has expected number of rules
  it('1. ALERT_RULES has 13 rules', () => {
    expect(ALERT_RULES).toHaveLength(13)
  })

  // Test 2: all rules have required fields
  it('2. all rules have id, category, description, severity, default_threshold', () => {
    for (const rule of ALERT_RULES) {
      expect(rule.id).toBeTruthy()
      expect(rule.category).toBeTruthy()
      expect(rule.description).toBeTruthy()
      expect(rule.severity).toMatch(/^(info|warning|critical)$/)
      expect(typeof rule.default_threshold).toBe('number')
    }
  })

  // Test 3: cash_runway_30 is blocking and critical
  it('3. cash_runway_30 is critical and blocking', () => {
    const rule = ALERT_RULES.find(r => r.id === 'cash_runway_30')!
    expect(rule.severity).toBe('critical')
    expect(rule.is_blocking).toBe(true)
  })

  // Test 4: dscr_below_1 is critical and not blocking
  it('4. dscr_below_1 is critical but not blocking', () => {
    const rule = ALERT_RULES.find(r => r.id === 'dscr_below_1')!
    expect(rule.severity).toBe('critical')
    expect(rule.is_blocking).toBe(false)
  })

})

// ── createAlert ────────────────────────────────────────────────────────────────

describe('createAlert', () => {

  // Test 5: known rule creates correct severity and category
  it('5. known rule creates correct severity (critical)', () => {
    const alert = createAlert('cash_runway_30', 'Kritik Nakit', 'Nakit 20 gün kaldı')
    expect(alert.severity).toBe('critical')
    expect(alert.category).toBe('cash')
  })

  // Test 6: known rule creates warning severity
  it('6. known rule cash_runway_90 creates warning', () => {
    const alert = createAlert('cash_runway_90', 'Uyarı', 'Nakit 60 gün')
    expect(alert.severity).toBe('warning')
  })

  // Test 7: known rule gets correct category (receivables)
  it('7. overdue_60 maps to receivables category', () => {
    const alert = createAlert('overdue_60', 'Gecikmiş', 'Detay')
    expect(alert.category).toBe('receivables')
  })

  // Test 8: unknown rule → severity info
  it('8. unknown rule → severity info', () => {
    const alert = createAlert('nonexistent_rule', 'Title', 'Detail')
    expect(alert.severity).toBe('info')
  })

  // Test 9: unknown rule → category performance
  it('9. unknown rule → category performance', () => {
    const alert = createAlert('nonexistent_rule', 'Title', 'Detail')
    expect(alert.category).toBe('performance')
  })

  // Test 10: default action_label is İncele
  it('10. default action_label is "İncele"', () => {
    const alert = createAlert('cash_runway_30', 'T', 'D')
    expect(alert.action_label).toBe('İncele')
  })

  // Test 11: default action_href is /dashboard
  it('11. default action_href is "/dashboard"', () => {
    const alert = createAlert('cash_runway_30', 'T', 'D')
    expect(alert.action_href).toBe('/dashboard')
  })

  // Test 12: overrides are applied
  it('12. overrides replace defaults', () => {
    const alert = createAlert('cash_runway_30', 'T', 'D', {
      action_label: 'Gör',
      action_href:  '/finance',
      days:         25,
    })
    expect(alert.action_label).toBe('Gör')
    expect(alert.action_href).toBe('/finance')
    expect(alert.days).toBe(25)
  })

  // Test 13: triggered_at is today's date (YYYY-MM-DD)
  it('13. triggered_at is a valid date string', () => {
    const alert = createAlert('cash_runway_30', 'T', 'D')
    expect(alert.triggered_at).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  // Test 14: id is composed of category and ruleId
  it('14. id = category_ruleId', () => {
    const alert = createAlert('cash_runway_30', 'T', 'D')
    expect(alert.id).toBe('cash_cash_runway_30')
  })

  // Test 15: title and detail are passed through
  it('15. title and detail are passed through', () => {
    const alert = createAlert('cash_runway_30', 'My Title', 'My Detail')
    expect(alert.title).toBe('My Title')
    expect(alert.detail).toBe('My Detail')
  })

})

// ── prioritizeAlerts ───────────────────────────────────────────────────────────

describe('prioritizeAlerts', () => {

  // Test 16: critical before warning before info
  it('16. critical before warning before info', () => {
    const alerts = [
      makeAlert({ id: 'a1', severity: 'info',     category: 'performance' }),
      makeAlert({ id: 'a2', severity: 'warning',  category: 'revenue' }),
      makeAlert({ id: 'a3', severity: 'critical', category: 'cash' }),
    ]
    const sorted = prioritizeAlerts(alerts)
    expect(sorted[0].severity).toBe('critical')
    expect(sorted[1].severity).toBe('warning')
    expect(sorted[2].severity).toBe('info')
  })

  // Test 17: within same severity, cash before receivables
  it('17. within critical: cash before receivables', () => {
    const alerts = [
      makeAlert({ id: 'r1', severity: 'critical', category: 'receivables' }),
      makeAlert({ id: 'c1', severity: 'critical', category: 'cash' }),
    ]
    const sorted = prioritizeAlerts(alerts)
    expect(sorted[0].category).toBe('cash')
    expect(sorted[1].category).toBe('receivables')
  })

  // Test 18: receivables before compliance
  it('18. within warning: receivables before compliance', () => {
    const alerts = [
      makeAlert({ id: 'w2', severity: 'warning', category: 'compliance' }),
      makeAlert({ id: 'w1', severity: 'warning', category: 'receivables' }),
    ]
    const sorted = prioritizeAlerts(alerts)
    expect(sorted[0].category).toBe('receivables')
  })

  // Test 19: compliance before partners
  it('19. within warning: compliance before partners', () => {
    const alerts = [
      makeAlert({ id: 'p1', severity: 'warning', category: 'partners' }),
      makeAlert({ id: 'c1', severity: 'warning', category: 'compliance' }),
    ]
    const sorted = prioritizeAlerts(alerts)
    expect(sorted[0].category).toBe('compliance')
  })

  // Test 20: expenses before performance
  it('20. within info: expenses before performance', () => {
    const alerts = [
      makeAlert({ id: 'perf', severity: 'info', category: 'performance' }),
      makeAlert({ id: 'exp',  severity: 'info', category: 'expenses' }),
    ]
    const sorted = prioritizeAlerts(alerts)
    expect(sorted[0].category).toBe('expenses')
  })

  // Test 21: empty array returns empty
  it('21. empty array returns empty', () => {
    expect(prioritizeAlerts([])).toEqual([])
  })

  // Test 22: single item returns same item
  it('22. single item returns same item', () => {
    const a = makeAlert({ id: 'x' })
    const sorted = prioritizeAlerts([a])
    expect(sorted).toHaveLength(1)
    expect(sorted[0].id).toBe('x')
  })

  // Test 23: does not mutate original array
  it('23. does not mutate original array', () => {
    const original = [
      makeAlert({ id: 'z', severity: 'info' }),
      makeAlert({ id: 'a', severity: 'critical' }),
    ]
    const copy = [...original]
    prioritizeAlerts(original)
    expect(original[0].id).toBe(copy[0].id)
  })

})

// ── deduplicateAlerts ──────────────────────────────────────────────────────────

describe('deduplicateAlerts', () => {

  // Test 24: removes duplicate id, keeps first
  it('24. removes duplicate id, keeps first occurrence', () => {
    const alerts = [
      makeAlert({ id: 'dup', title: 'First' }),
      makeAlert({ id: 'dup', title: 'Second' }),
    ]
    const deduped = deduplicateAlerts(alerts)
    expect(deduped).toHaveLength(1)
    expect(deduped[0].title).toBe('First')
  })

  // Test 25: all unique IDs preserved
  it('25. all unique IDs preserved', () => {
    const alerts = [
      makeAlert({ id: 'a1' }),
      makeAlert({ id: 'a2' }),
      makeAlert({ id: 'a3' }),
    ]
    expect(deduplicateAlerts(alerts)).toHaveLength(3)
  })

  // Test 26: empty array returns empty
  it('26. empty array returns empty', () => {
    expect(deduplicateAlerts([])).toEqual([])
  })

  // Test 27: three duplicates → only first kept
  it('27. three duplicates → only first kept', () => {
    const alerts = [
      makeAlert({ id: 'x', title: 'A' }),
      makeAlert({ id: 'x', title: 'B' }),
      makeAlert({ id: 'x', title: 'C' }),
    ]
    const deduped = deduplicateAlerts(alerts)
    expect(deduped).toHaveLength(1)
    expect(deduped[0].title).toBe('A')
  })

})

// ── computeAlertSummary ────────────────────────────────────────────────────────

describe('computeAlertSummary', () => {

  // Test 28: empty alerts → all zeros
  it('28. empty alerts → all zeros', () => {
    const s = computeAlertSummary([])
    expect(s.total).toBe(0)
    expect(s.critical).toBe(0)
    expect(s.warning).toBe(0)
    expect(s.info).toBe(0)
  })

  // Test 29: correct count by severity
  it('29. correct count by severity', () => {
    const alerts = [
      makeAlert({ severity: 'critical' }),
      makeAlert({ id: 'b', severity: 'critical' }),
      makeAlert({ id: 'c', severity: 'warning' }),
      makeAlert({ id: 'd', severity: 'info' }),
    ]
    const s = computeAlertSummary(alerts)
    expect(s.critical).toBe(2)
    expect(s.warning).toBe(1)
    expect(s.info).toBe(1)
    expect(s.total).toBe(4)
  })

  // Test 30: by_category correctly counts per category
  it('30. by_category correctly counts per category', () => {
    const alerts = [
      makeAlert({ id: 'c1', category: 'cash' }),
      makeAlert({ id: 'c2', category: 'cash' }),
      makeAlert({ id: 'r1', category: 'receivables' }),
    ]
    const s = computeAlertSummary(alerts)
    expect(s.by_category.cash).toBe(2)
    expect(s.by_category.receivables).toBe(1)
    expect(s.by_category.inventory).toBe(0)
  })

  // Test 31: by_category includes all 8 categories
  it('31. by_category has all 8 categories', () => {
    const s = computeAlertSummary([])
    const categories: AlertCategory[] = [
      'cash', 'receivables', 'inventory', 'partners',
      'compliance', 'revenue', 'expenses', 'performance',
    ]
    for (const cat of categories) {
      expect(cat in s.by_category).toBe(true)
    }
  })

})

// ── filterAlertsByCategory ─────────────────────────────────────────────────────

describe('filterAlertsByCategory', () => {

  const alerts = [
    makeAlert({ id: 'c1', category: 'cash' }),
    makeAlert({ id: 'r1', category: 'receivables' }),
    makeAlert({ id: 'p1', category: 'partners' }),
    makeAlert({ id: 'e1', category: 'expenses' }),
  ]

  // Test 32: filter to single category
  it('32. filter to single category returns only that category', () => {
    const result = filterAlertsByCategory(alerts, ['cash'])
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('c1')
  })

  // Test 33: filter to multiple categories
  it('33. filter to multiple categories returns all matching', () => {
    const result = filterAlertsByCategory(alerts, ['cash', 'partners'])
    expect(result).toHaveLength(2)
    const ids = result.map(a => a.id)
    expect(ids).toContain('c1')
    expect(ids).toContain('p1')
  })

  // Test 34: filter to unmatched category returns empty
  it('34. filter to unmatched category returns empty', () => {
    const result = filterAlertsByCategory(alerts, ['inventory'])
    expect(result).toHaveLength(0)
  })

  // Test 35: empty alerts returns empty
  it('35. empty alerts returns empty regardless of filter', () => {
    expect(filterAlertsByCategory([], ['cash'])).toEqual([])
  })

})

// ── isAlertActive ─────────────────────────────────────────────────────────────

describe('isAlertActive', () => {

  // Test 36: alert in acknowledged set → false
  it('36. alert in acknowledgedIds → false', () => {
    const alert = makeAlert({ id: 'x' })
    const acked = new Set(['x', 'y'])
    expect(isAlertActive(alert, acked)).toBe(false)
  })

  // Test 37: alert not in acknowledged set → true
  it('37. alert not in acknowledgedIds → true', () => {
    const alert = makeAlert({ id: 'z' })
    const acked = new Set(['x', 'y'])
    expect(isAlertActive(alert, acked)).toBe(true)
  })

  // Test 38: empty acknowledged set → all active
  it('38. empty acknowledged set → alert is active', () => {
    const alert = makeAlert({ id: 'a' })
    expect(isAlertActive(alert, new Set())).toBe(true)
  })

})

// ── computeAlertHealthScore ────────────────────────────────────────────────────

describe('computeAlertHealthScore', () => {

  // Test 39: no alerts → 100
  it('39. no alerts → 100', () => {
    expect(computeAlertHealthScore([])).toBe(100)
  })

  // Test 40: one critical → 85
  it('40. one critical alert → 85', () => {
    const alerts = [makeAlert({ severity: 'critical' })]
    expect(computeAlertHealthScore(alerts)).toBe(85)
  })

  // Test 41: one warning → 95
  it('41. one warning alert → 95', () => {
    const alerts = [makeAlert({ severity: 'warning' })]
    expect(computeAlertHealthScore(alerts)).toBe(95)
  })

  // Test 42: one info → 99
  it('42. one info alert → 99', () => {
    const alerts = [makeAlert({ severity: 'info' })]
    expect(computeAlertHealthScore(alerts)).toBe(99)
  })

  // Test 43: multiple criticals clamp at 0
  it('43. 7+ criticals clamp at 0', () => {
    const alerts = Array.from({ length: 10 }, (_, i) =>
      makeAlert({ id: `c${i}`, severity: 'critical' }),
    )
    expect(computeAlertHealthScore(alerts)).toBe(0)
  })

  // Test 44: mixed alerts calculate correctly
  it('44. 2 critical + 1 warning = 100 - 30 - 5 = 65', () => {
    const alerts = [
      makeAlert({ id: 'c1', severity: 'critical' }),
      makeAlert({ id: 'c2', severity: 'critical' }),
      makeAlert({ id: 'w1', severity: 'warning' }),
    ]
    expect(computeAlertHealthScore(alerts)).toBe(65)
  })

  // Test 45: score does not exceed 100
  it('45. score never exceeds 100', () => {
    expect(computeAlertHealthScore([])).toBeLessThanOrEqual(100)
  })

  // Test 46: score does not go below 0
  it('46. score never goes below 0', () => {
    const manyAlerts = Array.from({ length: 20 }, (_, i) =>
      makeAlert({ id: `x${i}`, severity: 'critical' }),
    )
    expect(computeAlertHealthScore(manyAlerts)).toBeGreaterThanOrEqual(0)
  })

})
