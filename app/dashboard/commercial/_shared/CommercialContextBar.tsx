'use client'

// ── CommercialContextBar — Persistent commercial state strip ──────────────────
//
// Bloomberg-style status bar for the Ticari Akış Merkezi.
// Shows key receivables, proformas, and collections state at a glance.

import { useState, useEffect } from 'react'

interface CommercialPeek {
  receivables: { total_outstanding: number; overdue_60d: number }
  cash: { true_cash_position: number }
}

interface ProformaSummary {
  open_count:        number
  pending_value_try: number
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
    'text-[#0f172a]'
  return (
    <div className={`flex flex-col gap-0 flex-shrink-0 px-4 py-2.5 ${border ? 'border-l border-[#e2e8f0]' : ''}`}>
      <span className="text-[8px] font-black uppercase tracking-widest text-[#94a3b8] leading-none mb-1">
        {label}
      </span>
      <span className={`text-[13px] font-black tabular-nums leading-none ${valueCls}`}>
        {value}
      </span>
      {sub && (
        <span className="text-[9px] text-[#94a3b8] leading-none mt-0.5">{sub}</span>
      )}
    </div>
  )
}

export function CommercialContextBar({ companyId }: { companyId: string }) {
  const [data,    setData]    = useState<CommercialPeek | null>(null)
  const [pfSummary, setPfSummary] = useState<ProformaSummary | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    Promise.all([
      fetch('/api/cfo-metrics').then(r => r.ok ? r.json() : null).catch(() => null),
      fetch('/api/proformas/summary').then(r => r.ok ? r.json() : null).catch(() => null),
    ]).then(([metrics, pf]) => {
      if (metrics) setData(metrics as CommercialPeek)
      if (pf?.open_count != null) setPfSummary(pf as ProformaSummary)
    }).catch(() => {}).finally(() => setLoading(false))
  }, [companyId])

  if (loading) {
    return <div className="h-[46px] bg-[#f8fafc]/60 border-b border-[#e2e8f0] animate-pulse" />
  }
  if (!data) return null

  const overdue60  = data.receivables.overdue_60d
  const outstanding = data.receivables.total_outstanding
  const collectionRatePct = outstanding > 0
    ? Math.round(((outstanding - overdue60) / outstanding) * 100)
    : 100

  const readings: ReadingProps[] = [
    {
      label:  'AÇIK ALACAK',
      value:  outstanding > 0 ? fmtK(outstanding) : '—',
      sub:    outstanding > 0 ? 'toplam bekleyen' : 'Temiz',
      status: outstanding > 200_000 ? 'warn' : 'ok',
      border: false,
    },
    {
      label:  '60G+ GECİKMİŞ',
      value:  overdue60 > 0 ? fmtK(overdue60) : '—',
      sub:    overdue60 > 0 ? 'kritik risk' : 'Yok',
      status: overdue60 > 50_000 ? 'critical' : overdue60 > 0 ? 'warn' : 'ok',
      border: true,
    },
    {
      label:  'TAHSİLAT ORANI',
      value:  `%${collectionRatePct}`,
      sub:    collectionRatePct >= 80 ? 'Sağlıklı' : collectionRatePct >= 50 ? 'Orta' : 'Zayıf',
      status: collectionRatePct >= 80 ? 'ok' : collectionRatePct >= 50 ? 'warn' : 'critical',
      border: true,
    },
    {
      label:  'PROFORMA',
      value:  pfSummary != null ? String(pfSummary.open_count) : '—',
      sub:    pfSummary != null && pfSummary.pending_value_try > 0
        ? `${fmtK(pfSummary.pending_value_try)} beklemede`
        : pfSummary != null ? 'açık teklif' : undefined,
      status: 'ok',
      border: true,
    },
    {
      label:  'NAKİT',
      value:  fmtK(data.cash.true_cash_position),
      sub:    'mevcut pozisyon',
      status: data.cash.true_cash_position < 50_000 ? 'critical'
            : data.cash.true_cash_position < 200_000 ? 'warn' : 'ok',
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
