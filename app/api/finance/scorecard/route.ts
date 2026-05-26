// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/finance/scorecard
//
// Returns a Financial Health Scorecard with 10 standard financial ratios,
// grades, and category breakdowns for board-level reporting.
//
// Query params (optional):
//   from   YYYY-MM-DD  (default: first day of current month)
//   to     YYYY-MM-DD  (default: today)
//
// Auth: any authenticated company member.
// ═══════════════════════════════════════════════════════════════════════════════

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth } from '@/lib/api-auth'
import { HealthScorecardService } from '@/lib/services/finance/health-scorecard.service'
import { REQUEST_ID_HEADER } from '@/middleware'
import { toErrorResponse } from '@/types/errors'

function parseDate(s: string | null): string | null {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null
  return s
}

function defaultPeriod(): { from: string; to: string } {
  const today = new Date().toISOString().slice(0, 10)
  const from  = today.slice(0, 7) + '-01'
  return { from, to: today }
}

export async function GET(req: NextRequest) {
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response
  const { uid, companyId, supabase, ctx } = auth

  try {
    const url      = new URL(req.url)
    const raw_from = parseDate(url.searchParams.get('from'))
    const raw_to   = parseDate(url.searchParams.get('to'))

    const defaults = defaultPeriod()
    const from = raw_from ?? defaults.from
    const to   = raw_to   ?? defaults.to

    if (from > to) {
      return NextResponse.json(
        { error: '"from" tarihi "to" tarihinden önce olmalı', code: 'VALIDATION_ERROR', type: 'BUSINESS' },
        { status: 422, headers: { [REQUEST_ID_HEADER]: ctx.requestId } },
      )
    }

    const scorecard = await HealthScorecardService.getScorecard(
      companyId,
      uid,
      supabase,
      { from, to },
    )

    return NextResponse.json(scorecard, { headers: { [REQUEST_ID_HEADER]: ctx.requestId } })

  } catch (err) {
    const { body, status } = toErrorResponse(err)
    return NextResponse.json(body, { status, headers: { [REQUEST_ID_HEADER]: ctx.requestId } })
  }
}
