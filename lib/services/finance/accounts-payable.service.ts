// ── AccountsPayableService — Accounts Payable Analytics ──────────────────────
// Comprehensive AP analytics for Turkish SMEs, including DPO, aging, supplier
// concentration, payment compliance, and cash-flow optimisation helpers.
// All pure helpers are exported for unit testing.

import type { SupabaseClient } from '@supabase/supabase-js'
import { purchaseTotalTry } from '@/lib/finance/purchase-total'

// ── Pure functions ────────────────────────────────────────────────────────────

/**
 * Compute Days Payable Outstanding.
 * DPO = accountsPayable / (annualCogs / 365)
 * Returns null when annualCogs <= 0.
 */
export function computeDpo(
  accountsPayable: number,
  annualCogs: number,
): number | null {
  if (annualCogs <= 0) return null
  return Math.round((accountsPayable / (annualCogs / 365)) * 10) / 10
}

/**
 * Classify DPO health for Turkish SMEs.
 *
 * Priority order (most specific first):
 *   insufficient_data: null
 *   very_fast:  < 10 days
 *   fast:       10-20 days  (paying too early, losing float)
 *   optimal:    30-45 days  (Turkish SME ideal)
 *   good:       20-60 days  (inclusive of optimal range)
 *   slow:       60-90 days  (straining supplier relationships)
 *   very_slow:  > 90 days   (severe cash flow issues)
 *
 * Evaluation order ensures most-specific ranges win.
 */
export function classifyDpoHealth(
  dpo: number | null,
): 'optimal' | 'good' | 'fast' | 'very_fast' | 'slow' | 'very_slow' | 'insufficient_data' {
  if (dpo === null) return 'insufficient_data'
  if (dpo < 10)              return 'very_fast'
  if (dpo < 20)              return 'fast'
  if (dpo >= 30 && dpo <= 45) return 'optimal'
  if (dpo >= 20 && dpo <= 60) return 'good'
  if (dpo <= 90)             return 'slow'
  return 'very_slow'
}

/**
 * Classify payable aging bucket by days outstanding.
 *   current:          <= 30 days
 *   overdue_30:       <= 60 days
 *   overdue_60:       <= 90 days
 *   overdue_90:       <= 120 days
 *   severely_overdue: > 120 days
 */
export function classifyPayableAgeBucket(
  daysOutstanding: number,
): 'current' | 'overdue_30' | 'overdue_60' | 'overdue_90' | 'severely_overdue' {
  if (daysOutstanding <= 30)  return 'current'
  if (daysOutstanding <= 60)  return 'overdue_30'
  if (daysOutstanding <= 90)  return 'overdue_60'
  if (daysOutstanding <= 120) return 'overdue_90'
  return 'severely_overdue'
}

/**
 * Compute total payables in each aging bucket.
 */
export function computePayableAging(
  payables: Array<{ amount: number; days_outstanding: number }>,
): {
  current: number
  overdue_30: number
  overdue_60: number
  overdue_90: number
  severely_overdue: number
  total: number
} {
  const result = {
    current:          0,
    overdue_30:       0,
    overdue_60:       0,
    overdue_90:       0,
    severely_overdue: 0,
    total:            0,
  }

  for (const p of payables) {
    const bucket = classifyPayableAgeBucket(p.days_outstanding)
    result[bucket] += p.amount
    result.total   += p.amount
  }

  return {
    current:          round2(result.current),
    overdue_30:       round2(result.overdue_30),
    overdue_60:       round2(result.overdue_60),
    overdue_90:       round2(result.overdue_90),
    severely_overdue: round2(result.severely_overdue),
    total:            round2(result.total),
  }
}

/**
 * Compute overdue payable ratio (% of total that is past due).
 * Returns null if aging.total === 0.
 * = (total - current) / total × 100
 */
export function computeOverduePayableRatio(
  aging: ReturnType<typeof computePayableAging>,
): number | null {
  if (aging.total === 0) return null
  return round2(((aging.total - aging.current) / aging.total) * 100)
}

/**
 * Classify overdue payable ratio health.
 *   insufficient_data: null
 *   healthy:   < 10%
 *   watch:     < 25%
 *   elevated:  < 50%
 *   critical:  >= 50%
 */
export function classifyOverduePayableRatio(
  ratio: number | null,
): 'healthy' | 'watch' | 'elevated' | 'critical' | 'insufficient_data' {
  if (ratio === null) return 'insufficient_data'
  if (ratio < 10)  return 'healthy'
  if (ratio < 25)  return 'watch'
  if (ratio < 50)  return 'elevated'
  return 'critical'
}

