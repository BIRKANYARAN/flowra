// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/partners/loan-tranches — create a new partner loan tranche
// ═══════════════════════════════════════════════════════════════════════════════

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth } from '@/lib/api-auth'
import { REQUEST_ID_HEADER } from '@/middleware'

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
      interest_rate_annual_pct,
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

  return NextResponse.json(data, {
    status: 201,
    headers: { [REQUEST_ID_HEADER]: ctx.requestId },
  })
}
