// ═══════════════════════════════════════════════════════════════════════════════
// GET  /api/partners/[id]/transactions  — list transactions for a partner
// POST /api/partners/[id]/transactions  — record a new transaction
//
// tx_type: 'loan_in' | 'loan_out' | 'salary' | 'board_fee' | 'dividend'
// ═══════════════════════════════════════════════════════════════════════════════

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { REQUEST_ID_HEADER } from '@/middleware'
import { PartnerService } from '@/lib/services/partner.service'
import { toErrorResponse } from '@/types/errors'
import { resolveApiAuth } from '@/lib/api-auth'

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response
  const { uid, companyId, supabase, ctx } = auth

  try {
    const txs = await PartnerService.listTransactions(uid, companyId, params.id, ctx)
    return NextResponse.json(txs, { headers: { [REQUEST_ID_HEADER]: ctx.requestId } })
  } catch (err) {
    const { body, status } = toErrorResponse(err)
    return NextResponse.json(body, { status, headers: { [REQUEST_ID_HEADER]: ctx.requestId } })
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response
  const { uid, companyId, supabase, ctx } = auth

  try {
    let body: Record<string, unknown>
    try {
      body = await req.json()
    } catch {
      return NextResponse.json(
        { error: 'Geçersiz JSON', code: 'VALIDATION_ERROR', type: 'BUSINESS' },
        { status: 422, headers: { [REQUEST_ID_HEADER]: ctx.requestId } }
      )
    }

    const tx = await PartnerService.addTransaction(
      uid,
      params.id,
      {
        tx_type:  String(body.tx_type ?? ''),
        amount:   Number(body.amount),
        currency: String(body.currency ?? 'TRY'),
        fx_rate:  Number(body.fx_rate ?? 1),
        tx_date:  String(body.tx_date ?? ''),
        notes:    typeof body.notes === 'string' ? body.notes : undefined,
      },
      companyId,
      ctx,
    )

    return NextResponse.json(tx, {
      status:  201,
      headers: { [REQUEST_ID_HEADER]: ctx.requestId },
    })
  } catch (err) {
    const { body, status } = toErrorResponse(err)
    return NextResponse.json(body, { status, headers: { [REQUEST_ID_HEADER]: ctx.requestId } })
  }
}
