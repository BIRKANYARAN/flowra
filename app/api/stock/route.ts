// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/stock — movement-derived stock queries (Phase 2 read side)
//
// Query params:
//   product_id   (required for: current, history, value, consistency)
//   view         one of: current | history | value | consistency | inconsistent
//                        default: current
//   limit, offset  (history only — clamped by the service)
//
// Why one route, multiple views?
//   Each view shares the same auth/logging boilerplate. A view switch avoids
//   four near-identical files that would drift over time.
//
// Safety:
//   • Read-only. GET only.
//   • RLS enforces ownership at the DB layer; service also filters by user_id.
//   • Never reads/writes products.stock_qty (except in "consistency" view,
//     which deliberately compares the two sources).
// ═══════════════════════════════════════════════════════════════════════════════

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { REQUEST_ID_HEADER } from '@/middleware'
import { StockQueryService } from '@/lib/services/stock-query.service'
import { toErrorResponse } from '@/types/errors'
import { resolveApiAuth } from '@/lib/api-auth'

const VALID_VIEWS = new Set(['current', 'history', 'value', 'consistency', 'inconsistent'])

export async function GET(req: NextRequest) {
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response
  const { uid, companyId, supabase, ctx } = auth

  const url       = new URL(req.url)
  const view      = (url.searchParams.get('view') || 'current').toLowerCase()
  const productId = url.searchParams.get('product_id') || ''

  if (!VALID_VIEWS.has(view)) {
    return NextResponse.json(
      { error: `Geçersiz view: ${view}`, code: 'INVALID_INPUT', type: 'BUSINESS' },
      { status: 422, headers: { [REQUEST_ID_HEADER]: ctx.requestId } }
    )
  }

  try {
    // "inconsistent" — bulk drift report; doesn't need product_id
    if (view === 'inconsistent') {
      const reports = await StockQueryService.listInconsistentProducts(uid, companyId, ctx, supabase)
      return NextResponse.json(
        { reports, count: reports.length },
        { headers: { [REQUEST_ID_HEADER]: ctx.requestId } }
      )
    }

    if (!productId) {
      return NextResponse.json(
        { error: 'product_id zorunludur', code: 'VALIDATION_ERROR', type: 'BUSINESS', field: 'product_id' },
        { status: 422, headers: { [REQUEST_ID_HEADER]: ctx.requestId } }
      )
    }

    switch (view) {
      case 'current': {
        const snap = await StockQueryService.getCurrentStock(uid, companyId, productId, ctx, supabase)
        return NextResponse.json(snap, { headers: { [REQUEST_ID_HEADER]: ctx.requestId } })
      }
      case 'history': {
        const limit  = Number(url.searchParams.get('limit')  ?? '') || undefined
        const offset = Number(url.searchParams.get('offset') ?? '') || undefined
        const entries = await StockQueryService.getStockHistory(uid, companyId, productId, { limit, offset }, ctx, supabase)
        return NextResponse.json(
          { entries, count: entries.length },
          { headers: { [REQUEST_ID_HEADER]: ctx.requestId } }
        )
      }
      case 'value': {
        const val = await StockQueryService.calculateStockValue(uid, companyId, productId, ctx, supabase)
        return NextResponse.json(val, { headers: { [REQUEST_ID_HEADER]: ctx.requestId } })
      }
      case 'consistency': {
        const rep = await StockQueryService.checkConsistency(uid, companyId, productId, ctx, supabase)
        return NextResponse.json(rep, { headers: { [REQUEST_ID_HEADER]: ctx.requestId } })
      }
    }

    // Unreachable (view is validated above) — keep TS happy.
    return NextResponse.json(
      { error: 'Unreachable' },
      { status: 500, headers: { [REQUEST_ID_HEADER]: ctx.requestId } }
    )

  } catch (err) {
    const { body, status } = toErrorResponse(err)
    return NextResponse.json(body, { status, headers: { [REQUEST_ID_HEADER]: ctx.requestId } })
  }
}
