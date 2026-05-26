import { NextRequest, NextResponse } from 'next/server'
import { PCLEEngine }        from '@/lib/services/pcle/pcle.engine'
import { checkDistributionCompliance } from '@/lib/services/pcle/pcle.distribution'
import { resolveApiAuth } from '@/lib/api-auth'

export const dynamic = 'force-dynamic'

// GET /api/partners/pcle/distribute?net_income=X&board_retained=X&dividend_requested=X
export async function GET(req: NextRequest) {
  try {
    const auth = await resolveApiAuth(req)
    if (!auth.ok) return auth.response
    const { companyId, supabase } = auth

    const params              = req.nextUrl.searchParams
    const net_income          = parseFloat(params.get('net_income')           ?? '0') || 0
    const board_retained      = parseFloat(params.get('board_retained')       ?? '0') || 0
    const dividend_requested  = parseFloat(params.get('dividend_requested')   ?? '0') || 0
    const available_cash      = parseFloat(params.get('available_cash')       ?? '0') || 0
    const legal_reserve_balance = parseFloat(params.get('legal_reserve_balance') ?? '0') || 0
    const paid_in_capital     = parseFloat(params.get('paid_in_capital')      ?? '0') || 0
    const legal_reserves_done = params.get('legal_reserves_done') === 'true'
    const board_decision_ref  = params.get('board_decision_ref') ?? null
    const is_compensation     = params.get('is_compensation') === 'true'

    // ── Pre-compute distributable net for the compliance gate ─────────────────
    // We need to run compliance check before the full engine compute.
    // Use a lightweight preliminary distributable_net estimate:
    //   distributable_gross = net_income - legal_reserve (5%) - board_retained
    //   distributable_net   = distributable_gross × 0.90 (after 10% withholding)
    const preliminary_legal_reserve = net_income > 0
      ? Math.min(net_income * 0.05, Math.max(0, paid_in_capital * 0.20 - legal_reserve_balance))
      : 0
    const preliminary_gross = net_income - preliminary_legal_reserve - board_retained
    const preliminary_net   = preliminary_gross > 0 ? preliminary_gross * 0.90 : preliminary_gross

    // ── Compliance gate ───────────────────────────────────────────────────────
    const violations = checkDistributionCompliance({
      distributableNet:      preliminary_net,
      dividendAmount:        dividend_requested,
      legalReservesDone:     legal_reserves_done,
      legalReserveBalance:   legal_reserve_balance,
      paidInCapital:         paid_in_capital,
      boardDecisionRef:      board_decision_ref,
      isCompensationPayment: is_compensation,
    })

    const hasBlockingViolation = violations.some(v => v.blocking)

    if (hasBlockingViolation) {
      return NextResponse.json(
        { violations, blocked: true },
        { status: 422 },
      )
    }

    // ── Full engine compute ───────────────────────────────────────────────────
    const state = await PCLEEngine.compute(companyId, supabase, {
      available_cash_try:     available_cash,
      net_income_try:         net_income,
      board_retained_try:     board_retained,
      dividend_requested_try: dividend_requested,
      paid_in_capital_try:    paid_in_capital > 0 ? paid_in_capital : undefined,
    })

    return NextResponse.json({
      distribution_layers:      state.distribution_layers,
      per_partner_distribution: state.per_partner_distribution,
      compliance_warnings:      state.compliance_warnings,
      // Include non-blocking violations (warnings) in response
      violations: violations.length > 0 ? violations : undefined,
    })
  } catch (e) {
    console.error('[partners/pcle/distribute] error:', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
