'use client'

// ── FinanceContextBar — Persistent financial state strip for Finance Hub ──────
//
// Always-visible Bloomberg-style status bar showing 5 key readings.
// Sits between the sticky tab nav and the tab content area.
// Loads independently via /api/cfo-metrics.

import { useState, useEffect } from 'react'

interface CfoPeek {
  cash:        { true_cash_position: number; distributable_cash: number }
  burn:        { runway_days: number | null; runway_months: number | null }
  receivables: { total_outstanding: number; overdue_60d: number }
  tax:         { kdv_net: number; corporate_tax_estimate: number }
  partner:     { total_loans: number }
}

const TRY = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 })

function fmtK(n: number): string {
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (abs >= 100_000)   return Math.round(n / 1_000) + 'K'
  return '₺' + TRY.format(n)
}

function prefixed(n: number): string {
  return (n < 0 ? '−' : '') + '₺' + TRY.format(Math.abs(n))
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
    status === 'critical' ? 'text-red-600' :
    status === 'warn'     ? 'text-amber-700' :
    'text-gray-900'
  return (
    <div className={`flex flex-col gap-0 flex-shrink-0 px-4 py-2.5 ${border ? 'border-l border-gray-100' : ''}`}>
      <span className="text-[8px] font-black uppercase tracking-widest text-gray-400 leading-none mb-1">
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

export function FinanceContextBar({ companyId }: { companyId: string }) {
  const [data, setData]     = useState<CfoPeek | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetch('/api/cfo-metrics')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setData(d) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [companyId])

  // Loading state — thin shimmer
  if (loading) {
    return (
      <div className="h-[52px] bg-gray-50/60 border-b border-gray-100 animate-pulse" />
    )
  }

  if (!data) return null

  const runway = data.burn.runway_days ?? -1
  const kdv    = data.tax.kdv_net
  const cash   = data.cash.true_cash_position

  const readings: ReadingProps[] = [
    {
      label:  'NAKİT',
      value:  fmtK(cash),
      sub:    data.cash.distributable_cash > 0
                ? fmtK(data.cash.distributable_cash) + ' dağıtılabilir'
                : undefined,
      status: cash < 50_000 ? 'critical' : cash < 200_000 ? 'warn' : 'ok',
      border: false,
    },
    {
      label:  'RUNWAY',
      value:  runway < 0
                ? '—'
                : runway >= 365
                ? Math.round(data.burn.runway_months ?? 12) + 'ay'
                : runway + 'g',
      sub:    runway >= 0 && runway < 90 ? (runway < 30 ? 'Kritik' : 'Baskı altında') : undefined,
      status: runway >= 0 && runway < 30 ? 'critical' : runway >= 0 && runway < 90 ? 'warn' : 'ok',
      border: true,
    },
    {
      label:  'ALACAK',
      value:  fmtK(data.receivables.total_outstanding),
      sub:    data.receivables.overdue_60d > 0
                ? fmtK(data.receivables.overdue_60d) + ' 60g+'
                : 'Güncel',
      status: data.receivables.overdue_60d > 50_000 ? 'critical' : data.receivables.overdue_60d > 0 ? 'warn' : 'ok',
      border: true,
    },
    {
      label:  'KDV NET',
      value:  prefixed(kdv),
      sub:    kdv > 0 ? 'Ödenecek' : kdv < 0 ? 'Devir' : 'Sıfır',
      status: kdv > 100_000 ? 'critical' : kdv > 50_000 ? 'warn' : 'ok',
      border: true,
    },
    {
      label:  'K.VERGİSİ',
      value:  fmtK(data.tax.corporate_tax_estimate),
      status: data.tax.corporate_tax_estimate > 200_000 ? 'warn' : 'ok',
      border: true,
    },
    {
      label:  'ORTAK BORÇ',
      value:  fmtK(data.partner.total_loans),
      status: data.partner.total_loans > 500_000 ? 'warn' : 'ok',
      border: true,
    },
  ]

  return (
    <div className="flex items-center gap-0 bg-gray-50/40 border-b border-gray-100 overflow-x-auto scrollbar-none">
      {readings.map(r => (
        <Reading key={r.label} {...r} />
      ))}
    </div>
  )
}
