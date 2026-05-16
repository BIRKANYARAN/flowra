// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/analytics/receivable-aging
//
// Returns outstanding receivables bucketed by invoice age.
//
// CASH-BASIS RULE: Only unpaid/partial/overdue sales are counted.
//   payment_status = 'paid' → cash already received, excluded from receivables.
//   payment_status = 'partial' → full total_try treated as receivable (no amount_paid column).
//
// Age = days since created_at (invoice date) to today (UTC).
//
// Buckets:
//   current    — 0–30 days   : normal collection cycle
//   aged_30_60 — 31–60 days  : follow-up needed
//   aged_60_plus — 61+ days  : high risk / potential bad debt
//
// Validation formula:
//   total.total_try = current.total_try + aged_30_60.total_try + aged_60_plus.total_try
//   total.count     = current.count     + aged_30_60.count     + aged_60_plus.count
//
// Response: ReceivableAging
// ═══════════════════════════════════════════════════════════════════════════════

export const dynamic = 'force-dynamic'

import { NextResponse }     from 'next/server'
import { createClient }     from '@/lib/supabase-server'
import { resolveCompanyId } from '@/lib/resolve-company'
import type { ReceivableAging } from '@/types'

export async function GET() {
  const supabase = createClient()
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData?.user) {
    return NextResponse.json(
      { error: 'Unauthorized', code: 'UNAUTHORIZED', type: 'SECURITY' },
      { status: 401 },
    )
  }

  let companyId: string
  try { companyId = await resolveCompanyId(authData.user.id, supabase) }
  catch { return NextResponse.json({ error: 'Şirket bilgisi alınamadı', code: 'COMPANY_NOT_RESOLVED' }, { status: 409 }) }

  // Fetch all outstanding receivables (no date filter — want full aging picture)
  const { data, error } = await supabase
    .from('sales')
    .select('total_try, created_at')
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .in('payment_status', ['pending', 'partial', 'overdue'])

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // ── Bucket computation ─────────────────────────────────────────────────────
  //
  // ageDays = floor((now_ms - created_at_ms) / 86_400_000)
  //
  // current    : ageDays in [0, 30]    → 0–30 calendar days old
  // aged_30_60 : ageDays in [31, 60]   → 31–60 calendar days old
  // aged_60_plus: ageDays >= 61        → 61+ calendar days old
  //
  const nowMs = Date.now()

  const result: ReceivableAging = {
    current:      { count: 0, total_try: 0 },
    aged_30_60:   { count: 0, total_try: 0 },
    aged_60_plus: { count: 0, total_try: 0 },
    total:        { count: 0, total_try: 0 },
    computed_at:  new Date().toISOString(),
  }

  for (const row of data ?? []) {
    const amtTry  = Number(row.total_try  ?? 0)
    const createdMs = new Date(row.created_at as string).getTime()
    const ageDays   = Math.floor((nowMs - createdMs) / 86_400_000)

    result.total.count     += 1
    result.total.total_try += amtTry

    if (ageDays <= 30) {
      result.current.count     += 1
      result.current.total_try += amtTry
    } else if (ageDays <= 60) {
      result.aged_30_60.count     += 1
      result.aged_30_60.total_try += amtTry
    } else {
      result.aged_60_plus.count     += 1
      result.aged_60_plus.total_try += amtTry
    }
  }

  // Round to 2 decimal places
  result.current.total_try      = Math.round(result.current.total_try      * 100) / 100
  result.aged_30_60.total_try   = Math.round(result.aged_30_60.total_try   * 100) / 100
  result.aged_60_plus.total_try = Math.round(result.aged_60_plus.total_try * 100) / 100
  result.total.total_try        = Math.round(result.total.total_try        * 100) / 100

  return NextResponse.json(result)
}
