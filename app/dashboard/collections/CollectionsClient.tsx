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

import { useEffect, useRef, useState, useCallback, useMemo, type ChangeEvent } from 'react'

export interface CollectionRow {
  id: string
  customer_name: string
  currency: string
  total: number
  total_try: number
  /** Business invoice date (YYYY-MM-DD) — preferred for display/aging */
  sale_date: string | null
  created_at: string
  due_date: string | null
  amount_paid: number | null
  proforma_id: string | null
  payment_status: 'pending' | 'paid' | 'partial' | 'overdue'
  paid_at: string | null
  proformas: { proforma_no: string } | null
}

// 'unpaid' = pending + partial + overdue (all not-yet-collected rows)
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
  // If a due_date is set, use it as the primary signal
  if (row.due_date) return row.due_date < TODAY
  // No due_date: fall back to sale_date — sales older than 30 days without a due date
  // are considered overdue (matches situation-summary aging logic)
  if (row.sale_date) {
    const saleAge = (new Date(TODAY).getTime() - new Date(row.sale_date).getTime()) / 86_400_000
    return saleAge > 30
  }
  return false
}

const STATUS_META = {
  pending:   { label: 'Bekliyor',  bg: 'bg-warn-light',   text: 'text-warn-text',  border: 'border-warn-light'  },
  paid:      { label: 'Ödendi',    bg: 'bg-pos-light', text: 'text-pos-text', border: 'border-pos-light' },
  partial:   { label: 'Kısmi',     bg: 'bg-info-light',    text: 'text-info-text',   border: 'border-info-light'   },
  overdue:   { label: 'Gecikmiş',  bg: 'bg-neg-light',     text: 'text-neg-text',    border: 'border-neg-light'    },
  cancelled: { label: 'İptal',     bg: 'bg-[#f8fafc]',    text: 'text-[#64748b]',   border: 'border-[#e2e8f0]'   },
} as const

