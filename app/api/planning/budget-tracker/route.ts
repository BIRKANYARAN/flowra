// ─────────────────────────────────────────────────────────────────────────────
// GET /api/planning/budget-tracker?period=2025-01
//
// Monthly Budget vs Actuals Tracker.
// Returns variance alerts and budget health score for the requested period.
//
// Auth:  resolveApiAuth + company_members check, manager+
// Cache: revalidate: 1800 (30 min)
// ─────────────────────────────────────────────────────────────────────────────

export const revalidate = 1800

import { NextRequest, NextResponse }   from 'next/server'
import { resolveApiAuth }              from '@/lib/api-auth'
import { reqCtx, apiError }            from '@/lib/api-utils'
import { BudgetTrackerService }        from '@/lib/services/planning/budget-tracker.service'

export async function GET(req: NextRequest) {
  const ctx = reqCtx(req)
  try {
    const auth = await resolveApiAuth(req)
    if (!auth.ok) return auth.response

    const { companyId, supabase } = auth

    const period = req.nextUrl.searchParams.get('period') ?? undefined

    // Validate period format if provided
    if (period !== undefined && !/^\d{4}-\d{2}$/.test(period)) {
      return NextResponse.json(
        { error: 'Invalid period format. Use YYYY-MM.', code: 'INVALID_PARAM', type: 'VALIDATION' },
        { status: 400 },
      )
    }

    const service = new BudgetTrackerService(supabase)
    const report  = await service.getReport(companyId, period)

    return NextResponse.json({ report })
  } catch (e) {
    console.error('[planning/budget-tracker]', e)
    return apiError(ctx, 'Bütçe takip raporu alınamadı', 500, 'DB_READ_FAILED')
  }
}
