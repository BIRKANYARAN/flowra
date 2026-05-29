// ── /api/commercial/receivables-aging-enhanced ───────────────────────────────
// GET — Returns enhanced receivables aging report with customer-level detail,
// DSO trends, collection efficiency, bad debt provision, and risk scoring.
// Access: manager+
// Cache: revalidate every 300 seconds (5 min — collections is urgent).

export const dynamic    = 'force-dynamic'
export const revalidate = 300

import { NextRequest, NextResponse }              from 'next/server'
import { resolveApiAuth }                          from '@/lib/api-auth'
import { apiError, reqCtx }                        from '@/lib/api-utils'
import { ReceivablesAgingEnhancedService }         from '@/lib/services/commercial/receivables-aging-enhanced.service'

export async function GET(req: NextRequest) {
  const ctx  = reqCtx(req)
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response

  const { companyId, supabase } = auth

  try {
    const service = new ReceivablesAgingEnhancedService(supabase)
    const report  = await service.getReport(companyId)
    return NextResponse.json({ report })
  } catch (err) {
    console.error('[receivables-aging-enhanced]', err)
    return apiError(ctx, 'Gelişmiş alacak yaşlandırma analizi hesaplanamadı', 500)
  }
}
