// ── /api/commercial/concentration-risk ────────────────────────────────────────
// GET ?from=YYYY-MM-DD&to=YYYY-MM-DD
//
// Returns ConcentrationRiskReport — HHI + dominant customer flags.
// Access: any authenticated member.

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth } from '@/lib/api-auth'
import { apiError, reqCtx } from '@/lib/api-utils'
import { ConcentrationRiskService } from '@/lib/services/commercial/concentration-risk.service'

export async function GET(req: NextRequest) {
  const ctx  = reqCtx(req)
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response

  const { companyId, supabase } = auth
  const { searchParams }        = new URL(req.url)

  const now      = new Date()
  const thisYear = now.getFullYear()
  const from     = searchParams.get('from') ?? `${thisYear}-01-01`
  const to       = searchParams.get('to')   ?? now.toISOString().slice(0, 10)

  try {
    const report = await ConcentrationRiskService.getReport(
      companyId,
      supabase,
      { from, to },
    )
    return NextResponse.json(report)
  } catch (err) {
    console.error('[concentration-risk]', err)
    return apiError(ctx, 'Konsantrasyon riski hesaplanamadı', 500)
  }
}
