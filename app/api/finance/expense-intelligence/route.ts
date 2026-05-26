// ── /api/finance/expense-intelligence ────────────────────────────────────────
// GET ?from=YYYY-MM-DD&to=YYYY-MM-DD
//
// Returns ExpenseIntelligenceReport — category breakdown + trend analysis.
// Access: any authenticated member.

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth } from '@/lib/api-auth'
import { apiError, reqCtx } from '@/lib/api-utils'
import { ExpenseIntelligenceService } from '@/lib/services/finance/expense-intelligence.service'

export async function GET(req: NextRequest) {
  const ctx  = reqCtx(req)
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response

  const { companyId, supabase } = auth
  const { searchParams }        = new URL(req.url)

  const now      = new Date()
  const from     = searchParams.get('from') ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  const to       = searchParams.get('to')   ?? now.toISOString().slice(0, 10)

  try {
    const report = await ExpenseIntelligenceService.getReport(
      companyId,
      supabase,
      { from, to },
    )
    return NextResponse.json(report)
  } catch (err) {
    console.error('[expense-intelligence]', err)
    return apiError(ctx, 'Gider analizi hesaplanamadı', 500)
  }
}