/**
 * Compute payable turnover ratio = annualCogs / avgAccountsPayable.
 * Returns null if avgAccountsPayable <= 0.
 */
export function computePayableTurnoverRatio(
  annualCogs: number,
  avgAccountsPayable: number,
): number | null {
  if (avgAccountsPayable <= 0) return null
  return round2(annualCogs / avgAccountsPayable)
}

/**
 * Compute cash-flow benefit from DPO optimisation.
 * = annualCogs / 365 × (targetDpo - currentDpo)
 * Positive = cash freed if extending DPO.
 * Negative = cash cost if reducing DPO.
 * Returns null if currentDpo is null.
 */
export function computeDpoOptimizationBenefit(
  annualCogs: number,
  currentDpo: number | null,
  targetDpo: number,
): number | null {
  if (currentDpo === null) return null
  return round2((annualCogs / 365) * (targetDpo - currentDpo))
}

/**
 * Compute Herfindahl–Hirschman Index for supplier payment concentration.
 * HHI = Σ (amount_i / total)²
 * Returns null if total amount === 0.
 */
export function computeSupplierPaymentConcentration(
  suppliers: Array<{ supplier_id: string; amount: number }>,
): number | null {
  const total = suppliers.reduce((s, x) => s + x.amount, 0)
  if (total === 0) return null

  const hhi = suppliers.reduce((s, x) => {
    const share = x.amount / total
    return s + share * share
  }, 0)

  return Math.round(hhi * 10000) / 10000
}

/**
 * Classify supplier payment concentration risk.
 *   insufficient_data:  null
 *   diversified:        HHI < 0.15
 *   moderate:           HHI < 0.30
 *   concentrated:       HHI < 0.60
 *   highly_concentrated: HHI >= 0.60
 */
export function classifySupplierConcentrationRisk(
  hhi: number | null,
): 'diversified' | 'moderate' | 'concentrated' | 'highly_concentrated' | 'insufficient_data' {
  if (hhi === null) return 'insufficient_data'
  if (hhi < 0.15) return 'diversified'
  if (hhi < 0.30) return 'moderate'
  if (hhi < 0.60) return 'concentrated'
  return 'highly_concentrated'
}

/**
 * Compute payment terms compliance rate (% of amount paid on time).
 * Returns null if payments.length === 0.
 */
export function computePaymentTermsCompliance(
  payments: Array<{ amount: number; paid_on_time: boolean }>,
): number | null {
  if (payments.length === 0) return null

  const total   = payments.reduce((s, p) => s + p.amount, 0)
  if (total === 0) return null

  const onTime  = payments.filter(p => p.paid_on_time).reduce((s, p) => s + p.amount, 0)
  return round2((onTime / total) * 100)
}

/**
 * Generate a Turkish narrative for accounts payable health.
 */
export function generatePayablesNarrative(params: {
  dpo: number | null
  dpoHealth: ReturnType<typeof classifyDpoHealth>
  overdueRatio: number | null
  totalPayables: number
}): string {
  const { dpo, dpoHealth, overdueRatio, totalPayables } = params

  const dpoPart = dpo !== null
    ? `Ortalama ödeme vadesi ${Math.round(dpo)} gün (${dpoHealthLabel(dpoHealth)}).`
    : 'Ödeme vadesi hesaplanamadı (yetersiz veri).'

  const overduePart = overdueRatio !== null
    ? `Vadesi geçen borç oranı %${overdueRatio.toFixed(1)}.`
    : 'Vadesi geçen borç verisi mevcut değil.'

  const totalPart = totalPayables > 0
    ? ` Toplam borç: ₺${formatAmount(totalPayables)}.`
    : ' Bekleyen borç bulunmuyor.'

  return `${dpoPart} ${overduePart}${totalPart}`
}

// ── Public interfaces ─────────────────────────────────────────────────────────

export interface AccountsPayableReport {
  total_payables_try: number
  dpo: number | null
  dpo_health: ReturnType<typeof classifyDpoHealth>
  payable_turnover_ratio: number | null
  overdue_ratio_pct: number | null
  overdue_health: ReturnType<typeof classifyOverduePayableRatio>
  aging: ReturnType<typeof computePayableAging>
  supplier_concentration_hhi: number | null
  supplier_concentration_risk: ReturnType<typeof classifySupplierConcentrationRisk>
  payment_compliance_pct: number | null
  dpo_optimization_benefit_try: number | null // benefit of moving to 45-day DPO
  per_supplier: Array<{
    supplier_id: string
    supplier_name: string
    total_outstanding_try: number
    avg_days_outstanding: number | null
    age_bucket: ReturnType<typeof classifyPayableAgeBucket>
    share_pct: number
  }>
  narrative: string
  period_months: number
}

