// ─────────────────────────────────────────────────────────────────────────────
// GET /api/finance/retained-earnings?year=2025
//
// Retained Earnings Rollforward Statement — equity roll-forward with TTK 519.
//
// Query params:
//   year   number   (optional — omit for all-time view)
//
// Auth: resolveApiAuth — admin only (equity data is sensitive).
// Cache: revalidate 3600 seconds (1 hour).
// ─────────────────────────────────────────────────────────────────────────────

export const dynamic    = 'force-dynamic'
export const revalidate = 3600

import { NextRequest, NextResponse }          from 'next/server'
import { resolveApiAuth }                     from '@/lib/api-auth'
import { RetainedEarningsService }            from '@/lib/services/finance/retained-earnings.service'

export async function GET(req: NextRequest) {
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response
  const { companyId, supabase } = auth

  const url     = new URL(req.url)
  const rawYear = url.searchParams.get('year')
  const year    = rawYear
    ? Math.max(2000, Math.min(2100, Number(rawYear) || new Date().getFullYear()))
    : undefined

  try {
    const svc       = new RetainedEarningsService(supabase)
    const statement = await svc.getStatement(companyId, year)
    return NextResponse.json(statement)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json(
      { error: msg, code: 'SERVICE_ERROR', type: 'SYSTEM' },
      { status: 500 },
    )
  }
}
