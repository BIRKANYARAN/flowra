// Strategic Simulation Service — company-level multi-scenario projection
// Pure computation kernel + scenario recommendation logic. No DB access.
//
// Complements the existing product-level SimulationService.
// Use this for: "What happens to our P&L/cash over 12 months under different revenue assumptions?"
// vs product simulation: "If I sell X units of product Y at price Z, what is the P&L?"

import { round2 } from '@/lib/calc'
import { CORPORATE_TAX_RATE_TR } from '@/lib/services/finance-rules'
import { computeCorporateTax } from '@/lib/services/tax.service'

// ── Types ─────────────────────────────────────────────────────────────────────

export type RevenueModel = 'uniform' | 'seasonal'
export type PressureStatus = 'healthy' | 'strained' | 'critical' | 'insolvent'

export interface DebtTranche {
  label:              string
  monthly_interest:   number    // TRY
  monthly_repayment:  number    // principal repayment TRY/month
  remaining_months:   number    // 0 = infinite / no schedule
}

export interface BaseExpenseLine {
  category: string              // 'salary' | 'rent' | 'software' | 'marketing' | 'general' | ...
  amount_try: number            // monthly recurring amount
}

export interface StrategicScenarioInput {
  scenario_name:          string
  revenue_model:          RevenueModel
  target_annual_revenue:  number

  // For seasonal: 12 weights (any scale — normalized internally to sum to 12)
  monthly_weights?:       number[]

  // Expense baseline fetched from DB and passed in
  base_monthly_expenses:  BaseExpenseLine[]

  // Per-category override (replaces base amount for that category)
  expense_overrides?:     Record<string, number>

  // Partner debt tranches
  debt_tranches?:         DebtTranche[]

  // Monthly huzur hakkı (included in opex as 'compensation')
  monthly_compensation?:  number

  // Projection window
  period_months:          number          // 1-24
  start_month:            string          // YYYY-MM

  // Tax
  tax_rate?:              number          // default CORPORATE_TAX_RATE_TR
}

export interface StrategicMonthBreakdown {
  month:          string        // YYYY-MM
  label:          string        // "Haz 2026"
  revenue:        number
  gross_margin:   number        // revenue - implicit COGS (0 if no cost input)
  opex:           number        // salary + rent + software + marketing + general + compensation
  ebitda:         number
  interest:       number        // debt interest portion
  ebt:            number
  tax:            number
  net_income:     number
  debt_service:   number        // interest + principal repayments
  dsr:            number        // debt_service / max(1, revenue) — 0 if no debt
  pressure_status:PressureStatus
  cum_net:        number        // cumulative net income from month 0
}

export interface StrategicScenarioResult {
  scenario_name:    string
  total_revenue:    number
  total_opex:       number
  total_ebitda:     number
  total_interest:   number
  total_tax:        number
  total_net:        number
  total_debt_service: number
  avg_dsr:          number
  months:           StrategicMonthBreakdown[]
  runway_end_month: string | null   // first month cumulative net goes negative
  break_even_month: string | null   // first month net_income > 0 (for loss scenarios)
  recommendation:   string
}

export interface MultiScenarioResult {
  base:              StrategicScenarioResult
  optimistic:        StrategicScenarioResult
  pessimistic:       StrategicScenarioResult
  recommended:       'base' | 'optimistic' | 'pessimistic'
  recommendation_reason: string
}

// ── Turkish month labels ──────────────────────────────────────────────────────

const TR_MONTHS = ['Oca','Şub','Mar','Nis','May','Haz','Tem','Ağu','Eyl','Eki','Kas','Ara']

function buildMonthList(startYYYYMM: string, count: number): string[] {
  const months: string[] = []
  let [y, m] = startYYYYMM.split('-').map(Number)
  for (let i = 0; i < count; i++) {
    months.push(`${y}-${String(m).padStart(2, '0')}`)
    if (++m > 12) { m = 1; y++ }
  }
  return months
}

function monthLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  return `${TR_MONTHS[m - 1]} ${y}`
}

// ── Revenue distribution ──────────────────────────────────────────────────────

