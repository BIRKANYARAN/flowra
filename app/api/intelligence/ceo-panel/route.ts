// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/intelligence/ceo-panel
//
// CEO Intelligence Panel — multi-signal aggregation with health scoring.
// Auth: any authenticated company member.
// Cached: 5 minutes (revalidate: 300).
// ═══════════════════════════════════════════════════════════════════════════════

export const dynamic = 'force-dynamic'
export const revalidate = 300

import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth }            from '@/lib/api-auth'
import { reqCtx, apiError }          from '@/lib/api-utils'
import { CeoIntelligenceService }    from '@/lib/services/intelligence/ceo-intelligence.service'

export async function GET(req: NextRequest) {
  const ctx = reqCtx(req)
  try {
    const auth = await resolveApiAuth(req)
    if (!auth.ok) return auth.response
    const { uid, companyId, supabase } = auth

    const panel = await CeoIntelligenceService.getPanel(companyId, uid, supabase)

    return NextResponse.json(panel)
  } catch (e) {
    console.error('[ceo-panel]', e)
    return apiError(ctx, 'CEO istihbarat paneli alınamadı', 500, 'DB_READ_FAILED')
  }
}
