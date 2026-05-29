// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/intelligence/alerts
//
// Configurable Alert Rules Engine — evaluates all financial/operational KPIs
// and returns prioritized alerts.
//
// Auth:  resolveApiAuth + company_members check, manager+
// Cache: revalidate: 300 (5 min)
// ═══════════════════════════════════════════════════════════════════════════════

export const dynamic    = 'force-dynamic'
export const revalidate = 300

import { NextRequest, NextResponse }  from 'next/server'
import { resolveApiAuth }             from '@/lib/api-auth'
import { reqCtx, apiError }           from '@/lib/api-utils'
import { AlertRulesService }          from '@/lib/services/intelligence/alert-rules.service'

export async function GET(req: NextRequest) {
  const ctx = reqCtx(req)
  try {
    const auth = await resolveApiAuth(req)
    if (!auth.ok) return auth.response

    const { companyId, supabase } = auth

    const service = new AlertRulesService(supabase)
    const result  = await service.getAlerts(companyId)

    return NextResponse.json(result)
  } catch (e) {
    console.error('[intelligence/alerts]', e)
    return apiError(ctx, 'Uyarı kuralları değerlendirilemedi', 500, 'DB_READ_FAILED')
  }
}
