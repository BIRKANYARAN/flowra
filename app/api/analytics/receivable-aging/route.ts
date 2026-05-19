// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/analytics/receivable-aging
//
// Returns outstanding receivables bucketed by invoice age.
//
// CASH-BASIS RULE: Only unpaid/partial/overdue sales are counted.
//   payment_status = 'paid' → cash already received, excluded from receivables.
//   payment_status = 'partial' → outstanding = total_try − amount_paid (not full total_try).
//
// Age = days since sale_date (business invoice date) to today (UTC).
//
// Buckets:
//   current    — 0–30 days   : normal collection cycle
//   aged_30_60 — 31–60 days  : follow-up needed
//   aged_60_plus — 61+ days  : high risk / potential bad debt
//
// Validation formula:
//   total.total_try = current.total_try + aged_30_60.total_try + aged_60_plus.total_try
//   total.count     = current.count     + aged_30_60.count     + aged_60_plus.count
//
// Response: ReceivableAging
// ═══════════════════════════════════════════════════════════════════════════════

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import type { ReceivableAging } from '@/types'
import { resolveApiAuth } from '@/lib/api-auth'
import { round2 } from '@/lib/calc'

export async function GET(req: NextRequest) {
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response
  const { companyId, supabase } = auth

  // Fetch all outstanding receivables (no date filter — want full aging picture)
  // Use sale_date (business invoice date) for aging — not created_at (DB insertion time).
  // A backdated invoice entered today should age from its sale_date, not today.
  // Safety cap: 5000 rows. A company with >5000 outstanding invoices has bigger problems;
  // oldest-first ordering ensures the most aged (highest risk) buckets are never missed.
  const { data, error } = await supabase
    .from('sales')
    .select('total_try:total, amount_paid:paid_amount, sale_date, currency, fx_rate_try')
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .in('payment_status', ['pending', 'partial', 'overdue'])
    .order('sale_date', { ascending: true })
    .limit(5000)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // ── Bucket computation ─────────────────────────────────────────────────────
  //
  // ageDays = floor((now_ms - sale_date_ms) / 86_400_000)
  //
  // current    : ageDays in [0, 30]    → 0–30 calendar days old
  // aged_30_60 : ageDays in [31, 60]   → 31–60 calendar days old
  // aged_60_plus: ageDays >= 61        → 61+ calendar days old
  //
  const nowMs = Date.now()

  const result: ReceivableAging = {
    current:      { count: 0, total_try: 0 },
    aged_30_60:   { count: 0, total_try: 0 },
    aged_60_plus: { count: 0, total_try: 0 },
    total:        { count: 0, total_try: 0 },
    computed_at:  new Date().toISOString(),
  }

  // FX exposure accumulator: track non-TRY receivables by currency.
  // Keyed by currency code (e.g. 'USD', 'EUR').
  const fxAcc: Record<string, { count: number; total_native: number; total_try_at_booking: number }> = {}

  for (const row of data ?? []) {
    const amtTry  = Math.max(0, Number(row.total_try ?? 0) - Number(row.amount_paid ?? 0))
    if (!row.sale_date) continue  // skip rows with no business date — can't age them
    const saleDateMs = new Date(row.sale_date as string + 'T00:00:00Z').getTime()
    const ageDays    = Math.floor((nowMs - saleDateMs) / 86_400_000)

    result.total.count     += 1
    result.total.total_try += amtTry

    if (ageDays <= 30) {
      result.current.count     += 1
      result.current.total_try += amtTry
    } else if (ageDays <= 60) {
      result.aged_30_60.count     += 1
      result.aged_30_60.total_try += amtTry
    } else {
      result.aged_60_plus.count     += 1
      result.aged_60_plus.total_try += amtTry
    }

    // FX exposure accumulation — only for non-TRY sales with a valid booking rate.
    // total_native = outstanding TRY / fx_rate_try (the original foreign currency amount).
    // This lets the CFO see "USD 45K outstanding" separately from the ₺1.44M TRY booking value,
    // so FX rate movements between booking and today are visible rather than hidden.
    const currency   = (row as { currency?: string | null }).currency
    const fxRateTry  = Number((row as { fx_rate_try?: number | null }).fx_rate_try ?? 0)
    if (currency && currency !== 'TRY' && fxRateTry > 0) {
      const nativeAmt = round2(amtTry / fxRateTry)
      if (!fxAcc[currency]) fxAcc[currency] = { count: 0, total_native: 0, total_try_at_booking: 0 }
      fxAcc[currency].count               += 1
      fxAcc[currency].total_native        += nativeAmt
      fxAcc[currency].total_try_at_booking += amtTry
    }
  }

  // Round to 2 decimal places — round2() prevents IEEE 754 edge cases (e.g. 0.005 → 0.01)
  result.current.total_try      = round2(result.current.total_try)
  result.aged_30_60.total_try   = round2(result.aged_30_60.total_try)
  result.aged_60_plus.total_try = round2(result.aged_60_plus.total_try)
  result.total.total_try        = round2(result.total.total_try)

  // Attach FX breakdown only when non-TRY receivables exist (avoids noise for TRY-only companies)
  const hasFxExposure = Object.keys(fxAcc).length > 0
  if (hasFxExposure) {
    const rounded: typeof fxAcc = {}
    for (const [ccy, acc] of Object.entries(fxAcc)) {
      rounded[ccy] = {
        count:                acc.count,
        total_native:         round2(acc.total_native),
        total_try_at_booking: round2(acc.total_try_at_booking),
      }
    }
    result.fx_breakdown = rounded
  }

  return NextResponse.json(result)
}
