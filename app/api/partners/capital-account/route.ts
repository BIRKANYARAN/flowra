// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/partners/capital-account
//
// Returns per-partner capital account statements.
//
// Query params:
//   partner_id   (optional) — filter to a specific partner
//   multiple     (optional) — valuation multiple for exit scenario simulation (default 1.0)
//
// Response: { accounts, exit_scenario, total_equity_try, total_partner_debt_try, computed_at }
//
// Role guard: admin only (capital accounts are sensitive financial statements)
// ═══════════════════════════════════════════════════════════════════════════════

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { REQUEST_ID_HEADER } from '@/middleware'
import { resolveApiAuth } from '@/lib/api-auth'
import { requireAdmin } from '@/lib/require-role'
import { CapitalAccountService } from '@/lib/services/pcle/capital-account.service'
import { BalanceSheetService } from '@/lib/services/balance-sheet.service'
import { AppError, toErrorResponse } from '@/types/errors'

export async function GET(req: NextRequest) {
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response
  const { uid, companyId, supabase, ctx } = auth

  // Admin-only gate
  try {
    await requireAdmin(uid, companyId, supabase)
  } catch (e) {
    if (e instanceof AppError && e.code === 'FORBIDDEN') {
      return NextResponse.json(
        { error: e.message, code: 'FORBIDDEN' },
        { status: 403, headers: { [REQUEST_ID_HEADER]: ctx.requestId } },
      )
    }
    throw e
  }

  try {
    const { searchParams } = new URL(req.url)
    const partnerIdFilter = searchParams.get('partner_id') ?? null
    const multipleParam   = searchParams.get('multiple')
    const multiple        = multipleParam ? Math.max(0, parseFloat(multipleParam) || 1) : 1

    // Get total equity from balance sheet (today's date)
    const today = new Date().toISOString().slice(0, 10)
    let totalEquity = 0
    try {
      const bs = await BalanceSheetService.compute(uid, companyId, today, supabase)
      totalEquity = bs.equity.total_equity_try
    } catch {
      // Balance sheet may fail on empty companies — treat as 0
      totalEquity = 0
    }

    // Compute capital accounts
    const result = await CapitalAccountService.compute(companyId, supabase, totalEquity)

    // Filter to specific partner if requested
    let accounts = result.accounts
    if (partnerIdFilter) {
      accounts = accounts.filter(a => a.partner_id === partnerIdFilter)
    }

    // Compute exit scenario
    const exitScenario = CapitalAccountService.computeExitScenario(
      result.accounts,   // use full list for exit (share ratios must sum to 1)
      result.total_equity_try,
      result.total_partner_debt_try,
      multiple,
    )

    // If filtered by partner, also filter exit scenario per_partner
    const filteredExit = partnerIdFilter
      ? {
          ...exitScenario,
          per_partner: exitScenario.per_partner.filter(p => p.partner_id === partnerIdFilter),
        }
      : exitScenario

    return NextResponse.json(
      {
        accounts,
        exit_scenario:          filteredExit,
        total_equity_try:       result.total_equity_try,
        total_partner_debt_try: result.total_partner_debt_try,
        computed_at:            result.computed_at,
      },
      { headers: { [REQUEST_ID_HEADER]: ctx.requestId } },
    )
  } catch (err) {
    const { body, status } = toErrorResponse(err)
    return NextResponse.json(body, { status, headers: { [REQUEST_ID_HEADER]: ctx.requestId } })
  }
}
