// GET /api/ledger/reconciliation
// CFO audit endpoint — compares GL journal entries against operational tables
// to surface any drift in the parallel-mode accounting layer.
//
// Auth: resolveApiAuth + requireAdmin role
// Cache: 300s (5 min) — reconciliation is expensive but not real-time

import { NextRequest, NextResponse } from 'next/server'
import { GlReconciliationService }   from '@/lib/services/ledger/gl-reconciliation.service'
import { resolveApiAuth }            from '@/lib/api-auth'
import { requireAdmin }              from '@/lib/require-role'

export const revalidate = 300

export async function GET(req: NextRequest) {
  try {
    const auth = await resolveApiAuth(req)
    if (!auth.ok) return auth.response
    const { uid, companyId, supabase } = auth

    // Admin-only: this is a CFO audit tool
    try {
      await requireAdmin(uid, companyId, supabase)
    } catch {
      return NextResponse.json({ error: 'Forbidden — admin role required' }, { status: 403 })
    }

    const params   = req.nextUrl.searchParams
    const periodId = params.get('period_id') ?? undefined
    const fromDate = params.get('from')      ?? undefined
    const toDate   = params.get('to')        ?? undefined

    const report = await GlReconciliationService.compute(companyId, supabase, {
      periodId,
      fromDate,
      toDate,
    })

    return NextResponse.json(report)
  } catch (e) {
    console.error('[ledger/reconciliation] error:', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
