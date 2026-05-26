// ─────────────────────────────────────────────────────────────────────────────
// lib/services/finance/multi-period-pnl.service.ts
//
// Multi-Period P&L Comparison — side-by-side P&L for up to 6 periods.
//
// Rules:
//   • Revenue  = sum(sales.total_try), not proformas, not deleted
//   • COGS     = sum(purchase_items.total_try) joined to finalized purchases
//   • OpEx     = sum(expenses.amount_try) grouped by expense_type
//   • Gross Profit = Revenue - COGS
//   • EBIT     = Gross Profit - Total OpEx
//   • Net Income = EBIT (simplified — no tax line)
//   • change_pct = null when prior = 0 or prior is undefined
//   • Expense categories only included when present in at least one period
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>

// ── Output interfaces ─────────────────────────────────────────────────────────

export interface PnlLineItem {
  key: string
  label: string                                       // Turkish
  values: Record<string, number>                      // period_key → amount
  change_pcts: Record<string, number | null>          // period_key → % change from prior period (first = null)
  is_subtotal: boolean
  is_inverted: boolean                                // expenses shown as positive but stored negative
  indent_level: number                                // 0=top, 1=indented, 2=deeply indented
}

export interface MultiPeriodPnlReport {
  periods: Array<{
    period_key: string    // 'YYYY-MM' or 'YYYY'
    period_label: string  // 'Mayıs 2026' or '2026'
    type: 'month' | 'year'
  }>
  line_items: PnlLineItem[]
}

// ── Pure helper functions (exported) ─────────────────────────────────────────

/**
 * Compute period key from year + optional month.
 * Returns 'YYYY-MM' or 'YYYY'.
 */
export function computePeriodKey(year: number, month?: number): string {
  if (month !== undefined) {
    return `${year}-${String(month).padStart(2, '0')}`
  }
  return String(year)
}

/**
 * Compute Turkish period label.
 * Returns 'Mayıs 2026' (for month) or '2026' (for year).
 */
export function computePeriodLabel(year: number, month?: number): string {
  if (month !== undefined) {
    return new Date(year, month - 1, 1).toLocaleDateString('tr-TR', {
      month: 'long',
      year: 'numeric',
    })
  }
  return String(year)
}

/**
 * Compute percentage change from prior to current.
 * Returns null if prior = 0 or prior is undefined.
 */
export function computeChangePct(
  current: number,
  prior: number | undefined,
): number | null {
  if (prior === undefined || prior === 0) return null
  return ((current - prior) / Math.abs(prior)) * 100
}

// ── Structure definitions ─────────────────────────────────────────────────────

interface LineItemTemplate {
  key: string
  label: string
  is_subtotal: boolean
  is_inverted: boolean
  indent_level: number
}

/**
 * Build the base P&L structure skeleton (without values).
 * OpEx category rows are injected between the section header and subtotal.
 */
export function buildPnlStructure(
  categories: string[],
): LineItemTemplate[] {
  const categoryLabels: Record<string, string> = {
    general:      'Genel Giderler',
    rent:         'Kira',
    salary:       'Maaş / Bordro',
    utilities:    'Faturalar',
    marketing:    'Pazarlama',
    logistics:    'Lojistik / Kargo',
    software:     'Yazılım / Abonelik',
    equipment:    'Ekipman / Donanım',
    tax:          'Vergi / Resmi Ücret',
    interest:     'Faiz Gideri',
    board_fee:    'Yönetim Kurulu Ücreti',
    principal:    'Anapara Geri Ödemesi',
    dividend:     'Kâr Payı',
    partner_loan: 'Ortak Finansmanı',
    other:        'Diğer',
  }

  const items: LineItemTemplate[] = [
    // Revenue section
    { key: 'revenue',      label: 'Ciro',               is_subtotal: false, is_inverted: false, indent_level: 0 },
    { key: 'total_rev',    label: 'Toplam Gelir',        is_subtotal: true,  is_inverted: false, indent_level: 0 },
    // COGS section
    { key: 'cogs',         label: 'Satılan Mal Maliyeti (SMM)', is_subtotal: false, is_inverted: true, indent_level: 1 },
    { key: 'gross_profit', label: 'Brüt Kâr',           is_subtotal: true,  is_inverted: false, indent_level: 0 },
    // OpEx section
    { key: 'opex_header',  label: 'Operasyonel Giderler', is_subtotal: false, is_inverted: true, indent_level: 0 },
    // category rows injected here
    ...categories.map(cat => ({
      key:          `opex_${cat}`,
      label:        categoryLabels[cat] ?? cat,
      is_subtotal:  false,
      is_inverted:  true,
      indent_level: 1,
    })),
    { key: 'total_opex',   label: 'Toplam Operasyonel Gider', is_subtotal: true, is_inverted: true, indent_level: 0 },
    // EBIT
    { key: 'ebit',         label: 'Faaliyet Kârı (EBIT)', is_subtotal: true, is_inverted: false, indent_level: 0 },
    // Net Income
    { key: 'net_income',   label: 'Net Kâr',             is_subtotal: true, is_inverted: false, indent_level: 0 },
  ]

  return items
}

// ── Internal helpers ──────────────────────────────────────────────────────────

interface PeriodInput {
  year: number
  month?: number
}

