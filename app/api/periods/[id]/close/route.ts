import { NextRequest, NextResponse } from 'next/server'
import { createClient }     from '@/lib/supabase-server'
import { resolveCompanyId } from '@/lib/resolve-company'
import { requireRole }      from '@/lib/require-role'
import { TrialBalanceService } from '@/lib/services/ledger/trial-balance.service'
import { ReconciliationService } from '@/lib/services/ledger/reconciliation.service'

export const dynamic = 'force-dynamic'

// POST /api/periods/[id]/close — transition period open|pre_close → closed
// Guards: admin only, trial balance must be balanced, reconciliation must pass
export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const supabase = createClient()
    const { data: authData } = await supabase.auth.getUser()
    if (!authData?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const companyId = await resolveCompanyId(authData.user.id, supabase)
    if (!companyId) return NextResponse.json({ error: 'No company' }, { status: 400 })

    try { await requireRole(authData.user.id, companyId, 'admin', supabase) }
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

    if (!tbReport.trial_balance.is_balanced) {
      return NextResponse.json({
        error:   'Mizan dengeli değil. Dönem kapatılamaz.',
        detail:  `Fark: ${tbReport.trial_balance.imbalance_try.toFixed(2)} TL`,
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
        closed_by: authData.user.id,
      })
      .eq('id', params.id)
      .eq('company_id', companyId)

    if (updateErr) {
      console.error('[periods/close] update error:', updateErr)
      return NextResponse.json({ error: updateErr.message }, { status: 500 })
    }

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
