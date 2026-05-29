// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/intelligence/kpi-thresholds
//
// KPI Alert Thresholds Evaluation — returns a full threshold evaluation report
// for the authenticated company.
//
// Auth: manager+ role required.
// Cached: 300s revalidate.
//
// Returns: { report: KpiThresholdEvaluationReport }
// ═══════════════════════════════════════════════════════════════════════════════

export const dynamic    = 'force-dynamic'
export const revalidate = 300

import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth }            from '@/lib/api-auth'
import { reqCtx, apiError }          from '@/lib/api-utils'
import { KpiThresholdService }       from '@/lib/services/intelligence/kpi-threshold.service'

export async function GET(req: NextRequest) {
  const ctx = reqCtx(req)

  // ── Auth ───────────────────────────────────────────────────────────────────
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response

  const { companyId, supabase } = auth

  // ── Evaluate ───────────────────────────────────────────────────────────────
  try {
    const service = new KpiThresholdService(supabase)
    const report  = await service.evaluate(companyId)

    return NextResponse.json({ report })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'KPI eşik değerlendirmesi başarısız'
    return apiError(ctx, message, 500)
  }
}
