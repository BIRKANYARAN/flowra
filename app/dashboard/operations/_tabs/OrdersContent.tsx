'use client'

// ── OrdersContent — Operations hub / orders tab ───────────────────────────────
// Client component: lists purchase orders, allows status updates + new order form.

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { formatTRY as fmt, fmtDate } from '@/lib/format'

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
  draft:     { label: 'Taslak',     cls: 'bg-gray-100 text-gray-500' },
  ordered:   { label: 'Sipariş Verildi', cls: 'bg-blue-100 text-blue-700' },
  received:  { label: 'Teslim Alındı',   cls: 'bg-emerald-100 text-emerald-700' },
  cancelled: { label: 'İptal',      cls: 'bg-red-100 text-red-500' },
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
          { label: 'Toplam',          value: total,         cls: 'text-gray-700' },
          { label: 'Taslak',          value: totalDraft,    cls: 'text-gray-500' },
          { label: 'Sipariş Verildi', value: totalOrdered,  cls: 'text-blue-700' },
          { label: 'Teslim Alındı',   value: totalReceived, cls: 'text-emerald-700' },
        ].map(s => (
          <div key={s.label} className="bg-white border border-gray-100 rounded px-4 py-3 shadow-sm">
            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">{s.label}</div>
            <div className={`text-xl font-black tabular-nums ${s.cls}`}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* ── Header + New Order CTA ──────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <h2 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Satın Alma Siparişleri</h2>
        <button
          onClick={() => setShowForm(v => !v)}
          className="text-xs font-bold bg-primary-600 text-white px-4 py-2 rounded hover:bg-primary-700 transition-colors"
        >
          {showForm ? '✕ İptal' : '+ Yeni Sipariş'}
        </button>
      </div>

      {/* ── New order form ─────────────────────────────────────────────── */}
      {showForm && (
        <div className="bg-white border border-gray-100 rounded p-5 space-y-4">
          <h3 className="text-sm font-bold text-gray-700">Yeni Satın Alma Siparişi</h3>
          {formError && (
            <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded px-3 py-2">{formError}</div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Tedarikçi *</label>
              <input
                value={formSupplier} onChange={e => setFormSupplier(e.target.value)}
                className="w-full border border-gray-200 rounded px-3 py-2 text-sm"
                placeholder="Tedarikçi adı"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Sipariş Tarihi</label>
              <input
                type="date" value={formDate} onChange={e => setFormDate(e.target.value)}
                className="w-full border border-gray-200 rounded px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Beklenen Teslim</label>
              <input
                type="date" value={formExpected} onChange={e => setFormExpected(e.target.value)}
                className="w-full border border-gray-200 rounded px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Notlar</label>
              <input
                value={formNotes} onChange={e => setFormNotes(e.target.value)}
                className="w-full border border-gray-200 rounded px-3 py-2 text-sm"
                placeholder="Opsiyonel"
              />
            </div>
          </div>

          {/* Line items */}
          <div>
            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Kalemler</div>
            {formItems.map((item, idx) => (
              <div key={idx} className="grid grid-cols-[2fr_1fr_1fr_1fr_auto] gap-2 mb-2">
                <input
                  value={item.name} onChange={e => setFormItems(prev => prev.map((it, i) => i === idx ? { ...it, name: e.target.value } : it))}
                  className="border border-gray-200 rounded px-2 py-1.5 text-xs" placeholder="Ürün / hizmet adı"
                />
                <input
                  value={item.unit} onChange={e => setFormItems(prev => prev.map((it, i) => i === idx ? { ...it, unit: e.target.value } : it))}
                  className="border border-gray-200 rounded px-2 py-1.5 text-xs" placeholder="adet"
                />
                <input
                  type="number" value={item.quantity} min="0"
                  onChange={e => setFormItems(prev => prev.map((it, i) => i === idx ? { ...it, quantity: e.target.value } : it))}
                  className="border border-gray-200 rounded px-2 py-1.5 text-xs text-right" placeholder="Miktar"
                />
                <input
                  type="number" value={item.unit_price} min="0"
                  onChange={e => setFormItems(prev => prev.map((it, i) => i === idx ? { ...it, unit_price: e.target.value } : it))}
                  className="border border-gray-200 rounded px-2 py-1.5 text-xs text-right" placeholder="Birim fiyat ₺"
                />
                <button
                  onClick={() => setFormItems(prev => prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev)}
                  className="text-gray-400 hover:text-red-500 text-sm font-bold"
                >✕</button>
              </div>
            ))}
            <button
              onClick={() => setFormItems(prev => [...prev, { name: '', unit: 'adet', quantity: '1', unit_price: '' }])}
              className="text-xs text-primary-600 font-semibold hover:underline"
            >+ Kalem Ekle</button>
          </div>

          <div className="flex justify-end gap-2">
            <button onClick={() => setShowForm(false)} className="text-xs text-gray-500 hover:text-gray-700 px-4 py-2">İptal</button>
            <button
              onClick={submitForm} disabled={formSaving}
              className="text-xs font-bold bg-primary-600 text-white px-5 py-2 rounded hover:bg-primary-700 disabled:opacity-50 transition-colors"
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
              <div className="bg-amber-50 border border-amber-200 rounded px-4 py-3 flex items-start gap-3">
                <span className="text-base mt-0.5">⚠</span>
                <div className="flex-1">
                  <div className="text-[11px] font-black uppercase tracking-wide text-amber-800">
                    {overdueOrders.length} Sipariş Gecikmiş
                  </div>
                  <div className="text-xs text-amber-700 mt-0.5">
                    Beklenen tarih geçti ama henüz teslim alınmadı:{' '}
                    {overdueOrders.slice(0, 2).map(o => o.supplier_name).join(', ')}
                    {overdueOrders.length > 2 ? ` ve ${overdueOrders.length - 2} diğer` : ''}.
                  </div>
                </div>
              </div>
            )}
            {pendingTotal > 100_000 && (
              <div className="bg-blue-50 border border-blue-200 rounded px-4 py-3 flex items-start gap-3">
                <span className="text-base mt-0.5">ℹ</span>
                <div className="flex-1">
                  <div className="text-[11px] font-black uppercase tracking-wide text-blue-800">
                    Büyük Bekleyen Sipariş Hacmi
                  </div>
                  <div className="text-xs text-blue-700 mt-0.5">
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
        <div className="bg-red-50 border border-red-100 rounded px-4 py-3 text-sm text-red-600">{error}</div>
      )}

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map(i => <div key={i} className="bg-gray-100 rounded h-16 animate-pulse" />)}
        </div>
      ) : orders.length === 0 ? (
        <div className="text-center py-12 text-gray-400 text-sm">
          Henüz satın alma siparişi yok.
        </div>
      ) : (
        <div className="bg-white border border-gray-100 rounded overflow-hidden shadow-sm">
          <div className="divide-y divide-gray-100">
            {orders.map(order => {
              const meta  = STATUS_META[order.status]
              const next  = NEXT_STATUS[order.status]
              const busy  = updatingId === order.id
              const isExp = expandedId === order.id
              return (
                <div key={order.id}>
                  <div
                    className="px-5 py-3 flex items-center gap-3 hover:bg-gray-50/50 cursor-pointer"
                    onClick={() => setExpandedId(isExp ? null : order.id)}
                  >
                    {/* Info */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold">{order.supplier_name}</span>
                        <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${meta.cls}`}>{meta.label}</span>
                      </div>
                      <div className="text-xs text-gray-400 mt-0.5">
                        {fmtDate(order.order_date)}
                        {order.expected_date && ` → Beklenen: ${fmtDate(order.expected_date)}`}
                        {order.purchase_order_items.length > 0 && ` · ${order.purchase_order_items.length} kalem`}
                      </div>
                    </div>

                    {/* Amount */}
                    <div className="text-sm font-bold tabular-nums text-gray-800">{fmt(order.total_try)}</div>

                    {/* Actions */}
                    <div className="flex items-center gap-1.5 flex-shrink-0" onClick={e => e.stopPropagation()}>
                      {next && (
                        <button
                          disabled={busy}
                          onClick={() => advanceStatus(order)}
                          className="text-[10px] font-bold px-2.5 py-1 bg-primary-600 text-white rounded hover:bg-primary-700 disabled:opacity-50 transition-colors"
                        >
                          {busy ? '...' : NEXT_LABEL[order.status]}
                        </button>
                      )}
                      {(order.status === 'draft' || order.status === 'ordered') && (
                        <button
                          disabled={busy}
                          onClick={() => cancelOrder(order.id)}
                          className="text-[10px] font-bold px-2 py-1 border border-gray-200 text-gray-500 rounded hover:border-red-300 hover:text-red-600 disabled:opacity-50"
                        >İptal</button>
                      )}
                    </div>
                  </div>

                  {/* Expanded items */}
                  {isExp && order.purchase_order_items.length > 0 && (
                    <div className="px-5 pb-3 border-t border-gray-50 bg-gray-50/50">
                      <table className="w-full text-xs mt-2">
                        <thead>
                          <tr className="text-[10px] font-bold text-gray-400 uppercase tracking-widest border-b border-gray-100">
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
                            <tr key={it.id} className="border-b border-gray-50 last:border-0">
                              <td className="py-1.5 text-gray-700">{it.name} <span className="text-gray-400">({it.unit})</span></td>
                              <td className="py-1.5 text-right tabular-nums text-gray-600">{it.quantity}</td>
                              <td className="py-1.5 text-right tabular-nums text-gray-600">{fmt(it.unit_price)}</td>
                              <td className="py-1.5 text-right tabular-nums font-semibold">{fmt(it.quantity * it.unit_price)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {order.notes && (
                        <p className="text-xs text-gray-400 mt-2 italic">{order.notes}</p>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Cross-navigation */}
      <div className="flex items-center justify-between px-1">
        <p className="text-[10px] text-gray-400 leading-relaxed">
          Satın alma siparişleri stok ve giderlerle birlikte yönetilmeli.
        </p>
        <div className="flex items-center gap-2 shrink-0 ml-4">
          <Link href="/dashboard/operations?tab=stock" className="text-[11px] font-bold text-primary-600 hover:text-primary-700 underline underline-offset-2 whitespace-nowrap">
            Stok →
          </Link>
          <span className="text-gray-200">|</span>
          <Link href="/dashboard/operations?tab=expenses" className="text-[11px] font-bold text-primary-600 hover:text-primary-700 underline underline-offset-2 whitespace-nowrap">
            Giderler →
          </Link>
          <span className="text-gray-200">|</span>
          <Link href="/dashboard/finance?tab=pnl" className="text-[11px] font-bold text-primary-600 hover:text-primary-700 underline underline-offset-2 whitespace-nowrap">
            P&amp;L →
          </Link>
        </div>
      </div>
    </div>
  )
}
