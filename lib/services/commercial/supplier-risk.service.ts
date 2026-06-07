// ── SupplierRiskService — Supplier Concentration Risk & Supply Chain Vulnerability ─
// Scores supplier concentration risk and supply chain vulnerability for Turkish SMEs.
// Uses Herfindahl-Hirschman Index (HHI) and multi-factor risk scoring.
//
// Pure helpers are exported for unit testing without DB.

import type { SupabaseClient } from '@supabase/supabase-js'
import { purchaseTotalTry } from '@/lib/finance/purchase-total'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SupplierStats {
  supplier_name: string
  spend: number
  spend_share_pct: number | null
  outstanding_payable: number
  payment_delay_rate_pct: number | null
  is_single_source: boolean              // share > 30%
}

export interface SupplierRiskReport {
  as_of_date: string
  period_months: number                  // default 6

  // Totals
  total_spend: number
  supplier_count: number

  // Concentration
  hhi: number | null
  concentration: ReturnType<typeof classifySupplierConcentration>
  top_supplier_share_pct: number | null
  single_source_count: number            // suppliers with >30% share

  // Risk score
  risk_score: number
  risk_level: ReturnType<typeof classifySupplierRisk>

  // Payment metrics
  payment_delay_rate_pct: number | null
  supply_chain_exposure: number

  // Top suppliers (by spend desc)
  top_suppliers: SupplierStats[]

  narrative: string
}

// ── Raw DB rows ───────────────────────────────────────────────────────────────

interface PurchaseRow {
  supplier_name: string | null
  fx_rate: number | null
  purchase_date: string | null
  status: string | null
  purchase_items: Array<{ quantity: number | null; unit_price: number | null }> | null
}

interface ExpenseRow {
  supplier_name: string | null
  title: string | null
  amount_try: number | null
  expense_date: string | null
  payment_status: string | null
}

// ── Pure computation helpers ──────────────────────────────────────────────────

// ── Concentration Metrics ─────────────────────────────────────────────────────

/**
 * Compute supplier HHI (Herfindahl-Hirschman Index).
 * HHI = Σ (supplier_share_pct / 100)²
 * Range: 0 (perfectly diversified) to 1 (single supplier monopoly).
 * Returns null if totalSpend === 0.
 */
export function computeSupplierHhi(
  suppliers: Array<{ spend: number }>,
  totalSpend: number,
): number | null {
  if (totalSpend === 0) return null
  if (suppliers.length === 0) return null
  return suppliers.reduce((sum, s) => {
    const share = s.spend / totalSpend
    return sum + share * share
  }, 0)
}

/**
 * Classify supplier concentration from HHI.
 * 'single_source':       HHI >= 0.95
 * 'highly_concentrated': HHI >= 0.50
 * 'concentrated':        HHI >= 0.25
 * 'moderate':            HHI >= 0.10
 * 'diversified':         HHI < 0.10
 * 'insufficient_data':   null
 */
export function classifySupplierConcentration(
  hhi: number | null,
): 'diversified' | 'moderate' | 'concentrated' | 'highly_concentrated' | 'single_source' | 'insufficient_data' {
  if (hhi === null) return 'insufficient_data'
  if (hhi >= 0.95) return 'single_source'
  if (hhi >= 0.50) return 'highly_concentrated'
  if (hhi >= 0.25) return 'concentrated'
  if (hhi >= 0.10) return 'moderate'
  return 'diversified'
}

/**
 * Compute single-source risk score.
 * Returns the share of the top supplier as percentage.
 * Returns null if suppliers array is empty.
 */
export function computeTopSupplierShare(
  suppliers: Array<{ spend: number }>,
  totalSpend: number,
): number | null {
  if (suppliers.length === 0) return null
  if (totalSpend === 0) return null
  const maxSpend = Math.max(...suppliers.map(s => s.spend))
  return (maxSpend / totalSpend) * 100
}

/**
 * Count single-source suppliers (those with share > threshold, default 30%).
 */
export function countSingleSourceDependencies(
  suppliers: Array<{ spend: number }>,
  totalSpend: number,
  threshold = 30,
): number {
  if (totalSpend === 0) return 0
  return suppliers.filter(s => (s.spend / totalSpend) * 100 > threshold).length
}

// ── Supplier Payment Risk ─────────────────────────────────────────────────────

