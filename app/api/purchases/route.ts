// ═══════════════════════════════════════════════════════════════════════════════
// /api/purchases — Phase 3 cost-engine entry point
//
//   GET  ?status=draft|finalized|cancelled  → list (owner-scoped)
//   POST                                    → create draft
//                                             body: CreatePurchaseInput
//
// Single-purchase routes live under /api/purchases/[id]/...
// ═══════════════════════════════════════════════════════════════════════════════

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { contextFromHeader } from '@/lib/logger'
import { REQUEST_ID_HEADER } from '@/middleware'
import { PurchaseService } from '@/lib/services/purchase.service'
import { toErrorResponse } from '@/types/errors'
import { resolveCompanyId } from '@/lib/resolve-company'
import { checkPeriodGuard } from '@/lib/middleware/period-guard'
import type { PurchaseStatus } from '@/types'

const VALID_STATUS = new Set<PurchaseStatus>(['draft', 'finalized', 'cancelled'])

export async function GET(req: NextRequest) {
  const supabase = createClient()
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData?.user) {
    return NextResponse.json(
      { error: 'Unauthorized', code: 'UNAUTHORIZED', type: 'SECURITY' },
      { status: 401 }
    )
  }
  const ctx = contextFromHeader(req.headers.get(REQUEST_ID_HEADER), authData.user.id)

  let companyId: string
  try { companyId = await resolveCompanyId(authData.user.id, supabase) }
  catch { return NextResponse.json({ error: 'Şirket bilgisi alınamadı', code: 'COMPANY_NOT_RESOLVED', type: 'SYSTEM' }, { status: 409 }) }

  try {
    const url    = new URL(req.url)
    const status = url.searchParams.get('status') as PurchaseStatus | null
    const filter = status && VALID_STATUS.has(status) ? status : undefined

    const purchases = await PurchaseService.list(authData.user.id, companyId, filter)
    return NextResponse.json(
      { purchases, count: purchases.length },
      { headers: { [REQUEST_ID_HEADER]: ctx.requestId } }
    )
  } catch (err) {
    const { body, status } = toErrorResponse(err)
    return NextResponse.json(body, { status, headers: { [REQUEST_ID_HEADER]: ctx.requestId } })
  }
}

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData?.user) {
    return NextResponse.json(
      { error: 'Unauthorized', code: 'UNAUTHORIZED', type: 'SECURITY' },
      { status: 401 }
    )
  }
  const ctx = contextFromHeader(req.headers.get(REQUEST_ID_HEADER), authData.user.id)

  let companyId: string
  try { companyId = await resolveCompanyId(authData.user.id, supabase) }
  catch { return NextResponse.json({ error: 'Şirket bilgisi alınamadı', code: 'COMPANY_NOT_RESOLVED', type: 'SYSTEM' }, { status: 409 }) }

  try {
    const body = await req.json().catch(() => ({} as Record<string, unknown>))
    const txDate = typeof body.purchase_date === 'string' ? body.purchase_date : new Date().toISOString().slice(0, 10)
    const guard = await checkPeriodGuard(companyId, txDate, supabase)
    if (guard.blocked) {
      return NextResponse.json(
        { error: guard.reason, code: 'PERIOD_LOCKED', type: 'BUSINESS' },
        { status: 409, headers: { [REQUEST_ID_HEADER]: ctx.requestId } }
      )
    }
    const result = await PurchaseService.createDraft(authData.user.id, {
      supplier_name: typeof body.supplier_name === 'string' ? body.supplier_name : '',
      purchase_date: typeof body.purchase_date === 'string' ? body.purchase_date : undefined,
      currency:      String(body.currency ?? 'TRY'),
      fx_rate:       Number(body.fx_rate ?? 1),
      notes:         typeof body.notes === 'string' ? body.notes : null,
      lines:         Array.isArray(body.lines) ? body.lines : [],
      costs:         Array.isArray(body.costs) ? body.costs : [],
    }, companyId, ctx)

    return NextResponse.json(result, { status: 201, headers: { [REQUEST_ID_HEADER]: ctx.requestId } })
  } catch (err) {
    const { body, status } = toErrorResponse(err)
    return NextResponse.json(body, { status, headers: { [REQUEST_ID_HEADER]: ctx.requestId } })
  }
}
