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

// ── generatePartnerInsights ───────────────────────────────────────────────────

import { generatePartnerInsights, buildInsightReport } from '../lib/services/intelligence/insight-engine.service'

describe('generatePartnerInsights', () => {

  it('30. partner with grade D → warning insight emitted', () => {
    const result = generatePartnerInsights({
      partners: [{ name: 'Acme Ltd', grade: 'D', debt_concentration_pct: null }],
    })
    expect(result.length).toBeGreaterThanOrEqual(1)
    expect(result[0].severity).toBe('warning')
    expect(result[0].category).toBe('partners')
    expect(result[0].id).toContain('partners_risk_')
  })

  it('31. partner with grade F → warning insight emitted', () => {
    const result = generatePartnerInsights({
      partners: [{ name: 'Bad Corp', grade: 'F', debt_concentration_pct: null }],
    })
    expect(result.some(i => i.id.includes('partners_risk_'))).toBe(true)
  })

  it('32. partner with grade A → no risk insight', () => {
    const result = generatePartnerInsights({
      partners: [{ name: 'Good Corp', grade: 'A', debt_concentration_pct: null }],
    })
    expect(result.some(i => i.id.includes('partners_risk_'))).toBe(false)
  })

  it('33. partner with grade B → no risk insight', () => {
    const result = generatePartnerInsights({
      partners: [{ name: 'Medium Corp', grade: 'B', debt_concentration_pct: null }],
    })
    expect(result.some(i => i.id.includes('partners_risk_'))).toBe(false)
  })

  it('34. partner with grade C → no risk insight', () => {
    const result = generatePartnerInsights({
      partners: [{ name: 'OK Corp', grade: 'C', debt_concentration_pct: null }],
    })
    expect(result.some(i => i.id.includes('partners_risk_'))).toBe(false)
  })

  it('35. partner with grade null → no risk insight', () => {
    const result = generatePartnerInsights({
      partners: [{ name: 'Unknown Corp', grade: null, debt_concentration_pct: null }],
    })
    expect(result.some(i => i.id.includes('partners_risk_'))).toBe(false)
  })

  it('36. debt_concentration_pct > 60 → concentration warning', () => {
    const result = generatePartnerInsights({
      partners: [{ name: 'Big Lender', grade: 'A', debt_concentration_pct: 75 }],
    })
    expect(result.some(i => i.id.includes('partners_concentration_'))).toBe(true)
    expect(result.find(i => i.id.includes('concentration'))?.metric_value).toBe(75)
  })

  it('37. debt_concentration_pct exactly 60 → no concentration insight', () => {
    const result = generatePartnerInsights({
      partners: [{ name: 'Edge Lender', grade: 'A', debt_concentration_pct: 60 }],
    })
    expect(result.some(i => i.id.includes('concentration'))).toBe(false)
  })

  it('38. debt_concentration_pct = 61 → concentration warning emitted', () => {
    const result = generatePartnerInsights({
      partners: [{ name: 'Border Lender', grade: 'A', debt_concentration_pct: 61 }],
    })
    expect(result.some(i => i.id.includes('concentration'))).toBe(true)
  })

  it('39. partner with both grade D and concentration > 60 → two insights', () => {
    const result = generatePartnerInsights({
      partners: [{ name: 'Bad Big Lender', grade: 'D', debt_concentration_pct: 80 }],
    })
    expect(result.length).toBe(2)
  })

  it('40. empty partners array → no insights', () => {
    const result = generatePartnerInsights({ partners: [] })
    expect(result).toHaveLength(0)
  })

  it('41. multiple partners: only D/F grades produce risk insights', () => {
    const result = generatePartnerInsights({
      partners: [
        { name: 'Good One', grade: 'A', debt_concentration_pct: null },
        { name: 'Bad One',  grade: 'F', debt_concentration_pct: null },
        { name: 'Mid One',  grade: 'B', debt_concentration_pct: null },
      ],
    })
    const riskInsights = result.filter(i => i.id.includes('partners_risk_'))
    expect(riskInsights.length).toBe(1)
    expect(riskInsights[0].id).toContain('bad_one')
  })

  it('42. partner name with spaces → id uses underscores', () => {
    const result = generatePartnerInsights({
      partners: [{ name: 'My Big Partner', grade: 'D', debt_concentration_pct: null }],
    })
    expect(result[0].id).toContain('my_big_partner')
    expect(result[0].id).not.toContain(' ')
  })

  it('43. all partner insights have category=partners', () => {
    const result = generatePartnerInsights({
      partners: [
        { name: 'X', grade: 'F', debt_concentration_pct: 70 },
        { name: 'Y', grade: 'D', debt_concentration_pct: null },
      ],
    })
    for (const insight of result) {
      expect(insight.category).toBe('partners')
    }
  })

})

