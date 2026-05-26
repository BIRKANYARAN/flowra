// ── /api/commercial/supplier-analytics ────────────────────────────────────────
// GET — AP aging buckets, supplier payment profiles, concentration metrics
//
// Access: any authenticated user with a company (admin, manager, viewer)
// Cache:  5-minute revalidation (force-dynamic with Next.js fetch cache header)

export const dynamic = 'force-dynamic'
export const revalidate = 300

import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth } from '@/lib/api-auth'
import { apiError, reqCtx } from '@/lib/api-utils'
import { SupplierAnalyticsService } from '@/lib/services/commercial/supplier-analytics.service'

export async function GET(req: NextRequest) {
  const ctx = reqCtx(req)
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response

  const { companyId, supabase } = auth

  try {
    const report = await SupplierAnalyticsService.getReport(companyId, supabase)

    return NextResponse.json(
      { report, computed_at: new Date().toISOString() },
      { headers: { 'Cache-Control': 'private, max-age=300, stale-while-revalidate=60' } },
    )
  } catch (err) {
    console.error('[supplier-analytics]', err)
    return apiError(ctx, 'Tedarikçi analizi hesaplanamadı', 500)
  }
}
