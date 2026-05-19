'use client'

// ── PlanningContextBar — Persistent planning state strip ──────────────────────
//
// Bloomberg-style status bar for the Planlama Merkezi.
// Shows runway, burn, forecast, and scenario state.

import { useState, useEffect } from 'react'

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

interface ReadingProps {
  label:  string
  value:  string
  sub?:   string
  status: 'ok' | 'warn' | 'critical'
  border: boolean
}

function Reading({ label, value, sub, status, border }: ReadingProps) {
  const valueCls =
    status === 'critical' ? 'text-neg' :
    status === 'warn'     ? 'text-warn-text' :
    'text-gray-900'
  return (
    <div className={`flex flex-col gap-0 flex-shrink-0 px-4 py-2.5 ${border ? 'border-l border-[#e2e8f0]' : ''}`}>
      <span className="text-[8px] font-black uppercase tracking-widest text-[#94a3b8] leading-none mb-1">
        {label}
      </span>
      <span className={`text-[13px] font-black tabular-nums leading-none ${valueCls}`}>
        {value}
      </span>
      {sub && (
        <span className="text-[9px] text-gray-400 leading-none mt-0.5">{sub}</span>
      )}
    </div>
  )
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

  if (loading) {
    return <div className="h-[46px] bg-[#f8fafc]/60 border-b border-[#e2e8f0] animate-pulse" />
  }
  if (!data) return null

  const runwayMonths = data.burn.runway_months
  const runwayDays   = data.burn.runway_days
  const burn         = data.burn.monthly_burn_rate

  const readings: ReadingProps[] = [
    {
      label:  'RUNWAY',
      value:  runwayMonths == null ? '—'
            : runwayMonths >= 12   ? `${Math.round(runwayMonths)}ay`
            : runwayDays != null   ? `${runwayDays}g`
            : `${runwayMonths.toFixed(1)}ay`,
      sub:    runwayDays != null && runwayDays < 30 ? 'Kritik eşik'
            : runwayDays != null && runwayDays < 90 ? 'Baskı altında'
            : runwayMonths != null ? 'nakit ömrü'
            : undefined,
      status: runwayMonths == null ? 'ok'
            : runwayMonths < 1 ? 'critical'
            : runwayMonths < 3 ? 'warn'
            : 'ok',
      border: false,
    },
    {
      label:  'AYLIK BURN',
      value:  burn > 0 ? fmtK(burn) : '—',
      sub:    burn > 0 ? 'aylık gider oranı' : 'Kârlı',
      status: 'ok',
      border: true,
    },
    {
      label:  'NAKİT',
      value:  fmtK(data.cash.true_cash_position),
      sub:    'pozisyon',
      status: data.cash.true_cash_position < 50_000 ? 'critical'
            : data.cash.true_cash_position < 200_000 ? 'warn'
            : 'ok',
      border: true,
    },
    {
      label:  'DAĞITILABİLİR',
      value:  data.cash.distributable_cash > 0 ? fmtK(data.cash.distributable_cash) : '—',
      sub:    data.cash.distributable_cash > 0 ? 'temettüye hazır' : 'Yok',
      status: 'ok',
      border: true,
    },
  ]

  return (
    <div className="flex items-center gap-0 bg-[#f8fafc]/40 border-b border-[#e2e8f0] overflow-x-auto scrollbar-none">
      {readings.map(r => (
        <Reading key={r.label} {...r} />
      ))}
    </div>
  )
}
