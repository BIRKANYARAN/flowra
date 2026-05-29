// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/intelligence/executive-summary
//
// Executive Summary Report Aggregator — unified CEO one-stop report.
// Pulls from Finance, Commercial, Operations, and Partners.
//
// Auth:  resolveApiAuth + company_members check, manager+
// Cache: revalidate: 300 (5 min)
// ═══════════════════════════════════════════════════════════════════════════════

export const dynamic    = 'force-dynamic'
export const revalidate = 300

import { NextRequest, NextResponse }      from 'next/server'
import { resolveApiAuth }                 from '@/lib/api-auth'
import { reqCtx, apiError }               from '@/lib/api-utils'
import { ExecutiveSummaryService }        from '@/lib/services/intelligence/executive-summary.service'

export async function GET(req: NextRequest) {
  const ctx = reqCtx(req)
  try {
    const auth = await resolveApiAuth(req)
    if (!auth.ok) return auth.response

    const { companyId, supabase } = auth

    const service = new ExecutiveSummaryService(supabase)
    const report  = await service.getReport(companyId)

    return NextResponse.json({ report })
  } catch (e) {
    console.error('[intelligence/executive-summary]', e)
    return apiError(ctx, 'Yönetici özet raporu alınamadı', 500, 'DB_READ_FAILED')
  }
}
