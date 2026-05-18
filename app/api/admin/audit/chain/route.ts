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
import { verifyAuditChain }             from '@/lib/services/audit-chain.service'
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

    // verifyAuditChain needs cross-user access to audit_logs (audit_logs RLS is user_id=auth.uid()
    // so we need the service-role client to read all company rows, same pattern as /api/admin/audit)
    const adminClient = getSystemAdminClient()
    const result = await verifyAuditChain(companyId, from, to, adminClient)

    return NextResponse.json({ ...result, from, to })
  } catch (err) {
    console.error('[admin/audit/chain GET]', err instanceof Error ? err.message : String(err))
    return NextResponse.json({ error: 'Sunucu hatası' }, { status: 500 })
  }
}
