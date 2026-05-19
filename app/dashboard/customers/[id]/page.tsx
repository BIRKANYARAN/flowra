'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import type { Customer } from '@/types'
import { fmtNum as fmt } from '@/lib/format'

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

function fmtDate(s: string) {
  return new Date(s).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' })
}

const STATUS_PROFORMA: Record<string, { label: string; cls: string }> = {
  draft:     { label: 'Taslak',     cls: 'bg-[#f1f5f9] text-[#64748b]' },
  sent:      { label: 'Gönderildi', cls: 'bg-info-light text-info-text' },
  accepted:  { label: 'Onaylandı',  cls: 'bg-pos-light text-pos-text' },
  approved:  { label: 'Onaylı',     cls: 'bg-pos-light text-pos-text' },
  rejected:  { label: 'Reddedildi', cls: 'bg-neg-light text-neg' },
  converted: { label: 'Satışa Dön', cls: 'bg-purple-100 text-purple-700' },
}

const STATUS_PAYMENT: Record<string, { label: string; cls: string }> = {
  pending:   { label: 'Bekliyor', cls: 'bg-warn-light text-warn-text' },
  paid:      { label: 'Ödendi',   cls: 'bg-pos-light text-pos-text' },
  partial:   { label: 'Kısmi',    cls: 'bg-yellow-100 text-yellow-700' },
  overdue:   { label: 'Gecikti',  cls: 'bg-orange-100 text-orange-700' },
  cancelled: { label: 'İptal',    cls: 'bg-[#f1f5f9] text-[#64748b]' },
}

const STATUS_SHIPMENT: Record<string, { label: string; cls: string }> = {
  pending:   { label: 'Bekliyor',  cls: 'bg-[#f1f5f9] text-[#64748b]' },
  shipped:   { label: 'Kargoda',   cls: 'bg-info-light text-info-text' },
  delivered: { label: 'Teslim',    cls: 'bg-pos-light text-pos-text' },
}

