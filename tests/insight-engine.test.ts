/**
 * Insight Engine — unit tests
 *
 * 15+ deterministic rule-based tests for Turkish BI narrative generation.
 * No DB or network calls — all pure function tests.
 */

import { describe, it, expect } from 'vitest'
import {
  generateRevenueInsights,
  generateExpenseInsights,
  generateCashInsights,
  generateReceivablesInsights,
  sortInsightsBySeverity,
} from '../lib/services/intelligence/insight-engine.service'
import type { BusinessInsight } from '../lib/services/intelligence/insight-engine.service'

// ── Helpers ────────────────────────────────────────────────────────────────────

function hasSeverity(insights: BusinessInsight[], severity: BusinessInsight['severity']): boolean {
  return insights.some(i => i.severity === severity)
}

function hasId(insights: BusinessInsight[], id: string): boolean {
  return insights.some(i => i.id === id)
}

// ── generateRevenueInsights ───────────────────────────────────────────────────

describe('generateRevenueInsights', () => {

  // Test 1: positive trend when slope > 0 AND R² > 0.6
  it('1. positive trend slope + R² > 0.6 → positive insight', () => {
    const result = generateRevenueInsights({
      trend_slope: 10_000,
      trend_r_squared: 0.8,
      current_month_revenue: 150_000,
      prior_month_revenue: 130_000,
      yoy_change_pct: null,
    })
    expect(hasSeverity(result, 'positive')).toBe(true)
    expect(hasId(result, 'revenue_positive_trend')).toBe(true)
  })

  // Test 2: no positive trend when R² <= 0.6 (insufficient quality)
  it('2. slope > 0 but R² = 0.5 → no positive trend insight', () => {
    const result = generateRevenueInsights({
      trend_slope: 10_000,
      trend_r_squared: 0.5,
      current_month_revenue: 150_000,
      prior_month_revenue: 130_000,
      yoy_change_pct: null,
    })
    expect(hasId(result, 'revenue_positive_trend')).toBe(false)
  })

  // Test 3: no positive trend when slope is null
  it('3. trend_slope null → no positive trend insight', () => {
    const result = generateRevenueInsights({
      trend_slope: null,
      trend_r_squared: 0.9,
      current_month_revenue: 150_000,
      prior_month_revenue: 130_000,
      yoy_change_pct: null,
    })
    expect(hasId(result, 'revenue_positive_trend')).toBe(false)
  })

  // Test 4: MoM spike > 20% → positive insight
  it('4. MoM growth > 20% → positive mom_spike insight', () => {
    const result = generateRevenueInsights({
      trend_slope: null,
      trend_r_squared: null,
      current_month_revenue: 200_000,
      prior_month_revenue: 100_000,   // +100%
      yoy_change_pct: null,
    })
    expect(hasId(result, 'revenue_mom_spike')).toBe(true)
    expect(hasSeverity(result, 'positive')).toBe(true)
  })

  // Test 5: MoM growth <= 20% → no spike
  it('5. MoM growth exactly 20% → no mom_spike insight', () => {
    const result = generateRevenueInsights({
      trend_slope: null,
      trend_r_squared: null,
      current_month_revenue: 120_000,
      prior_month_revenue: 100_000,   // exactly 20%
      yoy_change_pct: null,
    })
    expect(hasId(result, 'revenue_mom_spike')).toBe(false)
  })

  // Test 6: YoY decline < -10% → warning insight
  it('6. yoy_change_pct = -15 → warning declining_yoy insight', () => {
    const result = generateRevenueInsights({
      trend_slope: null,
      trend_r_squared: null,
      current_month_revenue: 100_000,
      prior_month_revenue: 100_000,
      yoy_change_pct: -15,
    })
    expect(hasId(result, 'revenue_declining_yoy')).toBe(true)
    expect(hasSeverity(result, 'warning')).toBe(true)
  })

  // Test 7: YoY within threshold → no insight
  it('7. yoy_change_pct = -5 → no declining yoy insight (< 10% threshold)', () => {
    const result = generateRevenueInsights({
      trend_slope: null,
      trend_r_squared: null,
      current_month_revenue: 100_000,
      prior_month_revenue: 100_000,
      yoy_change_pct: -5,
    })
    expect(hasId(result, 'revenue_declining_yoy')).toBe(false)
  })

})

// ── generateExpenseInsights ───────────────────────────────────────────────────

