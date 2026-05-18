// ═══════════════════════════════════════════════════════════════════════════════
// /api/purchases/[id]
//
//   GET     → header + lines + costs + computed allocation preview
//   DELETE  → cancel (drafts only — DB trigger blocks finalized hard-delete)
// ═══════════════════════════════════════════════════════════════════════════════

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { REQUEST_ID_HEADER } from '@/middleware'
import { PurchaseService } from '@/lib/services/purchase.service'
import { CostService } from '@/lib/services/cost.service'
import { toErrorResponse } from '@/types/errors'
import { resolveApiAuth } from '@/lib/api-auth'

interface Ctx { params: { id: string } }

export async function GET(req: NextRequest, { params }: Ctx) {
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response
  const { uid, companyId, supabase, ctx } = auth

  try {
    const detail = await PurchaseService.getById(uid, companyId, params.id, supabase)

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
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response
  const { uid, companyId, supabase, ctx } = auth

  try {
    await PurchaseService.cancel(uid, params.id, companyId, ctx, supabase)
    return NextResponse.json({ ok: true }, { headers: { [REQUEST_ID_HEADER]: ctx.requestId } })
  } catch (err) {
    const { body, status } = toErrorResponse(err)
    return NextResponse.json(body, { status, headers: { [REQUEST_ID_HEADER]: ctx.requestId } })
  }
}
