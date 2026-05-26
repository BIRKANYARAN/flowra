// ─────────────────────────────────────────────────────────────────────────────
// GET /api/finance/breakeven
//
// Break-Even Analysis — fixed/variable cost split, contribution margin,
// margin of safety, target profit scenario.
//
// Query params:
//   from   YYYY-MM-DD  (default: first day of current year)
//   to     YYYY-MM-DD  (default: today)
//
// Auth: any member.
// ─────────────────────────────────────────────────────────────────────────────

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth } from '@/lib/api-auth'
import { BreakEvenService } from '@/lib/services/finance/breakeven.service'
import { REQUEST_ID_HEADER } from '@/middleware'

function parseDate(s: string | null): string | null {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null
  return s
}

export async function GET(req: NextRequest) {
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response
  const { uid, companyId, supabase, ctx } = auth

  const url   = new URL(req.url)
  const today = new Date().toISOString().slice(0, 10)
  const from  = parseDate(url.searchParams.get('from')) ?? (today.slice(0, 4) + '-01-01')
  const to    = parseDate(url.searchParams.get('to'))   ?? today

  if (from > to) {
    return NextResponse.json(
      { error: '"from" tarihi "to" tarihinden önce olmalı', code: 'VALIDATION_ERROR', type: 'BUSINESS' },
      { status: 422, headers: { [REQUEST_ID_HEADER]: ctx.requestId } },
    )
  }

  try {
    const analysis = await BreakEvenService.getAnalysis(companyId, uid, supabase, { from, to })
    return NextResponse.json(analysis, { headers: { [REQUEST_ID_HEADER]: ctx.requestId } })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json(
      { error: msg, code: 'SERVICE_ERROR', type: 'SYSTEM' },
      { status: 500, headers: { [REQUEST_ID_HEADER]: ctx.requestId } },
    )
  }
}
