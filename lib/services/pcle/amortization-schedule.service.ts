// ─────────────────────────────────────────────────────────────────────────────
// lib/services/pcle/amortization-schedule.service.ts
//
// Loan Amortization Schedule Generator
//
// Generates full amortization schedules for partner loan tranches:
//   - Monthly payment breakdown (principal + interest)
//   - Remaining balance per period
//   - Cumulative interest cost
//   - Debt service coverage ratio
//
// Pure helpers are exported for direct unit testing.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'
import { round2 } from '@/lib/calc'

// ── Public types ──────────────────────────────────────────────────────────────

export interface AmortizationRow {
  period_number: number            // 1, 2, 3, ...
  period_date: string              // ISO date of payment (monthly from start_date)
  opening_balance_try: number
  monthly_payment_try: number
  principal_try: number
  interest_try: number
  closing_balance_try: number
  cumulative_interest_try: number
  cumulative_principal_try: number
}

export interface LoanAmortizationSchedule {
  tranche_id: string
  partner_name: string
  principal_try: number
  annual_rate_pct: number
  start_date: string
  total_months: number
  monthly_payment_try: number
  total_interest_try: number
  total_cost_try: number           // principal + total_interest
  rows: AmortizationRow[]          // one per month until payoff
  already_paid_months: number      // how many months have elapsed since start_date
  remaining_balance_try: number    // estimated current balance
}

export interface AmortizationReport {
  generated_at: string
  schedules: LoanAmortizationSchedule[]
  total_monthly_debt_service_try: number  // Σ current monthly payments across all active tranches
  total_remaining_balance_try: number
  total_interest_remaining_try: number
}

// ── Pure helpers (exported) ───────────────────────────────────────────────────

/**
 * Compute monthly interest payment.
 * Formula: principal × (annual_rate / 12 / 100)
 */
export function computeMonthlyInterest(
  principalTry: number,
  annualRatePct: number,
): number {
  if (principalTry <= 0 || annualRatePct <= 0) return 0
  return round2(principalTry * (annualRatePct / 12 / 100))
}

/**
 * Compute monthly payment for an equal-installment (annuity) loan.
 * Uses standard amortization formula:
 *   P = principal × r / (1 - (1+r)^(-n))
 * where r = monthly_rate, n = remaining_months
 *
 * Returns 0 if months = 0.
 * Returns full principal / months if rate = 0 (equal principal installments).
 */
export function computeMonthlyPayment(
  principalTry: number,
  annualRatePct: number,
  remainingMonths: number,
): number {
  if (remainingMonths <= 0) return 0
  if (principalTry <= 0) return 0

  if (annualRatePct <= 0) {
    // Zero-rate: equal principal installments (bullet spread)
    return round2(principalTry / remainingMonths)
  }

  const r = annualRatePct / 12 / 100
  const payment = (principalTry * r) / (1 - Math.pow(1 + r, -remainingMonths))
  return round2(payment)
}

/**
 * Compute remaining balance after a principal payment.
 * Returns max(0, current - principal).
 */
export function computeRemainingBalance(
  currentBalanceTry: number,
  principalPaymentTry: number,
): number {
  return round2(Math.max(0, currentBalanceTry - principalPaymentTry))
}

/**
 * Compute total interest cost over full amortization.
 * Formula: total_interest = (monthly_payment × n_months) - principal
 * Returns 0 for zero-rate loans.
 */
export function computeTotalInterestCost(
  monthlyPaymentTry: number,
  totalMonths: number,
  principalTry: number,
): number {
  if (monthlyPaymentTry <= 0 || totalMonths <= 0) return 0
  // For zero-rate: payment * months = principal, so no interest
  const total = monthlyPaymentTry * totalMonths
  return round2(Math.max(0, total - principalTry))
}

/**
 * Compute debt service coverage ratio for a month.
 * dscr = net_income / (principal_payment + interest_payment)
 * Returns null if debt_service = 0.
 */
