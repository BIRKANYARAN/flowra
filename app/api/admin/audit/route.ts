// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/admin/audit — Company-wide audit log (admin only)
//
// Role guard: requires 'admin' role.
//
// The existing GET /api/audit-logs endpoint returns logs scoped to the
// calling user (via RLS: user_id = auth.uid()). This endpoint returns ALL
// audit log rows for the entire company, scoped by company_id.
//
// Query params:
//   entity_type   string  filter by entity type
//   action        string  'create' | 'update' | 'delete'
//   entity_id     string  filter by specific entity UUID
//   user_id       string  filter by a specific team member
//   since         string  ISO datetime — return rows at or after this time
//   limit         number  max rows (default 100, max 500)
//   offset        number  pagination offset (default 0)
// ═══════════════════════════════════════════════════════════════════════════════

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { safeAdminQuery } from '@/lib/admin-db'
import { requireAdmin }   from '@/lib/require-role'
import { AppError }       from '@/types/errors'
import type { AuditLog }  from '@/types'
import { resolveApiAuth } from '@/lib/api-auth'
// Never use admin client without company_id filter — use safeAdminQuery() from admin-db.ts

export async function GET(req: NextRequest) {
  try {
    const auth = await resolveApiAuth(req)
    if (!auth.ok) return auth.response
    const { uid, companyId, supabase } = auth

    // Enforce admin-only access
    try { await requireAdmin(uid, companyId, supabase) }
    catch (e) {
      if (e instanceof AppError && e.code === 'FORBIDDEN') {
        return NextResponse.json({ error: e.message, code: 'FORBIDDEN' }, { status: 403 })
      }
      throw e
    }

    const url     = new URL(req.url)
    const rawLimit  = Number(url.searchParams.get('limit')  ?? 100)
    const rawOffset = Number(url.searchParams.get('offset') ?? 0)
    const limit   = Math.min(isFinite(rawLimit)  && rawLimit  > 0 ? rawLimit  : 100, 500)
    const offset  = isFinite(rawOffset) && rawOffset >= 0 ? Math.floor(rawOffset) : 0
    const filterEntityType = url.searchParams.get('entity_type') ?? undefined
    const filterAction     = url.searchParams.get('action')      ?? undefined
    const filterEntityId   = url.searchParams.get('entity_id')   ?? undefined
    const filterUserId     = url.searchParams.get('user_id')     ?? undefined
    const filterSince      = url.searchParams.get('since')       ?? undefined

    // audit_logs RLS: "audit_logs_owner_read" policy is `user_id = auth.uid()`.
    // The user-scoped client would return only the calling admin's own rows.
    // We need ALL company rows → safeAdminQuery uses the service-role client to
    // bypass the user-level policy while enforcing .eq('company_id', companyId)
    // automatically. Authorization is already verified above (requireAdmin).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q: any = safeAdminQuery('audit_logs', companyId)
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (filterEntityType) q = q.eq('entity_type', filterEntityType)
    if (filterAction)     q = q.eq('action',       filterAction)
    if (filterEntityId)   q = q.eq('entity_id',    filterEntityId)
    if (filterUserId)     q = q.eq('user_id',       filterUserId)
    if (filterSince)      q = q.gte('created_at',   filterSince)

    const { data, error, count } = await q

    if (error) {
      console.error('[admin/audit GET] DB error:', error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      logs:   (data ?? []) as AuditLog[],
      total:  count ?? 0,
      limit,
      offset,
    })

  } catch (err) {
    console.error('[admin/audit GET] Unexpected error:', err instanceof Error ? err.message : String(err))
    return NextResponse.json({ error: 'Sunucu hatası' }, { status: 500 })
  }
}