// ── buildInsightReport ────────────────────────────────────────────────────────

describe('buildInsightReport', () => {

  const baseParams = {
    revenue: {
      trend_slope: null,
      trend_r_squared: null,
      current_month_revenue: 100_000,
      prior_month_revenue: 100_000,
      yoy_change_pct: null,
    },
    expenses: {
      expense_ratio_pct: null,
      anomaly_count: 0,
      anomaly_total_try: 0,
      top_category: null,
      top_category_pct: null,
    },
    cash: {
      runway_months: null,
      cash_trend: null,
    },
    receivables: {
      overdue_pct: null,
      dso_days: null,
    },
    partners: {
      partners: [],
    },
  }

  it('44. returns report with company_id matching input', () => {
    const report = buildInsightReport('comp-abc', baseParams)
    expect(report.company_id).toBe('comp-abc')
  })

  it('45. no insights → all counts are 0', () => {
    const report = buildInsightReport('comp-abc', baseParams)
    expect(report.critical_count).toBe(0)
    expect(report.warning_count).toBe(0)
    expect(report.positive_count).toBe(0)
    expect(report.insights).toHaveLength(0)
  })

  it('46. computed_at is a valid ISO date string', () => {
    const report = buildInsightReport('comp-abc', baseParams)
    expect(() => new Date(report.computed_at)).not.toThrow()
    expect(new Date(report.computed_at).getFullYear()).toBeGreaterThan(2020)
  })

  it('47. critical cash runway triggers critical_count = 1', () => {
    const params = {
      ...baseParams,
      cash: { runway_months: 1.5, cash_trend: null },
    }
    const report = buildInsightReport('comp-xyz', params)
    expect(report.critical_count).toBe(1)
    expect(report.insights[0].severity).toBe('critical')
  })

  it('48. multiple categories → insights sorted: critical first, warning next', () => {
    const params = {
      ...baseParams,
      cash: { runway_months: 1.5, cash_trend: null },       // critical
      expenses: {
        expense_ratio_pct: 85,
        anomaly_count: 2,
        anomaly_total_try: 10_000,
        top_category: null,
        top_category_pct: null,
      },
    }
    const report = buildInsightReport('comp-multi', params)
    const severities = report.insights.map(i => i.severity)
    const critIdx = severities.indexOf('critical')
    const warnIdx = severities.indexOf('warning')
    expect(critIdx).toBeLessThan(warnIdx)
  })

  it('49. positive revenue trend included in report', () => {
    const params = {
      ...baseParams,
      revenue: {
        trend_slope: 20_000,
        trend_r_squared: 0.9,
        current_month_revenue: 200_000,
        prior_month_revenue: 100_000,
        yoy_change_pct: null,
      },
    }
    const report = buildInsightReport('comp-rev', params)
    expect(report.positive_count).toBeGreaterThan(0)
  })

  it('50. partner risk insights appear in full report', () => {
    const params = {
      ...baseParams,
      partners: {
        partners: [{ name: 'Risky Partner', grade: 'F' as const, debt_concentration_pct: null }],
      },
    }
    const report = buildInsightReport('comp-part', params)
    const partnerInsights = report.insights.filter(i => i.category === 'partners')
    expect(partnerInsights.length).toBeGreaterThan(0)
  })

  it('51. warning_count matches actual warnings in report', () => {
    const params = {
      ...baseParams,
      receivables: { overdue_pct: 40, dso_days: 60 },
      expenses: {
        expense_ratio_pct: 90,
        anomaly_count: 1,
        anomaly_total_try: 5_000,
        top_category: null,
        top_category_pct: null,
      },
    }
    const report = buildInsightReport('comp-warn', params)
    const actualWarnings = report.insights.filter(i => i.severity === 'warning').length
    expect(report.warning_count).toBe(actualWarnings)
  })

})

