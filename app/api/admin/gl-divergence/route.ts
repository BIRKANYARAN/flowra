// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/admin/gl-divergence?period_id=...
//
// TA.1 audit tool — finds operational records (sales, expenses, purchases) that
// have NO corresponding journal entry for the company.
//
// Role guard: requires 'admin' role.
//
// Query params:
//   period_id  (optional) — if provided, restricts operational records to that period
//
// Response: { gl_mode, summary, total_missing, total_missing_amount_try,
//             divergence_pct, checked_at }
// ═══════════════════════════════════════════════════════════════════════════════

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse }      from 'next/server'
import { requireAdmin }                   from '@/lib/require-role'
import { AppError }                       from '@/types/errors'
import { resolveApiAuth }                 from '@/lib/api-auth'
import { getSystemAdminClient }           from '@/lib/admin-db'
import { getGlMode }                      from '@/lib/middleware/period-guard'
import { computeDivergence }             from '@/lib/admin/gl-divergence'
import type { OperationalRecord, JournaledRef } from '@/lib/admin/gl-divergence'
import { purchaseTotalTry } from '@/lib/finance/purchase-total'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabaseClient = any

type DateRange = { from: string; to: string }

// sales/expenses/purchases have NO period_id column — period scoping is by date
// range (sale_date / expense_date / purchase_date within the period bounds).
async function resolvePeriodRange(
  supabase:  AnySupabaseClient,
  companyId: string,
  periodId:  string | null,
): Promise<DateRange | null> {
  if (!periodId) return null
  const { data } = await supabase
    .from('accounting_periods')
    .select('period_start, period_end')
    .eq('company_id', companyId)
    .eq('id', periodId)
    .maybeSingle()
  if (!data?.period_start || !data?.period_end) return null
  return { from: data.period_start as string, to: data.period_end as string }
}

async function fetchSales(
  supabase:  AnySupabaseClient,
  companyId: string,
  range:     DateRange | null,
): Promise<OperationalRecord[]> {
  let q = supabase
    .from('sales')
    .select('id, total_try')
    .eq('company_id', companyId)
    .is('deleted_at', null)

  if (range) q = q.gte('sale_date', range.from).lte('sale_date', range.to)

  const { data } = await q
  return ((data ?? []) as Array<{ id: string; total_try: number | null }>).map(r => ({
    id:         r.id,
    amount_try: r.total_try ?? 0,
  }))
}

async function fetchExpenses(
  supabase:  AnySupabaseClient,
  companyId: string,
  range:     DateRange | null,
): Promise<OperationalRecord[]> {
  let q = supabase
    .from('expenses')
    .select('id, amount_try')
    .eq('company_id', companyId)
    .is('deleted_at', null)

  if (range) q = q.gte('expense_date', range.from).lte('expense_date', range.to)

  const { data } = await q
  return ((data ?? []) as Array<{ id: string; amount_try: number | null }>).map(r => ({
    id:         r.id,
    amount_try: r.amount_try ?? 0,
  }))
}

async function fetchPurchases(
  supabase:  AnySupabaseClient,
  companyId: string,
  range:     DateRange | null,
): Promise<OperationalRecord[]> {
  let q = supabase
    .from('purchases')
    // no total column — compute from line items (fx_rate × Σ qty × unit_price)
    .select('id, fx_rate, purchase_items(quantity, unit_price)')
    .eq('company_id', companyId)
    .is('deleted_at', null)

  if (range) q = q.gte('purchase_date', range.from).lte('purchase_date', range.to)

  const { data } = await q
  return ((data ?? []) as Array<{ id: string; fx_rate: number | null; purchase_items: Array<{ quantity: number | null; unit_price: number | null }> | null }>).map(r => ({
    id:         r.id,
    amount_try: purchaseTotalTry(r),
  }))
}

async function fetchJournaledIds(
  adminClient: AnySupabaseClient,
  companyId:   string,
  periodId?:   string | null,
): Promise<JournaledRef[]> {
  let q = adminClient
    .from('journal_entries')
    .select('source_type, source_id')
    .eq('company_id', companyId)

  if (periodId) q = q.eq('period_id', periodId)

  const { data } = await q
  return (data ?? []) as JournaledRef[]
}

export async function GET(req: NextRequest) {
  try {
    const auth = await resolveApiAuth(req)
    if (!auth.ok) return auth.response
    const { uid, companyId, supabase } = auth

    try { await requireAdmin(uid, companyId, supabase) }
    catch (e) {
      if (e instanceof AppError && e.code === 'FORBIDDEN') {
        return NextResponse.json({ error: e.message, code: 'FORBIDDEN' }, { status: 403 })
      }
      throw e
    }

    const url      = new URL(req.url)
    const periodId = url.searchParams.get('period_id') || null

    // Resolve the period's date bounds once — operational tables have no period_id
    const range = await resolvePeriodRange(supabase, companyId, periodId)

    // Fetch operational records using the user-scoped client (respects RLS)
    const [sales, expenses, purchases, glMode] = await Promise.all([
      fetchSales(supabase, companyId, range),
      fetchExpenses(supabase, companyId, range),
      fetchPurchases(supabase, companyId, range),
      getGlMode(companyId, supabase),
    ])

    // Fetch journal entries using system-admin client (needs cross-RLS access)
    const adminClient  = getSystemAdminClient()
    const journaledIds = await fetchJournaledIds(adminClient, companyId, periodId)

    const summary = computeDivergence({ sales, expenses, purchases }, journaledIds)

    const totalRecords = summary.sales.total + summary.expenses.total + summary.purchases.total
    const totalMissing =
      summary.sales.missing + summary.expenses.missing + summary.purchases.missing
    const totalMissingAmountTry =
      summary.sales.missing_amount_try +
      summary.expenses.missing_amount_try +
      summary.purchases.missing_amount_try
    const divergencePct =
      totalRecords > 0 ? (totalMissing / totalRecords) * 100 : 0

    return NextResponse.json({
      gl_mode:                  glMode,
      summary,
      total_missing:            totalMissing,
      total_missing_amount_try: totalMissingAmountTry,
      divergence_pct:           Math.round(divergencePct * 100) / 100,
      checked_at:               new Date().toISOString(),
    })
  } catch (err) {
    console.error('[admin/gl-divergence GET]', err instanceof Error ? err.message : String(err))
    return NextResponse.json({ error: 'Sunucu hatası' }, { status: 500 })
  }
}
