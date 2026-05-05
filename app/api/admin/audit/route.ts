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
import { createClient }   from '@/lib/supabase-server'
import { safeAdminQuery } from '@/lib/admin-db'
import { resolveCompanyId } from '@/lib/resolve-company'
import { requireAdmin }   from '@/lib/require-role'
import { AppError }       from '@/types/errors'
import type { AuditLog }  from '@/types'
// Never use admin client without company_id filter — use safeAdminQuery() from admin-db.ts

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient()
    const { data: authData, error: authError } = await supabase.auth.getUser()
    if (authError || !authData?.user) {
      return NextResponse.json(
        { error: 'Unauthorized', code: 'UNAUTHORIZED', type: 'SECURITY' },
        { status: 401 },
      )
    }
    const user = authData.user

    let companyId: string
    try { companyId = await resolveCompanyId(user.id, supabase) }
    catch { return NextResponse.json({ error: 'Şirket bilgisi alınamadı', code: 'COMPANY_NOT_RESOLVED' }, { status: 409 }) }

    // Enforce admin-only access
    try { await requireAdmin(user.id, companyId, supabase) }
    catch (e) {
      if (e instanceof AppError && e.code === 'FORBIDDEN') {
        return NextResponse.json({ error: e.message, code: 'FORBIDDEN' }, { status: 403 })
      }
      throw e
    }

    const url     = new URL(req.url)
    const limit   = Math.min(Number(url.searchParams.get('limit')  ?? 100), 500)
    const offset  = Math.max(Number(url.searchParams.get('offset') ?? 0),   0)
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
