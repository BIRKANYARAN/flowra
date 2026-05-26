// ─────────────────────────────────────────────────────────────────────────────
// GET /api/finance/fx-exposure
//
// FX exposure report — unrealized gain/loss on non-TRY receivables and payables.
// Auth: any member.
// ─────────────────────────────────────────────────────────────────────────────

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth }             from '@/lib/api-auth'
import { FxExposureService }          from '@/lib/services/finance/fx-exposure.service'

export async function GET(req: NextRequest) {
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response
  const { companyId, supabase } = auth

  try {
    const report = await FxExposureService.getReport(companyId, supabase)
    return NextResponse.json(report)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
