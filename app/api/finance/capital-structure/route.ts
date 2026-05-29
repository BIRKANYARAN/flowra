// ─────────────────────────────────────────────────────────────────────────────
// GET /api/finance/capital-structure
//
// Returns the capital structure & debt capacity analysis report for the
// authenticated company. Evaluates total debt, DSCR, leverage capacity score,
// partner loan risk premium, WACD, and debt headroom.
//
// Auth: admin only — leverage and debt capacity data is sensitive financial info
// Cache: revalidate 3600 seconds (1 hour)
// ─────────────────────────────────────────────────────────────────────────────

export const dynamic   = 'force-dynamic'
export const revalidate = 3600

import { NextRequest, NextResponse } from 'next/server'
import { REQUEST_ID_HEADER }         from '@/middleware'
import { resolveApiAuth }            from '@/lib/api-auth'
import { requireAdmin }              from '@/lib/require-role'
import { CapitalStructureService }   from '@/lib/services/finance/capital-structure.service'
import { AppError, toErrorResponse } from '@/types/errors'

export async function GET(req: NextRequest) {
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response
  const { uid, companyId, supabase, ctx } = auth

  // Admin-only gate — debt capacity analysis is sensitive financial data
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
    const service = new CapitalStructureService(supabase)
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
