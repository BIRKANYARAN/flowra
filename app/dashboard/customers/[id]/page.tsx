'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import type { Customer } from '@/types'

// ── Local types for the detail API response ───────────────────────────────────

interface ProformaSummary {
  id:           string
  proforma_no:  string | null
  status:       string
  total:        number
  currency:     string
  created_at:   string
  converted_at: string | null
}

interface SaleSummary {
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
  /** Business invoice date (YYYY-MM-DD) — preferred for display */
  sale_date:       string
  created_at:      string
}

interface CustomerSummary {
  proforma_count:   number
  sale_count:       number
  total_billed_try: number
  total_paid_try:   number
  balance_try:      number
}

interface DetailData {
  customer:  Customer
  proformas: ProformaSummary[]
  sales:     SaleSummary[]
  summary:   CustomerSummary
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
}

function fmtDate(s: string) {
  return new Date(s).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' })
}

const STATUS_PROFORMA: Record<string, { label: string; cls: string }> = {
  draft:     { label: 'Taslak',     cls: 'bg-gray-100 text-gray-500' },
  sent:      { label: 'Gönderildi', cls: 'bg-blue-100 text-blue-700' },
  accepted:  { label: 'Onaylandı',  cls: 'bg-green-100 text-green-700' },
  approved:  { label: 'Onaylı',     cls: 'bg-green-100 text-green-700' },
  rejected:  { label: 'Reddedildi', cls: 'bg-red-100 text-red-600' },
  converted: { label: 'Satışa Dön', cls: 'bg-purple-100 text-purple-700' },
}

const STATUS_PAYMENT: Record<string, { label: string; cls: string }> = {
  pending:   { label: 'Bekliyor', cls: 'bg-amber-100 text-amber-700' },
  paid:      { label: 'Ödendi',   cls: 'bg-green-100 text-green-700' },
  partial:   { label: 'Kısmi',    cls: 'bg-yellow-100 text-yellow-700' },
  overdue:   { label: 'Gecikti',  cls: 'bg-orange-100 text-orange-700' },
  cancelled: { label: 'İptal',    cls: 'bg-gray-100 text-gray-500' },
}

const STATUS_SHIPMENT: Record<string, { label: string; cls: string }> = {
  pending:   { label: 'Bekliyor',  cls: 'bg-gray-100 text-gray-500' },
  shipped:   { label: 'Kargoda',   cls: 'bg-blue-100 text-blue-700' },
  delivered: { label: 'Teslim',    cls: 'bg-green-100 text-green-700' },
}

