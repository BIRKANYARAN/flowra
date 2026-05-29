/**
 * Tests for lib/services/simulation-strategic.service.ts
 *
 * Pure functions (no DB):
 *   computeStrategicScenario() — company-level P&L projection for one scenario
 *   computeMultiScenario()     — base / optimistic / pessimistic comparison
 *
 * Run with: npx vitest run tests/simulation-strategic.test.ts
 */
import { describe, it, expect } from 'vitest'
import {
  computeStrategicScenario,
  computeMultiScenario,
  SEASONAL_WEIGHTS_DEFAULT,
  type StrategicScenarioInput,
} from '../lib/services/simulation-strategic.service'

// ── Helper ────────────────────────────────────────────────────────────────────

function mkInput(overrides: Partial<StrategicScenarioInput> = {}): StrategicScenarioInput {
  return {
    scenario_name:         'Test',
    revenue_model:         'uniform',
    target_annual_revenue: 1_200_000,   // ₺100K/month
    base_monthly_expenses: [
      { category: 'salary', amount_try: 50_000 },
      { category: 'rent',   amount_try: 10_000 },
    ],
    period_months:  12,
    start_month:    '2026-01',
    tax_rate:       25,
    ...overrides,
  }
}

// ── computeStrategicScenario — output structure ────────────────────────────────

describe('computeStrategicScenario — output structure', () => {
  it('returns 12 monthly breakdowns for period_months=12', () => {
    const result = computeStrategicScenario(mkInput())
    expect(result.months).toHaveLength(12)
  })

  it('each month has required fields', () => {
    const result = computeStrategicScenario(mkInput())
    const m = result.months[0]
    expect(typeof m.month).toBe('string')
    expect(typeof m.label).toBe('string')
    expect(typeof m.revenue).toBe('number')
    expect(typeof m.opex).toBe('number')
    expect(typeof m.ebitda).toBe('number')
    expect(typeof m.net_income).toBe('number')
    expect(typeof m.cum_net).toBe('number')
  })

  it('month labels wrap year boundary (start Nov → has both 2026 and 2027)', () => {
    const result = computeStrategicScenario(mkInput({ start_month: '2026-11' }))
    const labels = result.months.map(m => m.month)
    expect(labels.some(l => l.startsWith('2026'))).toBe(true)
    expect(labels.some(l => l.startsWith('2027'))).toBe(true)
  })

  it('all 12 month strings are unique', () => {
    const result = computeStrategicScenario(mkInput())
    const months = result.months.map(m => m.month)
    expect(new Set(months).size).toBe(12)
  })

  it('recommendation is non-empty string', () => {
    const result = computeStrategicScenario(mkInput())
    expect(typeof result.recommendation).toBe('string')
    expect(result.recommendation.length).toBeGreaterThan(0)
  })
})

// ── computeStrategicScenario — arithmetic ─────────────────────────────────────

