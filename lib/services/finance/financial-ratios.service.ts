// ─────────────────────────────────────────────────────────────────────────────
// lib/services/finance/financial-ratios.service.ts
//
// Financial Ratio Trends — 12-month historical trends for 8 key ratios.
//
// Ratios computed:
//   current_ratio          — current assets / current liabilities (liquidity)
//   gross_margin_pct       — (revenue - cogs) / revenue × 100
//   net_margin_pct         — net income / revenue × 100
//   dso_days               — (receivables / revenue) × 30
//   dpo_days               — (payables / cogs) × 30
//   expense_ratio_pct      — total expenses / revenue × 100
//   receivables_coverage_pct — collected / billed × 100
//   debt_to_revenue_pct    — partner loans / trailing 3-month revenue × 100
//
// Direction logic:
//   higher-is-better: current_ratio, gross_margin_pct, net_margin_pct, receivables_coverage_pct
//   lower-is-better:  dso_days, dpo_days, expense_ratio_pct, debt_to_revenue_pct
//   improving/deteriorating: last 3m trend vs prior 3m, >5% relative change
//   <3 valid points → 'insufficient'
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'
import { allocationUnitCost, cogsTruncationWarning } from '@/lib/finance/cogs'
import { round2 } from '@/lib/calc'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>

// ── Types ──────────────────────────────────────────────────────────────────────

export interface RatioPoint {
  month: string        // 'YYYY-MM'
  label: string        // Turkish short month 'Oca 26'
  value: number | null // null if insufficient data
}

export interface RatioTrend {
  key: string
  label: string          // Turkish label
  description: string    // one-line explanation
  unit: string           // '%' | 'gün' | 'x'
  points: RatioPoint[]
  current: number | null
  avg_12m: number | null
  direction: 'improving' | 'deteriorating' | 'stable' | 'insufficient'
  direction_label: string  // Turkish
  benchmark?: { value: number; label: string }  // healthy threshold
}

export interface FinancialRatiosReport {
  company_id: string
  as_of_month: string
  ratios: RatioTrend[]
  computed_at: string
}

// ── Short Turkish month labels ─────────────────────────────────────────────────

const SHORT_MONTHS = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara']

function shortMonthLabel(year: number, month: number): string {
  return `${SHORT_MONTHS[month - 1]} ${String(year).slice(-2)}`
}

// ── Pure exported helpers ──────────────────────────────────────────────────────

/**
 * Compute direction for a ratio trend.
 *
 * Logic:
 *   - Need at least 3 valid (non-null) points for directional signal
 *   - Compare avg of last 3 valid months vs avg of prior 3 valid months
 *   - >5% relative change → directional; else stable
 *   - higherIsBetter=true: recent > prior → improving; else deteriorating
 *   - higherIsBetter=false: recent < prior → improving; else deteriorating
 */
export function computeRatioDirection(
  points: Array<number | null>,
  higherIsBetter: boolean,
): RatioTrend['direction'] {
  const valid = points.filter((v): v is number => v !== null && isFinite(v))
  if (valid.length < 3) return 'insufficient'

  const n = valid.length
  const recent3 = valid.slice(Math.max(0, n - 3))
  const prior3  = valid.slice(Math.max(0, n - 6), Math.max(0, n - 3))

  if (recent3.length < 3 || prior3.length < 3) return 'insufficient'

  const recentAvg = recent3.reduce((s, v) => s + v, 0) / recent3.length
  const priorAvg  = prior3.reduce((s, v) => s + v, 0) / prior3.length

  if (priorAvg === 0) {
    // Cannot compute relative change — stable
    return 'stable'
  }

  const relChange = (recentAvg - priorAvg) / Math.abs(priorAvg)

  if (Math.abs(relChange) <= 0.05) return 'stable'

  if (higherIsBetter) {
    return relChange > 0 ? 'improving' : 'deteriorating'
  } else {
    return relChange < 0 ? 'improving' : 'deteriorating'
  }
}

/**
 * Compute 12-month average of ratio points, ignoring nulls.
 * Returns null if no valid points.
 */
export function computeAvg12m(points: Array<number | null>): number | null {
  const valid = points.filter((v): v is number => v !== null && isFinite(v))
  if (valid.length === 0) return null
  return round2(valid.reduce((s, v) => s + v, 0) / valid.length)
}

