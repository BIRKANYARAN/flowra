// ─────────────────────────────────────────────────────────────────────────────
// lib/services/pcle/amortization.service.ts
//
// Partner Loan Amortization Schedule
//
// Computes per-tranche monthly payment timelines from partner_loan_tranches.
// Supports standard PMT formula, interest-free tranches, and open-ended loans.
//
// Pure helpers are exported for direct unit testing.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'
import { round2 } from '@/lib/calc'

// ── Public types ──────────────────────────────────────────────────────────────

export interface AmortizationRow {
  period_number: number        // 1, 2, 3…
  month_label: string          // 'Haziran 2026'
  month_iso: string            // 'YYYY-MM'
  opening_balance_try: number
  interest_try: number         // opening_balance × annual_rate / 12
  principal_try: number        // monthly_payment - interest (or full balance if final)
  closing_balance_try: number
  is_past: boolean             // month_iso < current month
  is_current: boolean          // month_iso = current month
}

export interface TrancheAmortization {
  tranche_id: string
  partner_name: string
  disbursed_try: number
  outstanding_try: number
  annual_interest_rate: number   // 0–1 range
  monthly_payment_try: number
  term_months: number | null
  schedule: AmortizationRow[]   // up to 60 months forward
  total_interest_remaining_try: number
  total_payment_remaining_try: number
  payoff_month: string | null    // ISO month when fully paid, null if open-ended
}

export interface LoanAmortizationReport {
  tranches: TrancheAmortization[]
  total_outstanding_try: number
  total_monthly_service_try: number
  total_interest_remaining_try: number
  weighted_avg_rate: number | null
  earliest_payoff_month: string | null
  latest_payoff_month: string | null
}

// ── Turkish month names ───────────────────────────────────────────────────────

const TR_MONTHS = [
  'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
]

function isoToLabel(monthIso: string): string {
  const [year, month] = monthIso.split('-')
  return `${TR_MONTHS[parseInt(month, 10) - 1]} ${year}`
}

