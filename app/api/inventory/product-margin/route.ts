// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/inventory/product-margin
//
// Returns a Product Margin Analysis report: FIFO-based gross margin per product
// for the given period.
//
// Query params (optional):
//   from   YYYY-MM-DD  (default: first day of current year)
//   to     YYYY-MM-DD  (default: today)
//
// Auth: any authenticated company member.
// ═══════════════════════════════════════════════════════════════════════════════

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth } from '@/lib/api-auth'
import { ProductMarginService } from '@/lib/services/inventory/product-margin.service'
import { REQUEST_ID_HEADER } from '@/middleware'
import { toErrorResponse } from '@/types/errors'

function parseDate(s: string | null): string | null {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null
  return s
}

function defaultPeriod(): { from: string; to: string } {
  const today = new Date().toISOString().slice(0, 10)
  const from  = today.slice(0, 4) + '-01-01'  // first day of current year
  return { from, to: today }
}

export async function GET(req: NextRequest) {
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response
  const { companyId, supabase, ctx } = auth

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

    const report = await ProductMarginService.getReport(
      companyId,
      supabase,
      { from, to },
    )

    return NextResponse.json(report, { headers: { [REQUEST_ID_HEADER]: ctx.requestId } })

  } catch (err) {
    const { body, status } = toErrorResponse(err)
    return NextResponse.json(body, { status, headers: { [REQUEST_ID_HEADER]: ctx.requestId } })
  }
}
