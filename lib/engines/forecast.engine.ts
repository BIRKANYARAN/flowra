// Forecast Engine — 12-month strategic projection (3 scenarios)
// Pure function. Inputs: trailing 6-month averages + current debt schedule.

import { round2 } from '@/lib/calc'

// ── Debt Pressure Timeline ─────────────────────────────────────────────────────

export interface DebtPressurePeriod {
  month:            string   // YYYY-MM
  debt_service_try: number   // interest + scheduled_repayment
  net_income_try:   number   // projected net income for that month
  dsr:              number   // debt_service / max(1, net_income)
  status: 'healthy' | 'strained' | 'critical' | 'insolvent'
}

export interface DebtPressureTimeline {
  periods:           DebtPressurePeriod[]
  peak_dsr:          number
  peak_month:        string
  months_strained:   number
  months_critical:   number
  months_insolvent:  number
  clearance_month:   string | null  // first month where dsr < 0.3 after being strained
}

function dprStatus(dsr: number): DebtPressurePeriod['status'] {
  if (dsr < 0.30) return 'healthy'
  if (dsr < 0.50) return 'strained'
  if (dsr < 0.70) return 'critical'
  return 'insolvent'
}

function advanceYYYYMM(ym: string, n: number): string {
  let [y, m] = ym.split('-').map(Number)
  m += n
  while (m > 12) { m -= 12; y++ }
  while (m < 1)  { m += 12; y-- }
  return `${y}-${String(m).padStart(2, '0')}`
}

export function computeDebtPressureTimeline(params: {
  projectedMonthlyNetIncome: number[]
  monthlyDebtService: number[]
  startMonth: string
}): DebtPressureTimeline {
  const len = Math.max(params.projectedMonthlyNetIncome.length, params.monthlyDebtService.length)
  const periods: DebtPressurePeriod[] = []

  for (let i = 0; i < len; i++) {
    const net_income_try   = params.projectedMonthlyNetIncome[i] ?? 0
    const debt_service_try = params.monthlyDebtService[i]        ?? 0
    const dsr              = round2(debt_service_try / Math.max(1, net_income_try))
    periods.push({
      month: advanceYYYYMM(params.startMonth, i),
      debt_service_try,
      net_income_try,
      dsr,
      status: dprStatus(dsr),
    })
  }

  // Peak DSR
  let peak_dsr   = 0
  let peak_month = periods[0]?.month ?? params.startMonth
  for (const p of periods) {
    if (p.dsr > peak_dsr) { peak_dsr = p.dsr; peak_month = p.month }
  }

  const months_strained  = periods.filter(p => p.status === 'strained').length
  const months_critical  = periods.filter(p => p.status === 'critical').length
  const months_insolvent = periods.filter(p => p.status === 'insolvent').length

  // clearance_month: first healthy month AFTER at least one strained/critical/insolvent
  let wasStrained    = false
  let clearance_month: string | null = null
  for (const p of periods) {
    if (p.status !== 'healthy') { wasStrained = true }
    else if (wasStrained && !clearance_month) { clearance_month = p.month }
  }

  return { periods, peak_dsr, peak_month, months_strained, months_critical, months_insolvent, clearance_month }
}

// ── Seasonal Revenue Distribution ─────────────────────────────────────────────

export type RevenueModel = 'uniform' | 'seasonal' | 'custom'

export const SEASONAL_PRESETS = {
  retail_turkey: [0.06, 0.06, 0.08, 0.08, 0.09, 0.10, 0.09, 0.09, 0.09, 0.10, 0.08, 0.08],
  service_b2b:   [0.08, 0.08, 0.09, 0.09, 0.09, 0.08, 0.07, 0.07, 0.09, 0.09, 0.09, 0.08],
  uniform:       Array(12).fill(1 / 12) as number[],
}