/** Date range for a calendar month */
function monthRange(year: number, month: number): { from: string; to: string } {
  const from    = `${year}-${String(month).padStart(2, '0')}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const to      = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  return { from, to }
}

/** Date range for a full calendar year */
function yearRange(year: number): { from: string; to: string } {
  return { from: `${year}-01-01`, to: `${year}-12-31` }
}

interface PeriodData {
  revenue: number
  cogs: number
  opex: Record<string, number>   // category → amount
}

/** Fetch all P&L components for a single period */
async function fetchPeriodData(
  companyId: string,
  supabase: AnyClient,
  from: string,
  to: string,
): Promise<PeriodData> {
  const [salesRes, purchaseItemsRes, expensesRes] = await Promise.allSettled([
    supabase
      .from('sales')
      .select('total_try')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .not('status', 'in', '("proforma","draft")')
      .gte('sale_date', from)
      .lte('sale_date', to),

    supabase
      .from('purchase_items')
      .select('total_try, purchase:purchases!inner(company_id, status, purchase_date)')
      .eq('purchase.company_id', companyId)
      .eq('purchase.status', 'finalized')
      .gte('purchase.purchase_date', from)
      .lte('purchase.purchase_date', to),

    supabase
      .from('expenses')
      .select('amount_try, expense_type')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .gte('expense_date', from)
      .lte('expense_date', to),
  ])

  let revenue = 0
  if (salesRes.status === 'fulfilled' && salesRes.value?.data) {
    for (const row of salesRes.value.data) {
      revenue += Number(row.total_try) || 0
    }
  }

  let cogs = 0
  if (purchaseItemsRes.status === 'fulfilled' && purchaseItemsRes.value?.data) {
    for (const row of purchaseItemsRes.value.data) {
      cogs += Number(row.total_try) || 0
    }
  }

  const opex: Record<string, number> = {}
  if (expensesRes.status === 'fulfilled' && expensesRes.value?.data) {
    for (const row of expensesRes.value.data) {
      const cat  = (row.expense_type as string | null) ?? 'other'
      opex[cat]  = (opex[cat] ?? 0) + (Number(row.amount_try) || 0)
    }
  }

  return { revenue, cogs, opex }
}

// ── Service ───────────────────────────────────────────────────────────────────

export class MultiPeriodPnlService {

  /**
   * Fetch and assemble a multi-period P&L comparison report.
   *
   * @param companyId   UUID of the company
   * @param supabase    Authenticated Supabase client
   * @param periods     Array of { year, month? } — max 6
   */
  static async getReport(
    companyId: string,
    supabase: AnyClient,
    periods: PeriodInput[],
  ): Promise<MultiPeriodPnlReport> {
    // Build period metadata
    const periodMeta = periods.map(p => ({
      period_key:   computePeriodKey(p.year, p.month),
      period_label: computePeriodLabel(p.year, p.month),
      type:         (p.month !== undefined ? 'month' : 'year') as 'month' | 'year',
      input:        p,
    }))

    // Fetch data for all periods in parallel
    const dataResults = await Promise.all(
      periodMeta.map(pm => {
        const { input } = pm
        const range = input.month !== undefined
          ? monthRange(input.year, input.month)
          : yearRange(input.year)
        return fetchPeriodData(companyId, supabase, range.from, range.to)
      }),
    )

    // Collect all OpEx categories that appear in at least one period
    const allCategories = new Set<string>()
    for (const d of dataResults) {
      for (const cat of Object.keys(d.opex)) {
        allCategories.add(cat)
      }
    }
    const sortedCategories = Array.from(allCategories).sort()

    // Build structure skeleton
    const structure = buildPnlStructure(sortedCategories)

    // Compute derived values per period
    interface DerivedValues {
      revenue: number
      total_rev: number
      cogs: number
      gross_profit: number
      opex_header: number
      total_opex: number
      ebit: number
      net_income: number
      [key: string]: number   // opex_<cat>
    }

    const periodValues: Record<string, DerivedValues> = {}

    for (let i = 0; i < periodMeta.length; i++) {
      const key  = periodMeta[i].period_key
      const data = dataResults[i]

      const totalOpex = Object.values(data.opex).reduce((s, v) => s + v, 0)
      const grossProfit = data.revenue - data.cogs
      const ebit        = grossProfit - totalOpex
      const netIncome   = ebit

      const derived: DerivedValues = {
        revenue:      data.revenue,
        total_rev:    data.revenue,
        cogs:         data.cogs,
        gross_profit: grossProfit,
        opex_header:  totalOpex,
        total_opex:   totalOpex,
        ebit:         ebit,
        net_income:   netIncome,
      }

      for (const cat of sortedCategories) {
        derived[`opex_${cat}`] = data.opex[cat] ?? 0
      }

      periodValues[key] = derived
    }

    // Build line items with values and change_pcts
    const line_items: PnlLineItem[] = structure.map(tmpl => {
      const values: Record<string, number>         = {}
      const change_pcts: Record<string, number | null> = {}

      for (let i = 0; i < periodMeta.length; i++) {
        const pk  = periodMeta[i].period_key
        const val = periodValues[pk][tmpl.key] ?? 0
        values[pk] = val

        if (i === 0) {
          change_pcts[pk] = null
        } else {
          const priorKey = periodMeta[i - 1].period_key
          const prior    = periodValues[priorKey][tmpl.key] ?? 0
          change_pcts[pk] = computeChangePct(val, prior)
        }
      }

      return {
        key:          tmpl.key,
        label:        tmpl.label,
        values,
        change_pcts,
        is_subtotal:  tmpl.is_subtotal,
        is_inverted:  tmpl.is_inverted,
        indent_level: tmpl.indent_level,
      }
    })

    return {
      periods: periodMeta.map(pm => ({
        period_key:   pm.period_key,
        period_label: pm.period_label,
        type:         pm.type,
      })),
      line_items,
    }
  }
}
