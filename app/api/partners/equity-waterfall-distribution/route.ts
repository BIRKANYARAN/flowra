// ═══════════════════════════════════════════════════════════════════════════════
// GET|POST /api/partners/equity-waterfall-distribution
//
// Returns the multi-tier equity waterfall distribution report for the
// authenticated company. Models how distributable profit flows through
// priority layers to partners:
//   Tier 1: Borç Servisi     (debt repayment — optional)
//   Tier 2: Tercihli Getiri  (preferred return — optional)
//   Tier 3: Pro-Rata Dağıtım (residual by share_pct)
//
// GET:  Uses default options
// POST: Accepts custom options in request body:
//   { board_retained_try, include_debt_service, include_preferred_return, preferred_rate_pct }
//
// Auth:  admin only — equity distribution data is sensitive financial information
// Cache: revalidate 300 seconds (5 minutes)
// ═══════════════════════════════════════════════════════════════════════════════

export const dynamic  = 'force-dynamic'
export const revalidate = 300

import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth }  from '@/lib/api-auth'
import { requireAdmin }    from '@/lib/require-role'
import { AppError, toErrorResponse } from '@/types/errors'
import { REQUEST_ID_HEADER } from '@/middleware'
import {
  EquityWaterfallDistributionService,
} from '@/lib/services/pcle/equity-waterfall-distribution.service'

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response
  const { uid, companyId, supabase, ctx } = auth

  try {
    await requireAdmin(uid, companyId, supabase)
  } catch (e) {
    if (e instanceof AppError && e.code === 'FORBIDDEN') {
      return NextResponse.json(
        { error: e.message, code: 'FORBIDDEN' },
        { status: 403, headers: { [REQUEST_ID_HEADER]: ctx.requestId } },
      )
    }
    throw e
  }

  try {
    const service = new EquityWaterfallDistributionService(supabase)
    const report  = await service.getReport(companyId)

    return NextResponse.json(
      { report },
      { headers: { [REQUEST_ID_HEADER]: ctx.requestId } },
    )
  } catch (err) {
    const { body, status } = toErrorResponse(err)
    return NextResponse.json(body, { status, headers: { [REQUEST_ID_HEADER]: ctx.requestId } })
  }
}

// ── POST ──────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response
  const { uid, companyId, supabase, ctx } = auth

  try {
    await requireAdmin(uid, companyId, supabase)
  } catch (e) {
    if (e instanceof AppError && e.code === 'FORBIDDEN') {
      return NextResponse.json(
        { error: e.message, code: 'FORBIDDEN' },
        { status: 403, headers: { [REQUEST_ID_HEADER]: ctx.requestId } },
      )
    }
    throw e
  }

  try {
    const body = await req.json().catch(() => ({}))

    const options = {
      board_retained_try:       typeof body.board_retained_try === 'number'
        ? Math.max(0, body.board_retained_try) : 0,
      include_debt_service:     typeof body.include_debt_service === 'boolean'
        ? body.include_debt_service : true,
      include_preferred_return: typeof body.include_preferred_return === 'boolean'
        ? body.include_preferred_return : true,
      preferred_rate_pct:       typeof body.preferred_rate_pct === 'number'
        ? Math.max(0, Math.min(100, body.preferred_rate_pct)) : 8.0,
    }

    const service = new EquityWaterfallDistributionService(supabase)
    const report  = await service.getReport(companyId, options)

    return NextResponse.json(
      { report },
      { headers: { [REQUEST_ID_HEADER]: ctx.requestId } },
    )
  } catch (err) {
    const { body, status } = toErrorResponse(err)
    return NextResponse.json(body, { status, headers: { [REQUEST_ID_HEADER]: ctx.requestId } })
  }
}
