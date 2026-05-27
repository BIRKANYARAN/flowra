// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/commercial/invoice-aging?asOf=2025-01-31
//
// Returns an Invoice Aging Report: per-invoice aging days, urgency scores,
// bucket summaries, and a ranked collection priority queue.
//
// Query params:
//   asOf  — ISO date string (YYYY-MM-DD). Defaults to today.
//
// Auth: resolveApiAuth, manager+
// Cache: revalidate 300 seconds
// ═══════════════════════════════════════════════════════════════════════════════

export const revalidate = 300

import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth } from '@/lib/api-auth'
import { InvoiceAgingService } from '@/lib/services/commercial/invoice-aging.service'
import { REQUEST_ID_HEADER } from '@/middleware'
import { toErrorResponse } from '@/types/errors'

export async function GET(req: NextRequest) {
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response
  const { companyId, supabase, ctx } = auth

  try {
    const asOf = req.nextUrl.searchParams.get('asOf') ?? undefined

    const service = new InvoiceAgingService(supabase)
    const report  = await service.getReport(companyId, asOf)

    return NextResponse.json(
      { report },
      { headers: { [REQUEST_ID_HEADER]: ctx.requestId } },
    )

  } catch (err) {
    const { body, status } = toErrorResponse(err)
    return NextResponse.json(body, { status, headers: { [REQUEST_ID_HEADER]: ctx.requestId } })
  }
}