/**
 * Compute supplier payment delay rate.
 * delayedPayments / totalPayments * 100.
 * Returns null if totalPayments === 0.
 */
export function computeSupplierPaymentDelayRate(
  delayedPayments: number,
  totalPayments: number,
): number | null {
  if (totalPayments === 0) return null
  return (delayedPayments / totalPayments) * 100
}

/**
 * Compute supply chain financial exposure.
 * Total unpaid/outstanding amounts to suppliers.
 * exposure = Σ outstanding_payables
 */
export function computeSupplyChainExposure(
  payables: Array<{ outstanding: number }>,
): number {
  if (payables.length === 0) return 0
  return payables.reduce((sum, p) => sum + p.outstanding, 0)
}

/**
 * Compute supplier payment terms compliance.
 * onTimePct = paymentsOnTime / total * 100.
 * Returns null if total === 0.
 */
export function computePaymentTermsCompliance(paymentsOnTime: number, total: number): number | null {
  if (total === 0) return null
  return (paymentsOnTime / total) * 100
}

// ── Supplier Risk Scoring ─────────────────────────────────────────────────────

/**
 * Compute supplier risk score (0-100, higher = more risk).
 * Components:
 * - Concentration risk: hhi * 40 (max 40 pts)
 * - Single source penalty: if topShare > 50% → +20; if > 30% → +10; else 0
 * - Payment delay risk: delayRate * 0.25 (max ~25 pts from 100% delay)
 * - Diversification bonus: if supplierCount >= 10 → -15; if >= 5 → -10 (reduces risk)
 * Clamped 0-100.
 */
export function computeSupplierRiskScore(
  hhi: number | null,
  topSupplierSharePct: number | null,
  paymentDelayRatePct: number | null,
  supplierCount: number,
): number {
  let score = 0

  // Concentration risk component
  if (hhi !== null) {
    score += hhi * 40
  }

  // Single source penalty
  if (topSupplierSharePct !== null) {
    if (topSupplierSharePct > 50) {
      score += 20
    } else if (topSupplierSharePct > 30) {
      score += 10
    }
  }

  // Payment delay risk
  if (paymentDelayRatePct !== null) {
    score += paymentDelayRatePct * 0.25
  }

  // Diversification bonus
  if (supplierCount >= 10) {
    score -= 15
  } else if (supplierCount >= 5) {
    score -= 10
  }

  return Math.max(0, Math.min(100, score))
}

/**
 * Classify supplier risk level.
 * 'low':      < 20
 * 'moderate': < 40
 * 'elevated': < 60
 * 'high':     < 80
 * 'critical': >= 80
 */
export function classifySupplierRisk(score: number): 'low' | 'moderate' | 'elevated' | 'high' | 'critical' {
  if (score < 20) return 'low'
  if (score < 40) return 'moderate'
  if (score < 60) return 'elevated'
  if (score < 80) return 'high'
  return 'critical'
}

// ── Category Risk ─────────────────────────────────────────────────────────────

/**
 * Compute spend share per category: category_spend / total_spend * 100.
 * Returns null if totalSpend === 0.
 */
export function computeCategorySpendShare(categorySpend: number, totalSpend: number): number | null {
  if (totalSpend === 0) return null
  return (categorySpend / totalSpend) * 100
}

/**
 * Identify top N suppliers by spend.
 */
export function getTopSuppliersBySpend<T extends { spend: number; name: string }>(
  suppliers: T[],
  n = 5,
): T[] {
  return [...suppliers].sort((a, b) => b.spend - a.spend).slice(0, n)
}

/**
 * Compute month-over-month spend change for a supplier.
 * Returns null if priorMonthSpend === 0.
 */
export function computeSupplierSpendChange(currentSpend: number, priorMonthSpend: number): number | null {
  if (priorMonthSpend === 0) return null
  return ((currentSpend - priorMonthSpend) / priorMonthSpend) * 100
}

/**
 * Generate Turkish supply chain risk narrative.
 */
