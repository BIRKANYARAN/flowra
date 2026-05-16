'use client'

// ─────────────────────────────────────────────────────────────────────────────
// CollectionsClient — interactive shell for /dashboard/collections
//
// Receives `initialRows` from the server component (page.tsx) which pre-fetches
// the first page of unpaid rows server-side.  The initial render therefore
// shows data immediately with no loading spinner.
//
// Tab switching + mutations remain fully client-side via /api/collections.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState, useCallback, type ChangeEvent } from 'react'

export interface CollectionRow {
  id: string
  customer_name: string
  currency: string
  total: number
  total_try: number
  created_at: string
  due_date: string | null
  amount_paid: number | null
  proforma_id: string | null
  payment_status: 'unpaid' | 'paid' | 'partial' | 'overdue'
  paid_at: string | null
  proformas: { proforma_no: string } | null
}

type TabKey = 'unpaid' | 'paid' | 'all'

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtTRY(n: number) {
  return new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n) || 0) + ' ₺'
}

function fmtForeign(n: number, currency: string) {
  const sym = currency === 'USD' ? '$' : currency === 'EUR' ? '€' : currency === 'GBP' ? '£' : ''
  if (!sym) return fmtTRY(n)
  return sym + new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n) || 0)
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' })
}

function fmtDateShort(iso: string) {
  return new Date(iso).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' })
}

const TODAY = new Date().toISOString().slice(0, 10)

function isOverdue(row: CollectionRow): boolean {
  if (row.payment_status === 'paid') return false
  if (!row.due_date) return false
  return row.due_date < TODAY
}

