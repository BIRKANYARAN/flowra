// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/intelligence/ops-heatmap
//
// Operational KPI Heatmap — 13-week × 7-day grid with daily revenue, orders,
// collections, expenses, and net cash flow patterns.
// Auth: any authenticated company member.
// Cached: 5 minutes (revalidate: 300).
// ═══════════════════════════════════════════════════════════════════════════════

export const dynamic    = 'force-dynamic'
export const revalidate = 300

import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth }            from '@/lib/api-auth'
import { reqCtx, apiError }          from '@/lib/api-utils'
import { OpsHeatmapService }         from '@/lib/services/intelligence/ops-heatmap.service'

export async function GET(req: NextRequest) {
  const ctx = reqCtx(req)
  try {
    const auth = await resolveApiAuth(req)
    if (!auth.ok) return auth.response
    const { companyId, supabase } = auth

    const report = await OpsHeatmapService.getReport(companyId, supabase)

    return NextResponse.json({ report })
  } catch (e) {
    console.error('[ops-heatmap]', e)
    return apiError(ctx, 'Operasyonel ısı haritası alınamadı', 500, 'DB_READ_FAILED')
  }
}
