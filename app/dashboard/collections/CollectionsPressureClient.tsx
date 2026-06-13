'use client'

// ── CollectionsPressureClient — Risk-weighted pressure surface ────────────────
// Sprint 3: replaces the tab-based CollectionsClient with risk-sorted rows,
// slide-over customer detail panel, and inline action forms.

import { useCallback, useState, useMemo, useEffect, type ChangeEvent } from 'react'
import { useSearchParams } from 'next/navigation'
import { fmtTRY, fmtDateMed as fmtDate } from '@/lib/format'

export interface CollectionRow {
  id: string
  customer_name: string
  currency: string
  total: number
  total_try: number
  sale_date: string | null
  created_at: string
  due_date: string | null
  amount_paid: number | null
  proforma_id: string | null
  payment_status: 'pending' | 'paid' | 'partial' | 'overdue'
  paid_at: string | null
  proformas: { proforma_no: string } | null
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDateShort(iso: string) {
  return new Date(iso).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' })
}

const TODAY = new Date().toISOString().slice(0, 10)

function daysSinceRef(row: Pick<CollectionRow, 'due_date' | 'sale_date'>): number {
  const refDate = row.due_date ?? row.sale_date ?? ''
  if (!refDate) return 0
  return Math.round((new Date(TODAY).getTime() - new Date(refDate.slice(0, 10)).getTime()) / 86_400_000)
}

function riskScore(row: CollectionRow): number {
  const days   = daysSinceRef(row)
  const amtTry = row.total_try
  return days * 0.6 + (amtTry / 10000) * 0.4
}

type Severity = 'critical' | 'high' | 'medium' | 'normal'

function getSeverity(days: number): Severity {
  if (days > 60)  return 'critical'
  if (days > 30)  return 'high'
  if (days >= 0)  return 'medium'
  return 'normal'
}

const SEVERITY_META: Record<Severity, { label: string; dot: string; rowBg: string; border: string; labelColor: string }> = {
  critical: { label: 'KRİTİK',  dot: 'bg-neg',       rowBg: 'bg-neg-light/30',    border: 'border-l-neg',      labelColor: 'text-neg' },
  high:     { label: 'YÜKSEK',  dot: 'bg-warn',      rowBg: 'bg-warn-light/20',   border: 'border-l-warn',     labelColor: 'text-warn-text' },
  medium:   { label: 'ORTA',    dot: 'bg-yellow-400', rowBg: 'bg-yellow-50/30',   border: 'border-l-yellow-400', labelColor: 'text-yellow-700' },
  normal:   { label: 'GÜNCEL',  dot: 'bg-[#94a3b8]', rowBg: '',                   border: 'border-l-[#e2e8f0]', labelColor: 'text-[#94a3b8]' },
}

// ── Slide-over ────────────────────────────────────────────────────────────────

interface SlideOverProps {
  row: CollectionRow | null
  allRows: CollectionRow[]
  onClose: () => void
  onAction: (id: string, status: CollectionRow['payment_status'], amountPaid?: number) => Promise<boolean>
  onExtend: (id: string, newDate: string) => Promise<boolean>
  onNote: (id: string, note: string) => void
}

function SlideOver({ row, allRows, onClose, onAction, onExtend, onNote }: SlideOverProps) {
  const [payAmt,    setPayAmt]    = useState('')
  const [payErr,    setPayErr]    = useState('')
  const [extending, setExtending] = useState(false)
  const [newDue,    setNewDue]    = useState('')
  const [noteText,  setNoteText]  = useState('')
  const [saving,    setSaving]    = useState(false)
  const [activeAction, setActiveAction] = useState<'pay' | 'extend' | 'note' | null>(null)

  if (!row) return null

  // Capture as non-null for use in async closures (TypeScript narrowing)
  const activeRow: CollectionRow = row

  // All invoices for the same customer
  const sameCustomer = allRows.filter(r => r.customer_name === activeRow.customer_name)
  const customerTotal = sameCustomer.reduce((s, r) => s + Math.max(0, r.total_try - (r.amount_paid ?? 0)), 0)
  const remaining = Math.max(0, activeRow.total_try - (activeRow.amount_paid ?? 0))
  const days      = daysSinceRef(activeRow)
  const severity  = getSeverity(days)
  const meta      = SEVERITY_META[severity]

  async function handlePay() {
    const amt = parseFloat(payAmt.replace(',', '.'))
    if (!Number.isFinite(amt) || amt <= 0) { setPayErr('Geçerli tutar girin'); return }
    setSaving(true)
    if (amt >= activeRow.total_try) {
      await onAction(activeRow.id, 'paid')
    } else {
      await onAction(activeRow.id, 'partial', amt)
    }
    setSaving(false)
    setActiveAction(null)
    setPayAmt('')
  }

  async function handleExtend() {
    if (!newDue) { return }
    setSaving(true)
    await onExtend(activeRow.id, newDue)
    setSaving(false)
    setExtending(false)
    setActiveAction(null)
    setNewDue('')
  }

  function handleNote() {
    if (!noteText.trim()) return
    onNote(activeRow.id, noteText.trim())
    setNoteText('')
    setActiveAction(null)
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/30 z-40 transition-opacity"
        onClick={onClose}
      />
      {/* Panel */}
      <div className="fixed right-0 top-0 h-full w-full max-w-md bg-white shadow-2xl z-50 flex flex-col overflow-hidden">
        {/* Header */}
        <div className={`px-5 py-4 border-b border-[#e8eaef] ${meta.rowBg}`}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className={`w-2.5 h-2.5 rounded-full ${meta.dot} shrink-0`} />
                <span className={`text-[10px] font-bold uppercase tracking-wider ${meta.labelColor}`}>{meta.label}</span>
              </div>
              <h2 className="text-base font-bold text-[#0f172a] mt-1">{activeRow.customer_name}</h2>
              {activeRow.proformas?.proforma_no && (
                <div className="text-[10px] font-mono text-[#94a3b8] mt-0.5">{activeRow.proformas.proforma_no}</div>
              )}
            </div>
            <button
              onClick={onClose}
              className="text-[#94a3b8] hover:text-[#334155] text-lg leading-none p-1"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">

          {/* This invoice */}
          <div className="space-y-2">
            <div className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8]">Bu Fatura</div>
            <div className="bg-[#f8fafc] rounded p-3 space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-[#64748b]">Toplam</span>
                <span className="font-bold tabular-nums">{fmtTRY(activeRow.total_try, 0)}</span>
              </div>
              {(activeRow.amount_paid ?? 0) > 0 && (
                <div className="flex justify-between text-xs">
                  <span className="text-[#64748b]">Ödenen</span>
                  <span className="font-semibold text-pos-text tabular-nums">{fmtTRY(activeRow.amount_paid ?? 0, 0)}</span>
                </div>
              )}
              {(activeRow.amount_paid ?? 0) > 0 && (
                <div className="flex justify-between text-xs border-t border-[#e8eaef] pt-1.5 mt-1.5">
                  <span className="text-[#64748b] font-semibold">Kalan</span>
                  <span className="font-bold text-neg tabular-nums">{fmtTRY(remaining, 0)}</span>
                </div>
              )}
              <div className="flex justify-between text-xs">
                <span className="text-[#64748b]">Satış Tarihi</span>
                <span className="text-[#334155]">{fmtDate(activeRow.sale_date ?? activeRow.created_at)}</span>
              </div>
              {activeRow.due_date && (
                <div className="flex justify-between text-xs">
                  <span className="text-[#64748b]">Vade</span>
                  <span className={days > 0 ? 'text-neg font-semibold' : 'text-[#334155]'}>
                    {fmtDate(activeRow.due_date)}
                    {days > 0 && ` (${days} gün gecikmiş)`}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* All invoices for this customer */}
          {sameCustomer.length > 1 && (
            <div className="space-y-2">
              <div className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8]">
                Müşteri Toplamı — {sameCustomer.length} açık fatura
              </div>
              <div className="bg-[#f8fafc] rounded p-3">
                <div className="flex justify-between text-xs mb-2">
                  <span className="text-[#64748b]">Toplam açık alacak</span>
                  <span className="font-bold text-neg tabular-nums">{fmtTRY(customerTotal, 0)}</span>
                </div>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {sameCustomer.map(r => {
                    const rem = Math.max(0, r.total_try - (r.amount_paid ?? 0))
                    const d   = daysSinceRef(r)
                    return (
                      <div key={r.id} className={`flex justify-between text-[10px] py-0.5 ${r.id === activeRow.id ? 'font-bold' : 'text-[#64748b]'}`}>
                        <span>
                          {r.proformas?.proforma_no ?? fmtDateShort(r.sale_date ?? r.created_at)}
                          {d > 0 && <span className="text-neg ml-1">({d}g)</span>}
                        </span>
                        <span className="tabular-nums">{fmtTRY(rem, 0)}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="space-y-2">
            <div className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8]">İşlemler</div>
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => setActiveAction(activeAction === 'pay' ? null : 'pay')}
                className="px-3 py-2 rounded text-xs font-semibold bg-pos-light text-pos-text border border-pos-light hover:brightness-95 transition-all"
              >
                Tahsilat Yap
              </button>
              <button
                onClick={() => setActiveAction(activeAction === 'extend' ? null : 'extend')}
                className="px-3 py-2 rounded text-xs font-semibold bg-info-light text-info-text border border-info-light hover:brightness-95 transition-all"
              >
                Vade Uzat
              </button>
              <button
                onClick={() => setActiveAction(activeAction === 'note' ? null : 'note')}
                className="px-3 py-2 rounded text-xs font-semibold bg-[#f1f5f9] text-[#64748b] border border-[#e8eaef] hover:brightness-95 transition-all"
              >
                Not Ekle
              </button>
            </div>

            {/* Pay form */}
            {activeAction === 'pay' && (
              <div className="bg-pos-light/30 rounded p-3 space-y-2 border border-pos-light">
                <label className="text-[10px] font-bold uppercase tracking-wider text-pos-text">
                  Tahsilat Tutarı (₺) — max {fmtTRY(remaining, 0)}
                </label>
                <div className="flex gap-2">
                  <input
                    type="number" min="0.01" step="0.01"
                    placeholder="0,00"
                    value={payAmt}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => { setPayAmt(e.target.value); setPayErr('') }}
                    className="flex-1 border border-pos-light rounded px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-pos/30 bg-white"
                    autoFocus
                  />
                  <button
                    disabled={saving}
                    onClick={handlePay}
                    className="px-3 py-1.5 rounded text-xs font-bold bg-pos-light text-pos-text hover:brightness-95 transition-all disabled:opacity-50"
                  >
                    {saving ? '…' : 'Kaydet'}
                  </button>
                  <button
                    onClick={() => { setActiveAction(null); setPayAmt(''); setPayErr('') }}
                    className="px-2.5 py-1.5 rounded text-xs text-[#64748b] hover:bg-[#f1f5f9]"
                  >
                    İptal
                  </button>
                </div>
                {payErr && <p className="text-[10px] text-neg font-semibold">{payErr}</p>}
                <div className="flex gap-2">
                  <button
                    disabled={saving}
                    onClick={async () => { setSaving(true); await onAction(activeRow.id, 'paid'); setSaving(false); setActiveAction(null) }}
                    className="text-[10px] font-semibold text-pos-text underline underline-offset-1 hover:no-underline disabled:opacity-50"
                  >
                    Tamamını tahsil et ({fmtTRY(remaining, 0)})
                  </button>
                </div>
              </div>
            )}

            {/* Extend form */}
            {activeAction === 'extend' && (
              <div className="bg-info-light/30 rounded p-3 space-y-2 border border-info-light">
                <label className="text-[10px] font-bold uppercase tracking-wider text-info-text">Yeni Vade Tarihi</label>
                <div className="flex gap-2">
                  <input
                    type="date"
                    min={TODAY}
                    value={newDue}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => setNewDue(e.target.value)}
                    className="flex-1 border border-info-light rounded px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-info/30 bg-white"
                    autoFocus
                  />
                  <button
                    disabled={saving || !newDue}
                    onClick={handleExtend}
                    className="px-3 py-1.5 rounded text-xs font-bold bg-info-light text-info-text hover:brightness-95 transition-all disabled:opacity-50"
                  >
                    {saving ? '…' : 'Uzat'}
                  </button>
                  <button
                    onClick={() => { setActiveAction(null); setNewDue('') }}
                    className="px-2.5 py-1.5 rounded text-xs text-[#64748b] hover:bg-[#f1f5f9]"
                  >
                    İptal
                  </button>
                </div>
              </div>
            )}

            {/* Note form */}
            {activeAction === 'note' && (
              <div className="bg-[#f8fafc] rounded p-3 space-y-2 border border-[#e8eaef]">
                <label className="text-[10px] font-bold uppercase tracking-wider text-[#94a3b8]">Not</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Müşteri ile görüşüldü…"
                    value={noteText}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => setNoteText(e.target.value)}
                    className="flex-1 border border-[#e8eaef] rounded px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-brand/30 bg-white"
                    autoFocus
                  />
                  <button
                    onClick={handleNote}
                    className="px-3 py-1.5 rounded text-xs font-bold bg-[#f1f5f9] text-[#334155] hover:brightness-95 transition-all"
                  >
                    Ekle
                  </button>
                  <button
                    onClick={() => { setActiveAction(null); setNoteText('') }}
                    className="px-2.5 py-1.5 rounded text-xs text-[#64748b] hover:bg-[#f1f5f9]"
                  >
                    İptal
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

// ── Pressure Row ──────────────────────────────────────────────────────────────

interface RowProps {
  row: CollectionRow
  onExpand: (row: CollectionRow) => void
  onQuickPay: (id: string) => void
  patching: string | null
}

function PressureRow({ row, onExpand, onQuickPay, patching }: RowProps) {
  const days     = daysSinceRef(row)
  const severity = getSeverity(days)
  const meta     = SEVERITY_META[severity]
  const remaining = Math.max(0, row.total_try - (row.amount_paid ?? 0))
  const isPending = patching === row.id
  const hasPartial = row.payment_status === 'partial' && (row.amount_paid ?? 0) > 0

  const dateStr = row.due_date
    ? fmtDateShort(row.due_date)
    : row.sale_date ? fmtDateShort(row.sale_date) : '—'

  return (
    <div
      className={`bg-white border border-[#e8eaef] rounded-xl shadow-soft overflow-hidden shadow-sm border-l-4 ${meta.border} ${meta.rowBg}`}
    >
      <div className="flex items-start gap-3 px-4 py-3 flex-wrap">
        {/* Severity label */}
        <div className="flex flex-col items-center justify-center w-14 shrink-0 pt-0.5">
          <span className={`w-2 h-2 rounded-full ${meta.dot} mb-1`} />
          <span className={`text-[9px] font-bold uppercase tracking-wider ${meta.labelColor} text-center leading-tight`}>
            {meta.label}
          </span>
        </div>

        {/* Customer + invoice info */}
        <div className="flex-1 min-w-0 cursor-pointer" onClick={() => onExpand(row)}>
          <div className="text-xs font-bold text-[#0f172a] truncate">{row.customer_name || '—'}</div>
          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
            {row.proformas?.proforma_no && (
              <span className="text-[10px] font-mono text-[#94a3b8]">{row.proformas.proforma_no}</span>
            )}
            {hasPartial && (
              <span className="text-[10px] text-pos-text font-semibold">
                Kısmi ödeme: {fmtTRY(row.amount_paid ?? 0, 0)} alındı
              </span>
            )}
          </div>
        </div>

        {/* Amount + date */}
        <div className="text-right shrink-0">
          <div className="text-sm font-bold tabular-nums text-[#0f172a]">{fmtTRY(remaining, 0)}</div>
          {hasPartial && (
            <div className="text-[10px] text-[#94a3b8] tabular-nums">{fmtTRY(row.total_try, 0)} toplam</div>
          )}
          <div className={`text-[10px] mt-0.5 ${days > 0 ? meta.labelColor : 'text-[#94a3b8]'} font-semibold`}>
            {days > 0 ? `${days} gün vadeli` : days < 0 ? `${Math.abs(days)} gün kaldı` : 'Bugün'}
          </div>
          <div className="text-[10px] text-[#94a3b8]">due: {dateStr}</div>
        </div>
      </div>

      {/* Action buttons */}
      <div className="px-4 pb-3 flex items-center gap-2 flex-wrap">
        <button
          disabled={isPending}
          onClick={() => onQuickPay(row.id)}
          className="px-2.5 py-1.5 rounded text-[11px] font-semibold bg-pos-light text-pos-text border border-pos-light hover:brightness-95 transition-all disabled:opacity-50"
        >
          {isPending ? '⟳' : '✓'} Tahsilat Yap
        </button>
        <button
          onClick={() => onExpand(row)}
          className="px-2.5 py-1.5 rounded text-[11px] font-semibold bg-info-light text-info-text border border-info-light hover:brightness-95 transition-all"
        >
          Vade Uzat
        </button>
        <button
          onClick={() => onExpand(row)}
          className="px-2.5 py-1.5 rounded text-[11px] font-semibold bg-[#f1f5f9] text-[#64748b] border border-[#e8eaef] hover:brightness-95 transition-all"
        >
          Not Ekle
        </button>
        <button
          onClick={() => onExpand(row)}
          className="ml-auto text-[10px] text-[#94a3b8] hover:text-[#334155] underline underline-offset-1"
        >
          Geçmiş →
        </button>
      </div>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

interface Props {
  initialRows: CollectionRow[]
}

export default function CollectionsPressureClient({ initialRows }: Props) {
  const [rows,      setRows]      = useState<CollectionRow[]>(initialRows)
  const [patching,  setPatching]  = useState<string | null>(null)
  const [error,     setError]     = useState<string | null>(null)
  const [slideRow,  setSlideRow]  = useState<CollectionRow | null>(null)
  const [search,    setSearch]    = useState('')
  const [notes,     setNotes]     = useState<Record<string, string[]>>({})

  // Task-first: open the most urgent receivable's collection panel when reached
  // via the hero "Tahsilat Kaydet" action (?pay=1). Rows arrive risk-sorted.
  const searchParams = useSearchParams()
  useEffect(() => {
    if (searchParams.get('pay') === '1' && rows.length > 0) setSlideRow(rows[0])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  // ── Search filter ──────────────────────────────────────────────────────────
  const displayRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(r => r.customer_name.toLowerCase().includes(q))
  }, [rows, search])

  // ── PATCH helper ───────────────────────────────────────────────────────────
  const patchRow = useCallback(async (
    id: string,
    status: CollectionRow['payment_status'],
    amountPaid?: number,
  ): Promise<boolean> => {
    setPatching(id)
    setError(null)
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
        throw new Error((d as { error?: string }).error ?? 'Güncelleme başarısız')
      }
      // Remove from pressure view when fully paid
      if (status === 'paid') {
        setRows(prev => prev.filter(r => r.id !== id))
        if (slideRow?.id === id) setSlideRow(null)
      } else {
        setRows(prev => prev.map(r => r.id === id ? {
          ...r,
          payment_status: status,
          amount_paid: amountPaid !== undefined ? amountPaid : r.amount_paid,
        } : r))
        if (slideRow?.id === id) {
          setSlideRow(prev => prev ? {
            ...prev,
            payment_status: status,
            amount_paid: amountPaid !== undefined ? amountPaid : prev.amount_paid,
          } : null)
        }
      }
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Güncelleme hatası')
      return false
    } finally {
      setPatching(null)
    }
  }, [slideRow])

  // ── Due date extension ─────────────────────────────────────────────────────
  const extendDue = useCallback(async (id: string, newDue: string): Promise<boolean> => {
    setPatching(id)
    setError(null)
    try {
      const res = await fetch('/api/collections', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ id, payment_status: 'pending', due_date: newDue }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error((d as { error?: string }).error ?? 'Güncelleme başarısız')
      }
      setRows(prev => prev.map(r => r.id === id ? { ...r, due_date: newDue } : r))
      if (slideRow?.id === id) setSlideRow(prev => prev ? { ...prev, due_date: newDue } : null)
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Güncelleme hatası')
      return false
    } finally {
      setPatching(null)
    }
  }, [slideRow])

  // ── Local note append ──────────────────────────────────────────────────────
  const addNote = useCallback((id: string, note: string) => {
    setNotes(prev => ({ ...prev, [id]: [...(prev[id] ?? []), note] }))
  }, [])

  // ── Empty state ────────────────────────────────────────────────────────────
  if (rows.length === 0) {
    // When reached via the hero "Tahsilat Kaydet" action (?pay=1), explain that
    // there's nothing to record rather than silently doing nothing.
    const viaPayAction = searchParams.get('pay') === '1'
    return (
      <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft p-12 text-center shadow-sm">
        <div className="text-xs font-medium text-[#334155] mb-1">Açık tahsilat bulunmuyor</div>
        <div className="text-[0.65rem] text-[#94a3b8]">
          {viaPayAction
            ? 'Tahsilat kaydedilecek açık fatura yok — tüm alacaklar tahsil edilmiş.'
            : 'Tüm alacaklar tahsil edildi.'}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Filter bar */}
      <div className="flex items-center gap-2">
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94a3b8] text-sm select-none">⌕</span>
          <input
            type="text"
            placeholder="Müşteri ara…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-8 pr-3 py-1.5 text-xs border border-[#e8eaef] rounded focus:outline-none focus:ring-2 focus:ring-brand/30 bg-white w-44"
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
        <span className="text-[10px] text-[#94a3b8]">
          {search ? `${displayRows.length} / ${rows.length}` : `${rows.length} açık fatura`} · risk sıralı
        </span>
      </div>

      {/* Error banner */}
      {error && (
        <div className="bg-neg-light border border-neg-light rounded px-4 py-2 text-xs text-neg-text flex items-center justify-between">
          {error}
          <button onClick={() => setError(null)} className="ml-4 text-neg">✕</button>
        </div>
      )}

      {/* Pressure rows */}
      <div className="space-y-2">
        {displayRows.map(row => (
          <div key={row.id}>
            <PressureRow
              row={row}
              onExpand={r => setSlideRow(r)}
              onQuickPay={id => patchRow(id, 'paid')}
              patching={patching}
            />
            {/* Inline notes display */}
            {(notes[row.id] ?? []).length > 0 && (
              <div className="ml-20 mt-1 space-y-0.5">
                {notes[row.id].map((n, i) => (
                  <div key={i} className="text-[10px] text-[#94a3b8] bg-[#f8fafc] rounded px-2 py-0.5 inline-block">
                    📝 {n}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Slide-over */}
      {slideRow && (
        <SlideOver
          row={slideRow}
          allRows={rows}
          onClose={() => setSlideRow(null)}
          onAction={patchRow}
          onExtend={extendDue}
          onNote={addNote}
        />
      )}
    </div>
  )
}
