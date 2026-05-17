'use client'

// ── PartnersContextBar — Persistent partner capital state strip ───────────────
//
// Bloomberg-style status bar showing partner finance position at a glance.
// Sits under the sticky tab nav — consistent with FinanceContextBar pattern.
// Loads from /api/partners/ledger on mount.

import { useState, useEffect } from 'react'

interface LedgerSummary {
  total_equity_pool:      number
  total_debt_to_partners: number
  total_dividends:        number
  debt_to_equity_ratio:   number | null
  partner_count:          number
  active_partner_count:   number
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

export function PartnersContextBar() {
  const [data,    setData]    = useState<LedgerSummary | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetch('/api/partners/ledger')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.summary) setData(d.summary) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return <div className="h-[46px] bg-gray-50/60 border-b border-gray-100 animate-pulse" />
  }
  if (!data) return null

  const deRatio = data.debt_to_equity_ratio
  const deRatioStr = deRatio == null ? '—' : deRatio.toFixed(2) + 'x'

  const readings: ReadingProps[] = [
    {
      label:  'SERMAYE HAVUZU',
      value:  fmtK(data.total_equity_pool),
      sub:    `${data.active_partner_count} aktif ortak`,
      status: 'ok',
      border: false,
    },
    {
      label:  'ORTAK BORCU',
      value:  data.total_debt_to_partners > 0 ? fmtK(data.total_debt_to_partners) : '—',
      sub:    data.total_debt_to_partners > 0 ? 'açık tranche' : 'Borç yok',
      status: data.total_debt_to_partners > 500_000 ? 'warn' : 'ok',
      border: true,
    },
    {
      label:  'BORÇ/SERMAYE',
      value:  deRatioStr,
      sub:    deRatio != null
                ? deRatio < 0.5 ? 'Düşük borçluluk'
                : deRatio < 1   ? 'Orta borçluluk'
                : 'Yüksek borçluluk'
                : undefined,
      status: deRatio == null ? 'ok' : deRatio > 1 ? 'critical' : deRatio > 0.5 ? 'warn' : 'ok',
      border: true,
    },
    {
      label:  'DAĞITILAN',
      value:  fmtK(data.total_dividends),
      sub:    'kümülatif temettü',
      status: 'ok',
      border: true,
    },
    {
      label:  'ORTAKLAR',
      value:  String(data.partner_count),
      sub:    data.partner_count !== data.active_partner_count
                ? `${data.active_partner_count} aktif`
                : 'Tümü aktif',
      status: 'ok',
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
