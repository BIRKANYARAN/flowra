// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/intelligence/narrative
//
// Financial Narrative Engine — deterministic Turkish narrative summaries.
// Auth: manager+ access.
// Cached: 300s (revalidate: 300)
//
// Query params:
//   context — NarrativeContext (default: 'ceo_summary')
//             one of: ceo_summary | cfo_briefing | monthly_report | alert_context
//
// Returns: { narrative: FinancialNarrative }
// ═══════════════════════════════════════════════════════════════════════════════

export const dynamic   = 'force-dynamic'
export const revalidate = 300

import { NextRequest, NextResponse }          from 'next/server'
import { resolveApiAuth }                     from '@/lib/api-auth'
import { apiError, reqCtx }                   from '@/lib/api-utils'
import { FinancialNarrativeService }          from '@/lib/services/intelligence/financial-narrative.service'
import type { NarrativeContext }              from '@/lib/services/intelligence/financial-narrative.service'

const VALID_CONTEXTS: NarrativeContext[] = ['ceo_summary', 'cfo_briefing', 'monthly_report', 'alert_context']

export async function GET(req: NextRequest) {
  const ctx = reqCtx(req)
  try {
    const auth = await resolveApiAuth(req)
    if (!auth.ok) return auth.response
    const { companyId, supabase } = auth

    const sp      = req.nextUrl.searchParams
    const rawCtx  = sp.get('context') ?? 'ceo_summary'
    const context = VALID_CONTEXTS.includes(rawCtx as NarrativeContext)
      ? (rawCtx as NarrativeContext)
      : 'ceo_summary'

    const service   = new FinancialNarrativeService(supabase)
    const narrative = await service.generateReport(companyId, context)

    return NextResponse.json({ narrative })
  } catch (e) {
    console.error('[intelligence/narrative]', e)
    return apiError(ctx, 'Finansal özet oluşturulamadı', 500, 'DB_READ_FAILED')
  }
}
