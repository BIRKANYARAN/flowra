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

// ── ALERT_RULES — structural integrity ────────────────────────────────────────

describe('ALERT_RULES — structural integrity', () => {
  it('all rule ids are unique', () => {
    const ids = ALERT_RULES.map(r => r.id)
    const unique = new Set(ids)
    expect(unique.size).toBe(ids.length)
  })

  it('every rule has a valid severity (info | warning | critical)', () => {
    const valid = new Set(['info', 'warning', 'critical'])
    for (const rule of ALERT_RULES) {
      expect(valid.has(rule.severity)).toBe(true)
    }
  })

  it('every rule has a valid category', () => {
    const valid = new Set(['cash', 'receivables', 'inventory', 'partners', 'compliance', 'revenue', 'expenses', 'performance'])
    for (const rule of ALERT_RULES) {
      expect(valid.has(rule.category)).toBe(true)
    }
  })

  it('is_blocking is boolean for every rule', () => {
    for (const rule of ALERT_RULES) {
      expect(typeof rule.is_blocking).toBe('boolean')
    }
  })

  it('default_threshold is a finite number for every rule', () => {
    for (const rule of ALERT_RULES) {
      expect(Number.isFinite(rule.default_threshold)).toBe(true)
    }
  })

  it('cash_runway_90 has category cash and severity warning', () => {
    const rule = ALERT_RULES.find(r => r.id === 'cash_runway_90')!
    expect(rule.category).toBe('cash')
    expect(rule.severity).toBe('warning')
  })

  it('overdue_60 has category receivables and severity critical', () => {
    const rule = ALERT_RULES.find(r => r.id === 'overdue_60')!
    expect(rule.category).toBe('receivables')
    expect(rule.severity).toBe('critical')
  })

  it('kdv_due_soon has category compliance', () => {
    const rule = ALERT_RULES.find(r => r.id === 'kdv_due_soon')!
    expect(rule.category).toBe('compliance')
  })

  it('partner_loan_due has default_threshold of 14', () => {
    const rule = ALERT_RULES.find(r => r.id === 'partner_loan_due')!
    expect(rule.default_threshold).toBe(14)
  })
})

// ── createAlert — full field validation ───────────────────────────────────────

describe('createAlert — full field validation', () => {
  it('inventory rule: stock_critical has critical severity', () => {
    const alert = createAlert('stock_critical', 'Stok', 'Detay')
    expect(alert.severity).toBe('critical')
    expect(alert.category).toBe('inventory')
  })

  it('compliance rule: kdv_due_soon has warning severity', () => {
    const alert = createAlert('kdv_due_soon', 'KDV', 'Beyanname yaklaşıyor')
    expect(alert.severity).toBe('warning')
    expect(alert.category).toBe('compliance')
  })

  it('partners rule: partner_loan_due has critical severity', () => {
    const alert = createAlert('partner_loan_due', 'Vade', 'Yaklaşıyor')
    expect(alert.severity).toBe('critical')
    expect(alert.category).toBe('partners')
  })

  it('alert id format is {category}_{ruleId}', () => {
    const alert = createAlert('overdue_60', 'T', 'D')
    expect(alert.id).toBe('receivables_overdue_60')
  })

  it('amount override is preserved in alert', () => {
    const alert = createAlert('overdue_60', 'T', 'D', { amount: 50_000 })
    expect(alert.amount).toBe(50_000)
  })

  it('days override is preserved in alert', () => {
    const alert = createAlert('cash_runway_30', 'T', 'D', { days: 20 })
    expect(alert.days).toBe(20)
  })

  it('returns well-formed Alert object with all required fields', () => {
    const alert = createAlert('equity_gap', 'Sermaye', 'Boşluk var')
    expect(alert.id).toBeTruthy()
    expect(alert.severity).toBeTruthy()
    expect(alert.category).toBeTruthy()
    expect(alert.title).toBe('Sermaye')
    expect(alert.detail).toBe('Boşluk var')
    expect(alert.action_label).toBeTruthy()
    expect(alert.action_href).toBeTruthy()
    expect(alert.triggered_at).toBeTruthy()
  })
})

// ── prioritizeAlerts — complete ordering ─────────────────────────────────────

