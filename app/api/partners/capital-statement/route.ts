// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/partners/capital-statement?year=2026
//
// Returns the full partner capital account statement for the given year.
// Defaults to the current calendar year when no year param is provided.
//
// Role guard: admin only (capital accounts are sensitive equity data)
// ═══════════════════════════════════════════════════════════════════════════════

export const revalidate = 300

import { NextRequest, NextResponse } from 'next/server'
import { REQUEST_ID_HEADER } from '@/middleware'
import { resolveApiAuth } from '@/lib/api-auth'
import { requireAdmin } from '@/lib/require-role'
import { CapitalStatementService } from '@/lib/services/pcle/capital-statement.service'
import { AppError, toErrorResponse } from '@/types/errors'

export async function GET(req: NextRequest) {
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response
  const { uid, companyId, supabase, ctx } = auth

  // Admin-only gate — capital account data is sensitive financial equity data
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
    const searchParams = req.nextUrl.searchParams
    const yearParam = searchParams.get('year')
    const year = yearParam ? parseInt(yearParam, 10) : new Date().getFullYear()

    if (!Number.isFinite(year) || year < 2000 || year > 2100) {
      return NextResponse.json(
        { error: 'Geçersiz yıl parametresi' },
        { status: 400, headers: { [REQUEST_ID_HEADER]: ctx.requestId } },
      )
    }

    const report = await CapitalStatementService.getReport(companyId, year, supabase)

    return NextResponse.json(
      { report },
      { headers: { [REQUEST_ID_HEADER]: ctx.requestId } },
    )
  } catch (err) {
    const { body, status } = toErrorResponse(err)
    return NextResponse.json(body, { status, headers: { [REQUEST_ID_HEADER]: ctx.requestId } })
  }
}