// ── Internal raw row types ─────────────────────────────────────────────────────

interface RawExpenseRow {
  id: string
  vendor_name: string | null
  category: string | null
  amount_try: number | null
  payment_status: string | null
  due_date: string | null
  expense_date: string | null
  created_at: string
}

interface RawPurchaseRow {
  id: string
  supplier_name: string | null
  purchase_date: string | null
  created_at: string
  fx_rate: number | null
  purchase_items: Array<{ quantity: number | null; unit_price: number | null }> | null
}

// ── Service class ─────────────────────────────────────────────────────────────

export class AccountsPayableService {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(private readonly supabase: SupabaseClient<any>) {}

  async getReport(
    companyId: string,
    periodMonths: number = 3,
  ): Promise<AccountsPayableReport> {
    const today      = new Date()
    const todayStr   = today.toISOString().slice(0, 10)
    const todayMs    = today.getTime()

    const cutoff = new Date(today)
    cutoff.setMonth(cutoff.getMonth() - periodMonths)
    const cutoffStr = cutoff.toISOString().slice(0, 10)

    // ── Fetch data concurrently with graceful fallback ─────────────────────
    const [expensesResult, purchasesResult] = await Promise.allSettled([
      // 1. Unpaid/partial/overdue expenses
      this.supabase
        .from('expenses')
        // expenses has no vendor_name (→ title alias) / due_date columns
        .select('id, vendor_name:title, category, amount_try, payment_status, expense_date, created_at')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .not('payment_status', 'eq', 'paid')
        .gte('expense_date', cutoffStr)
        .order('created_at', { ascending: true })
        .limit(5000),

      // 2. Purchases not yet finalised or cancelled
      this.supabase
        .from('purchases')
        // no total_amount column — compute from line items (fx_rate × Σ qty × unit_price)
        .select('id, supplier_name, purchase_date, created_at, fx_rate, purchase_items(quantity, unit_price)')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .not('status', 'eq', 'finalized')
        .not('status', 'eq', 'cancelled')
        .gte('purchase_date', cutoffStr)
        .order('created_at', { ascending: true })
        .limit(5000),
    ])

    const expenseRows: RawExpenseRow[] =
      expensesResult.status === 'fulfilled' ? ((expensesResult.value.data ?? []) as RawExpenseRow[]) : []

    const purchaseRows: RawPurchaseRow[] =
      purchasesResult.status === 'fulfilled' ? ((purchasesResult.value.data ?? []) as RawPurchaseRow[]) : []

    // ── Normalise rows into payable items ──────────────────────────────────

    interface PayableNorm {
      supplier_id: string      // derived key (vendor name slug or id)
      supplier_name: string
      amount: number
      days_outstanding: number
    }

    const payables: PayableNorm[] = []

    // From expenses
    for (const row of expenseRows) {
      const amount    = round2(Number(row.amount_try) || 0)
      if (amount <= 0) continue

      const dateStr   = (row.expense_date ?? row.created_at ?? todayStr).slice(0, 10)
      const rowMs     = new Date(dateStr + 'T00:00:00Z').getTime()
      const daysOut   = Math.max(0, Math.round((todayMs - rowMs) / 86_400_000))

      const supplierName = (row.vendor_name ?? 'Bilinmeyen Tedarikçi').trim()

      payables.push({
        supplier_id:      slugify(supplierName),
        supplier_name:    supplierName,
        amount,
        days_outstanding: daysOut,
      })
    }

    // From purchases (fallback when no expenses found, or include both)
    for (const row of purchaseRows) {
      const amount = round2(purchaseTotalTry(row))
      if (amount <= 0) continue

      const dateStr   = (row.purchase_date ?? row.created_at ?? todayStr).slice(0, 10)
      const rowMs     = new Date(dateStr + 'T00:00:00Z').getTime()
      const daysOut   = Math.max(0, Math.round((todayMs - rowMs) / 86_400_000))

      const supplierName = (row.supplier_name ?? 'Bilinmeyen Tedarikçi').trim()

      payables.push({
        supplier_id:      slugify(supplierName),
        supplier_name:    supplierName,
        amount,
        days_outstanding: daysOut,
      })
    }

    // ── Empty guard ────────────────────────────────────────────────────────
    if (payables.length === 0) {
      return emptyReport(periodMonths)
    }

    // ── Aging ──────────────────────────────────────────────────────────────
    const aging = computePayableAging(payables)

    const totalPayables = aging.total

    // ── DPO & related ─────────────────────────────────────────────────────
    // Approximate annualCogs from period totals
    const annualCogs = totalPayables > 0
      ? (totalPayables / periodMonths) * 12
      : 0

    const dpo = computeDpo(totalPayables, annualCogs)
    const dpoHealth = classifyDpoHealth(dpo)

    const payableTurnoverRatio = computePayableTurnoverRatio(annualCogs, totalPayables)

    // DPO optimisation target = 45 days (Turkish SME best practice)
    const dpoOptimizationBenefit = computeDpoOptimizationBenefit(annualCogs, dpo, 45)

    // ── Overdue ratio ──────────────────────────────────────────────────────
    const overdueRatio = computeOverduePayableRatio(aging)
    const overdueHealth = classifyOverduePayableRatio(overdueRatio)

    // ── Supplier concentration ─────────────────────────────────────────────
    // Aggregate by supplier_id
    const supplierMap = new Map<string, { supplier_name: string; amount: number; daysSum: number; count: number }>()

    for (const p of payables) {
      const existing = supplierMap.get(p.supplier_id)
      if (existing) {
        existing.amount   += p.amount
        existing.daysSum  += p.days_outstanding
        existing.count    += 1
      } else {
        supplierMap.set(p.supplier_id, {
          supplier_name: p.supplier_name,
          amount:        p.amount,
          daysSum:       p.days_outstanding,
          count:         1,
        })
      }
    }

    const supplierList = Array.from(supplierMap.entries()).map(([id, v]) => ({
      supplier_id:   id,
      supplier_name: v.supplier_name,
      amount:        v.amount,
      daysSum:       v.daysSum,
      count:         v.count,
    }))

    const hhi = computeSupplierPaymentConcentration(
      supplierList.map(s => ({ supplier_id: s.supplier_id, amount: s.amount })),
    )
    const concentrationRisk = classifySupplierConcentrationRisk(hhi)

    // ── Per-supplier detail ────────────────────────────────────────────────
    supplierList.sort((a, b) => b.amount - a.amount)

    const perSupplier = supplierList.map(s => {
      const avgDays = s.count > 0 ? round2(s.daysSum / s.count) : null
      return {
        supplier_id:           s.supplier_id,
        supplier_name:         s.supplier_name,
        total_outstanding_try: round2(s.amount),
        avg_days_outstanding:  avgDays,
        age_bucket:            classifyPayableAgeBucket(avgDays ?? 0),
        share_pct:             totalPayables > 0 ? round2((s.amount / totalPayables) * 100) : 0,
      }
    })

    // ── Narrative ──────────────────────────────────────────────────────────
    const narrative = generatePayablesNarrative({
      dpo,
      dpoHealth,
      overdueRatio,
      totalPayables,
    })

    return {
      total_payables_try:           round2(totalPayables),
      dpo,
      dpo_health:                   dpoHealth,
      payable_turnover_ratio:       payableTurnoverRatio,
      overdue_ratio_pct:            overdueRatio,
      overdue_health:               overdueHealth,
      aging,
      supplier_concentration_hhi:   hhi,
      supplier_concentration_risk:  concentrationRisk,
      payment_compliance_pct:       null, // no payment timing data in schema
      dpo_optimization_benefit_try: dpoOptimizationBenefit,
      per_supplier:                 perSupplier,
      narrative,
      period_months:                periodMonths,
    }
  }
}