function Badge({ map, val }: { map: Record<string, { label: string; cls: string }>; val: string | null }) {
  const s = val && map[val] ? map[val] : { label: val ?? '—', cls: 'bg-[#f1f5f9] text-[#94a3b8]' }
  return <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide ${s.cls}`}>{s.label}</span>
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

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/customers/${id}`, signal ? { signal } : undefined)
      if (res.status === 404) { setError('Müşteri bulunamadı.'); return }
      if (!res.ok) { setError('Veriler yüklenemedi.'); return }
      const json = await res.json()
      setData(json)
    } catch (e) {
      if ((e as { name?: string }).name !== 'AbortError') setError('Ağ hatası. Sayfayı yenileyin.')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    const controller = new AbortController()
    load(controller.signal)
    return () => controller.abort()
  }, [load])

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
        <button onClick={() => router.back()} className="text-sm text-[#94a3b8] hover:text-[#334155] mb-4 inline-flex items-center gap-1">← Geri</button>
        <div className="bg-neg-light border border-neg-light rounded p-6 text-neg text-sm">{error || 'Bilinmeyen hata.'}</div>
      </div>
    )
  }

  const { customer, proformas, sales, summary } = data

  return (
    <div className="max-w-4xl space-y-6">

      {/* ── Back + header ─────────────────────────────────────────────────── */}
      <div>
        <Link href="/dashboard/customers" className="text-sm text-[#94a3b8] hover:text-[#334155] inline-flex items-center gap-1 mb-3">
          ← Müşteriler
        </Link>
        <h1 className="text-2xl font-black">{customer.name}</h1>
        {customer.email && <p className="text-sm text-[#64748b] mt-0.5">{customer.email}</p>}
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
            cls:   summary.balance_try > 0 ? 'text-neg' : 'text-pos-text',
          },
        ].map(c => (
          <div key={c.label} className="bg-white border border-[#e2e8f0] rounded px-4 py-3">
            <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-1">{c.label}</div>
            <div className={`text-lg font-black tabular-nums ${c.cls ?? ''}`}>{c.value}</div>
          </div>
        ))}
      </div>

      {/* ── Customer info ─────────────────────────────────────────────────── */}
      <div className="bg-white border border-[#e2e8f0] rounded p-5">
        <h2 className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-4">Müşteri Bilgileri</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2 text-sm">
          {customer.tax_number && (
            <>
              <span className="text-[#94a3b8]">Vergi No</span>
              <span className="font-medium">{customer.tax_number}{customer.tax_office ? ' / ' + customer.tax_office : ''}</span>
            </>
          )}
          {customer.phone && (
            <>
              <span className="text-[#94a3b8]">Telefon</span>
              <span className="font-medium">{customer.phone}</span>
            </>
          )}
          {customer.address && (
            <>
              <span className="text-[#94a3b8]">Adres</span>
              <span className="font-medium">{customer.address}</span>
            </>
          )}
          {customer.notes && (
            <>
              <span className="text-[#94a3b8]">Notlar</span>
              <span className="font-medium">{customer.notes}</span>
            </>
          )}
        </div>
      </div>

      {/* ── Sales ─────────────────────────────────────────────────────────── */}
      <div className="bg-white border border-[#e2e8f0] rounded overflow-hidden">
        <div className="px-5 py-4 border-b border-[#e2e8f0] flex items-center justify-between">
          <h2 className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Satışlar</h2>
          <span className="text-xs text-[#94a3b8]">{summary.sale_count} kayıt</span>
        </div>
        {updateError && (
          <div className="mx-5 mt-3 text-xs text-neg bg-neg-light border border-neg-light rounded px-3 py-2 flex items-center justify-between">
            <span>{updateError}</span>
            <button onClick={() => setUpdateError('')} className="ml-3 text-neg hover:text-neg font-bold">✕</button>
          </div>
        )}
        {sales.length === 0 ? (
          <div className="text-center py-10 text-[#94a3b8] text-sm">Henüz satış yok.</div>
        ) : (
          <div className="divide-y divide-[#e2e8f0]">
            {sales.map(s => {
              const busy = updatingSaleId === s.id
              return (
                <div key={s.id} className="px-5 py-4 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold tabular-nums">
                        {s.currency} {fmt(s.total)}
                        {s.currency !== 'TRY' && (
                          <span className="ml-2 text-[#94a3b8] font-normal text-xs">(≈ ₺{fmt(s.total_try)})</span>
                        )}
                      </div>
                      <div className="text-xs text-[#94a3b8] mt-0.5">{fmtDate(s.sale_date || s.created_at)}</div>
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
                      <span className="text-[#94a3b8] mr-1">Ödeme:</span>
                      {(['pending', 'partial', 'paid', 'overdue'] as const).map(st => (
                        <button
                          key={st}
                          disabled={busy || s.payment_status === st}
                          onClick={() => updateSale(s.id, { payment_status: st })}
                          className={`px-2 py-0.5 rounded border text-[10px] font-bold uppercase transition-colors disabled:cursor-not-allowed
                            ${s.payment_status === st
                              ? 'bg-[#0f172a] text-white border-[#0f172a]'
                              : 'border-[#e2e8f0] text-[#64748b] hover:border-[#64748b] hover:text-[#334155]'
                            }`}
                        >
                          {STATUS_PAYMENT[st]?.label ?? st}
                        </button>
                      ))}
                    </div>

                    {/* Shipment */}
                    <div className="flex items-center gap-1">
                      <span className="text-[#94a3b8] mr-1">Sevkiyat:</span>
                      {(['pending', 'shipped', 'delivered'] as const).map(st => (
                        <button
                          key={st}
                          disabled={busy || s.shipment_status === st}
                          onClick={() => updateSale(s.id, { shipment_status: st })}
                          className={`px-2 py-0.5 rounded border text-[10px] font-bold uppercase transition-colors disabled:cursor-not-allowed
                            ${s.shipment_status === st
                              ? 'bg-[#0f172a] text-white border-[#0f172a]'
                              : 'border-[#e2e8f0] text-[#64748b] hover:border-[#64748b] hover:text-[#334155]'
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
      <div className="bg-white border border-[#e2e8f0] rounded overflow-hidden">
        <div className="px-5 py-4 border-b border-[#e2e8f0] flex items-center justify-between">
          <h2 className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Proformalar</h2>
          <span className="text-xs text-[#94a3b8]">{summary.proforma_count} kayıt</span>
        </div>
        {proformas.length === 0 ? (
          <div className="text-center py-10 text-[#94a3b8] text-sm">Henüz proforma yok.</div>
        ) : (
          <div className="divide-y divide-[#e2e8f0]">
            {proformas.map(p => (
              <div key={p.id} className="flex items-center justify-between px-5 py-3 hover:bg-[#f8fafc]/60 transition-colors">
                <div className="min-w-0">
                  <div className="text-sm font-semibold">{p.proforma_no ?? p.id.slice(0, 8)}</div>
                  <div className="text-xs text-[#94a3b8]">{fmtDate(p.created_at)}</div>
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

      {/* Cross-navigation */}
      <div className="flex items-center justify-between px-1">
        <p className="text-[10px] text-[#94a3b8] leading-relaxed">
          Müşteri detayı tahsilat ve satış pipeline ile birlikte değerlendirilmeli.
        </p>
        <div className="flex items-center gap-2 shrink-0 ml-4">
          <Link href="/dashboard/commercial?tab=customers" className="text-[11px] font-bold text-primary-600 hover:text-primary-700 underline underline-offset-2 whitespace-nowrap">
            Müşteriler →
          </Link>
          <span className="text-[#e2e8f0]">|</span>
          <Link href="/dashboard/commercial?tab=collections" className="text-[11px] font-bold text-primary-600 hover:text-primary-700 underline underline-offset-2 whitespace-nowrap">
            Tahsilat →
          </Link>
          <span className="text-[#e2e8f0]">|</span>
          <Link href="/dashboard/commercial?tab=pipeline" className="text-[11px] font-bold text-primary-600 hover:text-primary-700 underline underline-offset-2 whitespace-nowrap">
            Pipeline →
          </Link>
        </div>
      </div>

    </div>
  )
}
