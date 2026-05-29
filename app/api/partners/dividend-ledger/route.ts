// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/partners/dividend-ledger?year=2025
//
// Returns the full dividend ledger for the authenticated company.
//
// Query params:
//   year (optional) — filter to a specific calendar year (YYYY)
//
// Response: { ledger: DividendLedger }
//
// Role guard: admin only (dividend history is sensitive financial data)
// Cache: revalidate 3600 seconds (1 hour)
// ═══════════════════════════════════════════════════════════════════════════════

export const revalidate = 3600

import { NextRequest, NextResponse } from 'next/server'
import { REQUEST_ID_HEADER } from '@/middleware'
import { resolveApiAuth } from '@/lib/api-auth'
import { requireAdmin } from '@/lib/require-role'
import { DividendLedgerService } from '@/lib/services/pcle/dividend-ledger.service'
import { AppError, toErrorResponse } from '@/types/errors'

export async function GET(req: NextRequest) {
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response
  const { uid, companyId, supabase, ctx } = auth

  // Admin-only gate — dividend history is sensitive financial data
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
    // Parse optional year query param
    const yearParam = req.nextUrl.searchParams.get('year')
    const year = yearParam ? parseInt(yearParam, 10) : undefined
    const validYear = year && Number.isFinite(year) && year >= 2000 && year <= 2100
      ? year
      : undefined

    const service = new DividendLedgerService(supabase)
    const ledger = await service.getLedger(companyId, validYear)

    return NextResponse.json(
      { ledger },
      { headers: { [REQUEST_ID_HEADER]: ctx.requestId } },
    )
  } catch (err) {
    const { body, status } = toErrorResponse(err)
    return NextResponse.json(body, { status, headers: { [REQUEST_ID_HEADER]: ctx.requestId } })
  }
}
