// ═══════════════════════════════════════════════════════════════════════════════
// lib/services/finance/tax-compliance.service.ts
//
// Turkish Tax Compliance Tracker
//
// Tracks:
//   KDV (VAT) — monthly, due 26th of following month
//   Geçici Vergi (Advance Corporate Tax) — quarterly at 25% of cumulative profit
//
// All pure functions are exported for unit testing.
// ═══════════════════════════════════════════════════════════════════════════════

import type { SupabaseClient } from '@supabase/supabase-js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>

// ── Turkish month names ───────────────────────────────────────────────────────

const TR_MONTHS = [
  'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
]

function trMonth(m: number): string {
  return TR_MONTHS[m - 1] ?? String(m)
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

// ── Pure functions ────────────────────────────────────────────────────────────

/**
 * Returns outputKdv - inputKdv.
 * Positive = net payable to tax authority.
 * Negative = carry-forward credit.
 */
export function computeKdvPayable(
  outputKdv: number,
  inputKdv: number,
): number {
  return outputKdv - inputKdv
}

/**
 * Classifies KDV net position.
 *  payable : > 0.01  (owed to tax authority)
 *  credit  : < -0.01 (carry-forward deductible)
 *  zero    : between -0.01 and 0.01
 */
export function classifyKdvStatus(
  kdvPayable: number,
): 'payable' | 'credit' | 'zero' {
  if (kdvPayable > 0.01)  return 'payable'
  if (kdvPayable < -0.01) return 'credit'
  return 'zero'
}

/**
 * Returns the KDV filing due date for a given month.
 * Turkish rule: 26th of the NEXT calendar month.
 * Format: 'YYYY-MM-DD'
 */
export function computeKdvDueDate(year: number, month: number): string {
  let dueYear  = year
  let dueMonth = month + 1
  if (dueMonth > 12) {
    dueMonth = 1
    dueYear  = year + 1
  }
  return `${dueYear}-${pad2(dueMonth)}-26`
}

/**
 * Computes gecikme (late payment) faizi (interest).
 * Formula: amount × (monthlyRate / 100) × (daysLate / 30)
 * Returns 0 if daysLate ≤ 0 or amount ≤ 0.
 * Default monthlyRate: 4.5% per month (TCMB reference for SMEs).
 */
export function computeGecikmeFaizi(
  amount: number,
  daysLate: number,
  monthlyRate: number = 4.5,
): number {
  if (daysLate <= 0 || amount <= 0) return 0
  const interest = amount * (monthlyRate / 100) * (daysLate / 30)
  return Math.round(interest * 100) / 100
}

/**
 * Converts monthly gecikme faizi rate to annualized effective rate.
 * Formula: ((1 + monthlyRate/100)^12 - 1) * 100
 * Returns percentage, rounded to 2 decimal places.
 */
export function computeGecikmeFaiziAnnualized(monthlyRate: number): number {
  const annual = (Math.pow(1 + monthlyRate / 100, 12) - 1) * 100
  return Math.round(annual * 100) / 100
}

/**
 * Computes vergi cezası (penalty) per VUK (Vergi Usul Kanunu).
 * First offense: 50% of principal tax amount.
 * Repeat offense: 100% of principal tax amount.
 * Returns 0 if amount ≤ 0.
 */
export function computeGecikmeCezasi(
  amount: number,
  isFirstOffense: boolean = false,
): number {
  if (amount <= 0) return 0
  return isFirstOffense ? amount * 0.5 : amount * 1.0
}

/**
 * Combines principal + gecikme faizi + gecikme cezası.
 */
export function computeGecikmeToplam(
  principal: number,
  daysLate: number,
  monthlyRate: number = 4.5,
  isFirstOffense: boolean = false,
): { principal: number; interest: number; penalty: number; total: number } {
  const interest = computeGecikmeFaizi(principal, daysLate, monthlyRate)
  const penalty  = computeGecikmeCezasi(principal, isFirstOffense)
  const total    = principal + interest + penalty
  return {
    principal: Math.round(principal * 100) / 100,
    interest:  Math.round(interest  * 100) / 100,
    penalty:   Math.round(penalty   * 100) / 100,
    total:     Math.round(total     * 100) / 100,
  }
}

/**
 * Returns the due date for Turkish Geçici Vergi (quarterly advance tax).
 * Q1 (Jan–Mar): May 17
 * Q2 (Jan–Jun): Aug 17
 * Q3 (Jan–Sep): Nov 17
 * Q4 (Jan–Dec): Feb 17 of next year
 */
export function computeQuarterlyTaxDueDate(
  year: number,
  quarter: 1 | 2 | 3 | 4,
): string {
  switch (quarter) {
    case 1: return `${year}-05-17`
    case 2: return `${year}-08-17`
    case 3: return `${year}-11-17`
    case 4: return `${year + 1}-02-17`
  }
}

/**
 * Computes Geçici Vergi (advance corporate tax) estimate.
 * Returns max(0, ytdNetProfit × taxRate). Never negative.
 * Default taxRate: 0.25 (25% Turkish corporate rate for 2025+).
 */
export function computeGecikmeTaxEstimate(
  ytdNetProfit: number,
  taxRate: number = 0.25,
): number {
  return Math.max(0, ytdNetProfit * taxRate)
}

/**
 * Classifies a tax obligation's status relative to today.
 *
 *  paid      : isPaid = true
 *  overdue   : today > dueDate AND !isPaid
 *  due_soon  : daysUntilDue ≤ 7 AND !isPaid
 *  upcoming  : else
 */
export function classifyTaxObligationStatus(
  dueDate: string,
  today: string,
  isPaid: boolean,
): 'paid' | 'due_soon' | 'overdue' | 'upcoming' {
  if (isPaid) return 'paid'
  if (today > dueDate) return 'overdue'

  // compute daysUntilDue
  const msPerDay = 1000 * 60 * 60 * 24
  const dueMsUtc   = new Date(dueDate  + 'T00:00:00Z').getTime()
  const todayMsUtc = new Date(today    + 'T00:00:00Z').getTime()
  const daysUntilDue = Math.round((dueMsUtc - todayMsUtc) / msPerDay)

  if (daysUntilDue <= 7) return 'due_soon'
  return 'upcoming'
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function currentQuarter(month: number): 1 | 2 | 3 | 4 {
  if (month <= 3)  return 1
  if (month <= 6)  return 2
  if (month <= 9)  return 3
  return 4
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

// ── Service class ──────────────────────────────────────────────────────────────

export interface TaxComplianceReport {
  current_month_kdv: {
    output_kdv: number
    input_kdv: number
    kdv_payable: number
    status: 'payable' | 'credit' | 'zero'
    due_date: string
    obligation_status: 'paid' | 'due_soon' | 'overdue' | 'upcoming'
  }
  ytd_gecici_vergi: {
    ytd_net_profit: number
    estimated_tax: number
    current_quarter: 1 | 2 | 3 | 4
    due_date: string
    obligation_status: 'paid' | 'due_soon' | 'overdue' | 'upcoming'
  }
  next_3_obligations: Array<{
    type: 'kdv' | 'gecici_vergi'
    due_date: string
    estimated_amount: number | null
    status: 'paid' | 'due_soon' | 'overdue' | 'upcoming'
    label: string
  }>
  penalty_preview: ReturnType<typeof computeGecikmeToplam> | null
}

export class TaxComplianceService {
  constructor(private supabase: AnyClient) {}

  async getReport(companyId: string): Promise<TaxComplianceReport> {
    const today     = new Date().toISOString().slice(0, 10)
    const now       = new Date()
    const year      = now.getFullYear()
    const month     = now.getMonth() + 1   // 1-indexed

    // ── Month date bounds ─────────────────────────────────────────────────────
    const monthStart = `${year}-${pad2(month)}-01`
    const monthEnd   = new Date(year, month, 0).toISOString().slice(0, 10)  // last day of month

    // ── Year date bounds ──────────────────────────────────────────────────────
    const yearStart  = `${year}-01-01`
    const yearEnd    = `${year}-12-31`

    // ── Fetch current month output KDV (from sales) ───────────────────────────
    const [salesRes, expensesRes, ytdSalesRes, ytdExpensesRes] = await Promise.all([
      this.supabase
        .from('sales')
        .select('kdv_amount_try')
        .eq('company_id', companyId)
        .gte('created_at', monthStart + 'T00:00:00.000Z')
        .lte('created_at', monthEnd   + 'T23:59:59.999Z'),

      this.supabase
        .from('expenses')
        .select('amount_try, kdv')
        .eq('company_id', companyId)
        .gte('expense_date', monthStart)
        .lte('expense_date', monthEnd)
        .gt('kdv', 0),

      this.supabase
        .from('sales')
        .select('total_try')
        .eq('company_id', companyId)
        .gte('created_at', yearStart  + 'T00:00:00.000Z')
        .lte('created_at', yearEnd    + 'T23:59:59.999Z'),

      this.supabase
        .from('expenses')
        .select('amount_try')
        .eq('company_id', companyId)
        .gte('expense_date', yearStart)
        .lte('expense_date', yearEnd),
    ])

    // ── Current month output KDV ──────────────────────────────────────────────
    const outputKdv = round2(
      ((salesRes.data ?? []) as { kdv_amount_try: number }[])
        .reduce((s, r) => s + Number(r.kdv_amount_try ?? 0), 0),
    )

    // ── Current month input KDV (from deductible expenses) ───────────────────
    const inputKdv = round2(
      ((expensesRes.data ?? []) as { amount_try: number; kdv: number }[])
        .reduce((s, r) => s + Number(r.amount_try ?? 0) * Number(r.kdv ?? 0) / 100, 0),
    )

    // ── YTD net profit ────────────────────────────────────────────────────────
    const ytdRevenue = round2(
      ((ytdSalesRes.data ?? []) as { total_try: number }[])
        .reduce((s, r) => s + Number(r.total_try ?? 0), 0),
    )
    const ytdExpenses = round2(
      ((ytdExpensesRes.data ?? []) as { amount_try: number }[])
        .reduce((s, r) => s + Number(r.amount_try ?? 0), 0),
    )
    const ytdNetProfit = round2(ytdRevenue - ytdExpenses)

    // ── KDV calculations ──────────────────────────────────────────────────────
    const kdvPayable     = computeKdvPayable(outputKdv, inputKdv)
    const kdvStatus      = classifyKdvStatus(kdvPayable)
    const kdvDueDate     = computeKdvDueDate(year, month)
    const kdvObligStatus = classifyTaxObligationStatus(kdvDueDate, today, false)

    // ── Geçici Vergi calculations ─────────────────────────────────────────────
    const quarter        = currentQuarter(month)
    const estimatedTax   = computeGecikmeTaxEstimate(ytdNetProfit)
    const geciciDueDate  = computeQuarterlyTaxDueDate(year, quarter)
    const geciciObligSt  = classifyTaxObligationStatus(geciciDueDate, today, false)

    // ── Next 3 obligations ────────────────────────────────────────────────────
    // Build a list of upcoming KDV + Geçici Vergi obligations (current + next months)
    const obligations: TaxComplianceReport['next_3_obligations'] = []

    // Add next 3 KDV obligations (current month + 2 more)
    for (let i = 0; i < 3; i++) {
      let m = month + i
      let y = year
      while (m > 12) { m -= 12; y++ }
      const dueDate = computeKdvDueDate(y, m)
      const status  = classifyTaxObligationStatus(dueDate, today, false)
      obligations.push({
        type:             'kdv',
        due_date:         dueDate,
        estimated_amount: i === 0 ? (kdvPayable > 0 ? kdvPayable : null) : null,
        status,
        label:            `${trMonth(m)} KDV`,
      })
    }

    // Add next 2 Geçici Vergi obligations
    for (let qi = 0; qi < 2; qi++) {
      let q = (quarter + qi - 1) % 4 + 1 as 1 | 2 | 3 | 4
      const qYear  = quarter + qi > 4 ? year + 1 : year
      const dueDate = computeQuarterlyTaxDueDate(qYear, q)
      const status  = classifyTaxObligationStatus(dueDate, today, false)
      obligations.push({
        type:             'gecici_vergi',
        due_date:         dueDate,
        estimated_amount: qi === 0 && estimatedTax > 0 ? estimatedTax : null,
        status,
        label:            `Q${q} Geçici Vergi`,
      })
    }

    // Sort by due date and take first 3
    const next3 = obligations
      .sort((a, b) => a.due_date.localeCompare(b.due_date))
      .slice(0, 3)

    // ── Penalty preview (only if KDV is overdue) ─────────────────────────────
    let penaltyPreview: ReturnType<typeof computeGecikmeToplam> | null = null
    if (kdvObligStatus === 'overdue' && kdvPayable > 0) {
      const msPerDay = 1000 * 60 * 60 * 24
      const daysLate = Math.round(
        (new Date(today + 'T00:00:00Z').getTime() -
          new Date(kdvDueDate + 'T00:00:00Z').getTime()) / msPerDay
      )
      penaltyPreview = computeGecikmeToplam(kdvPayable, daysLate)
    }

    return {
      current_month_kdv: {
        output_kdv:         outputKdv,
        input_kdv:          inputKdv,
        kdv_payable:        kdvPayable,
        status:             kdvStatus,
        due_date:           kdvDueDate,
        obligation_status:  kdvObligStatus,
      },
      ytd_gecici_vergi: {
        ytd_net_profit:    ytdNetProfit,
        estimated_tax:     estimatedTax,
        current_quarter:   quarter,
        due_date:          geciciDueDate,
        obligation_status: geciciObligSt,
      },
      next_3_obligations:  next3,
      penalty_preview:     penaltyPreview,
    }
  }
}