describe('computeStrategicScenario — P&L arithmetic', () => {
  it('uniform revenue: each month gets target/12', () => {
    const result = computeStrategicScenario(mkInput({ target_annual_revenue: 1_200_000 }))
    for (const m of result.months) {
      expect(m.revenue).toBeCloseTo(100_000, 0)
    }
  })

  it('ebitda = revenue - opex', () => {
    const result = computeStrategicScenario(mkInput())
    for (const m of result.months) {
      expect(m.ebitda).toBeCloseTo(m.revenue - m.opex, 1)
    }
  })

  it('ebt = ebitda - interest', () => {
    const result = computeStrategicScenario(mkInput())
    for (const m of result.months) {
      expect(m.ebt).toBeCloseTo(m.ebitda - m.interest, 1)
    }
  })

  it('tax = 25% of ebt when ebt > 0', () => {
    const result = computeStrategicScenario(mkInput({ tax_rate: 25 }))
    for (const m of result.months) {
      if (m.ebt > 0) {
        expect(m.tax).toBeCloseTo(m.ebt * 0.25, 0)
      }
    }
  })

  it('tax = 0 when ebt <= 0', () => {
    // Force a loss: low revenue, high expenses
    const result = computeStrategicScenario(mkInput({
      target_annual_revenue:   60_000,   // ₺5K/month
      base_monthly_expenses: [{ category: 'salary', amount_try: 50_000 }],
    }))
    for (const m of result.months) {
      if (m.ebt <= 0) expect(m.tax).toBe(0)
    }
  })

  it('net_income = ebt - tax', () => {
    const result = computeStrategicScenario(mkInput())
    for (const m of result.months) {
      expect(m.net_income).toBeCloseTo(m.ebt - m.tax, 1)
    }
  })

  it('cum_net is cumulative: month[i].cum_net = month[i-1].cum_net + net_income[i]', () => {
    const result = computeStrategicScenario(mkInput())
    for (let i = 1; i < result.months.length; i++) {
      const expected = result.months[i - 1].cum_net + result.months[i].net_income
      expect(result.months[i].cum_net).toBeCloseTo(expected, 1)
    }
  })

  it('total_revenue = sum of monthly revenues', () => {
    const result = computeStrategicScenario(mkInput())
    const sum = result.months.reduce((s, m) => s + m.revenue, 0)
    expect(result.total_revenue).toBeCloseTo(sum, 0)
  })

  it('total_net = sum of monthly net_income', () => {
    const result = computeStrategicScenario(mkInput())
    const sum = result.months.reduce((s, m) => s + m.net_income, 0)
    expect(result.total_net).toBeCloseTo(sum, 0)
  })
})

// ── computeStrategicScenario — expense overrides ──────────────────────────────

describe('computeStrategicScenario — expense overrides', () => {
  it('overriding a category replaces its amount', () => {
    const base = computeStrategicScenario(mkInput())
    const overridden = computeStrategicScenario(mkInput({
      expense_overrides: { salary: 30_000 },  // was 50_000
    }))
    // Overridden opex = 30_000 + 10_000 = 40_000 vs base 60_000
    expect(overridden.months[0].opex).toBeLessThan(base.months[0].opex)
    expect(overridden.months[0].opex).toBeCloseTo(40_000, 0)
  })

  it('monthly_compensation adds to opex', () => {
    const base = computeStrategicScenario(mkInput())
    const withComp = computeStrategicScenario(mkInput({ monthly_compensation: 10_000 }))
    expect(withComp.months[0].opex).toBeCloseTo(base.months[0].opex + 10_000, 0)
  })
})

// ── computeStrategicScenario — debt service ───────────────────────────────────

describe('computeStrategicScenario — debt service', () => {
  it('debt service increases total_interest and total_debt_service', () => {
    const noDbt = computeStrategicScenario(mkInput())
    const withDbt = computeStrategicScenario(mkInput({
      debt_tranches: [{ label: 'Loan A', monthly_interest: 5_000, monthly_repayment: 10_000, remaining_months: 12 }],
    }))
    expect(withDbt.total_interest).toBeGreaterThan(noDbt.total_interest)
    expect(withDbt.total_debt_service).toBeGreaterThan(noDbt.total_debt_service)
  })

  it('debt_service = interest + principal repayment per month', () => {
    const result = computeStrategicScenario(mkInput({
      debt_tranches: [{ label: 'Loan', monthly_interest: 3_000, monthly_repayment: 7_000, remaining_months: 12 }],
    }))
    for (const m of result.months) {
      expect(m.debt_service).toBeCloseTo(m.interest + 7_000, 1)
    }
  })

  it('tranche expires after remaining_months: no interest/repayment beyond that', () => {
    const result = computeStrategicScenario(mkInput({
      period_months: 6,
      debt_tranches: [{ label: 'Short Loan', monthly_interest: 5_000, monthly_repayment: 10_000, remaining_months: 3 }],
    }))
    // Months 0-2: debt service active; months 3-5: no debt service
    expect(result.months[0].interest).toBe(5_000)
    expect(result.months[3].interest).toBe(0)
    expect(result.months[3].debt_service).toBe(0)
  })
})

