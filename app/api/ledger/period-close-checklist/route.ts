// ── GET /api/ledger/period-close-checklist ────────────────────────────────────
//
// Returns PeriodCloseChecklist for the company's current open period.
// Query param: ?periodId=xxx (optional — defaults to current open/pre_close)
//
// POST body: { stepId: string, confirmed: boolean }
//   → Confirms a manual step for the current user
//
// Auth:       admin (via resolveApiAuth)
// Revalidate: 60s — checklist state changes as steps are confirmed or data changes

import { NextRequest, NextResponse } from 'next/server'
import { PeriodCloseChecklistService } from '@/lib/services/ledger/period-close-checklist.service'
import { resolveApiAuth } from '@/lib/api-auth'

export const dynamic    = 'force-dynamic'
export const revalidate = 60

// ── GET ────────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const auth = await resolveApiAuth(req)
    if (!auth.ok) return auth.response
    const { companyId, supabase } = auth

    const periodId = req.nextUrl.searchParams.get('periodId') ?? undefined

    const svc      = new PeriodCloseChecklistService(supabase)
    const checklist = await svc.getChecklist(companyId, periodId)

    return NextResponse.json(checklist)
  } catch (e) {
    console.error('[ledger/period-close-checklist] GET error:', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

// ── POST ───────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const auth = await resolveApiAuth(req)
    if (!auth.ok) return auth.response
    const { uid, companyId, supabase } = auth

    const body = await req.json().catch(() => ({}))
    const { stepId, confirmed, periodId } = body as {
      stepId:   string
      confirmed: boolean
      periodId?: string
    }

    if (!stepId || typeof confirmed !== 'boolean') {
      return NextResponse.json(
        { error: 'stepId and confirmed are required' },
        { status: 400 },
      )
    }

    if (!confirmed) {
      // Un-confirming is a no-op for now (soft safety — do not delete confirmations)
      return NextResponse.json({ ok: true })
    }

    // Resolve period if not provided
    let resolvedPeriodId = periodId
    if (!resolvedPeriodId) {
      const { data } = await supabase
        .from('accounting_periods')
        .select('id')
        .eq('company_id', companyId)
        .in('status', ['open', 'pre_close'])
        .order('period_start', { ascending: false })
        .limit(1)
        .maybeSingle()
      resolvedPeriodId = data?.id ?? ''
    }

    if (!resolvedPeriodId) {
      return NextResponse.json({ error: 'No open period found' }, { status: 404 })
    }

    const svc = new PeriodCloseChecklistService(supabase)
    await svc.confirmManualStep(companyId, resolvedPeriodId, stepId, uid)

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[ledger/period-close-checklist] POST error:', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
