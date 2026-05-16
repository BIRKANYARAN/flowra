// Forecast Engine — 12-month strategic projection (3 scenarios)
// Pure function. Inputs: trailing 6-month averages + current debt schedule.

import { round2 } from '@/lib/calc'

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
