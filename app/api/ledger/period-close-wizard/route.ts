// ── GET /api/ledger/period-close-wizard ──────────────────────────────────────
//
// Returns PeriodCloseWizardState for the current open/pre_close period.
// Query param: ?period_id=xxx (optional — defaults to current open period)
//
// Auth: admin only (via resolveApiAuth)
// Revalidate: 60s — wizard state changes frequently as steps are completed.

import { NextRequest, NextResponse } from 'next/server'
import { PeriodCloseWizardService } from '@/lib/services/ledger/period-close-wizard.service'
import { resolveApiAuth } from '@/lib/api-auth'

export const dynamic    = 'force-dynamic'
export const revalidate = 60

export async function GET(req: NextRequest) {
  try {
    const auth = await resolveApiAuth(req)
    if (!auth.ok) return auth.response
    const { companyId, supabase } = auth

    const periodId = req.nextUrl.searchParams.get('period_id') ?? undefined

    const state = await PeriodCloseWizardService.getWizardState(companyId, supabase, periodId)

    return NextResponse.json(state)
  } catch (e) {
    console.error('[ledger/period-close-wizard] error:', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
