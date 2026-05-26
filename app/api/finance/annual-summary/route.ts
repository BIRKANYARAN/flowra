// ─────────────────────────────────────────────────────────────────────────────
// GET /api/finance/annual-summary
//
// Year-over-year financial summary — last N years of key metrics.
// Auth: any member.
//
// Query params:
//   years   number   (optional, default 3)
// ─────────────────────────────────────────────────────────────────────────────

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth }             from '@/lib/api-auth'
import { AnnualSummaryService }       from '@/lib/services/finance/annual-summary.service'

export async function GET(req: NextRequest) {
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response
  const { uid, companyId, supabase } = auth

  const url       = new URL(req.url)
  const yearsBack = Math.min(10, Math.max(1, Number(url.searchParams.get('years') ?? '3') || 3))

  try {
    const summary = await AnnualSummaryService.getSummary(companyId, uid, supabase, { yearsBack })
    return NextResponse.json(summary)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
