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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabaseClient = any

async function fetchSales(
  supabase:  AnySupabaseClient,
  companyId: string,
  periodId?: string | null,
): Promise<OperationalRecord[]> {
  let q = supabase
    .from('sales')
    .select('id, total_try')
    .eq('company_id', companyId)
    .is('deleted_at', null)

  if (periodId) q = q.eq('period_id', periodId)

  const { data } = await q
  return ((data ?? []) as Array<{ id: string; total_try: number | null }>).map(r => ({
    id:         r.id,
    amount_try: r.total_try ?? 0,
  }))
}

async function fetchExpenses(
  supabase:  AnySupabaseClient,
  companyId: string,
  periodId?: string | null,
): Promise<OperationalRecord[]> {
  let q = supabase
    .from('expenses')
    .select('id, amount_try')
    .eq('company_id', companyId)
    .is('deleted_at', null)

  if (periodId) q = q.eq('period_id', periodId)

  const { data } = await q
  return ((data ?? []) as Array<{ id: string; amount_try: number | null }>).map(r => ({
    id:         r.id,
    amount_try: r.amount_try ?? 0,
  }))
}

async function fetchPurchases(
  supabase:  AnySupabaseClient,
  companyId: string,
  periodId?: string | null,
): Promise<OperationalRecord[]> {
  let q = supabase
    .from('purchases')
    .select('id, total_try')
    .eq('company_id', companyId)
    .is('deleted_at', null)

  if (periodId) q = q.eq('period_id', periodId)

  const { data } = await q
  return ((data ?? []) as Array<{ id: string; total_try: number | null }>).map(r => ({
    id:         r.id,
    amount_try: r.total_try ?? 0,
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

    // Fetch operational records using the user-scoped client (respects RLS)
    const [sales, expenses, purchases, glMode] = await Promise.all([
      fetchSales(supabase, companyId, periodId),
      fetchExpenses(supabase, companyId, periodId),
      fetchPurchases(supabase, companyId, periodId),
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
