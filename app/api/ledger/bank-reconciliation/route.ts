// GET /api/ledger/bank-reconciliation?asOf=2025-01-31
// Compares book cash position against reported bank balances and flags
// unreconciled items.
//
// Auth: resolveApiAuth + requireAdmin role
// Cache: 300s (5 min)

import { NextRequest, NextResponse }     from 'next/server'
import { BankReconciliationService }     from '@/lib/services/ledger/bank-reconciliation.service'
import { resolveApiAuth }                from '@/lib/api-auth'
import { requireAdmin }                  from '@/lib/require-role'

export const revalidate = 300

export async function GET(req: NextRequest) {
  try {
    const auth = await resolveApiAuth(req)
    if (!auth.ok) return auth.response
    const { uid, companyId, supabase } = auth

    // Admin-only: CFO audit tool
    try {
      await requireAdmin(uid, companyId, supabase)
    } catch {
      return NextResponse.json({ error: 'Forbidden — admin role required' }, { status: 403 })
    }

    const asOf = req.nextUrl.searchParams.get('asOf') ?? undefined

    const service = new BankReconciliationService(supabase)
    const report  = await service.getReport(companyId, asOf)

    return NextResponse.json(report)
  } catch (e) {
    console.error('[ledger/bank-reconciliation] error:', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
