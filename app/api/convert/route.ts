export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { REQUEST_ID_HEADER } from '@/middleware'
import { SaleService } from '@/lib/services/sale.service'
import { requireUUID, ValidationError } from '@/lib/validation'
import { toErrorResponse } from '@/types/errors'
import { resolveApiAuth } from '@/lib/api-auth'

export async function POST(req: NextRequest) {
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response
  const { uid, companyId, supabase, ctx } = auth


  try {
    const body = await req.json()
    if (!body.idempotency_key || typeof body.idempotency_key !== 'string') {
      return NextResponse.json({ error: 'idempotency_key zorunludur', code: 'IDEMPOTENCY_KEY_MISSING', type: 'BUSINESS' }, { status: 422 })
    }

    const proforma_id = requireUUID(body.proforma_id, 'proforma_id')

    // Optional date fields
    const sale_date = (body.sale_date && /^\d{4}-\d{2}-\d{2}$/.test(body.sale_date)) ? body.sale_date : undefined
    const due_date  = (body.due_date  && /^\d{4}-\d{2}-\d{2}$/.test(body.due_date))  ? body.due_date  : undefined
    const bank_id   = typeof body.bank_id === 'string' && body.bank_id.trim() ? body.bank_id.trim() : undefined
    const notes          = typeof body.notes === 'string' ? body.notes.slice(0, 2000) : undefined
    const internal_notes = typeof body.internal_notes === 'string' ? body.internal_notes.slice(0, 2000) : undefined

    const result = await SaleService.convertProforma(uid, {
      idempotency_key: body.idempotency_key,
      proforma_id,
      sale_date,
      due_date,
      bank_id,
      notes,
      internal_notes,
    }, companyId, ctx, supabase)

    return NextResponse.json(result, { status: result.cached ? 200 : 201, headers: { [REQUEST_ID_HEADER]: ctx.requestId } })

  } catch (err) {
    if (err instanceof ValidationError) {
      return NextResponse.json({ error: err.message, code: 'VALIDATION_ERROR', type: 'BUSINESS', field: err.field }, { status: 422 })
    }
    const { body, status } = toErrorResponse(err)
    return NextResponse.json(body, { status, headers: { [REQUEST_ID_HEADER]: ctx.requestId } })
  }
}
