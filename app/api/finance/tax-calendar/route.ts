// ─────────────────────────────────────────────────────────────────────────────
// GET /api/finance/tax-calendar
//
// Returns forward-looking Turkish tax obligation calendar for next 12 months.
// Includes KDV, Muhtasar, Geçici Vergi, Kurumlar Vergisi, and SGK obligations
// with estimated amounts and due dates based on company's current financials.
//
// Auth: manager+ access
// Cache: revalidate every 3600 seconds (1 hour)
// ─────────────────────────────────────────────────────────────────────────────

export const dynamic   = 'force-dynamic'
export const revalidate = 3600

import { NextRequest, NextResponse }    from 'next/server'
import { resolveApiAuth }               from '@/lib/api-auth'
import { TaxCalendarService }           from '@/lib/services/finance/tax-calendar.service'
import { REQUEST_ID_HEADER }            from '@/middleware'

export async function GET(req: NextRequest) {
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response
  const { companyId, supabase, ctx } = auth

  try {
    const service = new TaxCalendarService(supabase)
    const report  = await service.getReport(companyId)
    return NextResponse.json(
      { report },
      { headers: { [REQUEST_ID_HEADER]: ctx.requestId } },
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json(
      { error: msg, code: 'SERVICE_ERROR', type: 'SYSTEM' },
      { status: 500, headers: { [REQUEST_ID_HEADER]: ctx.requestId } },
    )
  }
}