function distributeRevenue(
  annualRevenue: number,
  model: RevenueModel,
  weights: number[] | undefined,
  periodMonths: number,
  startIndex: number,   // 0-based month index within the year (0=Jan)
): number[] {
  if (model === 'uniform' || !weights || weights.length !== 12) {
    const monthly = round2(annualRevenue / 12)
    return Array(periodMonths).fill(monthly)
  }

  // Normalize weights so they sum to 12
  const total = weights.reduce((s, w) => s + w, 0)
  const normalized = total > 0 ? weights.map(w => (w / total) * 12) : Array(12).fill(1)

  const result: number[] = []
  for (let i = 0; i < periodMonths; i++) {
    const idx = (startIndex + i) % 12
    result.push(round2(annualRevenue * normalized[idx] / 12))
  }
  return result
}

// ── Expense calculation ───────────────────────────────────────────────────────

function resolveMonthlyExpenses(
  base: BaseExpenseLine[],
  overrides: Record<string, number> | undefined,
  compensation: number,
  revenueMultiplier: number = 1,
  expenseMultiplier: number = 1,
): number {
  const effectiveBase = base.map(line => ({
    ...line,
    amount_try: overrides?.[line.category] != null
      ? Number(overrides[line.category])
      : line.amount_try,
  }))

  const baseTotal = effectiveBase.reduce((s, l) => s + l.amount_try, 0)
  return round2((baseTotal + compensation) * expenseMultiplier)
}

// ── Debt service ──────────────────────────────────────────────────────────────

function monthlyDebtService(tranches: DebtTranche[], monthIndex: number): { interest: number; repayment: number } {
  let interest   = 0
  let repayment  = 0
  for (const t of tranches) {
    if (t.remaining_months <= 0 || monthIndex < t.remaining_months) {
      interest  += t.monthly_interest
      repayment += t.monthly_repayment
    }
  }
  return { interest: round2(interest), repayment: round2(repayment) }
}

function pressureFromDsr(dsr: number): PressureStatus {
  if (dsr === 0)    return 'healthy'
  if (dsr < 0.30)   return 'healthy'
  if (dsr < 0.50)   return 'strained'
  if (dsr < 0.80)   return 'critical'
  return 'insolvent'
}

// ── Core computation ──────────────────────────────────────────────────────────

export function computeStrategicScenario(
  input: StrategicScenarioInput,
  revenueMultiplier: number = 1,
  expenseMultiplier: number = 1,
  scenarioName?: string,
): StrategicScenarioResult {
  const taxRate    = input.tax_rate ?? CORPORATE_TAX_RATE_TR
  const tranches   = input.debt_tranches ?? []
  const compensation = input.monthly_compensation ?? 0
  const monthList  = buildMonthList(input.start_month, input.period_months)
  const startMonth = Number(input.start_month.split('-')[1]) - 1  // 0-based

  const adjustedRevenue = round2(input.target_annual_revenue * revenueMultiplier)
  const revenues = distributeRevenue(adjustedRevenue, input.revenue_model, input.monthly_weights, input.period_months, startMonth)

  let cumNet = 0
  let runwayEndMonth: string | null = null
  let breakEvenMonth: string | null = null

  const months: StrategicMonthBreakdown[] = monthList.map((ym, i) => {
    const revenue  = revenues[i] ?? 0
    const opex     = resolveMonthlyExpenses(input.base_monthly_expenses, input.expense_overrides, compensation, revenueMultiplier, expenseMultiplier)
    const ebitda   = round2(revenue - opex)
    const { interest, repayment } = monthlyDebtService(tranches, i)
    const debtSvc  = round2(interest + repayment)
    const ebt      = round2(ebitda - interest)
    // Scenario corporate tax via the single kernel (EBT-based projection estimate).
    const tax      = computeCorporateTax({
      revenue_try: ebt, cost_try: 0, deductible_expenses_try: 0, rate_percent: taxRate,
    }).tax_try
    const net      = round2(ebt - tax)
    const dsr      = revenue > 0 ? round2(debtSvc / revenue) : (debtSvc > 0 ? 1 : 0)

    cumNet = round2(cumNet + net)
    if (cumNet < 0 && !runwayEndMonth) runwayEndMonth = ym
    if (net > 0 && !breakEvenMonth)    breakEvenMonth = ym

    return {
      month:           ym,
      label:           monthLabel(ym),
      revenue,
      gross_margin:    revenue,  // strategic: no COGS split
      opex,
      ebitda,
      interest,
      ebt,
      tax,
      net_income:      net,
      debt_service:    debtSvc,
      dsr,
      pressure_status: pressureFromDsr(dsr),
      cum_net:         cumNet,
    }
  })

  const totalRevenue    = round2(months.reduce((s, m) => s + m.revenue, 0))
  const totalOpex       = round2(months.reduce((s, m) => s + m.opex, 0))
  const totalEbitda     = round2(months.reduce((s, m) => s + m.ebitda, 0))
  const totalInterest   = round2(months.reduce((s, m) => s + m.interest, 0))
  const totalTax        = round2(months.reduce((s, m) => s + m.tax, 0))
  const totalNet        = round2(months.reduce((s, m) => s + m.net_income, 0))
  const totalDebtSvc    = round2(months.reduce((s, m) => s + m.debt_service, 0))
  const avgDsr          = totalRevenue > 0 ? round2(totalDebtSvc / totalRevenue) : 0

  const name = scenarioName ?? input.scenario_name

  let recommendation: string
  if (runwayEndMonth) {
    recommendation = `${name}: ${runwayEndMonth} ayında nakit tükeniyor — gelir veya finansman gerekiyor`
  } else if (totalNet > 0) {
    recommendation = `${name}: yıl sonu net kâr ₺${abbrev(totalNet)} — sürdürülebilir`
  } else {
    recommendation = `${name}: yıl sonu zarar ₺${abbrev(Math.abs(totalNet))} — gider optimizasyonu önerilir`
  }

  return {
    scenario_name:    name,
    total_revenue:    totalRevenue,
    total_opex:       totalOpex,
    total_ebitda:     totalEbitda,
    total_interest:   totalInterest,
    total_tax:        totalTax,
    total_net:        totalNet,
    total_debt_service: totalDebtSvc,
    avg_dsr:          avgDsr,
    months,
    runway_end_month: runwayEndMonth,
    break_even_month: breakEvenMonth,
    recommendation,
  }
}

