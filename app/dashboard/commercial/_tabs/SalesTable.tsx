'use client'

// ── SalesTable — client island for the Commercial / Sales tab ─────────────────
// Receives pre-fetched rows from the SalesContent server component.
// All filtering is done client-side (no extra API calls).

import { useState, useMemo } from 'react'
import Link from 'next/link'
import type { NormalizedSaleRow } from '@/lib/normalize'
import { formatTRY, fmtDate } from '@/lib/format'

// ── Lookups ───────────────────────────────────────────────────────────────────

const PAYMENT_META: Record<string, { label: string; cls: string }> = {
  pending:   { label: 'Bekliyor', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  paid:      { label: 'Ödendi',   cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  partial:   { label: 'Kısmi',    cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  overdue:   { label: 'Gecikmiş', cls: 'bg-red-50 text-red-600 border-red-200' },
  cancelled: { label: 'İptal',    cls: 'bg-gray-50 text-gray-400 border-gray-200' },
}

const SHIPMENT_META: Record<string, { label: string; cls: string }> = {
  pending:   { label: 'Hazırlanıyor', cls: 'bg-gray-50 text-gray-500 border-gray-200' },
  shipped:   { label: 'Kargoda',      cls: 'bg-blue-50 text-blue-600 border-blue-200' },
  delivered: { label: 'Teslim',       cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
}

function StatusBadge({ map, val }: { map: Record<string, { label: string; cls: string }>; val: string | null }) {
  if (!val) return null
  const m = map[val] ?? { label: val, cls: 'bg-gray-50 text-gray-400 border-gray-200' }
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded border text-[10px] font-bold ${m.cls}`}>
      {m.label}
    </span>
  )
}

// ── Date range helpers ────────────────────────────────────────────────────────

type DateRange = 'all' | 'month' | '30d' | '90d'

function getDateRangeCutoff(range: DateRange): string | null {
  if (range === 'all') return null
  const d = new Date()
  if (range === 'month')  d.setDate(1)
  if (range === '30d')    d.setDate(d.getDate() - 30)
  if (range === '90d')    d.setDate(d.getDate() - 90)
  // Return YYYY-MM-DD — sale_date is a date column, not a timestamp
  return d.toISOString().slice(0, 10)
}

const DATE_RANGE_LABELS: Record<DateRange, string> = {
  all:   'Tümü',
  month: 'Bu Ay',
  '30d': 'Son 30 Gün',
  '90d': 'Son 90 Gün',
}

const PAYMENT_FILTER_OPTIONS = [
  { value: 'all',      label: 'Tüm Durum' },
  { value: 'pending',  label: 'Bekliyor'  },
  { value: 'overdue',  label: 'Gecikmiş'  },
  { value: 'partial',  label: 'Kısmi'     },
  { value: 'paid',     label: 'Ödendi'    },
]

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  rows: NormalizedSaleRow[]
}

// ── Component ─────────────────────────────────────────────────────────────────

export function SalesTable({ rows }: Props) {
  const [search,      setSearch]      = useState('')
  const [dateRange,   setDateRange]   = useState<DateRange>('all')
  const [statusFilter, setStatusFilter] = useState('all')

  // ── Filter logic ─────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q       = search.trim().toLowerCase()
    const cutoff  = getDateRangeCutoff(dateRange)

    return rows.filter(r => {
      if (q && !r.customer_name.toLowerCase().includes(q)) return false
      if (cutoff && r.sale_date < cutoff) return false
      if (statusFilter !== 'all' && r.payment_status !== statusFilter) return false
      return true
    })
  }, [rows, search, dateRange, statusFilter])

  const isFiltered = search !== '' || dateRange !== 'all' || statusFilter !== 'all'

  // ── Filtered KPIs ─────────────────────────────────────────────────────────────
  const totalRev = filtered.reduce((s, r) => s + r.total_try, 0)
  const totalPft = filtered.reduce((s, r) => s + r.nominal_profit, 0)

  const fmt = (n: number) => formatTRY(n)

  function clearFilters() {
    setSearch('')
    setDateRange('all')
    setStatusFilter('all')
  }

  return (
    <div className="space-y-4">

      {/* ── Filter bar ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Search */}
        <div className="relative flex-1 min-w-48">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm select-none">⌕</span>
          <input
            type="text"
            placeholder="Müşteri ara…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-300 bg-white"
          />
        </div>

        {/* Date range */}
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
          {(Object.keys(DATE_RANGE_LABELS) as DateRange[]).map(k => (
            <button
              key={k}
              onClick={() => setDateRange(k)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                dateRange === k ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {DATE_RANGE_LABELS[k]}
            </button>
          ))}
        </div>

        {/* Status filter */}
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="border border-gray-200 rounded-xl px-3 py-2 text-xs font-medium bg-white focus:outline-none focus:ring-2 focus:ring-primary-300"
        >
          {PAYMENT_FILTER_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        {/* Clear */}
        {isFiltered && (
          <button
            onClick={clearFilters}
            className="text-xs font-semibold text-gray-400 hover:text-gray-700 px-2 py-1.5 rounded-lg hover:bg-gray-100 transition-colors"
          >
            Filtreleri Temizle ✕
          </button>
        )}
      </div>

      {/* ── KPI strip (live / filtered) ────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3">
        {[
          {
            label: isFiltered ? `Gösterilen Satış` : 'Toplam Satış',
            value: `${filtered.length}${isFiltered ? ' / ' + rows.length : ''}`,
            color: 'text-gray-900',
          },
          {
            label: 'TRY Ciro',
            value: fmt(totalRev),
            color: 'text-gray-900',
          },
          {
            label: 'Nominal Kâr',
            value: fmt(totalPft),
            color: totalPft >= 0 ? 'text-emerald-700' : 'text-red-600',
          },
        ].map(card => (
          <div key={card.label} className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-1">{card.label}</div>
            <div className={`text-xl font-black tabular-nums ${card.color}`}>{card.value}</div>
          </div>
        ))}
      </div>

      {/* ── Table ──────────────────────────────────────────────────────────── */}
      {filtered.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl text-center py-14">
          <div className="text-3xl mb-3">🔍</div>
          <p className="text-gray-500 font-medium text-sm">Eşleşen satış bulunamadı.</p>
          {isFiltered && (
            <button
              onClick={clearFilters}
              className="mt-3 text-xs text-primary-600 hover:underline font-semibold"
            >
              Filtreleri temizle
            </button>
          )}
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          {/* Header */}
          <div className="grid grid-cols-12 text-[10px] font-bold text-gray-400 px-5 py-3 border-b border-gray-100 uppercase tracking-widest">
            <div className="col-span-3">Müşteri</div>
            <div className="col-span-2">Proforma</div>
            <div className="col-span-2">Tarih</div>
            <div className="col-span-2 text-right">Tutar</div>
            <div className="col-span-1 text-right">Kâr</div>
            <div className="col-span-2 text-center">Durum</div>
          </div>

          {/* Rows */}
          <div className="divide-y divide-gray-50">
            {filtered.map(s => (
              <Link
                key={s.id}
                href={`/dashboard/sales/${s.id}`}
                className="grid grid-cols-12 items-center px-5 py-3.5 hover:bg-gray-50/60 transition-colors"
              >
                <div className="col-span-3 text-sm font-semibold truncate">{s.customer_name}</div>

                <div className="col-span-2 text-xs font-mono text-gray-500">
                  {s.proforma_no
                    ? (s.proforma_deleted ? <span className="line-through text-gray-400">{s.proforma_no}</span> : s.proforma_no)
                    : '—'}
                </div>

                <div className="col-span-2 text-sm text-gray-500">
                  {s.sale_date ? fmtDate(s.sale_date) : '—'}
                </div>

                <div className="col-span-2 text-right text-sm tabular-nums">
                  {s.currency !== 'TRY' ? (
                    <span>
                      <span className="font-medium">{s.currency} {s.total.toFixed(2)}</span>
                      <span className="block text-[10px] text-gray-400">≈ {fmt(s.total_try)}</span>
                    </span>
                  ) : fmt(s.total)}
                </div>

                <div className={`col-span-1 text-right text-xs font-bold tabular-nums ${s.nominal_profit >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                  {fmt(s.nominal_profit)}
                </div>

                <div className="col-span-2 flex justify-center gap-1 flex-wrap">
                  <StatusBadge map={PAYMENT_META}  val={s.payment_status} />
                  <StatusBadge map={SHIPMENT_META} val={s.shipment_status} />
                </div>
              </Link>
            ))}
          </div>

          {/* Footer count */}
          {isFiltered && (
            <div className="px-5 py-2 border-t border-gray-100 bg-gray-50/60">
              <span className="text-[10px] text-gray-400">
                {filtered.length} gösteriliyor · toplam {rows.length} satış
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