export function computeMonthlyCoverage(
  monthlyNetIncomeTry: number,
  principalPaymentTry: number,
  interestPaymentTry: number,
): number | null {
  const debtService = principalPaymentTry + interestPaymentTry
  if (debtService <= 0) return null
  return round2(monthlyNetIncomeTry / debtService)
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/**
 * Add n months to an ISO date string (YYYY-MM-DD).
 */
function addMonths(dateStr: string, months: number): string {
  const [y, m, d] = dateStr.substring(0, 10).split('-').map(Number)
  const dt = new Date(y, m - 1 + months, d)
  // Clamp to end of month if day overflows (e.g. Jan 31 + 1 month → Feb 28)
  const yr = dt.getFullYear()
  const mo = dt.getMonth()
  const daysInMo = new Date(yr, mo + 1, 0).getDate()
  const clampedDay = Math.min(d, daysInMo)
  const outDt = new Date(yr, mo, clampedDay)
  return outDt.toISOString().substring(0, 10)
}

/**
 * Count months elapsed from startDate to today.
 */
function monthsElapsed(startDate: string, today: string): number {
  const [sy, sm] = startDate.substring(0, 10).split('-').map(Number)
  const [ty, tm] = today.substring(0, 10).split('-').map(Number)
  return Math.max(0, (ty - sy) * 12 + (tm - sm))
}

/**
 * Count months between two ISO date strings (start to end).
 * Returns at least 1.
 */
function monthsBetween(startDate: string, endDate: string): number {
  const [sy, sm] = startDate.substring(0, 10).split('-').map(Number)
  const [ey, em] = endDate.substring(0, 10).split('-').map(Number)
  const diff = (ey - sy) * 12 + (em - sm)
  return Math.max(1, diff)
}

/**
 * Generate a full amortization schedule for a single tranche.
 */
function buildSchedule(
  trancheId: string,
  partnerName: string,
  principalTry: number,
  annualRatePct: number,
  startDate: string,
  totalMonths: number,
  today: string,
): LoanAmortizationSchedule {
  const monthlyPayment = computeMonthlyPayment(principalTry, annualRatePct, totalMonths)
  const totalInterest = computeTotalInterestCost(monthlyPayment, totalMonths, principalTry)
  const alreadyPaid = monthsElapsed(startDate, today)

  const rows: AmortizationRow[] = []
  let balance = principalTry
  let cumInterest = 0
  let cumPrincipal = 0

  for (let i = 1; i <= totalMonths; i++) {
    if (balance <= 0) break

    const periodDate = addMonths(startDate, i)
    const openingBalance = balance

    const interestTry = computeMonthlyInterest(balance, annualRatePct)
    // On last period, principal is the entire remaining balance
    let principalPayment: number
    if (i === totalMonths) {
      principalPayment = balance
    } else {
      principalPayment = round2(Math.max(0, monthlyPayment - interestTry))
    }
    const actualPayment = round2(principalPayment + interestTry)

    const closingBalance = computeRemainingBalance(balance, principalPayment)
    cumInterest = round2(cumInterest + interestTry)
    cumPrincipal = round2(cumPrincipal + principalPayment)

    rows.push({
      period_number: i,
      period_date: periodDate,
      opening_balance_try: openingBalance,
      monthly_payment_try: actualPayment,
      principal_try: principalPayment,
      interest_try: interestTry,
      closing_balance_try: closingBalance,
      cumulative_interest_try: cumInterest,
      cumulative_principal_try: cumPrincipal,
    })

    balance = closingBalance
  }

  // Determine remaining balance from the row at alreadyPaid index
  let remainingBalance: number
  if (alreadyPaid === 0) {
    remainingBalance = principalTry
  } else if (alreadyPaid >= rows.length) {
    remainingBalance = 0
  } else {
    remainingBalance = rows[alreadyPaid - 1]?.closing_balance_try ?? 0
  }

  return {
    tranche_id: trancheId,
    partner_name: partnerName,
    principal_try: principalTry,
    annual_rate_pct: annualRatePct,
    start_date: startDate,
    total_months: totalMonths,
    monthly_payment_try: monthlyPayment,
    total_interest_try: totalInterest,
    total_cost_try: round2(principalTry + totalInterest),
    rows,
    already_paid_months: alreadyPaid,
    remaining_balance_try: remainingBalance,
  }
}

// ── Service class ─────────────────────────────────────────────────────────────

export class AmortizationScheduleService {
  constructor(private supabase: SupabaseClient) {}

  /**
   * Generate full amortization schedules for all active partner loan tranches.
   */
  async getReport(companyId: string): Promise<AmortizationReport> {
    const today = new Date().toISOString().substring(0, 10)

    const { data: rows, error } = await this.supabase
      .from('partner_loan_tranches')
      .select(`
        id,
        partner_id,
        principal_try,
        total_repaid_try,
        disbursement_date,
        expected_repayment_date,
        interest_rate_annual_pct,
        annual_interest_rate,
        status,
        partners(name)
      `)
      .eq('company_id', companyId)
      .in('status', ['active', 'partially_repaid', 'overdue'])
      .is('deleted_at', null)

    if (error) {
      throw new Error(`Tranche verisi alınamadı: ${error.message}`)
    }

    const schedules: LoanAmortizationSchedule[] = []

    for (const row of (rows ?? [])) {
      const r = row as Record<string, unknown>
      const trancheId = r.id as string
      const partnersJoin = r.partners as { name?: string } | null
      const partnerName = partnersJoin?.name ?? 'Ortak'

      const principal = Number(r.principal_try) || 0
      if (principal <= 0) continue

      // Disbursement date required for schedule
      const disbRaw = r.disbursement_date as string | null
      if (!disbRaw) continue
      const startDate = disbRaw.substring(0, 10)

      // Interest rate: prefer interest_rate_annual_pct; fall back to annual_interest_rate (decimal)
      let ratePct: number
      if (r.interest_rate_annual_pct != null && !isNaN(Number(r.interest_rate_annual_pct))) {
        ratePct = Number(r.interest_rate_annual_pct)
      } else if (r.annual_interest_rate != null && !isNaN(Number(r.annual_interest_rate))) {
        const raw = Number(r.annual_interest_rate)
        ratePct = raw <= 1 ? raw * 100 : raw
      } else {
        ratePct = 0
      }

      // Total months: from disbursement to expected_repayment_date; default 24
      let totalMonths = 24
      const repayRaw = r.expected_repayment_date as string | null
      if (repayRaw) {
        const computed = monthsBetween(startDate, repayRaw.substring(0, 10))
        if (computed > 0) totalMonths = computed
      }

      const schedule = buildSchedule(
        trancheId,
        partnerName,
        principal,
        ratePct,
        startDate,
        totalMonths,
        today,
      )

      schedules.push(schedule)
    }

    // Portfolio totals — use current remaining balances and forward-looking payments
    const totalMonthlyDebtService = round2(
      schedules.reduce((sum, s) => {
        // Only sum if not fully paid off
        if (s.remaining_balance_try > 0) return sum + s.monthly_payment_try
        return sum
      }, 0),
    )

    const totalRemainingBalance = round2(
      schedules.reduce((sum, s) => sum + s.remaining_balance_try, 0),
    )

    // Total interest remaining = cumulative interest from alreadyPaid+1 to end
    const totalInterestRemaining = round2(
      schedules.reduce((sum, s) => {
        const futureRows = s.rows.slice(s.already_paid_months)
        return sum + futureRows.reduce((fs, r) => fs + r.interest_try, 0)
      }, 0),
    )

    return {
      generated_at: new Date().toISOString(),
      schedules,
      total_monthly_debt_service_try: totalMonthlyDebtService,
      total_remaining_balance_try: totalRemainingBalance,
      total_interest_remaining_try: totalInterestRemaining,
    }
  }
}
