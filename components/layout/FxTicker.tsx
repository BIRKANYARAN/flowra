'use client'
// FxTicker — Bloomberg-style compact FX strip for the topbar.
// Self-loading: fetches /api/fx on mount. No server props needed.
// Renders: USD/TRY · EUR/TRY  inline, minimal, tabular-nums.

import { useState, useEffect } from 'react'

interface Rates {
  USD:    number
  EUR:    number
  source: string
}

export function FxTicker() {
  const [rates,   setRates]   = useState<Rates | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/fx', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d) setRates({ USD: Number(d.USD || 0), EUR: Number(d.EUR || 0), source: d.source ?? '' })
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  // Skeleton during load
  if (loading) return (
    <div className="hidden md:flex items-center gap-3" aria-hidden>
      <div className="h-2.5 w-16 bg-[#f1f5f9] rounded animate-pulse" />
      <div className="h-2.5 w-16 bg-[#f1f5f9] rounded animate-pulse" />
    </div>
  )

  if (!rates || (!rates.USD && !rates.EUR)) return null

  const isOld = rates.source === 'tcmb_last_business_day'

  return (
    <div className="hidden md:flex items-center gap-3" title="TCMB güncel kur">
      {isOld && (
        <span className="text-[8px] font-bold uppercase tracking-wider text-warn bg-warn-light border border-warn-light px-1.5 py-0.5 rounded leading-none">
          son iş günü
        </span>
      )}
      <TickerPair code="USD" rate={rates.USD} />
      <div className="w-px h-3 bg-[#e2e8f0] flex-shrink-0" />
      <TickerPair code="EUR" rate={rates.EUR} />
    </div>
  )
}

function TickerPair({ code, rate }: { code: string; rate: number }) {
  return (
    <div className="flex items-baseline gap-1.5 leading-none">
      <span className="text-[8px] font-bold uppercase tracking-wider text-[#94a3b8]">
        {code}<span className="text-[#cbd5e1]">/TRY</span>
      </span>
      <span className="text-[11px] font-black tabular-nums text-[#334155]">
        {rate > 0 ? `₺${rate.toFixed(4)}` : '—'}
      </span>
    </div>
  )
}