// ── Private helpers ───────────────────────────────────────────────────────────

function round2(v: number): number {
  return Math.round(v * 100) / 100
}

function formatAmount(amount: number): string {
  return amount.toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_ğüşıöç]/g, '')
}

function dpoHealthLabel(health: ReturnType<typeof classifyDpoHealth>): string {
  const labels: Record<ReturnType<typeof classifyDpoHealth>, string> = {
    optimal:           'optimal',
    good:              'iyi',
    fast:              'hızlı ödeme',
    very_fast:         'çok hızlı ödeme',
    slow:              'yavaş ödeme',
    very_slow:         'çok yavaş ödeme',
    insufficient_data: 'yetersiz veri',
  }
  return labels[health]
}

function emptyReport(periodMonths: number): AccountsPayableReport {
  const emptyAging = computePayableAging([])
  return {
    total_payables_try:           0,
    dpo:                          null,
    dpo_health:                   'insufficient_data',
    payable_turnover_ratio:       null,
    overdue_ratio_pct:            null,
    overdue_health:               'insufficient_data',
    aging:                        emptyAging,
    supplier_concentration_hhi:   null,
    supplier_concentration_risk:  'insufficient_data',
    payment_compliance_pct:       null,
    dpo_optimization_benefit_try: null,
    per_supplier:                 [],
    narrative:                    'Bu dönem için bekleyen borç kaydı bulunamadı.',
    period_months:                periodMonths,
  }
}
