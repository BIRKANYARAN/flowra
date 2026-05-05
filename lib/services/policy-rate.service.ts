// ── Policy Rate Service ───────────────────────────────────────────────────────
//
// Central bank policy rates for carrying cost calculation:
//   TRY → TCMB (1-week repo rate)
//   USD → FED  (federal funds target rate)
//   EUR → ECB  (main refinancing rate)
//
// All rates stored in the global `policy_rates` table (no user_id).
//
// ARCHITECTURE:
//   - DB-ONLY lookup functions (used by pages, APIs, simulation, catalog)
//   - Scheduled fetch functions (used ONLY by /api/policy-rates POST job)
//   - NO runtime external API calls from any UI-facing code path
//
// Public DB-only API:
//   getPolicyRate(currency, date)
//   getCompoundedCarry(currency, startDate, endDate)
//   computeMultiCurrencyCost(...)
//   getAllCurrentRates()
//
// Scheduled-only API (external HTTP calls):
//   fetchAndStorePolicyRates()
// ──────────────────────────────────────────────────────────────────────────────

import { createClient } from '@/lib/supabase-server'
import { safeSystemQuery } from '@/lib/admin-db'
import type { Currency } from '@/types'

// ── Types ────────────────────────────────────────────────────────────────────

export interface PolicyRate {
  currency:    string
  rate_date:   string
  annual_rate: number
  source:      string
}

export interface CarryResult {
  factor:     number   // e.g. 1.50 means 50% total carry
  annualized: number   // effective annual rate used
  days:       number
}

export interface MultiCurrencyCost {
  real_cost_try: number
  real_cost_usd: number
  real_cost_eur: number
}

// ═══════════════════════════════════════════════════════════════════════════════
// DB-ONLY FUNCTIONS — Safe for use in any page/API/component
// These NEVER call external APIs. They only read from the policy_rates table.
// ═══════════════════════════════════════════════════════════════════════════════

// ── Get policy rate for a currency on or before a given date ─────────────────
// This is the core lookup: "what was the policy rate for TRY on 2025-01-15?"
// Uses: SELECT ... WHERE currency = ? AND rate_date <= ? ORDER BY rate_date DESC LIMIT 1

