import { NextRequest, NextResponse } from 'next/server'
import { requireRole }      from '@/lib/require-role'
import { resolveApiAuth } from '@/lib/api-auth'
import { auditPeriodTransition } from '@/lib/db/mutation-audit'

export const dynamic = 'force-dynamic'

// POST /api/periods/[id]/lock — transition closed → locked
// This is irreversible at API level. Only admin can lock. Explicit confirmation required.
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

    // Require explicit confirmation body to prevent accidental locks
    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    if (body.confirm !== true) {
      return NextResponse.json({
        error: 'Kilit işlemini onaylamak için { "confirm": true } gönderin.',
        code:  'CONFIRMATION_REQUIRED',
      }, { status: 422 })
    }

    const { data: period, error: periodErr } = await supabase
      .from('accounting_periods')
      .select('id, status')
      .eq('id', params.id)
      .eq('company_id', companyId)
      .maybeSingle()

    if (periodErr || !period) return NextResponse.json({ error: 'Dönem bulunamadı' }, { status: 404 })
    if (period.status !== 'closed') {
      return NextResponse.json({
        error: `Sadece kapalı dönemler kilitlenebilir. Mevcut durum: ${period.status}`,
        code:  'INVALID_STATUS_TRANSITION',
      }, { status: 409 })
    }

    // D5: CAS-like update — predicate ensures only one concurrent lock request wins
    const { error: updateErr, count } = await supabase
      .from('accounting_periods')
      .update({
        status:    'locked',
        locked_at: new Date().toISOString(),
        locked_by: uid,
      }, { count: 'exact' })
      .eq('id', params.id)
      .eq('company_id', companyId)
      .eq('status', 'closed')  // only transition from 'closed' state

    if (updateErr) {
      console.error('[periods/lock] update error:', updateErr)
      return NextResponse.json({ error: updateErr.message }, { status: 500 })
    }
    if (count === 0) {
      return NextResponse.json({ error: 'Dönem zaten kilitli veya kapatılmamış', code: 'CONCURRENT_TRANSITION' }, { status: 409 })
    }

    // Audit trail — lock is irreversible; must have a traceable record
    auditPeriodTransition({
      userId:     uid,
      companyId,
      periodId:   params.id,
      fromStatus: 'closed',
      toStatus:   'locked',
      source:     'api/periods/lock',
    })

    return NextResponse.json({ locked: true, period_id: params.id })
  } catch (e) {
    console.error('[periods/lock] error:', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
