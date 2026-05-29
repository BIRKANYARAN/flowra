// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/intelligence/financial-benchmarking
//
// Financial Benchmarking — Turkish SME percentile positioning report.
// Auth: resolveApiAuth, manager+
// Cache: revalidate: 3600
// ═══════════════════════════════════════════════════════════════════════════════

export const dynamic   = 'force-dynamic'
export const revalidate = 3600

import { NextRequest, NextResponse }          from 'next/server'
import { resolveApiAuth }                     from '@/lib/api-auth'
import { reqCtx, apiError }                   from '@/lib/api-utils'
import { FinancialBenchmarkingService }        from '@/lib/services/intelligence/financial-benchmarking.service'

export async function GET(req: NextRequest) {
  const ctx = reqCtx(req)
  try {
    const auth = await resolveApiAuth(req)
    if (!auth.ok) return auth.response

    const { companyId, supabase } = auth

    const service = new FinancialBenchmarkingService(supabase)
    const report  = await service.getReport(companyId)

    return NextResponse.json({ report })
  } catch (e) {
    console.error('[financial-benchmarking]', e)
    return apiError(ctx, 'Sektör kıyaslaması alınamadı', 500, 'DB_READ_FAILED')
  }
}
