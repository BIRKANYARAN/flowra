export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { contextFromHeader } from '@/lib/logger'
import { REQUEST_ID_HEADER } from '@/middleware'
import { ProformaService, ValidationError } from '@/lib/services/proforma.service'
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
    const result = await ProformaService.create(user.id, body, companyId, ctx)
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
    const body   = await req.json()
    const result = await ProformaService.update(user.id, companyId, body, ctx)
    return NextResponse.json(result, { headers: { [REQUEST_ID_HEADER]: ctx.requestId } })
  } catch (err) {
    if (err instanceof ValidationError) {
      return NextResponse.json({ error: err.message, code: 'VALIDATION_ERROR', type: 'BUSINESS', field: err.field }, { status: 422 })
    }
    const { body, status } = toErrorResponse(err)
    return NextResponse.json(body, { status, headers: { [REQUEST_ID_HEADER]: ctx.requestId } })
  }
}
