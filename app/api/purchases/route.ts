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
import { REQUEST_ID_HEADER } from '@/middleware'
import { PurchaseService } from '@/lib/services/purchase.service'
import { toErrorResponse } from '@/types/errors'
import { checkPeriodGuard } from '@/lib/middleware/period-guard'
import type { PurchaseStatus } from '@/types'
import { resolveApiAuth } from '@/lib/api-auth'

const VALID_STATUS = new Set<PurchaseStatus>(['draft', 'finalized', 'cancelled'])

export async function GET(req: NextRequest) {
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response
  const { uid, companyId, supabase, ctx } = auth

  try {
    const url    = new URL(req.url)
    const status = url.searchParams.get('status') as PurchaseStatus | null
    const filter = status && VALID_STATUS.has(status) ? status : undefined

    const purchases = await PurchaseService.list(uid, companyId, filter, supabase)
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
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response
  const { uid, companyId, supabase, ctx } = auth

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
    const result = await PurchaseService.createDraft(uid, {
      supplier_name: typeof body.supplier_name === 'string' ? body.supplier_name : '',
      purchase_date: typeof body.purchase_date === 'string' ? body.purchase_date : undefined,
      currency:      String(body.currency ?? 'TRY'),
      fx_rate:       Number(body.fx_rate ?? 1),
      notes:         typeof body.notes === 'string' ? body.notes : null,
      lines:         Array.isArray(body.lines) ? body.lines : [],
      costs:         Array.isArray(body.costs) ? body.costs : [],
    }, companyId, ctx, supabase)

    return NextResponse.json(result, { status: 201, headers: { [REQUEST_ID_HEADER]: ctx.requestId } })
  } catch (err) {
    const { body, status } = toErrorResponse(err)
    return NextResponse.json(body, { status, headers: { [REQUEST_ID_HEADER]: ctx.requestId } })
  }
}
