'use client'

// ═══════════════════════════════════════════════════════════════════════════════
// Flowra — Proforma Invoice (enterprise-grade, print-safe)
//
// TABLE COLUMNS:
//   Ürün / Hizmet | Birim | Adet | Birim Fiyat | İskonto % | Net Tutar | KDV | Satır Toplamı
//
// SAFETY: Never renders unit_cost, profit, internal_notes
// ═══════════════════════════════════════════════════════════════════════════════

import React from 'react'
import { calculateLine, calculateTotals, type LineInput } from '@/lib/calc'

// ── Helpers ──────────────────────────────────────────────────────────────────

function sym(c: string): string {
  return c === 'USD' ? '$' : c === 'EUR' ? '€' : c === 'GBP' ? '£' : '₺'
}

function currencyLabel(c: string): string {
  if (c === 'USD') return 'ABD Doları ($)'
  if (c === 'EUR') return 'Euro (€)'
  if (c === 'GBP') return 'İngiliz Sterlini (£)'
  return 'Türk Lirası (₺)'
}

function fmtDate(d: string): string {
  try {
    return new Date(d).toLocaleDateString('tr-TR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
    })
  } catch { return d }
}

function addDays(d: string, n: number): string {
  try {
    const dt = new Date(d)
    dt.setDate(dt.getDate() + n)
    return dt.toLocaleDateString('tr-TR', {
      day: '2-digit', month: 'long', year: 'numeric',
    })
  } catch { return '' }
}

function money(v: number, symbol: string): string {
  return v.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ' + symbol
}

// ── Types ────────────────────────────────────────────────────────────────────

interface ProformaInvoiceProps {
  proforma: {
    id: string
    proforma_no: string | null
    customer_name: string
    currency: string
    validity_days: number
    notes: string | null
    created_at: string
  }
  items: Array<{
    id: string
    name: string
    unit: string
    price: number
    quantity: number
    discount_percent: number
    kdv: number
    currency: string
  }>
  settings: {
    company_name: string | null
    address: string | null
    phone: string | null
    website: string | null
    tax_number: string | null
    tax_office: string | null
    logo_url: string | null
    mersis_no: string | null
  } | null
  customer: {
    name: string | null
    address: string | null
    tax_number: string | null
    tax_office: string | null
    email: string | null
    phone: string | null
  } | null
  banks: Array<{
    bank_name: string
    branch_name: string | null
    iban: string
  }>
  showPrintButton?: boolean
}

// ── Component ────────────────────────────────────────────────────────────────

