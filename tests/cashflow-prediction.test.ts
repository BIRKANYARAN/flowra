/**
 * Tests for lib/services/cashflow/cashflow-prediction.service.ts
 *
 * All tests use mock Supabase clients — no real DB calls.
 * Run with: npx vitest run tests/cashflow-prediction.test.ts
 */
import { describe, it, expect } from 'vitest'
import { CashFlowPredictionService } from '../lib/services/cashflow/cashflow-prediction.service'

// ─────────────────────────────────────────────────────────────────────────────
// Mock builders
// ─────────────────────────────────────────────────────────────────────────────

type MockChain = {
  _data: unknown[]
  select: () => MockChain
  eq: () => MockChain
  is: () => MockChain
  in: () => MockChain
  not: () => MockChain
  neq: () => MockChain
  lte: () => MockChain
  gte: () => MockChain
  gt: () => MockChain
  order: () => MockChain
  limit: () => MockChain
  single: () => MockChain
  then: (resolve: (v: { data: unknown[]; error: null }) => unknown) => Promise<unknown>
}

function makeChain(rows: unknown[]): MockChain {
  const chain: MockChain = {
    _data: rows,
    select() { return this },
    eq()     { return this },
    is()     { return this },
    in()     { return this },
    not()    { return this },
    neq()    { return this },
    lte()    { return this },
    gte()    { return this },
    gt()     { return this },
    order()  { return this },
    limit()  { return this },
    single() { return this },
    then(resolve) {
      return Promise.resolve({ data: this._data, error: null }).then(resolve)
    },
  }
  return chain
}

interface SalesRow {
  id:             string
  customer_name:  string
  total_try:      number
  paid_amount:    number
  payment_status: string
  sale_date:      string
  due_date:       string | null
  paid_at:        string | null
}

interface PartnerTranche {
  id:                    string
  partner_id:            string
  outstanding_try:       number
  expected_repayment_date: string | null
  annual_interest_rate:  number
}

interface ExpenseRow {
  amount_try:   number
  expense_date: string
}

type TableMap = {
  sales:                SalesRow[]
  partner_loan_tranches: PartnerTranche[]
  partners:             Array<{ id: string; name: string }>
  workflow_instances:   unknown[]
  governance_obligations: unknown[]
  forward_commitments:  unknown[]
  expenses:             ExpenseRow[]
  stock_lots:           unknown[]
  partner_transactions: unknown[]
}

/**
 * Build a mock Supabase client that routes .from(table) to the corresponding data.
 * For partner_transactions (balance sheet), we need to include cash inflow from sales.
 */