function Badge({ map, val }: { map: Record<string, { label: string; cls: string }>; val: string | null }) {
  const s = val && map[val] ? map[val] : { label: val ?? '—', cls: 'bg-gray-100 text-gray-400' }
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${s.cls}`}>{s.label}</span>
}

// ── Page component ─────────────────────────────────────────────────────────────

export default function CustomerDetailPage() {
  const { id }  = useParams<{ id: string }>()
  const router  = useRouter()

  const [data,    setData]    = useState<DetailData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')

  // ── Payment / shipment update state ───────────────────────────────────────
  const [updatingSaleId, setUpdatingSaleId] = useState<string | null>(null)
  const [updateError,    setUpdateError]    = useState<string>('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/customers/${id}`)
      if (res.status === 404) { setError('Müşteri bulunamadı.'); return }
      if (!res.ok) { setError('Veriler yüklenemedi.'); return }
      const json = await res.json()
      setData(json)
    } catch {
      setError('Ağ hatası. Sayfayı yenileyin.')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { load() }, [load])

  async function updateSale(saleId: string, patch: Record<string, string>) {
    setUpdatingSaleId(saleId)
    setUpdateError('')
    try {
      const res = await fetch(`/api/sales/${saleId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({})) as Record<string, unknown>
        setUpdateError((json.error as string | undefined) ?? 'Güncelleme başarısız oldu.')
        return  // do NOT reload — keep the UI showing current state
      }
      // Success: reload to reflect the updated status badges + summary cards
      await load()
    } catch {
      setUpdateError('Ağ hatası. Lütfen tekrar deneyin.')
    } finally {
      setUpdatingSaleId(null)
    }
  }

  // ── Loading / error states ─────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center h-40">
        <div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="max-w-2xl">
        <button onClick={() => router.back()} className="text-sm text-gray-400 hover:text-gray-700 mb-4 inline-flex items-center gap-1">← Geri</button>
        <div className="bg-red-50 border border-red-100 rounded-2xl p-6 text-red-600 text-sm">{error || 'Bilinmeyen hata.'}</div>
      </div>
    )
  }

  const { customer, proformas, sales, summary } = data

  return (
    <div className="max-w-4xl space-y-6">

      {/* ── Back + header ─────────────────────────────────────────────────── */}
      <div>
        <Link href="/dashboard/customers" className="text-sm text-gray-400 hover:text-gray-700 inline-flex items-center gap-1 mb-3">
          ← Müşteriler
        </Link>
        <h1 className="text-2xl font-black">{customer.name}</h1>
        {customer.email && <p className="text-sm text-gray-500 mt-0.5">{customer.email}</p>}
      </div>

      {/* ── Summary cards ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Proforma',   value: summary.proforma_count.toString() },
          { label: 'Satış',      value: summary.sale_count.toString() },
          { label: 'Toplam Fatura', value: `₺${fmt(summary.total_billed_try)}` },
          {
            label: summary.balance_try > 0 ? 'Bakiye (Ödenmedi)' : 'Tahsil Edildi',
            value: `₺${fmt(Math.abs(summary.balance_try))}`,
            cls:   summary.balance_try > 0 ? 'text-red-600' : 'text-green-600',
          },
        ].map(c => (
          <div key={c.label} className="bg-white border border-gray-200 rounded-2xl px-4 py-3">
            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">{c.label}</div>
            <div className={`text-lg font-black tabular-nums ${c.cls ?? ''}`}>{c.value}</div>
          </div>
        ))}
      </div>

      {/* ── Customer info ─────────────────────────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5">
        <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">Müşteri Bilgileri</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2 text-sm">
          {customer.tax_number && (
            <>
              <span className="text-gray-400">Vergi No</span>
              <span className="font-medium">{customer.tax_number}{customer.tax_office ? ' / ' + customer.tax_office : ''}</span>
            </>
          )}
          {customer.phone && (
            <>
              <span className="text-gray-400">Telefon</span>
              <span className="font-medium">{customer.phone}</span>
            </>
          )}
          {customer.address && (
            <>
              <span className="text-gray-400">Adres</span>
              <span className="font-medium">{customer.address}</span>
            </>
          )}
          {customer.notes && (
            <>
              <span className="text-gray-400">Notlar</span>
              <span className="font-medium">{customer.notes}</span>
            </>
          )}
        </div>
      </div>

      {/* ── Sales ─────────────────────────────────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Satışlar</h2>
          <span className="text-xs text-gray-400">{summary.sale_count} kayıt</span>
        </div>
        {updateError && (
          <div className="mx-5 mt-3 text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2 flex items-center justify-between">
            <span>{updateError}</span>
            <button onClick={() => setUpdateError('')} className="ml-3 text-red-400 hover:text-red-600 font-bold">✕</button>
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
                          <span className="ml-2 text-gray-400 font-normal text-xs">(≈ ₺{fmt(s.total_try)})</span>
                        )}
                      </div>
                      <div className="text-xs text-gray-400 mt-0.5">{fmtDate(s.sale_date || s.created_at)}</div>
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
                      {(['pending', 'partial', 'paid', 'overdue'] as const).map(st => (
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

      {/* ── Proformas ─────────────────────────────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Proformalar</h2>
          <span className="text-xs text-gray-400">{summary.proforma_count} kayıt</span>
        </div>
        {proformas.length === 0 ? (
          <div className="text-center py-10 text-gray-400 text-sm">Henüz proforma yok.</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {proformas.map(p => (
              <div key={p.id} className="flex items-center justify-between px-5 py-3 hover:bg-gray-50/60 transition-colors">
                <div className="min-w-0">
                  <div className="text-sm font-semibold">{p.proforma_no ?? p.id.slice(0, 8)}</div>
                  <div className="text-xs text-gray-400">{fmtDate(p.created_at)}</div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className="text-sm font-medium tabular-nums">
                    {p.currency} {fmt(p.total)}
                  </span>
                  <Badge map={STATUS_PROFORMA} val={p.status} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  )
}
