import { NextRequest, NextResponse } from 'next/server'
import { requireRole }      from '@/lib/require-role'
import { TrialBalanceService } from '@/lib/services/ledger/trial-balance.service'
import { ReconciliationService } from '@/lib/services/ledger/reconciliation.service'
import { resolveApiAuth } from '@/lib/api-auth'
import { auditPeriodTransition } from '@/lib/db/mutation-audit'

export const dynamic = 'force-dynamic'

// POST /api/periods/[id]/close — transition period open|pre_close → closed
// Guards: admin only, trial balance must be balanced, reconciliation must pass
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const auth = await resolveApiAuth(req)
    if (!auth.ok) return auth.response
    const { uid, companyId, supabase } = auth

    try { await requireRole(uid, companyId, 'admin', supabase) }
    catch { return NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }

    const { data: period, error: periodErr } = await supabase
      .from('accounting_periods')
      .select('id, status, period_start, period_end')
      .eq('id', params.id)
      .eq('company_id', companyId)
      .maybeSingle()

    if (periodErr || !period) return NextResponse.json({ error: 'Dönem bulunamadı' }, { status: 404 })
    if (period.status === 'closed')  return NextResponse.json({ error: 'Dönem zaten kapalı' }, { status: 409 })
    if (period.status === 'locked')  return NextResponse.json({ error: 'Dönem kilitlenmiş, kapatılamaz' }, { status: 409 })

    // Run accounting checks before allowing close
    const [tbReport, reconciliation] = await Promise.all([
      TrialBalanceService.compute(companyId, supabase, { periodId: params.id }),
      ReconciliationService.check(companyId, supabase, { periodId: params.id }),
    ])

    // Use canClosePeriod from TrialBalanceService — requires balance + no abnormal + entries
    if (!tbReport.can_close_period) {
      const failedChecks = tbReport.checks.filter(c => !c.passed).map(c => c.name).join(', ')
      return NextResponse.json({
        error:   'Muhasebe kontrolleri geçilemedi. Dönem kapatılamaz.',
        detail:  failedChecks || 'Mizan dengeli değil veya journal kayıt yok.',
        code:    'TRIAL_BALANCE_UNBALANCED',
      }, { status: 422 })
    }

    const hasCriticalReconciliation = reconciliation.items.some(i => i.severity === 'critical')
    if (hasCriticalReconciliation) {
      return NextResponse.json({
        error:  'Mutabakat kritik uyuşmazlıklar içeriyor. Düzeltme yapın.',
        items:  reconciliation.items.filter(i => i.severity === 'critical'),
        code:   'RECONCILIATION_FAILED',
      }, { status: 422 })
    }

    // Transition to closed
    const { error: updateErr } = await supabase
      .from('accounting_periods')
      .update({
        status:    'closed',
        closed_at: new Date().toISOString(),
        closed_by: uid,
      })
      .eq('id', params.id)
      .eq('company_id', companyId)

    if (updateErr) {
      console.error('[periods/close] update error:', updateErr)
      return NextResponse.json({ error: updateErr.message }, { status: 500 })
    }

    // Audit trail — period state transitions are immutable and must be traceable
    auditPeriodTransition({
      userId:     uid,
      companyId,
      periodId:   params.id,
      fromStatus: period.status,
      toStatus:   'closed',
      source:     'api/periods/close',
    })

    return NextResponse.json({
      closed:          true,
      period_id:       params.id,
      trial_balance:   { is_balanced: true, checks: tbReport.checks },
      reconciliation:  { is_reconciled: reconciliation.is_reconciled },
    })
  } catch (e) {
    console.error('[periods/close] error:', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
