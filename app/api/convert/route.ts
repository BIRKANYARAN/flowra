export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { REQUEST_ID_HEADER } from '@/middleware'
import { SaleService } from '@/lib/services/sale.service'
import { requireUUID, requireArray, ValidationError } from '@/lib/validation'
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

    const proforma_id   = requireUUID(body.proforma_id, 'proforma_id')
    const rawItemIds    = requireArray<unknown>(body.item_ids ?? [], 'item_ids')
    const rawQtys       = requireArray<unknown>(body.quantities ?? [], 'quantities')
    const interest_days = Math.max(0, Number(body.interest_days ?? 0))

    const item_ids:    string[] = rawItemIds.map((v, i) => requireUUID(v, `item_ids[${i}]`))
    const quantities: number[]  = rawQtys.map((v, i) => {
      const n = Number(v)
      if (!isFinite(n) || n <= 0) throw new ValidationError(`quantities[${i}]`, 'Miktar sıfırdan büyük olmalıdır')
      return n
    })

    const result = await SaleService.convertProforma(uid, { idempotency_key: body.idempotency_key, proforma_id, item_ids, quantities, interest_days }, companyId, ctx)
    return NextResponse.json(result, { status: result.cached ? 200 : 201, headers: { [REQUEST_ID_HEADER]: ctx.requestId } })

  } catch (err) {
    if (err instanceof ValidationError) {
      return NextResponse.json({ error: err.message, code: 'VALIDATION_ERROR', type: 'BUSINESS', field: err.field }, { status: 422 })
    }
    const { body, status } = toErrorResponse(err)
    return NextResponse.json(body, { status, headers: { [REQUEST_ID_HEADER]: ctx.requestId } })
  }
}