describe('generateExpenseInsights', () => {

  // Test 8: expense ratio > 80% → warning/critical insight
  it('8. expense_ratio_pct = 85 → warning high_ratio insight', () => {
    const result = generateExpenseInsights({
      expense_ratio_pct: 85,
      anomaly_count: 0,
      anomaly_total_try: 0,
      top_category: null,
      top_category_pct: null,
    })
    expect(hasId(result, 'expenses_high_ratio')).toBe(true)
    expect(['warning', 'critical']).toContain(result.find(i => i.id === 'expenses_high_ratio')?.severity)
  })

  // Test 9: expense ratio > 95% → critical
  it('9. expense_ratio_pct = 98 → critical high_ratio insight', () => {
    const result = generateExpenseInsights({
      expense_ratio_pct: 98,
      anomaly_count: 0,
      anomaly_total_try: 0,
      top_category: null,
      top_category_pct: null,
    })
    const insight = result.find(i => i.id === 'expenses_high_ratio')
    expect(insight?.severity).toBe('critical')
  })

  // Test 10: anomaly_count > 0 → anomaly insight
  it('10. anomaly_count = 3 → anomaly_detected insight', () => {
    const result = generateExpenseInsights({
      expense_ratio_pct: null,
      anomaly_count: 3,
      anomaly_total_try: 25_000,
      top_category: null,
      top_category_pct: null,
    })
    expect(hasId(result, 'expenses_anomaly_detected')).toBe(true)
    expect(result.find(i => i.id === 'expenses_anomaly_detected')?.metric_value).toBe(3)
  })

  // Test 11: anomaly_count = 0 → no anomaly insight
  it('11. anomaly_count = 0 → no anomaly insight', () => {
    const result = generateExpenseInsights({
      expense_ratio_pct: null,
      anomaly_count: 0,
      anomaly_total_try: 0,
      top_category: null,
      top_category_pct: null,
    })
    expect(hasId(result, 'expenses_anomaly_detected')).toBe(false)
  })

  // Test 12: top category > 40% → info insight
  it('12. top_category_pct = 55 → category_concentration insight', () => {
    const result = generateExpenseInsights({
      expense_ratio_pct: null,
      anomaly_count: 0,
      anomaly_total_try: 0,
      top_category: 'Personel',
      top_category_pct: 55,
    })
    expect(hasId(result, 'expenses_category_concentration')).toBe(true)
  })

  // Test 13: top category exactly 40% → no insight (threshold exclusive)
  it('13. top_category_pct = 40 → no concentration insight', () => {
    const result = generateExpenseInsights({
      expense_ratio_pct: null,
      anomaly_count: 0,
      anomaly_total_try: 0,
      top_category: 'Personel',
      top_category_pct: 40,
    })
    expect(hasId(result, 'expenses_category_concentration')).toBe(false)
  })

})

// ── generateCashInsights ──────────────────────────────────────────────────────

describe('generateCashInsights', () => {

  // Test 14: runway < 3 months → critical
  it('14. runway_months = 2 → critical low_runway insight', () => {
    const result = generateCashInsights({ runway_months: 2, cash_trend: null })
    expect(hasId(result, 'cash_low_runway')).toBe(true)
    expect(result.find(i => i.id === 'cash_low_runway')?.severity).toBe('critical')
  })

  // Test 15: runway 3-6 months → warning
  it('15. runway_months = 5 → warning moderate_runway insight', () => {
    const result = generateCashInsights({ runway_months: 5, cash_trend: null })
    expect(hasId(result, 'cash_moderate_runway')).toBe(true)
    expect(result.find(i => i.id === 'cash_moderate_runway')?.severity).toBe('warning')
  })

  // Test 16: runway > 12 months → positive
  it('16. runway_months = 15 → positive healthy_runway insight', () => {
    const result = generateCashInsights({ runway_months: 15, cash_trend: null })
    expect(hasId(result, 'cash_healthy_runway')).toBe(true)
    expect(result.find(i => i.id === 'cash_healthy_runway')?.severity).toBe('positive')
  })

  // Test 17: runway null → no insights
  it('17. runway_months = null → returns empty array', () => {
    const result = generateCashInsights({ runway_months: null, cash_trend: null })
    expect(result).toHaveLength(0)
  })

  // Test 18: accelerating burn trend → warning
  it('18. cash_trend = accelerating → burn warning insight', () => {
    const result = generateCashInsights({ runway_months: 8, cash_trend: 'accelerating' })
    expect(hasId(result, 'cash_accelerating_burn')).toBe(true)
    expect(result.find(i => i.id === 'cash_accelerating_burn')?.severity).toBe('warning')
  })

})

// ── generateReceivablesInsights ───────────────────────────────────────────────

