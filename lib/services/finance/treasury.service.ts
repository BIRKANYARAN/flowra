// ─────────────────────────────────────────────────────────────────────────────
// lib/services/finance/treasury.service.ts
//
// Treasury Management — CFO-level cash position aggregation.
//
// Since bank_accounts / bank_statement_lines tables are not in schema,
// we use a fallback: estimate total cash from (sum(sales.amount_paid) − sum(expenses.amount_try)).
// A synthetic "Operating Account" entry is returned.
//
// When bank tables become available, the service can be extended to use them.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'
import { round2 } from '@/lib/calc'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>

// ── Interfaces ────────────────────────────────────────────────────────────────

export interface BankAccountSummary {
  account_id: string
  account_name: string
  bank_name: string
  currency: string
  balance_try: number
  last_transaction_date: string | null
  is_idle: boolean
  idle_days: number
}

export interface DailyCashPoint {
  date: string
  opening: number
  inflows: number
  outflows: number
  closing: number
}

export interface TreasuryReport {
  company_id: string
  as_of_date: string
  // Accounts
  accounts: BankAccountSummary[]
  total_cash_try: number
  account_count: number
  largest_account_pct: number
  is_concentrated: boolean
  idle_cash_try: number
  // Daily position (last 30d)
  daily_positions: DailyCashPoint[]
  min_balance_30d: number
  max_balance_30d: number
  avg_balance_30d: number
  // Ratios
  cash_runway_months: number | null
  obligation_coverage_ratio: number | null
  // Recommendations
  recommendations: string[]
  computed_at: string
}

// ── Pure exports ──────────────────────────────────────────────────────────────

/**
 * Compute cash concentration: largest account balance / total × 100.
 * Returns 0 if balances array is empty or total is 0.
 */
export function computeCashConcentration(balances: number[]): number {
  if (balances.length === 0) return 0
  const total = balances.reduce((s, b) => s + b, 0)
  if (total === 0) return 0
  const largest = Math.max(...balances)
  return round2((largest / total) * 100)
}

/**
 * Determine if cash is idle:
 *   - balance > 100_000 TRY
 *   - recent outflows (last 30d) < 10_000 TRY
 *   - daysSinceMovement > 30
 */
export function isIdleCash(
  balance: number,
  recentOutflows: number,
  daysSinceMovement: number,
): boolean {
  return balance > 100_000 && recentOutflows < 10_000 && daysSinceMovement > 30
}

/**
 * Compute cash runway in months = totalCash / avgMonthlyExpenses.
 * Returns null if avgMonthlyExpenses ≤ 0.
 */
export function computeRunwayMonths(
  totalCash: number,
  avgMonthlyExpenses: number,
): number | null {
  if (avgMonthlyExpenses <= 0) return null
  return round2(totalCash / avgMonthlyExpenses)
}

/**
 * Compute obligation coverage = totalCash / obligations30d.
 * Returns null if obligations30d ≤ 0.
 */
export function computeObligationCoverage(
  totalCash: number,
  obligations30d: number,
): number | null {
  if (obligations30d <= 0) return null
  return round2(totalCash / obligations30d)
}

/**
 * Build Turkish-language recommendations based on treasury metrics.
 */
