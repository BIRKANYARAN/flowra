'use client'

// ── OrdersClient — Standalone purchase orders list page ───────────────────────
//
// Shares the same API (/api/purchase-orders) as the operations hub tab.
// Provides the same features: list, create, status advancement, cancellation.

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { NarrativeFooter, Skeleton } from '@/components/ds'
import { formatTRY as fmt, fmtDate } from '@/lib/format'

type OrderStatus = 'draft' | 'ordered' | 'received' | 'cancelled'

interface OrderItem {
  id:         string
  name:       string
  unit:       string
  quantity:   number
  unit_price: number
  currency:   string
  sort_order: number
}

interface Order {
  id:                   string
  supplier_name:        string
  order_date:           string
  expected_date:        string | null
  status:               OrderStatus
  currency:             string
  total_try:            number
  notes:                string | null
  created_at:           string
  purchase_order_items: OrderItem[]
}

const STATUS_TABS: Array<{ key: OrderStatus | 'all'; label: string }> = [
  { key: 'all',       label: 'Tümü' },
  { key: 'draft',     label: 'Taslak' },
  { key: 'ordered',   label: 'Sipariş Verildi' },
  { key: 'received',  label: 'Teslim Alındı' },
  { key: 'cancelled', label: 'İptal' },
]

const STATUS_META: Record<OrderStatus, { label: string; cls: string }> = {
  draft:     { label: 'Taslak',          cls: 'bg-[#f1f5f9] text-[#64748b]' },
  ordered:   { label: 'Sipariş Verildi', cls: 'bg-info-light text-info-text' },
  received:  { label: 'Teslim Alındı',   cls: 'bg-pos-light text-pos-text' },
  cancelled: { label: 'İptal',           cls: 'bg-neg-light text-neg' },
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

interface Props { companyId: string }

export function OrdersClient(_props: Props) {
  const [orders,     setOrders]     = useState<Order[]>([])
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState<string | null>(null)
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [activeTab,  setActiveTab]  = useState<OrderStatus | 'all'>('all')

  // New order form state
  const [showForm,     setShowForm]     = useState(false)
  const [formSupplier, setFormSupplier] = useState('')
  const [formDate,     setFormDate]     = useState(new Date().toISOString().slice(0, 10))
  const [formExpected, setFormExpected] = useState('')
  const [formNotes,    setFormNotes]    = useState('')
  const [formItems,    setFormItems]    = useState([{ name: '', unit: 'adet', quantity: '1', unit_price: '' }])
  const [formSaving,   setFormSaving]   = useState(false)
  const [formError,    setFormError]    = useState<string | null>(null)

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/purchase-orders', signal ? { signal } : undefined)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json() as { orders?: Order[] }
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
      if (next === 'received') {
        await fetch(`/api/purchase-orders/${order.id}/receive`, { method: 'POST' })
      } else {
        await fetch(`/api/purchase-orders/${order.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: next }),
        })
      }
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
    setFormSaving(true)
    setFormError(null)
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
      setFormSupplier('')
      setFormDate(new Date().toISOString().slice(0, 10))
      setFormExpected('')
      setFormNotes('')
      setFormItems([{ name: '', unit: 'adet', quantity: '1', unit_price: '' }])
      await load()
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Kayıt hatası')
    } finally {
      setFormSaving(false)
    }
  }

  // Filtered orders for active tab
  const filteredOrders = activeTab === 'all'
    ? orders
    : orders.filter(o => o.status === activeTab)

  // Summary counts
  const counts: Record<OrderStatus | 'all', number> = {
    all:       orders.length,
    draft:     orders.filter(o => o.status === 'draft').length,
    ordered:   orders.filter(o => o.status === 'ordered').length,
    received:  orders.filter(o => o.status === 'received').length,
    cancelled: orders.filter(o => o.status === 'cancelled').length,
  }

  // Overdue intelligence
  const todayISO = new Date().toISOString().slice(0, 10)
  const overdueOrders = orders.filter(
    o => o.status === 'ordered' && o.expected_date && o.expected_date < todayISO
  )
  const pendingTotal = orders
    .filter(o => o.status === 'ordered' || o.status === 'draft')
    .reduce((s, o) => s + Number(o.total_try ?? 0), 0)

  return (
    <div className="space-y-4">

      {/* ── Status filter tabs ──────────────────────────────────────────── */}
      <div className="flex items-center gap-1 border-b border-[#e2e8f0] pb-0">
        {STATUS_TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={[
              'px-3 py-2 text-xs font-semibold rounded-t transition-colors',
              activeTab === tab.key
                ? 'border-b-2 border-brand-light text-brand-light'
                : 'text-[#64748b] hover:text-[#334155]',
            ].join(' ')}
          >
            {tab.label}
            {counts[tab.key] > 0 && (
              <span className="ml-1.5 text-[10px] bg-[#f1f5f9] text-[#64748b] px-1.5 py-0.5 rounded-full">
                {counts[tab.key]}
              </span>
            )}
          </button>
        ))}
        <div className="flex-1" />
        <button
          onClick={() => setShowForm(v => !v)}
          className="text-xs font-bold bg-brand-light text-white px-4 py-1.5 rounded hover:bg-brand transition-colors mb-1"
        >
          {showForm ? '✕ İptal' : '+ Yeni Sipariş'}
        </button>
      </div>

      {/* ── New order form ────────────────────────────────────────────── */}
      {showForm && (
        <div className="bg-white border border-[#e2e8f0] rounded-xl shadow-soft p-5 space-y-4">
          <h3 className="text-sm font-bold text-[#334155]">Yeni Satın Alma Siparişi</h3>
          {formError && (
            <div className="text-xs text-neg bg-neg-light border border-neg-light rounded px-3 py-2">{formError}</div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-1">Tedarikçi *</label>
              <input
                value={formSupplier} onChange={e => setFormSupplier(e.target.value)}
                className="w-full border border-[#e2e8f0] rounded px-3 py-2 text-sm"
                placeholder="Tedarikçi adı"
              />
            </div>
            <div>
              <label className="block text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-1">Sipariş Tarihi</label>
              <input
                type="date" value={formDate} onChange={e => setFormDate(e.target.value)}
                className="w-full border border-[#e2e8f0] rounded px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-1">Beklenen Teslim</label>
              <input
                type="date" value={formExpected} onChange={e => setFormExpected(e.target.value)}
                className="w-full border border-[#e2e8f0] rounded px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-1">Notlar</label>
              <input
                value={formNotes} onChange={e => setFormNotes(e.target.value)}
                className="w-full border border-[#e2e8f0] rounded px-3 py-2 text-sm"
                placeholder="Opsiyonel"
              />
            </div>
          </div>

          {/* Line items */}
          <div>
            <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-2">Kalemler</div>
            {formItems.map((item, idx) => (
              <div key={idx} className="grid grid-cols-[2fr_1fr_1fr_1fr_auto] gap-2 mb-2">
                <input
                  value={item.name}
                  onChange={e => setFormItems(prev => prev.map((it, i) => i === idx ? { ...it, name: e.target.value } : it))}
                  className="border border-[#e2e8f0] rounded px-2 py-1.5 text-xs"
                  placeholder="Ürün / hizmet adı"
                />
                <input
                  value={item.unit}
                  onChange={e => setFormItems(prev => prev.map((it, i) => i === idx ? { ...it, unit: e.target.value } : it))}
                  className="border border-[#e2e8f0] rounded px-2 py-1.5 text-xs"
                  placeholder="adet"
                />
                <input
                  type="number" value={item.quantity} min="0"
                  onChange={e => setFormItems(prev => prev.map((it, i) => i === idx ? { ...it, quantity: e.target.value } : it))}
                  className="border border-[#e2e8f0] rounded px-2 py-1.5 text-xs text-right"
                  placeholder="Miktar"
                />
                <input
                  type="number" value={item.unit_price} min="0"
                  onChange={e => setFormItems(prev => prev.map((it, i) => i === idx ? { ...it, unit_price: e.target.value } : it))}
                  className="border border-[#e2e8f0] rounded px-2 py-1.5 text-xs text-right"
                  placeholder="Birim fiyat ₺"
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

      {/* ── Intelligence alerts ───────────────────────────────────────── */}
      {!loading && orders.length > 0 && (
        <>
          {overdueOrders.length > 0 && (
            <div className="bg-warn-light border border-warn-light rounded px-4 py-3 flex items-start gap-3">
              <span className="text-base mt-0.5">⚠</span>
              <div className="flex-1">
                <div className="text-[11px] font-black uppercase tracking-wide text-warn-text">
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
                <div className="text-[11px] font-black uppercase tracking-wide text-info-text">
                  Büyük Bekleyen Sipariş Hacmi
                </div>
                <div className="text-xs text-info-text mt-0.5">
                  Bekleyen (taslak + sipariş) toplam: {fmt(pendingTotal)}. Nakit akışı planlamasına dahil edilmeli.
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Error / loading / list ────────────────────────────────────── */}
      {error && (
        <div className="bg-neg-light border border-neg-light rounded px-4 py-3 text-sm text-neg">{error}</div>
      )}

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map(i => <Skeleton key={i} height="h-16" />)}
        </div>
      ) : filteredOrders.length === 0 ? (
        <div className="text-center py-12 text-[#94a3b8] text-sm">
          {activeTab === 'all' ? 'Henüz satın alma siparişi yok.' : `Bu durumda sipariş yok.`}
        </div>
      ) : (
        <div className="bg-white border border-[#e2e8f0] rounded-xl shadow-soft overflow-hidden shadow-sm">
          <div className="divide-y divide-[#e2e8f0]">
            {filteredOrders.map(order => {
              const meta  = STATUS_META[order.status]
              const next  = NEXT_STATUS[order.status]
              const busy  = updatingId === order.id
              const isExp = expandedId === order.id
              return (
                <div key={order.id}>
                  <div
                    className="px-4 py-3 flex items-center gap-3 hover:bg-[#f8fafc]/50 cursor-pointer"
                    onClick={() => setExpandedId(isExp ? null : order.id)}
                  >
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
                    <div className="text-sm font-bold tabular-nums text-[#1e293b]">{fmt(order.total_try)}</div>
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
                          className="text-[10px] font-bold px-2 py-1 border border-[#e2e8f0] text-[#64748b] rounded hover:border-neg hover:text-neg disabled:opacity-50"
                        >İptal</button>
                      )}
                    </div>
                  </div>

                  {/* Expanded line items */}
                  {isExp && order.purchase_order_items.length > 0 && (
                    <div className="px-5 pb-3 border-t border-[#f1f5f9] bg-[#f8fafc]/50">
                      <table className="w-full text-xs mt-2">
                        <thead>
                          <tr className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] border-b border-[#e2e8f0]">
                            <th className="text-left py-1.5">Kalem</th>
                            <th className="text-right py-1.5">Miktar</th>
                            <th className="text-right py-1.5">Birim Fiyat</th>
                            <th className="text-right py-1.5">Toplam</th>
                          </tr>
                        </thead>
                        <tbody>
                          {order.purchase_order_items
                            .slice()
                            .sort((a, b) => a.sort_order - b.sort_order)
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

      <NarrativeFooter
        narrative="Satın alma maliyeti FIFO'ya girer ve COGS üzerinden P&L'e yansır — alım zamanlaması ve marj birlikte değerlendirilmeli."
        links={[
          { label: 'Stok',     href: '/dashboard/operations?tab=stock' },
          { label: 'Giderler', href: '/dashboard/operations?tab=expenses' },
          { label: 'P&L',      href: '/dashboard/finance?tab=pnl' },
        ]}
      />
    </div>
  )
}