export function generateSupplierRiskNarrative(
  riskLevel: ReturnType<typeof classifySupplierRisk>,
  concentration: ReturnType<typeof classifySupplierConcentration>,
  supplierCount: number,
  topSupplierSharePct: number | null,
): string {
  const topFmt = topSupplierSharePct !== null ? topSupplierSharePct.toFixed(0) : '?'

  if (riskLevel === 'critical') {
    if (concentration === 'single_source') {
      return `TEDARİK ZİNCİRİ KRİTİK: Tek tedarikçi harcamanızın %${topFmt}'ini oluşturuyor. Acil tedarikçi çeşitlendirmesi gereklidir.`
    }
    return `TEDARİK ZİNCİRİ KRİTİK: ${supplierCount} tedarikçi ile yüksek konsantrasyon riski. En büyük tedarikçi harcamanızın %${topFmt}'ini oluşturuyor.`
  }

  if (riskLevel === 'high') {
    if (concentration === 'highly_concentrated') {
      return `Yüksek tedarikçi riski: Tedarik tabanı aşırı yoğunlaşmış. En büyük tedarikçi %${topFmt} paya sahip.`
    }
    return `Yüksek tedarikçi riski: ${supplierCount} tedarikçi mevcut ancak konsantrasyon yüksek (%${topFmt}).`
  }

  if (riskLevel === 'elevated') {
    if (concentration === 'concentrated') {
      return `Orta-yüksek tedarikçi riski: Harcamalar birkaç tedarikçide yoğunlaşmış. Yeni tedarikçi arayışı önerilir.`
    }
    return `Orta-yüksek tedarikçi riski: ${supplierCount} tedarikçi ile tedarik tabanı geliştirilmeli.`
  }

  if (riskLevel === 'moderate') {
    return `Orta düzey tedarikçi riski: ${supplierCount} tedarikçi ile makul çeşitlilik mevcut. İzleme önerilir.`
  }

  // low
  if (concentration === 'diversified') {
    return `Düşük tedarikçi riski: ${supplierCount} tedarikçi ile sağlıklı çeşitlendirme sağlanmış.`
  }
  return `Düşük tedarikçi riski: Tedarik zinciri yönetilebilir düzeyde. ${supplierCount} aktif tedarikçi.`
}

// ── Service ───────────────────────────────────────────────────────────────────

export class SupplierRiskService {
  constructor(private readonly supabase: SupabaseClient<any>) {}

