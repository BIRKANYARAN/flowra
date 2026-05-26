// ─────────────────────────────────────────────────────────────────────────────
// GET /api/intelligence/narrative?from=YYYY-MM-DD&to=YYYY-MM-DD
//
// Returns a FinancialNarrative — a rule-based Turkish financial brief.
// No LLM required. Auth: any authenticated member.
// Cached for 5 minutes (revalidate: 300).
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth }            from '@/lib/api-auth'
import { apiError, reqCtx }          from '@/lib/api-utils'
import { NarrativeService }          from '@/lib/services/intelligence/narrative.service'

export const dynamic = 'force-dynamic'
export const revalidate = 300 // 5 minutes

export async function GET(req: NextRequest) {
  const ctx = reqCtx(req)

  try {
    const auth = await resolveApiAuth(req)
    if (!auth.ok) return auth.response

    const { uid, companyId, supabase } = auth

    // ── Period params ──────────────────────────────────────────────────────────
    const sp   = req.nextUrl.searchParams
    const from = sp.get('from')
    const to   = sp.get('to')

    if (!from || !to) {
      return apiError(ctx, 'from ve to parametreleri zorunludur (YYYY-MM-DD)', 400, 'MISSING_PARAMS', 'BUSINESS')
    }

    // Basic date validation
    const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
    if (!DATE_RE.test(from) || !DATE_RE.test(to)) {
      return apiError(ctx, 'Geçersiz tarih formatı — YYYY-MM-DD bekleniyor', 400, 'INVALID_DATE', 'BUSINESS')
    }
    if (from > to) {
      return apiError(ctx, 'from tarihi to tarihinden büyük olamaz', 400, 'INVALID_PERIOD', 'BUSINESS')
    }

    // ── Generate narrative ─────────────────────────────────────────────────────
    const narrative = await NarrativeService.generatePeriodNarrative(
      companyId,
      uid,
      supabase,
      { from, to },
    )

    return NextResponse.json(narrative)
  } catch (e) {
    console.error('[api/intelligence/narrative]', e instanceof Error ? e.message : String(e))
    return apiError(ctx, 'Finansal özet oluşturulamadı', 500)
  }
}
