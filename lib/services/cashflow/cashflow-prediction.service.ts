// ── CashFlowPredictionService — 30/60/90-day operational cash flow prediction ──
//
// Combines:
//   1. Current cash position (balance sheet)
//   2. Expected inflows from outstanding receivables, weighted by customer risk
//   3. Expected outflows from commitment ledger + recurring expense estimates
//   4. Scenario analysis: optimistic / base / pessimistic
//   5. Warning flags in Turkish

import type { SupabaseClient } from '@supabase/supabase-js'
import { BalanceSheetService } from '@/lib/services/balance-sheet.service'
import { CommitmentsService } from '@/lib/services/governance/commitments.service'
import { CustomerIntelligenceService } from '@/lib/services/commercial/customer-intelligence.service'
import type { CustomerPaymentProfile } from '@/lib/services/commercial/customer-intelligence.service'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PeriodPrediction {
  inflows_base_try:      number
  outflows_base_try:     number
  net_try:               number
  ending_cash_base_try:  number
}

export interface CashScenario {
  ending_cash_30_try:  number
  ending_cash_60_try:  number
  ending_cash_90_try:  number
  runway_months:       number | null
}

export interface CashFlowPrediction {
  computed_at:       string
  starting_cash_try: number
  horizon_days:      30 | 60 | 90

  periods: {
    days_30: PeriodPrediction
    days_60: PeriodPrediction
    days_90: PeriodPrediction
  }

  receivables_expected: Array<{
    customer_name:          string
    outstanding_try:        number
    predicted_payment_date: string
    confidence:             'high' | 'medium' | 'low' | 'at_risk'
    risk_tier:              string
  }>

  commitments_expected: Array<{
    title:      string
    amount_try: number | null
    due_date:   string
    source:     string
  }>

  scenarios: {
    optimistic:  CashScenario
    base:        CashScenario
    pessimistic: CashScenario
  }

