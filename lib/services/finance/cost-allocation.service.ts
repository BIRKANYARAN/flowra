// ─────────────────────────────────────────────────────────────────────────────
// lib/services/finance/cost-allocation.service.ts
//
// Cost Center Allocation & Overhead Distribution Service
//
// Handles direct and indirect cost allocation across business units using
// multiple allocation methods: revenue-based, headcount-based, equal split,
// direct-only, and activity-based.
//
// Pure exported functions (testable without DB):
//   computeAllocationWeight         — weight for a single cost center
//   allocateOverhead                — distribute overhead across all centers
//   computeFullCostAllocation       — full pipeline with AllocationResult[]
//   computeOverheadRatio            — overhead / directCosts × 100
//   computeBreakevenRevenue         — fixedCosts / (1 - variableCostRatio)
//   classifyOverheadLevel           — lean/normal/elevated/heavy/critical
//   segregateCosts                  — fixed/variable/semi-variable split
//   computeContributionMargin       — revenue - variableCosts
//   computeContributionMarginRatio  — CM / revenue × 100
//   computeOperatingLeverageEffect  — revenue change × (1 / (1 - cmr/100))
//   identifyHighestOverheadCenter   — center with highest overhead_rate_pct
//   computeTargetCostReduction      — cost reduction to hit target margin
//   generateAllocationNarrative     — Turkish summary string
//
// Class: CostAllocationService
//   getReport(companyId, method?): Promise<CostAllocationReport>
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'

// ── Types ─────────────────────────────────────────────────────────────────────

export type AllocationMethod =
  | 'revenue_based'
  | 'headcount_based'
  | 'equal_split'
  | 'direct_only'
  | 'activity_based'

export interface CostCenter {
  id: string
  name: string
  revenue_contribution: number   // for revenue_based allocation
  headcount: number              // for headcount_based
  activity_units: number         // for activity_based (e.g. machine hours, transactions)
}

export interface DirectCost {
  cost_center_id: string
  category: string
  amount: number
}

export interface AllocationResult {
  cost_center_id: string
  cost_center_name: string
  direct_costs: number
  allocated_overhead: number
  total_cost: number
  cost_per_revenue_unit: number | null   // total_cost / revenue_contribution
  overhead_rate_pct: number | null        // allocated_overhead / direct_costs × 100
  allocation_share_pct: number            // this center's allocation / total overhead × 100
}

// ── Pure exported functions ───────────────────────────────────────────────────

/**
 * computeAllocationWeight
 *
 * Returns the fractional weight (0–1) for a single cost center under the
 * specified allocation method.
 *
 * - revenue_based:   center.revenue_contribution / totalRevenue
 * - headcount_based: center.headcount / totalHeadcount
 * - equal_split:     1 (caller divides by count)
 * - direct_only:     0 (no overhead allocated)
 * - activity_based:  center.activity_units / totalActivityUnits
 *
 * Returns 0 if denominator is 0.
 */
export function computeAllocationWeight(
  costCenter: CostCenter,
  method: AllocationMethod,
  totalRevenue: number,
  totalHeadcount: number,
  totalActivityUnits: number,
): number {
  switch (method) {
    case 'revenue_based':
      return totalRevenue === 0 ? 0 : costCenter.revenue_contribution / totalRevenue

    case 'headcount_based':
      return totalHeadcount === 0 ? 0 : costCenter.headcount / totalHeadcount

    case 'equal_split':
      return 1

    case 'direct_only':
      return 0

    case 'activity_based':
      return totalActivityUnits === 0 ? 0 : costCenter.activity_units / totalActivityUnits
  }
}

/**
 * allocateOverhead
 *
 * Distributes totalOverhead across cost centers using the specified method.
 * The last center absorbs any rounding remainder to ensure exact totals.
 *
 * - direct_only: all centers get 0
 * - equal_split: totalOverhead / count, last gets remainder
 */
