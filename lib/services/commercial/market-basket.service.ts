// ─────────────────────────────────────────────────────────────────────────────
// lib/services/commercial/market-basket.service.ts
//
// Market Basket Analysis (Apriori-style product association)
//
// Identifies which products are frequently bought together to enable
// upsell/cross-sell recommendations for Turkish SME sales teams.
//
// Pure functions exported for testing:
//   computeSupport
//   computeConfidence
//   computeLift
//   classifyAssociationStrength
//   computeItemsetPairs
//   buildAssociationRules
//   findTopCrossSellOpportunities
//
// Class: MarketBasketService
//   getReport(companyId)
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>

// ── Pure exported functions ───────────────────────────────────────────────────

/**
 * computeSupport
 *
 * Returns itemsetTransactionCount / totalTransactions × 100 (as percentage).
 * null if totalTransactions === 0.
 */
export function computeSupport(
  itemsetTransactionCount: number,
  totalTransactions: number,
): number | null {
  if (totalTransactions === 0) return null
  return (itemsetTransactionCount / totalTransactions) * 100
}

/**
 * computeConfidence
 *
 * Returns itemsetTransactions / antecedentTransactions × 100.
 * null if antecedentTransactions === 0.
 */
export function computeConfidence(
  antecedentTransactions: number,
  itemsetTransactions: number,
): number | null {
  if (antecedentTransactions === 0) return null
  return (itemsetTransactions / antecedentTransactions) * 100
}

/**
 * computeLift
 *
 * Returns (confidence / 100) / (consequentSupport / 100)
 *   = confidence / consequentSupport
 * null if either argument is null, or consequentSupport === 0.
 *
 * Lift > 1: positive association
 * Lift = 1: independent
 * Lift < 1: negative association
 */
export function computeLift(
  confidence: number | null,
  consequentSupport: number | null,
): number | null {
  if (confidence === null || consequentSupport === null) return null
  if (consequentSupport === 0) return null
  return confidence / consequentSupport
}

/**
 * classifyAssociationStrength
 *
 * insufficient_data: both null
 * strong:           lift >= 2 AND confidence >= 50
 * moderate:         lift >= 1.5 AND confidence >= 30
 * weak:             lift > 1
 * none:             lift <= 1
 */
export function classifyAssociationStrength(
  lift: number | null,
  confidence: number | null,
): 'strong' | 'moderate' | 'weak' | 'none' | 'insufficient_data' {
  if (lift === null && confidence === null) return 'insufficient_data'
  if (lift === null) return 'insufficient_data'

  if (lift >= 2 && (confidence ?? 0) >= 50) return 'strong'
  if (lift >= 1.5 && (confidence ?? 0) >= 30) return 'moderate'
  if (lift > 1) return 'weak'
  return 'none'
}

/**
 * computeItemsetPairs
 *
 * Returns a Map of "productA|productB" → co-occurrence count.
 * Keys are sorted: smaller product_id alphabetically comes first.
 * For each transaction with 2+ products, all unique pairs are enumerated.
 */
export function computeItemsetPairs(
  transactions: Array<{ transaction_id: string; product_ids: string[] }>,
): Map<string, number> {
  const pairCounts = new Map<string, number>()

  for (const tx of transactions) {
    const ids = tx.product_ids
    if (ids.length < 2) continue

    // Unique product IDs in this transaction
    const unique = Array.from(new Set(ids))

    for (let i = 0; i < unique.length; i++) {
      for (let j = i + 1; j < unique.length; j++) {
        const a = unique[i]
        const b = unique[j]
        // Sort alphabetically: smaller first
        const key = a < b ? `${a}|${b}` : `${b}|${a}`
        pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1)
      }
    }
  }

  return pairCounts
}

/**
 * buildAssociationRules
 *
 * For each co-occurring pair (above minSupport):
 *   support    = pairCount / totalTransactions × 100
 *   confidence = pairCount / antecedent_count × 100
 * Only include if support >= minSupport AND confidence >= minConfidence.
 * Also includes the reverse rule (B→A) if it meets thresholds.
 * Sorted by lift descending.
 */
