// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/partners/capital-calls  — TTK 588 capital commitment report
//
// Response: CapitalCallReport
// Auth: any member
// ═══════════════════════════════════════════════════════════════════════════════

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth } from '@/lib/api-auth'
import { reqCtx, apiError } from '@/lib/api-utils'
import { CapitalCallService, DEFAULT_TTK588_RATE } from '@/lib/services/pcle/capital-call.service'

export async function GET(req: NextRequest) {
  const ctx  = reqCtx(req)
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response
  const { companyId, supabase } = auth

  try {
    const { searchParams } = new URL(req.url)
    const rateParam = searchParams.get('rate')
    const ttk588Rate = rateParam ? Math.max(0, parseFloat(rateParam) || DEFAULT_TTK588_RATE) : DEFAULT_TTK588_RATE

    const report = await CapitalCallService.getReport(companyId, supabase, { ttk588Rate })
    return NextResponse.json(report)
  } catch (err) {
    console.error('[capital-calls GET]', err)
    return apiError(ctx, 'Sermaye taahhüt raporu alınamadı', 500)
  }
}