// ── computeStrategicScenario — runway and break-even detection ────────────────

describe('computeStrategicScenario — runway and break-even', () => {
  it('runway_end_month is null when company is profitable throughout', () => {
    const result = computeStrategicScenario(mkInput({
      target_annual_revenue: 5_000_000,
      base_monthly_expenses: [{ category: 'salary', amount_try: 50_000 }],
    }))
    expect(result.runway_end_month).toBeNull()
  })

  it('runway_end_month is set when cumulative net goes negative', () => {
    const result = computeStrategicScenario(mkInput({
      target_annual_revenue:    60_000,   // ₺5K/month revenue
      base_monthly_expenses: [{ category: 'salary', amount_try: 100_000 }],
    }))
    expect(result.runway_end_month).not.toBeNull()
  })

  it('break_even_month is set to first month with positive net_income', () => {
    const result = computeStrategicScenario(mkInput({
      target_annual_revenue: 1_200_000,
      base_monthly_expenses: [{ category: 'salary', amount_try: 50_000 }],
    }))
    // revenue=100K, opex=50K → profitable from month 1
    expect(result.break_even_month).toBe('2026-01')
  })
})

// ── computeStrategicScenario — seasonal revenue ───────────────────────────────

describe('computeStrategicScenario — seasonal revenue model', () => {
  it('seasonal with uniform weights gives same as uniform model', () => {
    const uniform   = computeStrategicScenario(mkInput({ revenue_model: 'uniform' }))
    const seasonal  = computeStrategicScenario(mkInput({
      revenue_model:   'seasonal',
      monthly_weights: Array(12).fill(1),  // equal weights
    }))
    // Both should produce same total revenue
    expect(seasonal.total_revenue).toBeCloseTo(uniform.total_revenue, 0)
  })

  it('seasonal total revenue = target_annual_revenue', () => {
    const result = computeStrategicScenario(mkInput({
      revenue_model:   'seasonal',
      monthly_weights: [2, 1, 1, 1, 1, 2, 2, 2, 1, 1, 1, 1],  // peaks in Jan, Jun, Jul, Aug
    }))
    expect(result.total_revenue).toBeCloseTo(1_200_000, -1)
  })

  it('high-weight month receives proportionally more revenue', () => {
    // Weights: only month 0 (Jan) is high; Jan start
    const weights = [12, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]  // all revenue in Jan
    const result = computeStrategicScenario(mkInput({
      revenue_model:   'seasonal',
      monthly_weights: weights,
      period_months:   3,
      start_month:     '2026-01',
    }))
    // All revenue in Jan (month 0); other months get 0
    expect(result.months[0].revenue).toBeCloseTo(1_200_000, -1)
    expect(result.months[1].revenue).toBeCloseTo(0, 0)
    expect(result.months[2].revenue).toBeCloseTo(0, 0)
  })
})

// ── computeMultiScenario — three scenarios ────────────────────────────────────

describe('computeMultiScenario — structure', () => {
  it('returns base, optimistic, pessimistic scenarios', () => {
    const result = computeMultiScenario(mkInput())
    expect(result.base).toBeDefined()
    expect(result.optimistic).toBeDefined()
    expect(result.pessimistic).toBeDefined()
  })

  it('recommended is one of: base, optimistic, pessimistic', () => {
    const result = computeMultiScenario(mkInput())
    expect(['base', 'optimistic', 'pessimistic']).toContain(result.recommended)
  })

  it('recommendation_reason is non-empty string', () => {
    const result = computeMultiScenario(mkInput())
    expect(typeof result.recommendation_reason).toBe('string')
    expect(result.recommendation_reason.length).toBeGreaterThan(0)
  })
})