// ── Threshold boundary tests (revenue) ───────────────────────────────────────

describe('generateRevenueInsights – exact threshold boundaries', () => {

  it('52. R² exactly 0.6 → no positive trend (requires strictly > 0.6)', () => {
    const result = generateRevenueInsights({
      trend_slope: 5_000,
      trend_r_squared: 0.6,
      current_month_revenue: 100_000,
      prior_month_revenue: 100_000,
      yoy_change_pct: null,
    })
    expect(result.some(i => i.id === 'revenue_positive_trend')).toBe(false)
  })

  it('53. R² = 0.601 → positive trend emitted', () => {
    const result = generateRevenueInsights({
      trend_slope: 5_000,
      trend_r_squared: 0.601,
      current_month_revenue: 100_000,
      prior_month_revenue: 100_000,
      yoy_change_pct: null,
    })
    expect(result.some(i => i.id === 'revenue_positive_trend')).toBe(true)
  })

  it('54. yoy_change_pct exactly -10 → no declining yoy insight', () => {
    const result = generateRevenueInsights({
      trend_slope: null,
      trend_r_squared: null,
      current_month_revenue: 100_000,
      prior_month_revenue: 100_000,
      yoy_change_pct: -10,
    })
    expect(result.some(i => i.id === 'revenue_declining_yoy')).toBe(false)
  })

  it('55. yoy_change_pct = -10.001 → declining yoy insight emitted', () => {
    const result = generateRevenueInsights({
      trend_slope: null,
      trend_r_squared: null,
      current_month_revenue: 100_000,
      prior_month_revenue: 100_000,
      yoy_change_pct: -10.001,
    })
    expect(result.some(i => i.id === 'revenue_declining_yoy')).toBe(true)
  })

  it('56. MoM exactly 20% → no spike', () => {
    // 120_000 / 100_000 - 1 = 20% exactly
    const result = generateRevenueInsights({
      trend_slope: null,
      trend_r_squared: null,
      current_month_revenue: 120_000,
      prior_month_revenue: 100_000,
      yoy_change_pct: null,
    })
    expect(result.some(i => i.id === 'revenue_mom_spike')).toBe(false)
  })

  it('57. MoM = 20.01% → spike emitted', () => {
    const result = generateRevenueInsights({
      trend_slope: null,
      trend_r_squared: null,
      current_month_revenue: 120_010,
      prior_month_revenue: 100_000,
      yoy_change_pct: null,
    })
    expect(result.some(i => i.id === 'revenue_mom_spike')).toBe(true)
  })

  it('58. prior_month_revenue = 0 → no MoM spike (division guard)', () => {
    const result = generateRevenueInsights({
      trend_slope: null,
      trend_r_squared: null,
      current_month_revenue: 50_000,
      prior_month_revenue: 0,
      yoy_change_pct: null,
    })
    expect(result.some(i => i.id === 'revenue_mom_spike')).toBe(false)
  })

  it('59. negative slope → no positive trend insight', () => {
    const result = generateRevenueInsights({
      trend_slope: -5_000,
      trend_r_squared: 0.9,
      current_month_revenue: 80_000,
      prior_month_revenue: 100_000,
      yoy_change_pct: null,
    })
    expect(result.some(i => i.id === 'revenue_positive_trend')).toBe(false)
  })

  it('60. both slope and R² null → empty result when no other signals', () => {
    const result = generateRevenueInsights({
      trend_slope: null,
      trend_r_squared: null,
      current_month_revenue: 100_000,
      prior_month_revenue: 100_000,
      yoy_change_pct: 0,
    })
    expect(result).toHaveLength(0)
  })

  it('61. all three signals at once → three insights', () => {
    const result = generateRevenueInsights({
      trend_slope: 15_000,
      trend_r_squared: 0.8,
      current_month_revenue: 150_000,
      prior_month_revenue: 100_000,   // 50% MoM
      yoy_change_pct: -20,
    })
    expect(result.length).toBe(3)
  })

})

