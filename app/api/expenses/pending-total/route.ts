// GET /api/expenses/pending-total — unpaid expense total for operations context bar
//
// Returns: { total: number, count: number, overdue_count: number }

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth }            from '@/lib/api-auth'

export async function GET(req: NextRequest) {
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response
  const { companyId, supabase } = auth

  const today = new Date().toISOString().slice(0, 10)

  const { data, error } = await supabase
    .from('expenses')
    .select('amount_try, payment_status, due_date')
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .in('payment_status', ['unpaid', 'overdue'])

  if (error) {
    return NextResponse.json({ total: 0, count: 0, overdue_count: 0 })
  }

  const rows = data ?? []
  let total        = 0
  let overdueCount = 0

  for (const r of rows) {
    total += Number(r.amount_try ?? 0)
    const isOverdue = r.payment_status === 'overdue' ||
      (r.due_date != null && r.due_date < today && r.payment_status === 'unpaid')
    if (isOverdue) overdueCount++
  }

  return NextResponse.json({
    total:         Math.round(total),
    count:         rows.length,
    overdue_count: overdueCount,
  })
}