export function allocateOverhead(
  totalOverhead: number,
  costCenters: CostCenter[],
  method: AllocationMethod,
): Array<{ cost_center_id: string; allocated_amount: number; weight: number }> {
  if (costCenters.length === 0) return []

  if (method === 'direct_only') {
    return costCenters.map(cc => ({
      cost_center_id: cc.id,
      allocated_amount: 0,
      weight: 0,
    }))
  }

  const totalRevenue       = costCenters.reduce((s, c) => s + c.revenue_contribution, 0)
  const totalHeadcount     = costCenters.reduce((s, c) => s + c.headcount, 0)
  const totalActivityUnits = costCenters.reduce((s, c) => s + c.activity_units, 0)

  if (method === 'equal_split') {
    const count     = costCenters.length
    const baseShare = Math.floor((totalOverhead / count) * 100) / 100
    let distributed = 0
    return costCenters.map((cc, idx) => {
      const isLast         = idx === count - 1
      const allocated_amount = isLast
        ? Math.round((totalOverhead - distributed) * 100) / 100
        : baseShare
      distributed += allocated_amount
      return { cost_center_id: cc.id, allocated_amount, weight: 1 }
    })
  }

  const weights = costCenters.map(cc =>
    computeAllocationWeight(cc, method, totalRevenue, totalHeadcount, totalActivityUnits),
  )

  // If all weights are 0 (e.g. all revenue contributions are 0), no overhead is allocated
  const totalWeight = weights.reduce((s, w) => s + w, 0)
  if (totalWeight === 0) {
    return costCenters.map(cc => ({ cost_center_id: cc.id, allocated_amount: 0, weight: 0 }))
  }

  let distributed = 0
  return costCenters.map((cc, idx) => {
    const isLast = idx === costCenters.length - 1
    const weight = weights[idx]
    const allocated_amount = isLast
      ? Math.round((totalOverhead - distributed) * 100) / 100
      : Math.round(totalOverhead * weight * 100) / 100
    distributed += allocated_amount
    return { cost_center_id: cc.id, allocated_amount, weight }
  })
}

/**
 * computeFullCostAllocation
 *
 * Full pipeline:
 *  1. Group directCosts by cost_center_id
 *  2. allocateOverhead
 *  3. Build AllocationResult per cost center
 *
 * - cost_per_revenue_unit: null if revenue_contribution === 0
 * - overhead_rate_pct:     null if direct_costs === 0
 */
export function computeFullCostAllocation(
  costCenters: CostCenter[],
  directCosts: DirectCost[],
  overheadAmount: number,
  method: AllocationMethod,
): AllocationResult[] {
  // Group direct costs by center id
  const directMap = new Map<string, number>()
  for (const dc of directCosts) {
    directMap.set(dc.cost_center_id, (directMap.get(dc.cost_center_id) ?? 0) + dc.amount)
  }

  const allocations = allocateOverhead(overheadAmount, costCenters, method)
  const allocationMap = new Map<string, { allocated_amount: number; weight: number }>()
  for (const a of allocations) {
    allocationMap.set(a.cost_center_id, a)
  }

  return costCenters.map(cc => {
    const direct_costs     = directMap.get(cc.id) ?? 0
    const alloc            = allocationMap.get(cc.id)
    const allocated_overhead = alloc?.allocated_amount ?? 0
    const total_cost       = direct_costs + allocated_overhead

    const cost_per_revenue_unit = cc.revenue_contribution === 0
      ? null
      : total_cost / cc.revenue_contribution

    const overhead_rate_pct = direct_costs === 0
      ? null
      : (allocated_overhead / direct_costs) * 100

    const allocation_share_pct = overheadAmount === 0
      ? 0
      : (allocated_overhead / overheadAmount) * 100

    return {
      cost_center_id:       cc.id,
      cost_center_name:     cc.name,
      direct_costs,
      allocated_overhead,
      total_cost,
      cost_per_revenue_unit,
      overhead_rate_pct,
      allocation_share_pct,
    }
  })
}

/**
 * computeOverheadRatio
 *
 * totalOverhead / totalDirectCosts × 100.
 * Returns null if totalDirectCosts === 0.
 */
export function computeOverheadRatio(
  totalOverhead: number,
  totalDirectCosts: number,
): number | null {
  if (totalDirectCosts === 0) return null
  return (totalOverhead / totalDirectCosts) * 100
}

/**
 * computeBreakevenRevenue
 *
 * fixedCosts / (1 - variableCostRatio).
 * Returns null if variableCostRatio >= 1 (contribution margin <= 0).
 */
export function computeBreakevenRevenue(
  fixedCosts: number,
  variableCostRatio: number, // 0-1, variable costs as fraction of revenue
): number | null {
  if (variableCostRatio >= 1) return null
  return fixedCosts / (1 - variableCostRatio)
}

/**
 * classifyOverheadLevel
 *
 * - null → 'normal' (no data)
 * - lean:     < 10%
 * - normal:   < 25%
 * - elevated: < 40%
 * - heavy:    < 60%
 * - critical: >= 60%
 */