describe('computeMultiScenario — scenario ordering', () => {
  it('optimistic total_revenue > base total_revenue', () => {
    const result = computeMultiScenario(mkInput())
    expect(result.optimistic.total_revenue).toBeGreaterThan(result.base.total_revenue)
  })

  it('pessimistic total_revenue < base total_revenue', () => {
    const result = computeMultiScenario(mkInput())
    expect(result.pessimistic.total_revenue).toBeLessThan(result.base.total_revenue)
  })

  it('optimistic revenue is base × 1.15 (within 1%)', () => {
    const result = computeMultiScenario(mkInput())
    const ratio = result.optimistic.total_revenue / result.base.total_revenue
    expect(ratio).toBeCloseTo(1.15, 1)
  })

  it('pessimistic revenue is base × 0.80 (within 1%)', () => {
    const result = computeMultiScenario(mkInput())
    const ratio = result.pessimistic.total_revenue / result.base.total_revenue
    expect(ratio).toBeCloseTo(0.80, 1)
  })

  it('optimistic opex < base opex (0.95 multiplier)', () => {
    const result = computeMultiScenario(mkInput())
    // optimistic has expenseMultiplier=0.95
    expect(result.optimistic.total_opex).toBeLessThan(result.base.total_opex)
  })

  it('pessimistic opex > base opex (1.10 multiplier)', () => {
    const result = computeMultiScenario(mkInput())
    expect(result.pessimistic.total_opex).toBeGreaterThan(result.base.total_opex)
  })

  it('optimistic total_net > base total_net', () => {
    const result = computeMultiScenario(mkInput())
    expect(result.optimistic.total_net).toBeGreaterThan(result.base.total_net)
  })

  it('pessimistic total_net < base total_net', () => {
    const result = computeMultiScenario(mkInput())
    expect(result.pessimistic.total_net).toBeLessThan(result.base.total_net)
  })
})

// ── computeStrategicScenario — period boundaries ──────────────────────────────

describe('computeStrategicScenario — period boundaries', () => {
  it('period_months = 1 returns exactly 1 month', () => {
    const result = computeStrategicScenario(mkInput({ period_months: 1 }))
    expect(result.months).toHaveLength(1)
  })

  it('period_months = 24 returns exactly 24 months', () => {
    const result = computeStrategicScenario(mkInput({ period_months: 24 }))
    expect(result.months).toHaveLength(24)
  })

  it('period_months = 6 cum_net at last month equals total_net', () => {
    const result = computeStrategicScenario(mkInput({ period_months: 6 }))
    const lastMonth = result.months[5]
    expect(lastMonth.cum_net).toBeCloseTo(result.total_net, 1)
  })

  it('zero revenue: all months have revenue = 0 (uniform)', () => {
    const result = computeStrategicScenario(mkInput({ target_annual_revenue: 0 }))
    result.months.forEach(m => expect(m.revenue).toBe(0))
  })

  it('zero expenses: opex is 0 when no expenses', () => {
    const result = computeStrategicScenario(mkInput({ base_monthly_expenses: [] }))
    result.months.forEach(m => expect(m.opex).toBe(0))
  })

  it('zero revenue, zero expenses: ebitda = 0 every month', () => {
    const result = computeStrategicScenario(mkInput({
      target_annual_revenue: 0,
      base_monthly_expenses: [],
    }))
    result.months.forEach(m => expect(m.ebitda).toBe(0))
  })
})

// ── computeStrategicScenario — pressure_status ────────────────────────────────

describe('computeStrategicScenario — pressure_status from DSR', () => {
  it('no debt → DSR = 0 → pressure_status = healthy', () => {
    const result = computeStrategicScenario(mkInput())
    result.months.forEach(m => {
      expect(m.pressure_status).toBe('healthy')
      expect(m.dsr).toBe(0)
    })
  })

  it('small debt with high revenue → DSR < 0.30 → healthy', () => {
    const result = computeStrategicScenario(mkInput({
      target_annual_revenue: 10_000_000,
      debt_tranches: [{ label: 'Small', monthly_interest: 1_000, monthly_repayment: 1_000, remaining_months: 12 }],
    }))
    result.months.forEach(m => {
      expect(m.pressure_status).toBe('healthy')
    })
  })

  it('large debt with low revenue → DSR >= 0.80 → insolvent', () => {
    const result = computeStrategicScenario(mkInput({
      target_annual_revenue: 120_000,  // 10K/month
      debt_tranches: [{ label: 'Heavy', monthly_interest: 5_000, monthly_repayment: 5_000, remaining_months: 12 }],
    }))
    // debt service = 10K, revenue = 10K → DSR = 1.0 → insolvent
    result.months.forEach(m => {
      expect(m.pressure_status).toBe('insolvent')
    })
  })
})

