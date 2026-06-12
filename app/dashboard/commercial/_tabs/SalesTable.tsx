'use client'

// ── SalesTable — client island for the Commercial / Sales tab ─────────────────
// Receives pre-fetched rows from the SalesContent server component.
// All filtering is done client-side (no extra API calls).

import { useState, useMemo, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import type { NormalizedSaleRow } from '@/lib/normalize'
import { formatTRY, fmtDate } from '@/lib/format'
import { SaleCreateDrawer } from './SaleCreateDrawer'

// ── Lookups ───────────────────────────────────────────────────────────────────

const PAYMENT_META: Record<string, { label: string; cls: string }> = {
  pending:   { label: 'Bekliyor', cls: 'bg-warn-light text-warn-text border-warn-light' },
  paid:      { label: 'Ödendi',   cls: 'bg-pos-light text-pos-text border-pos-light' },
  partial:   { label: 'Kısmi',    cls: 'bg-info-light text-info-text border-info-light' },
  overdue:   { label: 'Gecikmiş', cls: 'bg-neg-light text-neg border-neg-light' },
  cancelled: { label: 'İptal',    cls: 'bg-[#f8fafc] text-[#94a3b8] border-[#e8eaef]' },
}

const SHIPMENT_META: Record<string, { label: string; cls: string }> = {
  pending:   { label: 'Hazırlanıyor', cls: 'bg-[#f8fafc] text-[#64748b] border-[#e8eaef]' },
  shipped:   { label: 'Kargoda',      cls: 'bg-info-light text-info-text border-info-light' },
  delivered: { label: 'Teslim',       cls: 'bg-pos-light text-pos-text border-pos-light' },
}

const ACTIONABLE_STATUSES = new Set(['pending', 'partial', 'overdue'])

function StatusBadge({ map, val }: { map: Record<string, { label: string; cls: string }>; val: string | null }) {
  if (!val) return null
  const m = map[val] ?? { label: val, cls: 'bg-[#f8fafc] text-[#94a3b8] border-[#e8eaef]' }
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded border text-[10px] font-bold ${m.cls}`}>
      {m.label}
    </span>
  )
}

// ── Payment drawer ────────────────────────────────────────────────────────────

interface PaymentDrawerProps {
  sale: NormalizedSaleRow
  onClose: () => void
  onSuccess: () => void
}

const PAYMENT_METHODS = ['Banka Havalesi', 'Nakit', 'Çek', 'Kredi Kartı'] as const
type PaymentMethod = typeof PAYMENT_METHODS[number]

function PaymentDrawer({ sale, onClose, onSuccess }: PaymentDrawerProps) {
  const alreadyPaid   = sale.paid_amount ?? 0
  const remaining     = Math.max(0, sale.total_try - alreadyPaid)

  const [amount,        setAmount]        = useState(String(remaining || sale.total_try))
  const [date,          setDate]          = useState(new Date().toISOString().slice(0, 10))
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('Banka Havalesi')
  const [saving,        setSaving]        = useState(false)
  const [error,         setError]         = useState('')

  // ESC key closes the drawer
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const parsedAmount   = parseFloat(amount) || 0
  const totalAfterThis = alreadyPaid + parsedAmount
  const isFullPayment  = totalAfterThis >= sale.total_try

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (parsedAmount <= 0) { setError('Geçerli bir tutar girin'); return }
    setSaving(true)
    setError('')

    const status       = isFullPayment ? 'paid' : 'partial'
    const notesPrefix  = `Ödeme yöntemi: ${paymentMethod}`

    try {
      const res = await fetch(`/api/sales/${sale.id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          payment_status: status,
          amount_paid:    totalAfterThis,
          notes:          notesPrefix,
        }),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'Hata oluştu'); return }
      onSuccess()
    } catch {
      setError('Bağlantı hatası. Tekrar deneyin.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-[#0f172a]/30 z-40"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Slide-in drawer */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Ödeme Kaydet"
        className="fixed right-0 top-0 h-full w-80 bg-white z-50 border-l border-[#e8eaef] flex flex-col"
      >
        {/* Drawer header */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-[#e8eaef]">
          <div>
            <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] leading-none">
              Ödeme Kaydet
            </div>
            <div className="text-sm font-semibold text-[#0f172a] mt-1">{sale.customer_name}</div>
            <div className="text-[10px] text-[#94a3b8] mt-0.5 font-mono">
              Toplam: {formatTRY(sale.total_try)}
            </div>
            {alreadyPaid > 0 && (
              <div className="text-[10px] text-info-text font-semibold mt-0.5 font-mono">
                Daha önce {formatTRY(alreadyPaid)} alındı · kalan {formatTRY(remaining)}
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-[#94a3b8] hover:text-[#334155] transition-colors p-1 -mr-1 leading-none text-lg"
            aria-label="Kapat"
          >
            ✕
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

          {/* Amount */}
          <div>
            <label
              htmlFor="payment-amount"
              className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] block mb-1.5 leading-none"
            >
              Ödeme Tutarı (TRY)
            </label>
            <input
              id="payment-amount"
              type="number"
              step="0.01"
              min="0.01"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              className="w-full border border-[#e8eaef] rounded px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 font-mono tabular-nums"
              required
              autoFocus
            />
            {parsedAmount > 0 && (
              <p className="mt-1 text-[10px] text-[#94a3b8]">
                {isFullPayment ? (
                  <span className="text-pos-text font-semibold">Tam ödeme olarak işlenecek</span>
                ) : (
                  <span className="text-info-text font-semibold">
                    Kısmi ödeme · sonra kalan {formatTRY(sale.total_try - totalAfterThis)}
                  </span>
                )}
              </p>
            )}
          </div>

          {/* Payment method */}
          <div>
            <label
              htmlFor="payment-method"
              className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] block mb-1.5 leading-none"
            >
              Ödeme Yöntemi
            </label>
            <select
              id="payment-method"
              value={paymentMethod}
              onChange={e => setPaymentMethod(e.target.value as PaymentMethod)}
              className="w-full border border-[#e8eaef] rounded px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
            >
              {PAYMENT_METHODS.map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>

          {/* Date */}
          <div>
            <label
              htmlFor="payment-date"
              className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] block mb-1.5 leading-none"
            >
              Ödeme Tarihi
            </label>
            <input
              id="payment-date"
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="w-full border border-[#e8eaef] rounded px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
              required
            />
          </div>

          {error && (
            <p className="text-xs text-neg font-semibold bg-neg-light border border-neg-light rounded px-3 py-2">
              {error}
            </p>
          )}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 border border-[#e8eaef] text-[#64748b] py-2.5 rounded text-sm font-semibold hover:bg-[#f8fafc] transition-colors"
            >
              İptal
            </button>
            <button
              type="submit"
              disabled={saving || parsedAmount <= 0}
              className="flex-1 bg-brand-light text-white py-2.5 rounded text-sm font-semibold hover:bg-brand transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? 'Kaydediliyor…' : 'Kaydet'}
            </button>
          </div>
        </form>
      </div>
    </>
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
  const router = useRouter()

  const [search,       setSearch]       = useState('')
  const [dateRange,    setDateRange]    = useState<DateRange>('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [paymentRow,   setPaymentRow]   = useState<NormalizedSaleRow | null>(null)
  const [showCreate,   setShowCreate]   = useState(false)

  // Task-first: open the create drawer immediately when reached via "+ Yeni" (?new=1)
  const searchParams = useSearchParams()
  useEffect(() => { if (searchParams.get('new') === '1') setShowCreate(true) }, [searchParams])

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

  function clearFilters() {
    setSearch('')
    setDateRange('all')
    setStatusFilter('all')
  }

  function handlePaymentSuccess() {
    setPaymentRow(null)
    router.refresh()
  }

  function handleCreateSuccess() {
    setShowCreate(false)
    router.refresh()
  }

  return (
    <>
      <div className="space-y-4">

        {/* ── Filter bar + action ─────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Search */}
          <div className="relative flex-1 min-w-48">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94a3b8] text-sm select-none pointer-events-none">⌕</span>
            <input
              type="text"
              placeholder="Müşteri ara…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-2 text-sm border border-[#e8eaef] rounded focus:outline-none focus:ring-2 focus:ring-brand/30 bg-white"
            />
          </div>

          {/* Date range */}
          <div className="flex gap-1 bg-[#f1f5f9] rounded p-1">
            {(Object.keys(DATE_RANGE_LABELS) as DateRange[]).map(k => (
              <button
                key={k}
                onClick={() => setDateRange(k)}
                className={`px-3 py-1.5 rounded text-xs font-semibold transition-colors ${
                  dateRange === k ? 'bg-white text-[#0f172a] shadow-sm' : 'text-[#64748b] hover:text-[#334155]'
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
            className="border border-[#e8eaef] rounded px-3 py-2 text-xs font-medium bg-white focus:outline-none focus:ring-2 focus:ring-brand/30"
          >
            {PAYMENT_FILTER_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>

          {/* Clear */}
          {isFiltered && (
            <button
              onClick={clearFilters}
              className="text-xs font-semibold text-[#94a3b8] hover:text-[#334155] px-2 py-1.5 rounded hover:bg-[#f1f5f9] transition-colors"
            >
              Temizle ✕
            </button>
          )}

          {/* Create — stays in filter row, no orphan bar */}
          <button
            onClick={() => setShowCreate(true)}
            className="ml-auto inline-flex items-center gap-1.5 bg-brand-light text-white px-4 py-2 rounded text-sm font-semibold hover:bg-brand transition-colors whitespace-nowrap flex-shrink-0"
          >
            + Satış Oluştur
          </button>
        </div>

        {/* ── KPI strip (live / filtered) ────────────────────────────────────── */}
        <div className="grid grid-cols-3 gap-3">
          {[
            {
              label: isFiltered ? `Gösterilen Satış` : 'Toplam Satış',
              value: `${filtered.length}${isFiltered ? ' / ' + rows.length : ''}`,
              color: 'text-[#0f172a]',
            },
            {
              label: 'TRY Ciro',
              value: formatTRY(totalRev),
              color: 'text-[#0f172a]',
            },
            {
              label: 'Nominal Kâr',
              value: formatTRY(totalPft),
              color: totalPft >= 0 ? 'text-pos-text' : 'text-neg',
            },
          ].map(card => (
            <div key={card.label} className="bg-white border border-[#e8eaef] rounded-xl shadow-soft p-4 shadow-sm">
              <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-1">{card.label}</div>
              <div className={`text-xl font-black tabular-nums ${card.color}`}>{card.value}</div>
            </div>
          ))}
        </div>

        {/* ── Table ──────────────────────────────────────────────────────────── */}
        {filtered.length === 0 ? (
          <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft text-center py-12 shadow-sm">
            <p className="text-[#334155] text-sm font-semibold">{isFiltered ? 'Filtreyle eşleşen satış yok.' : 'Henüz satış kaydı yok'}</p>
            {!isFiltered && (
              <p className="text-[#94a3b8] text-xs mt-1 max-w-sm mx-auto">İlk satışını kaydet; ciro, tahsilat durumu ve aylık trend otomatik hesaplansın.</p>
            )}
            {isFiltered ? (
              <button
                onClick={clearFilters}
                className="mt-2 text-xs text-brand-light hover:text-brand font-semibold"
              >
                Filtreleri temizle →
              </button>
            ) : (
              <button
                onClick={() => setShowCreate(true)}
                className="mt-3 inline-flex items-center gap-1 px-3.5 py-2 rounded-md bg-[#7c3aed] text-white text-xs font-bold hover:bg-[#6d28d9] transition-colors"
              >
                + Yeni Satış
              </button>
            )}
          </div>
        ) : (
          <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft overflow-hidden shadow-sm">
            {/* Header */}
            <div className="grid grid-cols-12 text-[0.65rem] font-black text-[#94a3b8] px-4 py-2 border-b border-[#e8eaef] uppercase tracking-widest">
              <div className="col-span-3">Müşteri</div>
              <div className="col-span-2">Proforma</div>
              <div className="col-span-2">Tarih</div>
              <div className="col-span-2 text-right">Tutar</div>
              <div className="col-span-1 text-right">Kâr</div>
              <div className="col-span-2 text-center">Durum</div>
            </div>

            {/* Rows */}
            <div className="divide-y divide-[#f1f5f9]">
              {filtered.map(s => (
                <div
                  key={s.id}
                  onClick={() => router.push(`/dashboard/sales/${s.id}`)}
                  className="grid grid-cols-12 items-center px-4 py-2 hover:bg-[#f8fafc]/60 transition-colors cursor-pointer"
                >
                  <div className="col-span-3 text-sm font-semibold truncate">{s.customer_name}</div>

                  <div className="col-span-2 text-xs font-mono text-[#64748b]">
                    {s.proforma_no
                      ? (s.proforma_deleted ? <span className="line-through text-[#94a3b8]">{s.proforma_no}</span> : s.proforma_no)
                      : '—'}
                  </div>

                  <div className="col-span-2 text-sm text-[#64748b]">
                    {s.sale_date ? fmtDate(s.sale_date) : '—'}
                  </div>

                  <div className="col-span-2 text-right text-sm tabular-nums">
                    {s.currency !== 'TRY' ? (
                      <span>
                        <span className="font-medium">{s.currency} {s.total.toFixed(2)}</span>
                        <span className="block text-[10px] text-[#94a3b8]">≈ {formatTRY(s.total_try)}</span>
                      </span>
                    ) : formatTRY(s.total)}
                  </div>

                  <div className={`col-span-1 text-right text-xs font-bold tabular-nums ${s.nominal_profit >= 0 ? 'text-pos-text' : 'text-neg'}`}>
                    {formatTRY(s.nominal_profit)}
                  </div>

                  <div className="col-span-2 flex flex-col items-center gap-1">
                    <div className="flex gap-1 flex-wrap justify-center">
                      <StatusBadge map={PAYMENT_META}  val={s.payment_status} />
                      <StatusBadge map={SHIPMENT_META} val={s.shipment_status} />
                    </div>
                    {ACTIONABLE_STATUSES.has(s.payment_status) && (
                      <button
                        onClick={e => { e.stopPropagation(); setPaymentRow(s) }}
                        className="text-[10px] font-semibold text-brand-light hover:text-brand hover:underline transition-colors leading-none"
                      >
                        ₺ Kaydet
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Footer count */}
            {isFiltered && (
              <div className="px-5 py-2 border-t border-[#e8eaef] bg-[#f8fafc]/60">
                <span className="text-[10px] text-[#94a3b8]">
                  {filtered.length} gösteriliyor · toplam {rows.length} satış
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Payment drawer (portal-style, rendered at root level) ─────────────── */}
      {paymentRow && (
        <PaymentDrawer
          sale={paymentRow}
          onClose={() => setPaymentRow(null)}
          onSuccess={handlePaymentSuccess}
        />
      )}

      {/* ── Sale create drawer ────────────────────────────────────────────────── */}
      {showCreate && (
        <SaleCreateDrawer
          onClose={() => setShowCreate(false)}
          onSuccess={handleCreateSuccess}
        />
      )}
    </>
  )
}
