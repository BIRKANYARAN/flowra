// GET /api/proformas/summary — lightweight proforma counts for context bars
//
// Returns:
//   { open_count, pending_value_try, by_status: { draft, sent, accepted, converted, rejected } }

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth }            from '@/lib/api-auth'

export async function GET(req: NextRequest) {
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response
  const { companyId, supabase } = auth

  const { data, error } = await supabase
    .from('proformas')
    .select('status, total, currency, fx_try')
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .in('status', ['draft', 'sent', 'accepted'])

  if (error) {
    return NextResponse.json({ open_count: 0, pending_value_try: 0, by_status: {} }, { status: 200 })
  }

  const rows = data ?? []
  const byStatus: Record<string, number> = {}
  let pendingValueTry = 0

  for (const r of rows) {
    const s = r.status ?? 'draft'
    byStatus[s] = (byStatus[s] ?? 0) + 1
    if (s === 'sent' || s === 'accepted') {
      const total  = Number(r.total  ?? 0)
      const fxTry  = Number(r.fx_try ?? 0)
      pendingValueTry += r.currency === 'TRY' ? total : total * (fxTry || 1)
    }
  }

  return NextResponse.json({
    open_count:        rows.length,
    pending_value_try: Math.round(pendingValueTry),
    by_status:         byStatus,
  })
}