describe('prioritizeAlerts — complete ordering', () => {
  it('partners before inventory within same severity', () => {
    const alerts = [
      makeAlert({ id: 'inv', severity: 'warning', category: 'inventory' }),
      makeAlert({ id: 'par', severity: 'warning', category: 'partners' }),
    ]
    const sorted = prioritizeAlerts(alerts)
    expect(sorted[0].category).toBe('partners')
    expect(sorted[1].category).toBe('inventory')
  })

  it('revenue before expenses within same severity', () => {
    const alerts = [
      makeAlert({ id: 'exp', severity: 'info', category: 'expenses' }),
      makeAlert({ id: 'rev', severity: 'info', category: 'revenue' }),
    ]
    const sorted = prioritizeAlerts(alerts)
    expect(sorted[0].category).toBe('revenue')
  })

  it('critical cash beats critical expenses', () => {
    const alerts = [
      makeAlert({ id: 'e', severity: 'critical', category: 'expenses' }),
      makeAlert({ id: 'c', severity: 'critical', category: 'cash' }),
    ]
    const sorted = prioritizeAlerts(alerts)
    expect(sorted[0].category).toBe('cash')
  })

  it('preserves all alerts (no items dropped)', () => {
    const alerts = Array.from({ length: 5 }, (_, i) =>
      makeAlert({ id: `a${i}`, severity: 'warning' }),
    )
    expect(prioritizeAlerts(alerts)).toHaveLength(5)
  })

  it('mixed severities: all criticals before all warnings', () => {
    const alerts = [
      makeAlert({ id: 'w1', severity: 'warning',  category: 'cash' }),
      makeAlert({ id: 'c1', severity: 'critical', category: 'expenses' }),
      makeAlert({ id: 'w2', severity: 'warning',  category: 'inventory' }),
      makeAlert({ id: 'c2', severity: 'critical', category: 'performance' }),
    ]
    const sorted = prioritizeAlerts(alerts)
    const criticals = sorted.filter(a => a.severity === 'critical')
    const warnings  = sorted.filter(a => a.severity === 'warning')
    expect(sorted.indexOf(criticals[0])).toBeLessThan(sorted.indexOf(warnings[0]))
  })
})

// ── computeAlertSummary — edge cases ─────────────────────────────────────────

describe('computeAlertSummary — edge cases', () => {
  it('all info alerts: critical and warning are 0', () => {
    const alerts = [
      makeAlert({ id: 'a', severity: 'info' }),
      makeAlert({ id: 'b', severity: 'info' }),
    ]
    const s = computeAlertSummary(alerts)
    expect(s.critical).toBe(0)
    expect(s.warning).toBe(0)
    expect(s.info).toBe(2)
  })

  it('total equals critical + warning + info', () => {
    const alerts = [
      makeAlert({ id: 'c', severity: 'critical' }),
      makeAlert({ id: 'w', severity: 'warning' }),
      makeAlert({ id: 'i', severity: 'info' }),
    ]
    const s = computeAlertSummary(alerts)
    expect(s.total).toBe(s.critical + s.warning + s.info)
  })

  it('by_category.performance is non-negative and counts performance alerts', () => {
    const alerts = [makeAlert({ id: 'p', category: 'performance' })]
    const s = computeAlertSummary(alerts)
    expect(s.by_category.performance).toBe(1)
  })

  it('single critical alert: total=1, critical=1', () => {
    const s = computeAlertSummary([makeAlert({ severity: 'critical' })])
    expect(s.total).toBe(1)
    expect(s.critical).toBe(1)
    expect(s.warning).toBe(0)
    expect(s.info).toBe(0)
  })
})

// ── computeAlertHealthScore — deduction mechanics ─────────────────────────────

describe('computeAlertHealthScore — deduction mechanics', () => {
  it('5 warnings: 100 - 25 = 75', () => {
    const alerts = Array.from({ length: 5 }, (_, i) =>
      makeAlert({ id: `w${i}`, severity: 'warning' }),
    )
    expect(computeAlertHealthScore(alerts)).toBe(75)
  })

  it('10 info alerts: 100 - 10 = 90', () => {
    const alerts = Array.from({ length: 10 }, (_, i) =>
      makeAlert({ id: `i${i}`, severity: 'info' }),
    )
    expect(computeAlertHealthScore(alerts)).toBe(90)
  })

  it('3 critical + 2 warning: 100 - 45 - 10 = 45', () => {
    const alerts = [
      makeAlert({ id: 'c1', severity: 'critical' }),
      makeAlert({ id: 'c2', severity: 'critical' }),
      makeAlert({ id: 'c3', severity: 'critical' }),
      makeAlert({ id: 'w1', severity: 'warning' }),
      makeAlert({ id: 'w2', severity: 'warning' }),
    ]
    expect(computeAlertHealthScore(alerts)).toBe(45)
  })

  it('exactly 7 criticals clamped to 0 (7×15=105)', () => {
    const alerts = Array.from({ length: 7 }, (_, i) =>
      makeAlert({ id: `c${i}`, severity: 'critical' }),
    )
    expect(computeAlertHealthScore(alerts)).toBe(0)
  })

  it('1 critical + 1 warning + 1 info = 100 - 15 - 5 - 1 = 79', () => {
    const alerts = [
      makeAlert({ id: 'c', severity: 'critical' }),
      makeAlert({ id: 'w', severity: 'warning' }),
      makeAlert({ id: 'i', severity: 'info' }),
    ]
    expect(computeAlertHealthScore(alerts)).toBe(79)
  })
})
