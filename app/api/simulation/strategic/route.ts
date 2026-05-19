import { NextRequest, NextResponse }    from 'next/server'
import { computeMultiScenario }         from '@/lib/services/simulation-strategic.service'
import type { BaseExpenseLine, DebtTranche, StrategicScenarioInput } from '@/lib/services/simulation-strategic.service'
import { CORPORATE_TAX_RATE_TR }        from '@/lib/services/finance-rules'
import { resolveApiAuth } from '@/lib/api-auth'
import { round2 } from '@/lib/calc'

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

    // ── Read base expenses from DB (categorized monthly recurring) ─────────
    const from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
    const to   = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10)

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

    // Aggregate by category for current month baseline
    const categoryMap: Record<string, number> = {}
    for (const row of expenseRows ?? []) {
      const cat = (row.expense_type as string) ?? 'general'
      categoryMap[cat] = (categoryMap[cat] ?? 0) + Number(row.amount_try ?? 0)
    }

    const baseExpenses: BaseExpenseLine[] = Object.entries(categoryMap).map(([category, amount_try]) => ({
      category,
      amount_try,
    }))

    // ── Read partner loan tranches for debt service ────────────────────────
    const tranches: DebtTranche[] = []
    if (body.include_debt !== false) {
      try {
        const { data: trancheRows } = await supabase
          .from('partner_loan_tranches')
          .select('amount_try, annual_interest_rate, status, due_date')
          .eq('company_id', companyId)
          .eq('status', 'active')

        for (const t of trancheRows ?? []) {
          const principal      = Number(t.amount_try ?? 0)
          // annual_interest_rate is a decimal (0.15 = 15%) — do NOT divide by 100 again
          const annualRate      = Number(t.annual_interest_rate ?? 0)
          const monthlyInterest = principal * annualRate / 12
          // Remaining months from due_date
          const remainingMonths = t.due_date
            ? Math.max(0, Math.ceil((new Date(t.due_date as string).getTime() - Date.now()) / (30 * 86_400_000)))
            : 0
          tranches.push({
            label:             `Ortak Borcu (${principal > 0 ? `₺${(principal / 1000).toFixed(0)}K` : '?'})`,
            monthly_interest:  round2(monthlyInterest),
            monthly_repayment: remainingMonths > 0 ? round2(principal / remainingMonths) : 0,
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

    return NextResponse.json(result)
  } catch (e) {
    console.error('[simulation/strategic]', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