export function classifyOverheadLevel(
  overheadRatioPct: number | null,
): 'lean' | 'normal' | 'elevated' | 'heavy' | 'critical' {
  if (overheadRatioPct === null) return 'normal'
  if (overheadRatioPct < 10)  return 'lean'
  if (overheadRatioPct < 25)  return 'normal'
  if (overheadRatioPct < 40)  return 'elevated'
  if (overheadRatioPct < 60)  return 'heavy'
  return 'critical'
}

/**
 * segregateCosts
 *
 * Splits expenses into fixed, variable, and semi-variable buckets.
 * Semi-variable = total - fixed - variable.
 * Percentages are based on total.
 */
export function segregateCosts(
  expenses: Array<{ category: string; amount: number }>,
  fixedCategories: string[],
  variableCategories: string[],
): {
  fixed_costs: number
  variable_costs: number
  semi_variable_costs: number
  fixed_pct: number
  variable_pct: number
  semi_variable_pct: number
  total: number
} {
  const fixedSet    = new Set(fixedCategories.map(c => c.toLowerCase()))
  const variableSet = new Set(variableCategories.map(c => c.toLowerCase()))

  let fixed_costs    = 0
  let variable_costs = 0
  let total          = 0

  for (const exp of expenses) {
    const key    = exp.category.toLowerCase()
    const amount = exp.amount
    total += amount
    if (fixedSet.has(key)) {
      fixed_costs += amount
    } else if (variableSet.has(key)) {
      variable_costs += amount
    }
  }

  const semi_variable_costs = total - fixed_costs - variable_costs
  const fixed_pct           = total > 0 ? (fixed_costs    / total) * 100 : 0
  const variable_pct        = total > 0 ? (variable_costs / total) * 100 : 0
  const semi_variable_pct   = total > 0 ? (semi_variable_costs / total) * 100 : 0

  return {
    fixed_costs,
    variable_costs,
    semi_variable_costs,
    fixed_pct,
    variable_pct,
    semi_variable_pct,
    total,
  }
}

/**
 * computeContributionMargin
 *
 * revenue - variableCosts. Can be negative.
 */
export function computeContributionMargin(
  revenue: number,
  variableCosts: number,
): number {
  return revenue - variableCosts
}

/**
 * computeContributionMarginRatio
 *
 * (revenue - variableCosts) / revenue × 100.
 * Returns null if revenue === 0.
 */
export function computeContributionMarginRatio(
  revenue: number,
  variableCosts: number,
): number | null {
  if (revenue === 0) return null
  return ((revenue - variableCosts) / revenue) * 100
}

/**
 * computeOperatingLeverageEffect
 *
 * revenueChangePct × (1 / (1 - cmr/100)).
 * Returns null if cmr is null or cmr >= 100.
 */
export function computeOperatingLeverageEffect(
  revenueChangePct: number,
  contributionMarginRatio: number | null,
): number | null {
  if (contributionMarginRatio === null) return null
  if (contributionMarginRatio >= 100)  return null
  return revenueChangePct * (1 / (1 - contributionMarginRatio / 100))
}

/**
 * identifyHighestOverheadCenter
 *
 * Returns the AllocationResult with the highest overhead_rate_pct.
 * Null rates are excluded. Returns null if no results or all rates are null.
 */
export function identifyHighestOverheadCenter(
  results: AllocationResult[],
): AllocationResult | null {
  if (results.length === 0) return null

  let highest: AllocationResult | null = null
  for (const r of results) {
    if (r.overhead_rate_pct === null) continue
    if (highest === null || r.overhead_rate_pct > (highest.overhead_rate_pct ?? -Infinity)) {
      highest = r
    }
  }

  return highest
}

/**
 * computeTargetCostReduction
 *
 * Target costs = revenue × (1 - targetMarginPct/100).
 * Reduction needed = currentTotalCost - targetCosts.
 * Returns negative if already meeting target (surplus).
 * Returns null if revenue === 0.
 */
export function computeTargetCostReduction(
  currentTotalCost: number,
  targetMarginPct: number,
  revenue: number,
): number | null {
  if (revenue === 0) return null
  const targetCosts = revenue * (1 - targetMarginPct / 100)
  return currentTotalCost - targetCosts
}

/**
 * generateAllocationNarrative
 *
 * Returns a Turkish summary string based on overhead level and context.
 */
