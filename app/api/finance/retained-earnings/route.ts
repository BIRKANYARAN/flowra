// ─────────────────────────────────────────────────────────────────────────────
// GET /api/finance/retained-earnings
//
// Retained Earnings Statement — equity roll-forward with TTK 519 legal reserve.
//
// Query params:
//   year   number   (optional, default: current year)
//
// Auth: any member.
// ─────────────────────────────────────────────────────────────────────────────

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth } from '@/lib/api-auth'
import { RetainedEarningsService } from '@/lib/services/finance/retained-earnings.service'
import { REQUEST_ID_HEADER } from '@/middleware'

export async function GET(req: NextRequest) {
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response
  const { uid, companyId, supabase, ctx } = auth

  const url  = new URL(req.url)
  const year = Math.min(2100, Math.max(2000, Number(url.searchParams.get('year') ?? new Date().getFullYear()) || new Date().getFullYear()))

  try {
    const statement = await RetainedEarningsService.getStatement(companyId, uid, supabase, year)
    return NextResponse.json(statement, { headers: { [REQUEST_ID_HEADER]: ctx.requestId } })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json(
      { error: msg, code: 'SERVICE_ERROR', type: 'SYSTEM' },
      { status: 500, headers: { [REQUEST_ID_HEADER]: ctx.requestId } },
    )
  }
}
