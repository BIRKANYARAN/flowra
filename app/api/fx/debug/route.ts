// ── /api/fx/debug — diagnostics endpoint for FX system ───────────────────────
// Returns full resolution trace: what was tried, what succeeded, what's cached.
// Protected: requires auth. For internal debugging only.

export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { fetchTcmbWithFallback } from '@/lib/fx'

interface StepResult {
  step:    string
  tried:   boolean
  success: boolean
  detail:  string
  data?:   { usd?: number; eur?: number; source?: string; date?: string }
}

export async function GET() {
  try {
    const supabase = createClient()
    const { data: authData, error: authErr } = await supabase.auth.getUser()
    if (authErr || !authData?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const user = authData.user

    const steps: StepResult[] = []
    const now   = new Date().toISOString()
    const today = now.slice(0, 10)

    // ── Step 1: DB cache for today ────────────────────────────────────────────
    const { data: cached, error: cacheErr } = await supabase
      .from('fx_rates')
      .select('currency, buying, fetched_at, rate_date')
      .in('currency', ['USD', 'EUR'])
      .eq('rate_date', today)

    const cachedUsd = cached?.find(r => r.currency === 'USD')
    const cachedEur = cached?.find(r => r.currency === 'EUR')
    steps.push({
      step:    'DB cache (today)',
      tried:   true,
      success: !!(cachedUsd && cachedEur),
      detail:  cacheErr ? cacheErr.message : cachedUsd && cachedEur ? `Found USD=${cachedUsd.buying} EUR=${cachedEur.buying}` : 'No rows for today',
      data:    cachedUsd && cachedEur ? { usd: Number(cachedUsd.buying), eur: Number(cachedEur.buying), date: today } : undefined,
    })

    // ── Step 2: TCMB live fetch ───────────────────────────────────────────────
    let tcmbResult: Awaited<ReturnType<typeof fetchTcmbWithFallback>> = null
    let tcmbErr = ''
    try {
      tcmbResult = await fetchTcmbWithFallback()
    } catch (e) {
      tcmbErr = e instanceof Error ? e.message : String(e)
    }
    steps.push({
      step:    'TCMB fetch (today + last 7 business days)',
      tried:   true,
      success: !!tcmbResult,
      detail:  tcmbErr || (tcmbResult ? `source=${tcmbResult.source} date=${tcmbResult.date}` : 'All TCMB URLs failed'),
      data:    tcmbResult ? { usd: tcmbResult.usd, eur: tcmbResult.eur, source: tcmbResult.source, date: tcmbResult.date } : undefined,
    })

    // ── Step 3: Latest DB cache (any date) ────────────────────────────────────
    const { data: latest, error: latestErr } = await supabase
      .from('fx_rates')
      .select('currency, buying, fetched_at, rate_date')
      .in('currency', ['USD', 'EUR'])
      .order('rate_date', { ascending: false })
      .limit(4)

    const latestUsd = latest?.find(r => r.currency === 'USD')
    const latestEur = latest?.find(r => r.currency === 'EUR')
    steps.push({
      step:    'DB cache (latest any date)',
      tried:   true,
      success: !!(latestUsd && latestEur),
      detail:  latestErr ? latestErr.message : latestUsd && latestEur ? `USD=${latestUsd.buying} (${latestUsd.rate_date}) EUR=${latestEur.buying} (${latestEur.rate_date})` : 'No rows at all',
      data:    latestUsd && latestEur ? { usd: Number(latestUsd.buying), eur: Number(latestEur.buying), date: latestUsd.rate_date } : undefined,
    })

    // ── All fx_rates rows (last 10) ───────────────────────────────────────────
    const { data: allRates } = await supabase
      .from('fx_rates')
      .select('currency, buying, rate_date, source, fetched_at')
      .in('currency', ['USD', 'EUR'])
      .order('rate_date', { ascending: false })
      .limit(10)

    return NextResponse.json({
      ok:          true,
      timestamp:   now,
      today,
      steps,
      cached_rows: allRates ?? [],
      summary: {
        db_today:   !!(cachedUsd && cachedEur),
        tcmb_live:  !!tcmbResult,
        db_any:     !!(latestUsd && latestEur),
        will_show:  tcmbResult ?? (latestUsd && latestEur ? { usd: Number(latestUsd.buying), eur: Number(latestEur.buying), source: 'db' } : null) ?? { usd: 0, eur: 0, source: 'fallback' },
      },
    })

  } catch (err) {
    return NextResponse.json({
      ok:    false,
      error: err instanceof Error ? err.message : String(err),
    }, { status: 500 })
  }
}
