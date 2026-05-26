/**
 * Tests for lib/services/commercial/customer-intelligence.service.ts
 *
 * All tests use a mock Supabase client — no real DB calls.
 * Run with: npx vitest run tests/customer-intelligence.test.ts
 */
import { describe, it, expect } from 'vitest'
import {
  CustomerIntelligenceService,
  type CustomerPaymentProfile,
} from '../lib/services/commercial/customer-intelligence.service'

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

interface MockSaleRow {
  customer_name: string | null
  total_try:     number | null
  paid_amount:   number | null
  payment_status: string | null
  sale_date:     string | null
  due_date:      string | null
  paid_at:       string | null
}

function makeMockSupabase(rows: MockSaleRow[]) {
  // Returns a minimal Supabase-shaped object that satisfies the service query chain
  const queryObj = {
    _rows: rows,
    eq(_col: string, _val: unknown)    { return this },
    is(_col: string, _val: unknown)    { return this },
    order(_col: string, _opts?: unknown) { return this },
    // The service awaits the query directly — resolve with { data, error }
    then(resolve: (v: { data: MockSaleRow[]; error: null }) => unknown) {
      return Promise.resolve({ data: this._rows, error: null }).then(resolve)
    },
  }

  return {
    from(_table: string) {
      return {
        select(_cols: string) { return queryObj },
      }
    },
  } as unknown as Parameters<typeof CustomerIntelligenceService.getProfiles>[1]
}

