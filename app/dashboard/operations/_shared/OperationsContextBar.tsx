'use client'

// ── OperationsContextBar — Persistent operations state strip ──────────────────
//
// Bloomberg-style status bar for the Operasyon Merkezi.
// Shows expenses, stock, and burn rate at a glance.

import { useState, useEffect } from 'react'

interface OpsPeek {
  burn:  { monthly_burn_rate: number; runway_months: number | null }
  stock: { fifo_value: number; coverage_months: number | null }
  cash:  { true_cash_position: number }
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

export function OperationsContextBar({ companyId }: { companyId: string }) {
  const [data, setData]     = useState<OpsPeek | null>(null)
  const [pendingExpenses, setPendingExpenses] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    Promise.all([
      fetch('/api/cfo-metrics').then(r => r.ok ? r.json() : null),
      fetch('/api/expenses/pending-total').then(r => r.ok ? r.json() : null).catch(() => null),
    ]).then(([metrics, pending]) => {
      if (metrics) setData(metrics as OpsPeek)
      if (pending?.total != null) setPendingExpenses(pending.total)
    }).catch(() => {}).finally(() => setLoading(false))
  }, [companyId])

  if (loading) {
    return <div className="h-[46px] bg-gray-50/60 border-b border-gray-100 animate-pulse" />
  }
  if (!data) return null

  const burn    = data.burn.monthly_burn_rate
  const stock   = data.stock.fifo_value
  const coverage = data.stock.coverage_months

  const readings: ReadingProps[] = [
    {
      label:  'AYLIK BURN',
      value:  burn > 0 ? fmtK(burn) : '—',
      sub:    burn > 0 ? 'aylık gider' : 'Zarar yok',
      status: burn > 500_000 ? 'warn' : 'ok',
      border: false,
    },
    {
      label:  'ÖDENECEK GİDER',
      value:  pendingExpenses != null && pendingExpenses > 0 ? fmtK(pendingExpenses) : '—',
      sub:    pendingExpenses != null && pendingExpenses > 0 ? 'ödeme bekliyor' : 'Yok',
      status: pendingExpenses != null && pendingExpenses > 100_000 ? 'warn' : 'ok',
      border: true,
    },
    {
      label:  'STOK DEĞERİ',
      value:  stock > 0 ? fmtK(stock) : '—',
      sub:    stock > 0 ? 'FIFO değeri' : 'Boş',
      status: 'ok',
      border: true,
    },
    {
      label:  'STOK KARŞILAMA',
      value:  coverage != null ? `${coverage.toFixed(1)}ay` : '—',
      sub:    coverage != null
                ? coverage < 1 ? 'Kritik düşük'
                : coverage < 2 ? 'Baskı'
                : 'Yeterli'
                : undefined,
      status: coverage == null ? 'ok'
            : coverage < 1 ? 'critical'
            : coverage < 2 ? 'warn'
            : 'ok',
      border: true,
    },
    {
      label:  'RUNWAY',
      value:  data.burn.runway_months != null
                ? data.burn.runway_months >= 12
                  ? `${Math.round(data.burn.runway_months)}ay`
                  : `${Math.round(data.burn.runway_months * 30)}g`
                : '—',
      sub:    data.burn.runway_months != null && data.burn.runway_months < 3 ? 'Kritik' : undefined,
      status: data.burn.runway_months == null ? 'ok'
            : data.burn.runway_months < 2 ? 'critical'
            : data.burn.runway_months < 6 ? 'warn'
            : 'ok',
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
