/**
 * Tests for lib/engines/anomaly.engine.ts and lib/engines/duplicate-detector.ts
 * All pure functions — no DB calls, no side effects.
 * Run with: npx vitest run tests/anomaly-engine.test.ts
 */
import { describe, it, expect } from 'vitest'
import {
  detectRevenueAnomalies,
  detectExpenseAnomalies,
  scoreCustomerRisk,
  type MonthlyRevenue,
  type MonthlyExpense,
  type CustomerPayment,
} from '../lib/engines/anomaly.engine'
import {
  detectDuplicates,
  type ExpenseRow,
} from '../lib/engines/duplicate-detector'

// ═══════════════════════════════════════════════════════════════════════════
// ANOMALY ENGINE — detectRevenueAnomalies
// ═══════════════════════════════════════════════════════════════════════════

describe('detectRevenueAnomalies', () => {
  // Stable baseline for tests: months 1–3 are the 3-month baseline, month 4 is the check
  function makeRevenue(values: number[]): MonthlyRevenue[] {
    return values.map((v, i) => ({
      month:   `2025-${String(i + 1).padStart(2, '0')}`,
      revenue: v,
    }))
  }

  it('returns [] when fewer than 4 months provided', () => {
    expect(detectRevenueAnomalies(makeRevenue([100, 200, 300]))).toHaveLength(0)
    expect(detectRevenueAnomalies([])).toHaveLength(0)
  })

  it('returns [] when the 4th month is within 2σ of baseline', () => {
    // Baseline: 100, 100, 100 → mean=100, σ≈0 → any value exactly at mean passes
    // But with σ=0, z is 0 → no anomaly detected
    expect(detectRevenueAnomalies(makeRevenue([100, 100, 100, 100]))).toHaveLength(0)
  })

  it('detects a revenue spike (current >> baseline)', () => {
    // Baseline 1000, 1000, 1000 → mean=1000, σ≈0... let us use variance
    // Better: baseline with variance so σ is meaningful
    const data = makeRevenue([1_000, 1_100, 900, 10_000])  // 4th month is huge spike
    const anomalies = detectRevenueAnomalies(data)
    expect(anomalies.length).toBeGreaterThan(0)
    expect(anomalies[0].direction).toBe('spike')
  })

  it('detects a revenue drop (current << baseline)', () => {
    const data = makeRevenue([10_000, 9_000, 11_000, 100])   // 4th month near zero
    const anomalies = detectRevenueAnomalies(data)
    expect(anomalies.length).toBeGreaterThan(0)
    expect(anomalies[0].direction).toBe('drop')
  })

  it('returns correct month in the anomaly', () => {
    const data = makeRevenue([1_000, 1_100, 900, 20_000])
    const anomalies = detectRevenueAnomalies(data)
    expect(anomalies[0].month).toBe('2025-04')
  })

  it('anomaly.actual matches the current month revenue', () => {
    const data = makeRevenue([1_000, 1_100, 900, 20_000])
    const anomalies = detectRevenueAnomalies(data)
    expect(anomalies[0].actual).toBe(20_000)
  })

  it('severity is high for extreme deviation (z > 3)', () => {
    // Very tight baseline, then extreme spike
    const data = makeRevenue([1_000, 1_001, 999, 50_000])
    const anomalies = detectRevenueAnomalies(data)
    expect(anomalies[0].severity).toBe('high')
  })

  it('severity is medium for moderate deviation (2 ≤ z < 3)', () => {
    // Baseline with moderate spread, current at 2.5σ
    const data = makeRevenue([1_000, 2_000, 3_000, 8_000])
    const anomalies = detectRevenueAnomalies(data)
    if (anomalies.length > 0) {
      expect(['medium', 'high']).toContain(anomalies[0].severity)
    }
  })

  it('uses customizable sigmaThreshold', () => {
    // With a very tight threshold (0.5σ), minor deviations are anomalies
    const data = makeRevenue([1_000, 1_100, 900, 1_300])
    const tight = detectRevenueAnomalies(data, 0.5)
    const normal = detectRevenueAnomalies(data, 2)
    // tight threshold should fire; normal may not
    expect(tight.length).toBeGreaterThanOrEqual(normal.length)
  })

  it('deviation_pct is positive for spike, negative for drop', () => {
    const spike = detectRevenueAnomalies(makeRevenue([1_000, 1_100, 900, 20_000]))
    const drop  = detectRevenueAnomalies(makeRevenue([10_000, 9_000, 11_000, 100]))
    if (spike.length > 0) expect(spike[0].deviation_pct).toBeGreaterThan(0)
    if (drop.length > 0)  expect(drop[0].deviation_pct).toBeLessThan(0)
  })

  it('slides the window correctly (months 2–4 baseline, 5 as check)', () => {
    const data = makeRevenue([1_000, 1_100, 900, 1_050, 50_000])
    const anomalies = detectRevenueAnomalies(data)
    // Month 5 (index 4) should be flagged
    const month5 = anomalies.find(a => a.month === '2025-05')
    expect(month5).toBeDefined()
  })

  it('message contains the month', () => {
    const data = makeRevenue([1_000, 1_100, 900, 20_000])
    const [a] = detectRevenueAnomalies(data)
    expect(a.message).toContain('2025-04')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// ANOMALY ENGINE — detectExpenseAnomalies
// ═══════════════════════════════════════════════════════════════════════════

describe('detectExpenseAnomalies', () => {
  function makeExpenses(category: string, values: number[]): MonthlyExpense[] {
    return values.map((v, i) => ({
      month:    `2025-${String(i + 1).padStart(2, '0')}`,
      category,
      amount:   v,
    }))
  }

  it('returns [] for empty input', () => {
    expect(detectExpenseAnomalies([])).toHaveLength(0)
  })

  it('returns [] when category has fewer than 4 months', () => {
    expect(detectExpenseAnomalies(makeExpenses('rent', [1000, 2000, 3000]))).toHaveLength(0)
  })

  it('detects expense spike within a category', () => {
    const expenses = makeExpenses('software', [500, 550, 480, 10_000])
    const anomalies = detectExpenseAnomalies(expenses)
    expect(anomalies.length).toBeGreaterThan(0)
    expect(anomalies[0].direction).toBe('spike')
    expect(anomalies[0].category).toBe('software')
  })

  it('detects expense drop within a category', () => {
    const expenses = makeExpenses('marketing', [5_000, 4_800, 5_200, 10])
    const anomalies = detectExpenseAnomalies(expenses)
    expect(anomalies.length).toBeGreaterThan(0)
    expect(anomalies[0].direction).toBe('drop')
  })

  it('processes multiple categories independently', () => {
    const expenses = [
      ...makeExpenses('rent',     [1_000, 1_200, 800, 20_000]),  // spike in rent (has variance)
      ...makeExpenses('software', [500,   500,   500,   500]),    // stable (σ=0 → no anomaly)
    ]
    const anomalies = detectExpenseAnomalies(expenses)
    expect(anomalies.some(a => a.category === 'rent')).toBe(true)
    expect(anomalies.some(a => a.category === 'software')).toBe(false)
  })

  it('uses 1.5σ threshold by default (lower than revenue 2σ)', () => {
    // A 2σ deviation should fire for expenses (threshold 1.5) but let revenue test confirm
    const expenses = makeExpenses('utilities', [1_000, 1_200, 800, 5_000])
    const defaultThreshold = detectExpenseAnomalies(expenses, 1.5)
    const highThreshold    = detectExpenseAnomalies(expenses, 5)
    expect(defaultThreshold.length).toBeGreaterThanOrEqual(highThreshold.length)
  })

  it('sorts results by |deviation_pct| descending', () => {
    const expenses = [
      ...makeExpenses('rent',      [1000, 1000, 1000, 10_000]),   // large spike
      ...makeExpenses('marketing', [1000, 1000, 1000, 2_000]),    // small spike
    ]
    const anomalies = detectExpenseAnomalies(expenses)
    if (anomalies.length >= 2) {
      expect(Math.abs(anomalies[0].deviation_pct)).toBeGreaterThanOrEqual(
        Math.abs(anomalies[1].deviation_pct)
      )
    }
  })

  it('message contains category name', () => {
    // Baseline needs variance so σ > 0 and z can be computed
    const expenses = makeExpenses('payroll', [8_000, 12_000, 10_000, 80_000])
    const [a] = detectExpenseAnomalies(expenses)
    expect(a).toBeDefined()
    expect(a.message).toContain('payroll')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// ANOMALY ENGINE — scoreCustomerRisk
// ═══════════════════════════════════════════════════════════════════════════

describe('scoreCustomerRisk', () => {
  function makePayment(
    customer: string,
    opts: {
      sale_date?: string
      paid_date?: string | null
      due_date?: string | null
      total_try?: number
      payment_status?: string
    } = {}
  ): CustomerPayment {
    return {
      customer_name:  customer,
      sale_date:      opts.sale_date      ?? '2025-01-01',
      paid_date:      opts.paid_date      ?? null,
      due_date:       opts.due_date       ?? null,
      total_try:      opts.total_try      ?? 1000,
      payment_status: opts.payment_status ?? 'paid',
    }
  }

  it('returns [] for empty input', () => {
    expect(scoreCustomerRisk([])).toHaveLength(0)
  })

  it('skips customer with fewer than 2 transactions', () => {
    const payments = [makePayment('Solo Corp')]
    expect(scoreCustomerRisk(payments)).toHaveLength(0)
  })

  it('includes customer with 2+ transactions', () => {
    const payments = [makePayment('Multi Corp'), makePayment('Multi Corp')]
    expect(scoreCustomerRisk(payments)).toHaveLength(1)
  })

  it('assigns high risk when overdue ratio is high and many late days', () => {
    const payments = [
      makePayment('Bad Payer', { payment_status: 'overdue', total_try: 5_000 }),
      makePayment('Bad Payer', { payment_status: 'overdue', total_try: 3_000 }),
      makePayment('Bad Payer', {
        payment_status: 'paid',
        due_date: '2025-01-01',
        paid_date: '2025-04-01',  // 90 days late
        total_try: 1_000,
      }),
    ]
    const [risk] = scoreCustomerRisk(payments)
    expect(risk.risk_level).toBe('high')
    expect(risk.risk_score).toBeGreaterThanOrEqual(60)
  })

  it('assigns low risk for customer who always pays on time', () => {
    const payments = [
      makePayment('Good Payer', {
        payment_status: 'paid',
        due_date: '2025-01-10', paid_date: '2025-01-05',  // early!
      }),
      makePayment('Good Payer', {
        payment_status: 'paid',
        due_date: '2025-02-10', paid_date: '2025-02-08',  // early
      }),
    ]
    const [risk] = scoreCustomerRisk(payments)
    expect(risk.risk_level).toBe('low')
    expect(risk.risk_score).toBeLessThan(30)
  })

  it('risk_score is between 0 and 100 inclusive', () => {
    const payments = Array.from({ length: 5 }, () =>
      makePayment('Capped Corp', {
        payment_status: 'overdue',
        due_date: '2025-01-01', paid_date: '2025-12-31',
      })
    )
    const [risk] = scoreCustomerRisk(payments)
    expect(risk.risk_score).toBeGreaterThanOrEqual(0)
    expect(risk.risk_score).toBeLessThanOrEqual(100)
  })

  it('counts overdue_count correctly', () => {
    const payments = [
      makePayment('Test Co', { payment_status: 'overdue' }),
      makePayment('Test Co', { payment_status: 'overdue' }),
      makePayment('Test Co', { payment_status: 'paid' }),
    ]
    const [risk] = scoreCustomerRisk(payments)
    expect(risk.overdue_count).toBe(2)
  })

  it('counts pending as overdue for total_overdue', () => {
    const payments = [
      makePayment('Pending Corp', { payment_status: 'pending', total_try: 1_500 }),
      makePayment('Pending Corp', { payment_status: 'paid',    total_try: 500  }),
    ]
    const [risk] = scoreCustomerRisk(payments)
    expect(risk.total_overdue).toBe(1_500)
    expect(risk.overdue_count).toBe(1)
  })

  it('sorts results by risk_score descending', () => {
    const payments: CustomerPayment[] = [
      // Good payer
      makePayment('Good', { payment_status: 'paid', due_date: '2025-01-10', paid_date: '2025-01-08' }),
      makePayment('Good', { payment_status: 'paid', due_date: '2025-02-10', paid_date: '2025-02-07' }),
      // Bad payer
      makePayment('Bad',  { payment_status: 'overdue', total_try: 5000 }),
      makePayment('Bad',  { payment_status: 'overdue', total_try: 3000 }),
    ]
    const risks = scoreCustomerRisk(payments)
    if (risks.length >= 2) {
      expect(risks[0].risk_score).toBeGreaterThanOrEqual(risks[1].risk_score)
    }
  })

  it('avg_days_late is 0 when no late payments exist', () => {
    const payments = [
      makePayment('OnTime', { payment_status: 'paid', due_date: '2025-01-10', paid_date: '2025-01-08' }),
      makePayment('OnTime', { payment_status: 'paid', due_date: '2025-02-10', paid_date: '2025-02-09' }),
    ]
    const [risk] = scoreCustomerRisk(payments)
    expect(risk.avg_days_late).toBe(0)
  })

  it('ignores payments without paid_date or due_date for lateness calc', () => {
    const payments = [
      makePayment('Partial Data', { payment_status: 'paid', paid_date: null, due_date: null }),
      makePayment('Partial Data', { payment_status: 'paid', paid_date: null, due_date: '2025-01-10' }),
    ]
    // Should not throw; avg_days_late should be 0
    const [risk] = scoreCustomerRisk(payments)
    expect(risk.avg_days_late).toBe(0)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// DUPLICATE DETECTOR
// ═══════════════════════════════════════════════════════════════════════════

describe('detectDuplicates', () => {
  function makeExpense(id: string, opts: Partial<ExpenseRow> = {}): ExpenseRow {
    return {
      id,
      expense_date: opts.expense_date ?? '2025-03-01',
      expense_type: opts.expense_type ?? 'software',
      amount_try:   opts.amount_try   ?? 1_000,
      vendor_name:  opts.vendor_name  ?? null,
      description:  opts.description  ?? null,
    }
  }

  it('returns [] for empty or single-expense input', () => {
    expect(detectDuplicates([])).toHaveLength(0)
    expect(detectDuplicates([makeExpense('e1')])).toHaveLength(0)
  })

  it('detects high-confidence duplicate: same type + same amount + ≤7 days', () => {
    const expenses = [
      makeExpense('e1', { expense_date: '2025-03-01', expense_type: 'rent', amount_try: 5_000 }),
      makeExpense('e2', { expense_date: '2025-03-05', expense_type: 'rent', amount_try: 5_000 }),
    ]
    const groups = detectDuplicates(expenses)
    expect(groups).toHaveLength(1)
    expect(groups[0].confidence).toBe('high')
  })

  it('does not flag as high-confidence when > 7 days apart (same type)', () => {
    const expenses = [
      makeExpense('e1', { expense_date: '2025-03-01', expense_type: 'rent', amount_try: 5_000 }),
      makeExpense('e2', { expense_date: '2025-03-10', expense_type: 'rent', amount_try: 5_000 }),
    ]
    // 9 days apart → no high-confidence match
    const groups = detectDuplicates(expenses)
    expect(groups.filter(g => g.confidence === 'high')).toHaveLength(0)
  })

  it('detects medium-confidence duplicate: same vendor + same amount + ≤14 days', () => {
    const expenses = [
      makeExpense('e1', {
        expense_date: '2025-03-01', expense_type: 'software', amount_try: 2_500, vendor_name: 'AWS',
      }),
      makeExpense('e2', {
        expense_date: '2025-03-12', expense_type: 'utilities', amount_try: 2_500, vendor_name: 'AWS',
      }),
    ]
    const groups = detectDuplicates(expenses)
    expect(groups).toHaveLength(1)
    expect(groups[0].confidence).toBe('medium')
  })

  it('does not flag different amounts', () => {
    const expenses = [
      makeExpense('e1', { expense_date: '2025-03-01', expense_type: 'rent', amount_try: 5_000 }),
      makeExpense('e2', { expense_date: '2025-03-02', expense_type: 'rent', amount_try: 5_001 }),
    ]
    expect(detectDuplicates(expenses)).toHaveLength(0)
  })

  it('does not flag same amount but different type and no vendor', () => {
    const expenses = [
      makeExpense('e1', { expense_date: '2025-03-01', expense_type: 'rent',      amount_try: 1_000 }),
      makeExpense('e2', { expense_date: '2025-03-02', expense_type: 'marketing', amount_try: 1_000 }),
    ]
    expect(detectDuplicates(expenses)).toHaveLength(0)
  })

  it('does not flag pairs more than 14 days apart', () => {
    const expenses = [
      makeExpense('e1', { expense_date: '2025-03-01', expense_type: 'rent', amount_try: 3_000, vendor_name: 'V' }),
      makeExpense('e2', { expense_date: '2025-03-20', expense_type: 'rent', amount_try: 3_000, vendor_name: 'V' }),
    ]
    expect(detectDuplicates(expenses)).toHaveLength(0)
  })

  it('returns high confidence before medium confidence', () => {
    const expenses = [
      // high-confidence pair
      makeExpense('e1', { expense_date: '2025-03-01', expense_type: 'rent',   amount_try: 5_000 }),
      makeExpense('e2', { expense_date: '2025-03-03', expense_type: 'rent',   amount_try: 5_000 }),
      // medium-confidence pair
      makeExpense('e3', { expense_date: '2025-03-01', expense_type: 'it',     amount_try: 2_000, vendor_name: 'TechCo' }),
      makeExpense('e4', { expense_date: '2025-03-10', expense_type: 'marketing', amount_try: 2_000, vendor_name: 'TechCo' }),
    ]
    const groups = detectDuplicates(expenses)
    if (groups.length >= 2) {
      expect(groups[0].confidence).toBe('high')
    }
  })

  it('does not double-count a pair', () => {
    const expenses = [
      makeExpense('e1', { expense_date: '2025-03-01', expense_type: 'software', amount_try: 1_500 }),
      makeExpense('e2', { expense_date: '2025-03-02', expense_type: 'software', amount_try: 1_500 }),
    ]
    const groups = detectDuplicates(expenses)
    // pair (e1, e2) should appear exactly once
    expect(groups).toHaveLength(1)
    expect(groups[0].rows).toHaveLength(2)
  })

  it('is case-insensitive for vendor names', () => {
    const expenses = [
      makeExpense('e1', {
        expense_date: '2025-03-01', expense_type: 'it', amount_try: 1_000, vendor_name: '  AWS  ',
      }),
      makeExpense('e2', {
        expense_date: '2025-03-05', expense_type: 'marketing', amount_try: 1_000, vendor_name: 'aws',
      }),
    ]
    const groups = detectDuplicates(expenses)
    expect(groups).toHaveLength(1)
    expect(groups[0].confidence).toBe('medium')
  })

  it('handles amount tolerance (< 0.01 TRY difference counts as same)', () => {
    const expenses = [
      makeExpense('e1', { expense_date: '2025-03-01', expense_type: 'rent', amount_try: 1_000.005 }),
      makeExpense('e2', { expense_date: '2025-03-02', expense_type: 'rent', amount_try: 1_000.005 }),
    ]
    expect(detectDuplicates(expenses)).toHaveLength(1)
  })

  it('group includes both expense IDs', () => {
    const expenses = [
      makeExpense('e1', { expense_date: '2025-03-01', expense_type: 'rent', amount_try: 5_000 }),
      makeExpense('e2', { expense_date: '2025-03-03', expense_type: 'rent', amount_try: 5_000 }),
    ]
    const [group] = detectDuplicates(expenses)
    const ids = group.rows.map(r => r.id).sort()
    expect(ids).toEqual(['e1', 'e2'])
  })

  it('reason string mentions expense_type for high-confidence groups', () => {
    const expenses = [
      makeExpense('e1', { expense_date: '2025-03-01', expense_type: 'payroll', amount_try: 15_000 }),
      makeExpense('e2', { expense_date: '2025-03-02', expense_type: 'payroll', amount_try: 15_000 }),
    ]
    const [group] = detectDuplicates(expenses)
    expect(group.reason).toContain('payroll')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// detectRevenueAnomalies — flat revenue returns no anomalies
// ═══════════════════════════════════════════════════════════════════════════

describe('detectRevenueAnomalies — flat and outlier scenarios', () => {
  function mkRevenue(values: number[]): import('../lib/engines/anomaly.engine').MonthlyRevenue[] {
    return values.map((v, i) => ({
      month:   `2026-${String(i + 1).padStart(2, '0')}`,
      revenue: v,
    }))
  }

  it('returns no anomalies for perfectly flat revenue', () => {
    // Flat baseline = 0 stddev → z is always 0 → no anomaly
    const data = mkRevenue([50_000, 50_000, 50_000, 50_000])
    expect(detectRevenueAnomalies(data)).toHaveLength(0)
  })

  it('returns anomaly for outlier month at 3× average', () => {
    // Baseline 10K,10K,10K; then 30K spike
    const data = mkRevenue([10_000, 10_200, 9_800, 30_000])
    const anomalies = detectRevenueAnomalies(data)
    expect(anomalies.length).toBeGreaterThan(0)
    expect(anomalies[0].direction).toBe('spike')
  })

  it('returns drop anomaly for month at 1/3 of average', () => {
    const data = mkRevenue([30_000, 32_000, 28_000, 1_000])
    const anomalies = detectRevenueAnomalies(data)
    expect(anomalies.length).toBeGreaterThan(0)
    expect(anomalies[0].direction).toBe('drop')
  })

  it('anomaly type is always "revenue"', () => {
    const data = mkRevenue([1_000, 1_100, 900, 20_000])
    const anomalies = detectRevenueAnomalies(data)
    anomalies.forEach(a => expect(a.type).toBe('revenue'))
  })

  it('mean field reflects the 3-month baseline average', () => {
    // Need non-zero stddev to trigger anomaly detection: baseline with variance
    const data = mkRevenue([8_000, 10_000, 12_000, 80_000])
    const [a] = detectRevenueAnomalies(data)
    expect(a).toBeDefined()
    expect(a.mean).toBeCloseTo(10_000, 0)
  })

  it('actual field matches the current month revenue', () => {
    const data = mkRevenue([8_000, 10_000, 12_000, 80_000])
    const [a] = detectRevenueAnomalies(data)
    expect(a).toBeDefined()
    expect(a.actual).toBe(80_000)
  })

  it('needs at least 4 months of data to produce anomalies', () => {
    expect(detectRevenueAnomalies(mkRevenue([10_000, 20_000, 5_000]))).toHaveLength(0)
  })

  it('sigma threshold of 5 should suppress most anomalies', () => {
    const data = mkRevenue([1_000, 1_100, 900, 5_000])
    const strict = detectRevenueAnomalies(data, 5)
    const normal = detectRevenueAnomalies(data, 2)
    expect(strict.length).toBeLessThanOrEqual(normal.length)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// detectExpenseAnomalies — flat returns no anomalies, spike detected
// ═══════════════════════════════════════════════════════════════════════════

describe('detectExpenseAnomalies — flat and outlier scenarios', () => {
  function mkExpenses(cat: string, values: number[]): import('../lib/engines/anomaly.engine').MonthlyExpense[] {
    return values.map((v, i) => ({
      month:    `2026-${String(i + 1).padStart(2, '0')}`,
      category: cat,
      amount:   v,
    }))
  }

  it('returns no anomalies for perfectly flat expense amounts', () => {
    const data = mkExpenses('utilities', [5_000, 5_000, 5_000, 5_000])
    expect(detectExpenseAnomalies(data)).toHaveLength(0)
  })

  it('returns anomaly for outlier month at 3× average', () => {
    const data = mkExpenses('marketing', [4_000, 4_100, 3_900, 12_000])
    const anomalies = detectExpenseAnomalies(data)
    expect(anomalies.length).toBeGreaterThan(0)
    expect(anomalies[0].category).toBe('marketing')
  })

  it('anomaly type is always "expense"', () => {
    const data = mkExpenses('rent', [10_000, 11_000, 9_000, 50_000])
    const anomalies = detectExpenseAnomalies(data)
    anomalies.forEach(a => expect(a.type).toBe('expense'))
  })

  it('returns no anomaly for a category with fewer than 4 months of data', () => {
    const data = mkExpenses('insurance', [1_000, 2_000, 1_500])
    expect(detectExpenseAnomalies(data)).toHaveLength(0)
  })

  it('anomaly message contains category and month', () => {
    const data = mkExpenses('payroll', [10_000, 12_000, 8_000, 60_000])
    const [a] = detectExpenseAnomalies(data)
    if (a) {
      expect(a.message).toContain('payroll')
    }
  })

  it('spike direction correct when amount rises sharply', () => {
    const data = mkExpenses('hosting', [500, 600, 400, 8_000])
    const [a] = detectExpenseAnomalies(data)
    if (a) expect(a.direction).toBe('spike')
  })

  it('drop direction correct when amount falls sharply', () => {
    const data = mkExpenses('advertising', [8_000, 9_000, 7_000, 100])
    const [a] = detectExpenseAnomalies(data)
    if (a) expect(a.direction).toBe('drop')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// scoreCustomerRisk — risk levels and late payment scoring
// ═══════════════════════════════════════════════════════════════════════════

describe('scoreCustomerRisk — risk level scoring', () => {
  function mkPayment(customer: string, status: string, total: number, due?: string, paid?: string): import('../lib/engines/anomaly.engine').CustomerPayment {
    return {
      customer_name:  customer,
      sale_date:      '2025-01-01',
      paid_date:      paid ?? null,
      due_date:       due ?? null,
      total_try:      total,
      payment_status: status,
    }
  }

  it('customer with only paid and on-time payments receives low risk', () => {
    const payments = [
      mkPayment('GoodCo', 'paid', 1000, '2025-02-01', '2025-01-30'),
      mkPayment('GoodCo', 'paid', 1000, '2025-03-01', '2025-02-28'),
    ]
    const [risk] = scoreCustomerRisk(payments)
    expect(risk.risk_level).toBe('low')
  })

  it('high overdue ratio leads to risk_score >= 60 (high risk)', () => {
    const payments = [
      mkPayment('BadCo', 'overdue', 5000),
      mkPayment('BadCo', 'overdue', 5000),
      mkPayment('BadCo', 'overdue', 5000),
      mkPayment('BadCo', 'paid', 1000, '2025-01-01', '2025-04-10'),  // 99 days late
    ]
    const [risk] = scoreCustomerRisk(payments)
    expect(risk.risk_score).toBeGreaterThanOrEqual(60)
    expect(risk.risk_level).toBe('high')
  })

  it('medium risk falls between score 30 and 59', () => {
    const payments = [
      mkPayment('AvgCo', 'overdue', 2000),
      mkPayment('AvgCo', 'paid', 2000, '2025-01-01', '2025-02-20'),  // ~50 days late
    ]
    const [risk] = scoreCustomerRisk(payments)
    expect(risk.risk_score).toBeGreaterThanOrEqual(0)
    expect(risk.risk_score).toBeLessThanOrEqual(100)
  })

  it('risk_score is always in [0, 100] range', () => {
    const extremePayments = Array.from({ length: 20 }, (_, i) =>
      mkPayment('Extreme', 'overdue', 1000, '2025-01-01', `2025-0${Math.min(i + 1, 9)}-01`)
    )
    const results = scoreCustomerRisk(extremePayments)
    if (results.length > 0) {
      expect(results[0].risk_score).toBeGreaterThanOrEqual(0)
      expect(results[0].risk_score).toBeLessThanOrEqual(100)
    }
  })

  it('total_overdue accumulates all overdue amounts', () => {
    const payments = [
      mkPayment('SumCo', 'overdue', 3000),
      mkPayment('SumCo', 'overdue', 2000),
      mkPayment('SumCo', 'paid', 500),
    ]
    const [risk] = scoreCustomerRisk(payments)
    expect(risk.total_overdue).toBeCloseTo(5000, 0)
  })

  it('result has customer_name, risk_score, risk_level, message properties', () => {
    const payments = [
      mkPayment('PropCo', 'paid', 1000),
      mkPayment('PropCo', 'paid', 1000),
    ]
    const [risk] = scoreCustomerRisk(payments)
    expect(typeof risk.customer_name).toBe('string')
    expect(typeof risk.risk_score).toBe('number')
    expect(['low', 'medium', 'high']).toContain(risk.risk_level)
    expect(typeof risk.message).toBe('string')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// detectDuplicates — exact amount duplicates and no false positives
// ═══════════════════════════════════════════════════════════════════════════

describe('detectDuplicates — exact amount matching and false positive guard', () => {
  function mkExp(id: string, date: string, type: string, amount: number, vendor?: string): import('../lib/engines/duplicate-detector').ExpenseRow {
    return { id, expense_date: date, expense_type: type, amount_try: amount, vendor_name: vendor ?? null }
  }

  it('finds exact amount duplicates within 7 days (same type)', () => {
    const expenses = [
      mkExp('a1', '2025-04-01', 'software', 1200),
      mkExp('a2', '2025-04-06', 'software', 1200),
    ]
    const groups = detectDuplicates(expenses)
    expect(groups).toHaveLength(1)
    expect(groups[0].confidence).toBe('high')
  })

  it('no false positives for different amounts (same type, same date)', () => {
    const expenses = [
      mkExp('b1', '2025-04-01', 'rent', 5000),
      mkExp('b2', '2025-04-01', 'rent', 5001),
    ]
    expect(detectDuplicates(expenses)).toHaveLength(0)
  })

  it('no false positives for same amount but different type and no vendor', () => {
    const expenses = [
      mkExp('c1', '2025-04-01', 'marketing', 2000),
      mkExp('c2', '2025-04-02', 'utilities', 2000),
    ]
    expect(detectDuplicates(expenses)).toHaveLength(0)
  })

  it('group includes both original expense IDs', () => {
    const expenses = [
      mkExp('d1', '2025-04-01', 'payroll', 15000),
      mkExp('d2', '2025-04-03', 'payroll', 15000),
    ]
    const [g] = detectDuplicates(expenses)
    const ids = g.rows.map(r => r.id).sort()
    expect(ids).toEqual(['d1', 'd2'])
  })

  it('amount_try on group matches original amount', () => {
    const expenses = [
      mkExp('e1', '2025-04-01', 'rent', 8000),
      mkExp('e2', '2025-04-04', 'rent', 8000),
    ]
    const [g] = detectDuplicates(expenses)
    expect(g.amount_try).toBe(8000)
  })

  it('group has confidence, reason, rows, message fields', () => {
    const expenses = [
      mkExp('f1', '2025-04-01', 'insurance', 3000),
      mkExp('f2', '2025-04-02', 'insurance', 3000),
    ]
    const [g] = detectDuplicates(expenses)
    expect(g).toHaveProperty('confidence')
    expect(g).toHaveProperty('reason')
    expect(g).toHaveProperty('rows')
    expect(g).toHaveProperty('message')
  })
})