export function buildAssociationRules(
  transactions: Array<{ transaction_id: string; product_ids: string[] }>,
  productFrequency: Map<string, number>,
  totalTransactions: number,
  minSupport = 5,
  minConfidence = 20,
): Array<{
  antecedent: string
  consequent: string
  support_pct: number
  confidence_pct: number
  lift: number | null
  strength: ReturnType<typeof classifyAssociationStrength>
}> {
  if (totalTransactions === 0) return []

  const pairCounts = computeItemsetPairs(transactions)
  const rules: Array<{
    antecedent: string
    consequent: string
    support_pct: number
    confidence_pct: number
    lift: number | null
    strength: ReturnType<typeof classifyAssociationStrength>
  }> = []

  for (const [key, pairCount] of pairCounts) {
    const [productA, productB] = key.split('|')

    const supportPct = (pairCount / totalTransactions) * 100
    if (supportPct < minSupport) continue

    // Rule A → B
    const freqA = productFrequency.get(productA) ?? 0
    if (freqA > 0) {
      const confAB = (pairCount / freqA) * 100
      if (confAB >= minConfidence) {
        const supportB = computeSupport(productFrequency.get(productB) ?? 0, totalTransactions)
        const lift = computeLift(confAB, supportB)
        rules.push({
          antecedent:     productA,
          consequent:     productB,
          support_pct:    supportPct,
          confidence_pct: confAB,
          lift,
          strength: classifyAssociationStrength(lift, confAB),
        })
      }
    }

    // Rule B → A (reverse)
    const freqB = productFrequency.get(productB) ?? 0
    if (freqB > 0) {
      const confBA = (pairCount / freqB) * 100
      if (confBA >= minConfidence) {
        const supportA = computeSupport(productFrequency.get(productA) ?? 0, totalTransactions)
        const lift = computeLift(confBA, supportA)
        rules.push({
          antecedent:     productB,
          consequent:     productA,
          support_pct:    supportPct,
          confidence_pct: confBA,
          lift,
          strength: classifyAssociationStrength(lift, confBA),
        })
      }
    }
  }

  // Sort by lift descending (null lift goes last)
  return rules.sort((a, b) => {
    if (a.lift === null && b.lift === null) return 0
    if (a.lift === null) return 1
    if (b.lift === null) return -1
    return b.lift - a.lift
  })
}

/**
 * findTopCrossSellOpportunities
 *
 * Maps product IDs to names, limits to topN results.
 * Falls back to product_id as name if not found in productNames.
 */
export function findTopCrossSellOpportunities(
  rules: Array<{
    antecedent: string
    consequent: string
    confidence_pct: number
    lift: number | null
  }>,
  productNames: Map<string, string>,
  topN = 10,
): Array<{
  if_buying: string
  also_buy: string
  confidence_pct: number
  lift: number | null
  strength: ReturnType<typeof classifyAssociationStrength>
}> {
  return rules
    .slice(0, topN)
    .map(rule => ({
      if_buying:      productNames.get(rule.antecedent) ?? rule.antecedent,
      also_buy:       productNames.get(rule.consequent) ?? rule.consequent,
      confidence_pct: rule.confidence_pct,
      lift:           rule.lift,
      strength:       classifyAssociationStrength(rule.lift, rule.confidence_pct),
    }))
}

// ── Internal helper ───────────────────────────────────────────────────────────

function last12MonthsFrom(): string {
  const d = new Date()
  d.setFullYear(d.getFullYear() - 1)
  return d.toISOString().slice(0, 10)
}

// ── Service class ─────────────────────────────────────────────────────────────

export class MarketBasketService {
  constructor(private supabase: AnyClient) {}

