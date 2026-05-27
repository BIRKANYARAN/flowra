// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/governance/audit-trail?limit=100
//
// Returns a GovernanceReport with workflow log, high-value audit log,
// resolution stats, and governance health score.
//
// Role guard: admin only — audit trail contains sensitive operational data
// Revalidate: 60 — changes frequently with workflow activity
// ═══════════════════════════════════════════════════════════════════════════════

export const revalidate = 60

import { NextRequest, NextResponse } from 'next/server'
import { REQUEST_ID_HEADER } from '@/middleware'
import { resolveApiAuth } from '@/lib/api-auth'
import { requireAdmin } from '@/lib/require-role'
import { GovernanceService } from '@/lib/services/intelligence/governance.service'
import { AppError, toErrorResponse } from '@/types/errors'

export async function GET(req: NextRequest) {
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response
  const { uid, companyId, supabase, ctx } = auth

  // Admin-only gate — audit trail is sensitive compliance data
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
    const searchParams    = req.nextUrl.searchParams
    const limitParam      = searchParams.get('limit')
    const auditLimit      = limitParam ? Math.min(500, Math.max(10, parseInt(limitParam, 10))) : 100
    const workflowLimit   = 50

    const report = await GovernanceService.getReport(companyId, supabase, workflowLimit, auditLimit)

    return NextResponse.json(
      { report },
      { headers: { [REQUEST_ID_HEADER]: ctx.requestId } },
    )
  } catch (err) {
    const { body, status } = toErrorResponse(err)
    return NextResponse.json(body, { status, headers: { [REQUEST_ID_HEADER]: ctx.requestId } })
  }
}