const STATUS_META = {
  unpaid:  { label: 'Bekliyor',  bg: 'bg-amber-50',   text: 'text-amber-700',  border: 'border-amber-200'  },
  paid:    { label: 'Ödendi',    bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  partial: { label: 'Kısmi',     bg: 'bg-blue-50',    text: 'text-blue-700',   border: 'border-blue-200'   },
  overdue: { label: 'Gecikmiş',  bg: 'bg-red-50',     text: 'text-red-700',    border: 'border-red-200'    },
} as const

function StatusBadge({ status }: { status: string }) {
  const m = STATUS_META[status as keyof typeof STATUS_META] ?? STATUS_META.unpaid
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-bold border ${m.bg} ${m.text} ${m.border}`}>
      {m.label}
    </span>
  )
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  /** Initial "unpaid" rows fetched server-side — shown immediately, no spinner */
  initialRows: CollectionRow[]
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function CollectionsClient({ initialRows }: Props) {
  const [rows,       setRows]       = useState<CollectionRow[]>(initialRows)
  // Start false: initial "unpaid" data comes from server
  const [loading,    setLoading]    = useState(false)
  const [tab,        setTab]        = useState<TabKey>('unpaid')
  const [patching,   setPatching]   = useState<string | null>(null)
  const [error,      setError]      = useState<string | null>(null)

  // Partial payment state — which row is expanded + the entered amount
  const [partialId,  setPartialId]  = useState<string | null>(null)
  const [partialAmt, setPartialAmt] = useState('')
  const [partialErr, setPartialErr] = useState('')

  // ── Data load ───────────────────────────────────────────────────────────────
  const load = useCallback(async (status: TabKey) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/collections?status=${status}`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `HTTP ${res.status}`)
      }
      const data = await res.json()
      // API now returns { data, page, page_size, total } — handle both shapes
      const rows = Array.isArray(data) ? data : (data?.data ?? [])
      setRows(rows)
    } catch {
      setError('Tahsilat verileri yüklenemedi.')
    } finally {
      setLoading(false)
    }
  }, [])

  // Only fetch when the user switches away from the initial "unpaid" tab
  useEffect(() => {
    if (tab !== 'unpaid') {
      load(tab)
    } else {
      // Refresh unpaid when returning to it (data may have changed via mutations)
      // But only after the first mount — use a flag to skip initial render
      load(tab)
    }
  }, [tab, load])

  // ── PATCH helper ─────────────────────────────────────────────────────────────
  async function patch(id: string, status: CollectionRow['payment_status'], amountPaid?: number) {
    setPatching(id)
    try {
      const body: Record<string, unknown> = { id, payment_status: status }
      if (amountPaid !== undefined) body.amount_paid = amountPaid
      const res = await fetch('/api/collections', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error ?? 'Güncelleme başarısız')
      }
      // Optimistic update
      if (tab === 'all') {
        setRows(prev => prev.map(r => r.id === id ? {
          ...r,
          payment_status: status,
          amount_paid: amountPaid !== undefined ? amountPaid : r.amount_paid,
          paid_at: status === 'paid' ? new Date().toISOString() : null,
        } : r))
      } else {
        // Remove from filtered view if no longer belongs
        if (tab === 'unpaid' && status === 'paid') {
          setRows(prev => prev.filter(r => r.id !== id))
        } else if (tab === 'paid' && status !== 'paid') {
          setRows(prev => prev.filter(r => r.id !== id))
        } else {
          setRows(prev => prev.map(r => r.id === id ? {
            ...r,
            payment_status: status,
            amount_paid: amountPaid !== undefined ? amountPaid : r.amount_paid,
            paid_at: status === 'paid' ? new Date().toISOString() : null,
          } : r))
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Güncelleme hatası')
    } finally {
      setPatching(null)
    }
  }

  // ── Partial payment submit ────────────────────────────────────────────────────
  async function savePartial(row: CollectionRow) {
    const amt = parseFloat(partialAmt.replace(',', '.'))
    if (!Number.isFinite(amt) || amt <= 0) {
      setPartialErr('Geçerli bir tutar girin')
      return
    }
    if (amt >= row.total_try) {
      setPartialErr('Tam tutar için "Tahsil Et" butonunu kullanın')
      return
    }
    setPartialErr('')
    await patch(row.id, 'partial', amt)
    setPartialId(null)
    setPartialAmt('')
    // Re-fetch so the row's new status is reflected correctly in this tab
    await load(tab)
  }

  // ── Derived / grouping ────────────────────────────────────────────────────────
  const overdueRows   = rows.filter(r => isOverdue(r))
  const regularRows   = rows.filter(r => !isOverdue(r))

  const paidTotal     = rows.filter(r => r.payment_status === 'paid').reduce((s, r) => s + (r.total_try ?? 0), 0)
  const unpaidTotal   = rows.filter(r => r.payment_status !== 'paid').reduce((s, r) => s + (r.total_try ?? 0), 0)
  const overdueTotal  = overdueRows.reduce((s, r) => s + (r.total_try ?? 0), 0)

  const TABS: { key: TabKey; label: string }[] = [
    { key: 'unpaid', label: 'Bekleyenler' },
    { key: 'paid',   label: 'Ödenenler'   },
    { key: 'all',    label: 'Tümü'        },
  ]

  // ── Row renderer ─────────────────────────────────────────────────────────────
  function renderRow(row: CollectionRow, isOD: boolean) {
    const isPending     = patching === row.id
    const isExpanded    = partialId === row.id
    const remaining     = row.total_try - (row.amount_paid ?? 0)
    const hasPartialAmt = row.payment_status === 'partial' && (row.amount_paid ?? 0) > 0
    const dueDateStr    = row.due_date
      ? (isOD
        ? <span className="text-red-600 font-bold">{fmtDateShort(row.due_date)} GECİKTİ</span>
        : <span className="text-gray-500">{fmtDateShort(row.due_date)}</span>)
      : <span className="text-gray-400">{fmtDateShort(row.created_at)}</span>

    return (
      <div
        key={row.id}
        className={`border-b border-gray-50 last:border-0 ${isOD ? 'border-l-2 border-l-red-400 bg-red-50/30' : ''}`}
      >
        {/* Main row */}
        <div className="flex items-center gap-3 px-4 py-3 flex-wrap">

          {/* Customer + proforma */}
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold text-gray-900 truncate">
              {row.customer_name || '—'}
            </div>
            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
              {dueDateStr}
              {row.proformas?.proforma_no && (
                <span className="text-[10px] font-mono text-primary-500">
                  {row.proformas.proforma_no}
                </span>
              )}
              {row.paid_at && row.payment_status === 'paid' && (
                <span className="text-[10px] text-emerald-600">
                  Ödendi: {fmtDateShort(row.paid_at)}
                </span>
              )}
            </div>
          </div>

          {/* Amounts */}
          <div className="text-right shrink-0">
            <div className="text-xs font-black tabular-nums text-gray-900">
              {row.currency !== 'TRY'
                ? fmtForeign(row.total, row.currency)
                : fmtTRY(row.total_try)}
            </div>
            {row.currency !== 'TRY' && (
              <div className="text-[10px] text-gray-400 tabular-nums">
                ≈ {fmtTRY(row.total_try)}
              </div>
            )}
            {hasPartialAmt && (
              <div className="text-[10px] text-emerald-600 tabular-nums">
                Ödenen: {fmtTRY(row.amount_paid ?? 0)}
              </div>
            )}
            {hasPartialAmt && (
              <div className="text-[10px] text-amber-600 tabular-nums font-semibold">
                Kalan: {fmtTRY(remaining)}
              </div>
            )}
          </div>

          {/* Status badge */}
          <div className="shrink-0">
            <StatusBadge status={isOD ? 'overdue' : row.payment_status} />
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-1 shrink-0">
            {row.payment_status !== 'paid' && (
              <>
                <button
                  disabled={isPending}
                  onClick={() => patch(row.id, 'paid')}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 transition-colors disabled:opacity-50"
                >
                  {isPending ? '⟳' : '✓'} Tahsil Et
                </button>
                <button
                  disabled={isPending}
                  onClick={() => {
                    if (isExpanded) {
                      setPartialId(null); setPartialAmt(''); setPartialErr('')
                    } else {
                      setPartialId(row.id)
                      setPartialAmt(row.amount_paid ? String(row.amount_paid) : '')
                      setPartialErr('')
                    }
                  }}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 transition-colors disabled:opacity-50"
                >
                  ½ Kısmi
                </button>
                {!isOD && (
                  <button
                    disabled={isPending}
                    onClick={() => patch(row.id, 'overdue')}
                    className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-semibold bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 transition-colors disabled:opacity-50"
                  >
                    Gecikmiş
                  </button>
                )}
              </>
            )}
            {row.payment_status === 'paid' && (
              <button
                disabled={isPending}
                onClick={() => patch(row.id, 'unpaid')}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-gray-50 text-gray-500 hover:bg-gray-100 border border-gray-200 transition-colors disabled:opacity-50"
              >
                ↩ Geri Al
              </button>
            )}
          </div>
        </div>

        {/* Partial payment inline form */}
        {isExpanded && (
          <div className="px-4 pb-3 flex items-center gap-2 bg-blue-50/40 border-t border-blue-100">
            <div className="flex-1 flex items-center gap-2">
              <span className="text-[10px] font-bold text-blue-600 uppercase tracking-wide whitespace-nowrap">
                Kısmi ödeme (₺)
              </span>
              <input
                type="number"
                min="0.01"
                step="0.01"
                placeholder={`0,00 — max ${fmtTRY(row.total_try)}`}
                value={partialAmt}
                onChange={(e: ChangeEvent<HTMLInputElement>) => { setPartialAmt(e.target.value); setPartialErr('') }}
                className="flex-1 border border-blue-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-300 tabular-nums bg-white"
                autoFocus
              />
              {partialErr && (
                <span className="text-[10px] text-red-600 font-semibold shrink-0">{partialErr}</span>
              )}
            </div>
            <button
              disabled={isPending}
              onClick={() => savePartial(row)}
              className="px-3 py-1.5 rounded-lg text-[11px] font-bold bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-50 shrink-0"
            >
              {isPending ? '…' : 'Kaydet'}
            </button>
            <button
              onClick={() => { setPartialId(null); setPartialAmt(''); setPartialErr('') }}
              className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-gray-500 hover:bg-gray-100 transition-colors shrink-0"
            >
              İptal
            </button>
          </div>
        )}
      </div>
    )
  }

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-5xl flex flex-col gap-4">

      {/* Header + tabs */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-black text-gray-900 tracking-tight">Tahsilatlar</h1>
          <p className="text-xs text-gray-400 mt-0.5">Satış ödemelerini takip edin</p>
        </div>
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                tab === t.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-white rounded-xl border border-gray-200 px-4 py-3">
          <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">Toplam</div>
          <div className="text-xl font-black tabular-nums text-gray-900">
            {loading ? '—' : fmtTRY(rows.reduce((s, r) => s + (r.total_try ?? 0), 0))}
          </div>
          <div className="text-[10px] text-gray-400 mt-0.5">{rows.length} kayıt</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 px-4 py-3">
          <div className="text-[10px] font-bold uppercase tracking-widest text-amber-500 mb-1">Bekliyor</div>
          <div className="text-xl font-black tabular-nums text-amber-700">
            {loading ? '—' : fmtTRY(unpaidTotal)}
          </div>
          <div className="text-[10px] text-gray-400 mt-0.5">
            {overdueRows.length > 0 && (
              <span className="text-red-600 font-semibold">{overdueRows.length} gecikmiş · </span>
            )}
            {rows.filter(r => r.payment_status !== 'paid').length} satış
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 px-4 py-3">
          <div className="text-[10px] font-bold uppercase tracking-widest text-emerald-500 mb-1">Tahsil Edildi</div>
          <div className="text-xl font-black tabular-nums text-emerald-700">
            {loading ? '—' : fmtTRY(paidTotal)}
          </div>
          <div className="text-[10px] text-gray-400 mt-0.5">
            {rows.filter(r => r.payment_status === 'paid').length} satış
          </div>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-xs text-red-700 font-medium flex items-center justify-between">
          {error}
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600 ml-4">✕</button>
        </div>
      )}

      {/* Main table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">

        {loading ? (
          <div className="py-16 flex items-center justify-center">
            <div className="w-5 h-5 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : rows.length === 0 ? (
          <div className="py-16 text-center">
            <div className="text-2xl mb-2">🎉</div>
            <div className="text-sm text-gray-400">
              {tab === 'unpaid' ? 'Bekleyen tahsilat yok' : 'Bu filtrede kayıt yok'}
            </div>
          </div>
        ) : (
          <div>
            {/* Overdue section — pinned at top */}
            {overdueRows.length > 0 && (
              <div>
                <div className="flex items-center gap-2 px-4 py-2 bg-red-50 border-b border-red-100">
                  <span className="text-[10px] font-black uppercase tracking-widest text-red-500">
                    Vadesi Geçmiş
                  </span>
                  <span className="text-[10px] font-bold bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full">
                    {overdueRows.length} kayıt · {fmtTRY(overdueTotal)}
                  </span>
                </div>
                {overdueRows.map(r => renderRow(r, true))}
              </div>
            )}

            {/* Regular rows */}
            {regularRows.length > 0 && (
              <div>
                {overdueRows.length > 0 && regularRows.length > 0 && (
                  <div className="px-4 py-2 bg-gray-50 border-b border-gray-100">
                    <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">
                      Diğer Kayıtlar
                    </span>
                  </div>
                )}
                {regularRows.map(r => renderRow(r, false))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer note */}
      {!loading && rows.length > 0 && (
        <p className="text-[10px] text-gray-400 text-center">
          Son 50 kayıt · Eski verilere Analitik sayfasından ulaşabilirsiniz.
        </p>
      )}
    </div>
  )
}
