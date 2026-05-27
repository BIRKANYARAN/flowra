// ─────────────────────────────────────────────────────────────────────────────
// GET /api/inventory/fifo-audit
//
// FIFO lot integrity audit: over-consumed lots, negative stock, orphaned
// allocations, and cost drift detection.
//
// Auth:  resolveApiAuth + company_members check, manager+ role required
// Cache: revalidate: 300 (5 min — operational data)
// ─────────────────────────────────────────────────────────────────────────────

export const revalidate = 300

import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth }            from '@/lib/api-auth'
import { requireRole }               from '@/lib/require-role'
import { FifoAuditService }          from '@/lib/services/inventory/fifo-audit.service'
import { REQUEST_ID_HEADER }         from '@/middleware'
import { AppError }                  from '@/types/errors'

export async function GET(req: NextRequest) {
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response
  const { uid, companyId, supabase, ctx } = auth

  // Require manager or above
  try {
    await requireRole(uid, companyId, 'manager', supabase)
  } catch (err) {
    if (err instanceof AppError && err.code === 'FORBIDDEN') {
      return NextResponse.json(
        { error: err.message, code: 'FORBIDDEN', type: 'SECURITY' },
        { status: 403, headers: { [REQUEST_ID_HEADER]: ctx.requestId } },
      )
    }
    throw err
  }

  try {
    const service = new FifoAuditService(supabase)
    const audit   = await service.getAudit(companyId)
    return NextResponse.json(
      { audit },
      { headers: { [REQUEST_ID_HEADER]: ctx.requestId } },
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json(
      { error: msg, code: 'SERVICE_ERROR', type: 'SYSTEM' },
      { status: 500, headers: { [REQUEST_ID_HEADER]: ctx.requestId } },
    )
  }
}
