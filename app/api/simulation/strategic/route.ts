import { NextRequest, NextResponse }    from 'next/server'
import { computeMultiScenario }         from '@/lib/services/simulation-strategic.service'
import type { BaseExpenseLine, DebtTranche, StrategicScenarioInput } from '@/lib/services/simulation-strategic.service'
import { CORPORATE_TAX_RATE_TR }        from '@/lib/services/finance-rules'
import { resolveApiAuth } from '@/lib/api-auth'
import { round2 } from '@/lib/calc'
import { computeDebtPressureTimeline } from '@/lib/engines/forecast.engine'

export const dynamic = 'force-dynamic'

// POST /api/simulation/strategic
//
// Body:
//   scenario_name?:         string
//   revenue_model:          'uniform' | 'seasonal'
//   target_annual_revenue:  number
//   monthly_weights?:       number[12]
//   expense_overrides?:     { [category]: number }
//   monthly_compensation?:  number
//   period_months?:         number (default 12)
//   start_month?:           string YYYY-MM (default next month)
//   include_debt?:          boolean (default true — read partner loan tranches from DB)
//
// Returns: MultiScenarioResult

export async function POST(req: NextRequest) {
  try {
    const auth = await resolveApiAuth(req)
    if (!auth.ok) return auth.response
    const { companyId, supabase } = auth

    const body = await req.json()

    // ── Validate required fields ───────────────────────────────────────────
    const targetRevenue = Number(body.target_annual_revenue)
    if (!Number.isFinite(targetRevenue) || targetRevenue < 0) {
      return NextResponse.json({ error: 'target_annual_revenue geçersiz' }, { status: 400 })
    }

    const periodMonths = Math.min(24, Math.max(1, Number(body.period_months) || 12))
    const revenueModel = body.revenue_model === 'seasonal' ? 'seasonal' : 'uniform'

    // ── Next month as default start ────────────────────────────────────────
    const now = new Date()
    const nextMon = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))
    const defaultStart = `${nextMon.getUTCFullYear()}-${String(nextMon.getUTCMonth() + 1).padStart(2, '0')}`
    const startMonth = (typeof body.start_month === 'string' && /^\d{4}-\d{2}$/.test(body.start_month))
      ? body.start_month : defaultStart

    // ── Read base expenses from DB (3-month trailing average) ─────────────
    // Use a 3-month trailing window and divide by 3 for a stable monthly baseline.
    // Single-month snapshot is distorted by one-off capital expenses (e.g. a
    // ₺200K equipment purchase this month projects ₺200K/month for 12 months).
    // 3-month average dampens one-off items and captures seasonality.
    //
    // Capital and financing types are excluded — they are not recurring operational
    // commitments that belong in a forward-looking expense projection.
    const TRAILING_MONTHS = 3
    const trailStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (TRAILING_MONTHS - 1), 1))
    const from = trailStart.toISOString().slice(0, 10)
    const to   = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).toISOString().slice(0, 10)

    const NON_RECURRING_TYPES = new Set(['capital', 'partner_financing', 'loan_repayment', 'dividend', 'internal_transfer', 'principal', 'partner_loan'])

    // Only use paid expenses as baseline — unpaid/pending expenses haven't been
    // disbursed and should not be projected as ongoing commitments.
    const { data: expenseRows } = await supabase
      .from('expenses')
      .select('expense_type, amount_try')
      .eq('company_id', companyId)
      .eq('payment_status', 'paid')
      .is('deleted_at', null)
      .gte('expense_date', from)
      .lte('expense_date', to)

    // Aggregate by category for trailing average baseline
    const categoryMap: Record<string, number> = {}
    for (const row of expenseRows ?? []) {
      const cat = (row.expense_type as string) ?? 'general'
      if (NON_RECURRING_TYPES.has(cat)) continue  // exclude one-off / financing flows
      categoryMap[cat] = (categoryMap[cat] ?? 0) + Number(row.amount_try ?? 0)
    }

    // Divide by trailing window to get monthly average
    const baseExpenses: BaseExpenseLine[] = Object.entries(categoryMap).map(([category, total]) => ({
      category,
      amount_try: round2(total / TRAILING_MONTHS),
    }))

    // ── Read partner loan tranches for debt service ────────────────────────
    const tranches: DebtTranche[] = []
    if (body.include_debt !== false) {
      try {
        // Select outstanding_try (current remaining balance) — NOT amount_try (original principal).
        // Using amount_try overstates interest when a tranche has been partially repaid.
        // Example: ₺950K original, ₺300K already repaid → outstanding = ₺650K.
        // Interest should be ₺650K × rate, not ₺950K × rate.
        // The interest-accrual cron also uses outstanding_try for the same reason.
        const { data: trancheRows } = await supabase
          .from('partner_loan_tranches')
          .select('outstanding_try, amount_try, annual_interest_rate, status, due_date')
          .eq('company_id', companyId)
          .eq('status', 'active')

        for (const t of trancheRows ?? []) {
          // outstanding_try = current balance (may be null on older rows — fall back to amount_try)
          const outstanding    = Number((t.outstanding_try ?? t.amount_try) ?? 0)
          const originalAmt    = Number(t.amount_try ?? 0)
          // annual_interest_rate is a decimal (0.15 = 15%) — do NOT divide by 100 again
          const annualRate      = Number(t.annual_interest_rate ?? 0)
          const monthlyInterest = outstanding * annualRate / 12
          // Remaining months from due_date
          const remainingMonths = t.due_date
            ? Math.max(0, Math.ceil((new Date(t.due_date as string).getTime() - Date.now()) / (30 * 86_400_000)))
            : 0
          tranches.push({
            label:             `Ortak Borcu (${outstanding > 0 ? `₺${(outstanding / 1000).toFixed(0)}K bakiye` : originalAmt > 0 ? `₺${(originalAmt / 1000).toFixed(0)}K` : '?'})`,
            monthly_interest:  round2(monthlyInterest),
            monthly_repayment: remainingMonths > 0 ? round2(outstanding / remainingMonths) : 0,
            remaining_months:  remainingMonths,
          })
        }
      } catch (trancheErr) {
        // Non-fatal — partner_loan_tranches table may not exist yet (migration not applied)
        console.warn('[simulation/strategic] loan tranche fetch failed (non-fatal):', trancheErr instanceof Error ? trancheErr.message : String(trancheErr))
      }
    }

    // ── Assemble input ─────────────────────────────────────────────────────
    const input: StrategicScenarioInput = {
      scenario_name:         body.scenario_name ?? 'Stratejik Senaryo',
      revenue_model:         revenueModel,
      target_annual_revenue: targetRevenue,
      monthly_weights:       Array.isArray(body.monthly_weights) && body.monthly_weights.length === 12
                               ? body.monthly_weights : undefined,
      base_monthly_expenses: baseExpenses,
      expense_overrides:     body.expense_overrides ?? undefined,
      debt_tranches:         tranches,
      monthly_compensation:  Number(body.monthly_compensation ?? 0),
      period_months:         periodMonths,
      start_month:           startMonth,
      tax_rate:              CORPORATE_TAX_RATE_TR,
    }

    const result = computeMultiScenario(input)

    // ── Compute debt pressure timeline (based on base scenario) ───────────────
    const baseMonths = result.base.months
    const projectedMonthlyNetIncome = baseMonths.map(m => m.net_income)
    const monthlyDebtServiceArr = baseMonths.map(m => m.debt_service)
    const debt_pressure = computeDebtPressureTimeline({
      projectedMonthlyNetIncome,
      monthlyDebtService: monthlyDebtServiceArr,
      startMonth: input.start_month,
    })

    return NextResponse.json({ ...result, debt_pressure })
  } catch (e) {
    console.error('[simulation/strategic]', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
