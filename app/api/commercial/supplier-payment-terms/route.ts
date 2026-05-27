// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/commercial/supplier-payment-terms
//
// Supplier Payment Terms Analytics — DPO, payment timing breakdown, supplier
// scores and top creditors by outstanding balance.
//
// Auth: any authenticated company member (manager+).
// Cache: revalidate every 300 seconds.
// ═══════════════════════════════════════════════════════════════════════════════

export const revalidate = 300

import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth } from '@/lib/api-auth'
import { SupplierPaymentTermsService } from '@/lib/services/commercial/supplier-payment-terms.service'
import { REQUEST_ID_HEADER } from '@/middleware'
import { toErrorResponse } from '@/types/errors'

export async function GET(req: NextRequest) {
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response
  const { companyId, supabase, ctx } = auth

  try {
    const service = new SupplierPaymentTermsService(supabase)
    const summary = await service.getSummary(companyId)

    return NextResponse.json(
      { summary },
      { headers: { [REQUEST_ID_HEADER]: ctx.requestId } },
    )
  } catch (err) {
    const { body, status } = toErrorResponse(err)
    return NextResponse.json(body, { status, headers: { [REQUEST_ID_HEADER]: ctx.requestId } })
  }
}
