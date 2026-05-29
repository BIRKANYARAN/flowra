// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/intelligence/operational-efficiency
//
// Operational Efficiency Metrics — Turkish SME Benchmarking
// Returns KPIs: O2C cycle, expense efficiency, quote-to-order, revenue/employee
// plus productivity score, efficiency classification, and 6-month trend.
//
// Auth: resolveApiAuth + company_members check, manager+
// Cache: revalidate: 3600 (1 hour — strategic metrics, not real-time)
// ═══════════════════════════════════════════════════════════════════════════════

export const dynamic    = 'force-dynamic'
export const revalidate = 3600

import { NextRequest, NextResponse }            from 'next/server'
import { resolveApiAuth }                       from '@/lib/api-auth'
import { reqCtx, apiError }                     from '@/lib/api-utils'
import { OperationalEfficiencyService }         from '@/lib/services/intelligence/operational-efficiency.service'

export async function GET(req: NextRequest) {
  const ctx = reqCtx(req)
  try {
    const auth = await resolveApiAuth(req)
    if (!auth.ok) return auth.response
    const { companyId, supabase } = auth

    const service = new OperationalEfficiencyService(supabase)
    const report  = await service.getReport(companyId)

    return NextResponse.json({ report })
  } catch (e) {
    console.error('[operational-efficiency]', e)
    return apiError(ctx, 'Operasyonel verimlilik raporu alınamadı', 500, 'DB_READ_FAILED')
  }
}