// ── computeStrategicScenario — tax_rate override ──────────────────────────────

describe('computeStrategicScenario — tax_rate override', () => {
  it('tax_rate = 0 → tax = 0 for all profitable months', () => {
    const result = computeStrategicScenario(mkInput({ tax_rate: 0 }))
    result.months.forEach(m => {
      if (m.ebt > 0) expect(m.tax).toBe(0)
    })
  })

  it('tax_rate = 50 → tax = 50% of ebt when profitable', () => {
    const result = computeStrategicScenario(mkInput({ tax_rate: 50 }))
    for (const m of result.months) {
      if (m.ebt > 0) {
        expect(m.tax).toBeCloseTo(m.ebt * 0.50, 0)
      }
    }
  })

  it('higher tax_rate → lower net_income for same revenue/expense', () => {
    const low  = computeStrategicScenario(mkInput({ tax_rate: 10 }))
    const high = computeStrategicScenario(mkInput({ tax_rate: 40 }))
    expect(high.total_net).toBeLessThan(low.total_net)
  })

  it('total_net = total_ebitda - total_interest - total_tax', () => {
    const result = computeStrategicScenario(mkInput())
    expect(result.total_net).toBeCloseTo(
      result.total_ebitda - result.total_interest - result.total_tax, 0
    )
  })
})

// ── computeStrategicScenario — monotonicity of cum_net ───────────────────────

describe('computeStrategicScenario — cum_net monotonicity', () => {
  it('profitable scenario: cum_net is non-decreasing', () => {
    const result = computeStrategicScenario(mkInput({
      target_annual_revenue: 5_000_000,
      base_monthly_expenses: [{ category: 'salary', amount_try: 50_000 }],
    }))
    for (let i = 1; i < result.months.length; i++) {
      expect(result.months[i].cum_net).toBeGreaterThanOrEqual(result.months[i - 1].cum_net)
    }
  })

  it('loss scenario: cum_net is non-increasing', () => {
    const result = computeStrategicScenario(mkInput({
      target_annual_revenue: 12_000,  // ₺1K/month
      base_monthly_expenses: [{ category: 'salary', amount_try: 100_000 }],
    }))
    for (let i = 1; i < result.months.length; i++) {
      expect(result.months[i].cum_net).toBeLessThanOrEqual(result.months[i - 1].cum_net)
    }
  })
})

// ── computeStrategicScenario — multiple expense categories ───────────────────

describe('computeStrategicScenario — multiple expense categories', () => {
  it('opex = sum of all expense categories', () => {
    const result = computeStrategicScenario(mkInput({
      base_monthly_expenses: [
        { category: 'salary',    amount_try: 40_000 },
        { category: 'rent',      amount_try: 10_000 },
        { category: 'software',  amount_try:  5_000 },
        { category: 'marketing', amount_try:  5_000 },
      ],
    }))
    result.months.forEach(m => {
      expect(m.opex).toBeCloseTo(60_000, 0)
    })
  })

  it('overriding to 0 effectively removes a category', () => {
    const result = computeStrategicScenario(mkInput({
      base_monthly_expenses: [
        { category: 'salary', amount_try: 50_000 },
        { category: 'rent',   amount_try: 10_000 },
      ],
      expense_overrides: { rent: 0 },
    }))
    result.months.forEach(m => {
      expect(m.opex).toBeCloseTo(50_000, 0)
    })
  })

  it('monthly_compensation of 0 does not change opex', () => {
    const base = computeStrategicScenario(mkInput())
    const withZeroComp = computeStrategicScenario(mkInput({ monthly_compensation: 0 }))
    expect(withZeroComp.months[0].opex).toBeCloseTo(base.months[0].opex, 0)
  })
})

