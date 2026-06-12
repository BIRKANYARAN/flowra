'use client'

// ── OrdersContent — Operations hub / orders tab ───────────────────────────────
// Client component: lists purchase orders, allows status updates + new order form.

import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { NarrativeFooter, Skeleton } from '@/components/ds'
import { formatTRY as fmt, fmtDate } from '@/lib/format'
import { SupplierPerformancePanel }    from './_supplier-performance/SupplierPerformancePanel'
import { PurchaseAnalyticsClient }     from './_purchase/PurchaseAnalyticsClient'

type OrderStatus = 'draft' | 'ordered' | 'received' | 'cancelled'

interface OrderItem {
  id: string
  name: string
  unit: string
  quantity: number
  unit_price: number
  currency: string
}

interface Order {
  id:            string
  supplier_name: string
  order_date:    string
  expected_date: string | null
  status:        OrderStatus
  currency:      string
  total_try:     number
  notes:         string | null
  created_at:    string
  purchase_order_items: OrderItem[]
}

const STATUS_META: Record<OrderStatus, { label: string; cls: string }> = {
  draft:     { label: 'Taslak',     cls: 'bg-[#f1f5f9] text-[#64748b]' },
  ordered:   { label: 'Sipariş Verildi', cls: 'bg-info-light text-info-text' },
  received:  { label: 'Teslim Alındı',   cls: 'bg-pos-light text-pos-text' },
  cancelled: { label: 'İptal',      cls: 'bg-neg-light text-neg' },
}

const NEXT_STATUS: Record<OrderStatus, OrderStatus | null> = {
  draft:     'ordered',
  ordered:   'received',
  received:  null,
  cancelled: null,
}

const NEXT_LABEL: Record<OrderStatus, string> = {
  draft:     'Sipariş Ver →',
  ordered:   'Teslim Alındı ✓',
  received:  '',
  cancelled: '',
}

interface Props { companyId?: string }

