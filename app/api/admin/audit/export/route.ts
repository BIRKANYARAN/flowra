// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/admin/audit/export — Export audit logs as CSV
//
// Role guard: requires 'admin' role.
//
// Query params (all optional):
//   from        YYYY-MM-DD  filter rows at or after this date
//   to          YYYY-MM-DD  filter rows at or before this date
//   action      string      'create' | 'update' | 'delete'
//   entity_type string      filter by entity type
//
// Response:
//   Content-Type: text/csv
//   Content-Disposition: attachment; filename="audit-<from>-<to>.csv"
//
// Rows are limited to 1000 per export.
// Includes a chain integrity status comment in the CSV header.
// ═══════════════════════════════════════════════════════════════════════════════

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { safeAdminQuery }            from '@/lib/admin-db'
import { requireAdmin }              from '@/lib/require-role'
import { AppError }                  from '@/types/errors'
import { resolveApiAuth }            from '@/lib/api-auth'
import { verifyAuditChain }          from '@/lib/services/audit-chain.service'
import { getSystemAdminClient }      from '@/lib/admin-db'

const MAX_ROWS = 1000

function escapeCsvField(value: unknown): string {
  if (value == null) return ''
  const str = String(value)
  // Wrap in double-quotes if it contains comma, double-quote, or newline
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return '"' + str.replace(/"/g, '""') + '"'
  }
  return str
}

function toCsvRow(fields: unknown[]): string {
  return fields.map(escapeCsvField).join(',')
}

export async function GET(req: NextRequest) {
  try {
    const auth = await resolveApiAuth(req)
    if (!auth.ok) return auth.response
    const { uid, companyId } = auth

    try { await requireAdmin(uid, companyId, auth.supabase) }
    catch (e) {
      if (e instanceof AppError && e.code === 'FORBIDDEN') {
        return NextResponse.json({ error: e.message, code: 'FORBIDDEN' }, { status: 403 })
      }
      throw e
    }

    const url         = new URL(req.url)
    const today       = new Date().toISOString().slice(0, 10)
    const dfl30       = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10)
    const from        = url.searchParams.get('from')        ?? dfl30
    const to          = url.searchParams.get('to')          ?? today
    const filterAction      = url.searchParams.get('action')       ?? undefined
    const filterEntityType  = url.searchParams.get('entity_type')  ?? undefined

    // ── Chain integrity status (for CSV header comment) ──────────────────────
    const adminClient = getSystemAdminClient()
    const chainResult = await verifyAuditChain(companyId, from, to, adminClient)
    const chainStatus = !chainResult.is_supported
      ? 'UNSUPPORTED (pre-migration)'
      : chainResult.total_checked === 0
        ? 'NO_RECORDS'
        : chainResult.ok
          ? 'VALID'
          : `TAMPERED (${chainResult.broken_links} broken links)`
    const nowIso = new Date().toISOString().replace('T', ' ').slice(0, 16)

    // ── Query audit logs ─────────────────────────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q: any = safeAdminQuery('audit_logs', companyId)
      .select('id, created_at, user_id, action, entity_type, entity_id, content_hash')
      .order('created_at', { ascending: false })
      .range(0, MAX_ROWS - 1)

    if (from)               q = q.gte('created_at', from + 'T00:00:00Z')
    if (to)                 q = q.lte('created_at', to   + 'T23:59:59Z')
    if (filterAction)       q = q.eq('action',       filterAction)
    if (filterEntityType)   q = q.eq('entity_type',  filterEntityType)

    const { data, error } = await q

    if (error) {
      console.error('[admin/audit/export GET] DB error:', error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const rows = data ?? []

    // ── Build CSV ────────────────────────────────────────────────────────────
    const lines: string[] = [
      `# Flowra Audit Log Export`,
      `# Generated: ${nowIso}`,
      `# Date range: ${from} – ${to}`,
      `# Audit Chain Status: ${chainStatus} (as of ${nowIso})`,
      `# Rows exported: ${rows.length}${rows.length === MAX_ROWS ? ' (limit reached)' : ''}`,
      '',
      toCsvRow(['id', 'created_at', 'user_id', 'action', 'entity_type', 'entity_id', 'content_hash']),
      ...rows.map((row: {
        id: string
        created_at: string
        user_id: string
        action: string
        entity_type: string
        entity_id: string
        content_hash?: string | null
      }) => toCsvRow([
        row.id,
        row.created_at,
        row.user_id,
        row.action,
        row.entity_type,
        row.entity_id,
        row.content_hash ?? '',
      ])),
    ]

    const csv      = lines.join('\n')
    const filename = `audit-${from}-${to}.csv`

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type':        'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control':       'no-store',
      },
    })
  } catch (err) {
    console.error('[admin/audit/export GET] Unexpected error:', err instanceof Error ? err.message : String(err))
    return NextResponse.json({ error: 'Sunucu hatası' }, { status: 500 })
  }
}
