// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/partners/equalization
//
// Returns equalization analysis across all active partners.
//
// Query params:
//   distributable   number   (optional) — amount to distribute after equalization
//
// Response: EqualizationResult
//   {
//     baseline_per_unit:  number,
//     total_equalization: number,
//     distributable:      number,
//     remaining_after_eq: number,
//     entries: [
//       {
//         partner_id, partner_name, share_ratio,
//         total_distributed_try, per_unit_contribution,
//         equalization_amount, pro_rata_share, total_payout
//       }
//     ]
//   }
// ═══════════════════════════════════════════════════════════════════════════════

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { REQUEST_ID_HEADER } from '@/middleware'
import { PartnerService } from '@/lib/services/partner.service'
import { toErrorResponse } from '@/types/errors'
import { resolveApiAuth } from '@/lib/api-auth'

export async function GET(req: NextRequest) {
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response
  const { uid, companyId, supabase, ctx } = auth

  try {
    const url          = new URL(req.url)
    const rawDist      = url.searchParams.get('distributable')
    const distributable = rawDist !== null && isFinite(Number(rawDist)) && Number(rawDist) >= 0
      ? Number(rawDist)
      : undefined

    const result = await PartnerService.calculateEqualization(
      uid,
      companyId,
      distributable,
      ctx,
    )

    return NextResponse.json(result, { headers: { [REQUEST_ID_HEADER]: ctx.requestId } })
  } catch (err) {
    const { body, status } = toErrorResponse(err)
    return NextResponse.json(body, { status, headers: { [REQUEST_ID_HEADER]: ctx.requestId } })
  }
}