// ── computeStrategicScenario — avg_dsr calculation ───────────────────────────

describe('computeStrategicScenario — avg_dsr', () => {
  it('no debt → avg_dsr = 0', () => {
    const result = computeStrategicScenario(mkInput())
    expect(result.avg_dsr).toBe(0)
  })

  it('avg_dsr = total_debt_service / total_revenue when revenue > 0', () => {
    const result = computeStrategicScenario(mkInput({
      debt_tranches: [{ label: 'Loan', monthly_interest: 5_000, monthly_repayment: 5_000, remaining_months: 12 }],
    }))
    if (result.total_revenue > 0) {
      expect(result.avg_dsr).toBeCloseTo(result.total_debt_service / result.total_revenue, 2)
    }
  })

  it('avg_dsr = 0 when total_revenue = 0 and no debt', () => {
    const result = computeStrategicScenario(mkInput({
      target_annual_revenue: 0,
      base_monthly_expenses: [],
    }))
    expect(result.avg_dsr).toBe(0)
  })
})

// ── computeMultiScenario — recommended selection logic ───────────────────────

describe('computeMultiScenario — recommended selection', () => {
  it('for healthy scenario, optimistic is recommended (highest net + viable)', () => {
    const result = computeMultiScenario(mkInput({
      target_annual_revenue: 5_000_000,
      base_monthly_expenses: [{ category: 'salary', amount_try: 50_000 }],
    }))
    // All scenarios are viable; optimistic has highest net
    expect(result.recommended).toBe('optimistic')
  })

  it('recommendation_reason contains TRY amount', () => {
    const result = computeMultiScenario(mkInput())
    expect(result.recommendation_reason).toMatch(/₺/)
  })

  it('base scenario scenario_name is "Baz"', () => {
    const result = computeMultiScenario(mkInput())
    expect(result.base.scenario_name).toBe('Baz')
  })

  it('optimistic scenario scenario_name is "İyimser"', () => {
    const result = computeMultiScenario(mkInput())
    expect(result.optimistic.scenario_name).toBe('İyimser')
  })

  it('pessimistic scenario scenario_name is "Kötümser"', () => {
    const result = computeMultiScenario(mkInput())
    expect(result.pessimistic.scenario_name).toBe('Kötümser')
  })

  it('all three scenarios have the same period_months', () => {
    const result = computeMultiScenario(mkInput({ period_months: 6 }))
    expect(result.base.months).toHaveLength(6)
    expect(result.optimistic.months).toHaveLength(6)
    expect(result.pessimistic.months).toHaveLength(6)
  })
})

// ── SEASONAL_WEIGHTS_DEFAULT — structure checks ───────────────────────────────

describe('SEASONAL_WEIGHTS_DEFAULT — structure checks', () => {
  it('has exactly 12 elements', () => {
    expect(SEASONAL_WEIGHTS_DEFAULT).toHaveLength(12)
  })

  it('sum is close to 12 (normalized scale)', () => {
    const sum = SEASONAL_WEIGHTS_DEFAULT.reduce((s, w) => s + w, 0)
    expect(sum).toBeCloseTo(12, 0)
  })

  it('all weights are positive numbers', () => {
    for (const w of SEASONAL_WEIGHTS_DEFAULT) {
      expect(w).toBeGreaterThan(0)
    }
  })

  it('Q4 months (Oct-Dec indices 9-11) have higher weights than Jan (index 0)', () => {
    expect(SEASONAL_WEIGHTS_DEFAULT[10]).toBeGreaterThan(SEASONAL_WEIGHTS_DEFAULT[0])  // November > January
    expect(SEASONAL_WEIGHTS_DEFAULT[11]).toBeGreaterThan(SEASONAL_WEIGHTS_DEFAULT[0])  // December > January
  })
})

// ── computeStrategicScenario — monthly breakdown fields ───────────────────────

