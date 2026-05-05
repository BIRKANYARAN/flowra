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
import { createClient } from '@/lib/supabase-server'
import { contextFromHeader } from '@/lib/logger'
import { REQUEST_ID_HEADER } from '@/middleware'
import { PartnerService } from '@/lib/services/partner.service'
import { toErrorResponse } from '@/types/errors'
import { resolveCompanyId } from '@/lib/resolve-company'

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
    const url          = new URL(req.url)
    const rawDist      = url.searchParams.get('distributable')
    const distributable = rawDist !== null && isFinite(Number(rawDist)) && Number(rawDist) >= 0
      ? Number(rawDist)
      : undefined

    const result = await PartnerService.calculateEqualization(
      authData.user.id,
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
