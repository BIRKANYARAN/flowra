// ── /api/onboarding/status ────────────────────────────────────────────────────
// GET — first-run setup checklist for the current company.
//
// Access: any authenticated user with a company.
// Read-only; small COUNT queries scoped to the company.

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth } from '@/lib/api-auth'
import { apiError, reqCtx } from '@/lib/api-utils'
import { OnboardingService } from '@/lib/services/onboarding.service'

export async function GET(req: NextRequest) {
  const ctx = reqCtx(req)
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response

  const { companyId, supabase } = auth

  try {
    const status = await OnboardingService.getStatus(companyId, supabase)
    return NextResponse.json(
      { status },
      { headers: { 'Cache-Control': 'private, no-store' } },
    )
  } catch (err) {
    console.error('[onboarding/status]', err)
    return apiError(ctx, 'Kurulum durumu alınamadı', 500)
  }
}
