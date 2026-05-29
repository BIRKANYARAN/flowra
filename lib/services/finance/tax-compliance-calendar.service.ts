// ─────────────────────────────────────────────────────────────────────────────
// lib/services/finance/tax-compliance-calendar.service.ts
//
// Turkish Tax Compliance Calendar — KDV, Geçici Vergi, SGK, Kurumlar Vergisi
//
// Tracks Turkish statutory tax deadlines and computes liability estimates:
//   KDV (VAT):            output - input = payable; due 26th of next month
//   Geçici Vergi:         quarterly 25% corporate tax prepayment; Q1→May17, etc.
//   SGK:                  22.25% employer contribution; due last biz day next month
//   Kurumlar Vergisi:     annual reconciliation vs. Geçici Vergi installments
//   Stopaj:               15% blended payroll withholding estimate
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'
import { round2 } from '@/lib/calc'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>

// ── Constants ─────────────────────────────────────────────────────────────────

const DEFAULT_CORPORATE_TAX_RATE = 0.25      // Turkey 2024 standard rate
const DEFAULT_SGK_EMPLOYER_RATE  = 0.2225    // 20.25% pension + 2% unemployment
const DEFAULT_STOPAJ_BLENDED     = 0.15      // blended effective payroll withholding
const KDV_FALLBACK_RATE          = 0.18      // fallback for sales with no kdv_amount_try

// ── Report types ──────────────────────────────────────────────────────────────

export interface TaxComplianceCalendarReport {
  as_of_date:    string   // YYYY-MM-DD
  current_month: string   // YYYY-MM

  kdv: {
    current_month_output:  number
    current_month_input:   number
    current_month_balance: number
    carry_forward_credit:  number
    status:       'payable' | 'credit' | 'nil'
    due_date:     string
    days_until_due: number
    urgency: ReturnType<typeof classifyTaxDeadlineUrgency>
  }

  gecici_vergi: {
    current_quarter:       1 | 2 | 3 | 4
    ytd_profit:            number
    ytd_installment_due:   number
    ytd_installment_paid:  number
    next_due_date:         string
    days_until_next_due:   number
    urgency: ReturnType<typeof classifyTaxDeadlineUrgency>
  }

  sgk: {
    estimated_monthly_salaries: number
    employer_contribution:      number
    due_date:      string
    days_until_due: number
    urgency: ReturnType<typeof classifyTaxDeadlineUrgency>
  }

  annual_kv: {
    estimated_annual_profit:  number
    estimated_kv_liability:   number
    gecici_vergi_paid_ytd:    number
    estimated_remaining:      number
    year_end_date:            string  // YYYY-12-31
  }

  effective_tax_rate:          number | null
  tax_burden_classification:   ReturnType<typeof classifyTaxBurden>

  upcoming_deadlines: Array<{
    tax_type:         'KDV' | 'Geçici Vergi' | 'SGK'
    due_date:         string
    amount_estimated: number
    days_until_due:   number
    urgency: ReturnType<typeof classifyTaxDeadlineUrgency>
  }>

  total_upcoming_30d: number
}

// ── KDV Computation ───────────────────────────────────────────────────────────

/**
 * Compute monthly KDV (VAT) balance.
 * outputKdv: VAT charged on sales (391 account)
 * inputKdv:  deductible VAT on expenses/purchases (191 account)
 * Positive = payable to government; negative = credit carry-forward.
 */
export function computeMonthlyKdv(outputKdv: number, inputKdv: number): number {
  return round2(outputKdv - inputKdv)
}

/**
 * Compute cumulative KDV credit carry-forward.
 * Takes array of monthly KDV balances (oldest first).
 * Negative months accumulate as credit; positive months consume credit first.
 * Returns array of running carry-forward balances (one per month).
 */
export function computeKdvCarryForward(monthlyKdvBalances: number[]): number[] {
  const result: number[] = []
  let carry = 0
  for (const balance of monthlyKdvBalances) {
    carry = round2(carry + balance)
    // Cap carry at 0: positive balance means debt paid, credit resets
    carry = Math.min(0, carry)
    result.push(carry)
  }
  return result
}

/**
 * Classify KDV payment status.
 * 'payable': positive balance (payment due)
 * 'credit':  negative balance (carry-forward credit)
 * 'nil':     zero balance
 */
