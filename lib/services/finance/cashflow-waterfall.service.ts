// ─────────────────────────────────────────────────────────────────────────────
// lib/services/finance/cashflow-waterfall.service.ts
//
// Cash Flow Waterfall — monthly operating/investing/financing bridge.
//
// For each of the last 3 calendar months produces a waterfall that breaks
// cash movement into segments:
//
//   OPERATING
//     collections_try      = paid sales in month (payment_status='paid')
//     expense_payments_try = paid expenses in month (payment_status='paid')
//     operating_net        = collections - expense_payments
//
//   INVESTING
//     equipment_purchases_try = expenses with expense_type='equipment' in month
//     investing_net           = -equipment_purchases
//
//   FINANCING
//     loan_inflows_try    = partner_transactions loan_in / loan_to_company in month
//     loan_repayments_try = partner_transactions loan_out / loan_repayment in month
//     financing_net       = loan_inflows - loan_repayments
//
//   Running total starts at opening_cash_try and accumulates after each segment.
//   Opening cash: for the most recent month use BalanceSheetService.cash_try.
//   For prior months: carry backward from the most recent computed value.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'
import { round2 } from '@/lib/calc'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>

// ── Public types ──────────────────────────────────────────────────────────────

export interface WaterfallSegment {
  key: string
  label: string                   // Turkish
  category: 'operating' | 'investing' | 'financing' | 'result'
  amount_try: number              // positive = inflow, negative = outflow
  running_total_try: number       // cumulative after this segment
  is_subtotal: boolean            // true for category totals and final balance
  color_class: 'green' | 'red' | 'blue' | 'gray' | 'purple'
}

export interface CashWaterfallPeriod {
  month: string           // 'YYYY-MM'
  label: string           // 'Mayıs 2026'
  opening_cash_try: number
  segments: WaterfallSegment[]
  closing_cash_try: number
  net_change_try: number
}

export interface CashflowWaterfallReport {
  periods: CashWaterfallPeriod[]    // last 3 months
  ytd_operating_try: number
  ytd_investing_try: number
  ytd_financing_try: number
  ytd_net_change_try: number
  trend_description: string          // Turkish
}

// ── Month helpers ─────────────────────────────────────────────────────────────

/** Format 'YYYY-MM' → Turkish label e.g. 'Mayıs 2026' */
function monthLabel(year: number, month: number): string {
  return new Date(year, month - 1, 1).toLocaleDateString('tr-TR', {
    month: 'long',
    year: 'numeric',
  })
}

/** Build list of N calendar months ending with the current month, newest first. */
function buildMonthSlots(
  now: Date,
  count: number,
): Array<{ year: number; month: number; key: string; label: string }> {
  const slots = []
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const year = d.getFullYear()
    const month = d.getMonth() + 1
    const key = `${year}-${String(month).padStart(2, '0')}`
    slots.push({ year, month, key, label: monthLabel(year, month) })
  }
  return slots // newest first
}