export function ProformaInvoice({
  proforma,
  items,
  settings,
  customer,
  banks,
  showPrintButton = false,
}: ProformaInvoiceProps) {
  const S = sym(proforma.currency || 'TRY')
  const no = proforma.proforma_no || ('PRF-' + proforma.id.slice(-8).toUpperCase())
  const expiry = addDays(proforma.created_at, proforma.validity_days || 30)
  const issueDate = fmtDate(proforma.created_at)

  // ── Per-line calculations ─────────────────────────────────────────────────
  const computed = items.map((it) => {
    const line = calculateLine(it as LineInput)
    return {
      price: line.price,
      qty: line.quantity,
      disc: line.discount_percent,
      kdvPct: line.kdv,
      netUnitPrice: line.discounted_unit_price,
      lineSubtotal: line.line_subtotal,
      lineKdv: line.line_vat,
      lineTotal: line.line_total,
    }
  })

  // ── Totals ────────────────────────────────────────────────────────────────
  const totals = calculateTotals(items as LineInput[])
  const subtotal      = totals.subtotal
  const totalDiscount = totals.total_discount
  const kdvTotal      = totals.kdv_total
  const kdvMap        = totals.kdv_breakdown
  const grand         = totals.grand_total
  const kdvRates = Object.keys(kdvMap)
    .filter((k) => kdvMap[k] > 0)
    .sort((a, b) => +a - +b)

  return (
    <div className="bg-white overflow-hidden" style={{ fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif" }}>

      {/* ── Accent stripe + document type ────────────────────────────────── */}
      <div className="bg-gray-900 px-8 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          {/* Company logo in stripe */}
          {settings?.logo_url ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={settings.logo_url}
              alt={settings.company_name || 'Logo'}
              className="h-9 w-auto object-contain max-w-[140px]"
              style={{ filter: 'brightness(0) invert(1)' }}
            />
          ) : (
            <div className="text-white font-black text-xl tracking-wide">
              {settings?.company_name?.slice(0, 2).toUpperCase() || 'FL'}
            </div>
          )}
          {settings?.company_name && (
            <div className="text-white/60 text-sm font-medium">{settings.company_name}</div>
          )}
        </div>
        <div className="text-right">
          <div className="text-white/50 text-[10px] font-bold uppercase tracking-widest">Proforma Fatura</div>
          <div className="text-white font-black text-lg tracking-wide">{no}</div>
          <div className="inline-flex items-center gap-1 bg-white/10 text-white/80 text-[10px] font-semibold px-2 py-0.5 rounded-full mt-1">
            {currencyLabel(proforma.currency || 'TRY')}
          </div>
        </div>
      </div>

      {/* ── Header: Company + Customer + Document Meta ────────────────────── */}
      <div className="px-8 py-5">
        <div className="grid grid-cols-3 gap-6">

          {/* Satıcı */}
          <div>
            <div className="text-[9px] font-black uppercase tracking-widest text-gray-400 mb-2 pb-1 border-b border-gray-100">
              Satıcı Bilgileri
            </div>
            <div className="font-bold text-sm text-gray-900 leading-tight">
              {settings?.company_name || '—'}
            </div>
            {settings?.address && (
              <div className="text-xs text-gray-500 mt-1 whitespace-pre-line leading-relaxed">
                {settings.address}
              </div>
            )}
            <div className="mt-1.5 space-y-0.5">
              {settings?.tax_number && (
                <div className="text-[10px] text-gray-400">
                  VKN: <span className="text-gray-600 font-medium">{settings.tax_number}</span>
                  {settings.tax_office ? <span> · {settings.tax_office}</span> : ''}
                </div>
              )}
              {settings?.mersis_no && (
                <div className="text-[10px] text-gray-400">
                  MERSİS: <span className="text-gray-600 font-medium">{settings.mersis_no}</span>
                </div>
              )}
              {settings?.phone && (
                <div className="text-[10px] text-gray-400">
                  Tel: <span className="text-gray-600 font-medium">{settings.phone}</span>
                </div>
              )}
              {settings?.website && (
                <div className="text-[10px] text-gray-400">{settings.website}</div>
              )}
            </div>
          </div>

          {/* Alıcı */}
          <div>
            <div className="text-[9px] font-black uppercase tracking-widest text-gray-400 mb-2 pb-1 border-b border-gray-100">
              Alıcı Bilgileri
            </div>
            <div className="font-bold text-sm text-gray-900 leading-tight">
              {proforma.customer_name || customer?.name || '—'}
            </div>
            {customer?.address && (
              <div className="text-xs text-gray-500 mt-1 whitespace-pre-line leading-relaxed">
                {customer.address}
              </div>
            )}
            <div className="mt-1.5 space-y-0.5">
              {customer?.tax_number && (
                <div className="text-[10px] text-gray-400">
                  VKN: <span className="text-gray-600 font-medium">{customer.tax_number}</span>
                  {customer.tax_office ? <span> · {customer.tax_office}</span> : ''}
                </div>
              )}
              {customer?.email && (
                <div className="text-[10px] text-gray-400">
                  E-posta: <span className="text-gray-600 font-medium">{customer.email}</span>
                </div>
              )}
              {customer?.phone && (
                <div className="text-[10px] text-gray-400">
                  Tel: <span className="text-gray-600 font-medium">{customer.phone}</span>
                </div>
              )}
            </div>
          </div>

          {/* Belge Detayları */}
          <div>
            <div className="text-[9px] font-black uppercase tracking-widest text-gray-400 mb-2 pb-1 border-b border-gray-100">
              Belge Bilgileri
            </div>
            <div className="space-y-1.5">
              {[
                { label: 'Belge No',       value: no },
                { label: 'Düzenleme Tarihi', value: issueDate },
                { label: 'Geçerlilik',      value: `${proforma.validity_days} gün` },
                { label: 'Son Geçerlilik',  value: expiry },
              ].map(({ label, value }) => (
                <div key={label} className="flex justify-between items-baseline gap-2">
                  <span className="text-[10px] text-gray-400">{label}</span>
                  <span className="text-[11px] font-semibold text-gray-700 text-right">{value}</span>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>

      {/* ── Items Table ───────────────────────────────────────────────────── */}
      <div className="mx-6 rounded-lg overflow-hidden border border-gray-200">
        <table className="w-full" style={{ borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: '#1f2937' }}>
              <th className="text-left px-4 py-2.5 text-[10px] font-bold text-white/70 uppercase tracking-widest" style={{ width: '28%' }}>
                Ürün / Hizmet
              </th>
              <th className="text-center px-2 py-2.5 text-[10px] font-bold text-white/70 uppercase tracking-widest" style={{ width: '6%' }}>Birim</th>
              <th className="text-center px-2 py-2.5 text-[10px] font-bold text-white/70 uppercase tracking-widest" style={{ width: '5%' }}>Adet</th>
              <th className="text-right px-2 py-2.5 text-[10px] font-bold text-white/70 uppercase tracking-widest" style={{ width: '13%' }}>
                Birim Fiyat ({S})
              </th>
              <th className="text-center px-2 py-2.5 text-[10px] font-bold text-white/70 uppercase tracking-widest" style={{ width: '8%' }}>
                İskonto
              </th>
              <th className="text-right px-2 py-2.5 text-[10px] font-bold text-white/70 uppercase tracking-widest" style={{ width: '14%' }}>
                Net Tutar ({S})
              </th>
              <th className="text-center px-2 py-2.5 text-[10px] font-bold text-white/70 uppercase tracking-widest" style={{ width: '7%' }}>KDV</th>
              <th className="text-right px-4 py-2.5 text-[10px] font-bold text-white/70 uppercase tracking-widest" style={{ width: '15%' }}>
                Toplam ({S})
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => {
              const c = computed[i]
              return (
                <tr
                  key={it.id}
                  style={{ backgroundColor: i % 2 === 1 ? '#f9fafb' : '#ffffff', borderBottom: '1px solid #f3f4f6' }}
                >
                  <td className="px-4 py-2.5 font-medium text-gray-900 text-sm">
                    {it.name}
                  </td>
                  <td className="px-2 py-2.5 text-center text-gray-500 text-xs">
                    {it.unit || 'adet'}
                  </td>
                  <td className="px-2 py-2.5 text-center tabular-nums text-sm text-gray-700">
                    {c.qty}
                  </td>
                  <td className="px-2 py-2.5 text-right tabular-nums text-sm text-gray-700">
                    {money(c.price, S)}
                  </td>
                  <td className="px-2 py-2.5 text-center text-gray-400 text-xs">
                    {c.disc > 0 ? `%${c.disc}` : '—'}
                  </td>
                  <td className="px-2 py-2.5 text-right tabular-nums text-sm text-gray-700">
                    {money(c.lineSubtotal, S)}
                  </td>
                  <td className="px-2 py-2.5 text-center text-gray-400 text-xs">
                    %{c.kdvPct}
                  </td>
                  <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-sm text-gray-900">
                    {money(c.lineTotal, S)}
                  </td>
                </tr>
              )
            })}
            {/* Empty row guard */}
            {items.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-sm text-gray-400">
                  — Ürün yok —
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ── Totals ────────────────────────────────────────────────────────── */}
      <div className="px-6 py-5">
        <div className="ml-auto w-80">

          {/* Line items */}
          <div className="space-y-1.5 border border-gray-200 rounded-t-xl px-5 py-3 bg-white">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Ara Toplam</span>
              <span className="tabular-nums font-medium text-gray-800">{money(subtotal, S)}</span>
            </div>

            {totalDiscount > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Toplam İskonto</span>
                <span className="tabular-nums text-red-500 font-medium">− {money(totalDiscount, S)}</span>
              </div>
            )}

            {kdvRates.map((rate) => (
              <div key={rate} className="flex justify-between text-sm">
                <span className="text-gray-400">KDV %{rate}</span>
                <span className="tabular-nums text-gray-500">{money(kdvMap[rate], S)}</span>
              </div>
            ))}

            <div className="flex justify-between text-sm pt-1.5 border-t border-gray-100">
              <span className="text-gray-600 font-medium">Toplam KDV</span>
              <span className="tabular-nums font-semibold text-gray-700">{money(kdvTotal, S)}</span>
            </div>
          </div>

          {/* Grand total — high emphasis */}
          <div className="bg-gray-900 text-white rounded-b-xl px-5 py-4 flex justify-between items-center">
            <div>
              <div className="text-white/50 text-[10px] font-bold uppercase tracking-widest">Genel Toplam</div>
              <div className="text-white/60 text-[10px] mt-0.5">{currencyLabel(proforma.currency || 'TRY')}</div>
            </div>
            <span className="font-black text-2xl tabular-nums tracking-tight">
              {money(grand, S)}
            </span>
          </div>

        </div>
      </div>

      {/* ── Footer ────────────────────────────────────────────────────────── */}
      <div className="mx-6 mb-6 border border-gray-200 rounded-xl overflow-hidden">

        {/* Yazı ile tutar */}
        <div className="px-5 py-3 bg-gray-50 border-b border-gray-200">
          <span className="text-xs text-gray-500 font-medium">
            Yalnız{' '}
            <span className="text-gray-800 font-semibold">
              {grand.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} {currencyLabel(proforma.currency || 'TRY')}
            </span>{' '}
            tutarındadır.
          </span>
        </div>

        {/* Validity + Notes */}
        <div className="px-5 py-3 grid grid-cols-2 gap-4 border-b border-gray-200">
          <div className="text-xs text-gray-500 leading-relaxed">
            Bu fiyat teklifi{' '}
            <span className="font-semibold text-gray-700">{proforma.validity_days} gün</span>{' '}
            geçerlidir. Son geçerlilik tarihi:{' '}
            <span className="font-semibold text-gray-700">{expiry}</span>
          </div>
          {proforma.notes && (
            <div className="text-xs text-gray-500 leading-relaxed">
              <span className="font-semibold text-gray-400 block mb-0.5">Not:</span>
              {proforma.notes}
            </div>
          )}
        </div>

        {/* Bank info */}
        {banks.length > 0 && (
          <div className="px-5 py-3 border-b border-gray-200">
            <div className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-2">Ödeme Bilgileri</div>
            <div className="space-y-1.5">
              {banks.map((b, i) => (
                <div key={i} className="flex items-baseline justify-between gap-4">
                  <span className="text-xs font-semibold text-gray-700">
                    {b.bank_name}
                    {b.branch_name && (
                      <span className="text-gray-400 font-normal"> · {b.branch_name}</span>
                    )}
                  </span>
                  <span className="text-xs font-mono text-gray-600 tracking-wide tabular-nums">
                    {b.iban}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Signature area */}
        <div className="px-5 py-4 grid grid-cols-2 gap-8">
          <div>
            <div className="text-[9px] font-black text-gray-300 uppercase tracking-widest mb-3">Satıcı Onayı</div>
            <div className="h-12 border-b border-dashed border-gray-200" />
            <div className="mt-1 text-[10px] text-gray-400">{settings?.company_name || ''}</div>
          </div>
          <div>
            <div className="text-[9px] font-black text-gray-300 uppercase tracking-widest mb-3">Alıcı Onayı</div>
            <div className="h-12 border-b border-dashed border-gray-200" />
            <div className="mt-1 text-[10px] text-gray-400">{proforma.customer_name || ''}</div>
          </div>
        </div>

      </div>

      {/* ── Print button ──────────────────────────────────────────────────── */}
      {showPrintButton && (
        <div className="px-6 pb-6 print:hidden">
          <button
            onClick={() => window.print()}
            className="px-5 py-2.5 bg-gray-900 text-white text-sm font-semibold rounded-lg hover:bg-gray-800 transition-colors"
          >
            Yazdır / PDF İndir
          </button>
        </div>
      )}
    </div>
  )
}
