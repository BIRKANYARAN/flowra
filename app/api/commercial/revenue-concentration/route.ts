// ── /api/commercial/revenue-concentration ─────────────────────────────────────
// GET — Returns RevenueConcentrationReport: revenue concentration risk analysis.
// Access: manager+ only.

export const revalidate = 3600 // 1 hour

import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth } from '@/lib/api-auth'
import { apiError, reqCtx } from '@/lib/api-utils'
import { RevenueConcentrationService } from '@/lib/services/commercial/revenue-concentration.service'

export async function GET(req: NextRequest) {
  const ctx  = reqCtx(req)
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response

  const { companyId, supabase } = auth

  try {
    const service = new RevenueConcentrationService(supabase)
    const report  = await service.getReport(companyId)
    return NextResponse.json({ report })
  } catch (err) {
    console.error('[revenue-concentration]', err)
    return apiError(ctx, 'Gelir yoğunlaşma riski hesaplanamadı', 500)
  }
}
