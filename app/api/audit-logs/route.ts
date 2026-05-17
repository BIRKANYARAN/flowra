// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/audit-logs
//
// Returns audit log entries for the authenticated user.
// RLS ensures users can only see their own rows.
//
// Query params:
//   entity_type   string  filter by entity type
//   action        string  'create' | 'update' | 'delete'
//   entity_id     string  filter by specific entity UUID
//   since         string  ISO datetime — return rows at or after this time
//   limit         number  max rows (default 200, max 500)
// ═══════════════════════════════════════════════════════════════════════════════

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth } from '@/lib/api-auth'
import { contextFromHeader }         from '@/lib/logger'
import { REQUEST_ID_HEADER }         from '@/middleware'
import { AuditService }              from '@/lib/audit'
import { toErrorResponse }           from '@/types/errors'
import type { AuditEntityType, AuditAction } from '@/types/index'

export async function GET(req: NextRequest) {
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response
  const { uid, companyId, supabase, ctx } = auth

  try {
    const url = new URL(req.url)
    const filters = {
      entity_type: (url.searchParams.get('entity_type') ?? undefined) as AuditEntityType | undefined,
      action:      (url.searchParams.get('action') ?? undefined) as AuditAction | undefined,
      entity_id:   url.searchParams.get('entity_id')  ?? undefined,
      since:       url.searchParams.get('since')       ?? undefined,
      limit:       url.searchParams.has('limit')
        ? Math.min(Number(url.searchParams.get('limit')), 500)
        : 200,
    }

    const logs = await AuditService.listLogs(uid, filters)
    return NextResponse.json(logs, { headers: { [REQUEST_ID_HEADER]: ctx.requestId } })
  } catch (err) {
    const { body, status } = toErrorResponse(err)
    return NextResponse.json(body, { status, headers: { [REQUEST_ID_HEADER]: ctx.requestId } })
  }
}
