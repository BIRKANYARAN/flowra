// ── /api/commercial/supplier-performance ──────────────────────────────────────
// GET — PO-based supplier performance: fulfillment rates, lead times, grades
//
// Access: any authenticated user with a company (admin, manager, viewer)
// Cache:  5-minute revalidation

export const dynamic = 'force-dynamic'
export const revalidate = 300

import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth } from '@/lib/api-auth'
import { apiError, reqCtx } from '@/lib/api-utils'
import { SupplierPerformanceService } from '@/lib/services/commercial/supplier-performance.service'

export async function GET(req: NextRequest) {
  const ctx = reqCtx(req)
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response

  const { companyId, supabase } = auth

  try {
    const report = await SupplierPerformanceService.getReport(companyId, supabase)

    return NextResponse.json(
      { report, computed_at: new Date().toISOString() },
      { headers: { 'Cache-Control': 'private, max-age=300, stale-while-revalidate=60' } },
    )
  } catch (err) {
    console.error('[supplier-performance]', err)
    // Gracefully handle table-not-found at route level too
    const msg = err instanceof Error ? err.message : String(err)
    if (
      msg.includes('does not exist') ||
      msg.includes('relation') ||
      msg.includes('42P01')
    ) {
      return NextResponse.json(
        {
          report: {
            suppliers: [],
            summary: {
              total_pos: 0,
              total_value_try: 0,
              pending_pos: 0,
              pending_value_try: 0,
              overdue_pos: 0,
              overdue_value_try: 0,
              received_this_month: 0,
              received_value_this_month_try: 0,
            },
            top_supplier_by_value: null,
            top_supplier_by_fulfillment: null,
            avg_portfolio_fulfillment_pct: null,
            as_of_date: new Date().toISOString().slice(0, 10),
          },
        },
        { status: 200 },
      )
    }
    return apiError(ctx, 'Tedarikçi performansı hesaplanamadı', 500)
  }
}
