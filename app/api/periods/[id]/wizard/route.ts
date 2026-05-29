// ── GET /api/periods/[id]/wizard ──────────────────────────────────────────────
//
// Returns wizard state for a specific period by ID.
// Response: { wizard: { steps: WizardStep[], phases: WizardPhaseResult[], overall_pct: number } }
//
// Auth: admin only (via resolveApiAuth)
// Dynamic: force-dynamic — wizard state changes as checklist steps complete.

import { NextRequest, NextResponse } from 'next/server'
import { PeriodCloseWizardService } from '@/lib/services/ledger/period-close-wizard.service'
import { resolveApiAuth } from '@/lib/api-auth'

export const dynamic = 'force-dynamic'

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const auth = await resolveApiAuth(req)
    if (!auth.ok) return auth.response
    const { companyId, supabase } = auth

    const periodId = params.id

    const state = await PeriodCloseWizardService.getWizardState(companyId, supabase, periodId)

    // Flatten all steps across phases for convenience
    const steps = state.phases.flatMap(p => p.steps)

    return NextResponse.json({
      wizard: {
        steps,
        phases:      state.phases,
        overall_pct: state.overall_pct,
      },
      // Include the full state for clients that want more detail
      period_id:     state.period_id,
      period_label:  state.period_label,
      period_status: state.period_status,
      current_phase: state.current_phase,
      can_advance:   state.can_advance,
      can_close:     state.can_close,
      computed_at:   state.computed_at,
    })
  } catch (e) {
    console.error('[periods/[id]/wizard] error:', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
