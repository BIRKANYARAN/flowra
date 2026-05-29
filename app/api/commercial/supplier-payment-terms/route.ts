// ── GET /api/commercial/supplier-payment-terms ────────────────────────────────
// Returns SupplierPaymentTermsReport: payment terms analysis, discount
// opportunities, and optimization score for all suppliers.
//
// Auth: manager+ only.
// Cache: revalidate every 1800 seconds (30 min).

export const revalidate = 1800

import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth } from '@/lib/api-auth'
import { apiError, reqCtx } from '@/lib/api-utils'
import { SupplierPaymentTermsService } from '@/lib/services/commercial/supplier-payment-terms.service'

export async function GET(req: NextRequest) {
  const ctx  = reqCtx(req)
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response

  const { companyId, supabase } = auth

  try {
    const service = new SupplierPaymentTermsService(supabase)
    const report  = await service.getReport(companyId)
    return NextResponse.json({ report })
  } catch (err) {
    console.error('[supplier-payment-terms]', err)
    return apiError(ctx, 'Tedarikçi ödeme koşulları analizi hesaplanamadı', 500)
  }
}
