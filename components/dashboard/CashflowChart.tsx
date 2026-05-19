'use client'
// ─────────────────────────────────────────────────────────────────────────────
// CashflowChart — monthly cashflow bar chart
//
// Fetches GET /api/cashflow on mount and renders a minimal bar chart
// (no external chart library — pure CSS bars for zero-dependency footprint).
//
// Props:
//   className?  string  — additional wrapper classes
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from 'react'
import type { CashflowMonth } from '@/types'

interface Props {
  className?: string
}

function fmt(n: number): string {
  const abs  = Math.abs(n)
  const sign = n < 0 ? '−' : ''
  if (abs >= 1_000_000) return `${sign}₺${(abs / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000)     return `${sign}₺${(abs / 1_000).toFixed(0)}K`
  return `${sign}₺${abs.toFixed(0)}`
}

function shortMonth(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  const d      = new Date(Date.UTC(y, m - 1, 1))
  return d.toLocaleDateString('tr-TR', { month: 'short', timeZone: 'UTC' })
}

export function CashflowChart({ className = '' }: Props) {
  const [data,    setData]    = useState<CashflowMonth[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')

  useEffect(() => {
    fetch('/api/cashflow?past_months=6&future_months=6')
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then((d: CashflowMonth[]) => { setData(d); setLoading(false) })
      .catch(() => { setError('Nakit akışı yüklenemedi'); setLoading(false) })
  }, [])

  if (loading) {
    return (
      <div className={`bg-white rounded border border-gray-100 p-5 ${className}`}>
        <div className="h-4 w-36 bg-gray-100 rounded animate-pulse mb-4" />
        <div className="flex items-end gap-1.5 h-24">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="flex-1 bg-gray-100 rounded-t animate-pulse" style={{ height: `${40 + (i % 4) * 15}%` }} />
          ))}
        </div>
      </div>
    )
  }

  if (error || data.length === 0) {
    return (
      <div className={`bg-white rounded border border-gray-100 p-5 ${className}`}>
        <p className="text-sm text-gray-400">{error || 'Veri yok'}</p>
      </div>
    )
  }

  // Scale bars relative to max absolute net value
  const maxAbs  = Math.max(...data.map(d => Math.abs(d.net)), 1)
  const maxColH = 80   // px — max bar height

  return (
    <div className={`bg-white rounded border border-gray-100 p-5 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Nakit Akışı</h3>
          <p className="text-[10px] text-gray-300 mt-0.5">12 aylık görünüm · tahsilat − gider</p>
        </div>
        {/* Legend */}
        <div className="flex items-center gap-3 text-[10px] text-gray-400">
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm bg-emerald-400 inline-block" />
            Pozitif
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm bg-red-400 inline-block" />
            Negatif
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm bg-gray-200 inline-block" />
            Projeksiyon
          </span>
        </div>
      </div>

      {/* Bar chart */}
      <div className="flex items-end gap-1" style={{ height: `${maxColH + 24}px` }}>
        {data.map(d => {
          const barH      = Math.round((Math.abs(d.net) / maxAbs) * maxColH)
          const isPos     = d.net >= 0
          const isProj    = d.is_projected
          const colorBase = isPos
            ? (isProj ? 'bg-emerald-200' : 'bg-emerald-400')
            : (isProj ? 'bg-red-200'     : 'bg-red-400')

          return (
            <div key={d.month} className="flex-1 flex flex-col items-center justify-end group relative">
              {/* Tooltip */}
              <div className="absolute bottom-full mb-2 hidden group-hover:flex flex-col items-center z-10 pointer-events-none">
                <div className="bg-gray-900 text-white text-[10px] rounded px-2.5 py-1.5 whitespace-nowrap">
                  <div className="font-bold">{d.month}</div>
                  <div>Tahsilat: {fmt(d.collected)}</div>
                  <div>Gider: {fmt(d.expenses)}</div>
                  <div className={`font-bold ${d.net >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>
                    Net: {fmt(d.net)}
                  </div>
                  <div className="text-gray-400">Kümülatif: {fmt(d.cumulative)}</div>
                  {isProj && <div className="text-yellow-300 text-[9px]">Projeksiyon</div>}
                </div>
                <div className="w-2 h-2 bg-gray-900 rotate-45 -mt-1" />
              </div>

              {/* Bar */}
              <div
                className={`w-full rounded-t transition-all ${colorBase} ${isProj ? 'opacity-60' : ''}`}
                style={{ height: `${Math.max(barH, 2)}px` }}
              />
              {/* Month label */}
              <div className="text-[9px] text-gray-400 mt-1 font-medium">{shortMonth(d.month)}</div>
            </div>
          )
        })}
      </div>

      {/* Cumulative line note */}
      <div className="mt-3 pt-3 border-t border-gray-50 flex items-center justify-between">
        <span className="text-[10px] text-gray-400">Son kümülatif net:</span>
        <span className={`text-xs font-bold tabular-nums ${
          (data[data.length - 1]?.cumulative ?? 0) >= 0 ? 'text-emerald-600' : 'text-red-600'
        }`}>
          {fmt(data[data.length - 1]?.cumulative ?? 0)}
        </span>
      </div>
    </div>
  )
}