export function classifyKdvStatus(kdvBalance: number): 'payable' | 'credit' | 'nil' {
  if (kdvBalance > 0) return 'payable'
  if (kdvBalance < 0) return 'credit'
  return 'nil'
}

// ── Geçici Vergi ──────────────────────────────────────────────────────────────

/**
 * Compute quarterly Geçici Vergi installment.
 * Negative profit → 0 (no prepayment due on a loss).
 */
export function computeGeciciVergi(
  quarterlyProfit: number,
  corporateTaxRate: number = DEFAULT_CORPORATE_TAX_RATE,
): number {
  if (quarterlyProfit <= 0) return 0
  return round2(quarterlyProfit * corporateTaxRate)
}

/**
 * Compute cumulative YTD Geçici Vergi installments paid.
 */
export function computeYtdGeciciVergiPaid(quarterlyInstallments: number[]): number {
  return round2(quarterlyInstallments.reduce((s, v) => s + v, 0))
}

/**
 * Compute estimated annual KV (Kurumlar Vergisi) remaining balance.
 * Returns remaining final payment (min 0 — cannot be negative).
 */
export function computeAnnualKvBalance(
  annualProfit: number,
  geciciVergiPaid: number,
  corporateTaxRate: number = DEFAULT_CORPORATE_TAX_RATE,
): number {
  if (annualProfit <= 0) return 0
  const totalLiability = round2(annualProfit * corporateTaxRate)
  return Math.max(0, round2(totalLiability - geciciVergiPaid))
}

// ── SGK Employer Contribution ─────────────────────────────────────────────────

/**
 * Compute monthly SGK employer contribution.
 * Rate: 20.25% pension + 2% unemployment = 22.25%
 */
export function computeSgkEmployerContribution(totalGrossSalaries: number): number {
  return round2(totalGrossSalaries * DEFAULT_SGK_EMPLOYER_RATE)
}

/**
 * Compute monthly stopaj (income tax withholding) estimate on payroll.
 * Simplified blended effective rate (default 15%).
 */
export function computeStopajEstimate(
  totalGrossSalaries: number,
  blendedRate: number = DEFAULT_STOPAJ_BLENDED,
): number {
  return round2(totalGrossSalaries * blendedRate)
}

// ── Due Date Calculation ──────────────────────────────────────────────────────

/** Advance a date to the next Monday if it falls on a weekend. */
function adjustWeekend(d: Date): Date {
  const day = d.getDay() // 0=Sun, 6=Sat
  if (day === 6) { d.setDate(d.getDate() + 2) } // Sat → Mon
  else if (day === 0) { d.setDate(d.getDate() + 1) } // Sun → Mon
  return d
}

/**
 * Compute KDV due date for a given month.
 * KDV is due on the 26th of the following month.
 * If the 26th falls on a weekend, advances to the next Monday.
 */
export function computeKdvDueDate(year: number, month: number): Date {
  // Following month
  const nextMonth = month === 12 ? 1 : month + 1
  const nextYear  = month === 12 ? year + 1 : year
  const d = new Date(nextYear, nextMonth - 1, 26)
  return adjustWeekend(d)
}

/**
 * Compute Geçici Vergi due date for a quarter.
 * Q1 → May 17, Q2 → Aug 17, Q3 → Nov 17, Q4 → Feb 17 (next year)
 * Weekend adjustment: next Monday.
 */
export function computeGeciciVergiDueDate(year: number, quarter: 1 | 2 | 3 | 4): Date {
  let d: Date
  switch (quarter) {
    case 1: d = new Date(year,     4,  17); break  // May 17
    case 2: d = new Date(year,     7,  17); break  // Aug 17
    case 3: d = new Date(year,    10,  17); break  // Nov 17
    case 4: d = new Date(year + 1, 1,  17); break  // Feb 17 next year
  }
  return adjustWeekend(d)
}

/**
 * Compute SGK due date: last business day of the following month.
 */
export function computeSgkDueDate(year: number, month: number): Date {
  const nextMonth = month === 12 ? 1  : month + 1
  const nextYear  = month === 12 ? year + 1 : year
  // Last day of the following month
  const lastDay = new Date(nextYear, nextMonth, 0) // day 0 = last day of prev month
  // Walk backward to the last weekday
  while (lastDay.getDay() === 0 || lastDay.getDay() === 6) {
    lastDay.setDate(lastDay.getDate() - 1)
  }
  return lastDay
}

