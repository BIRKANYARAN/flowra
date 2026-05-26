'use client'

// ── PlanningContextBar — Persistent planning state strip ──────────────────────
//
// Bloomberg-style status bar for the Planlama Merkezi.
// Shows runway, burn, forecast, and scenario state.

import { useState, useEffect } from 'react'
import { ContextReading, ContextRail, ContextRailSkeleton } from '@/components/ds'
import { fmtDense as fmtK } from '@/lib/format'
import type { CfoMetrics } from '@/lib/finance/cfo-metrics'

export function PlanningContextBar({ companyId }: { companyId: string }) {
  const [data, setData]     = useState<CfoMetrics | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    fetch('/api/cfo-metrics', { signal: controller.signal })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setData(d as CfoMetrics) })
      .catch(e => { if (e?.name !== 'AbortError') console.error(e) })
      .finally(() => setLoading(false))
    return () => controller.abort()
  }, [companyId])

  if (loading) return <ContextRailSkeleton />
  if (!data) return null

  const runwayMonths = data.burn.runway_months
  const runwayDays   = data.burn.runway_days
  const burn         = data.burn.monthly_burn_rate

  return (
    <ContextRail>
      <ContextReading
        label="RUNWAY"
        value={runwayMonths == null ? '—'
              : runwayMonths >= 12   ? `${Math.round(runwayMonths)}ay`
              : runwayDays != null   ? `${runwayDays}g`
              : `${runwayMonths.toFixed(1)}ay`}
        sub={runwayDays != null && runwayDays < 30 ? 'Kritik eşik'
            : runwayDays != null && runwayDays < 90 ? 'Baskı altında'
            : runwayMonths != null ? 'mevcut hızda'
            : undefined}
        status={runwayMonths == null ? 'ok'
              : runwayMonths < 1 ? 'critical'
              : runwayMonths < 3 ? 'warn'
              : 'ok'}
        border={false}
      />
      <ContextReading
        label="AYLIK BURN"
        value={burn > 0 ? fmtK(burn) : '—'}
        sub={burn > 0 ? 'son ay ortalaması' : 'Kârlı dönem'}
        status="ok"
      />
      <ContextReading
        label="NAKİT"
        value={fmtK(data.cash.true_cash_position)}
        sub="anlık pozisyon"
        status={data.cash.true_cash_position < 50_000 ? 'critical'
              : data.cash.true_cash_position < 200_000 ? 'warn'
              : 'ok'}
      />
      <ContextReading
        label="DAĞITILABİLİR"
        value={data.cash.distributable_cash > 0 ? fmtK(data.cash.distributable_cash) : '—'}
        sub={data.cash.distributable_cash > 0 ? 'temettüye hazır' : 'Yok'}
        status="ok"
      />
    </ContextRail>
  )
}