/**
 * Format a ratio value for display.
 * - 'x' unit → "2.3x"
 * - '%' unit → "18%"
 * - 'gün' unit → "24 gün"
 */
export function formatRatioValue(value: number | null, unit: string): string {
  if (value === null || !isFinite(value)) return '—'
  const rounded = Math.round(value * 10) / 10
  if (unit === 'x') return `${rounded.toFixed(1)}x`
  if (unit === '%') return `${rounded.toFixed(1)}%`
  if (unit === 'gün') return `${Math.round(value)} gün`
  return String(rounded)
}

const DIRECTION_LABELS: Record<RatioTrend['direction'], string> = {
  improving:     'İyileşiyor',
  deteriorating: 'Kötüleşiyor',
  stable:        'Stabil',
  insufficient:  'Yetersiz Veri',
}

/**
 * Build a complete RatioTrend object from raw monthly values.
 */
export function buildRatioTrend(
  key: string,
  label: string,
  description: string,
  unit: string,
  higherIsBetter: boolean,
  monthKeys: string[],         // ['YYYY-MM', ...] oldest first
  valuesByMonth: Map<string, number | null>,
  benchmark?: { value: number; label: string },
): RatioTrend {
  const points: RatioPoint[] = monthKeys.map(ym => {
    const [y, m] = ym.split('-').map(Number)
    return {
      month: ym,
      label: shortMonthLabel(y, m),
      value: valuesByMonth.get(ym) ?? null,
    }
  })

  const rawValues = points.map(p => p.value)
  const direction = computeRatioDirection(rawValues, higherIsBetter)
  const avg_12m   = computeAvg12m(rawValues)

  // Current = most recent non-null value
  let current: number | null = null
  for (let i = points.length - 1; i >= 0; i--) {
    if (points[i].value !== null) { current = points[i].value; break }
  }

  return {
    key,
    label,
    description,
    unit,
    points,
    current,
    avg_12m,
    direction,
    direction_label: DIRECTION_LABELS[direction],
    ...(benchmark ? { benchmark } : {}),
  }
}

// ── Internal month helpers ─────────────────────────────────────────────────────

/** Build an array of YYYY-MM keys for the last N months ending at (year, month). */
function buildMonthKeys(year: number, month: number, count: number): string[] {
  const keys: string[] = []
  for (let i = count - 1; i >= 0; i--) {
    let m = month - i
    let y = year
    while (m <= 0) { m += 12; y-- }
    while (m > 12)  { m -= 12; y++ }
    keys.push(`${y}-${String(m).padStart(2, '0')}`)
  }
  return keys
}

// ── Main service ──────────────────────────────────────────────────────────────

