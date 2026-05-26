// GET /api/partners/equity-dilution
// Returns an equity dilution simulation report for the authenticated company.
// Admin role required (simulation is sensitive financial modelling).

import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth } from '@/lib/api-auth'
import { apiError, reqCtx } from '@/lib/api-utils'
import { EquityDilutionService } from '@/lib/services/pcle/equity-dilution.service'

export const revalidate = 60

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

    const report = await EquityDilutionService.getReport(companyId, supabase)
    return NextResponse.json({ report })
  } catch (err) {
    console.error('[equity-dilution GET]', err instanceof Error ? err.message : err)
    return apiError(ctx, 'Seyreltme raporu hesaplanamadı', 500)
  }
}