export function generateAllocationNarrative(
  overheadLevel: ReturnType<typeof classifyOverheadLevel>,
  method: AllocationMethod,
  overheadRatioPct: number | null,
  highestOverheadCenter: AllocationResult | null,
): string {
  switch (overheadLevel) {
    case 'lean':
      return 'Genel gider oranı düşük — verimli maliyet yapısı.'

    case 'normal':
      return 'Genel gider oranı normal seviyelerde — mevcut yapı sürdürülebilir.'

    case 'elevated':
      return 'Genel gider oranı yükselmiş — optimizasyon fırsatları değerlendirilmeli.'

    case 'heavy':
      return 'Yüksek genel gider oranı — maliyet baskısı karlılığı etkiliyor.'

    case 'critical':
      return 'Kritik: Genel gider kontrolden çıkmış — acil müdahale gerekiyor.'
  }
}

// ── Report type ───────────────────────────────────────────────────────────────

export interface CostAllocationReport {
  period_label: string
  allocation_method: AllocationMethod
  total_direct_costs: number
  total_overhead: number
  overhead_ratio_pct: number | null
  overhead_level: ReturnType<typeof classifyOverheadLevel>
  allocation_results: AllocationResult[]
  cost_segregation: ReturnType<typeof segregateCosts>
  breakeven_revenue: number | null
  contribution_margin: number | null
  contribution_margin_ratio: number | null
  target_cost_reduction: number | null   // to achieve 15% margin
  highest_overhead_center: AllocationResult | null
  narrative: string
}

// ── Fixed/variable category sets ──────────────────────────────────────────────

const FIXED_CATEGORIES    = ['salary', 'rent', 'software', 'utilities', 'insurance']
const VARIABLE_CATEGORIES = ['cogs', 'logistics', 'commission', 'marketing']

// ── Helper: current month range ───────────────────────────────────────────────

