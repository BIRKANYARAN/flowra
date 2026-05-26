// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/intelligence/setup-checklist
//
// Company Setup Checklist — reads actual DB state and returns an onboarding
// progress report. Admin role required.
// Cached: 60 seconds (revalidate: 60).
// ═══════════════════════════════════════════════════════════════════════════════

export const dynamic   = 'force-dynamic'
export const revalidate = 60

import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth }            from '@/lib/api-auth'
import { reqCtx, apiError }          from '@/lib/api-utils'
import { SetupChecklistService }     from '@/lib/services/intelligence/setup-checklist.service'

export async function GET(req: NextRequest) {
  const ctx = reqCtx(req)
  try {
    const auth = await resolveApiAuth(req)
    if (!auth.ok) return auth.response
    const { uid, companyId, supabase } = auth

    // Admin role check
    const { data: memberRow } = await supabase
      .from('company_members')
      .select('role')
      .eq('company_id', companyId)
      .eq('user_id', uid)
      .maybeSingle()

    if (memberRow?.role !== 'admin') {
      return NextResponse.json(
        { error: 'Bu sayfaya yalnızca yöneticiler erişebilir.', code: 'FORBIDDEN', type: 'SECURITY' },
        { status: 403 },
      )
    }

    const report = await SetupChecklistService.getReport(companyId, supabase)

    return NextResponse.json({ report })
  } catch (e) {
    console.error('[setup-checklist]', e)
    return apiError(ctx, 'Kurulum durumu alınamadı', 500, 'DB_READ_FAILED')
  }
}