function makeSale(overrides: Partial<MockSaleRow> = {}): MockSaleRow {
  return {
    customer_name: 'Acme Ltd',
    total_try:     1000,
    paid_amount:   0,
    payment_status: 'pending',
    sale_date:     '2025-01-01',
    due_date:      null,
    paid_at:       null,
    ...overrides,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. No sales → empty profiles
// ─────────────────────────────────────────────────────────────────────────────
describe('getProfiles — no sales', () => {
  it('returns empty array when no sales exist', async () => {
    const supabase = makeMockSupabase([])
    const profiles = await CustomerIntelligenceService.getProfiles('co_1', supabase)
    expect(profiles).toHaveLength(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 2. Single paid sale → avg_days_to_pay computed correctly
// ─────────────────────────────────────────────────────────────────────────────
describe('getProfiles — single paid sale', () => {
  it('computes avg_days_to_pay as days between sale_date and paid_at', async () => {
    const supabase = makeMockSupabase([
      makeSale({
        payment_status: 'paid',
        sale_date:      '2025-01-01',
        paid_at:        '2025-01-11',  // 10 days later
        total_try:      5000,
        paid_amount:    5000,
      }),
    ])
    const [profile] = await CustomerIntelligenceService.getProfiles('co_1', supabase)
    expect(profile.avg_days_to_pay).toBe(10)
    expect(profile.total_paid_try).toBe(5000)
    expect(profile.total_outstanding_try).toBe(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 3. Overdue sale → appears in overdue metrics
// ─────────────────────────────────────────────────────────────────────────────
describe('getProfiles — overdue sale', () => {
  it('counts overdue_sales_count and overdue_amount_try for unpaid past-due sales', async () => {
    const supabase = makeMockSupabase([
      makeSale({
        payment_status: 'overdue',
        total_try:      2000,
        paid_amount:    0,
        due_date:       '2024-12-01',
      }),
    ])
    const today = '2025-01-15'
    const [profile] = await CustomerIntelligenceService.getProfiles('co_1', supabase, { today })
    expect(profile.overdue_sales_count).toBe(1)
    expect(profile.overdue_amount_try).toBe(2000)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 4. on_time_rate = 1.0 when all paid before due_date
// ─────────────────────────────────────────────────────────────────────────────
describe('on_time_rate', () => {
  it('returns 1.0 when all paid sales were paid on or before due_date', async () => {
    const supabase = makeMockSupabase([
      makeSale({ payment_status: 'paid', sale_date: '2025-01-01', due_date: '2025-01-20', paid_at: '2025-01-15' }),
      makeSale({ payment_status: 'paid', sale_date: '2025-02-01', due_date: '2025-02-20', paid_at: '2025-02-10' }),
    ])
    const [profile] = await CustomerIntelligenceService.getProfiles('co_1', supabase)
    expect(profile.on_time_rate).toBe(1)
  })

  // 5. on_time_rate = 0.0 when all paid after due_date
  it('returns 0.0 when all paid sales were paid after due_date', async () => {
    const supabase = makeMockSupabase([
      makeSale({ payment_status: 'paid', sale_date: '2025-01-01', due_date: '2025-01-10', paid_at: '2025-01-25' }),
      makeSale({ payment_status: 'paid', sale_date: '2025-02-01', due_date: '2025-02-10', paid_at: '2025-02-28' }),
    ])
    const [profile] = await CustomerIntelligenceService.getProfiles('co_1', supabase)
    expect(profile.on_time_rate).toBe(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 6. critical risk tier: overdue > 0 AND avg_days_overdue > 30
// ─────────────────────────────────────────────────────────────────────────────
describe('risk_tier — critical', () => {
  it('assigns critical when overdue_amount > 0 AND avg_days_overdue > 30', async () => {
    const supabase = makeMockSupabase([
      // Paid very late (45 days after due_date)
      makeSale({ payment_status: 'paid', sale_date: '2024-10-01', due_date: '2024-10-15', paid_at: '2024-11-29', total_try: 5000, paid_amount: 5000 }),
      // Currently overdue
      makeSale({ payment_status: 'overdue', total_try: 3000, paid_amount: 0, due_date: '2024-09-01' }),
    ])
    const today = '2025-01-15'
    const [profile] = await CustomerIntelligenceService.getProfiles('co_1', supabase, { today })
    expect(profile.risk_tier).toBe('critical')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 7. low risk tier: all paid on time
// ─────────────────────────────────────────────────────────────────────────────
describe('risk_tier — low', () => {
  it('assigns low when all sales paid on time with no overdue amount', async () => {
    const supabase = makeMockSupabase([
      makeSale({ payment_status: 'paid', sale_date: '2025-01-01', due_date: '2025-01-20', paid_at: '2025-01-10', total_try: 1000, paid_amount: 1000 }),
      makeSale({ payment_status: 'paid', sale_date: '2025-02-01', due_date: '2025-02-20', paid_at: '2025-02-08', total_try: 2000, paid_amount: 2000 }),
    ])
    const [profile] = await CustomerIntelligenceService.getProfiles('co_1', supabase)
    expect(profile.risk_tier).toBe('low')
    expect(profile.on_time_rate).toBe(1)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 8. Trend improving when recent sales paid faster
// ─────────────────────────────────────────────────────────────────────────────
describe('trend', () => {
  it('returns "improving" when recent avg_days_to_pay is lower by > 5 days', async () => {
    const today = '2025-04-01'
    // Prior period: sales 91–180 days ago
    // Recent period: sales in last 90 days
    const priorSales: MockSaleRow[] = [
      makeSale({ payment_status: 'paid', sale_date: '2024-11-01', paid_at: '2024-12-20', total_try: 1000, paid_amount: 1000 }),
      makeSale({ payment_status: 'paid', sale_date: '2024-11-15', paid_at: '2025-01-10', total_try: 1000, paid_amount: 1000 }),
    ]
    const recentSales: MockSaleRow[] = [
      makeSale({ payment_status: 'paid', sale_date: '2025-02-01', paid_at: '2025-02-08', total_try: 1000, paid_amount: 1000 }),
      makeSale({ payment_status: 'paid', sale_date: '2025-02-15', paid_at: '2025-02-20', total_try: 1000, paid_amount: 1000 }),
    ]

    const supabase = makeMockSupabase([...priorSales, ...recentSales])
    const [profile] = await CustomerIntelligenceService.getProfiles('co_1', supabase, { today })
    expect(profile.trend).toBe('improving')
  })

  // 9. Trend deteriorating when recent sales paid slower
  it('returns "deteriorating" when recent avg_days_to_pay is higher by > 5 days', async () => {
    const today = '2025-04-01'
    const priorSales: MockSaleRow[] = [
      makeSale({ payment_status: 'paid', sale_date: '2024-11-01', paid_at: '2024-11-08', total_try: 1000, paid_amount: 1000 }),
      makeSale({ payment_status: 'paid', sale_date: '2024-11-15', paid_at: '2024-11-22', total_try: 1000, paid_amount: 1000 }),
    ]
    const recentSales: MockSaleRow[] = [
      makeSale({ payment_status: 'paid', sale_date: '2025-02-01', paid_at: '2025-03-01', total_try: 1000, paid_amount: 1000 }),
      makeSale({ payment_status: 'paid', sale_date: '2025-02-15', paid_at: '2025-03-20', total_try: 1000, paid_amount: 1000 }),
    ]

    const supabase = makeMockSupabase([...priorSales, ...recentSales])
    const [profile] = await CustomerIntelligenceService.getProfiles('co_1', supabase, { today })
    expect(profile.trend).toBe('deteriorating')
  })

  // 10. insufficient_data when too few paid sales in either period
  it('returns "insufficient_data" when fewer than 2 paid sales in recent period', async () => {
    const today = '2025-04-01'
    const supabase = makeMockSupabase([
      makeSale({ payment_status: 'paid', sale_date: '2025-02-01', paid_at: '2025-02-10', total_try: 1000, paid_amount: 1000 }),
      // Only 1 recent paid sale → insufficient
    ])
    const [profile] = await CustomerIntelligenceService.getProfiles('co_1', supabase, { today })
    expect(profile.trend).toBe('insufficient_data')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 11. Portfolio risk: sums correctly across multiple customers
// ─────────────────────────────────────────────────────────────────────────────
describe('computePortfolioRisk', () => {
  it('sums risk tiers and overdue amounts correctly', () => {
    const profiles: CustomerPaymentProfile[] = [
      {
        customer_name: 'Alpha', total_sales: 3, total_revenue_try: 10000,
        total_paid_try: 5000, total_outstanding_try: 5000,
        avg_days_to_pay: 20, avg_days_overdue: 35, on_time_rate: 0.3,
        overdue_sales_count: 2, overdue_amount_try: 5000, last_overdue_date: '2025-01-01',
        recent_avg_days_to_pay: 25, trend: 'deteriorating',
        risk_tier: 'critical', last_sale_date: '2025-01-15', first_sale_date: '2024-06-01',
      },
      {
        customer_name: 'Beta', total_sales: 5, total_revenue_try: 20000,
        total_paid_try: 18000, total_outstanding_try: 2000,
        avg_days_to_pay: 12, avg_days_overdue: 0, on_time_rate: 0.8,
        overdue_sales_count: 1, overdue_amount_try: 2000, last_overdue_date: null,
        recent_avg_days_to_pay: 10, trend: 'improving',
        risk_tier: 'high', last_sale_date: '2025-02-01', first_sale_date: '2024-01-01',
      },
      {
        customer_name: 'Gamma', total_sales: 2, total_revenue_try: 5000,
        total_paid_try: 5000, total_outstanding_try: 0,
        avg_days_to_pay: 8, avg_days_overdue: -2, on_time_rate: 1,
        overdue_sales_count: 0, overdue_amount_try: 0, last_overdue_date: null,
        recent_avg_days_to_pay: 8, trend: 'stable',
        risk_tier: 'low', last_sale_date: '2025-03-01', first_sale_date: '2024-08-01',
      },
    ]

    const portfolio = CustomerIntelligenceService.computePortfolioRisk(profiles)

    expect(portfolio.total_customers).toBe(3)
    expect(portfolio.critical_count).toBe(1)
    expect(portfolio.high_risk_count).toBe(1)
    expect(portfolio.medium_risk_count).toBe(0)
    expect(portfolio.low_risk_count).toBe(1)
    expect(portfolio.total_overdue_try).toBe(7000)
    // avg on_time_rate = (0.3 + 0.8 + 1.0) / 3 ≈ 0.7
    expect(portfolio.portfolio_on_time_rate).toBeCloseTo(0.7, 1)
    // avg days to pay = (20 + 12 + 8) / 3 = 13.33
    expect(portfolio.avg_days_to_pay_portfolio).toBeCloseTo(13.33, 1)
  })

  // 12. computePortfolioRisk with empty profiles → safe fallbacks
  it('returns safe zero/null fallbacks for empty profiles', () => {
    const portfolio = CustomerIntelligenceService.computePortfolioRisk([])
    expect(portfolio.total_customers).toBe(0)
    expect(portfolio.critical_count).toBe(0)
    expect(portfolio.high_risk_count).toBe(0)
    expect(portfolio.medium_risk_count).toBe(0)
    expect(portfolio.low_risk_count).toBe(0)
    expect(portfolio.portfolio_on_time_rate).toBe(0)
    expect(portfolio.total_overdue_try).toBe(0)
    expect(portfolio.avg_days_to_pay_portfolio).toBeNull()
  })
})