export const FinancialRatiosService = {

  async getReport(
    companyId: string,
    supabase: AnyClient,
    months = 12,
  ): Promise<FinancialRatiosReport> {
    const now     = new Date()
    const curYear = now.getFullYear()
    const curMon  = now.getMonth() + 1  // 1-indexed

    const count    = Math.min(Math.max(months, 1), 24)
    const monthKeys = buildMonthKeys(curYear, curMon, count)

    const firstKey = monthKeys[0]
    const lastKey  = monthKeys[monthKeys.length - 1]
    const fromDate = `${firstKey}-01`
    const toDate   = (() => {
      const [y, m] = lastKey.split('-').map(Number)
      const lastDay = new Date(y, m, 0).getDate()
      return `${lastKey}-${String(lastDay).padStart(2, '0')}`
    })()

    // ── Parallel queries ────────────────────────────────────────────────────

    // 1. Revenue — monthly sum of sales.total_try (confirmed sales, not deleted)
    const salesRevQ = supabase
      .from('sales')
      .select('sale_date, total_try, paid_amount, payment_status')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .gte('sale_date', fromDate)
      .lte('sale_date', toDate)
      .not('payment_status', 'eq', 'cancelled')

    // 2. Expenses — monthly sum (not deleted, not financing flows)
    const expQ = supabase
      .from('expenses')
      .select('expense_date, amount_try, expense_type')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .gte('expense_date', fromDate)
      .lte('expense_date', toDate)

    // 3. COGS via sale_item_allocations
    //    Step A: get sale IDs in window
    const saleIdsQ = supabase
      .from('sales')
      .select('id, sale_date')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .gte('sale_date', fromDate)
      .lte('sale_date', toDate)
      .not('payment_status', 'eq', 'cancelled')
      .limit(5000)

    // 4. Partner loan tranches — active (not fully repaid)
    const loanQ = supabase
      .from('partner_loan_tranches')
      .select('principal_try, total_repaid_try, status')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .in('status', ['active', 'partially_repaid', 'overdue'])

    const [salesRes, expRes, saleIdsRes, loanRes] = await Promise.all([
      salesRevQ,
      expQ,
      saleIdsQ,
      loanQ,
    ])

    // Build sale_id → YYYY-MM lookup
    const saleIdToMonth = new Map<string, string>()
    for (const row of (saleIdsRes.data ?? [])) {
      const ym = String(row.sale_date ?? '').slice(0, 7)
      if (ym) saleIdToMonth.set(row.id as string, ym)
    }

    // Fetch allocations for those sale IDs (COGS)
    const allSaleIds = Array.from(saleIdToMonth.keys())
    let cogsRows: Array<{ sale_item_id: string; qty_allocated: number; cost_price_try: number | null; stock_lots?: { cost_price_try?: number } | null }> = []
    if (allSaleIds.length > 0) {
      // Need to join sale_items to get sale_id on each allocation
      const saleItemsRes = await supabase
        .from('sale_items')
        .select('id, sale_id')
        .eq('company_id', companyId)
        .in('sale_id', allSaleIds)
        .limit(10000)

      const saleItems: Array<{ id: string; sale_id: string }> = saleItemsRes.data ?? []
      const saleItemIdToSaleId = new Map<string, string>()
      for (const si of saleItems) saleItemIdToSaleId.set(si.id, si.sale_id)

      const saleItemIds = saleItems.map(si => si.id)
      if (saleItemIds.length > 0) {
        const allocRes = await supabase
          .from('sale_item_allocations')
          .select('sale_item_id, qty_allocated, cost_price_try, stock_lots(cost_price_try)')
          .eq('company_id', companyId)
          .in('sale_item_id', saleItemIds)
          .limit(20000)

        const rawAllocs = allocRes.data ?? []

        // No-silent-truncation: warn if any COGS step hit its row cap (understates COGS → overstates margins).
        const truncWarn = cogsTruncationWarning('financial-ratios', [
          { name: 'sales',       count: allSaleIds.length,  cap: 5000 },
          { name: 'sale_items',  count: saleItemIds.length, cap: 10000 },
          { name: 'allocations', count: rawAllocs.length,    cap: 20000 },
        ])
        if (truncWarn) console.warn(truncWarn)

        cogsRows = rawAllocs.map((r: {
          sale_item_id: string
          qty_allocated: number
          cost_price_try: number | null
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          stock_lots?: any
        }) => ({
          sale_item_id: r.sale_item_id,
          qty_allocated: Number(r.qty_allocated ?? 0),
          cost_price_try: r.cost_price_try !== undefined && r.cost_price_try !== null ? Number(r.cost_price_try) : null,
          stock_lots: r.stock_lots as { cost_price_try?: number } | null ?? null,
        }))

        // Enrich each cogs row with its month via sale_item_id → sale_id → month
        for (const cr of cogsRows) {
          const saleId = saleItemIdToSaleId.get(cr.sale_item_id)
          if (saleId) {
            const ym = saleIdToMonth.get(saleId)
            if (ym) (cr as { _month?: string })._month = ym
          }
        }
      }
    }

    // ── Aggregate by month ─────────────────────────────────────────────────

    const revenueByMonth    = new Map<string, number>()
    const billedByMonth     = new Map<string, number>()    // for receivables_coverage
    const collectedByMonth  = new Map<string, number>()    // paid_amount in month
    const cogsByMonth       = new Map<string, number>()
    const expenseByMonth    = new Map<string, number>()

    for (const ym of monthKeys) {
      revenueByMonth.set(ym, 0)
      billedByMonth.set(ym, 0)
      collectedByMonth.set(ym, 0)
      cogsByMonth.set(ym, 0)
      expenseByMonth.set(ym, 0)
    }

    // Sales
    for (const row of (salesRes.data ?? [])) {
      const ym = String(row.sale_date ?? '').slice(0, 7)
      if (!revenueByMonth.has(ym)) continue
      const total = Number(row.total_try ?? 0)
      const paid  = Number(row.paid_amount ?? 0)
      revenueByMonth.set(ym, (revenueByMonth.get(ym) ?? 0) + total)
      billedByMonth.set(ym, (billedByMonth.get(ym) ?? 0) + total)
      collectedByMonth.set(ym, (collectedByMonth.get(ym) ?? 0) + paid)
    }

    // COGS from allocations
    for (const cr of cogsRows) {
      const ym = (cr as { _month?: string })._month
      if (!ym || !cogsByMonth.has(ym)) continue
      const lineTotal = cr.qty_allocated * allocationUnitCost(cr)
      cogsByMonth.set(ym, (cogsByMonth.get(ym) ?? 0) + lineTotal)
    }

    // Expenses — exclude financing flows (partner loans, dividends, etc.)
    const FINANCING_TYPES = new Set(['partner_financing', 'loan_repayment', 'dividend', 'internal_transfer'])
    for (const row of (expRes.data ?? [])) {
      const ym = String(row.expense_date ?? '').slice(0, 7)
      if (!expenseByMonth.has(ym)) continue
      const t = String(row.expense_type ?? '')
      if (FINANCING_TYPES.has(t)) continue
      expenseByMonth.set(ym, (expenseByMonth.get(ym) ?? 0) + Number(row.amount_try ?? 0))
    }

    // Outstanding partner loans
    const totalPartnerLoans = (loanRes.data ?? []).reduce((s, r) => {
      const principal = Number(r.principal_try ?? 0)
      const repaid    = Number(r.total_repaid_try ?? 0)
      return s + Math.max(0, principal - repaid)
    }, 0)

    // ── Compute receivables (point-in-time for latest month approximation) ──
    // Receivables = sum of (total_try - paid_amount) for outstanding sales
    const receivablesQ = await supabase
      .from('sales')
      .select('total_try, paid_amount, sale_date')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .in('payment_status', ['pending', 'partial', 'overdue'])

    // Build monthly receivables approximation:
    // For each month, receivables = cumulative unpaid as of that month
    // Simplified: use outstanding as of current date for all months
    // (more accurate per-month would require historical snapshots)
    const outstandingReceivables = (receivablesQ.data ?? []).reduce((s, r) => {
      return s + Math.max(0, Number(r.total_try ?? 0) - Number(r.paid_amount ?? 0))
    }, 0)

    // ── Compute payables (outstanding expenses) ────────────────────────────
    // Expenses may not have amount_paid; use amount_try as payables proxy if status is unpaid
    const payablesQ = await supabase
      .from('expenses')
      .select('amount_try, payment_status')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .in('payment_status', ['pending', 'partial', 'overdue'])

    const outstandingPayables = (payablesQ.data ?? []).reduce((s, r) => {
      return s + Number(r.amount_try ?? 0)
    }, 0)

    // ── Build ratio value maps ─────────────────────────────────────────────

    const grossMarginByMonth         = new Map<string, number | null>()
    const netMarginByMonth           = new Map<string, number | null>()
    const dsoByMonth                 = new Map<string, number | null>()
    const dpoByMonth                 = new Map<string, number | null>()
    const expenseRatioByMonth        = new Map<string, number | null>()
    const recvCoverageByMonth        = new Map<string, number | null>()
    const currentRatioByMonth        = new Map<string, number | null>()
    const debtToRevByMonth           = new Map<string, number | null>()

    // Trailing 3-month revenue for debt_to_revenue (use last 3 months of the window)
    const lastThreeMonths = monthKeys.slice(-3)
    const trailing3Rev = lastThreeMonths.reduce((s, ym) => s + (revenueByMonth.get(ym) ?? 0), 0)

    for (const ym of monthKeys) {
      const rev  = revenueByMonth.get(ym) ?? 0
      const cogs = cogsByMonth.get(ym) ?? 0
      const exp  = expenseByMonth.get(ym) ?? 0
      const bil  = billedByMonth.get(ym) ?? 0
      const col  = collectedByMonth.get(ym) ?? 0

      // Gross margin
      if (rev > 0) {
        grossMarginByMonth.set(ym, round2(((rev - cogs) / rev) * 100))
      } else {
        grossMarginByMonth.set(ym, null)
      }

      // Net margin
      const netIncome = rev - cogs - exp
      if (rev > 0) {
        netMarginByMonth.set(ym, round2((netIncome / rev) * 100))
      } else {
        netMarginByMonth.set(ym, null)
      }

      // DSO: (outstanding_receivables / monthly_revenue) * 30
      // Use current outstanding receivables with current month's revenue as proxy
      if (rev > 0) {
        dsoByMonth.set(ym, round2((outstandingReceivables / rev) * 30))
      } else {
        dsoByMonth.set(ym, null)
      }

      // DPO: (outstanding_payables / cogs) * 30
      if (cogs > 0) {
        dpoByMonth.set(ym, round2((outstandingPayables / cogs) * 30))
      } else {
        dpoByMonth.set(ym, null)
      }

      // Expense ratio
      if (rev > 0) {
        expenseRatioByMonth.set(ym, round2((exp / rev) * 100))
      } else {
        expenseRatioByMonth.set(ym, null)
      }

      // Receivables coverage: collected / billed * 100
      if (bil > 0) {
        recvCoverageByMonth.set(ym, round2((col / bil) * 100))
      } else {
        recvCoverageByMonth.set(ym, null)
      }

      // Current ratio: (current assets) / (current liabilities)
      // Approximation: current assets = receivables + collected cash proxy
      // current liabilities = payables
      // Simplified monthly: use revenue as proxy for current assets inflow
      // Full balance sheet not available per-month — use revenue / expenses as liquidity proxy
      if (exp > 0) {
        currentRatioByMonth.set(ym, round2((rev + outstandingReceivables / count) / (exp + outstandingPayables / count)))
      } else if (rev > 0) {
        currentRatioByMonth.set(ym, null) // No liabilities — indeterminate
      } else {
        currentRatioByMonth.set(ym, null)
      }

      // Debt to revenue: outstanding loans / trailing 3-month revenue * 100
      const trail3 = trailing3Rev > 0 ? trailing3Rev : rev * 3
      if (trail3 > 0) {
        debtToRevByMonth.set(ym, round2((totalPartnerLoans / trail3) * 100))
      } else {
        debtToRevByMonth.set(ym, totalPartnerLoans > 0 ? null : 0)
      }
    }

    // ── Build ratio trends ─────────────────────────────────────────────────

    const ratios: RatioTrend[] = [
      buildRatioTrend(
        'current_ratio',
        'Cari Oran',
        'Dönen varlıkların kısa vadeli yükümlülüklere oranı',
        'x',
        true,
        monthKeys,
        currentRatioByMonth,
        { value: 2.0, label: 'Sağlıklı eşik' },
      ),
      buildRatioTrend(
        'gross_margin_pct',
        'Brüt Marj',
        'Satışların SMM düşüldükten sonra kalan kısmının yüzdesi',
        '%',
        true,
        monthKeys,
        grossMarginByMonth,
        { value: 40, label: 'Sağlıklı eşik' },
      ),
      buildRatioTrend(
        'net_margin_pct',
        'Net Marj',
        'Net kârın gelire oranı',
        '%',
        true,
        monthKeys,
        netMarginByMonth,
        { value: 10, label: 'Sağlıklı eşik' },
      ),
      buildRatioTrend(
        'dso_days',
        'Alacak Tahsil Süresi',
        'Alacakların tahsili için ortalama gün sayısı (DSO)',
        'gün',
        false,
        monthKeys,
        dsoByMonth,
        { value: 30, label: 'Sağlıklı eşik' },
      ),
      buildRatioTrend(
        'dpo_days',
        'Borç Ödeme Süresi',
        'Borçların ödenmesi için ortalama gün sayısı (DPO)',
        'gün',
        false,
        monthKeys,
        dpoByMonth,
      ),
      buildRatioTrend(
        'expense_ratio_pct',
        'Gider Oranı',
        'Toplam giderlerin gelire oranı',
        '%',
        false,
        monthKeys,
        expenseRatioByMonth,
        { value: 60, label: 'Sağlıklı eşik' },
      ),
      buildRatioTrend(
        'receivables_coverage_pct',
        'Tahsilat Verimliliği',
        'Faturalanan tutarın ne kadarının tahsil edildiği',
        '%',
        true,
        monthKeys,
        recvCoverageByMonth,
        { value: 90, label: 'Sağlıklı eşik' },
      ),
      buildRatioTrend(
        'debt_to_revenue_pct',
        'Borç/Gelir Oranı',
        'Ortak borçlarının son 3 aylık gelire oranı',
        '%',
        false,
        monthKeys,
        debtToRevByMonth,
      ),
    ]

    return {
      company_id:  companyId,
      as_of_month: monthKeys[monthKeys.length - 1],
      ratios,
      computed_at: new Date().toISOString(),
    }
  },
}
