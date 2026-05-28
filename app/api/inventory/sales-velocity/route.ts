// ─────────────────────────────────────────────────────────────────────────────
// GET /api/inventory/sales-velocity?days=90
//
// Product Sales Velocity & Reorder Intelligence API.
// Returns per-product velocity, stock-out predictions, safety stock, and
// reorder recommendations.
//
// Auth:  resolveApiAuth + company_members check, manager+ role required
// Cache: revalidate: 300 (5 min — operational data)
// ─────────────────────────────────────────────────────────────────────────────

export const revalidate = 300

import { NextRequest, NextResponse }    from 'next/server'
import { resolveApiAuth }               from '@/lib/api-auth'
import { requireRole }                  from '@/lib/require-role'
import { SalesVelocityService }         from '@/lib/services/inventory/sales-velocity.service'
import { REQUEST_ID_HEADER }            from '@/middleware'
import { AppError }                     from '@/types/errors'

export async function GET(req: NextRequest) {
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response
  const { uid, companyId, supabase, ctx } = auth

  // Require manager or above
  try {
    await requireRole(uid, companyId, 'manager', supabase)
  } catch (err) {
    if (err instanceof AppError && err.code === 'FORBIDDEN') {
      return NextResponse.json(
        { error: err.message, code: 'FORBIDDEN', type: 'SECURITY' },
        { status: 403, headers: { [REQUEST_ID_HEADER]: ctx.requestId } },
      )
    }
    throw err
  }

  const daysParam = req.nextUrl.searchParams.get('days')
  const days      = daysParam ? Math.max(1, Math.min(365, parseInt(daysParam, 10))) : 90

  try {
    const service = new SalesVelocityService(supabase)
    const report  = await service.getReport(companyId, days)
    return NextResponse.json(
      { report },
      { headers: { [REQUEST_ID_HEADER]: ctx.requestId } },
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json(
      { error: msg, code: 'SERVICE_ERROR', type: 'SYSTEM' },
      { status: 500, headers: { [REQUEST_ID_HEADER]: ctx.requestId } },
    )
  }
}
