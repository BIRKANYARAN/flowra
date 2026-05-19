// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/partners/loan-tranches — create a new partner loan tranche
// ═══════════════════════════════════════════════════════════════════════════════

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth } from '@/lib/api-auth'
import { REQUEST_ID_HEADER } from '@/middleware'
import { dualWrite, resolvePeriodId } from '@/lib/services/ledger/dual-write.service'
import { JournalEntryService } from '@/lib/services/ledger/journal-entry.service'
import { logAudit } from '@/lib/audit'

export async function POST(req: NextRequest) {
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response
  const { uid, companyId, supabase, ctx } = auth

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json(
      { error: 'Geçersiz JSON', code: 'VALIDATION_ERROR', type: 'BUSINESS' },
      { status: 422, headers: { [REQUEST_ID_HEADER]: ctx.requestId } }
    )
  }

  const partner_id       = typeof body.partner_id === 'string' ? body.partner_id.trim() : ''
  const principal_try    = Number(body.amount_try) || 0
  const disbursement_date = typeof body.disbursement_date === 'string' ? body.disbursement_date.trim() : ''

  if (!partner_id) {
    return NextResponse.json(
      { error: 'partner_id zorunludur', code: 'VALIDATION_ERROR', type: 'BUSINESS' },
      { status: 422, headers: { [REQUEST_ID_HEADER]: ctx.requestId } }
    )
  }
  if (principal_try <= 0) {
    return NextResponse.json(
      { error: 'amount_try sıfırdan büyük olmalıdır', code: 'VALIDATION_ERROR', type: 'BUSINESS' },
      { status: 422, headers: { [REQUEST_ID_HEADER]: ctx.requestId } }
    )
  }
  if (!disbursement_date) {
    return NextResponse.json(
      { error: 'disbursement_date zorunludur', code: 'VALIDATION_ERROR', type: 'BUSINESS' },
      { status: 422, headers: { [REQUEST_ID_HEADER]: ctx.requestId } }
    )
  }

  const interest_rate_annual_pct  = body.annual_interest_rate != null ? Number(body.annual_interest_rate) : 0
  const expected_repayment_date   =
    typeof body.expected_repayment_date === 'string' && body.expected_repayment_date.trim()
      ? body.expected_repayment_date.trim()
      : null
  const notes = typeof body.notes === 'string' && body.notes.trim() ? body.notes.trim() : null

  const { data, error } = await supabase
    .from('partner_loan_tranches')
    .insert({
      company_id: companyId,
      partner_id,
      principal_try,
      // Write to BOTH columns while the schema has two names for the same value.
      // All SELECT queries read `annual_interest_rate` (legacy canonical).
      // `interest_rate_annual_pct` is the new canonical name (pending DB column unification).
      // Without this dual-write, new tranches silently get 0% interest in all calculations.
      interest_rate_annual_pct,
      annual_interest_rate: interest_rate_annual_pct,  // DRIFT FIX: keep both columns in sync
      disbursement_date,
      expected_repayment_date,
      notes,
      created_by: uid,
    })
    .select()
    .single()

  if (error) {
    console.error('[partners/loan-tranches] insert error:', error)
    return NextResponse.json(
      { error: 'Tranche kaydedilemedi', code: 'DB_ERROR', type: 'INTERNAL' },
      { status: 500, headers: { [REQUEST_ID_HEADER]: ctx.requestId } }
    )
  }

  // ── GAP 7 fix: dual-write journal entry (DR 102 Bankalar, CR 321/421 Borç) ─
  // is_long_term: if expected_repayment_date is >12 months away or not set → long term (421)
  try {
    const isLongTerm = expected_repayment_date
      ? (new Date(expected_repayment_date).getTime() - Date.now()) > 365 * 24 * 60 * 60 * 1000
      : true  // No repayment date → conservative: long-term liability

    // Fetch partner name for the journal entry description
    const { data: partner } = await supabase
      .from('partners')
      .select('name')
      .eq('id', partner_id)
      .maybeSingle()

    const periodId = await resolvePeriodId(companyId, disbursement_date, supabase)
    await dualWrite({
      companyId,
      periodId,
      createdBy: uid,
      supabase,
      buildEntry: () => JournalEntryService.buildPartnerLoanEntry({
        partner_transaction_id: data.id,   // tranche ID used as source_id
        tx_date:                disbursement_date,
        amount_try:             principal_try,
        partner_name:           (partner?.name as string | null) ?? 'Ortak',
        is_long_term:           isLongTerm,
      }),
    })
  } catch (jeErr) {
    // Best-effort: tranche created successfully, journal entry failure is non-fatal
    console.warn('[partners/loan-tranches] journal entry failed (non-fatal):', jeErr instanceof Error ? jeErr.message : String(jeErr))
  }

  // Audit trail — loan tranche creation is a high-value financial event
  logAudit({
    userId:     uid,
    companyId,
    entityType: 'partner_loan_tranche',
    entityId:   data.id,
    action:     'create',
    newData:    { partner_id, principal_try, interest_rate_annual_pct, disbursement_date, expected_repayment_date },
  }).catch(err => console.warn('[loan-tranches] audit write failed:', err instanceof Error ? err.message : String(err)))

  return NextResponse.json(data, {
    status: 201,
    headers: { [REQUEST_ID_HEADER]: ctx.requestId },
  })
}
