// GET /api/ledger/audit-chain-status
// Returns the hash chain integrity status for the company's audit log.
//
// Auth: resolveApiAuth, admin only
// Cache: revalidate 60s

import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth }            from '@/lib/api-auth'
import { requireAdmin }              from '@/lib/require-role'
import { AuditHashChainService }     from '@/lib/services/ledger/audit-hash-chain.service'

export const revalidate = 60

export async function GET(req: NextRequest) {
  try {
    const auth = await resolveApiAuth(req)
    if (!auth.ok) return auth.response
    const { uid, companyId, supabase } = auth

    // Admin-only: tamper-evidence is a CFO/admin tool
    try {
      await requireAdmin(uid, companyId, supabase)
    } catch {
      return NextResponse.json(
        { error: 'Forbidden — admin role required' },
        { status: 403 },
      )
    }

    const limitParam = req.nextUrl.searchParams.get('limit')
    const limit      = limitParam ? Math.max(1, Math.min(1000, Number(limitParam))) : 200

    const service = new AuditHashChainService(supabase)
    const status  = await service.getChainStatus(companyId, limit)

    return NextResponse.json(status)
  } catch (e) {
    console.error('[ledger/audit-chain-status] error:', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