export function distributeRevenue(
  totalAnnual: number,
  model: RevenueModel,
  monthlyWeights?: number[],
): number[] {
  if (model === 'custom') {
    if (!monthlyWeights || monthlyWeights.length !== 12) {
      throw new Error('distributeRevenue: custom model requires exactly 12 monthly weights')
    }
    const total = monthlyWeights.reduce((s, w) => s + w, 0)
    if (total === 0) {
      throw new Error('distributeRevenue: custom weights must not all be zero')
    }
    const normalized = monthlyWeights.map(w => w / total)
    return normalized.map(w => round2(totalAnnual * w))
  }

  const weights = model === 'seasonal' ? SEASONAL_PRESETS.retail_turkey : SEASONAL_PRESETS.uniform
  return weights.map(w => round2(totalAnnual * w))
}

// ── Three-Scenario Comparison ──────────────────────────────────────────────────

export interface ScenarioVariant {
  name:            'base' | 'optimistic' | 'pessimistic'
  multiplier:      number
  monthly_revenue: number[]
  monthly_net:     number[]
  runway_months:   number | null  // null = doesn't run out
  cumulative_net:  number
}

export function buildThreeScenarios(params: {
  baseMonthlyRevenue: number[]
  baseMonthlyExpenses: number[]
  taxRate: number
  growthFactor?:  number
  stressFactor?:  number
  initialCash?:   number
}): { base: ScenarioVariant; optimistic: ScenarioVariant; pessimistic: ScenarioVariant } {
  const growthFactor  = params.growthFactor  ?? 0.15
  const stressFactor  = params.stressFactor  ?? 0.20
  const initialCash   = params.initialCash   ?? 0

  function buildVariant(
    name: ScenarioVariant['name'],
    multiplier: number,
  ): ScenarioVariant {
    const monthly_revenue = params.baseMonthlyRevenue.map(r => round2(r * multiplier))
    const monthly_net: number[] = []
    let cash = initialCash
    let runway_months: number | null = null

    for (let i = 0; i < monthly_revenue.length; i++) {
      const rev  = monthly_revenue[i]
      const exp  = params.baseMonthlyExpenses[i] ?? 0
      const ebt  = round2(rev - exp)
      const tax  = ebt > 0 ? round2(ebt * params.taxRate) : 0
      const net  = round2(ebt - tax)
      monthly_net.push(net)
      cash = round2(cash + net)
      if (cash < 0 && runway_months === null) runway_months = i + 1
    }

    const cumulative_net = round2(monthly_net.reduce((s, n) => s + n, 0))
    return { name, multiplier, monthly_revenue, monthly_net, runway_months, cumulative_net }
  }

  return {
    base:        buildVariant('base',        1.0),
    optimistic:  buildVariant('optimistic',  1 + growthFactor),
    pessimistic: buildVariant('pessimistic', 1 - stressFactor),
  }
}

export interface MonthlyData {
  year:       number
  month:      number          // 1-12
  revenue:    number
  expenses:   number
  net_income: number
  cash_balance: number
}

export interface ForecastInputs {
  // Trailing averages (from last 6 months of actuals)
  avgMonthlyRevenue:  number
  avgMonthlyExpenses: number   // full opex (no debt service)

  // Current cash position
  currentCash: number

  // Monthly debt service (interest + scheduled repayments)
  monthlyDebtService: number

  // Scenario modifiers
  optimisticGrowthFactor:  number   // default 0.15 (+15% revenue)
  pessimisticStressFactor: number   // default 0.20 (-20% revenue)

  // Start month
  startYear:  number
  startMonth: number          // 1-12
}

export interface ForecastMonth {
  label:   string             // "Haz 2026"
  revenue: number
  net:     number
  cash:    number
}

export interface ForecastResult {
  base:        ForecastMonth[]
  optimistic:  ForecastMonth[]
  pessimistic: ForecastMonth[]
  summary: {
    base:        ScenarioSummary
    optimistic:  ScenarioSummary
    pessimistic: ScenarioSummary
  }
}

interface ScenarioSummary {
  totalRevenue:     number
  totalNet:         number
  endCash:          number
  runwayEndMonth:   string | null   // first month cash goes negative
  breakEvenMonth:   string | null   // first month net > 0 (for loss scenarios)
  recommendation:   string
}

