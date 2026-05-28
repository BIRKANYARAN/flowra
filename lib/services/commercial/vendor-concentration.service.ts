// ── VendorConcentrationService — HHI-based supply-side concentration analysis ──
// Measures which suppliers account for most of the company's purchasing/expense
// spend. Mirrors the customer-side CustomerConcentrationService.
//
// Pure helpers are exported for unit testing.

import type { SupabaseClient } from '@supabase/supabase-js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>

// ── Types ──────────────────────────────────────────────────────────────────────

export type VendorConcentrationLevel =
  | 'diversified'
  | 'moderate'
  | 'concentrated'
  | 'highly_concentrated'

export type VendorTier = 'tier1' | 'tier2' | 'tier3' | 'tier4'

export interface VendorProfile {
  vendor_name: string
  total_spend_try: number
  spend_share_pct: number
  tier: VendorTier
  transaction_count: number
  is_single_source_risk: boolean    // spend_share_pct > 60%
  categories: string[]              // expense_type or product categories this vendor supplies
  last_transaction_date: string | null
}

export interface VendorConcentrationReport {
  analysis_period_months: number
  total_spend_try: number
  total_vendors: number
  hhi: number
  concentration_level: VendorConcentrationLevel
  pareto_80_count: number
  vendors: VendorProfile[]          // sorted by spend_share_pct desc
  single_source_vendors: VendorProfile[]
  top_3_spend_pct: number           // what % top-3 vendors represent
  monthly_hhi_trend: Array<{
    month: string
    hhi: number
    vendor_count: number
  }>
}

// ── Pure computation helpers ──────────────────────────────────────────────────

/**
 * Compute HHI for vendor spend: Σ(share_pct²)
 * where share_pct = vendor_spend / total_spend × 100.
 * Returns 0 for empty array.
 */
export function computeVendorHHI(
  vendors: Array<{ spend_try: number }>,
): number {
  if (vendors.length === 0) return 0
  const total = vendors.reduce((s, v) => s + v.spend_try, 0)
  if (total === 0) return 0
  return vendors.reduce((sum, v) => {
    const share = (v.spend_try / total) * 100
    return sum + share * share
  }, 0)
}

/**
 * Classify vendor concentration level based on HHI.
 * <1500: 'diversified'
 * 1500–2500: 'moderate'
 * 2500–4000: 'concentrated'
 * >4000: 'highly_concentrated'
 */
export function classifyVendorConcentration(
  hhi: number,
): VendorConcentrationLevel {
  if (hhi < 1500) return 'diversified'
  if (hhi < 2500) return 'moderate'
  if (hhi < 4000) return 'concentrated'
  return 'highly_concentrated'
}

/**
 * Detect single-source dependency.
 * Returns true if a vendor's spend percentage exceeds the threshold (default 60%).
 */
export function isSingleSourceDependent(
  vendorSpendPct: number,
  threshold = 60,
): boolean {
  return vendorSpendPct > threshold
}

/**
 * Classify a vendor into a spend tier based on their share %.
 * >20%: 'tier1'
 * 5–20%: 'tier2'
 * 1–5%: 'tier3'
 * <1%: 'tier4'
 */
export function classifyVendorTier(spendPct: number): VendorTier {
  if (spendPct > 20) return 'tier1'
  if (spendPct >= 5) return 'tier2'
  if (spendPct >= 1) return 'tier3'
  return 'tier4'
}

/**
 * Compute Pareto-80: the minimum number of vendors whose cumulative spend
 * reaches 80% of total. Returns 0 for empty arrays.
 */
export function computeVendorPareto80(
  vendors: Array<{ spend_try: number }>,
): number {
  if (vendors.length === 0) return 0
  const total = vendors.reduce((s, v) => s + v.spend_try, 0)
  if (total === 0) return 0
  // Sort descending
  const sorted = [...vendors].sort((a, b) => b.spend_try - a.spend_try)
  let running = 0
  let count = 0
  for (const v of sorted) {
    running += (v.spend_try / total) * 100
    count++
    if (running >= 80) break
  }
  return count
}

// ── Internal DB row shapes ─────────────────────────────────────────────────────

interface ExpenseRow {
  supplier_name: string | null
  amount_try: number | null
  expense_type: string | null
  expense_date: string | null
  created_at: string
}

interface PurchaseRow {
  id: string
  supplier_name: string | null
  purchase_date: string | null
  total_try: number
}

interface PurchaseItemRow {
  purchase_id: string
  quantity: number | null
  unit_price: number | null
  product_id: string | null
  // Supabase join may return a single object or an array depending on the relationship cardinality
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  products: any
}

// ── Month label helper ─────────────────────────────────────────────────────────

function toMonthLabel(yyyyMm: string): string {
  const [year, month] = yyyyMm.split('-')
  const months = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz',
                  'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara']
  const m = parseInt(month, 10) - 1
  return `${months[m]} ${year}`
}

