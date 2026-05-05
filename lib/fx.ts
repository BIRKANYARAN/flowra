// ── FX Service ────────────────────────────────────────────────────────────────
// Fetches TRY exchange rates from TCMB (Turkish Central Bank).
//
// TCMB URL patterns:
//   today.xml                          → current business day (may 404 on weekends/holidays)
//   /kurlar/YYYYMM/DDMMYYYY.xml        → specific date archive
//
// Resolution order:
//   1. today.xml
//   2. Previous business days (up to 7 days back) via date archive
//   3. Most recent row in fx_rates DB cache
//   4. 1:1 fallback (signals FX unavailable)
//
// fx_rates table: global, no user_id, open RLS policy.

import { createClient } from '@/lib/supabase-server'
import { safeSystemQuery } from '@/lib/admin-db'
import type { FxSnapshot } from '@/types'

const TCMB_BASE   = 'https://www.tcmb.gov.tr/kurlar'
const TCMB_TODAY  = `${TCMB_BASE}/today.xml`

// ── XML parser ────────────────────────────────────────────────────────────────

function parseTcmbXml(xml: string): { usd: number; eur: number } | null {
  if (!xml || xml.trim().length === 0) return null

  function parseRate(currencyCode: string): number | null {
    const blockRe = new RegExp(
      `<Currency[^>]+Kod=["']${currencyCode}["'][^>]*>([\\s\\S]*?)</Currency>`,
      'i'
    )
    const block = xml.match(blockRe)
    if (!block) return null
    const m = block[1].match(/<ForexBuying>([\d.,]+)<\/ForexBuying>/i)
    if (!m) return null
    const value = parseFloat(m[1].replace(',', '.'))
    return isFinite(value) && value > 0 ? value : null
  }

  const usd = parseRate('USD')
  const eur = parseRate('EUR')
  if (!usd || !eur) return null
  return { usd, eur }
}

// ── Fetch a single TCMB URL ───────────────────────────────────────────────────

async function fetchTcmbUrl(url: string): Promise<{ usd: number; eur: number } | null> {
  try {
    const res = await fetch(url, {
      cache: 'no-store',
      headers: { Accept: 'application/xml, text/xml, */*' },
    })
    if (!res.ok) return null
    const xml = await res.text()
    return parseTcmbXml(xml)
  } catch {
    return null
  }
}

// ── Build TCMB archive URL for a given date ───────────────────────────────────
// Format: /kurlar/YYYYMM/DDMMYYYY.xml

function tcmbArchiveUrl(date: Date): string {
  const dd   = String(date.getDate()).padStart(2, '0')
  const mm   = String(date.getMonth() + 1).padStart(2, '0')
  const yyyy = String(date.getFullYear())
  return `${TCMB_BASE}/${yyyy}${mm}/${dd}${mm}${yyyy}.xml`
}

// ── Subtract days from a date ─────────────────────────────────────────────────

function subtractDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() - days)
  return d
}

// ── Public: fetch today OR last business day (up to 7 days back) ─────────────

export interface TcmbResult {
  usd:    number
  eur:    number
  source: 'tcmb_today' | 'tcmb_last_business_day'
  date:   string   // ISO date of the rate
}

export async function fetchTcmbRates(): Promise<{ usd: number; eur: number } | null> {
  // Simple today-only fetch used by proforma snapshot helper
  return fetchTcmbUrl(TCMB_TODAY)
}

export async function fetchTcmbWithFallback(): Promise<TcmbResult | null> {
  // 1. Try today.xml first
  const todayResult = await fetchTcmbUrl(TCMB_TODAY)
  if (todayResult) {
    return {
      ...todayResult,
      source: 'tcmb_today',
      date:   new Date().toISOString().slice(0, 10),
    }
  }

  // 2. Walk back up to 7 calendar days to find the last business day
  const today = new Date()
  for (let daysBack = 1; daysBack <= 7; daysBack++) {
    const candidate = subtractDays(today, daysBack)
    const url       = tcmbArchiveUrl(candidate)
    const result    = await fetchTcmbUrl(url)
    if (result) {
      return {
        ...result,
        source: 'tcmb_last_business_day',
        date:   candidate.toISOString().slice(0, 10),
      }
    }
  }

  return null
}

// ── getOrFetchFxRate: used by proforma service at creation time ───────────────

export async function getOrFetchFxRate(currency: string): Promise<FxSnapshot> {
  if (currency === 'TRY') {
    return { rate: 1, source: 'identity', date: new Date().toISOString().slice(0, 10) }
  }

  const supabase = createClient()
  const today    = new Date().toISOString().slice(0, 10)

  // 1. Try today's stored rate
  const { data: todayStored } = await supabase
    .from('fx_rates')
    .select('buying, source, rate_date')
    .eq('currency', currency)
    .eq('rate_date', today)
    .maybeSingle()

  if (todayStored?.buying) {
    return {
      rate:   Number(todayStored.buying),
      source: todayStored.source as string,
      date:   todayStored.rate_date as string,
    }
  }

  // 2. Fetch from TCMB (today + last business day fallback)
  const tcmb = await fetchTcmbWithFallback()
  const value = currency === 'USD' ? tcmb?.usd
              : currency === 'EUR' ? tcmb?.eur
              : null

  if (tcmb && value && value > 0) {
    try {
      await safeSystemQuery('fx_rates').upsert(
        {
          rate_date:  tcmb.date,
          currency,
          buying:     value,
          selling:    Number((value * 1.005).toFixed(6)),
          source:     tcmb.source,
          fetched_at: new Date().toISOString(),
        },
        { onConflict: 'rate_date,currency' }
      )
    } catch (err) {
      console.error('[fx] Failed to persist fetched rate:', err instanceof Error ? err.message : String(err))
    }
    return { rate: value, source: tcmb.source, date: tcmb.date }
  }

  // 3. Last stored rate from DB cache
  const { data: lastStored } = await supabase
    .from('fx_rates')
    .select('buying, source, rate_date')
    .eq('currency', currency)
    .order('rate_date', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (lastStored?.buying) {
    console.warn(`[fx] Using DB fallback rate for ${currency} from ${lastStored.rate_date}`)
    return {
      rate:   Number(lastStored.buying),
      source: 'fallback',
      date:   lastStored.rate_date as string,
    }
  }

  // 4. Ultimate fallback
  console.warn(`[fx] No rate found for ${currency} — using 1:1`)
  return { rate: 1, source: 'unavailable', date: today }
}