// ── Cash runway boundary tests ────────────────────────────────────────────────

describe('generateCashInsights – exact runway boundaries', () => {

  it('62. runway exactly 3 months → moderate_runway (not critical)', () => {
    const result = generateCashInsights({ runway_months: 3, cash_trend: null })
    expect(result.some(i => i.id === 'cash_low_runway')).toBe(false)
    expect(result.some(i => i.id === 'cash_moderate_runway')).toBe(true)
  })

  it('63. runway = 2.9 → critical (rounds to 2.9 which is < 3)', () => {
    // Service rounds to 1dp: Math.round(2.9*10)/10 = 2.9 < 3
    const result = generateCashInsights({ runway_months: 2.9, cash_trend: null })
    expect(result.some(i => i.id === 'cash_low_runway')).toBe(true)
  })

  it('64. runway exactly 6 months → moderate_runway (not healthy)', () => {
    const result = generateCashInsights({ runway_months: 6, cash_trend: null })
    expect(result.some(i => i.id === 'cash_moderate_runway')).toBe(true)
    expect(result.some(i => i.id === 'cash_healthy_runway')).toBe(false)
  })

  it('65. runway = 7 months (between 6 and 12) → no runway insight at all', () => {
    const result = generateCashInsights({ runway_months: 7, cash_trend: null })
    expect(result.some(i => i.id === 'cash_low_runway')).toBe(false)
    expect(result.some(i => i.id === 'cash_moderate_runway')).toBe(false)
    expect(result.some(i => i.id === 'cash_healthy_runway')).toBe(false)
  })

  it('66. runway exactly 12 months → no healthy_runway (requires strictly > 12)', () => {
    const result = generateCashInsights({ runway_months: 12, cash_trend: null })
    expect(result.some(i => i.id === 'cash_healthy_runway')).toBe(false)
  })

  it('67. runway = 12.1 → healthy_runway (rounds to 12.1 which is > 12)', () => {
    // Service rounds to 1dp: Math.round(12.1*10)/10 = 12.1 > 12
    const result = generateCashInsights({ runway_months: 12.1, cash_trend: null })
    expect(result.some(i => i.id === 'cash_healthy_runway')).toBe(true)
  })

  it('68. runway = 1 + accelerating trend → two insights (critical + burn)', () => {
    const result = generateCashInsights({ runway_months: 1, cash_trend: 'accelerating' })
    expect(result.some(i => i.id === 'cash_low_runway')).toBe(true)
    expect(result.some(i => i.id === 'cash_accelerating_burn')).toBe(true)
    expect(result.length).toBe(2)
  })

  it('69. decelerating trend → no accelerating burn insight', () => {
    const result = generateCashInsights({ runway_months: 8, cash_trend: 'decelerating' })
    expect(result.some(i => i.id === 'cash_accelerating_burn')).toBe(false)
  })

  it('70. stable trend → no accelerating burn insight', () => {
    const result = generateCashInsights({ runway_months: 8, cash_trend: 'stable' })
    expect(result.some(i => i.id === 'cash_accelerating_burn')).toBe(false)
  })

  it('71. metric_value in cash insight matches runway_months (rounded 1dp)', () => {
    const result = generateCashInsights({ runway_months: 2.567, cash_trend: null })
    const critical = result.find(i => i.id === 'cash_low_runway')
    expect(critical?.metric_value).toBeCloseTo(2.6, 1)
  })

})

// ── Expense insight threshold boundaries ─────────────────────────────────────