/** Return current month as 'YYYY-MM' */
function currentMonthIso(): string {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

/** Add n months to a 'YYYY-MM' string → 'YYYY-MM' */
function addMonths(monthIso: string, n: number): string {
  const [y, m] = monthIso.split('-').map(Number)
  const date = new Date(y, m - 1 + n, 1)
  const yr = date.getFullYear()
  const mo = String(date.getMonth() + 1).padStart(2, '0')
  return `${yr}-${mo}`
}

// ── Pure helpers (exported) ───────────────────────────────────────────────────

/**
 * Calculate monthly payment using the standard PMT formula.
 *
 * - Zero rate: principal / termMonths (interest-free linear)
 * - Positive rate: P × r × (1+r)^n / ((1+r)^n − 1)
 */
export function calculateMonthlyPayment(
  principal: number,
  annualRate: number,
  termMonths: number,
): number {
  if (principal <= 0 || termMonths <= 0) return 0
  if (annualRate <= 0) {
    return round2(principal / termMonths)
  }
  const r = annualRate / 12
  const factor = Math.pow(1 + r, termMonths)
  return round2((principal * r * factor) / (factor - 1))
}

/**
 * Build an amortization schedule from a known outstanding balance.
 *
 * @param outstanding     Current outstanding balance
 * @param annualRate      Annual interest rate (0–1)
 * @param monthlyPayment  Fixed monthly payment amount
 * @param startMonth      Starting month ISO string 'YYYY-MM'
 * @param maxMonths       Cap the schedule (default 60)
 */
export function buildAmortizationSchedule(
  outstanding: number,
  annualRate: number,
  monthlyPayment: number,
  startMonth: string,
  maxMonths = 60,
): AmortizationRow[] {
  if (outstanding <= 0 || monthlyPayment <= 0) return []

  const current = currentMonthIso()
  const rows: AmortizationRow[] = []
  let balance = outstanding
  const monthlyRate = annualRate / 12
  const cap = Math.min(maxMonths, 60)

  for (let i = 0; i < cap; i++) {
    if (balance <= 0.005) break

    const monthIso = addMonths(startMonth, i)
    const opening = round2(balance)
    const interest = round2(opening * monthlyRate)

    // If last payment would overshoot, cap at remaining balance + interest
    const payment = Math.min(monthlyPayment, opening + interest)
    const principal = round2(payment - interest)
    const closing = round2(Math.max(0, opening - principal))

    rows.push({
      period_number: i + 1,
      month_label: isoToLabel(monthIso),
      month_iso: monthIso,
      opening_balance_try: opening,
      interest_try: interest,
      principal_try: principal,
      closing_balance_try: closing,
      is_past: monthIso < current,
      is_current: monthIso === current,
    })

    balance = closing
  }

  return rows
}

/**
 * Compute the weighted average annual interest rate across tranches.
 * Weights by outstanding balance. Returns null if empty or all-zero balances.
 */
export function computeWeightedAvgRate(tranches: TrancheAmortization[]): number | null {
  const active = tranches.filter(t => t.outstanding_try > 0)
  if (active.length === 0) return null
  const totalOutstanding = active.reduce((s, t) => s + t.outstanding_try, 0)
  if (totalOutstanding === 0) return null
  const weightedSum = active.reduce(
    (s, t) => s + t.annual_interest_rate * t.outstanding_try,
    0,
  )
  return weightedSum / totalOutstanding
}

// ── Service class ─────────────────────────────────────────────────────────────

export class AmortizationService {
  /**
   * Compute the full loan amortization report for a company.
   * Fetches active tranches + partner names, then builds per-tranche schedules.
   */
  static async compute(
    companyId: string,
    supabase: SupabaseClient,
  ): Promise<LoanAmortizationReport> {
    // Fetch active / partially-repaid tranches with partner join
    const { data: rows, error } = await supabase
      .from('partner_loan_tranches')
      // outstanding_try / disbursed_try are not columns — disbursed = principal_try, outstanding = principal_try − total_repaid_try
      .select('id, company_id, partner_id, principal_try, total_repaid_try, annual_interest_rate, status, partners(name)')
      .eq('company_id', companyId)
      .in('status', ['active', 'partially_repaid'])

    if (error) {
      throw new Error(`Tranche verisi alınamadı: ${error.message}`)
    }

    // monthly_payment_try / term_months are not columns in this schema —
    // payment is derived from outstanding/rate with a default term below.
    const optionalColsData: Record<string, { monthly_payment_try: number | null; term_months: number | null }> = {}

    const currentMonth = currentMonthIso()
    const tranches: TrancheAmortization[] = []

    for (const row of (rows ?? [])) {
      const r = row as Record<string, unknown>
      const trancheId = r.id as string
      const partnersJoin = r.partners as { name?: string } | null
      const partnerName = partnersJoin?.name ?? 'Ortak'
      const disbursed = Number(r.principal_try) || 0
      const outstanding = Math.max(0, disbursed - (Number(r.total_repaid_try) || 0))
      const annualRate = Number(r.annual_interest_rate) || 0

      const ext = optionalColsData[trancheId] ?? { monthly_payment_try: null, term_months: null }
      const storedPayment = ext.monthly_payment_try ? Number(ext.monthly_payment_try) : null
      const termMonths = ext.term_months ? Number(ext.term_months) : null

      // Determine effective term for payment calculation
      const effectiveTerm = termMonths ?? 24  // default 24 for open-ended
      const monthlyPayment = storedPayment ?? calculateMonthlyPayment(outstanding, annualRate, effectiveTerm)

      const schedule = buildAmortizationSchedule(
        outstanding,
        annualRate,
        monthlyPayment,
        currentMonth,
        60,
      )

      // Compute totals from schedule
      const totalInterestRemaining = round2(
        schedule.reduce((s, row2) => s + row2.interest_try, 0),
      )
      const totalPaymentRemaining = round2(
        schedule.reduce((s, row2) => s + row2.interest_try + row2.principal_try, 0),
      )

      // Payoff month: last row's month_iso if balance reaches 0, null if schedule hits cap
      const lastRow = schedule[schedule.length - 1]
      const payoffMonth =
        lastRow && lastRow.closing_balance_try <= 0.005
          ? lastRow.month_iso
          : null

      tranches.push({
        tranche_id: trancheId,
        partner_name: partnerName,
        disbursed_try: disbursed,
        outstanding_try: outstanding,
        annual_interest_rate: annualRate,
        monthly_payment_try: monthlyPayment,
        term_months: termMonths,
        schedule,
        total_interest_remaining_try: totalInterestRemaining,
        total_payment_remaining_try: totalPaymentRemaining,
        payoff_month: payoffMonth,
      })
    }

    const totalOutstanding = round2(tranches.reduce((s, t) => s + t.outstanding_try, 0))
    const totalMonthlyService = round2(tranches.reduce((s, t) => s + t.monthly_payment_try, 0))
    const totalInterestRemaining = round2(tranches.reduce((s, t) => s + t.total_interest_remaining_try, 0))
    const weightedAvgRate = computeWeightedAvgRate(tranches)

    const payoffMonths = tranches
      .map(t => t.payoff_month)
      .filter((m): m is string => m !== null)
      .sort()

    return {
      tranches,
      total_outstanding_try: totalOutstanding,
      total_monthly_service_try: totalMonthlyService,
      total_interest_remaining_try: totalInterestRemaining,
      weighted_avg_rate: weightedAvgRate,
      earliest_payoff_month: payoffMonths[0] ?? null,
      latest_payoff_month: payoffMonths[payoffMonths.length - 1] ?? null,
    }
  }
}
