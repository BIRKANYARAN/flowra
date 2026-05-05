export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { safeSystemQuery } from '@/lib/admin-db'
import { fetchTcmbRates } from '@/lib/fx'

export async function GET() {
  try {
    const rates = await fetchTcmbRates()

    if (!rates) {
      // Return last stored rates as fallback
      const supabase = createClient()
      const today    = new Date().toISOString().slice(0, 10)
      const { data } = await supabase
        .from('fx_rates')
        .select('currency, buying, rate_date')
        .in('currency', ['USD', 'EUR'])
        .lte('rate_date', today)
        .order('rate_date', { ascending: false })
        .limit(4)

      return NextResponse.json({
        source: 'fallback',
        date:   today,
        usd:    data?.find(r => r.currency === 'USD')?.buying ?? null,
        eur:    data?.find(r => r.currency === 'EUR')?.buying ?? null,
      })
    }

    const supabase = createClient()
    const today    = new Date().toISOString().slice(0, 10)

    for (const [currency, value] of Object.entries(rates) as [string, number][]) {
      await safeSystemQuery('fx_rates').upsert(
        {
          rate_date:  today,
          currency:   currency.toUpperCase(),
          buying:     value,
          selling:    parseFloat((value * 1.005).toFixed(6)),
          source:     'tcmb',
          fetched_at: new Date().toISOString(),
        },
        { onConflict: 'rate_date,currency' }
      )
    }

    return NextResponse.json({ source: 'tcmb', date: today, ...rates })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
