'use client'

// ── PlanningContextBar — Persistent planning state strip ──────────────────────
//
// Bloomberg-style status bar for the Planlama Merkezi.
// Shows runway, burn, forecast, and scenario state.

import { useState, useEffect } from 'react'
import { ContextReading, ContextRail, ContextRailSkeleton } from '@/components/ds'

interface PlanningPeek {
  burn: { monthly_burn_rate: number; runway_months: number | null; runway_days: number | null }
  cash: { true_cash_position: number; distributable_cash: number }
}

const TRY = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 })

function fmtK(n: number): string {
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (abs >= 100_000)   return Math.round(n / 1_000) + 'K'
  return '₺' + TRY.format(n)
}

export function PlanningContextBar({ companyId }: { companyId: string }) {
  const [data, setData]     = useState<PlanningPeek | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetch('/api/cfo-metrics')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setData(d as PlanningPeek) })
      .catch(() => {})
      .finally(() => setLoading(false))
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