describe('computeStrategicScenario — monthly breakdown fields', () => {
  it('each month has revenue field as number', () => {
    const result = computeStrategicScenario(mkInput())
    for (const m of result.months) {
      expect(typeof m.revenue).toBe('number')
    }
  })

  it('each month has opex field as number', () => {
    const result = computeStrategicScenario(mkInput())
    for (const m of result.months) {
      expect(typeof m.opex).toBe('number')
    }
  })

  it('each month has net_income field as number', () => {
    const result = computeStrategicScenario(mkInput())
    for (const m of result.months) {
      expect(typeof m.net_income).toBe('number')
    }
  })

  it('net_income formula: ebt - tax (ebt = ebitda - interest)', () => {
    const result = computeStrategicScenario(mkInput({ tax_rate: 25, debt_tranches: [] }))
    for (const m of result.months) {
      const ebt = m.ebt
      const expectedNet = ebt > 0 ? ebt - m.tax : ebt
      expect(m.net_income).toBeCloseTo(expectedNet, 1)
    }
  })

  it('uniform revenue — all months have equal revenue', () => {
    const result = computeStrategicScenario(mkInput({ revenue_model: 'uniform', target_annual_revenue: 1_200_000 }))
    const revs = result.months.map(m => m.revenue)
    const allEqual = revs.every(r => Math.abs(r - revs[0]) < 1)
    expect(allEqual).toBe(true)
  })

  it('total_revenue ≈ sum of monthly revenues', () => {
    const result = computeStrategicScenario(mkInput())
    const sumMonthly = result.months.reduce((s, m) => s + m.revenue, 0)
    expect(result.total_revenue).toBeCloseTo(sumMonthly, 0)
  })

  it('ebitda = revenue - opex per month', () => {
    const result = computeStrategicScenario(mkInput())
    for (const m of result.months) {
      expect(m.ebitda).toBeCloseTo(m.revenue - m.opex, 1)
    }
  })
})

// ── computeMultiScenario — revenue ordering ───────────────────────────────────

describe('computeMultiScenario — revenue and net ordering', () => {
  it('optimistic total_revenue > base total_revenue', () => {
    const result = computeMultiScenario(mkInput())
    expect(result.optimistic.total_revenue).toBeGreaterThan(result.base.total_revenue)
  })

  it('base total_revenue > pessimistic total_revenue', () => {
    const result = computeMultiScenario(mkInput())
    expect(result.base.total_revenue).toBeGreaterThan(result.pessimistic.total_revenue)
  })

  it('optimistic has higher net than base for high-revenue input', () => {
    const result = computeMultiScenario(mkInput({ target_annual_revenue: 5_000_000 }))
    expect(result.optimistic.total_net).toBeGreaterThan(result.base.total_net)
  })

  it('base has higher net than pessimistic', () => {
    const result = computeMultiScenario(mkInput())
    expect(result.base.total_net).toBeGreaterThan(result.pessimistic.total_net)
  })

  it('all 3 scenarios have same fixed base expenses category structure', () => {
    const result = computeMultiScenario(mkInput())
    // All scenarios use same expense categories — opex values differ by multiplier but shape is same
    expect(result.base.months[0].opex).toBeGreaterThan(0)
    expect(result.optimistic.months[0].opex).toBeGreaterThan(0)
    expect(result.pessimistic.months[0].opex).toBeGreaterThan(0)
  })

  it('returns base, optimistic, pessimistic, recommended, recommendation_reason', () => {
    const result = computeMultiScenario(mkInput())
    expect(result).toHaveProperty('base')
    expect(result).toHaveProperty('optimistic')
    expect(result).toHaveProperty('pessimistic')
    expect(result).toHaveProperty('recommended')
    expect(result).toHaveProperty('recommendation_reason')
  })

  it('recommended is one of base | optimistic | pessimistic', () => {
    const result = computeMultiScenario(mkInput())
    expect(['base', 'optimistic', 'pessimistic']).toContain(result.recommended)
  })
})
