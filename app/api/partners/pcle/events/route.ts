import { NextRequest, NextResponse } from 'next/server'
import { requireRole }       from '@/lib/require-role'
import { checkPeriodGuard }  from '@/lib/middleware/period-guard'
import { resolveApiAuth } from '@/lib/api-auth'
import { logAudit } from '@/lib/audit'
import { round2 } from '@/lib/calc'

export const dynamic = 'force-dynamic'

// GET /api/partners/pcle/events?partner_id=X&limit=50&offset=0
export async function GET(req: NextRequest) {
  try {
    const auth = await resolveApiAuth(req)
    if (!auth.ok) return auth.response
    const { uid, companyId, supabase, ctx } = auth

    const params     = req.nextUrl.searchParams
    const partner_id = params.get('partner_id')
    const rawLimit   = parseInt(params.get('limit')  ?? '50', 10)
    const rawOffset  = parseInt(params.get('offset') ?? '0',  10)
    const limit      = Math.min(isFinite(rawLimit)  ? Math.max(1, rawLimit)  : 50,  200)
    const offset     = isFinite(rawOffset) ? Math.max(0, rawOffset) : 0

    let query = supabase
      .from('partner_finance_events')
      .select('id, partner_id, event_type, amount_try, currency, event_date, reference, description, created_at')
      .eq('company_id', companyId)
      .order('event_date', { ascending: false })
      .range(offset, offset + limit - 1)

    if (partner_id) {
      query = query.eq('partner_id', partner_id)
    }

    const { data, error } = await query
    if (error) {
      // Table may not exist yet (migration not applied) — return empty gracefully
      console.warn('[partners/pcle/events] query error (table may not exist):', error.message)
      return NextResponse.json({ events: [], total: 0 })
    }

    return NextResponse.json({ events: data ?? [], total: (data ?? []).length })
  } catch (e) {
    console.error('[partners/pcle/events] error:', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

// POST /api/partners/pcle/events — record a new PCLE event (admin only)
export async function POST(req: NextRequest) {
  try {
    const auth = await resolveApiAuth(req)
    if (!auth.ok) return auth.response
    const { uid, companyId, supabase, ctx } = auth

    try {
      await requireRole(uid, companyId, 'admin', supabase)
    } catch {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await req.json().catch(() => null)

    if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Geçersiz JSON gövdesi', code: 'VALIDATION_ERROR' }, { status: 422 })
    const { partner_id, event_type, amount_try, event_date, reference, description, metadata } = body

    if (!partner_id || !event_type || amount_try == null) {
      return NextResponse.json({ error: 'partner_id, event_type, amount_try required' }, { status: 400 })
    }

    const amountTryNum = Number(amount_try)
    if (!isFinite(amountTryNum) || amountTryNum <= 0) {
      return NextResponse.json({ error: 'amount_try must be a positive finite number' }, { status: 400 })
    }

    const txDate = typeof event_date === 'string' ? event_date : new Date().toISOString().slice(0, 10)
    const guard = await checkPeriodGuard(companyId, txDate, supabase)
    if (guard.blocked) {
      return NextResponse.json({ error: guard.reason, code: 'PERIOD_LOCKED' }, { status: 409 })
    }

    // ── LOAN_REPAYMENT balance guard ──────────────────────────────────────────
    // Before recording a repayment, verify that the repayment amount does not
    // exceed the partner's current net outstanding loan balance.
    //
    // Net loan = Σ LOAN_DISBURSEMENT (PCLE events) + Σ loan_in/loan_to_company (legacy)
    //           - Σ LOAN_REPAYMENT (PCLE events)   - Σ loan_out/loan_repayment (legacy)
    //
    // Allowing a LOAN_REPAYMENT > net outstanding would create a negative balance in
    // the raw event data. PCLEEngine floors at 0 for display, but the underlying data
    // becomes corrupted — waterfall computations, balance sheet reconciliation, and
    // audit reports would silently undercount the partner's financial position.
    if (event_type === 'LOAN_REPAYMENT') {
      const [legacyTxRes, pcleEventsRes] = await Promise.all([
        supabase
          .from('partner_transactions')
          .select('tx_type, amount_try')
          .eq('company_id', companyId)
          .eq('partner_id', partner_id)
          .is('deleted_at', null)
          .in('tx_type', ['loan_to_company', 'loan_in', 'loan_repayment', 'loan_out']),
        supabase
          .from('partner_finance_events')
          .select('event_type, amount_try')
          .eq('company_id', companyId)
          .eq('partner_id', partner_id)
          .in('event_type', ['LOAN_DISBURSEMENT', 'LOAN_REPAYMENT']),
      ])

      let netLoan = 0

      for (const tx of legacyTxRes.data ?? []) {
        const amt = Number(tx.amount_try)
        if (tx.tx_type === 'loan_to_company' || tx.tx_type === 'loan_in') netLoan += amt
        if (tx.tx_type === 'loan_repayment'  || tx.tx_type === 'loan_out') netLoan -= amt
      }
      for (const ev of pcleEventsRes.data ?? []) {
        const amt = Number(ev.amount_try)
        if (ev.event_type === 'LOAN_DISBURSEMENT') netLoan += amt
        if (ev.event_type === 'LOAN_REPAYMENT')    netLoan -= amt
      }

      const netLoanRounded = round2(Math.max(0, netLoan))
      // Tolerance: allow ₺0.01 for floating point drift in accumulated amounts
      if (amountTryNum > netLoanRounded + 0.01) {
        return NextResponse.json({
          error:   `Geri ödeme tutarı mevcut borç bakiyesini aşıyor.`,
          detail:  `Net bakiye: ₺${netLoanRounded.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} — Girilen: ₺${amountTryNum.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}`,
          code:    'LOAN_REPAYMENT_EXCEEDS_BALANCE',
          net_loan_try:   netLoanRounded,
          requested_try:  amountTryNum,
        }, { status: 422 })
      }
    }

    const { data, error } = await supabase
      .from('partner_finance_events')
      .insert({
        company_id:  companyId,
        partner_id,
        event_type,
        amount_try:  amountTryNum,
        event_date:  event_date ?? new Date().toISOString().slice(0, 10),
        reference:   reference ?? null,
        description: description ?? null,
        metadata:    metadata ?? null,
        created_by:  uid,
      })
      .select('id')
      .single()

    if (error) {
      console.error('[partners/pcle/events POST] error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Audit trail — PCLE events are immutable financial records, must be traceable
    logAudit({
      userId:     uid,
      companyId,
      entityType: 'partner_finance_event',
      entityId:   data.id,
      action:     'create',
      newData:    { partner_id, event_type, amount_try: amountTryNum, event_date: txDate, reference },
    }).catch(auditErr => console.warn('[pcle/events] audit write failed:', auditErr instanceof Error ? auditErr.message : String(auditErr)))

    return NextResponse.json({ id: data.id }, { status: 201 })
  } catch (e) {
    console.error('[partners/pcle/events POST] error:', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