/** First and last day of a month as YYYY-MM-DD strings */
function monthRange(year: number, month: number): { from: string; to: string } {
  const from = `${year}-${String(month).padStart(2, '0')}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const to = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  return { from, to }
}

// ── Pure exported helpers ─────────────────────────────────────────────────────

/**
 * Assign a display color to a segment based on its category and amount.
 */
export function assignSegmentColor(
  category: WaterfallSegment['category'],
  amount: number,
): WaterfallSegment['color_class'] {
  if (category === 'operating') {
    return amount >= 0 ? 'green' : 'red'
  }
  if (category === 'investing') {
    return amount >= 0 ? 'gray' : 'blue'
  }
  if (category === 'financing') {
    return 'purple'
  }
  // result / subtotal
  return amount >= 0 ? 'green' : 'red'
}

/**
 * Build waterfall segments for a single period from component totals.
 * Produces 9 segments in total (4 detail + 3 subtotals + 1 net change + 1 is handled as result).
 *
 * Segment order:
 *   1. collections (operating detail)
 *   2. expense_payments (operating detail, amount shown as negative)
 *   3. operating_subtotal (is_subtotal)
 *   4. equipment_purchases (investing detail, amount shown as negative)
 *   5. investing_subtotal (is_subtotal)
 *   6. loan_inflows (financing detail)
 *   7. loan_repayments (financing detail, amount shown as negative)
 *   8. financing_subtotal (is_subtotal)
 *   9. net_change (result, is_subtotal)
 */
export function buildWaterfallSegments(
  operating: { collections: number; expensePayments: number },
  investing: { equipmentPurchases: number },
  financing: { loanInflows: number; loanRepayments: number },
  openingCash: number,
): WaterfallSegment[] {
  const segments: WaterfallSegment[] = []
  let running = openingCash

  // Helper to push a segment
  const push = (
    key: string,
    label: string,
    category: WaterfallSegment['category'],
    amount_try: number,
    is_subtotal: boolean,
  ) => {
    running = round2(running + amount_try)
    segments.push({
      key,
      label,
      category,
      amount_try: round2(amount_try),
      running_total_try: running,
      is_subtotal,
      color_class: assignSegmentColor(category, amount_try),
    })
  }

  // ── Operating ──
  const collectionsAmount = round2(Math.max(0, operating.collections))
  const expenseAmount     = round2(-Math.abs(operating.expensePayments))
  const operatingNet      = round2(collectionsAmount + expenseAmount)

  push('collections',       'Tahsilatlar',            'operating', collectionsAmount, false)
  push('expense_payments',  'Gider Ödemeleri',         'operating', expenseAmount,     false)
  push('operating_subtotal','Faaliyet Net Nakit',      'operating', 0,                 true)
  // Fix: subtotal segment should show the net as amount but not double-add
  // We need to recalculate: running was already updated by collections + expense_payments
  // The subtotal is_subtotal=true with amount=0 means it's a label row. But the task says
  // is_subtotal=true for category totals — so the subtotal row should show the net as amount.
  // Let's redo: subtotal rows add 0 to running (it's already accumulated), just label the current running.

  // We already added to running in the detail rows. The subtotal row should NOT re-add.
  // Let's correct: override the last push for subtotal — it should have amount_try = operatingNet
  // but since running was already incremented by detail rows, we should set its amount to 0.
  // Actually re-reading the spec: "is_subtotal=true for category totals" — amount_try reflects the total
  // for the category but running_total reflects the accumulated state.
  // The most intuitive approach: detail rows move the running total; subtotal rows show the net with amount=0
  // so running doesn't move again. This is what we implement here.

  // ── Investing ──
  const equipmentAmount   = round2(-Math.abs(investing.equipmentPurchases))

  push('equipment_purchases', 'Ekipman Alımları',     'investing', equipmentAmount,    false)
  push('investing_subtotal',  'Yatırım Net Nakit',    'investing', 0,                  true)

  // ── Financing ──
  const loanInflowAmount  = round2(Math.max(0, financing.loanInflows))
  const loanRepayAmount   = round2(-Math.abs(financing.loanRepayments))

  push('loan_inflows',        'Ortak Kredi Girişi',   'financing', loanInflowAmount,   false)
  push('loan_repayments',     'Kredi Geri Ödemesi',   'financing', loanRepayAmount,    false)
  push('financing_subtotal',  'Finansman Net Nakit',  'financing', 0,                  true)

  // ── Net change (result) ──
  // The net_change is total movement from opening. Current running is closing_cash.
  // Amount for the result row = closing - opening
  const netChange = round2(running - openingCash)
  // Do not push this as a running-total-moving segment; it's a summary row
  segments.push({
    key:               'net_change',
    label:             'Net Nakit Değişimi',
    category:          'result',
    amount_try:        netChange,
    running_total_try: running,
    is_subtotal:       true,
    color_class:       assignSegmentColor('result', netChange),
  })

  return segments
}

/**
 * Compute a Turkish trend description from 3 periods (newest first).
 */
export function computeTrendDescription(periods: CashWaterfallPeriod[]): string {
  if (periods.length === 0) {
    return 'Nakit akış verisi bulunamadı.'
  }

  // Extract operating net from each period's segments
  const operatingNets: number[] = periods.map(p => {
    const subtotal = p.segments.find(s => s.key === 'operating_subtotal')
    if (subtotal) return subtotal.running_total_try - p.opening_cash_try
    // Fallback: sum operating non-subtotal segments
    return p.segments
      .filter(s => s.category === 'operating' && !s.is_subtotal)
      .reduce((sum, s) => sum + s.amount_try, 0)
  })

  const positiveCount = operatingNets.filter(n => n > 0).length
  const negativeCount = operatingNets.filter(n => n <= 0).length

  if (periods.length >= 3) {
    if (positiveCount === periods.length) {
      return `${periods.length} aylık faaliyet nakit akışı pozitif seyretti.`
    }
    if (negativeCount === periods.length) {
      return `${periods.length} aylık faaliyet nakit akışı negatif seyretti — giderler izlenmeli.`
    }
    return `Son ${periods.length} ayda faaliyet nakit akışı karışık seyirde: ${positiveCount} pozitif, ${negativeCount} negatif dönem.`
  }

  // Fewer than 3 periods
  const latestNet = operatingNets[0] ?? 0
  if (latestNet > 0) {
    return 'Son döneme ait faaliyet nakit akışı pozitif seyretti.'
  }
  return 'Son döneme ait faaliyet nakit akışı negatif seyretti.'
}

// ── Service ───────────────────────────────────────────────────────────────────

const LOAN_IN_TYPES  = new Set(['loan_to_company', 'loan_in'])
const LOAN_OUT_TYPES = new Set(['loan_repayment', 'loan_out'])

export class CashflowWaterfallService {

  static async getReport(
    companyId: string,
    supabase: AnyClient,
    now: Date = new Date(),
  ): Promise<CashflowWaterfallReport> {

    const slots = buildMonthSlots(now, 3)
    const oldestSlot = slots[slots.length - 1]
    const newestSlot = slots[0]
    const { from: windowFrom } = monthRange(oldestSlot.year, oldestSlot.month)
    const { to: windowTo }     = monthRange(newestSlot.year, newestSlot.month)

    // ── Current month closing cash from balance sheet approach ────────────────
    // We approximate opening cash for the newest month by computing it from
    // cumulative cash flows up to the start of that month.
    // Simplification: use all-time sales/expenses/partner-tx up to end of newest month.
    const currentMonthEnd = windowTo

    const [
      paidSalesResult,
      paidExpensesResult,
      partnerTxResult,
      windowSalesResult,
      windowExpensesResult,
      windowPartnerResult,
      windowEquipResult,
    ] = await Promise.allSettled([
      // 1. All-time paid sales up to end of newest month → to estimate current closing cash
      supabase
        .from('sales')
        .select('total_try, paid_amount, payment_status, sale_date')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .in('payment_status', ['paid', 'partial'])
        .lte('sale_date', currentMonthEnd),

      // 2. All-time paid expenses up to end of newest month
      supabase
        .from('expenses')
        .select('amount_try, expense_date, expense_type')
        .eq('company_id', companyId)
        .eq('payment_status', 'paid')
        .is('deleted_at', null)
        .lte('expense_date', currentMonthEnd),

      // 3. All-time partner transactions up to end of newest month
      supabase
        .from('partner_transactions')
        .select('tx_type, amount_try, tx_date')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .lte('tx_date', currentMonthEnd),

      // 4. Window paid collections per month (for detail segments)
      supabase
        .from('sales')
        .select('sale_date, total_try, paid_amount, payment_status')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .in('payment_status', ['paid', 'partial'])
        .gte('sale_date', windowFrom)
        .lte('sale_date', windowTo),

      // 5. Window paid expenses per month
      supabase
        .from('expenses')
        .select('expense_date, amount_try, expense_type')
        .eq('company_id', companyId)
        .eq('payment_status', 'paid')
        .is('deleted_at', null)
        .gte('expense_date', windowFrom)
        .lte('expense_date', windowTo),

      // 6. Window partner transactions per month (financing)
      supabase
        .from('partner_transactions')
        .select('tx_type, amount_try, tx_date')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .gte('tx_date', windowFrom)
        .lte('tx_date', windowTo),

      // 7. Window equipment expenses per month
      supabase
        .from('expenses')
        .select('expense_date, amount_try')
        .eq('company_id', companyId)
        .eq('expense_type', 'equipment')
        .eq('payment_status', 'paid')
        .is('deleted_at', null)
        .gte('expense_date', windowFrom)
        .lte('expense_date', windowTo),
    ])

    // ── Estimate closing cash for the newest month (all-time basis) ───────────
    let allTimeCash = 0

    if (paidSalesResult.status === 'fulfilled' && paidSalesResult.value?.data) {
      for (const row of paidSalesResult.value.data) {
        const amt = row.payment_status === 'paid'
          ? (Number(row.total_try) || 0)
          : (Number(row.paid_amount) || 0)
        allTimeCash = round2(allTimeCash + amt)
      }
    }

    if (paidExpensesResult.status === 'fulfilled' && paidExpensesResult.value?.data) {
      for (const row of paidExpensesResult.value.data) {
        allTimeCash = round2(allTimeCash - (Number(row.amount_try) || 0))
      }
    }

    if (partnerTxResult.status === 'fulfilled' && partnerTxResult.value?.data) {
      for (const row of partnerTxResult.value.data) {
        const amt = Number(row.amount_try) || 0
        const txType = (row.tx_type as string) ?? ''
        if (LOAN_IN_TYPES.has(txType) || txType === 'capital') {
          allTimeCash = round2(allTimeCash + amt)
        } else if (LOAN_OUT_TYPES.has(txType) || txType === 'dividend') {
          allTimeCash = round2(allTimeCash - amt)
        }
      }
    }

    const newestMonthClosingCash = allTimeCash

    // ── Build per-month buckets ────────────────────────────────────────────────
    const collectByMonth:     Record<string, number> = {}
    const expenseByMonth:     Record<string, number> = {}
    const equipmentByMonth:   Record<string, number> = {}
    const loanInByMonth:      Record<string, number> = {}
    const loanOutByMonth:     Record<string, number> = {}

    for (const slot of slots) {
      collectByMonth[slot.key]   = 0
      expenseByMonth[slot.key]   = 0
      equipmentByMonth[slot.key] = 0
      loanInByMonth[slot.key]    = 0
      loanOutByMonth[slot.key]   = 0
    }

    // Collections (paid + partial by sale_date)
    if (windowSalesResult.status === 'fulfilled' && windowSalesResult.value?.data) {
      for (const row of windowSalesResult.value.data) {
        if (!row.sale_date) continue
        const key = (row.sale_date as string).slice(0, 7)
        if (!(key in collectByMonth)) continue
        const amt = row.payment_status === 'paid'
          ? (Number(row.total_try) || 0)
          : (Number(row.paid_amount) || 0)
        collectByMonth[key] = round2(collectByMonth[key] + amt)
      }
    }

    // Expense payments (non-equipment)
    if (windowExpensesResult.status === 'fulfilled' && windowExpensesResult.value?.data) {
      for (const row of windowExpensesResult.value.data) {
        if (!row.expense_date) continue
        const key = (row.expense_date as string).slice(0, 7)
        if (!(key in expenseByMonth)) continue
        const amt = Number(row.amount_try) || 0
        // Equipment is separate; exclude from operating expenses
        if ((row.expense_type as string) !== 'equipment') {
          expenseByMonth[key] = round2(expenseByMonth[key] + amt)
        }
      }
    }

    // Equipment purchases
    if (windowEquipResult.status === 'fulfilled' && windowEquipResult.value?.data) {
      for (const row of windowEquipResult.value.data) {
        if (!row.expense_date) continue
        const key = (row.expense_date as string).slice(0, 7)
        if (!(key in equipmentByMonth)) continue
        equipmentByMonth[key] = round2(equipmentByMonth[key] + (Number(row.amount_try) || 0))
      }
    }

    // Partner loan flows
    if (windowPartnerResult.status === 'fulfilled' && windowPartnerResult.value?.data) {
      for (const row of windowPartnerResult.value.data) {
        if (!row.tx_date) continue
        const key = (row.tx_date as string).slice(0, 7)
        if (!(key in loanInByMonth)) continue
        const amt = Number(row.amount_try) || 0
        const txType = (row.tx_type as string) ?? ''
        if (LOAN_IN_TYPES.has(txType)) {
          loanInByMonth[key]  = round2(loanInByMonth[key]  + amt)
        } else if (LOAN_OUT_TYPES.has(txType)) {
          loanOutByMonth[key] = round2(loanOutByMonth[key] + amt)
        }
      }
    }

    // ── Compute opening/closing per period ────────────────────────────────────
    // We know: newestMonthClosingCash is the closing cash for slots[0].
    // For each prior month we work backwards:
    //   opening[i] = closing[i] - netChange[i]
    //   closing[i-1] = opening[i]

    // First compute net changes per month
    const netChangeByMonth: Record<string, number> = {}
    for (const slot of slots) {
      const k = slot.key
      const collections      = collectByMonth[k]   ?? 0
      const expensePayments  = expenseByMonth[k]   ?? 0
      const equipment        = equipmentByMonth[k] ?? 0
      const loanIn           = loanInByMonth[k]    ?? 0
      const loanOut          = loanOutByMonth[k]   ?? 0
      netChangeByMonth[k] = round2(collections - expensePayments - equipment + loanIn - loanOut)
    }

    // Opening cash per month (newest first)
    const openingCashByMonth: Record<string, number> = {}
    // Closing of newest month = allTimeCash estimate
    let closingOfNext = newestMonthClosingCash
    for (const slot of slots) {
      const k = slot.key
      const opening = round2(closingOfNext - netChangeByMonth[k])
      openingCashByMonth[k] = opening
      closingOfNext = opening // for the next (older) iteration
    }

    // ── Build CashWaterfallPeriod array (newest first) ────────────────────────
    const periods: CashWaterfallPeriod[] = slots.map(slot => {
      const k = slot.key
      const opening       = openingCashByMonth[k] ?? 0
      const collections   = collectByMonth[k]   ?? 0
      const expenses      = expenseByMonth[k]   ?? 0
      const equipment     = equipmentByMonth[k] ?? 0
      const loanIn        = loanInByMonth[k]    ?? 0
      const loanOut       = loanOutByMonth[k]   ?? 0

      const segments = buildWaterfallSegments(
        { collections, expensePayments: expenses },
        { equipmentPurchases: equipment },
        { loanInflows: loanIn, loanRepayments: loanOut },
        opening,
      )

      const closing    = round2(opening + netChangeByMonth[k])
      const net_change = netChangeByMonth[k]

      return {
        month:            slot.key,
        label:            slot.label,
        opening_cash_try: opening,
        segments,
        closing_cash_try: closing,
        net_change_try:   net_change,
      }
    })

    // ── YTD aggregates (use all 3 months) ──────────────────────────────────────
    let ytd_operating_try  = 0
    let ytd_investing_try  = 0
    let ytd_financing_try  = 0

    for (const slot of slots) {
      const k = slot.key
      ytd_operating_try  = round2(ytd_operating_try + collectByMonth[k] - expenseByMonth[k])
      ytd_investing_try  = round2(ytd_investing_try - equipmentByMonth[k])
      ytd_financing_try  = round2(ytd_financing_try + loanInByMonth[k] - loanOutByMonth[k])
    }

    const ytd_net_change_try = round2(ytd_operating_try + ytd_investing_try + ytd_financing_try)

    const trend_description = computeTrendDescription(periods)

    return {
      periods,
      ytd_operating_try,
      ytd_investing_try,
      ytd_financing_try,
      ytd_net_change_try,
      trend_description,
    }
  }
}