export async function getPolicyRate(currency: Currency | string, date: string): Promise<PolicyRate | null> {
  const supabase = createClient()

  // Primary: rate on or before the requested date
  const { data } = await supabase
    .from('policy_rates')
    .select('currency, rate_date, annual_rate, source')
    .eq('currency', currency)
    .lte('rate_date', date)
    .order('rate_date', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (data) {
    return {
      currency: data.currency as string,
      rate_date: data.rate_date as string,
      annual_rate: Number(data.annual_rate),
      source: data.source as string,
    }
  }

  // Fallback: latest available rate for this currency (any date)
  const { data: fallback } = await supabase
    .from('policy_rates')
    .select('currency, rate_date, annual_rate, source')
    .eq('currency', currency)
    .order('rate_date', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (fallback) {
    return {
      currency: fallback.currency as string,
      rate_date: fallback.rate_date as string,
      annual_rate: Number(fallback.annual_rate),
      source: fallback.source as string,
    }
  }

  return null
}

// ── Safe wrapper: guaranteed non-null result ─────────────────────────────────
// Returns rate=0 if absolutely no data exists (seed data should prevent this).

export async function getPolicyRateSafe(currency: Currency | string, date: string): Promise<PolicyRate> {
  const result = await getPolicyRate(currency, date)
  return result ?? {
    currency: String(currency),
    rate_date: date,
    annual_rate: 0,
    source: 'fallback_zero',
  }
}

// ── Get latest rates for all 3 currencies ────────────────────────────────────

export async function getAllCurrentRates(): Promise<{
  TRY: PolicyRate
  USD: PolicyRate
  EUR: PolicyRate
}> {
  const today = new Date().toISOString().slice(0, 10)
  const [tryRate, usdRate, eurRate] = await Promise.all([
    getPolicyRateSafe('TRY', today),
    getPolicyRateSafe('USD', today),
    getPolicyRateSafe('EUR', today),
  ])
  return { TRY: tryRate, USD: usdRate, EUR: eurRate }
}

// ── Get rate series for a currency ───────────────────────────────────────────

export async function getPolicyRateSeries(currency: Currency | string, limit = 20): Promise<PolicyRate[]> {
  const supabase = createClient()

  const { data } = await supabase
    .from('policy_rates')
    .select('currency, rate_date, annual_rate, source')
    .eq('currency', currency)
    .order('rate_date', { ascending: false })
    .limit(limit)

  return (data ?? []).map(r => ({
    currency: r.currency as string,
    rate_date: r.rate_date as string,
    annual_rate: Number(r.annual_rate),
    source: r.source as string,
  }))
}

// ── Compute compounded carry factor ──────────────────────────────────────────
//
// Given a currency and a date range [startDate, endDate], compute the total
// compounding factor using the policy rate series for that currency.
//
// If the rate changes during the holding period (e.g., TCMB cuts from 50% to 45%),
// each sub-period uses its own rate.
//
// Formula per sub-period: sub_factor = 1 + (annual_rate / 100) * (sub_days / 365)
// Total: product of all sub_factors
//
// Failsafe: if no rates exist, returns factor=1 (no carry).

export async function getCompoundedCarry(
  currency: Currency | string,
  startDate: string,
  endDate: string,
): Promise<CarryResult> {
  const start = new Date(startDate)
  const end   = new Date(endDate)
  const totalDays = Math.max(0, Math.round((end.getTime() - start.getTime()) / 86_400_000))

  if (totalDays === 0) return { factor: 1, annualized: 0, days: 0 }

  // Fetch all rate entries on or before endDate for this currency
  const supabase = createClient()
  const { data: rates } = await supabase
    .from('policy_rates')
    .select('rate_date, annual_rate')
    .eq('currency', currency)
    .lte('rate_date', endDate)
    .order('rate_date', { ascending: true })

  const rateHistory = (rates ?? []).map(r => ({
    date: r.rate_date as string,
    rate: Number(r.annual_rate),
  }))

  // Failsafe: no rate data → no carry
  if (rateHistory.length === 0) {
    return { factor: 1, annualized: 0, days: totalDays }
  }

  // Find the rate that was active at startDate (last rate on or before startDate)
  let activeRate = 0
  for (const r of rateHistory) {
    if (r.date <= startDate) activeRate = r.rate
  }
  // If no rate before startDate, use earliest available
  if (activeRate === 0) {
    activeRate = rateHistory[0].rate
  }

  // Build sub-periods: each rate change during [start, end] starts a new period
  const periods: Array<{ startDay: Date; endDay: Date; rate: number }> = []
  let periodStart = start

  const rateChanges = rateHistory.filter(r => {
    const d = new Date(r.date)
    return d > start && d <= end
  })

  for (const change of rateChanges) {
    const changeDate = new Date(change.date)
    periods.push({ startDay: periodStart, endDay: changeDate, rate: activeRate })
    periodStart = changeDate
    activeRate = change.rate
  }

  // Final period: from last rate change (or start) to end
  periods.push({ startDay: periodStart, endDay: end, rate: activeRate })

  // Compute compounded factor
  let factor = 1
  for (const p of periods) {
    const days = Math.max(0, Math.round((p.endDay.getTime() - p.startDay.getTime()) / 86_400_000))
    if (days > 0) {
      factor *= (1 + (p.rate / 100) * (days / 365))
    }
  }

  // Effective annualized rate
  const annualized = totalDays > 0
    ? ((factor - 1) / (totalDays / 365)) * 100
    : 0

  return {
    factor: Math.round(factor * 10000) / 10000,
    annualized: Math.round(annualized * 100) / 100,
    days: totalDays,
  }
}

// ── Compute real cost in all 3 currencies for a stock lot ────────────────────
//
// Given entry snapshot costs and the sale date, apply currency-specific carry
// to each currency independently.
//
// RULE: NEVER convert TRY→USD using today's FX for cost.
//       Each currency's carry uses its own central bank rate.

export async function computeMultiCurrencyCost(
  entryCostTry: number,
  entryCostUsd: number | null,
  entryCostEur: number | null,
  entryFxUsdTry: number,
  entryFxEurTry: number,
  entryDate: string,
  saleDate: string,
): Promise<MultiCurrencyCost> {
  const costTry = entryCostTry || 0
  const costUsd = entryCostUsd ?? (entryFxUsdTry > 0 ? costTry / entryFxUsdTry : 0)
  const costEur = entryCostEur ?? (entryFxEurTry > 0 ? costTry / entryFxEurTry : 0)

  const [carryTry, carryUsd, carryEur] = await Promise.all([
    getCompoundedCarry('TRY', entryDate, saleDate),
    getCompoundedCarry('USD', entryDate, saleDate),
    getCompoundedCarry('EUR', entryDate, saleDate),
  ])

  return {
    real_cost_try: Math.round(costTry * carryTry.factor * 100) / 100,
    real_cost_usd: Math.round(costUsd * carryUsd.factor * 100) / 100,
    real_cost_eur: Math.round(costEur * carryEur.factor * 100) / 100,
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SCHEDULED FETCH FUNCTIONS — Used ONLY by the /api/policy-rates POST endpoint
// These make external HTTP calls to central bank APIs.
// NEVER import or call these from pages, components, or UI-facing APIs.
// ═══════════════════════════════════════════════════════════════════════════════

async function fetchTCMBRate(): Promise<{ rate: number; date: string } | null> {
  try {
    const res = await fetch(
      'https://evds2.tcmb.gov.tr/service/evds/series=TP.PF.HP01&startDate=01-01-2024&endDate=31-12-2026&type=json',
      { headers: { 'Accept': 'application/json' }, signal: AbortSignal.timeout(8000) }
    )
    if (!res.ok) return null
    const data = await res.json()
    const items = data?.items
    if (!Array.isArray(items) || items.length === 0) return null
    const last = items[items.length - 1]
    const dateStr = last?.Tarih as string | undefined
    const rateVal = parseFloat(last?.['TP_PF_HP01'] ?? last?.['TP.PF.HP01'] ?? '0')
    if (!dateStr || rateVal <= 0) return null
    const [d, m, y] = dateStr.split('-')
    return { rate: rateVal, date: `${y}-${m}-${d}` }
  } catch { return null }
}

async function fetchFEDRate(): Promise<{ rate: number; date: string } | null> {
  try {
    const res = await fetch(
      'https://api.stlouisfed.org/fred/series/observations?series_id=DFEDTARU&sort_order=desc&limit=1&file_type=json&api_key=DEMO_KEY',
      { signal: AbortSignal.timeout(8000) }
    )
    if (!res.ok) return null
    const data = await res.json()
    const obs = data?.observations
    if (!Array.isArray(obs) || obs.length === 0) return null
    const last = obs[0]
    const rate = parseFloat(last?.value ?? '0')
    const date = last?.date as string | undefined
    if (rate <= 0 || !date) return null
    return { rate, date }
  } catch { return null }
}

async function fetchECBRate(): Promise<{ rate: number; date: string } | null> {
  try {
    const res = await fetch(
      'https://data.ecb.europa.eu/data-detail/FM.B.U2.EUR.4F.KR.MRR_FR.LEV?sortBy=date&sortOrder=desc',
      { headers: { 'Accept': 'application/json' }, signal: AbortSignal.timeout(8000) }
    )
    if (!res.ok) return null
    const text = await res.text()
    try {
      const data = JSON.parse(text)
      const datasets = data?.dataSets
      if (Array.isArray(datasets) && datasets.length > 0) {
        const series = datasets[0]?.series
        const firstKey = Object.keys(series ?? {})[0]
        if (firstKey) {
          const observations = series[firstKey]?.observations
          const obsKeys = Object.keys(observations ?? {}).sort((a, b) => Number(b) - Number(a))
          if (obsKeys.length > 0) {
            const lastObs = observations[obsKeys[0]]
            const rate = parseFloat(lastObs?.[0] ?? '0')
            if (rate > 0) {
              const dims = data?.structure?.dimensions?.observation
              const timeDim = dims?.find((d: { id: string }) => d.id === 'TIME_PERIOD')
              const dateValue = timeDim?.values?.[Number(obsKeys[0])]?.id as string | undefined
              return { rate, date: dateValue ?? new Date().toISOString().slice(0, 10) }
            }
          }
        }
      }
    } catch { /* ECB format unstable */ }
    return null
  } catch { return null }
}

async function storeRate(currency: string, rate: number, date: string, source: string): Promise<void> {
  await safeSystemQuery('policy_rates')
    .upsert(
      { currency, annual_rate: rate, rate_date: date, source, fetched_at: new Date().toISOString() },
      { onConflict: 'currency,rate_date' }
    )
}

/** Scheduled job: fetch from all 3 central banks and store in DB.
 *  Call this from /api/policy-rates POST or a cron job. NEVER from UI code. */
export async function fetchAndStorePolicyRates(): Promise<{
  try_rate: PolicyRate | null
  usd_rate: PolicyRate | null
  eur_rate: PolicyRate | null
}> {
  const [tcmb, fed, ecb] = await Promise.allSettled([
    fetchTCMBRate(),
    fetchFEDRate(),
    fetchECBRate(),
  ])

  const results = {
    try_rate: null as PolicyRate | null,
    usd_rate: null as PolicyRate | null,
    eur_rate: null as PolicyRate | null,
  }

  if (tcmb.status === 'fulfilled' && tcmb.value) {
    await storeRate('TRY', tcmb.value.rate, tcmb.value.date, 'tcmb')
    results.try_rate = { currency: 'TRY', rate_date: tcmb.value.date, annual_rate: tcmb.value.rate, source: 'tcmb' }
  }
  if (fed.status === 'fulfilled' && fed.value) {
    await storeRate('USD', fed.value.rate, fed.value.date, 'fed')
    results.usd_rate = { currency: 'USD', rate_date: fed.value.date, annual_rate: fed.value.rate, source: 'fed' }
  }
  if (ecb.status === 'fulfilled' && ecb.value) {
    await storeRate('EUR', ecb.value.rate, ecb.value.date, 'ecb')
    results.eur_rate = { currency: 'EUR', rate_date: ecb.value.date, annual_rate: ecb.value.rate, source: 'ecb' }
  }

  return results
}