export function buildRecommendations(
  totalCash: number,
  isConcentrated: boolean,
  idleCashTry: number,
  runwayMonths: number | null,
): string[] {
  const recs: string[] = []

  if (isConcentrated) {
    recs.push('Nakit yoğunluğu yüksek: Toplam nakitin %80\'inden fazlası tek hesapta. Riski dağıtmak için ek hesap açmayı değerlendirin.')
  }

  if (idleCashTry > 500_000) {
    recs.push(`Atıl nakit tespit edildi: ${formatTRY(idleCashTry)} TL 30+ gündür hareketsiz. Kısa vadeli TL mevduat veya para piyasası fonu değerlendirin.`)
  } else if (idleCashTry > 100_000) {
    recs.push(`${formatTRY(idleCashTry)} TL atıl durumda. Kısa vadeli mevduat ile getiri sağlamayı düşünün.`)
  }

  if (runwayMonths !== null && runwayMonths <= 2) {
    recs.push(`Kritik: Nakit rezervi yalnızca ${runwayMonths.toFixed(1)} aylık gideri karşılıyor. Acil tahsilat ve gider kısıtlaması gerekli.`)
  } else if (runwayMonths !== null && runwayMonths <= 4) {
    recs.push(`Uyarı: ${runwayMonths.toFixed(1)} aylık nakit rezervi mevcut. Tahsilat hızlandırılmalı veya kredi limiti genişletilmelidir.`)
  }

  if (totalCash <= 0) {
    recs.push('Nakit pozisyonu negatif veya sıfır. Finansman ihtiyacı acil değerlendirme gerektiriyor.')
  }

  return recs
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function formatTRY(amount: number): string {
  return new Intl.NumberFormat('tr-TR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.round(amount))
}

/** Last N calendar days ending today as 'YYYY-MM-DD' strings, oldest first */
function buildDaySlots(today: Date, days: number): string[] {
  const slots: string[] = []
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    slots.push(d.toISOString().slice(0, 10))
  }
  return slots
}

// ── Service ───────────────────────────────────────────────────────────────────

export class TreasuryService {

  static async getReport(
    companyId: string,
    supabase: AnyClient,
    now: Date = new Date(),
  ): Promise<TreasuryReport> {
    const today     = now.toISOString().slice(0, 10)
    const days30ago = new Date(now)
    days30ago.setDate(days30ago.getDate() - 30)
    const from30 = days30ago.toISOString().slice(0, 10)

    // Fetch 6 months for runway calculation
    const months6ago = new Date(now)
    months6ago.setMonth(months6ago.getMonth() - 6)
    const from6mo = months6ago.toISOString().slice(0, 10)

    // ── Parallel queries ───────────────────────────────────────────────────────
    const [
      salesAllResult,
      expensesAllResult,
      sales30dResult,
      expenses30dResult,
      upcomingExpensesResult,
    ] = await Promise.allSettled([
      // All-time sales (for total cash estimate)
      supabase
        .from('sales')
        .select('sale_date, total_try, amount_paid, payment_status')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .lte('sale_date', today),

      // All-time expenses (for total cash estimate)
      supabase
        .from('expenses')
        .select('expense_date, amount_try, payment_status')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .lte('expense_date', today),

      // Sales last 30d (for idle detection + daily positions)
      supabase
        .from('sales')
        .select('sale_date, total_try, amount_paid, payment_status')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .gte('sale_date', from30)
        .lte('sale_date', today),

      // Expenses last 30d (for idle detection + daily positions)
      supabase
        .from('expenses')
        .select('expense_date, amount_try, payment_status')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .gte('expense_date', from30)
        .lte('expense_date', today),

      // Upcoming expenses in next 30d (obligations)
      supabase
        .from('expenses')
        .select('expense_date, amount_try')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .gt('expense_date', today)
        .lte('expense_date', new Date(now.getTime() + 30 * 86400000).toISOString().slice(0, 10)),
    ])

    const salesAll     = salesAllResult.status     === 'fulfilled' ? (salesAllResult.value.data     ?? []) : []
    const expensesAll  = expensesAllResult.status  === 'fulfilled' ? (expensesAllResult.value.data  ?? []) : []
    const sales30d     = sales30dResult.status     === 'fulfilled' ? (sales30dResult.value.data     ?? []) : []
    const expenses30d  = expenses30dResult.status  === 'fulfilled' ? (expenses30dResult.value.data  ?? []) : []
    const upcoming     = upcomingExpensesResult.status === 'fulfilled' ? (upcomingExpensesResult.value.data ?? []) : []

    // ── Compute total cash (fallback: cumulative collections − paid expenses) ──
    let totalCollected = 0
    let totalPaid = 0
    let lastSaleDate: string | null = null

    for (const s of salesAll) {
      const pd = s.payment_status === 'paid'
        ? Number(s.total_try) || 0
        : s.payment_status === 'partial'
          ? Number(s.amount_paid) || 0
          : 0
      totalCollected += pd
      if (s.sale_date) {
        if (!lastSaleDate || s.sale_date > lastSaleDate) lastSaleDate = s.sale_date
      }
    }

    for (const e of expensesAll) {
      const ps = e.payment_status
      if (ps === 'paid' || ps === 'partial' || ps == null) {
        totalPaid += Number(e.amount_try) || 0
      }
    }

    const totalCash = round2(Math.max(0, totalCollected - totalPaid))

    // ── Last 30d outflows ──────────────────────────────────────────────────────
    let outflows30d = 0
    let lastExpenseDate: string | null = null

    for (const e of expenses30d) {
      outflows30d += Number(e.amount_try) || 0
      if (e.expense_date) {
        if (!lastExpenseDate || e.expense_date > lastExpenseDate) lastExpenseDate = e.expense_date
      }
    }

    // ── Days since last movement ───────────────────────────────────────────────
    const lastMovement = lastExpenseDate ?? lastSaleDate
    let daysSinceMovement = 999
    if (lastMovement) {
      const diff = now.getTime() - new Date(lastMovement).getTime()
      daysSinceMovement = Math.floor(diff / 86400000)
    }

    // ── Build synthetic account ────────────────────────────────────────────────
    const idle = isIdleCash(totalCash, outflows30d, daysSinceMovement)
    const account: BankAccountSummary = {
      account_id:            'synthetic-operating',
      account_name:          'İşletme Hesabı (Tahmini)',
      bank_name:             'Genel',
      currency:              'TRY',
      balance_try:           totalCash,
      last_transaction_date: lastMovement,
      is_idle:               idle,
      idle_days:             daysSinceMovement,
    }

    // ── Cash concentration ─────────────────────────────────────────────────────
    const largestAccountPct = computeCashConcentration([totalCash])
    const isConcentrated    = largestAccountPct > 80
    const idleCashTry       = idle ? totalCash : 0

    // ── Daily cash positions (last 30d) ────────────────────────────────────────
    const daySlots = buildDaySlots(now, 30)

    // Build daily inflow/outflow maps
    const inflowByDay:  Record<string, number> = {}
    const outflowByDay: Record<string, number> = {}

    for (const d of daySlots) {
      inflowByDay[d]  = 0
      outflowByDay[d] = 0
    }

    for (const s of sales30d) {
      const d = s.sale_date?.slice(0, 10)
      if (d && d in inflowByDay) {
        const amt = s.payment_status === 'paid'
          ? Number(s.total_try) || 0
          : s.payment_status === 'partial'
            ? Number(s.amount_paid) || 0
            : 0
        inflowByDay[d] = round2(inflowByDay[d] + amt)
      }
    }

    for (const e of expenses30d) {
      const d = e.expense_date?.slice(0, 10)
      if (d && d in outflowByDay) {
        outflowByDay[d] = round2(outflowByDay[d] + (Number(e.amount_try) || 0))
      }
    }

    // Build 30d cash position from running balance
    // Opening of day 0 = estimated total_cash minus the 30d net
    const net30d = Object.values(inflowByDay).reduce((s, v) => s + v, 0)
               - Object.values(outflowByDay).reduce((s, v) => s + v, 0)
    let running = round2(totalCash - net30d) // opening 30d ago

    const daily_positions: DailyCashPoint[] = []
    for (const d of daySlots) {
      const inflows  = inflowByDay[d]  ?? 0
      const outflows = outflowByDay[d] ?? 0
      const opening  = running
      const closing  = round2(opening + inflows - outflows)
      daily_positions.push({ date: d, opening, inflows, outflows, closing })
      running = closing
    }

    // ── 30d stats ──────────────────────────────────────────────────────────────
    const closings       = daily_positions.map(d => d.closing)
    const min_balance_30d = closings.length > 0 ? Math.min(...closings) : 0
    const max_balance_30d = closings.length > 0 ? Math.max(...closings) : 0
    const avg_balance_30d = closings.length > 0
      ? round2(closings.reduce((s, v) => s + v, 0) / closings.length)
      : 0

    // ── Monthly expenses for runway ────────────────────────────────────────────
    // Use 6-month average
    const sixMonthExpenses = expensesAll.filter(e => e.expense_date >= from6mo)
    const totalSixMoExpenses = sixMonthExpenses.reduce((s, e) => s + (Number(e.amount_try) || 0), 0)
    const avgMonthlyExpenses = round2(totalSixMoExpenses / 6)

    // ── Obligations (upcoming 30d expenses) ───────────────────────────────────
    const obligations30d = upcoming.reduce((s, e) => s + (Number(e.amount_try) || 0), 0)

    // ── Ratios ─────────────────────────────────────────────────────────────────
    const cash_runway_months        = computeRunwayMonths(totalCash, avgMonthlyExpenses)
    const obligation_coverage_ratio = computeObligationCoverage(totalCash, obligations30d)

    // ── Recommendations ───────────────────────────────────────────────────────
    const baseRecs = buildRecommendations(totalCash, isConcentrated, idleCashTry, cash_runway_months)
    const recommendations = [
      'Not: Banka hesap verileri henüz bağlı değil. Nakit pozisyonu tahsilat − gider farkından tahmin edilmiştir.',
      ...baseRecs,
    ]

    return {
      company_id:   companyId,
      as_of_date:   today,
      accounts:     [account],
      total_cash_try: totalCash,
      account_count:  1,
      largest_account_pct: largestAccountPct,
      is_concentrated:     isConcentrated,
      idle_cash_try:       idleCashTry,
      daily_positions,
      min_balance_30d,
      max_balance_30d,
      avg_balance_30d,
      cash_runway_months,
      obligation_coverage_ratio,
      recommendations,
      computed_at: now.toISOString(),
    }
  }
}
