import { NextRequest, NextResponse }   from 'next/server'
import {
  detectRevenueAnomalies,
  detectExpenseAnomalies,
  scoreCustomerRisk,
  type MonthlyRevenue,
  type MonthlyExpense,
  type CustomerPayment,
} from '@/lib/engines/anomaly.engine'
import { resolveApiAuth } from '@/lib/api-auth'

export const dynamic = 'force-dynamic'

// GET /api/insights/anomalies
//
// Returns revenue anomalies, expense anomalies, and customer risk scores
// for the trailing 6 months. All computations are statistical (no LLM).

export async function GET(req: NextRequest) {
  try {
    const auth = await resolveApiAuth(req)
    if (!auth.ok) return auth.response
    const { uid, companyId, supabase, ctx } = auth

    // Last 7 months of data (6 baseline + 1 current)
    const months: string[] = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date()
      d.setMonth(d.getMonth() - i)
      months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
    }
    const from = months[0] + '-01'
    const to   = new Date().toISOString().slice(0, 10)

    const [salesRes, expensesRes, customerPaymentsRes] = await Promise.allSettled([
      supabase.from('sales')
        .select('total_try, created_at')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .gte('created_at', from + 'T00:00:00Z')
        .lte('created_at', to   + 'T23:59:59Z'),
      supabase.from('expenses')
        .select('amount_try, expense_type, expense_date')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .gte('expense_date', from)
        .lte('expense_date', to),
      supabase.from('sales')
        .select('customer_name, created_at, paid_at, due_date, total_try, payment_status')
        .eq('company_id', companyId)
        .is('deleted_at', null),
    ])

    // ── Revenue: aggregate by month ────────────────────────────────────────
    const revByMonth: Record<string, number> = {}
    for (const m of months) revByMonth[m] = 0
    if (salesRes.status === 'fulfilled' && salesRes.value.data) {
      for (const s of salesRes.value.data) {
        const m = (s.created_at as string).slice(0, 7)
        revByMonth[m] = (revByMonth[m] ?? 0) + Number(s.total_try ?? 0)
      }
    }
    const monthlyRevenue: MonthlyRevenue[] = Object.entries(revByMonth)
      .map(([month, revenue]) => ({ month, revenue }))
      .sort((a, b) => a.month.localeCompare(b.month))

    // ── Expenses: aggregate by category × month ────────────────────────────
    const expMap: Record<string, Record<string, number>> = {}
    if (expensesRes.status === 'fulfilled' && expensesRes.value.data) {
      for (const e of expensesRes.value.data) {
        const m   = (e.expense_date as string).slice(0, 7)
        const cat = (e.expense_type as string) ?? 'general'
        if (!expMap[cat]) expMap[cat] = {}
        expMap[cat][m] = (expMap[cat][m] ?? 0) + Number(e.amount_try ?? 0)
      }
    }
    const monthlyExpenses: MonthlyExpense[] = []
    for (const [category, byMonth] of Object.entries(expMap)) {
      for (const [month, amount] of Object.entries(byMonth)) {
        monthlyExpenses.push({ month, category, amount })
      }
    }

    // ── Customer payments ──────────────────────────────────────────────────
    const customerPayments: CustomerPayment[] = []
    if (customerPaymentsRes.status === 'fulfilled' && customerPaymentsRes.value.data) {
      for (const s of customerPaymentsRes.value.data) {
        customerPayments.push({
          customer_name:  (s.customer_name as string) ?? 'Bilinmiyor',
          sale_date:      (s.created_at as string).slice(0, 10),
          paid_date:      s.paid_at as string | null,
          due_date:       s.due_date as string | null,
          total_try:      Number(s.total_try ?? 0),
          payment_status: s.payment_status as string,
        })
      }
    }

    // ── Compute anomalies ──────────────────────────────────────────────────
    const revenueAnomalies = detectRevenueAnomalies(monthlyRevenue)
    const expenseAnomalies = detectExpenseAnomalies(monthlyExpenses)
    const customerRisks    = scoreCustomerRisk(customerPayments)

    return NextResponse.json({
      revenue_anomalies: revenueAnomalies,
      expense_anomalies: expenseAnomalies,
      customer_risks:    customerRisks.slice(0, 10),   // top 10 risky customers
      months_analyzed:   months.length,
      from, to,
    })
  } catch (e) {
    console.error('[insights/anomalies]', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
