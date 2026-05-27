// GET /api/partners/equity-dilution
// Returns a capital structure / equity dilution report for the authenticated company.
// Admin role required (financial modelling is sensitive data).

import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth } from '@/lib/api-auth'
import { apiError, reqCtx } from '@/lib/api-utils'
import { CapitalStructureService } from '@/lib/services/pcle/equity-dilution.service'

export const revalidate = 3600

export async function GET(req: NextRequest) {
  const ctx = reqCtx(req)
  try {
    const auth = await resolveApiAuth(req)
    if (!auth.ok) return auth.response
    const { companyId, supabase, uid } = auth

    // Admin-only gate
    const { data: member } = await supabase
      .from('company_members')
      .select('role')
      .eq('company_id', companyId)
      .eq('user_id', uid)
      .single()

    if (member?.role !== 'admin') {
      return apiError(ctx, 'Yönetici yetkisi gerekli', 403, 'FORBIDDEN')
    }

    const service = new CapitalStructureService(supabase)
    const report  = await service.getReport(companyId)
    return NextResponse.json({ report })
  } catch (err) {
    console.error('[equity-dilution GET]', err instanceof Error ? err.message : err)
    return apiError(ctx, 'Sermaye yapısı raporu hesaplanamadı', 500)
  }
}
