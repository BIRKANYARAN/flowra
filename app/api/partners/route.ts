// ═══════════════════════════════════════════════════════════════════════════════
// GET  /api/partners       — list all partners (with balances)
// POST /api/partners       — create a new partner
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
    const [partners, balances] = await Promise.all([
      PartnerService.listPartners(uid, companyId, ctx),
      PartnerService.getPartnerBalances(uid, companyId, ctx),
    ])

    // Merge balance data into partner list
    const balanceMap = new Map(balances.map(b => [b.partner_id, b]))
    const result = partners.map(p => ({
      ...p,
      balance: balanceMap.get(p.id) ?? null,
    }))

    return NextResponse.json(result, { headers: { [REQUEST_ID_HEADER]: ctx.requestId } })
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
    let body: Record<string, unknown>
    try {
      body = await req.json()
    } catch {
      return NextResponse.json(
        { error: 'Geçersiz JSON', code: 'VALIDATION_ERROR', type: 'BUSINESS' },
        { status: 422, headers: { [REQUEST_ID_HEADER]: ctx.requestId } }
      )
    }

    const name        = typeof body.name === 'string' ? body.name.trim() : ''
    const share_ratio = Number(body.share_ratio)

    if (!name) {
      return NextResponse.json(
        { error: 'name zorunludur', code: 'VALIDATION_ERROR', type: 'BUSINESS' },
        { status: 422, headers: { [REQUEST_ID_HEADER]: ctx.requestId } }
      )
    }

    const partner = await PartnerService.createPartner(
      uid,
      {
        name,
        share_ratio,
        is_active: body.is_active !== false,
        notes:     typeof body.notes === 'string' ? body.notes : undefined,
      },
      companyId,
      ctx,
    )

    return NextResponse.json(partner, {
      status:  201,
      headers: { [REQUEST_ID_HEADER]: ctx.requestId },
    })
  } catch (err) {
    const { body, status } = toErrorResponse(err)
    return NextResponse.json(body, { status, headers: { [REQUEST_ID_HEADER]: ctx.requestId } })
  }
}
