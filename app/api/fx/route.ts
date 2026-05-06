// ── /api/fx — internal FX source of truth ────────────────────────────────────
// Server-side ONLY. Never called from the browser directly.
//
// Resolution order:
//   1. DB cache for today (cheapest)
//   2. TCMB today.xml (live)
//   3. TCMB last business day archive (up to 7 days back)
//   4. Latest DB cache (any date)
//   5. Hard fallback { USD:0, EUR:0, source:'fallback' }

export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { safeSystemQuery } from '@/lib/admin-db'
import { fetchTcmbWithFallback } from '@/lib/fx'

// ── Response type — defined here, referenced locally in dashboard (not imported)
export interface FxApiResponse {
  USD:            number
  EUR:            number
  source:         'tcmb_today' | 'tcmb_last_business_day' | 'db' | 'fallback'
  rate_date:      string | null   // date the rate applies to (YYYY-MM-DD)
  fetched_at:     string | null   // when our system fetched it
}

const HARD_FALLBACK: FxApiResponse = {
  USD:        0,
  EUR:        0,
  source:     'fallback',
  rate_date:  null,
  fetched_at: null,
}

export async function GET() {
  const today = new Date().toISOString().slice(0, 10)
  const now   = new Date().toISOString()

  try {
    const supabase = createClient()

    // ── 1. DB cache for today ──────────────────────────────────────────────
    const { data: cached, error: cacheErr } = await supabase
      .from('fx_rates')
      .select('currency, buying, fetched_at')
      .in('currency', ['USD', 'EUR'])
      .eq('rate_date', today)

    if (cacheErr) {
      console.error('[/api/fx] DB cache read error:', cacheErr.message)
    }

    const cachedUsd = cached?.find(r => r.currency === 'USD')
    const cachedEur = cached?.find(r => r.currency === 'EUR')

    if (cachedUsd && cachedEur) {
      return NextResponse.json({
        USD:        Number(cachedUsd.buying),
        EUR:        Number(cachedEur.buying),
        source:     'db',
        rate_date:  today,
        fetched_at: cachedUsd.fetched_at ?? today,
      } satisfies FxApiResponse)
    }

    // ── 2 + 3. Live TCMB (today → last business day up to 7 days) ─────────
    const tcmb = await fetchTcmbWithFallback()

    if (tcmb) {
      const rateDate = tcmb.date

      // Persist into DB cache
      try {
        const { error: upsertErr } = await safeSystemQuery('fx_rates').upsert(
          [
            {
              rate_date:  rateDate,
              currency:   'USD',
              buying:     tcmb.usd,
              selling:    Number((tcmb.usd * 1.005).toFixed(6)),
              source:     tcmb.source,
              fetched_at: now,
            },
            {
              rate_date:  rateDate,
              currency:   'EUR',
              buying:     tcmb.eur,
              selling:    Number((tcmb.eur * 1.005).toFixed(6)),
              source:     tcmb.source,
              fetched_at: now,
            },
          ],
          { onConflict: 'rate_date,currency' }
        )

        if (upsertErr) {
          console.error('[/api/fx] DB upsert error:', upsertErr.message)
        }
      } catch (err) {
        console.error('[/api/fx] DB upsert unavailable:', err instanceof Error ? err.message : String(err))
      }

      return NextResponse.json({
        USD:        tcmb.usd,
        EUR:        tcmb.eur,
        source:     tcmb.source,
        rate_date:  rateDate,
        fetched_at: now,
      } satisfies FxApiResponse)
    }

    // ── 4. Latest DB cache (any date) ──────────────────────────────────────
    const { data: latestRates, error: latestErr } = await supabase
      .from('fx_rates')
      .select('currency, buying, fetched_at, rate_date')
      .in('currency', ['USD', 'EUR'])
      .order('rate_date', { ascending: false })
      .limit(4)

    if (latestErr) {
      console.error('[/api/fx] latest DB read error:', latestErr.message)
    }

    const latestUsd = latestRates?.find(r => r.currency === 'USD')
    const latestEur = latestRates?.find(r => r.currency === 'EUR')

    if (latestUsd && latestEur) {
      return NextResponse.json({
        USD:        Number(latestUsd.buying),
        EUR:        Number(latestEur.buying),
        source:     'db',
        rate_date:  latestUsd.rate_date ?? null,
        fetched_at: latestUsd.fetched_at ?? latestUsd.rate_date,
      } satisfies FxApiResponse)
    }

    // ── 5. Nothing available ───────────────────────────────────────────────
    console.warn('[/api/fx] No FX rates available from any source')
    return NextResponse.json(HARD_FALLBACK)

  } catch (err) {
    console.error('[/api/fx] Unexpected error:', err instanceof Error ? err.message : String(err))
    return NextResponse.json(HARD_FALLBACK)
  }
}
