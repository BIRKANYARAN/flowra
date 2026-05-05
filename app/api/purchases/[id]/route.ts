// ═══════════════════════════════════════════════════════════════════════════════
// /api/purchases/[id]
//
//   GET     → header + lines + costs + computed allocation preview
//   DELETE  → cancel (drafts only — DB trigger blocks finalized hard-delete)
// ═══════════════════════════════════════════════════════════════════════════════

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { contextFromHeader } from '@/lib/logger'
import { REQUEST_ID_HEADER } from '@/middleware'
import { PurchaseService } from '@/lib/services/purchase.service'
import { CostService } from '@/lib/services/cost.service'
import { toErrorResponse } from '@/types/errors'
import { resolveCompanyId } from '@/lib/resolve-company'

interface Ctx { params: { id: string } }

export async function GET(req: NextRequest, { params }: Ctx) {
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
    const detail = await PurchaseService.getById(authData.user.id, companyId, params.id)

    // Allocation is recomputed on read for drafts (lets the UI see the live
    // preview as the user edits). For finalized rows it's computed from the
    // same source-of-truth math, but the lots are already stamped — we
    // surface this so the detail screen can reconcile.
    let allocation = null
    try {
      allocation = await CostService.calculateUnitCost(params.id)
    } catch {
      // empty draft — allocation is meaningless, return null and move on
    }

    return NextResponse.json(
      { ...detail, allocation },
      { headers: { [REQUEST_ID_HEADER]: ctx.requestId } }
    )
  } catch (err) {
    const { body, status } = toErrorResponse(err)
    return NextResponse.json(body, { status, headers: { [REQUEST_ID_HEADER]: ctx.requestId } })
  }
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
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
    await PurchaseService.cancel(authData.user.id, params.id, companyId, ctx)
    return NextResponse.json({ ok: true }, { headers: { [REQUEST_ID_HEADER]: ctx.requestId } })
  } catch (err) {
    const { body, status } = toErrorResponse(err)
    return NextResponse.json(body, { status, headers: { [REQUEST_ID_HEADER]: ctx.requestId } })
  }
}