// ── Service ────────────────────────────────────────────────────────────────────

export class VendorConcentrationService {
  constructor(private supabase: AnyClient) {}

  async getReport(
    companyId: string,
    periodMonths = 6,
  ): Promise<VendorConcentrationReport> {
    const now = new Date()
    const fromDate = new Date(now)
    fromDate.setMonth(fromDate.getMonth() - periodMonths)
    const fromDateStr = fromDate.toISOString().slice(0, 10)
    const toDateStr   = now.toISOString().slice(0, 10)

    // ── Fetch expenses with supplier_name ──────────────────────────────────────

    const [expensesRes, purchasesRes] = await Promise.all([
      this.supabase
        .from('expenses')
        .select('supplier_name, amount_try, expense_type, expense_date, created_at')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .not('supplier_name', 'is', null)
        .neq('supplier_name', '')
        .gte('expense_date', fromDateStr)
        .lte('expense_date', toDateStr)
        .limit(2000),
      this.supabase
        .from('purchases')
        .select('id, supplier_name, purchase_date')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .gte('purchase_date', fromDateStr)
        .lte('purchase_date', toDateStr)
        .limit(2000),
    ])

    if (expensesRes.error) throw new Error(`VendorConcentrationService (expenses): ${expensesRes.error.message}`)
    if (purchasesRes.error) throw new Error(`VendorConcentrationService (purchases): ${purchasesRes.error.message}`)

    const expenseRows = (expensesRes.data ?? []) as ExpenseRow[]
    const rawPurchases = purchasesRes.data ?? []

    // ── Enrich purchases with computed total_try from purchase_items ───────────

    const purchaseIds: string[] = rawPurchases.map((p: { id: string }) => p.id)

    let purchaseItemRows: PurchaseItemRow[] = []
    if (purchaseIds.length > 0) {
      const { data: itemData } = await this.supabase
        .from('purchase_items')
        .select('purchase_id, quantity, unit_price, product_id, products(category)')
        .in('purchase_id', purchaseIds)
        .limit(5000)
      purchaseItemRows = (itemData ?? []) as PurchaseItemRow[]
    }

    // Compute total_try per purchase from items
    const purchaseTotalMap = new Map<string, number>()
    const purchaseCategoryMap = new Map<string, string[]>()
    for (const item of purchaseItemRows) {
      const qty   = Number(item.quantity ?? 0)
      const price = Number(item.unit_price ?? 0)
      const amount = qty * price
      purchaseTotalMap.set(
        item.purchase_id,
        (purchaseTotalMap.get(item.purchase_id) ?? 0) + amount,
      )
      // Category from product (may be object or array depending on Supabase join type)
      const productObj = Array.isArray(item.products) ? item.products[0] : item.products
      const cat = productObj?.category ?? null
      if (cat) {
        const cats = purchaseCategoryMap.get(item.purchase_id) ?? []
        if (!cats.includes(cat)) cats.push(cat)
        purchaseCategoryMap.set(item.purchase_id, cats)
      }
    }

    const purchaseRows: PurchaseRow[] = rawPurchases.map((p: { id: string; supplier_name: string | null; purchase_date: string | null }) => ({
      id:            p.id,
      supplier_name: p.supplier_name,
      purchase_date: p.purchase_date,
      total_try:     purchaseTotalMap.get(p.id) ?? 0,
    }))

    // ── Aggregate vendor spend ─────────────────────────────────────────────────

    interface VendorAgg {
      total_spend_try:   number
      transaction_count: number
      categories:        Set<string>
      last_date:         string | null
    }

    const vendorMap = new Map<string, VendorAgg>()

    const upsertVendor = (
      name: string,
      amount: number,
      category: string | null,
      date: string | null,
    ) => {
      const key = name.trim()
      if (!key) return
      const existing = vendorMap.get(key)
      if (existing) {
        existing.total_spend_try += amount
        existing.transaction_count += 1
        if (category) existing.categories.add(category)
        if (date && (!existing.last_date || date > existing.last_date)) {
          existing.last_date = date
        }
      } else {
        vendorMap.set(key, {
          total_spend_try:   amount,
          transaction_count: 1,
          categories:        category ? new Set([category]) : new Set(),
          last_date:         date,
        })
      }
    }

    // From expenses
    for (const row of expenseRows) {
      const name = (row.supplier_name ?? '').trim()
      if (!name) continue
      upsertVendor(
        name,
        Number(row.amount_try ?? 0),
        row.expense_type ?? null,
        row.expense_date ?? row.created_at.slice(0, 10),
      )
    }

    // From purchases (only those with a supplier_name and non-zero spend)
    for (const row of purchaseRows) {
      const name = (row.supplier_name ?? '').trim()
      if (!name || row.total_try === 0) continue
      // Collect categories from items for this purchase
      const cats = purchaseCategoryMap.get(row.id) ?? []
      const catStr = cats[0] ?? null
      upsertVendor(name, row.total_try, catStr, row.purchase_date)
      // Add extra categories
      for (const cat of cats.slice(1)) {
        const agg = vendorMap.get(name.trim())
        if (agg && cat) agg.categories.add(cat)
      }
    }

    // ── Empty state ────────────────────────────────────────────────────────────

    if (vendorMap.size === 0) {
      return {
        analysis_period_months: periodMonths,
        total_spend_try: 0,
        total_vendors: 0,
        hhi: 0,
        concentration_level: 'diversified',
        pareto_80_count: 0,
        vendors: [],
        single_source_vendors: [],
        top_3_spend_pct: 0,
        monthly_hhi_trend: [],
      }
    }

    // ── Build sorted vendor list ───────────────────────────────────────────────

    const totalSpend = Array.from(vendorMap.values()).reduce((s, v) => s + v.total_spend_try, 0)

    const vendorList = Array.from(vendorMap.entries())
      .map(([name, agg]) => {
        const sharePct = totalSpend > 0 ? (agg.total_spend_try / totalSpend) * 100 : 0
        const profile: VendorProfile = {
          vendor_name:          name,
          total_spend_try:      Math.round(agg.total_spend_try * 100) / 100,
          spend_share_pct:      Math.round(sharePct * 100) / 100,
          tier:                 classifyVendorTier(sharePct),
          transaction_count:    agg.transaction_count,
          is_single_source_risk: isSingleSourceDependent(sharePct),
          categories:           Array.from(agg.categories),
          last_transaction_date: agg.last_date,
        }
        return profile
      })
      .sort((a, b) => b.spend_share_pct - a.spend_share_pct)

    // ── HHI ───────────────────────────────────────────────────────────────────

    const hhi = computeVendorHHI(vendorList.map(v => ({ spend_try: v.total_spend_try })))
    const concentration_level = classifyVendorConcentration(hhi)

    // ── Pareto-80 ─────────────────────────────────────────────────────────────

    const pareto_80_count = computeVendorPareto80(
      vendorList.map(v => ({ spend_try: v.total_spend_try })),
    )

    // ── Top-3 share ───────────────────────────────────────────────────────────

    const top_3_spend_pct = vendorList.slice(0, 3).reduce((s, v) => s + v.spend_share_pct, 0)

    // ── Single-source vendors ─────────────────────────────────────────────────

    const single_source_vendors = vendorList.filter(v => v.is_single_source_risk)

    // ── Monthly HHI trend ─────────────────────────────────────────────────────

    // Build per-month vendor spend maps from expenses + purchases
    const monthlyVendorMap = new Map<string, Map<string, number>>()

    for (const row of expenseRows) {
      const name = (row.supplier_name ?? '').trim()
      if (!name) continue
      const date = row.expense_date ?? row.created_at.slice(0, 10)
      const month = date.slice(0, 7)
      if (!monthlyVendorMap.has(month)) monthlyVendorMap.set(month, new Map())
      const mMap = monthlyVendorMap.get(month)!
      mMap.set(name, (mMap.get(name) ?? 0) + Number(row.amount_try ?? 0))
    }

    for (const row of purchaseRows) {
      const name = (row.supplier_name ?? '').trim()
      if (!name || row.total_try === 0) continue
      const month = (row.purchase_date ?? '').slice(0, 7)
      if (!month) continue
      if (!monthlyVendorMap.has(month)) monthlyVendorMap.set(month, new Map())
      const mMap = monthlyVendorMap.get(month)!
      mMap.set(name, (mMap.get(name) ?? 0) + row.total_try)
    }

    const monthly_hhi_trend: VendorConcentrationReport['monthly_hhi_trend'] = []
    for (let i = periodMonths - 1; i >= 0; i--) {
      const d = new Date(now)
      d.setDate(1)
      d.setMonth(d.getMonth() - i)
      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      const mMap = monthlyVendorMap.get(ym)
      if (mMap) {
        const monthTotal = Array.from(mMap.values()).reduce((s, v) => s + v, 0)
        const monthHHI = monthTotal > 0
          ? computeVendorHHI(Array.from(mMap.values()).map(v => ({ spend_try: v })))
          : 0
        monthly_hhi_trend.push({
          month:        ym,
          hhi:          Math.round(monthHHI),
          vendor_count: mMap.size,
        })
      }
    }

    return {
      analysis_period_months: periodMonths,
      total_spend_try:        Math.round(totalSpend * 100) / 100,
      total_vendors:          vendorList.length,
      hhi:                    Math.round(hhi),
      concentration_level,
      pareto_80_count,
      vendors:                vendorList,
      single_source_vendors,
      top_3_spend_pct:        Math.round(top_3_spend_pct * 100) / 100,
      monthly_hhi_trend,
    }
  }
}