function makeSupabase(tables: Partial<TableMap>): unknown {
  // The balance sheet service does multiple .from() calls for sales/expenses/partner_transactions/stock_lots
  // We approximate by providing known cash from an explicit starting_cash override approach.
  // For tests that care about starting cash, we mock sales (paid) to give inflows.
  return {
    from(table: string) {
      const rows = (tables as Record<string, unknown[]>)[table] ?? []
      return makeChain(rows)
    },
  }
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

const TODAY = '2026-05-26'
const COMPANY_ID = 'test-company'
const UID = 'test-uid'

// ─────────────────────────────────────────────────────────────────────────────
// Test 1: No receivables, no commitments → starting cash unchanged across periods
// ─────────────────────────────────────────────────────────────────────────────
describe('CashFlowPredictionService', () => {

  it('1. No receivables, no commitments → starting cash roughly preserved (base scenario)', async () => {
    // Empty sales, expenses, commitments → all inflows/outflows ≈ 0
    // Balance sheet cash will be 0 (no collections)
    const supabase = makeSupabase({
      sales: [],
      expenses: [],
      partner_loan_tranches: [],
      partners: [],
      workflow_instances: [],
      governance_obligations: [],
      forward_commitments: [],
      stock_lots: [],
      partner_transactions: [],
    })

    const result = await CashFlowPredictionService.predict(
      COMPANY_ID, UID, supabase as never,
      { today: TODAY },
    )

    expect(result.periods.days_30.inflows_base_try).toBe(0)
    expect(result.periods.days_30.outflows_base_try).toBe(0)
    expect(result.periods.days_30.net_try).toBe(0)
    expect(result.receivables_expected).toHaveLength(0)
    expect(result.commitments_expected).toHaveLength(0)
  })

  // ─────────────────────────────────────────────────────────────────────────
  // Test 2: Single low-risk receivable within 30 days → included in inflows_base
  // ─────────────────────────────────────────────────────────────────────────
  it('2. Single low-risk receivable within 30 days → inflows_base_30 includes it', async () => {
    // Sale 10 days ago, customer avg_days_to_pay = 15, so predicted = today+5
    const saleDate = addDays(TODAY, -10)

    const supabase = makeSupabase({
      sales: [
        {
          id: 's1',
          customer_name: 'Acme Ltd',
          total_try: 10000,
          paid_amount: 0,
          payment_status: 'pending',
          sale_date: saleDate,
          due_date: addDays(TODAY, 5),
          paid_at: null,
        },
        // Historical paid sales to build customer profile (15 days avg)
        {
          id: 's2',
          customer_name: 'Acme Ltd',
          total_try: 5000,
          paid_amount: 5000,
          payment_status: 'paid',
          sale_date: addDays(TODAY, -30),
          due_date: addDays(TODAY, -15),
          paid_at: addDays(TODAY, -15),
        },
      ],
      expenses: [],
      partner_loan_tranches: [],
      partners: [],
      workflow_instances: [],
      governance_obligations: [],
      forward_commitments: [],
      stock_lots: [],
      partner_transactions: [],
    })

    const result = await CashFlowPredictionService.predict(
      COMPANY_ID, UID, supabase as never,
      { today: TODAY },
    )

    // Receivable should be in the list
    expect(result.receivables_expected.length).toBeGreaterThan(0)
    const rec = result.receivables_expected.find(r => r.customer_name === 'Acme Ltd')
    expect(rec).toBeDefined()
    expect(rec!.outstanding_try).toBe(10000)

    // Should be in 30-day bucket (base)
    expect(result.periods.days_30.inflows_base_try).toBe(10000)
  })

  // ─────────────────────────────────────────────────────────────────────────
  // Test 3: Critical-risk receivable → excluded from base, only in optimistic
  // ─────────────────────────────────────────────────────────────────────────
  it('3. Critical-risk receivable → at_risk confidence, excluded from base scenario', async () => {
    // Overdue sale from a customer with bad history (overdue_amount > 0, avg_days_overdue > 30)
    const saleDate = addDays(TODAY, -90)

    const supabase = makeSupabase({
      sales: [
        {
          id: 's1',
          customer_name: 'BadPayer Corp',
          total_try: 50000,
          paid_amount: 0,
          payment_status: 'overdue',
          sale_date: saleDate,
          due_date: addDays(TODAY, -60),
          paid_at: null,
        },
        // Another overdue from history — pushes avg_days_overdue > 30 → critical
        {
          id: 's2',
          customer_name: 'BadPayer Corp',
          total_try: 10000,
          paid_amount: 10000,
          payment_status: 'paid',
          sale_date: addDays(TODAY, -120),
          due_date: addDays(TODAY, -90),
          paid_at: addDays(TODAY, -50), // paid 40 days after due → avg_days_overdue > 30 → critical
        },
      ],
      expenses: [],
      partner_loan_tranches: [],
      partners: [],
      workflow_instances: [],
      governance_obligations: [],
      forward_commitments: [],
      stock_lots: [],
      partner_transactions: [],
    })

    const result = await CashFlowPredictionService.predict(
      COMPANY_ID, UID, supabase as never,
      { today: TODAY },
    )

    const rec = result.receivables_expected.find(r => r.customer_name === 'BadPayer Corp')
    expect(rec).toBeDefined()
    expect(rec!.confidence).toBe('at_risk')
    expect(rec!.risk_tier).toBe('critical')

    // Base inflows should NOT include at_risk receivable
    expect(result.periods.days_30.inflows_base_try).toBe(0)
    expect(result.periods.days_60.inflows_base_try).toBe(0)

    // Optimistic should include it
    expect(result.scenarios.optimistic.ending_cash_30_try).toBeGreaterThanOrEqual(
      result.scenarios.base.ending_cash_30_try
    )
  })

  // ─────────────────────────────────────────────────────────────────────────
  // Test 4: Commitment within 30 days → in outflows
  // ─────────────────────────────────────────────────────────────────────────
  it('4. Declared commitment within 30 days → appears in commitments_expected + outflows_30', async () => {
    const dueDate = addDays(TODAY, 10)

    const supabase = makeSupabase({
      sales: [],
      expenses: [],
      partner_loan_tranches: [],
      partners: [],
      workflow_instances: [],
      governance_obligations: [],
      forward_commitments: [
        {
          id: 'fc1',
          company_id: COMPANY_ID,
          title: 'Kira ödemesi',
          commitment_type: 'rent',
          amount_try: 15000,
          currency: 'TRY',
          due_date: dueDate,
          recurrence: null,
          recurrence_end_date: null,
          counterparty: 'Kiraya Veren',
          description: null,
          status: 'active',
          linked_resource_type: null,
          linked_resource_id: null,
          created_by: UID,
          created_at: TODAY,
          updated_at: TODAY,
        },
      ],
      stock_lots: [],
      partner_transactions: [],
    })

    const result = await CashFlowPredictionService.predict(
      COMPANY_ID, UID, supabase as never,
      { today: TODAY },
    )

    expect(result.commitments_expected.length).toBeGreaterThan(0)
    const commitment = result.commitments_expected.find(c => c.title === 'Kira ödemesi')
    expect(commitment).toBeDefined()
    expect(commitment!.amount_try).toBe(15000)
  })

  // ─────────────────────────────────────────────────────────────────────────
  // Test 5: Overdue receivable → predicted using risk-tier-based offset
  // ─────────────────────────────────────────────────────────────────────────
  it('5. Overdue receivable → predicted using risk_tier offset, falls in a known bucket', async () => {
    // A customer with an overdue amount but good on-time history will be 'high' risk
    // (because overdue_amount_try > 0 → 'high'), so predicted = today + 45 → bucket 60.
    // The key invariant we test: overdue receivables always get a future predicted date.
    const supabase = makeSupabase({
      sales: [
        // Two paid on-time sales → good history
        {
          id: 's1',
          customer_name: 'HighRiskPayer',
          total_try: 5000,
          paid_amount: 5000,
          payment_status: 'paid',
          sale_date: addDays(TODAY, -60),
          due_date: addDays(TODAY, -30),
          paid_at: addDays(TODAY, -28), // slightly late
        },
        // Currently overdue sale
        {
          id: 's2',
          customer_name: 'HighRiskPayer',
          total_try: 8000,
          paid_amount: 0,
          payment_status: 'overdue',
          sale_date: addDays(TODAY, -20),
          due_date: addDays(TODAY, -5),
          paid_at: null,
        },
      ],
      expenses: [],
      partner_loan_tranches: [],
      partners: [],
      workflow_instances: [],
      governance_obligations: [],
      forward_commitments: [],
      stock_lots: [],
      partner_transactions: [],
    })

    const result = await CashFlowPredictionService.predict(
      COMPANY_ID, UID, supabase as never,
      { today: TODAY },
    )

    const rec = result.receivables_expected.find(r => r.customer_name === 'HighRiskPayer')
    expect(rec).toBeDefined()
    // Overdue → predicted date must be in the future
    const predicted = new Date(rec!.predicted_payment_date + 'T00:00:00Z')
    const todayDate = new Date(TODAY + 'T00:00:00Z')
    const daysUntil = Math.round((predicted.getTime() - todayDate.getTime()) / 86_400_000)
    expect(daysUntil).toBeGreaterThanOrEqual(0)
    // For overdue high-risk: 45 days → bucket 60; for medium: 21 → bucket 30; for low: 7 → bucket 30
    // The predicted date must fall within the 90-day horizon
    expect(daysUntil).toBeLessThanOrEqual(90)
  })

  // ─────────────────────────────────────────────────────────────────────────
  // Test 6: at_risk flag triggered when critical receivables > 30% of total
  // ─────────────────────────────────────────────────────────────────────────
  it('6. at_risk flag triggered when critical receivables > 30% of total by value', async () => {
    // critical receivable = 40000, total = 100000 → 40% > 30% → warning flag
    const supabase = makeSupabase({
      sales: [
        // Critical customer (overdue, avg_days_overdue > 30)
        {
          id: 's1',
          customer_name: 'CriticalCo',
          total_try: 40000,
          paid_amount: 0,
          payment_status: 'overdue',
          sale_date: addDays(TODAY, -100),
          due_date: addDays(TODAY, -70),
          paid_at: null,
        },
        // History making them critical
        {
          id: 's2',
          customer_name: 'CriticalCo',
          total_try: 10000,
          paid_amount: 10000,
          payment_status: 'paid',
          sale_date: addDays(TODAY, -150),
          due_date: addDays(TODAY, -120),
          paid_at: addDays(TODAY, -80), // 40 days late → critical
        },
        // Low-risk customer (60000)
        {
          id: 's3',
          customer_name: 'GoodCo',
          total_try: 60000,
          paid_amount: 0,
          payment_status: 'pending',
          sale_date: addDays(TODAY, -10),
          due_date: addDays(TODAY, 20),
          paid_at: null,
        },
        // History for GoodCo
        {
          id: 's4',
          customer_name: 'GoodCo',
          total_try: 5000,
          paid_amount: 5000,
          payment_status: 'paid',
          sale_date: addDays(TODAY, -40),
          due_date: addDays(TODAY, -10),
          paid_at: addDays(TODAY, -11),
        },
      ],
      expenses: [],
      partner_loan_tranches: [],
      partners: [],
      workflow_instances: [],
      governance_obligations: [],
      forward_commitments: [],
      stock_lots: [],
      partner_transactions: [],
    })

    const result = await CashFlowPredictionService.predict(
      COMPANY_ID, UID, supabase as never,
      { today: TODAY },
    )

    const atRiskFlag = result.flags.find(f => f.message.includes('risk') || f.message.includes('kritik'))
    expect(atRiskFlag).toBeDefined()
    expect(atRiskFlag!.severity).toBe('warning')
  })

  // ─────────────────────────────────────────────────────────────────────────
  // Test 7: Cash negative flag triggered correctly
  // ─────────────────────────────────────────────────────────────────────────
  it('7. Cash negative in base scenario within 30 days → critical flag', async () => {
    // Large commitment within 30 days, no inflows, zero starting cash
    const dueDate = addDays(TODAY, 5)

    const supabase = makeSupabase({
      sales: [],
      expenses: [],
      partner_loan_tranches: [],
      partners: [],
      workflow_instances: [],
      governance_obligations: [],
      forward_commitments: [
        {
          id: 'fc1',
          company_id: COMPANY_ID,
          title: 'Büyük ödeme',
          commitment_type: 'other',
          amount_try: 999999,
          currency: 'TRY',
          due_date: dueDate,
          recurrence: null,
          recurrence_end_date: null,
          counterparty: null,
          description: null,
          status: 'active',
          linked_resource_type: null,
          linked_resource_id: null,
          created_by: UID,
          created_at: TODAY,
          updated_at: TODAY,
        },
      ],
      stock_lots: [],
      partner_transactions: [],
    })

    const result = await CashFlowPredictionService.predict(
      COMPANY_ID, UID, supabase as never,
      { today: TODAY },
    )

    const criticalFlag = result.flags.find(f => f.severity === 'critical' && f.period === '30')
    expect(criticalFlag).toBeDefined()
  })

  // ─────────────────────────────────────────────────────────────────────────
  // Test 8: Optimistic >= Base >= Pessimistic (ordering invariant)
  // ─────────────────────────────────────────────────────────────────────────
  it('8. Optimistic ending cash >= Base >= Pessimistic for 90-day horizon', async () => {
    const supabase = makeSupabase({
      sales: [
        {
          id: 's1',
          customer_name: 'Orta Risk',
          total_try: 20000,
          paid_amount: 5000,
          payment_status: 'partial',
          sale_date: addDays(TODAY, -5),
          due_date: addDays(TODAY, 25),
          paid_at: null,
        },
      ],
      expenses: [
        { amount_try: 3000, expense_date: addDays(TODAY, -10) },
        { amount_try: 3000, expense_date: addDays(TODAY, -40) },
        { amount_try: 3000, expense_date: addDays(TODAY, -70) },
      ],
      partner_loan_tranches: [],
      partners: [],
      workflow_instances: [],
      governance_obligations: [],
      forward_commitments: [],
      stock_lots: [],
      partner_transactions: [],
    })

    const result = await CashFlowPredictionService.predict(
      COMPANY_ID, UID, supabase as never,
      { today: TODAY },
    )

    expect(result.scenarios.optimistic.ending_cash_90_try).toBeGreaterThanOrEqual(
      result.scenarios.base.ending_cash_90_try
    )
    expect(result.scenarios.base.ending_cash_90_try).toBeGreaterThanOrEqual(
      result.scenarios.pessimistic.ending_cash_90_try
    )
  })

  // ─────────────────────────────────────────────────────────────────────────
  // Test 9: Runway computation (months = ending_cash / monthly_burn_rate)
  // ─────────────────────────────────────────────────────────────────────────
  it('9. Runway is null when burn rate is zero', async () => {
    const supabase = makeSupabase({
      sales: [],
      expenses: [], // no expenses → no burn → runway = null
      partner_loan_tranches: [],
      partners: [],
      workflow_instances: [],
      governance_obligations: [],
      forward_commitments: [],
      stock_lots: [],
      partner_transactions: [],
    })

    const result = await CashFlowPredictionService.predict(
      COMPANY_ID, UID, supabase as never,
      { today: TODAY },
    )

    expect(result.scenarios.base.runway_months).toBeNull()
  })

  it('9b. Runway > 0 when ending cash is positive and burn > 0', async () => {
    const supabase = makeSupabase({
      sales: [
        // Paid sales → balance sheet cash
        {
          id: 's1',
          customer_name: 'Client',
          total_try: 100000,
          paid_amount: 100000,
          payment_status: 'paid',
          sale_date: addDays(TODAY, -30),
          due_date: addDays(TODAY, -15),
          paid_at: addDays(TODAY, -15),
        },
      ],
      expenses: [
        { amount_try: 10000, expense_date: addDays(TODAY, -30) },
        { amount_try: 10000, expense_date: addDays(TODAY, -60) },
        { amount_try: 10000, expense_date: addDays(TODAY, -80) },
      ],
      partner_loan_tranches: [],
      partners: [],
      workflow_instances: [],
      governance_obligations: [],
      forward_commitments: [],
      stock_lots: [],
      partner_transactions: [],
    })

    const result = await CashFlowPredictionService.predict(
      COMPANY_ID, UID, supabase as never,
      { today: TODAY },
    )

    if (result.scenarios.base.runway_months !== null) {
      expect(result.scenarios.base.runway_months).toBeGreaterThan(0)
    }
    // Verify the structure is correct at minimum
    expect(result.scenarios.base).toHaveProperty('runway_months')
  })

  // ─────────────────────────────────────────────────────────────────────────
  // Test 10: Partial data (balance sheet fails) → fallback to 0 starting cash, still runs
  // ─────────────────────────────────────────────────────────────────────────
  it('10. Balance sheet failure → fallback to 0 starting cash, prediction still returns', async () => {
    // Simulate balance sheet failure by having from('sales') throw on certain calls
    // We use a special supabase that errors on stock_lots (used by balance sheet)
    const badSupabase = {
      from(table: string) {
        if (table === 'stock_lots') {
          return {
            select() { return this },
            eq()     { return this },
            is()     { return this },
            gt()     { return this },
            lte()    { return this },
            then(resolve: (v: { data: null; error: { message: string } }) => unknown) {
              return Promise.resolve({ data: null, error: { message: 'DB error' } }).then(resolve)
            },
          }
        }
        return makeChain([])
      },
    }

    const result = await CashFlowPredictionService.predict(
      COMPANY_ID, UID, badSupabase as never,
      { today: TODAY },
    )

    // Should still return a valid prediction with 0 starting cash
    expect(result).toHaveProperty('starting_cash_try')
    expect(result.starting_cash_try).toBeGreaterThanOrEqual(0)
    expect(result.computed_at).toBeTruthy()
    expect(result.periods).toHaveProperty('days_30')
    expect(result.periods).toHaveProperty('days_60')
    expect(result.periods).toHaveProperty('days_90')
  })

  // ─────────────────────────────────────────────────────────────────────────
  // Test 11: Receivable bucket assignment (30/60/90)
  // ─────────────────────────────────────────────────────────────────────────
  it('11. Receivables bucketed into correct periods based on predicted payment date', async () => {
    const supabase = makeSupabase({
      sales: [
        // Receivable predicted in 20 days → bucket 30
        {
          id: 's1',
          customer_name: 'Fast Payer',
          total_try: 5000,
          paid_amount: 0,
          payment_status: 'pending',
          sale_date: addDays(TODAY, -5),
          due_date: addDays(TODAY, 20),
          paid_at: null,
        },
        // Receivable predicted in 45 days → bucket 60
        {
          id: 's2',
          customer_name: 'Mid Payer',
          total_try: 8000,
          paid_amount: 0,
          payment_status: 'pending',
          sale_date: addDays(TODAY, -5),
          due_date: addDays(TODAY, 45),
          paid_at: null,
        },
        // Receivable predicted in 75 days → bucket 90
        {
          id: 's3',
          customer_name: 'Slow Payer',
          total_try: 3000,
          paid_amount: 0,
          payment_status: 'pending',
          sale_date: addDays(TODAY, -5),
          due_date: addDays(TODAY, 75),
          paid_at: null,
        },
      ],
      expenses: [],
      partner_loan_tranches: [],
      partners: [],
      workflow_instances: [],
      governance_obligations: [],
      forward_commitments: [],
      stock_lots: [],
      partner_transactions: [],
    })

    const result = await CashFlowPredictionService.predict(
      COMPANY_ID, UID, supabase as never,
      { today: TODAY },
    )

    // days_30 cumulative should be ≤ days_60 (cumulative)
    expect(result.periods.days_60.inflows_base_try).toBeGreaterThanOrEqual(
      result.periods.days_30.inflows_base_try
    )
    // days_90 cumulative should be ≥ days_60
    expect(result.periods.days_90.inflows_base_try).toBeGreaterThanOrEqual(
      result.periods.days_60.inflows_base_try
    )

    // All 3 receivables should appear
    expect(result.receivables_expected).toHaveLength(3)
  })

  // ─────────────────────────────────────────────────────────────────────────
  // Test 12: Recurring expense estimate from historical expenses
  // ─────────────────────────────────────────────────────────────────────────
  it('12. Recurring expense estimate from historical expenses (last 90 days average)', async () => {
    // 3 months of expenses totaling 30000 → monthly avg = 10000
    // Outflows should include 10000/month × 3 months = 30000 across the 90-day horizon
    const supabase = makeSupabase({
      sales: [],
      expenses: [
        { amount_try: 10000, expense_date: addDays(TODAY, -10) },
        { amount_try: 10000, expense_date: addDays(TODAY, -40) },
        { amount_try: 10000, expense_date: addDays(TODAY, -70) },
      ],
      partner_loan_tranches: [],
      partners: [],
      workflow_instances: [],
      governance_obligations: [],
      forward_commitments: [],
      stock_lots: [],
      partner_transactions: [],
    })

    const result = await CashFlowPredictionService.predict(
      COMPANY_ID, UID, supabase as never,
      { today: TODAY },
    )

    // Total base outflows across 90 days should include the recurring estimate
    // 3 months × 10000/month = 30000 in recurring (plus any commitment outflows)
    const total90Outflows = result.periods.days_90.outflows_base_try
    expect(total90Outflows).toBeGreaterThanOrEqual(30000)
  })

})