function StatusBadge({ status }: { status: string }) {
  const m = STATUS_META[status as keyof typeof STATUS_META] ?? STATUS_META.pending
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold border ${m.bg} ${m.text} ${m.border}`}>
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
  // Start false: initial "unpaid" data comes from server — no spinner on first paint
  const [loading,    setLoading]    = useState(false)
  const [tab,        setTab]        = useState<TabKey>('unpaid')
  const [patching,   setPatching]   = useState<string | null>(null)
  const [error,      setError]      = useState<string | null>(null)
  const [search,     setSearch]     = useState('')

  // Track whether the 'unpaid' data was seeded from the server SSR pass.
  // We skip the initial client fetch for 'unpaid' if the server already gave us rows
  // to avoid overwriting good SSR data with a client fetch that might fail or return
  // a different subset.
  const serverSeededRef = useRef(initialRows.length > 0)

  // Partial payment state — which row is expanded + the entered amount
  const [partialId,  setPartialId]  = useState<string | null>(null)
  const [partialAmt, setPartialAmt] = useState('')
  const [partialErr, setPartialErr] = useState('')

  // ── Search filter (applied on top of tab rows, client-side only) ─────────────
  const displayRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(r => r.customer_name.toLowerCase().includes(q))
  }, [rows, search])

  // ── Data load ───────────────────────────────────────────────────────────────
  const load = useCallback(async (status: TabKey, signal?: AbortSignal) => {
    setLoading(true)
    setError(null)
    // Snapshot current rows so we can restore on error
    let prevRows: CollectionRow[] = []
    setRows(prev => { prevRows = prev; return prev })
    try {
      const res = await fetch(`/api/collections?status=${status}`, { signal })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `HTTP ${res.status}`)
      }
      const data = await res.json()
      const fetched: CollectionRow[] = Array.isArray(data) ? data : (data?.data ?? [])
      setRows(fetched)
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return
      // On error: keep existing rows visible — don't blank the list
      setRows(prevRows)
      setError('Tahsilat verileri yüklenemedi — önceki veriler gösteriliyor.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // Skip the initial fetch for 'unpaid' tab when SSR already seeded the rows.
    // Only fetch when switching away from the server-seeded tab, or when SSR gave 0 rows.
    if (tab === 'unpaid' && serverSeededRef.current) {
      serverSeededRef.current = false  // allow future manual refreshes
      return
    }
    const ctrl = new AbortController()
    load(tab, ctrl.signal)
    return () => ctrl.abort()
  }, [tab, load])

  // ── PATCH helper ─────────────────────────────────────────────────────────────
  // Returns true on success, false on failure — callers must check before
  // closing forms or clearing state.
  async function patch(id: string, status: CollectionRow['payment_status'], amountPaid?: number): Promise<boolean> {
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
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Güncelleme hatası')
      return false
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
    const ok = await patch(row.id, 'partial', amt)
    // Only collapse the form on success — keep it open so the user can retry
    if (!ok) return
    setPartialId(null)
    setPartialAmt('')
    // Re-fetch so the row's new status is reflected correctly in this tab
    await load(tab)
  }

  // ── Derived / grouping ────────────────────────────────────────────────────────
  const overdueRows   = displayRows.filter(r => isOverdue(r))
  const regularRows   = displayRows.filter(r => !isOverdue(r))

  const paidTotal     = displayRows.filter(r => r.payment_status === 'paid').reduce((s, r) => s + (r.total_try ?? 0), 0)
  const unpaidTotal   = displayRows.filter(r => r.payment_status !== 'paid').reduce((s, r) => s + (r.total_try ?? 0), 0)
  const overdueTotal  = overdueRows.reduce((s, r) => s + (r.total_try ?? 0), 0)

  // Tab counts shown on all tab (not filtered by search — shows what's in server data)
  const pendingCount  = rows.filter(r => r.payment_status !== 'paid').length
  const paidCount     = rows.filter(r => r.payment_status === 'paid').length

  const TABS: { key: TabKey; label: string; count?: number }[] = [
    { key: 'unpaid', label: 'Bekleyenler', count: pendingCount },
    { key: 'paid',   label: 'Ödenenler',   count: paidCount    },
    { key: 'all',    label: 'Tümü',        count: rows.length  },
  ]

  // ── Row renderer ─────────────────────────────────────────────────────────────
  function renderRow(row: CollectionRow, isOD: boolean) {
    const isPending     = patching === row.id
    const isExpanded    = partialId === row.id
    const remaining     = row.total_try - (row.amount_paid ?? 0)
    const hasPartialAmt = row.payment_status === 'partial' && (row.amount_paid ?? 0) > 0
    const dueDateStr    = row.due_date
      ? (isOD
        ? <span className="text-neg font-bold">{fmtDateShort(row.due_date)} GECİKTİ</span>
        : <span className="text-[#64748b]">{fmtDateShort(row.due_date)}</span>)
      : <span className="text-[#94a3b8]">{fmtDateShort(row.sale_date || row.created_at)}</span>

    return (
      <div
        key={row.id}
        className={`border-b border-[#f1f5f9] last:border-0 ${isOD ? 'border-l-2 border-l-[#dc2626] bg-neg-light/30' : ''}`}
      >
        {/* Main row */}
        <div className="flex items-center gap-3 px-4 py-3 flex-wrap">

          {/* Customer + proforma */}
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold text-[#0f172a] truncate">
              {row.customer_name || '—'}
            </div>
            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
              {dueDateStr}
              {row.proformas?.proforma_no && (
                <span className="text-[10px] font-mono text-brand-light">
                  {row.proformas.proforma_no}
                </span>
              )}
              {row.paid_at && row.payment_status === 'paid' && (
                <span className="text-[10px] text-pos-text">
                  Ödendi: {fmtDateShort(row.paid_at)}
                </span>
              )}
            </div>
          </div>

          {/* Amounts */}
          <div className="text-right shrink-0">
            <div className="text-xs font-black tabular-nums text-[#0f172a]">
              {row.currency !== 'TRY'
                ? fmtForeign(row.total, row.currency)
                : fmtTRY(row.total_try)}
            </div>
            {row.currency !== 'TRY' && (
              <div className="text-[10px] text-[#94a3b8] tabular-nums">
                ≈ {fmtTRY(row.total_try)}
              </div>
            )}
            {hasPartialAmt && (
              <div className="text-[10px] text-pos-text tabular-nums">
                Ödenen: {fmtTRY(row.amount_paid ?? 0)}
              </div>
            )}
            {hasPartialAmt && (
              <div className="text-[10px] text-warn-text tabular-nums font-semibold">
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
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded text-[11px] font-semibold bg-pos-light text-pos-text hover:bg-pos-light border border-pos-light transition-colors disabled:opacity-50"
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
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded text-[11px] font-semibold bg-info-light text-info-text hover:bg-info-light border border-info-light transition-colors disabled:opacity-50"
                >
                  ½ Kısmi
                </button>
                {!isOD && (
                  <button
                    disabled={isPending}
                    onClick={() => patch(row.id, 'overdue')}
                    className="inline-flex items-center gap-1 px-2 py-1.5 rounded text-[11px] font-semibold bg-neg-light text-neg hover:bg-neg-light border border-neg-light transition-colors disabled:opacity-50"
                  >
                    Gecikmiş
                  </button>
                )}
              </>
            )}
            {row.payment_status === 'paid' && (
              <button
                disabled={isPending}
                onClick={() => patch(row.id, 'pending')}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded text-[11px] font-medium bg-[#f8fafc] text-[#64748b] hover:bg-[#f1f5f9] border border-[#e2e8f0] transition-colors disabled:opacity-50"
              >
                ↩ Geri Al
              </button>
            )}
          </div>
        </div>

        {/* Partial payment inline form */}
        {isExpanded && (
          <div className="px-4 pb-3 flex items-center gap-2 bg-info-light/40 border-t border-info-light">
            <div className="flex-1 flex items-center gap-2">
              <span className="text-[10px] font-bold text-info-text uppercase tracking-wide whitespace-nowrap">
                Kısmi ödeme (₺)
              </span>
              <input
                type="number"
                min="0.01"
                step="0.01"
                placeholder={`0,00 — max ${fmtTRY(row.total_try)}`}
                value={partialAmt}
                onChange={(e: ChangeEvent<HTMLInputElement>) => { setPartialAmt(e.target.value); setPartialErr('') }}
                className="flex-1 border border-info-light rounded px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-300 tabular-nums bg-white"
                autoFocus
              />
              {partialErr && (
                <span className="text-[10px] text-neg font-semibold shrink-0">{partialErr}</span>
              )}
            </div>
            <button
              disabled={isPending}
              onClick={() => savePartial(row)}
              className="px-3 py-1.5 rounded text-[11px] font-bold bg-info text-white hover:bg-info transition-colors disabled:opacity-50 shrink-0"
            >
              {isPending ? '…' : 'Kaydet'}
            </button>
            <button
              onClick={() => { setPartialId(null); setPartialAmt(''); setPartialErr('') }}
              className="px-2.5 py-1.5 rounded text-[11px] font-semibold text-[#64748b] hover:bg-[#f1f5f9] transition-colors shrink-0"
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
        <div className="flex items-center gap-2 flex-wrap">
          {/* Customer search */}
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94a3b8] text-sm select-none">⌕</span>
            <input
              type="text"
              placeholder="Müşteri ara…"
              value={search}
              onChange={e => { setSearch(e.target.value) }}
              className="pl-8 pr-3 py-1.5 text-xs border border-[#e2e8f0] rounded focus:outline-none focus:ring-2 focus:ring-brand/30 bg-white w-44"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#94a3b8] hover:text-[#64748b]"
              >
                ✕
              </button>
            )}
          </div>
          {/* Tab switcher */}
          <div className="flex gap-1 bg-[#f1f5f9] rounded p-1">
            {TABS.map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`px-3 py-1.5 rounded text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                  tab === t.key ? 'bg-white text-[#0f172a] shadow-sm' : 'text-[#64748b] hover:text-[#334155]'
                }`}
              >
                {t.label}
                {t.count !== undefined && !loading && (
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                    tab === t.key ? 'bg-[#f1f5f9] text-[#64748b]' : 'bg-[#e2e8f0] text-[#64748b]'
                  }`}>
                    {t.count}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-white rounded border border-[#e2e8f0] px-4 py-3 shadow-sm">
          <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-1">Gösterilen</div>
          <div className="text-xl font-black tabular-nums text-[#0f172a]">
            {loading ? '—' : fmtTRY(displayRows.reduce((s, r) => s + (r.total_try ?? 0), 0))}
          </div>
          <div className="text-[10px] text-[#94a3b8] mt-0.5">
            {search ? `${displayRows.length} / ${rows.length} kayıt` : `${rows.length} kayıt`}
          </div>
        </div>
        <div className="bg-white rounded border border-[#e2e8f0] px-4 py-3 shadow-sm">
          <div className="text-[10px] font-bold uppercase tracking-widest text-warn mb-1">Bekliyor</div>
          <div className="text-xl font-black tabular-nums text-warn-text">
            {loading ? '—' : fmtTRY(unpaidTotal)}
          </div>
          <div className="text-[10px] text-[#94a3b8] mt-0.5">
            {overdueRows.length > 0 && (
              <span className="text-neg font-semibold">{overdueRows.length} gecikmiş · </span>
            )}
            {displayRows.filter(r => r.payment_status !== 'paid').length} satış
          </div>
        </div>
        <div className="bg-white rounded border border-[#e2e8f0] px-4 py-3 shadow-sm">
          <div className="text-[10px] font-bold uppercase tracking-widest text-pos mb-1">Tahsil Edildi</div>
          <div className="text-xl font-black tabular-nums text-pos-text">
            {loading ? '—' : fmtTRY(paidTotal)}
          </div>
          <div className="text-[10px] text-[#94a3b8] mt-0.5">
            {displayRows.filter(r => r.payment_status === 'paid').length} satış
          </div>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="bg-neg-light border border-neg-light rounded px-4 py-3 text-xs text-neg-text font-medium flex items-center justify-between">
          {error}
          <button onClick={() => setError(null)} className="text-neg hover:text-neg ml-4">✕</button>
        </div>
      )}

      {/* Main table */}
      <div className="bg-white rounded border border-[#e2e8f0] overflow-hidden shadow-sm">

        {loading ? (
          <div className="py-16 flex items-center justify-center">
            <div className="w-5 h-5 border-2 border-brand border-t-transparent rounded-full animate-spin" />
          </div>
        ) : displayRows.length === 0 ? (
          <div className="py-12 text-center">
            <div className="text-xs font-medium text-[#334155] mb-1">
              {search
                ? 'Eşleşen kayıt bulunamadı'
                : tab === 'unpaid' ? 'Bekleyen tahsilat yok' : 'Bu filtrede kayıt yok'}
            </div>
            <div className="text-[0.65rem] text-[#94a3b8]">
              {search ? `"${search}" araması için sonuç yok` : 'Tüm tahsilatlar bu görünümde gösterilir'}
            </div>
            {search && (
              <button onClick={() => setSearch('')} className="mt-3 text-xs font-semibold text-brand hover:text-brand-light">
                Aramayı temizle
              </button>
            )}
          </div>
        ) : (
          <div>
            {/* Overdue section — pinned at top */}
            {overdueRows.length > 0 && (
              <div>
                <div className="flex items-center gap-2 px-4 py-2 bg-neg-light border-b border-neg-light">
                  <span className="text-[0.65rem] font-black uppercase tracking-widest text-neg">
                    Vadesi Geçmiş
                  </span>
                  <span className="text-[10px] font-bold bg-neg-light text-neg-text px-1.5 py-0.5 rounded">
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
                  <div className="px-4 py-2 bg-[#f8fafc] border-b border-[#e2e8f0]">
                    <span className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">
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
        <p className="text-[10px] text-[#94a3b8] text-center">
          {search
            ? `${displayRows.length} sonuç gösteriliyor — toplam ${rows.length} kayıt`
            : `${rows.length} kayıt`
          }
        </p>
      )}
    </div>
  )
}
