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

  // 13. avg_days_to_pay_portfolio excludes profiles with null avg
  it('avg_days_to_pay_portfolio excludes profiles where avg_days_to_pay is null', () => {
    const profiles: CustomerPaymentProfile[] = [
      {
        customer_name: 'WithData', total_sales: 2, total_revenue_try: 5000,
        total_paid_try: 5000, total_outstanding_try: 0,
        avg_days_to_pay: 10, avg_days_overdue: -1, on_time_rate: 1,
        overdue_sales_count: 0, overdue_amount_try: 0, last_overdue_date: null,
        recent_avg_days_to_pay: 10, trend: 'stable',
        risk_tier: 'low', last_sale_date: '2025-03-01', first_sale_date: '2024-12-01',
      },
      {
        customer_name: 'NoData', total_sales: 0, total_revenue_try: 0,
        total_paid_try: 0, total_outstanding_try: 0,
        avg_days_to_pay: null, avg_days_overdue: null, on_time_rate: 0,
        overdue_sales_count: 0, overdue_amount_try: 0, last_overdue_date: null,
        recent_avg_days_to_pay: null, trend: 'insufficient_data',
        risk_tier: 'low', last_sale_date: null, first_sale_date: null,
      },
    ]
    const portfolio = CustomerIntelligenceService.computePortfolioRisk(profiles)
    // Only WithData contributes; 10 / 1 = 10
    expect(portfolio.avg_days_to_pay_portfolio).toBe(10)
  })

  // 14. All medium-risk customers
  it('counts all medium-risk customers in medium_risk_count', () => {
    const makeProfile = (name: string): CustomerPaymentProfile => ({
      customer_name: name, total_sales: 1, total_revenue_try: 3000,
      total_paid_try: 3000, total_outstanding_try: 0,
      avg_days_to_pay: 50, avg_days_overdue: null, on_time_rate: 0.6,
      overdue_sales_count: 0, overdue_amount_try: 0, last_overdue_date: null,
      recent_avg_days_to_pay: 50, trend: 'stable',
      risk_tier: 'medium', last_sale_date: '2025-01-01', first_sale_date: '2024-06-01',
    })
    const portfolio = CustomerIntelligenceService.computePortfolioRisk([
      makeProfile('Cust1'), makeProfile('Cust2'), makeProfile('Cust3'),
    ])
    expect(portfolio.medium_risk_count).toBe(3)
    expect(portfolio.critical_count).toBe(0)
    expect(portfolio.high_risk_count).toBe(0)
    expect(portfolio.low_risk_count).toBe(0)
    expect(portfolio.total_customers).toBe(3)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 15. getProfile — single customer lookup
// ─────────────────────────────────────────────────────────────────────────────
describe('getProfile — single customer lookup', () => {
  it('returns null when no sales exist for the customer', async () => {
    const supabase = makeMockSupabase([])
    const profile = await CustomerIntelligenceService.getProfile('co_1', 'Acme Ltd', supabase)
    expect(profile).toBeNull()
  })

  it('returns a profile for a customer with sales', async () => {
    const supabase = makeMockSupabase([
      makeSale({
        customer_name: 'Acme Ltd',
        payment_status: 'paid',
        sale_date: '2025-01-01',
        paid_at: '2025-01-15',
        total_try: 3000,
        paid_amount: 3000,
      }),
    ])
    const profile = await CustomerIntelligenceService.getProfile('co_1', 'Acme Ltd', supabase)
    expect(profile).not.toBeNull()
    expect(profile!.customer_name).toBe('Acme Ltd')
    expect(profile!.total_sales).toBe(1)
    expect(profile!.total_revenue_try).toBe(3000)
  })

  it('correctly computes avg_days_to_pay for a single-customer query', async () => {
    const supabase = makeMockSupabase([
      makeSale({
        customer_name: 'Solo Corp',
        payment_status: 'paid',
        sale_date: '2025-02-01',
        paid_at: '2025-02-06',
        total_try: 1000,
        paid_amount: 1000,
      }),
    ])
    const profile = await CustomerIntelligenceService.getProfile('co_1', 'Solo Corp', supabase)
    expect(profile!.avg_days_to_pay).toBe(5)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 16. Multiple customers → correct grouping
// ─────────────────────────────────────────────────────────────────────────────
describe('getProfiles — multiple customers grouped correctly', () => {
  it('returns separate profiles per customer_name', async () => {
    const supabase = makeMockSupabase([
      makeSale({ customer_name: 'Alpha', total_try: 1000, paid_amount: 1000, payment_status: 'paid', sale_date: '2025-01-01', paid_at: '2025-01-10' }),
      makeSale({ customer_name: 'Beta',  total_try: 2000, paid_amount: 2000, payment_status: 'paid', sale_date: '2025-01-01', paid_at: '2025-01-20' }),
      makeSale({ customer_name: 'Alpha', total_try: 500,  paid_amount: 0,   payment_status: 'pending', sale_date: '2025-02-01' }),
    ])
    const profiles = await CustomerIntelligenceService.getProfiles('co_1', supabase)
    expect(profiles).toHaveLength(2)
    const alpha = profiles.find(p => p.customer_name === 'Alpha')!
    const beta  = profiles.find(p => p.customer_name === 'Beta')!
    expect(alpha.total_sales).toBe(2)
    expect(beta.total_sales).toBe(1)
    expect(beta.avg_days_to_pay).toBe(19)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 17. Null customer_name → grouped as 'Bilinmiyor'
// ─────────────────────────────────────────────────────────────────────────────
describe('getProfiles — null customer_name falls back to Bilinmiyor', () => {
  it('groups rows with null customer_name under "Bilinmiyor"', async () => {
    const supabase = makeMockSupabase([
      makeSale({ customer_name: null, total_try: 500, paid_amount: 0, payment_status: 'pending' }),
    ])
    const profiles = await CustomerIntelligenceService.getProfiles('co_1', supabase)
    expect(profiles).toHaveLength(1)
    expect(profiles[0].customer_name).toBe('Bilinmiyor')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 18. High risk tier: overdue_amount > 0 OR avg_days_overdue > 14
// ─────────────────────────────────────────────────────────────────────────────
describe('risk_tier — high', () => {
  it('assigns high when avg_days_overdue > 14 but <= 30 and no current overdue', async () => {
    // Paid 20 days after due_date → avg_days_overdue = 20
    const supabase = makeMockSupabase([
      makeSale({
        payment_status: 'paid',
        sale_date: '2025-01-01',
        due_date:  '2025-01-10',
        paid_at:   '2025-01-30',  // 20 days late
        total_try: 2000, paid_amount: 2000,
      }),
    ])
    const [profile] = await CustomerIntelligenceService.getProfiles('co_1', supabase)
    expect(profile.risk_tier).toBe('high')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 19. Medium risk tier: on_time_rate < 0.7
// ─────────────────────────────────────────────────────────────────────────────
describe('risk_tier — medium', () => {
  it('assigns medium when on_time_rate < 0.7 with no overdue amount', async () => {
    // All paid slightly late (after due_date) → on_time_rate = 0
    const supabase = makeMockSupabase([
      makeSale({ payment_status: 'paid', sale_date: '2025-01-01', due_date: '2025-01-15', paid_at: '2025-01-16', total_try: 500, paid_amount: 500 }),
      makeSale({ payment_status: 'paid', sale_date: '2025-02-01', due_date: '2025-02-15', paid_at: '2025-02-16', total_try: 500, paid_amount: 500 }),
    ])
    const [profile] = await CustomerIntelligenceService.getProfiles('co_1', supabase)
    expect(profile.on_time_rate).toBe(0)
    // avg_days_overdue = 1 (both paid 1 day late) → not > 14, no overdue amount
    // → medium because on_time_rate < 0.7
    expect(profile.risk_tier).toBe('medium')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 20. Trend stable: within ±5 days
// ─────────────────────────────────────────────────────────────────────────────
describe('trend — stable', () => {
  it('returns stable when recent avg differs from prior by 5 days or less', async () => {
    const today = '2025-04-01'
    // Prior: avg 10 days, Recent: avg 12 days → delta 2 → stable
    const sales: MockSaleRow[] = [
      makeSale({ payment_status: 'paid', sale_date: '2024-11-01', paid_at: '2024-11-11', total_try: 1000, paid_amount: 1000 }),
      makeSale({ payment_status: 'paid', sale_date: '2024-11-15', paid_at: '2024-11-25', total_try: 1000, paid_amount: 1000 }),
      makeSale({ payment_status: 'paid', sale_date: '2025-02-01', paid_at: '2025-02-13', total_try: 1000, paid_amount: 1000 }),
      makeSale({ payment_status: 'paid', sale_date: '2025-02-15', paid_at: '2025-02-26', total_try: 1000, paid_amount: 1000 }),
    ]
    const supabase = makeMockSupabase(sales)
    const [profile] = await CustomerIntelligenceService.getProfiles('co_1', supabase, { today })
    expect(profile.trend).toBe('stable')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 21. computePortfolioRisk — empty profiles
// ─────────────────────────────────────────────────────────────────────────────
describe('computePortfolioRisk — empty profiles', () => {
  it('returns total_customers = 0', () => {
    const p = CustomerIntelligenceService.computePortfolioRisk([])
    expect(p.total_customers).toBe(0)
  })

  it('returns all count fields as 0', () => {
    const p = CustomerIntelligenceService.computePortfolioRisk([])
    expect(p.critical_count).toBe(0)
    expect(p.high_risk_count).toBe(0)
    expect(p.medium_risk_count).toBe(0)
    expect(p.low_risk_count).toBe(0)
  })

  it('returns portfolio_on_time_rate = 0', () => {
    const p = CustomerIntelligenceService.computePortfolioRisk([])
    expect(p.portfolio_on_time_rate).toBe(0)
  })

  it('returns total_overdue_try = 0', () => {
    const p = CustomerIntelligenceService.computePortfolioRisk([])
    expect(p.total_overdue_try).toBe(0)
  })

  it('returns avg_days_to_pay_portfolio = null', () => {
    const p = CustomerIntelligenceService.computePortfolioRisk([])
    expect(p.avg_days_to_pay_portfolio).toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 22. computePortfolioRisk — all low-risk profiles
// ─────────────────────────────────────────────────────────────────────────────
describe('computePortfolioRisk — all low-risk profiles', () => {
  function makeLowProfile(name: string, avgDays: number): CustomerPaymentProfile {
    return {
      customer_name: name, total_sales: 2, total_revenue_try: 5000,
      total_paid_try: 5000, total_outstanding_try: 0,
      avg_days_to_pay: avgDays, avg_days_overdue: -3, on_time_rate: 1,
      overdue_sales_count: 0, overdue_amount_try: 0, last_overdue_date: null,
      recent_avg_days_to_pay: avgDays, trend: 'stable',
      risk_tier: 'low', last_sale_date: '2025-03-01', first_sale_date: '2024-01-01',
    }
  }

  it('low_risk_count equals total_customers', () => {
    const profiles = [makeLowProfile('A', 5), makeLowProfile('B', 10), makeLowProfile('C', 8)]
    const p = CustomerIntelligenceService.computePortfolioRisk(profiles)
    expect(p.low_risk_count).toBe(3)
    expect(p.critical_count).toBe(0)
    expect(p.high_risk_count).toBe(0)
    expect(p.medium_risk_count).toBe(0)
  })

  it('portfolio_on_time_rate = 1 when all on_time_rate = 1', () => {
    const profiles = [makeLowProfile('A', 5), makeLowProfile('B', 7)]
    const p = CustomerIntelligenceService.computePortfolioRisk(profiles)
    expect(p.portfolio_on_time_rate).toBeCloseTo(1)
  })

  it('total_overdue_try = 0 when all low-risk', () => {
    const profiles = [makeLowProfile('A', 5), makeLowProfile('B', 7)]
    const p = CustomerIntelligenceService.computePortfolioRisk(profiles)
    expect(p.total_overdue_try).toBe(0)
  })

  it('avg_days_to_pay_portfolio is average of individual avg_days_to_pay', () => {
    const profiles = [makeLowProfile('A', 10), makeLowProfile('B', 20)]
    const p = CustomerIntelligenceService.computePortfolioRisk(profiles)
    expect(p.avg_days_to_pay_portfolio).toBeCloseTo(15)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 23. computePortfolioRisk — all high-risk profiles
// ─────────────────────────────────────────────────────────────────────────────
describe('computePortfolioRisk — all high-risk profiles', () => {
  function makeHighProfile(name: string, overdue: number): CustomerPaymentProfile {
    return {
      customer_name: name, total_sales: 3, total_revenue_try: 8000,
      total_paid_try: 5000, total_outstanding_try: overdue,
      avg_days_to_pay: 20, avg_days_overdue: 20, on_time_rate: 0.5,
      overdue_sales_count: 1, overdue_amount_try: overdue, last_overdue_date: '2025-01-15',
      recent_avg_days_to_pay: 22, trend: 'deteriorating',
      risk_tier: 'high', last_sale_date: '2025-02-01', first_sale_date: '2024-06-01',
    }
  }

  it('high_risk_count equals total_customers when all high', () => {
    const profiles = [makeHighProfile('X', 1000), makeHighProfile('Y', 2000)]
    const p = CustomerIntelligenceService.computePortfolioRisk(profiles)
    expect(p.high_risk_count).toBe(2)
    expect(p.critical_count).toBe(0)
    expect(p.low_risk_count).toBe(0)
    expect(p.medium_risk_count).toBe(0)
  })

  it('total_overdue_try sums all overdue amounts', () => {
    const profiles = [makeHighProfile('X', 1000), makeHighProfile('Y', 2000), makeHighProfile('Z', 500)]
    const p = CustomerIntelligenceService.computePortfolioRisk(profiles)
    expect(p.total_overdue_try).toBe(3500)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 24. PortfolioRisk shape validation
// ─────────────────────────────────────────────────────────────────────────────
describe('computePortfolioRisk — PortfolioRisk shape validation', () => {
  it('returned object has risk_level-related fields', () => {
    const p = CustomerIntelligenceService.computePortfolioRisk([])
    expect(p).toHaveProperty('total_customers')
    expect(p).toHaveProperty('critical_count')
    expect(p).toHaveProperty('high_risk_count')
    expect(p).toHaveProperty('medium_risk_count')
    expect(p).toHaveProperty('low_risk_count')
  })

  it('returned object has avg_score-equivalent: avg_days_to_pay_portfolio', () => {
    const p = CustomerIntelligenceService.computePortfolioRisk([])
    expect(p).toHaveProperty('avg_days_to_pay_portfolio')
  })

  it('returned object has high_risk_count field', () => {
    const p = CustomerIntelligenceService.computePortfolioRisk([])
    expect(typeof p.high_risk_count).toBe('number')
  })

  it('all count fields are non-negative integers for any input', () => {
    const profiles: CustomerPaymentProfile[] = [
      {
        customer_name: 'T1', total_sales: 1, total_revenue_try: 1000,
        total_paid_try: 1000, total_outstanding_try: 0,
        avg_days_to_pay: 5, avg_days_overdue: null, on_time_rate: 1,
        overdue_sales_count: 0, overdue_amount_try: 0, last_overdue_date: null,
        recent_avg_days_to_pay: 5, trend: 'stable',
        risk_tier: 'low', last_sale_date: '2025-01-01', first_sale_date: '2025-01-01',
      },
    ]
    const p = CustomerIntelligenceService.computePortfolioRisk(profiles)
    expect(p.total_customers).toBeGreaterThanOrEqual(0)
    expect(p.critical_count).toBeGreaterThanOrEqual(0)
    expect(p.high_risk_count).toBeGreaterThanOrEqual(0)
    expect(p.medium_risk_count).toBeGreaterThanOrEqual(0)
    expect(p.low_risk_count).toBeGreaterThanOrEqual(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 25. computePortfolioRisk — risk level changes as high-risk count increases
// ─────────────────────────────────────────────────────────────────────────────
describe('computePortfolioRisk — risk level changes as high-risk count increases', () => {
  function makeProfile(tier: CustomerPaymentProfile['risk_tier']): CustomerPaymentProfile {
    return {
      customer_name: `cust-${tier}`, total_sales: 1, total_revenue_try: 1000,
      total_paid_try: 500, total_outstanding_try: 500,
      avg_days_to_pay: 30, avg_days_overdue: 10, on_time_rate: 0.5,
      overdue_sales_count: 1, overdue_amount_try: 500, last_overdue_date: '2025-01-01',
      recent_avg_days_to_pay: 30, trend: 'stable',
      risk_tier: tier, last_sale_date: '2025-01-01', first_sale_date: '2024-01-01',
    }
  }

  it('adding more critical profiles increases critical_count', () => {
    const p1 = CustomerIntelligenceService.computePortfolioRisk([makeProfile('critical')])
    const p2 = CustomerIntelligenceService.computePortfolioRisk([makeProfile('critical'), makeProfile('critical')])
    expect(p2.critical_count).toBeGreaterThan(p1.critical_count)
  })

  it('adding more high profiles increases high_risk_count', () => {
    const p1 = CustomerIntelligenceService.computePortfolioRisk([makeProfile('high')])
    const p2 = CustomerIntelligenceService.computePortfolioRisk([makeProfile('high'), makeProfile('high'), makeProfile('high')])
    expect(p2.high_risk_count).toBeGreaterThan(p1.high_risk_count)
  })

  it('count fields sum to total_customers', () => {
    const profiles = [
      makeProfile('critical'), makeProfile('high'), makeProfile('medium'),
      makeProfile('low'), makeProfile('low'),
    ]
    const p = CustomerIntelligenceService.computePortfolioRisk(profiles)
    const sum = p.critical_count + p.high_risk_count + p.medium_risk_count + p.low_risk_count
    expect(sum).toBe(p.total_customers)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 26. computePortfolioRisk — deterministic (same input = same output)
// ─────────────────────────────────────────────────────────────────────────────
describe('computePortfolioRisk — deterministic', () => {
  const profiles: CustomerPaymentProfile[] = [
    {
      customer_name: 'Alpha', total_sales: 5, total_revenue_try: 15000,
      total_paid_try: 12000, total_outstanding_try: 3000,
      avg_days_to_pay: 18, avg_days_overdue: 5, on_time_rate: 0.6,
      overdue_sales_count: 1, overdue_amount_try: 3000, last_overdue_date: '2025-01-10',
      recent_avg_days_to_pay: 20, trend: 'stable',
      risk_tier: 'high', last_sale_date: '2025-02-01', first_sale_date: '2024-01-01',
    },
    {
      customer_name: 'Beta', total_sales: 2, total_revenue_try: 5000,
      total_paid_try: 5000, total_outstanding_try: 0,
      avg_days_to_pay: 7, avg_days_overdue: null, on_time_rate: 1,
      overdue_sales_count: 0, overdue_amount_try: 0, last_overdue_date: null,
      recent_avg_days_to_pay: 7, trend: 'stable',
      risk_tier: 'low', last_sale_date: '2025-03-01', first_sale_date: '2024-06-01',
    },
  ]

  it('produces identical results for the same input on first call', () => {
    const p1 = CustomerIntelligenceService.computePortfolioRisk(profiles)
    const p2 = CustomerIntelligenceService.computePortfolioRisk(profiles)
    expect(p1.total_customers).toBe(p2.total_customers)
    expect(p1.high_risk_count).toBe(p2.high_risk_count)
    expect(p1.low_risk_count).toBe(p2.low_risk_count)
    expect(p1.total_overdue_try).toBe(p2.total_overdue_try)
    expect(p1.portfolio_on_time_rate).toBeCloseTo(p2.portfolio_on_time_rate)
  })

  it('produces the same avg_days_to_pay_portfolio on repeated calls', () => {
    const r1 = CustomerIntelligenceService.computePortfolioRisk(profiles)
    const r2 = CustomerIntelligenceService.computePortfolioRisk(profiles)
    expect(r1.avg_days_to_pay_portfolio).toBe(r2.avg_days_to_pay_portfolio)
  })
})