/**
 * Returns days until due date. Negative = overdue.
 * Uses UTC date comparison (strips time component).
 */
export function computeDaysUntilDue(dueDate: Date, referenceDate: Date = new Date()): number {
  const due = Date.UTC(
    dueDate.getFullYear(),
    dueDate.getMonth(),
    dueDate.getDate(),
  )
  const ref = Date.UTC(
    referenceDate.getFullYear(),
    referenceDate.getMonth(),
    referenceDate.getDate(),
  )
  return Math.round((due - ref) / (1000 * 60 * 60 * 24))
}

/**
 * Classify urgency of a tax deadline.
 * 'overdue':   daysUntilDue < 0
 * 'critical':  0-3 days
 * 'urgent':    4-7 days
 * 'upcoming':  8-14 days
 * 'scheduled': > 14 days
 */
export function classifyTaxDeadlineUrgency(
  daysUntilDue: number,
): 'overdue' | 'critical' | 'urgent' | 'upcoming' | 'scheduled' {
  if (daysUntilDue < 0)   return 'overdue'
  if (daysUntilDue <= 3)  return 'critical'
  if (daysUntilDue <= 7)  return 'urgent'
  if (daysUntilDue <= 14) return 'upcoming'
  return 'scheduled'
}

// ── Tax Burden Classification ─────────────────────────────────────────────────

/**
 * Classify effective tax burden as a fraction of revenue.
 * 'minimal':   < 5%
 * 'low':       5-10%
 * 'moderate':  10-20%
 * 'high':      20-30%
 * 'excessive': > 30%
 */
export function classifyTaxBurden(
  effectiveTaxRate: number,
): 'minimal' | 'low' | 'moderate' | 'high' | 'excessive' {
  if (effectiveTaxRate < 0.05) return 'minimal'
  if (effectiveTaxRate < 0.10) return 'low'
  if (effectiveTaxRate < 0.20) return 'moderate'
  if (effectiveTaxRate < 0.30) return 'high'
  return 'excessive'
}

/**
 * Compute effective tax rate.
 * Returns null if revenue is 0 (avoid division by zero).
 */
export function computeEffectiveTaxRate(
  totalTaxesPaid: number,
  totalRevenue: number,
): number | null {
  if (totalRevenue === 0) return null
  return round2(totalTaxesPaid / totalRevenue)
}

// ── Date helpers ──────────────────────────────────────────────────────────────

function toIsoDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function monthStart(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}-01`
}

function monthEnd(year: number, month: number): string {
  const last = new Date(year, month, 0).getDate()
  return `${year}-${String(month).padStart(2, '0')}-${String(last).padStart(2, '0')}`
}

function currentQuarter(month: number): 1 | 2 | 3 | 4 {
  if (month <= 3) return 1
  if (month <= 6) return 2
  if (month <= 9) return 3
  return 4
}

// ── Service class ─────────────────────────────────────────────────────────────

export class TaxComplianceCalendarService {
  constructor(private readonly supabase: AnyClient) {}

  async getReport(companyId: string): Promise<TaxComplianceCalendarReport> {
    const now    = new Date()
    const year   = now.getFullYear()
    const month  = now.getMonth() + 1 // 1-based
    const asOf   = toIsoDate(now)
    const currentMonthKey = `${year}-${String(month).padStart(2, '0')}`

    const mFrom = monthStart(year, month)
    const mTo   = monthEnd(year, month)
    const ytdFrom = `${year}-01-01`

    // ── Parallel DB queries ────────────────────────────────────────────────────
    const [
      salesMonthResult,
      expensesMonthResult,
      salesYtdResult,
      expensesYtdResult,
    ] = await Promise.allSettled([
      // Current-month sales
      this.supabase
        .from('sales')
        .select('total, kdv_amount_try, sale_date')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .gte('sale_date', mFrom)
        .lte('sale_date', mTo),

      // Current-month expenses
      this.supabase
        .from('expenses')
        .select('amount_try, kdv, expense_type, expense_date')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .gte('expense_date', mFrom)
        .lte('expense_date', mTo),

      // YTD sales
      this.supabase
        .from('sales')
        .select('total, kdv_amount_try, sale_date')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .gte('sale_date', ytdFrom)
        .lte('sale_date', asOf),

      // YTD expenses
      this.supabase
        .from('expenses')
        .select('amount_try, kdv, expense_type, expense_date')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .gte('expense_date', ytdFrom)
        .lte('expense_date', asOf),
    ])

    // ── Extract current-month data ─────────────────────────────────────────────
    const salesMonthRows   = salesMonthResult.status === 'fulfilled'
      ? (salesMonthResult.value?.data ?? []) : []
    const expensesMonthRows = expensesMonthResult.status === 'fulfilled'
      ? (expensesMonthResult.value?.data ?? []) : []

    // ── Extract YTD data ───────────────────────────────────────────────────────
    const salesYtdRows     = salesYtdResult.status === 'fulfilled'
      ? (salesYtdResult.value?.data ?? []) : []
    const expensesYtdRows  = expensesYtdResult.status === 'fulfilled'
      ? (expensesYtdResult.value?.data ?? []) : []

    // ── KDV: current month ─────────────────────────────────────────────────────
    let outputKdv = 0
    let ytdRevenue = 0

    for (const row of salesMonthRows) {
      const total = Number(row.total ?? 0)
      // Use persisted kdv_amount_try if present; fallback: KDV_FALLBACK_RATE inside total
      const kdvAmt = row.kdv_amount_try != null
        ? Number(row.kdv_amount_try)
        : round2(total * KDV_FALLBACK_RATE / (1 + KDV_FALLBACK_RATE))
      outputKdv = round2(outputKdv + kdvAmt)
    }

    for (const row of salesYtdRows) {
      ytdRevenue = round2(ytdRevenue + Number(row.total ?? 0))
    }

    let inputKdv = 0
    let ytdSalaries = 0
    let ytdTaxPayments = 0  // expense_type='tax' → Geçici Vergi paid
    let monthSalaries  = 0

    for (const row of expensesMonthRows) {
      const amtTry = Number(row.amount_try ?? 0)
      // Input KDV on expenses: kdv field is a rate (%) on top of net
      const kdvRate = Number(row.kdv ?? 0) / 100
      const netAmt  = kdvRate > 0 ? round2(amtTry / (1 + kdvRate)) : amtTry
      const kdvAmt  = round2(amtTry - netAmt)
      if (kdvRate > 0) inputKdv = round2(inputKdv + kdvAmt)

      const etype = (row.expense_type ?? '').toLowerCase()
      if (etype === 'salary' || etype === 'payroll') {
        monthSalaries = round2(monthSalaries + amtTry)
      }
    }

    for (const row of expensesYtdRows) {
      const amtTry = Number(row.amount_try ?? 0)
      const etype  = (row.expense_type ?? '').toLowerCase()
      if (etype === 'salary' || etype === 'payroll') {
        ytdSalaries = round2(ytdSalaries + amtTry)
      }
      if (etype === 'tax') {
        ytdTaxPayments = round2(ytdTaxPayments + amtTry)
      }
    }

    // ── KDV balance & carry-forward ────────────────────────────────────────────
    const kdvBalance     = computeMonthlyKdv(outputKdv, inputKdv)
    const kdvStatus      = classifyKdvStatus(kdvBalance)
    // Carry-forward: only negative balance is credit; positive = payable (no carry)
    const carryForward   = kdvBalance < 0 ? kdvBalance : 0

    const kdvDue         = computeKdvDueDate(year, month)
    const kdvDaysUntil   = computeDaysUntilDue(kdvDue, now)
    const kdvUrgency     = classifyTaxDeadlineUrgency(kdvDaysUntil)

    // ── Geçici Vergi ───────────────────────────────────────────────────────────
    const quarter        = currentQuarter(month)
    const monthsElapsed  = month  // January = 1, December = 12

    // YTD profit = YTD revenue − YTD operating expenses (rough estimate)
    let ytdExpensesTotal = 0
    for (const row of expensesYtdRows) {
      ytdExpensesTotal = round2(ytdExpensesTotal + Number(row.amount_try ?? 0))
    }
    const ytdProfit      = Math.max(0, round2(ytdRevenue - ytdExpensesTotal))
    const ytdInstallmentDue = computeGeciciVergi(ytdProfit)

    const gvDue          = computeGeciciVergiDueDate(year, quarter)
    const gvDaysUntil    = computeDaysUntilDue(gvDue, now)
    const gvUrgency      = classifyTaxDeadlineUrgency(gvDaysUntil)

    // ── SGK ────────────────────────────────────────────────────────────────────
    // Use current month salary expenses; fallback to YTD average if none found
    const effectiveSalaries = monthSalaries > 0
      ? monthSalaries
      : monthsElapsed > 0 ? round2(ytdSalaries / monthsElapsed) : 0

    const sgkContribution = computeSgkEmployerContribution(effectiveSalaries)
    const sgkDue          = computeSgkDueDate(year, month)
    const sgkDaysUntil    = computeDaysUntilDue(sgkDue, now)
    const sgkUrgency      = classifyTaxDeadlineUrgency(sgkDaysUntil)

    // ── Annual KV estimate ─────────────────────────────────────────────────────
    const annualizedProfit = monthsElapsed > 0
      ? round2(ytdProfit * (12 / monthsElapsed))
      : 0
    const estimatedKvLiability = round2(annualizedProfit * DEFAULT_CORPORATE_TAX_RATE)
    const estimatedRemaining    = computeAnnualKvBalance(
      annualizedProfit,
      ytdTaxPayments,
    )
    const yearEndDate = `${year}-12-31`

    // ── Effective tax rate ─────────────────────────────────────────────────────
    const totalTaxes = round2(
      (kdvBalance > 0 ? kdvBalance : 0)
      + ytdInstallmentDue
      + sgkContribution,
    )
    const effectiveTaxRate = computeEffectiveTaxRate(totalTaxes, ytdRevenue)
    const taxBurdenClass   = effectiveTaxRate != null
      ? classifyTaxBurden(effectiveTaxRate)
      : classifyTaxBurden(0)

    // ── Upcoming deadlines (next 30 days) ──────────────────────────────────────
    const refDate30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)

    const candidates: TaxComplianceCalendarReport['upcoming_deadlines'] = [
      {
        tax_type:         'KDV',
        due_date:         toIsoDate(kdvDue),
        amount_estimated: kdvBalance > 0 ? kdvBalance : 0,
        days_until_due:   kdvDaysUntil,
        urgency:          kdvUrgency,
      },
      {
        tax_type:         'Geçici Vergi',
        due_date:         toIsoDate(gvDue),
        amount_estimated: ytdInstallmentDue,
        days_until_due:   gvDaysUntil,
        urgency:          gvUrgency,
      },
      {
        tax_type:         'SGK',
        due_date:         toIsoDate(sgkDue),
        amount_estimated: sgkContribution,
        days_until_due:   sgkDaysUntil,
        urgency:          sgkUrgency,
      },
    ]

    const upcoming_deadlines = candidates
      .filter(d => d.days_until_due >= 0 && d.days_until_due <= 30)
      .sort((a, b) => a.due_date.localeCompare(b.due_date))

    void refDate30 // used conceptually above

    const total_upcoming_30d = round2(
      upcoming_deadlines.reduce((s, d) => s + d.amount_estimated, 0),
    )

    return {
      as_of_date:    asOf,
      current_month: currentMonthKey,

      kdv: {
        current_month_output:  outputKdv,
        current_month_input:   inputKdv,
        current_month_balance: kdvBalance,
        carry_forward_credit:  carryForward,
        status:        kdvStatus,
        due_date:      toIsoDate(kdvDue),
        days_until_due: kdvDaysUntil,
        urgency:       kdvUrgency,
      },

      gecici_vergi: {
        current_quarter:      quarter,
        ytd_profit:           ytdProfit,
        ytd_installment_due:  ytdInstallmentDue,
        ytd_installment_paid: ytdTaxPayments,
        next_due_date:        toIsoDate(gvDue),
        days_until_next_due:  gvDaysUntil,
        urgency:              gvUrgency,
      },

      sgk: {
        estimated_monthly_salaries: effectiveSalaries,
        employer_contribution:      sgkContribution,
        due_date:       toIsoDate(sgkDue),
        days_until_due: sgkDaysUntil,
        urgency:        sgkUrgency,
      },

      annual_kv: {
        estimated_annual_profit:  annualizedProfit,
        estimated_kv_liability:   estimatedKvLiability,
        gecici_vergi_paid_ytd:    ytdTaxPayments,
        estimated_remaining:      estimatedRemaining,
        year_end_date:            yearEndDate,
      },

      effective_tax_rate:        effectiveTaxRate,
      tax_burden_classification: taxBurdenClass,

      upcoming_deadlines,
      total_upcoming_30d,
    }
  }
}