// ── Multi-scenario ─────────────────────────────────────────────────────────────

export function computeMultiScenario(input: StrategicScenarioInput): MultiScenarioResult {
  const base        = computeStrategicScenario(input, 1.00, 1.00, 'Baz')
  const optimistic  = computeStrategicScenario(input, 1.15, 0.95, 'İyimser')
  const pessimistic = computeStrategicScenario(input, 0.80, 1.10, 'Kötümser')

  // Recommendation: highest net with runway > 6 months AND avg_dsr < 0.50
  const candidates: Array<{ key: 'base' | 'optimistic' | 'pessimistic'; s: StrategicScenarioResult }> = [
    { key: 'optimistic',  s: optimistic },
    { key: 'base',        s: base },
    { key: 'pessimistic', s: pessimistic },
  ]

  const viable = candidates.filter(c => {
    const hasRunway = c.s.runway_end_month === null
    const dsrOk     = c.s.avg_dsr < 0.50
    return hasRunway && dsrOk
  })

  const best = viable.length > 0
    ? viable.sort((a, b) => b.s.total_net - a.s.total_net)[0]
    : candidates.sort((a, b) => b.s.total_net - a.s.total_net)[0]

  const scenarioLabels: Record<string, string> = { base: 'Baz', optimistic: 'İyimser', pessimistic: 'Kötümser' }
  const reason = viable.length > 0
    ? `${scenarioLabels[best.key]} senaryo önerilir — yeterli nakit ve DSR < %50 koşullarını sağlıyor (Net: ₺${abbrev(best.s.total_net)})`
    : `Tüm senaryolar risk taşıyor — ${scenarioLabels[best.key]} senaryosu en az zararlı (Net: ₺${abbrev(best.s.total_net)})`

  return {
    base,
    optimistic,
    pessimistic,
    recommended:          best.key,
    recommendation_reason: reason,
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function abbrev(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `${(n / 1_000).toFixed(0)}K`
  return n.toFixed(0)
}

// ── Default seasonal weights (Turkey retail pattern: Q4 peak) ─────────────────

export const SEASONAL_WEIGHTS_DEFAULT: number[] = [
  0.7, 0.7, 0.9, 0.9, 1.0, 1.0,   // Jan–Jun (below avg summer)
  1.1, 1.1, 1.0, 1.1, 1.3, 1.5,   // Jul–Dec (Q4 peak)
]