const TR_MONTHS = ['Oca','Şub','Mar','Nis','May','Haz','Tem','Ağu','Eyl','Eki','Kas','Ara']

function monthLabel(year: number, month: number): string {
  return `${TR_MONTHS[month - 1]} ${year}`
}

function nextMonth(year: number, month: number): { year: number; month: number } {
  if (month === 12) return { year: year + 1, month: 1 }
  return { year, month: month + 1 }
}

function projectScenario(
  inputs: ForecastInputs,
  revenueMultiplier: number,
): ForecastMonth[] {
  const months: ForecastMonth[] = []
  let cash      = inputs.currentCash
  let { year, month } = { year: inputs.startYear, month: inputs.startMonth }

  for (let i = 0; i < 12; i++) {
    const revenue  = round2(inputs.avgMonthlyRevenue * revenueMultiplier)
    const expenses = round2(inputs.avgMonthlyExpenses + inputs.monthlyDebtService)
    const net      = round2(revenue - expenses)
    cash           = round2(cash + net)

    months.push({ label: monthLabel(year, month), revenue, net, cash })

    const next = nextMonth(year, month)
    year  = next.year
    month = next.month
  }

  return months
}

function summarize(months: ForecastMonth[], label: string): ScenarioSummary {
  const totalRevenue = round2(months.reduce((s, m) => s + m.revenue, 0))
  const totalNet     = round2(months.reduce((s, m) => s + m.net, 0))
  const endCash      = months[months.length - 1]?.cash ?? 0

  const runwayEndMonth = months.find(m => m.cash < 0)?.label ?? null

  const positiveNetIdx = months.findIndex(m => m.net > 0)
  const breakEvenMonth = positiveNetIdx >= 0 ? months[positiveNetIdx].label : null

  let recommendation: string
  if (runwayEndMonth) {
    recommendation = `${label} senaryoda ${runwayEndMonth} nakit tükeniyor`
  } else if (totalNet > 0) {
    recommendation = `${label} senaryoda yıl sonu net: ₺${abbrev(totalNet)}`
  } else {
    recommendation = `${label} senaryoda yıl sonu zarar: ₺${abbrev(Math.abs(totalNet))}`
  }

  return { totalRevenue, totalNet, endCash, runwayEndMonth, breakEvenMonth, recommendation }
}

export function computeForecast(inputs: ForecastInputs): ForecastResult {
  const base        = projectScenario(inputs, 1.0)
  const optimistic  = projectScenario(inputs, 1 + inputs.optimisticGrowthFactor)
  const pessimistic = projectScenario(inputs, 1 - inputs.pessimisticStressFactor)

  return {
    base,
    optimistic,
    pessimistic,
    summary: {
      base:        summarize(base,        'Baz'),
      optimistic:  summarize(optimistic,  'İyimser'),
      pessimistic: summarize(pessimistic, 'Kötümser'),
    },
  }
}

function abbrev(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `${(n / 1_000).toFixed(0)}K`
  return n.toFixed(0)
}

// ── Derive inputs from 6-month trailing monthly actuals ───────────────────

export interface TrailingMonthActual {
  revenue:  number
  expenses: number
}

export function buildForecastInputs(
  trailing6Months: TrailingMonthActual[],
  currentCash:     number,
  monthlyDebtService: number,
  startYear:  number,
  startMonth: number,
): ForecastInputs {
  const n = Math.max(trailing6Months.length, 1)
  const avgMonthlyRevenue  = round2(trailing6Months.reduce((s, m) => s + m.revenue,  0) / n)
  const avgMonthlyExpenses = round2(trailing6Months.reduce((s, m) => s + m.expenses, 0) / n)

  return {
    avgMonthlyRevenue,
    avgMonthlyExpenses,
    currentCash,
    monthlyDebtService,
    optimisticGrowthFactor:  0.15,
    pessimisticStressFactor: 0.20,
    startYear,
    startMonth,
  }
}