function currentMonthRange(): { from: string; to: string; label: string } {
  const now     = new Date()
  const year    = now.getFullYear()
  const month   = now.getMonth() + 1
  const from    = `${year}-${String(month).padStart(2, '0')}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const to      = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  const label   = `${year}-${String(month).padStart(2, '0')}`
  return { from, to, label }
}

// ── Service class ─────────────────────────────────────────────────────────────

export class CostAllocationService {
  constructor(private readonly supabase: SupabaseClient<any>) {} // eslint-disable-line @typescript-eslint/no-explicit-any

  async getReport(
    companyId: string,
    method: AllocationMethod = 'revenue_based',
  ): Promise<CostAllocationReport> {
    const range = currentMonthRange()

    // Parallel: expenses + sales
    const [expResult, salesResult] = await Promise.allSettled([
      this.supabase
        .from('expenses')
        .select('expense_type, amount_try')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .gte('expense_date', range.from)
        .lte('expense_date', range.to),

      this.supabase
        .from('sales')
        .select('total_try')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .gte('sale_date', range.from)
        .lte('sale_date', range.to)
        .not('payment_status', 'eq', 'cancelled'),
    ])

    // ── Expenses ──────────────────────────────────────────────────────────────

    type ExpRow = { expense_type: string | null; amount_try: number }

    const expRows: ExpRow[] = expResult.status === 'fulfilled'
      ? ((expResult.value?.data ?? []) as ExpRow[])
      : []

    // Aggregate by type
    const byType = new Map<string, number>()
    for (const row of expRows) {
      const key = String(row.expense_type ?? 'other').toLowerCase()
      byType.set(key, (byType.get(key) ?? 0) + Number(row.amount_try ?? 0))
    }

    const expensesForSegregation = Array.from(byType.entries()).map(([category, amount]) => ({
      category,
      amount,
    }))

    // ── Revenue ───────────────────────────────────────────────────────────────

    let revenue = 0
    if (salesResult.status === 'fulfilled' && salesResult.value?.data) {
      for (const row of salesResult.value.data as Array<{ total_try: number }>) {
        revenue += Number(row.total_try ?? 0)
      }
    }

    // ── Cost segregation ──────────────────────────────────────────────────────

    const costSegregation = segregateCosts(
      expensesForSegregation,
      FIXED_CATEGORIES,
      VARIABLE_CATEGORIES,
    )

    // ── Cost centers ──────────────────────────────────────────────────────────
    // Try to load cost_centers table; fall back to synthetic centers from expense types

    let costCenters: CostCenter[] = []
    let directCostsData: DirectCost[] = []
    let totalOverhead = costSegregation.fixed_costs + costSegregation.semi_variable_costs

    const ccResult = await this.supabase
      .from('cost_centers')
      .select('id, name, revenue_contribution, headcount, activity_units')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .limit(50)

    if (ccResult.error || !ccResult.data || ccResult.data.length === 0) {
      // Synthetic: create one cost center per non-overhead expense type
      const syntheticTypes = expensesForSegregation.filter(e => {
        const cat = e.category.toLowerCase()
        return VARIABLE_CATEGORIES.includes(cat) || (!FIXED_CATEGORIES.includes(cat) && !VARIABLE_CATEGORIES.includes(cat))
      })

      if (syntheticTypes.length === 0) {
        // Create a single default cost center
        costCenters = [{
          id:                   'default',
          name:                 'Genel',
          revenue_contribution: revenue,
          headcount:            1,
          activity_units:       1,
        }]
        directCostsData = expensesForSegregation.map(e => ({
          cost_center_id: 'default',
          category:       e.category,
          amount:         e.amount,
        }))
      } else {
        // Create a cost center per expense type
        costCenters = syntheticTypes.map(e => ({
          id:                   e.category,
          name:                 e.category.charAt(0).toUpperCase() + e.category.slice(1),
          revenue_contribution: revenue / syntheticTypes.length,
          headcount:            1,
          activity_units:       e.amount,
        }))
        directCostsData = syntheticTypes.map(e => ({
          cost_center_id: e.category,
          category:       e.category,
          amount:         e.amount,
        }))
        // Re-compute overhead from fixed categories only
        totalOverhead = costSegregation.fixed_costs
      }
    } else {
      costCenters = (ccResult.data as Array<{
        id: string
        name: string
        revenue_contribution: number
        headcount: number
        activity_units: number
      }>).map(row => ({
        id:                   row.id,
        name:                 row.name,
        revenue_contribution: Number(row.revenue_contribution ?? 0),
        headcount:            Number(row.headcount ?? 0),
        activity_units:       Number(row.activity_units ?? 0),
      }))

      // Load direct costs per cost center
      const dcResult = await this.supabase
        .from('expenses')
        .select('cost_center_id, expense_type, amount_try')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .gte('expense_date', range.from)
        .lte('expense_date', range.to)
        .not('cost_center_id', 'is', null)

      if (dcResult.data) {
        for (const row of dcResult.data as Array<{
          cost_center_id: string
          expense_type: string | null
          amount_try: number
        }>) {
          if (row.cost_center_id) {
            directCostsData.push({
              cost_center_id: row.cost_center_id,
              category:       String(row.expense_type ?? 'other'),
              amount:         Number(row.amount_try ?? 0),
            })
          }
        }
      }
    }

    // ── Compute allocation ────────────────────────────────────────────────────

    const allocationResults = computeFullCostAllocation(
      costCenters,
      directCostsData,
      totalOverhead,
      method,
    )

    const total_direct_costs = allocationResults.reduce((s, r) => s + r.direct_costs, 0)

    const overhead_ratio_pct  = computeOverheadRatio(totalOverhead, total_direct_costs)
    const overhead_level      = classifyOverheadLevel(overhead_ratio_pct)

    // Contribution margin
    const variableCostsTotal   = costSegregation.variable_costs
    const cm                   = computeContributionMargin(revenue, variableCostsTotal)
    const cmRatio              = computeContributionMarginRatio(revenue, variableCostsTotal)
    const variableCostRatio    = revenue > 0 ? variableCostsTotal / revenue : 0
    const breakeven_revenue    = computeBreakevenRevenue(costSegregation.fixed_costs, variableCostRatio)

    const currentTotalCost     = costSegregation.total
    const target_cost_reduction = computeTargetCostReduction(currentTotalCost, 15, revenue)

    const highest_overhead_center = identifyHighestOverheadCenter(allocationResults)

    const narrative = generateAllocationNarrative(
      overhead_level,
      method,
      overhead_ratio_pct,
      highest_overhead_center,
    )

    return {
      period_label:           range.label,
      allocation_method:      method,
      total_direct_costs,
      total_overhead:         totalOverhead,
      overhead_ratio_pct,
      overhead_level,
      allocation_results:     allocationResults,
      cost_segregation:       costSegregation,
      breakeven_revenue,
      contribution_margin:    cm,
      contribution_margin_ratio: cmRatio,
      target_cost_reduction,
      highest_overhead_center,
      narrative,
    }
  }
}
