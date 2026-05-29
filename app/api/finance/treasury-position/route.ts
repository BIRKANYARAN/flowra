// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/finance/treasury-position
//
// Treasury Cash Position — multi-period cash view, velocity, liquidity ratios
// and short-term cash planning for Turkish SMEs.
//
// Auth:  resolveApiAuth + manager+
// Cache: revalidate: 300 (5 min — frequently refreshed for treasury)
// ═══════════════════════════════════════════════════════════════════════════════

export const dynamic    = 'force-dynamic'
export const revalidate = 300

import { NextRequest, NextResponse }         from 'next/server'
import { resolveApiAuth }                    from '@/lib/api-auth'
import { reqCtx, apiError }                  from '@/lib/api-utils'
import { TreasuryPositionService }           from '@/lib/services/finance/treasury-position.service'

export async function GET(req: NextRequest) {
  const ctx = reqCtx(req)
  try {
    const auth = await resolveApiAuth(req)
    if (!auth.ok) return auth.response

    const { companyId, supabase } = auth

    const service = new TreasuryPositionService(supabase)
    const report  = await service.getReport(companyId)

    return NextResponse.json({ report })
  } catch (e) {
    console.error('[finance/treasury-position]', e)
    return apiError(ctx, 'Hazine nakit pozisyonu alınamadı', 500, 'DB_READ_FAILED')
  }
}