describe('generateExpenseInsights – exact thresholds', () => {

  it('72. expense_ratio_pct exactly 80 → no high_ratio insight', () => {
    const result = generateExpenseInsights({
      expense_ratio_pct: 80,
      anomaly_count: 0,
      anomaly_total_try: 0,
      top_category: null,
      top_category_pct: null,
    })
    expect(result.some(i => i.id === 'expenses_high_ratio')).toBe(false)
  })

  it('73. expense_ratio_pct = 80.001 → high_ratio warning emitted', () => {
    const result = generateExpenseInsights({
      expense_ratio_pct: 80.001,
      anomaly_count: 0,
      anomaly_total_try: 0,
      top_category: null,
      top_category_pct: null,
    })
    expect(result.some(i => i.id === 'expenses_high_ratio')).toBe(true)
  })

  it('74. expense_ratio_pct exactly 95 → warning (not yet critical)', () => {
    const result = generateExpenseInsights({
      expense_ratio_pct: 95,
      anomaly_count: 0,
      anomaly_total_try: 0,
      top_category: null,
      top_category_pct: null,
    })
    const insight = result.find(i => i.id === 'expenses_high_ratio')
    expect(insight?.severity).toBe('warning')
  })

  it('75. expense_ratio_pct = 95.001 → critical', () => {
    const result = generateExpenseInsights({
      expense_ratio_pct: 95.001,
      anomaly_count: 0,
      anomaly_total_try: 0,
      top_category: null,
      top_category_pct: null,
    })
    const insight = result.find(i => i.id === 'expenses_high_ratio')
    expect(insight?.severity).toBe('critical')
  })

  it('76. top_category_pct = 100 → concentration insight emitted', () => {
    const result = generateExpenseInsights({
      expense_ratio_pct: null,
      anomaly_count: 0,
      anomaly_total_try: 0,
      top_category: 'Kira',
      top_category_pct: 100,
    })
    expect(result.some(i => i.id === 'expenses_category_concentration')).toBe(true)
  })

  it('77. top_category = null but pct = 55 → no concentration insight', () => {
    const result = generateExpenseInsights({
      expense_ratio_pct: null,
      anomaly_count: 0,
      anomaly_total_try: 0,
      top_category: null,
      top_category_pct: 55,
    })
    expect(result.some(i => i.id === 'expenses_category_concentration')).toBe(false)
  })

  it('78. anomaly_count = 1 → one anomaly insight with metric_value = 1', () => {
    const result = generateExpenseInsights({
      expense_ratio_pct: null,
      anomaly_count: 1,
      anomaly_total_try: 3_000,
      top_category: null,
      top_category_pct: null,
    })
    const anomaly = result.find(i => i.id === 'expenses_anomaly_detected')
    expect(anomaly?.metric_value).toBe(1)
  })

  it('79. all three expense signals at once → three insights', () => {
    const result = generateExpenseInsights({
      expense_ratio_pct: 98,
      anomaly_count: 5,
      anomaly_total_try: 50_000,
      top_category: 'Pazarlama',
      top_category_pct: 65,
    })
    expect(result.length).toBe(3)
  })

  it('80. all nulls and zeros → empty result', () => {
    const result = generateExpenseInsights({
      expense_ratio_pct: null,
      anomaly_count: 0,
      anomaly_total_try: 0,
      top_category: null,
      top_category_pct: null,
    })
    expect(result).toHaveLength(0)
  })

})

// ── Receivables boundary tests ────────────────────────────────────────────────

