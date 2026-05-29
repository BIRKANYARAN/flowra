// ── /api/commercial/collections-aging ────────────────────────────────────────
// GET — Returns CollectionsAging report: aging buckets, recovery probability,
// priority ranking, write-off risk, and DSO.
// Access: manager+
// Cache: revalidate every 300 seconds (5 min — collections is urgent).

export const dynamic   = 'force-dynamic'
export const revalidate = 300

import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth } from '@/lib/api-auth'
import { apiError, reqCtx } from '@/lib/api-utils'
import { CollectionsAgingService } from '@/lib/services/commercial/collections-aging.service'

export async function GET(req: NextRequest) {
  const ctx  = reqCtx(req)
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response

  const { companyId, supabase } = auth

  try {
    const service = new CollectionsAgingService(supabase)
    const report  = await service.getReport(companyId)
    return NextResponse.json({ report })
  } catch (err) {
    console.error('[collections-aging]', err)
    return apiError(ctx, 'Alacak yaşlandırma analizi hesaplanamadı', 500)
  }
}