  async getReport(companyId: string): Promise<{
    association_rules: ReturnType<typeof buildAssociationRules>
    top_cross_sell: ReturnType<typeof findTopCrossSellOpportunities>
    summary: {
      total_transactions: number
      total_products: number
      unique_pairs_found: number
      avg_items_per_transaction: number | null
      rules_found: number
    }
  }> {
    const fromDate = last12MonthsFrom()
    const toDate   = new Date().toISOString().slice(0, 10)

    // ── Fetch sale_items with sales, grouped by sale_id ───────────────────────
    let rawItems: Array<{ sale_id: string; product_id: string | null; product_name: string | null }> = []

    try {
      const { data } = await this.supabase
        .from('sale_items')
        .select(`
          product_id,
          product_name,
          sale_id,
          sales!inner(
            id,
            company_id,
            deleted_at,
            is_proforma,
            sale_date
          )
        `)
        .eq('sales.company_id', companyId)
        .is('sales.deleted_at', null)
        .or('sales.is_proforma.is.null,sales.is_proforma.eq.false')
        .gte('sales.sale_date', fromDate)
        .lte('sales.sale_date', toDate)

      if (data) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        rawItems = (data as Array<Record<string, any>>).map(row => ({
          sale_id:      String(row.sale_id ?? ''),
          product_id:   row.product_id ? String(row.product_id) : null,
          product_name: row.product_name ? String(row.product_name) : null,
        }))
      }
    } catch {
      // Graceful fallback
    }

    // ── Fetch product names ────────────────────────────────────────────────────
    const productNames = new Map<string, string>()

    try {
      const { data: prodData } = await this.supabase
        .from('products')
        .select('id, name')
        .eq('company_id', companyId)
        .is('deleted_at', null)

      if (prodData) {
        for (const p of prodData as Array<{ id: string; name: string }>) {
          productNames.set(p.id, p.name)
        }
      }
    } catch {
      // Graceful fallback
    }

    // Also collect names from sale_items (fallback if product not in catalog)
    for (const item of rawItems) {
      if (item.product_id && item.product_name && !productNames.has(item.product_id)) {
        productNames.set(item.product_id, item.product_name)
      }
    }

    // ── Build transaction map: sale_id → [product_ids] ────────────────────────
    const txMap = new Map<string, string[]>()
    for (const item of rawItems) {
      if (!item.sale_id || !item.product_id) continue
      const existing = txMap.get(item.sale_id) ?? []
      if (!existing.includes(item.product_id)) {
        existing.push(item.product_id)
      }
      txMap.set(item.sale_id, existing)
    }

    // Only keep transactions with 2+ products (basket analysis requirement)
    const transactions: Array<{ transaction_id: string; product_ids: string[] }> = []
    for (const [txId, pids] of txMap) {
      if (pids.length >= 2) {
        transactions.push({ transaction_id: txId, product_ids: pids })
      }
    }

    const totalTransactions = transactions.length

    // ── Build product frequency map ────────────────────────────────────────────
    const productFrequency = new Map<string, number>()
    for (const tx of transactions) {
      for (const pid of tx.product_ids) {
        productFrequency.set(pid, (productFrequency.get(pid) ?? 0) + 1)
      }
    }

    const totalProducts = productFrequency.size

    // ── Compute pair counts for summary ───────────────────────────────────────
    const pairCounts = computeItemsetPairs(transactions)
    const uniquePairsFound = pairCounts.size

    // ── Avg items per transaction ─────────────────────────────────────────────
    const avgItemsPerTransaction = totalTransactions > 0
      ? transactions.reduce((s, tx) => s + tx.product_ids.length, 0) / totalTransactions
      : null

    // ── Build association rules ────────────────────────────────────────────────
    const associationRules = buildAssociationRules(
      transactions,
      productFrequency,
      totalTransactions,
      5,   // minSupport 5%
      20,  // minConfidence 20%
    )

    // ── Top cross-sell opportunities ──────────────────────────────────────────
    const topCrossSell = findTopCrossSellOpportunities(
      associationRules,
      productNames,
      10,
    )

    return {
      association_rules: associationRules,
      top_cross_sell:    topCrossSell,
      summary: {
        total_transactions:        totalTransactions,
        total_products:            totalProducts,
        unique_pairs_found:        uniquePairsFound,
        avg_items_per_transaction: avgItemsPerTransaction,
        rules_found:               associationRules.length,
      },
    }
  }
}