export function OrdersContent(_props: Props) {
  const [orders,  setOrders]  = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // New order form
  const [showForm,      setShowForm]      = useState(false)
  const [formSupplier,  setFormSupplier]  = useState('')
  const [formDate,      setFormDate]      = useState(new Date().toISOString().slice(0, 10))
  const [formExpected,  setFormExpected]  = useState('')
  const [formNotes,     setFormNotes]     = useState('')
  const [formItems,     setFormItems]     = useState([{ name: '', unit: 'adet', quantity: '1', unit_price: '' }])
  const [formSaving,    setFormSaving]    = useState(false)
  const [formError,     setFormError]     = useState<string | null>(null)

  // Task-first: open the new-order form when reached via the hero action (?new=1)
  const searchParams = useSearchParams()
  useEffect(() => { if (searchParams.get('new') === '1') setShowForm(true) }, [searchParams])

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/purchase-orders', signal ? { signal } : undefined)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      setOrders(json.orders ?? [])
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return
      setError(e instanceof Error ? e.message : 'Yükleme hatası')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    load(controller.signal)
    return () => controller.abort()
  }, [load])

  async function advanceStatus(order: Order) {
    const next = NEXT_STATUS[order.status]
    if (!next) return
    setUpdatingId(order.id)
    try {
      await fetch(`/api/purchase-orders/${order.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      })
      await load()
    } finally {
      setUpdatingId(null)
    }
  }

  async function cancelOrder(id: string) {
    setUpdatingId(id)
    try {
      await fetch(`/api/purchase-orders/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'cancelled' }),
      })
      await load()
    } finally {
      setUpdatingId(null)
    }
  }

  async function submitForm() {
    if (!formSupplier.trim()) { setFormError('Tedarikçi adı zorunludur'); return }
    const validItems = formItems.filter(it => it.name.trim())
    setFormSaving(true); setFormError(null)
    try {
      const res = await fetch('/api/purchase-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplier_name: formSupplier.trim(),
          order_date:    formDate,
          expected_date: formExpected || null,
          notes:         formNotes || null,
          items: validItems.map((it, i) => ({
            name:       it.name.trim(),
            unit:       it.unit,
            quantity:   parseFloat(it.quantity) || 1,
            unit_price: parseFloat(it.unit_price) || 0,
            sort_order: i,
          })),
        }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(j.error ?? `HTTP ${res.status}`)
      }
      setShowForm(false)
      setFormSupplier(''); setFormDate(new Date().toISOString().slice(0, 10))
      setFormExpected(''); setFormNotes('')
      setFormItems([{ name: '', unit: 'adet', quantity: '1', unit_price: '' }])
      await load()
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Kayıt hatası')
    } finally {
      setFormSaving(false)
    }
  }

  // Summary stats
  const total         = orders.length
  const totalDraft    = orders.filter(o => o.status === 'draft').length
  const totalOrdered  = orders.filter(o => o.status === 'ordered').length
  const totalReceived = orders.filter(o => o.status === 'received').length

  return (
    <div className="space-y-4">

      {/* ── Summary strip ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Toplam',          value: total,         cls: 'text-[#334155]' },
          { label: 'Taslak',          value: totalDraft,    cls: 'text-[#64748b]' },
          { label: 'Sipariş Verildi', value: totalOrdered,  cls: 'text-info-text' },
          { label: 'Teslim Alındı',   value: totalReceived, cls: 'text-pos-text' },
        ].map(s => (
          <div key={s.label} className="bg-white border border-[#e8eaef] rounded-xl shadow-soft px-4 py-3 shadow-sm">
            <div className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8] mb-1">{s.label}</div>
            <div className={`text-xl font-black tabular-nums ${s.cls}`}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* ── Header + New Order CTA ──────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <h2 className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8]">Satın Alma Siparişleri</h2>
        <button
          onClick={() => setShowForm(v => !v)}
          className="text-xs font-bold bg-brand-light text-white px-4 py-2 rounded hover:bg-brand transition-colors"
        >
          {showForm ? '✕ İptal' : '+ Yeni Sipariş'}
        </button>
      </div>

      {/* ── New order form ─────────────────────────────────────────────── */}
      {showForm && (
        <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft p-5 space-y-4">
          <h3 className="text-sm font-bold text-[#334155]">Yeni Satın Alma Siparişi</h3>
          {formError && (
            <div className="text-xs text-neg bg-neg-light border border-neg-light rounded px-3 py-2">{formError}</div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8] mb-1">Tedarikçi *</label>
              <input
                value={formSupplier} onChange={e => setFormSupplier(e.target.value)}
                className="w-full border border-[#e8eaef] rounded px-3 py-2 text-sm"
                placeholder="Tedarikçi adı"
              />
            </div>
            <div>
              <label className="block text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8] mb-1">Sipariş Tarihi</label>
              <input
                type="date" value={formDate} onChange={e => setFormDate(e.target.value)}
                className="w-full border border-[#e8eaef] rounded px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8] mb-1">Beklenen Teslim</label>
              <input
                type="date" value={formExpected} onChange={e => setFormExpected(e.target.value)}
                className="w-full border border-[#e8eaef] rounded px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8] mb-1">Notlar</label>
              <input
                value={formNotes} onChange={e => setFormNotes(e.target.value)}
                className="w-full border border-[#e8eaef] rounded px-3 py-2 text-sm"
                placeholder="Opsiyonel"
              />
            </div>
          </div>

          {/* Line items */}
          <div>
            <div className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8] mb-2">Kalemler</div>
            {formItems.map((item, idx) => (
              <div key={idx} className="grid grid-cols-[2fr_1fr_1fr_1fr_auto] gap-2 mb-2">
                <input
                  value={item.name} onChange={e => setFormItems(prev => prev.map((it, i) => i === idx ? { ...it, name: e.target.value } : it))}
                  className="border border-[#e8eaef] rounded px-2 py-1.5 text-xs" placeholder="Ürün / hizmet adı"
                />
                <input
                  value={item.unit} onChange={e => setFormItems(prev => prev.map((it, i) => i === idx ? { ...it, unit: e.target.value } : it))}
                  className="border border-[#e8eaef] rounded px-2 py-1.5 text-xs" placeholder="adet"
                />
                <input
                  type="number" value={item.quantity} min="0"
                  onChange={e => setFormItems(prev => prev.map((it, i) => i === idx ? { ...it, quantity: e.target.value } : it))}
                  className="border border-[#e8eaef] rounded px-2 py-1.5 text-xs text-right" placeholder="Miktar"
                />
                <input
                  type="number" value={item.unit_price} min="0"
                  onChange={e => setFormItems(prev => prev.map((it, i) => i === idx ? { ...it, unit_price: e.target.value } : it))}
                  className="border border-[#e8eaef] rounded px-2 py-1.5 text-xs text-right" placeholder="Birim fiyat ₺"
                />
                <button
                  onClick={() => setFormItems(prev => prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev)}
                  className="text-[#94a3b8] hover:text-neg text-sm font-bold"
                >✕</button>
              </div>
            ))}
            <button
              onClick={() => setFormItems(prev => [...prev, { name: '', unit: 'adet', quantity: '1', unit_price: '' }])}
              className="text-xs text-brand-light font-semibold hover:underline"
            >+ Kalem Ekle</button>
          </div>

          <div className="flex justify-end gap-2">
            <button onClick={() => setShowForm(false)} className="text-xs text-[#64748b] hover:text-[#334155] px-4 py-2">İptal</button>
            <button
              onClick={submitForm} disabled={formSaving}
              className="text-xs font-bold bg-brand-light text-white px-5 py-2 rounded hover:bg-brand disabled:opacity-50 transition-colors"
            >
              {formSaving ? 'Kaydediliyor...' : 'Kaydet'}
            </button>
          </div>
        </div>
      )}

      {/* ── Intelligence Alerts ───────────────────────────────────────── */}
      {!loading && orders.length > 0 && (() => {
        const todayISO = new Date().toISOString().slice(0, 10)
        const overdueOrders = orders.filter(o =>
          o.status === 'ordered' && o.expected_date && o.expected_date < todayISO
        )
        const pendingTotal  = orders
          .filter(o => o.status === 'ordered' || o.status === 'draft')
          .reduce((s, o) => s + Number(o.total_try ?? 0), 0)

        return (
          <>
            {overdueOrders.length > 0 && (
              <div className="bg-warn-light border border-warn-light rounded px-4 py-3 flex items-start gap-3">
                <span className="text-base mt-0.5">⚠</span>
                <div className="flex-1">
                  <div className="text-[11px] font-bold uppercase tracking-wide text-warn-text">
                    {overdueOrders.length} Sipariş Gecikmiş
                  </div>
                  <div className="text-xs text-warn-text mt-0.5">
                    Beklenen tarih geçti ama henüz teslim alınmadı:{' '}
                    {overdueOrders.slice(0, 2).map(o => o.supplier_name).join(', ')}
                    {overdueOrders.length > 2 ? ` ve ${overdueOrders.length - 2} diğer` : ''}.
                  </div>
                </div>
              </div>
            )}
            {pendingTotal > 100_000 && (
              <div className="bg-info-light border border-info-light rounded px-4 py-3 flex items-start gap-3">
                <span className="text-base mt-0.5">ℹ</span>
                <div className="flex-1">
                  <div className="text-[11px] font-bold uppercase tracking-wide text-info-text">
                    Büyük Bekleyen Sipariş Hacmi
                  </div>
                  <div className="text-xs text-info-text mt-0.5">
                    Bekleyen (taslak + sipariş) toplam: {fmt(pendingTotal)}. Nakit akışı planlamasına dahil edilmeli.
                  </div>
                </div>
              </div>
            )}
          </>
        )
      })()}

      {/* ── List ──────────────────────────────────────────────────────── */}
      {error && (
        <div className="bg-neg-light border border-neg-light rounded px-4 py-3 text-sm text-neg">{error}</div>
      )}

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map(i => <Skeleton key={i} height="h-16" />)}
        </div>
      ) : orders.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
          <div className="text-3xl opacity-50">📦</div>
          <div className="text-sm text-[#64748b]">Henüz satın alma siparişi yok.</div>
          {!showForm && (
            <button
              onClick={() => setShowForm(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-brand text-white text-xs font-semibold hover:bg-brand-light transition-colors">
              + İlk siparişini oluştur
            </button>
          )}
        </div>
      ) : (
        <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft overflow-hidden shadow-sm">
          <div className="divide-y divide-[#e8eaef]">
            {orders.map(order => {
              const meta  = STATUS_META[order.status]
              const next  = NEXT_STATUS[order.status]
              const busy  = updatingId === order.id
              const isExp = expandedId === order.id
              return (
                <div key={order.id}>
                  <div
                    className="px-4 py-2 flex items-center gap-3 hover:bg-[#f8fafc]/50 cursor-pointer"
                    onClick={() => setExpandedId(isExp ? null : order.id)}
                  >
                    {/* Info */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold">{order.supplier_name}</span>
                        <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${meta.cls}`}>{meta.label}</span>
                      </div>
                      <div className="text-xs text-[#94a3b8] mt-0.5">
                        {fmtDate(order.order_date)}
                        {order.expected_date && ` → Beklenen: ${fmtDate(order.expected_date)}`}
                        {order.purchase_order_items.length > 0 && ` · ${order.purchase_order_items.length} kalem`}
                      </div>
                    </div>

                    {/* Amount */}
                    <div className="text-sm font-bold tabular-nums text-[#1e293b]">{fmt(order.total_try)}</div>

                    {/* Actions */}
                    <div className="flex items-center gap-1.5 flex-shrink-0" onClick={e => e.stopPropagation()}>
                      {next && (
                        <button
                          disabled={busy}
                          onClick={() => advanceStatus(order)}
                          className="text-[10px] font-bold px-2.5 py-1 bg-brand-light text-white rounded hover:bg-brand disabled:opacity-50 transition-colors"
                        >
                          {busy ? '...' : NEXT_LABEL[order.status]}
                        </button>
                      )}
                      {(order.status === 'draft' || order.status === 'ordered') && (
                        <button
                          disabled={busy}
                          onClick={() => cancelOrder(order.id)}
                          className="text-[10px] font-bold px-2 py-1 border border-[#e8eaef] text-[#64748b] rounded hover:border-neg hover:text-neg disabled:opacity-50"
                        >İptal</button>
                      )}
                    </div>
                  </div>

                  {/* Expanded items */}
                  {isExp && order.purchase_order_items.length > 0 && (
                    <div className="px-5 pb-3 border-t border-[#f1f5f9] bg-[#f8fafc]/50">
                      <table className="w-full text-xs mt-2">
                        <thead>
                          <tr className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8] border-b border-[#e8eaef]">
                            <th className="text-left py-1.5">Kalem</th>
                            <th className="text-right py-1.5">Miktar</th>
                            <th className="text-right py-1.5">Birim Fiyat</th>
                            <th className="text-right py-1.5">Toplam</th>
                          </tr>
                        </thead>
                        <tbody>
                          {order.purchase_order_items
                            .sort((a, b) => (a as unknown as { sort_order: number }).sort_order - (b as unknown as { sort_order: number }).sort_order)
                            .map(it => (
                            <tr key={it.id} className="border-b border-[#f1f5f9] last:border-0">
                              <td className="py-1.5 text-[#334155]">{it.name} <span className="text-[#94a3b8]">({it.unit})</span></td>
                              <td className="py-1.5 text-right tabular-nums text-[#64748b]">{it.quantity}</td>
                              <td className="py-1.5 text-right tabular-nums text-[#64748b]">{fmt(it.unit_price)}</td>
                              <td className="py-1.5 text-right tabular-nums font-semibold">{fmt(it.quantity * it.unit_price)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {order.notes && (
                        <p className="text-xs text-[#94a3b8] mt-2 italic">{order.notes}</p>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Supplier Performance Analytics ────────────────────────────── */}
      <SupplierPerformancePanel />

      {/* ── Purchase Order Analytics ──────────────────────────────────── */}
      <PurchaseAnalyticsClient companyId={_props.companyId ?? ''} />

      {/* Cross-navigation */}
      <NarrativeFooter
        narrative="Satın alma maliyeti FIFO'ya girer ve COGS üzerinden P&L'e yansır — alım zamanlaması ve marj birlikte değerlendirilmeli."
        links={[
          { label: 'Stok',    href: '/dashboard/operations?tab=stock' },
          { label: 'Giderler', href: '/dashboard/operations?tab=expenses' },
          { label: 'P&L',     href: '/dashboard/finance?tab=pnl' },
        ]}
      />
    </div>
  )
}