describe('generateReceivablesInsights', () => {

  // Test 19: overdue > 30% AND dso > 45 → 2 warning insights
  it('19. overdue_pct = 35 + dso_days = 50 → two warning insights', () => {
    const result = generateReceivablesInsights({ overdue_pct: 35, dso_days: 50 })
    expect(result.length).toBeGreaterThanOrEqual(2)
    expect(hasSeverity(result, 'warning')).toBe(true)
    expect(hasId(result, 'receivables_high_overdue')).toBe(true)
    expect(hasId(result, 'receivables_high_dso')).toBe(true)
  })

  // Test 20: healthy receivables → no insights
  it('20. overdue_pct = 10 + dso_days = 20 → no insights (healthy)', () => {
    const result = generateReceivablesInsights({ overdue_pct: 10, dso_days: 20 })
    expect(result).toHaveLength(0)
  })

  // Test 21: overdue exactly 30% → no overdue insight (threshold exclusive)
  it('21. overdue_pct = 30 → no overdue insight', () => {
    const result = generateReceivablesInsights({ overdue_pct: 30, dso_days: 20 })
    expect(hasId(result, 'receivables_high_overdue')).toBe(false)
  })

  // Test 22: null params → no insights
  it('22. both null → no insights', () => {
    const result = generateReceivablesInsights({ overdue_pct: null, dso_days: null })
    expect(result).toHaveLength(0)
  })

})

// ── sortInsightsBySeverity ────────────────────────────────────────────────────

describe('sortInsightsBySeverity', () => {

  // Test 23: critical before warning before positive before info
  it('23. sorts: critical → warning → positive → info', () => {
    const unsorted: BusinessInsight[] = [
      { id: 'a_info',     category: 'general',  severity: 'info',     title: 'Info',     narrative: 'x' },
      { id: 'b_positive', category: 'revenue',  severity: 'positive', title: 'Positive', narrative: 'x' },
      { id: 'c_critical', category: 'cash',     severity: 'critical', title: 'Critical', narrative: 'x' },
      { id: 'd_warning',  category: 'expenses', severity: 'warning',  title: 'Warning',  narrative: 'x' },
    ]
    const sorted = sortInsightsBySeverity(unsorted)
    expect(sorted[0].severity).toBe('critical')
    expect(sorted[1].severity).toBe('warning')
    expect(sorted[2].severity).toBe('positive')
    expect(sorted[3].severity).toBe('info')
  })

  // Test 24: same severity → stable alphabetical by id
  it('24. same severity → stable order by id', () => {
    const sameLevel: BusinessInsight[] = [
      { id: 'z_warn', category: 'general', severity: 'warning', title: 'Z', narrative: 'x' },
      { id: 'a_warn', category: 'general', severity: 'warning', title: 'A', narrative: 'x' },
    ]
    const sorted = sortInsightsBySeverity(sameLevel)
    expect(sorted[0].id).toBe('a_warn')
    expect(sorted[1].id).toBe('z_warn')
  })

  // Test 25: empty array → empty result
  it('25. empty input → empty output', () => {
    expect(sortInsightsBySeverity([])).toHaveLength(0)
  })

})

// ── Each insight has required fields ──────────────────────────────────────────

describe('insight field integrity', () => {

  it('26. all revenue insights have non-empty id, title, narrative', () => {
    const result = generateRevenueInsights({
      trend_slope: 5_000,
      trend_r_squared: 0.75,
      current_month_revenue: 200_000,
      prior_month_revenue: 100_000,
      yoy_change_pct: -12,
    })
    for (const insight of result) {
      expect(insight.id.length).toBeGreaterThan(0)
      expect(insight.title.length).toBeGreaterThan(0)
      expect(insight.narrative.length).toBeGreaterThan(0)
      expect(insight.category).toBe('revenue')
    }
  })

  it('27. all cash insights have non-empty id, title, narrative', () => {
    const result = generateCashInsights({ runway_months: 1.5, cash_trend: 'accelerating' })
    for (const insight of result) {
      expect(insight.id.length).toBeGreaterThan(0)
      expect(insight.title.length).toBeGreaterThan(0)
      expect(insight.narrative.length).toBeGreaterThan(0)
      expect(insight.category).toBe('cash')
    }
  })

  it('28. all expense insights have non-empty id, title, narrative', () => {
    const result = generateExpenseInsights({
      expense_ratio_pct: 90,
      anomaly_count: 2,
      anomaly_total_try: 15_000,
      top_category: 'Kira',
      top_category_pct: 45,
    })
    for (const insight of result) {
      expect(insight.id.length).toBeGreaterThan(0)
      expect(insight.title.length).toBeGreaterThan(0)
      expect(insight.narrative.length).toBeGreaterThan(0)
      expect(insight.category).toBe('expenses')
    }
  })

  it('29. all receivables insights have non-empty id, title, narrative', () => {
    const result = generateReceivablesInsights({ overdue_pct: 40, dso_days: 60 })
    for (const insight of result) {
      expect(insight.id.length).toBeGreaterThan(0)
      expect(insight.title.length).toBeGreaterThan(0)
      expect(insight.narrative.length).toBeGreaterThan(0)
      expect(insight.category).toBe('receivables')
    }
  })

})