describe('generateReceivablesInsights – exact thresholds', () => {

  it('81. dso_days exactly 45 → no high_dso insight', () => {
    const result = generateReceivablesInsights({ overdue_pct: null, dso_days: 45 })
    expect(result.some(i => i.id === 'receivables_high_dso')).toBe(false)
  })

  it('82. dso_days = 46 → high_dso insight emitted', () => {
    const result = generateReceivablesInsights({ overdue_pct: null, dso_days: 46 })
    expect(result.some(i => i.id === 'receivables_high_dso')).toBe(true)
  })

  it('83. overdue_pct = 31 → high_overdue emitted', () => {
    const result = generateReceivablesInsights({ overdue_pct: 31, dso_days: null })
    expect(result.some(i => i.id === 'receivables_high_overdue')).toBe(true)
  })

  it('84. overdue_pct = 0 + dso = 0 → empty result', () => {
    const result = generateReceivablesInsights({ overdue_pct: 0, dso_days: 0 })
    expect(result).toHaveLength(0)
  })

  it('85. overdue_pct = 100 → insight metric_value = 100', () => {
    const result = generateReceivablesInsights({ overdue_pct: 100, dso_days: null })
    const insight = result.find(i => i.id === 'receivables_high_overdue')
    expect(insight?.metric_value).toBe(100)
  })

  it('86. dso_days = 90 → metric_value = 90', () => {
    const result = generateReceivablesInsights({ overdue_pct: null, dso_days: 90 })
    const insight = result.find(i => i.id === 'receivables_high_dso')
    expect(insight?.metric_value).toBe(90)
  })

  it('87. overdue_pct null, dso_days > 45 → only dso insight emitted', () => {
    const result = generateReceivablesInsights({ overdue_pct: null, dso_days: 60 })
    expect(result.length).toBe(1)
    expect(result[0].id).toBe('receivables_high_dso')
  })

})

// ── sortInsightsBySeverity – additional cases ──────────────────────────────────

describe('sortInsightsBySeverity – additional cases', () => {

  it('88. single element → returns single-element array', () => {
    const input: BusinessInsight[] = [
      { id: 'solo', category: 'general', severity: 'info', title: 'Solo', narrative: 'x' },
    ]
    const sorted = sortInsightsBySeverity(input)
    expect(sorted.length).toBe(1)
    expect(sorted[0].id).toBe('solo')
  })

  it('89. all same severity → sorted by id alphabetically', () => {
    const input: BusinessInsight[] = [
      { id: 'c_item', category: 'cash',     severity: 'critical', title: 'C', narrative: 'x' },
      { id: 'a_item', category: 'revenue',  severity: 'critical', title: 'A', narrative: 'x' },
      { id: 'b_item', category: 'expenses', severity: 'critical', title: 'B', narrative: 'x' },
    ]
    const sorted = sortInsightsBySeverity(input)
    expect(sorted.map(i => i.id)).toEqual(['a_item', 'b_item', 'c_item'])
  })

  it('90. critical always appears before info regardless of id', () => {
    const input: BusinessInsight[] = [
      { id: 'a_info',     category: 'general', severity: 'info',     title: 'A', narrative: 'x' },
      { id: 'z_critical', category: 'cash',    severity: 'critical', title: 'Z', narrative: 'x' },
    ]
    const sorted = sortInsightsBySeverity(input)
    expect(sorted[0].severity).toBe('critical')
    expect(sorted[1].severity).toBe('info')
  })

  it('91. does not mutate original array', () => {
    const input: BusinessInsight[] = [
      { id: 'b', category: 'general', severity: 'warning', title: 'B', narrative: 'x' },
      { id: 'a', category: 'general', severity: 'critical', title: 'A', narrative: 'x' },
    ]
    const originalOrder = input.map(i => i.id)
    sortInsightsBySeverity(input)
    expect(input.map(i => i.id)).toEqual(originalOrder)
  })

  it('92. mixed category insights maintain severity order', () => {
    const input: BusinessInsight[] = [
      { id: 'r1', category: 'revenue',     severity: 'positive', title: 'R1', narrative: 'x' },
      { id: 'c1', category: 'cash',        severity: 'critical', title: 'C1', narrative: 'x' },
      { id: 'e1', category: 'expenses',    severity: 'warning',  title: 'E1', narrative: 'x' },
      { id: 'p1', category: 'receivables', severity: 'info',     title: 'P1', narrative: 'x' },
    ]
    const sorted = sortInsightsBySeverity(input)
    expect(sorted[0].severity).toBe('critical')
    expect(sorted[1].severity).toBe('warning')
    expect(sorted[2].severity).toBe('positive')
    expect(sorted[3].severity).toBe('info')
  })

})