  async getReport(companyId: string, periodMonths = 6): Promise<SupplierRiskReport> {
    const now = new Date()
    const fromDate = new Date(now)
    fromDate.setMonth(fromDate.getMonth() - periodMonths)
    const fromDateStr = fromDate.toISOString().slice(0, 10)
    const toDateStr   = now.toISOString().slice(0, 10)
    const asOfDate    = toDateStr

    // ── Fetch from purchases and expenses in parallel ──────────────────────────
    const [purchasesRes, expensesRes] = await Promise.allSettled([
      this.supabase
        .from('purchases')
        // no total_cost_try column — compute from line items (fx_rate × Σ qty × unit_price)
        .select('supplier_name, fx_rate, purchase_date, status, purchase_items(quantity, unit_price)')
        .eq('company_id', companyId)
        .gte('purchase_date', fromDateStr)
        .lte('purchase_date', toDateStr),
      this.supabase
        .from('expenses')
        // expenses has no supplier_name — `title` is the payee (consumer falls back to it)
        .select('title, amount_try, expense_date, payment_status')
        .eq('company_id', companyId)
        .gte('expense_date', fromDateStr)
        .lte('expense_date', toDateStr),
    ])

    // ── Aggregate purchases by supplier ───────────────────────────────────────
    const supplierSpendMap   = new Map<string, { spend: number; totalCount: number; delayedCount: number; outstanding: number }>()

    // Process purchases
    let hasPurchasesData = false
    if (purchasesRes.status === 'fulfilled' && !purchasesRes.value.error) {
      const rows = (purchasesRes.value.data ?? []) as PurchaseRow[]
      for (const row of rows) {
        const name   = (row.supplier_name ?? '').trim() || 'Diğer Tedarikçiler'
        const spend  = purchaseTotalTry(row)
        const status = (row.status ?? '').toLowerCase()
        const isDelayed = status === 'overdue' || status === 'late'
        const isOutstanding = status !== 'received' && status !== 'completed' && status !== 'paid' && status !== 'cancelled'

        const existing = supplierSpendMap.get(name)
        if (existing) {
          existing.spend       += spend
          existing.totalCount  += 1
          existing.delayedCount += isDelayed ? 1 : 0
          existing.outstanding += isOutstanding ? spend : 0
        } else {
          supplierSpendMap.set(name, {
            spend,
            totalCount: 1,
            delayedCount: isDelayed ? 1 : 0,
            outstanding: isOutstanding ? spend : 0,
          })
        }
        if (spend > 0) hasPurchasesData = true
      }
    }

    // Fallback: use expenses if purchases empty or failed
    if (!hasPurchasesData && expensesRes.status === 'fulfilled' && !expensesRes.value.error) {
      const rows = (expensesRes.value.data ?? []) as ExpenseRow[]
      for (const row of rows) {
        const name   = (row.supplier_name ?? row.title ?? '').trim() || 'Diğer Tedarikçiler'
        const spend  = Number(row.amount_try ?? 0)
        const status = (row.payment_status ?? '').toLowerCase()
        const isDelayed = status === 'overdue'
        const isOutstanding = status === 'unpaid' || status === 'overdue' || status === 'partial'

        const existing = supplierSpendMap.get(name)
        if (existing) {
          existing.spend        += spend
          existing.totalCount   += 1
          existing.delayedCount += isDelayed ? 1 : 0
          existing.outstanding  += isOutstanding ? spend : 0
        } else {
          supplierSpendMap.set(name, {
            spend,
            totalCount: 1,
            delayedCount: isDelayed ? 1 : 0,
            outstanding: isOutstanding ? spend : 0,
          })
        }
      }
    }

    // ── Compute aggregates ────────────────────────────────────────────────────
    const supplierEntries = Array.from(supplierSpendMap.entries())
      .filter(([, v]) => v.spend > 0)
      .sort((a, b) => b[1].spend - a[1].spend)

    const totalSpend    = supplierEntries.reduce((s, [, v]) => s + v.spend, 0)
    const supplierCount = supplierEntries.length

    const suppliersForHhi = supplierEntries.map(([, v]) => ({ spend: v.spend }))
    const hhi             = computeSupplierHhi(suppliersForHhi, totalSpend)
    const concentration   = classifySupplierConcentration(hhi)
    const topSharePct     = computeTopSupplierShare(suppliersForHhi, totalSpend)
    const singleSourceCnt = countSingleSourceDependencies(suppliersForHhi, totalSpend, 30)

    // Payment metrics (aggregate across all suppliers)
    const totalPaymentCount   = supplierEntries.reduce((s, [, v]) => s + v.totalCount, 0)
    const totalDelayedCount   = supplierEntries.reduce((s, [, v]) => s + v.delayedCount, 0)
    const paymentDelayRatePct = computeSupplierPaymentDelayRate(totalDelayedCount, totalPaymentCount)

    const payables            = supplierEntries.map(([, v]) => ({ outstanding: v.outstanding }))
    const supplyChainExposure = computeSupplyChainExposure(payables)

    // Risk score & level
    const riskScore = computeSupplierRiskScore(hhi, topSharePct, paymentDelayRatePct, supplierCount)
    const riskLevel = classifySupplierRisk(riskScore)

    // ── Build top suppliers list ───────────────────────────────────────────────
    const topSuppliers: SupplierStats[] = supplierEntries.slice(0, 10).map(([name, v]) => {
      const sharePerSupplier = totalSpend > 0 ? (v.spend / totalSpend) * 100 : null
      const perSupplierDelayRate = computeSupplierPaymentDelayRate(v.delayedCount, v.totalCount)
      return {
        supplier_name:        name,
        spend:                v.spend,
        spend_share_pct:      sharePerSupplier,
        outstanding_payable:  v.outstanding,
        payment_delay_rate_pct: perSupplierDelayRate,
        is_single_source:     sharePerSupplier !== null && sharePerSupplier > 30,
      }
    })

    const narrative = generateSupplierRiskNarrative(riskLevel, concentration, supplierCount, topSharePct)

    return {
      as_of_date:              asOfDate,
      period_months:           periodMonths,
      total_spend:             totalSpend,
      supplier_count:          supplierCount,
      hhi,
      concentration,
      top_supplier_share_pct:  topSharePct,
      single_source_count:     singleSourceCnt,
      risk_score:              riskScore,
      risk_level:              riskLevel,
      payment_delay_rate_pct:  paymentDelayRatePct,
      supply_chain_exposure:   supplyChainExposure,
      top_suppliers:           topSuppliers,
      narrative,
    }
  }
}