  flags: Array<{
    severity: 'warning' | 'critical'
    message:  string
    period:   '30' | '60' | '90'
  }>
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function daysBetween(from: string, to: string): number {
  return Math.round(
    (new Date(to + 'T00:00:00Z').getTime() - new Date(from + 'T00:00:00Z').getTime()) / 86_400_000,
  )
}

function confidenceFromRiskTier(tier: CustomerPaymentProfile['risk_tier']): 'high' | 'medium' | 'low' | 'at_risk' {
  switch (tier) {
    case 'low':      return 'high'
    case 'medium':   return 'medium'
    case 'high':     return 'low'
    case 'critical': return 'at_risk'
  }
}

function bucketForDays(daysFromToday: number): '30' | '60' | '90' | null {
  if (daysFromToday <= 30)  return '30'
  if (daysFromToday <= 60)  return '60'
  if (daysFromToday <= 90)  return '90'
  return null
}

// ── Service ───────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = SupabaseClient<any>

export class CashFlowPredictionService {
  static async predict(
    companyId: string,
    uid:       string,
    supabase:  AnySupabase,
    opts?: {
      today?:       string
      horizonDays?: 30 | 60 | 90
    },
  ): Promise<CashFlowPrediction> {
    const today      = opts?.today ?? new Date().toISOString().slice(0, 10)
    const horizon    = opts?.horizonDays ?? 90
    const cutoff90   = addDays(today, 90)

    // ── Parallel data fetch (resilient to partial failures) ───────────────────
    const [
      balanceResult,
      commitmentsResult,
      receivablesResult,
      profilesResult,
      expensesResult,
    ] = await Promise.allSettled([
      // 1. Balance sheet for current cash position
      BalanceSheetService.compute(uid, companyId, today, supabase),

      // 2. Commitments ledger (90-day horizon)
      CommitmentsService.getLedger(companyId, supabase, { horizon: 90, today }),

      // 3. Outstanding receivables
      (supabase as SupabaseClient)
        .from('sales')
        .select('id, customer_name, total_try:total, paid_amount, payment_status, sale_date, due_date')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .in('payment_status', ['pending', 'partial', 'overdue']),

      // 4. Customer payment profiles
      CustomerIntelligenceService.getProfiles(companyId, supabase, { today }),

      // 5. Historical expenses for recurring estimate (last 90 days)
      (supabase as SupabaseClient)
        .from('expenses')
        .select('amount_try, expense_date')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .eq('payment_status', 'paid')
        .gte('expense_date', addDays(today, -90))
        .lte('expense_date', today),
    ])

    // ── Extract results with fallbacks ────────────────────────────────────────
    const startingCash = balanceResult.status === 'fulfilled'
      ? Math.max(0, balanceResult.value.assets.cash_try)
      : 0

    const ledger = commitmentsResult.status === 'fulfilled'
      ? commitmentsResult.value
      : null

    const receivableRows: Array<{
      id: string
      customer_name: string | null
      total_try: number | null
      paid_amount: number | null
      payment_status: string | null
      sale_date: string | null
      due_date: string | null
    }> = receivablesResult.status === 'fulfilled'
      ? ((receivablesResult.value as { data: unknown[] | null }).data ?? []) as Array<{
          id: string
          customer_name: string | null
          total_try: number | null
          paid_amount: number | null
          payment_status: string | null
          sale_date: string | null
          due_date: string | null
        }>
      : []

    const profiles: CustomerPaymentProfile[] = profilesResult.status === 'fulfilled'
      ? profilesResult.value
      : []

    const expenseRows: Array<{ amount_try: number | null; expense_date: string | null }> =
      expensesResult.status === 'fulfilled'
        ? ((expensesResult.value as { data: unknown[] | null }).data ?? []) as Array<{ amount_try: number | null; expense_date: string | null }>
        : []

    // ── Build customer profile map ─────────────────────────────────────────────
    const profileMap = new Map<string, CustomerPaymentProfile>()
    for (const p of profiles) {
      profileMap.set(p.customer_name, p)
    }

    // ── Compute expected inflows from receivables ──────────────────────────────
    const receivablesExpected: CashFlowPrediction['receivables_expected'] = []

    // Accumulators per bucket (days_30, days_60, days_90)
    const inflowsBase: Record<'30' | '60' | '90', number> = { '30': 0, '60': 0, '90': 0 }
    const inflowsOpt: Record<'30' | '60' | '90', number>  = { '30': 0, '60': 0, '90': 0 }
    const inflowsPess: Record<'30' | '60' | '90', number> = { '30': 0, '60': 0, '90': 0 }

    for (const row of receivableRows) {
      const customerName = row.customer_name ?? 'Bilinmiyor'
      const outstanding  = Math.max(0, (Number(row.total_try ?? 0)) - (Number(row.paid_amount ?? 0)))
      if (outstanding <= 0) continue

      const profile   = profileMap.get(customerName)
      const riskTier  = profile?.risk_tier ?? 'medium'
      const isOverdue = row.payment_status === 'overdue' ||
        (row.due_date !== null && row.due_date !== undefined && row.due_date < today)

      let predictedPaymentDate: string
      let confidence: 'high' | 'medium' | 'low' | 'at_risk'

      if (isOverdue) {
        // Use risk-tier-based overdue prediction
        const daysFromNow = riskTier === 'low' ? 7
          : riskTier === 'medium' ? 21
          : riskTier === 'high' ? 45
          : 60 // critical — beyond 90 window or mark at_risk
        predictedPaymentDate = addDays(today, daysFromNow)
        confidence = confidenceFromRiskTier(riskTier as CustomerPaymentProfile['risk_tier'])
      } else if (profile?.avg_days_to_pay !== null && profile?.avg_days_to_pay !== undefined) {
        const saleDate = row.sale_date ?? today
        predictedPaymentDate = addDays(saleDate, profile.avg_days_to_pay)
        confidence = confidenceFromRiskTier(riskTier as CustomerPaymentProfile['risk_tier'])
      } else {
        // Fallback: 45 days from sale date
        const saleDate = row.sale_date ?? today
        predictedPaymentDate = addDays(saleDate, 45)
        confidence = 'medium'
      }

      receivablesExpected.push({
        customer_name:          customerName,
        outstanding_try:        outstanding,
        predicted_payment_date: predictedPaymentDate,
        confidence,
        risk_tier:              riskTier,
      })

      // Bucket assignment
      const daysUntil = daysBetween(today, predictedPaymentDate)
      const bucket = bucketForDays(daysUntil)

      // Optimistic: all receivables
      if (bucket) {
        inflowsOpt[bucket] += outstanding
      }

      // Base: all except at_risk
      if (bucket && confidence !== 'at_risk') {
        inflowsBase[bucket] += outstanding
      }

      // Pessimistic: only low and medium risk (high/critical excluded)
      if (bucket && (riskTier === 'low' || riskTier === 'medium')) {
        inflowsPess[bucket] += outstanding
      }
    }

    // ── Recurring expense estimate (monthly average from last 90 days) ─────────
    const totalExpensesLast90 = expenseRows.reduce(
      (sum, e) => sum + (Number(e.amount_try ?? 0)), 0
    )
    const monthlyRecurringEstimate = totalExpensesLast90 / 3  // 90 days ÷ 3 = monthly

    // Spread recurring across 3 months (30-day increments)
    const recurringOutflowBase: Record<'30' | '60' | '90', number> = {
      '30': monthlyRecurringEstimate,
      '60': monthlyRecurringEstimate,
      '90': monthlyRecurringEstimate,
    }

    // ── Compute commitment-based outflows ──────────────────────────────────────
    const commitmentOutflowsBase: Record<'30' | '60' | '90', number> = { '30': 0, '60': 0, '90': 0 }
    const commitmentsExpected: CashFlowPrediction['commitments_expected'] = []

    if (ledger) {
      for (const obl of ledger.obligations) {
        if (obl.amount_try === null) continue
        const daysUntil = daysBetween(today, obl.due_date)
        const bucket = bucketForDays(daysUntil)
        if (bucket) {
          commitmentOutflowsBase[bucket] += obl.amount_try
          commitmentsExpected.push({
            title:      obl.title,
            amount_try: obl.amount_try,
            due_date:   obl.due_date,
            source:     obl.source,
          })
        }
      }

      // Also include obligations without amounts in the list (for display)
      for (const obl of ledger.obligations) {
        if (obl.amount_try !== null) continue
        const daysUntil = daysBetween(today, obl.due_date)
        if (daysUntil >= 0 && daysUntil <= 90) {
          commitmentsExpected.push({
            title:      obl.title,
            amount_try: null,
            due_date:   obl.due_date,
            source:     obl.source,
          })
        }
      }
    }

    // ── Partner loan interest (monthly accrual within 90-day horizon) ─────────
    // (Already included via CommitmentsService interest_accrual obligations)

    // ── Total outflows per bucket ──────────────────────────────────────────────
    const outflowsBase: Record<'30' | '60' | '90', number> = {
      '30': commitmentOutflowsBase['30'] + recurringOutflowBase['30'],
      '60': commitmentOutflowsBase['60'] + recurringOutflowBase['60'],
      '90': commitmentOutflowsBase['90'] + recurringOutflowBase['90'],
    }

    // Pessimistic: 120% of outflows (overruns)
    const outflowsPess: Record<'30' | '60' | '90', number> = {
      '30': outflowsBase['30'] * 1.2,
      '60': outflowsBase['60'] * 1.2,
      '90': outflowsBase['90'] * 1.2,
    }

    // Optimistic: 80% of committed outflows (some obligations may not materialize)
    const outflowsOpt: Record<'30' | '60' | '90', number> = {
      '30': outflowsBase['30'] * 0.8,
      '60': outflowsBase['60'] * 0.8,
      '90': outflowsBase['90'] * 0.8,
    }

    // ── Build cumulative period predictions (base) ─────────────────────────────
    const periodNetBase30 = inflowsBase['30'] - outflowsBase['30']
    const periodNetBase60 = inflowsBase['60'] - outflowsBase['60']
    const periodNetBase90 = inflowsBase['90'] - outflowsBase['90']

    const endCashBase30 = startingCash + periodNetBase30
    const endCashBase60 = endCashBase30 + periodNetBase60
    const endCashBase90 = endCashBase60 + periodNetBase90

    const periods: CashFlowPrediction['periods'] = {
      days_30: {
        inflows_base_try:     round2(inflowsBase['30']),
        outflows_base_try:    round2(outflowsBase['30']),
        net_try:              round2(periodNetBase30),
        ending_cash_base_try: round2(endCashBase30),
      },
      days_60: {
        inflows_base_try:     round2(inflowsBase['30'] + inflowsBase['60']),
        outflows_base_try:    round2(outflowsBase['30'] + outflowsBase['60']),
        net_try:              round2(periodNetBase30 + periodNetBase60),
        ending_cash_base_try: round2(endCashBase60),
      },
      days_90: {
        inflows_base_try:     round2(inflowsBase['30'] + inflowsBase['60'] + inflowsBase['90']),
        outflows_base_try:    round2(outflowsBase['30'] + outflowsBase['60'] + outflowsBase['90']),
        net_try:              round2(periodNetBase30 + periodNetBase60 + periodNetBase90),
        ending_cash_base_try: round2(endCashBase90),
      },
    }

    // ── Scenarios ─────────────────────────────────────────────────────────────

    // Optimistic
    const endCashOpt30 = startingCash + inflowsOpt['30'] - outflowsOpt['30']
    const endCashOpt60 = endCashOpt30 + inflowsOpt['60'] - outflowsOpt['60']
    const endCashOpt90 = endCashOpt60 + inflowsOpt['90'] - outflowsOpt['90']

    // Pessimistic
    const endCashPess30 = startingCash + inflowsPess['30'] - outflowsPess['30']
    const endCashPess60 = endCashPess30 + inflowsPess['60'] - outflowsPess['60']
    const endCashPess90 = endCashPess60 + inflowsPess['90'] - outflowsPess['90']

    // Runway: months = ending_cash / monthly_burn_rate
    const totalMonthlyBurn = monthlyRecurringEstimate + (
      (commitmentOutflowsBase['30'] + commitmentOutflowsBase['60'] + commitmentOutflowsBase['90']) / 3
    )

    function computeRunway(endCash: number): number | null {
      if (totalMonthlyBurn <= 0) return null
      if (endCash <= 0) return 0
      return round2(endCash / totalMonthlyBurn)
    }

    const scenarios: CashFlowPrediction['scenarios'] = {
      optimistic: {
        ending_cash_30_try: round2(endCashOpt30),
        ending_cash_60_try: round2(endCashOpt60),
        ending_cash_90_try: round2(endCashOpt90),
        runway_months:      computeRunway(endCashOpt90),
      },
      base: {
        ending_cash_30_try: round2(endCashBase30),
        ending_cash_60_try: round2(endCashBase60),
        ending_cash_90_try: round2(endCashBase90),
        runway_months:      computeRunway(endCashBase90),
      },
      pessimistic: {
        ending_cash_30_try: round2(endCashPess30),
        ending_cash_60_try: round2(endCashPess60),
        ending_cash_90_try: round2(endCashPess90),
        runway_months:      computeRunway(endCashPess90),
      },
    }

    // ── Warning flags ─────────────────────────────────────────────────────────
    const flags: CashFlowPrediction['flags'] = []

    // Cash goes negative in base scenario within 30 days
    if (endCashBase30 < 0) {
      flags.push({
        severity: 'critical',
        message:  '30 gün içinde nakit pozisyonu negatife düşüyor (baz senaryo).',
        period:   '30',
      })
    }

    // Cash goes negative in base scenario within 60 days
    if (endCashBase30 >= 0 && endCashBase60 < 0) {
      flags.push({
        severity: 'critical',
        message:  '60 gün içinde nakit pozisyonu negatife düşüyor (baz senaryo).',
        period:   '60',
      })
    }

    // Cash goes negative in pessimistic within 30 days
    if (endCashPess30 < 0 && endCashBase30 >= 0) {
      flags.push({
        severity: 'warning',
        message:  '30 gün içinde nakit kötümser senaryoda negatife düşüyor.',
        period:   '30',
      })
    }

    // More than 30% of receivables are at_risk by value
    const totalReceivablesValue = receivablesExpected.reduce((s, r) => s + r.outstanding_try, 0)
    const atRiskValue = receivablesExpected
      .filter(r => r.confidence === 'at_risk')
      .reduce((s, r) => s + r.outstanding_try, 0)

    if (totalReceivablesValue > 0 && atRiskValue / totalReceivablesValue > 0.3) {
      flags.push({
        severity: 'warning',
        message:  `Alacakların %${Math.round(atRiskValue / totalReceivablesValue * 100)}'i yüksek risk (kritik müşteri) kategorisindedir.`,
        period:   '90',
      })
    }

    // at_risk receivables exceed current cash × 1.5
    if (atRiskValue > startingCash * 1.5 && startingCash > 0) {
      flags.push({
        severity: 'critical',
        message:  `Riskli alacaklar (${fmtTRYCompact(atRiskValue)}) mevcut nakit pozisyonunun 1.5 katını aşıyor.`,
        period:   '90',
      })
    }

    return {
      computed_at:       new Date().toISOString(),
      starting_cash_try: round2(startingCash),
      horizon_days:      horizon,
      periods,
      receivables_expected: receivablesExpected.sort(
        (a, b) => a.predicted_payment_date.localeCompare(b.predicted_payment_date),
      ),
      commitments_expected: commitmentsExpected.sort(
        (a, b) => a.due_date.localeCompare(b.due_date),
      ),
      scenarios,
      flags,
    }

    // suppress unused var warning — cutoff90 only used in future extension
    void cutoff90
  }
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function fmtTRYCompact(n: number): string {
  if (n >= 1_000_000) return `₺${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `₺${(n / 1_000).toFixed(0)}K`
  return `₺${n.toFixed(0)}`
}
