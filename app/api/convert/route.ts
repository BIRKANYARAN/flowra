export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { contextFromHeader } from '@/lib/logger'
import { REQUEST_ID_HEADER } from '@/middleware'
import { SaleService } from '@/lib/services/sale.service'
import { requireUUID, requireArray, ValidationError } from '@/lib/validation'
import { toErrorResponse } from '@/types/errors'
import { resolveCompanyId } from '@/lib/resolve-company'

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData?.user) {
    return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED', type: 'SECURITY' }, { status: 401 })
  }
  const user = authData.user

  let companyId: string
  try { companyId = await resolveCompanyId(user.id, supabase) }
  catch { return NextResponse.json({ error: 'Şirket bilgisi alınamadı', code: 'COMPANY_NOT_RESOLVED', type: 'SYSTEM' }, { status: 409 }) }

  const ctx = contextFromHeader(req.headers.get(REQUEST_ID_HEADER), user.id)

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

    const result = await SaleService.convertProforma(user.id, { idempotency_key: body.idempotency_key, proforma_id, item_ids, quantities, interest_days }, companyId, ctx)
    return NextResponse.json(result, { status: result.cached ? 200 : 201, headers: { [REQUEST_ID_HEADER]: ctx.requestId } })

  } catch (err) {
    if (err instanceof ValidationError) {
      return NextResponse.json({ error: err.message, code: 'VALIDATION_ERROR', type: 'BUSINESS', field: err.field }, { status: 422 })
    }
    const { body, status } = toErrorResponse(err)
    return NextResponse.json(body, { status, headers: { [REQUEST_ID_HEADER]: ctx.requestId } })
  }
}
