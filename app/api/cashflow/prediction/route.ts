// ── GET /api/cashflow/prediction ──────────────────────────────────────────────
//
// Returns a 30/60/90-day operational cash flow prediction:
//   - Expected inflows from outstanding receivables (customer-risk-weighted)
//   - Expected outflows from commitment ledger + recurring expense estimate
//   - Scenario analysis: optimistic / base / pessimistic
//   - Warning flags in Turkish
//
// Query params:
//   today  YYYY-MM-DD  (optional) — override reference date (for testing)
// ─────────────────────────────────────────────────────────────────────────────

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse }       from 'next/server'
import { resolveApiAuth }                  from '@/lib/api-auth'
import { apiError, reqCtx }               from '@/lib/api-utils'
import { CashFlowPredictionService }       from '@/lib/services/cashflow/cashflow-prediction.service'

export async function GET(req: NextRequest) {
  const ctx  = reqCtx(req)
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response

  const { companyId, uid, supabase } = auth

  const url   = new URL(req.url)
  const today = url.searchParams.get('today') ?? undefined

  // Validate today param if provided
  if (today && !/^\d{4}-\d{2}-\d{2}$/.test(today)) {
    return apiError(ctx, '`today` parametresi YYYY-MM-DD formatında olmalıdır.', 400)
  }

  try {
    const prediction = await CashFlowPredictionService.predict(
      companyId,
      uid,
      supabase,
      { today, horizonDays: 90 },
    )
    return NextResponse.json(prediction)
  } catch (err) {
    console.error('[cashflow/prediction GET]', err instanceof Error ? err.message : String(err))
    return apiError(ctx, 'Nakit akışı tahmini hesaplanamadı.', 500)
  }
}
