export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { REQUEST_ID_HEADER } from '@/middleware'
import { ProformaService, ValidationError } from '@/lib/services/proforma.service'
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
    const result = await ProformaService.create(uid, body, companyId, ctx, supabase)
    return NextResponse.json(
      { id: result.id, proforma_no: result.proforma_no, cached: result.cached ?? false },
      { status: result.cached ? 200 : 201, headers: { [REQUEST_ID_HEADER]: ctx.requestId } }
    )
  } catch (err) {
    if (err instanceof ValidationError) {
      return NextResponse.json({ error: err.message, code: 'VALIDATION_ERROR', type: 'BUSINESS', field: err.field }, { status: 422 })
    }
    const { body, status } = toErrorResponse(err)
    return NextResponse.json(body, { status, headers: { [REQUEST_ID_HEADER]: ctx.requestId } })
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response
  const { uid, companyId, supabase, ctx } = auth


  try {
    const body   = await req.json()
    const result = await ProformaService.update(uid, companyId, body, ctx)
    return NextResponse.json(result, { headers: { [REQUEST_ID_HEADER]: ctx.requestId } })
  } catch (err) {
    if (err instanceof ValidationError) {
      return NextResponse.json({ error: err.message, code: 'VALIDATION_ERROR', type: 'BUSINESS', field: err.field }, { status: 422 })
    }
    const { body, status } = toErrorResponse(err)
    return NextResponse.json(body, { status, headers: { [REQUEST_ID_HEADER]: ctx.requestId } })
  }
}
