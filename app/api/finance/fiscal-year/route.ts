// ─────────────────────────────────────────────────────────────────────────────
// GET /api/finance/fiscal-year?year=2025
//
// Returns a FiscalYearSummary aggregating all closed/locked accounting periods
// in the requested year for the authenticated user's company.
//
// Auth: resolveApiAuth — any authenticated company member.
// Cache: revalidate 3600 seconds (1 hour).
//
// Query params:
//   year     number  (required; defaults to current year)
// ─────────────────────────────────────────────────────────────────────────────

export const dynamic    = 'force-dynamic'
export const revalidate = 3600

import { NextRequest, NextResponse }  from 'next/server'
import { resolveApiAuth }             from '@/lib/api-auth'
import { FiscalYearSummaryService }   from '@/lib/services/finance/fiscal-year-summary.service'
import type { AnnualMetrics }         from '@/lib/services/finance/fiscal-year-summary.service'

const ZERO_ANNUAL: AnnualMetrics = {
  revenue_try:      0,
  cogs_try:         0,
  gross_profit_try: 0,
  gross_margin_pct: 0,
  expenses_try:     0,
  ebitda_try:       0,
  net_income_try:   0,
  net_margin_pct:   0,
  cash_end_try:     0,
}

export async function GET(req: NextRequest) {
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response
  const { companyId, supabase } = auth

  const url         = new URL(req.url)
  const currentYear = new Date().getFullYear()
  const rawYear     = url.searchParams.get('year')
  const year        = rawYear ? Math.max(2000, Math.min(currentYear + 1, Number(rawYear) || currentYear)) : currentYear

  try {
    const service = new FiscalYearSummaryService(supabase)
    const summary = await service.getSummary(companyId, year)
    return NextResponse.json(summary)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)

    // Return a graceful zero-state instead of a hard error for no-data scenarios
    if (
      msg.includes('no rows') ||
      msg.includes('empty') ||
      msg.includes('not found')
    ) {
      return NextResponse.json({
        year,
        periods_count:     0,
        is_complete:       false,
        annual:            { ...ZERO_ANNUAL },
        quarterly:         [],
        best_month:        null,
        worst_month:       null,
        monthly_breakdown: [],
      })
    }

    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
