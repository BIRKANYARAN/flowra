// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/intelligence/ops-command
//
// OPS Command Center — Daily Metrics Aggregator
// Returns today's operational metrics: sales, collections, expenses, stock.
//
// Auth: resolveApiAuth + company_members check, manager+
// Cache: revalidate: 60  (1 minute — real-time ops data)
// ═══════════════════════════════════════════════════════════════════════════════

export const dynamic    = 'force-dynamic'
export const revalidate = 60

import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth }            from '@/lib/api-auth'
import { reqCtx, apiError }          from '@/lib/api-utils'
import { OpsCommandService }         from '@/lib/services/intelligence/ops-command.service'

export async function GET(req: NextRequest) {
  const ctx = reqCtx(req)
  try {
    const auth = await resolveApiAuth(req)
    if (!auth.ok) return auth.response
    const { companyId, supabase } = auth

    const service = new OpsCommandService(supabase)
    const metrics = await service.getDailyMetrics(companyId)

    return NextResponse.json({ metrics })
  } catch (e) {
    console.error('[ops-command]', e)
    return apiError(ctx, 'Günlük operasyon metrikleri alınamadı', 500, 'DB_READ_FAILED')
  }
}
