// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/admin/audit/chain — SHA-256 audit chain integrity verification
//
// Role guard: requires 'admin' role.
// Verifies that the audit_logs hash chain has not been tampered with.
//
// Query params:
//   from   YYYY-MM-DD (default: 30 days ago)
//   to     YYYY-MM-DD (default: today)
// ═══════════════════════════════════════════════════════════════════════════════

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse }    from 'next/server'
import { requireAdmin }                 from '@/lib/require-role'
import { AppError }                     from '@/types/errors'
import { resolveApiAuth }               from '@/lib/api-auth'
import { getSystemAdminClient }         from '@/lib/admin-db'

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

    const url  = new URL(req.url)
    const today = new Date().toISOString().slice(0, 10)
    const dfl30 = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10)
    const from  = url.searchParams.get('from') ?? dfl30
    const to    = url.searchParams.get('to')   ?? today

    // Verify against the AUTHORITATIVE DB chain: a BEFORE INSERT trigger stamps
    // content_hash/prev_hash and the verify_audit_chain RPC recomputes the SHA-256
    // chain in-DB (migration 20260601000001). This is the single source of truth —
    // a JS recompute would diverge on JSON/timestamp serialization.
    const adminClient = getSystemAdminClient()
    const { data, error } = await adminClient.rpc('verify_audit_chain', { p_company_id: companyId, p_from: from, p_to: to })
    if (error) {
      return NextResponse.json({ is_supported: false, ok: false, total_checked: 0, broken_links: 0, from, to, error: error.message })
    }
    const verRows = (data ?? []) as Array<{ row_id: string; created_at: string; has_hash: boolean; chain_intact: boolean }>
    const broken = verRows.filter(r => !r.chain_intact)
    const result = {
      is_supported:  verRows.length === 0 || verRows.some(r => r.has_hash),
      total_checked: verRows.length,
      broken_links:  broken.length,
      first_broken:  broken[0] ? { id: broken[0].row_id, created_at: broken[0].created_at } : undefined,
      ok:            broken.length === 0,
    }
    return NextResponse.json({ ...result, from, to })
  } catch (err) {
    console.error('[admin/audit/chain GET]', err instanceof Error ? err.message : String(err))
    return NextResponse.json({ error: 'Sunucu hatası' }, { status: 500 })
  }
}
