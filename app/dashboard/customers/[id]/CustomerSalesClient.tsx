'use client'

// ── CustomerSalesClient — client island for sale status toggles ───────────────
// Receives initialSales from server component.
// Only the payment_status / shipment_status inline buttons are interactive.
// After update: re-fetches just the sale row from /api/sales/:id (PATCH).

import { useState } from 'react'

export interface SaleSummary {
  id:              string
  proforma_id:     string | null
  customer_name:   string
  currency:        string
  total:           number
  total_try:       number
  nominal_profit:  number
  payment_status:  string
  paid_at:         string | null
  shipment_status: string | null
  created_at:      string
}

const STATUS_PAYMENT: Record<string, { label: string; cls: string }> = {
  unpaid:  { label: 'Ödenmedi', cls: 'bg-red-100 text-red-600'       },
  paid:    { label: 'Ödendi',   cls: 'bg-green-100 text-green-700'   },
  partial: { label: 'Kısmi',    cls: 'bg-yellow-100 text-yellow-700' },
  overdue: { label: 'Gecikti',  cls: 'bg-orange-100 text-orange-700' },
}
const STATUS_SHIPMENT: Record<string, { label: string; cls: string }> = {
  pending:   { label: 'Bekliyor', cls: 'bg-gray-100 text-gray-500'   },
  shipped:   { label: 'Kargoda',  cls: 'bg-blue-100 text-blue-700'   },
  delivered: { label: 'Teslim',   cls: 'bg-green-100 text-green-700' },
}

function fmt(n: number) {
  return new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
}
function fmtDate(s: string) {
  return new Date(s).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' })
}
function Badge({ map, val }: { map: Record<string, { label: string; cls: string }>; val: string | null }) {
  const s = val && map[val] ? map[val] : { label: val ?? '—', cls: 'bg-gray-100 text-gray-400' }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${s.cls}`}>
      {s.label}
    </span>
  )
}

interface Props {
  initialSales: SaleSummary[]
  saleCount:    number
}

export default function CustomerSalesClient({ initialSales, saleCount }: Props) {
  const [sales,          setSales]         = useState<SaleSummary[]>(initialSales)
  const [updatingSaleId, setUpdatingSaleId] = useState<string | null>(null)
  const [updateError,    setUpdateError]   = useState('')

  async function updateSale(saleId: string, patch: Record<string, string>) {
    setUpdatingSaleId(saleId)
    setUpdateError('')
    try {
      const res = await fetch(`/api/sales/${saleId}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(patch),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({})) as Record<string, unknown>
        setUpdateError((json.error as string | undefined) ?? 'Güncelleme başarısız oldu.')
        return
      }
      // Optimistic update — merge the patch into local state
      setSales(prev =>
        prev.map(s => s.id === saleId ? { ...s, ...patch } : s)
      )
    } catch {
      setUpdateError('Ağ hatası. Lütfen tekrar deneyin.')
    } finally {
      setUpdatingSaleId(null)
    }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
        <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Satışlar</h2>
        <span className="text-xs text-gray-400">{saleCount} kayıt</span>
      </div>

      {updateError && (
        <div className="mx-5 mt-3 text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2 flex items-center justify-between">
          <span>{updateError}</span>
          <button
            onClick={() => setUpdateError('')}
            className="ml-3 text-red-400 hover:text-red-600 font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {sales.length === 0 ? (
        <div className="text-center py-10 text-gray-400 text-sm">Henüz satış yok.</div>
      ) : (
        <div className="divide-y divide-gray-100">
          {sales.map(s => {
            const busy = updatingSaleId === s.id
            return (
              <div key={s.id} className="px-5 py-4 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold tabular-nums">
                      {s.currency} {fmt(s.total)}
                      {s.currency !== 'TRY' && (
                        <span className="ml-2 text-gray-400 font-normal text-xs">
                          (≈ ₺{fmt(s.total_try)})
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5">{fmtDate(s.created_at)}</div>
                  </div>
                  <div className="flex gap-1.5 flex-shrink-0 items-center">
                    <Badge map={STATUS_PAYMENT}  val={s.payment_status} />
                    <Badge map={STATUS_SHIPMENT} val={s.shipment_status} />
                  </div>
                </div>

                {/* Inline status controls */}
                <div className="flex flex-wrap gap-2 text-xs">
                  {/* Payment */}
                  <div className="flex items-center gap-1">
                    <span className="text-gray-400 mr-1">Ödeme:</span>
                    {(['unpaid', 'partial', 'paid', 'overdue'] as const).map(st => (
                      <button
                        key={st}
                        disabled={busy || s.payment_status === st}
                        onClick={() => updateSale(s.id, { payment_status: st })}
                        className={`px-2 py-0.5 rounded-full border text-[10px] font-bold uppercase transition-colors disabled:cursor-not-allowed
                          ${s.payment_status === st
                            ? 'bg-gray-900 text-white border-gray-900'
                            : 'border-gray-200 text-gray-500 hover:border-gray-400 hover:text-gray-700'
                          }`}
                      >
                        {STATUS_PAYMENT[st]?.label ?? st}
                      </button>
                    ))}
                  </div>

                  {/* Shipment */}
                  <div className="flex items-center gap-1">
                    <span className="text-gray-400 mr-1">Sevkiyat:</span>
                    {(['pending', 'shipped', 'delivered'] as const).map(st => (
                      <button
                        key={st}
                        disabled={busy || s.shipment_status === st}
                        onClick={() => updateSale(s.id, { shipment_status: st })}
                        className={`px-2 py-0.5 rounded-full border text-[10px] font-bold uppercase transition-colors disabled:cursor-not-allowed
                          ${s.shipment_status === st
                            ? 'bg-gray-900 text-white border-gray-900'
                            : 'border-gray-200 text-gray-500 hover:border-gray-400 hover:text-gray-700'
                          }`}
                      >
                        {STATUS_SHIPMENT[st]?.label ?? st}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
