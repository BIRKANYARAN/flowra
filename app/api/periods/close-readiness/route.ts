// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/periods/close-readiness?period_id=
//
// Returns enhanced period close readiness report with 16-point auto+manual checks.
// Auth: admin only (resolveApiAuth + company member implied).
// ═══════════════════════════════════════════════════════════════════════════════

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth }            from '@/lib/api-auth'
import { reqCtx, apiError }          from '@/lib/api-utils'
import { PeriodCloseEnhancedService } from '@/lib/services/ledger/period-close-enhanced.service'

export async function GET(req: NextRequest) {
  const ctx = reqCtx(req)
  try {
    const auth = await resolveApiAuth(req)
    if (!auth.ok) return auth.response
    const { uid, companyId, supabase } = auth

    const url      = new URL(req.url)
    const periodId = url.searchParams.get('period_id') ?? undefined

    const readiness = await PeriodCloseEnhancedService.getReadiness(
      companyId,
      uid,
      supabase,
      periodId,
    )

    return NextResponse.json(readiness)
  } catch (e) {
    console.error('[close-readiness]', e)
    return apiError(ctx, 'Dönem kapanış hazırlık raporu alınamadı', 500, 'DB_READ_FAILED')
  }
}
