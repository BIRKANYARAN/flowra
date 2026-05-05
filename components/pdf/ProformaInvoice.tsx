'use client'

// ═══════════════════════════════════════════════════════════════════════════════
// Flowra — Shared Proforma Invoice Component
//
// Used by: Dashboard proforma view, Public proforma page, Print page
//
// TABLE COLUMNS:
//   Ürün / Hizmet | Birim | Adet | Birim Fiyat | İskonto % | Net Tutar | KDV | Satır Toplamı
//
// CALCULATIONS:
//   net_unit_price = price * (1 - discount_percent / 100)
//   line_subtotal  = net_unit_price * quantity
//   line_total     = line_subtotal * (1 + kdv / 100)
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
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
  } catch {
    return d
  }
}

function addDays(d: string, n: number): string {
  try {
    const dt = new Date(d)
    dt.setDate(dt.getDate() + n)
    return dt.toLocaleDateString('tr-TR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
  } catch {
    return ''
  }
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
  const expiry = addDays(proforma.created_at, proforma.validity_days || 1)

  // ── Per-line calculations (central calc engine) ────────────────────────────
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

  // ── Totals (central calc engine) ───────────────────────────────────────────
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
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="px-8 pt-8 pb-6">
        {/* Company info (top-left) */}
        <div className="flex items-start gap-6">
          <div className="flex-1 min-w-0">
            <div className="flex items-start gap-3 mb-2">
              {settings?.logo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={settings.logo_url}
                  alt="Logo"
                  className="h-14 w-auto object-contain max-w-[160px] flex-shrink-0"
                  onError={(e) => {
                    const el = e.target as HTMLImageElement
                    el.style.display = 'none'
                    const placeholder = el.nextElementSibling as HTMLElement | null
                    if (placeholder) placeholder.style.display = 'flex'
                  }}
                />
              ) : null}
              {/* Placeholder if logo fails */}
              <div
                className="h-14 w-14 bg-gray-100 rounded-lg items-center justify-center text-gray-400 text-xs font-bold flex-shrink-0"
                style={{ display: settings?.logo_url ? 'none' : 'flex' }}
              >
                LOGO
              </div>
              <div>
                <div className="font-bold text-base text-gray-900">
                  {settings?.company_name || '—'}
                </div>
                {settings?.address && (
                  <div className="text-xs text-gray-500 mt-0.5 whitespace-pre-line leading-relaxed">
                    {settings.address}
                  </div>
                )}
              </div>
            </div>
            <div className="space-y-0.5 mt-1">
              {settings?.tax_number && (
                <div className="text-xs text-gray-500">
                  Vergi Numarası: {settings.tax_number}
                  {settings.tax_office ? ` · ${settings.tax_office}` : ''}
                </div>
              )}
              {settings?.mersis_no && (
                <div className="text-xs text-gray-500">
                  MERSİS No: {settings.mersis_no}
                </div>
              )}
              {settings?.phone && (
                <div className="text-xs text-gray-500">Telefon: {settings.phone}</div>
              )}
              {settings?.website && (
                <div className="text-xs text-gray-500">{settings.website}</div>
              )}
            </div>
          </div>

          {/* Document meta (top-right) */}
          <div className="text-right flex-shrink-0">
            <div className="text-xs text-gray-400 mb-0.5">Belge No</div>
            <div className="font-bold text-sm text-gray-900 bg-gray-100 rounded-md px-3 py-1 inline-block">
              {no}
            </div>
            <div className="text-xs text-gray-500 mt-2">
              Tarih: {fmtDate(proforma.created_at)}
            </div>
            <div className="text-xs text-gray-500">
              Geçerlilik: {proforma.validity_days} gün
            </div>
            <div className="text-xs text-gray-500">
              Son Tarih: {expiry}
            </div>
            <div className="mt-2 text-xs font-medium text-indigo-600 bg-indigo-50 rounded px-2 py-0.5 inline-block">
              {currencyLabel(proforma.currency || 'TRY')}
            </div>
          </div>
        </div>

        {/* ── Centered Title ──────────────────────────────────────────────── */}
        <div className="text-center mt-6 mb-2">
          <h1 className="text-2xl font-black tracking-widest text-gray-900 uppercase">
            Proforma Fatura
          </h1>
        </div>

        {/* ── Müşteri Bilgileri ───────────────────────────────────────────── */}
        <div className="mt-4 border border-gray-200 rounded-xl p-4 bg-gray-50/50">
          <div className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">
            Müşteri Bilgileri
          </div>
          <div className="grid grid-cols-2 gap-x-8 gap-y-1">
            <div>
              <div className="font-semibold text-sm text-gray-900">
                {proforma.customer_name || customer?.name || '—'}
              </div>
              {customer?.address && (
                <div className="text-xs text-gray-500 mt-0.5 whitespace-pre-line leading-relaxed">
                  {customer.address}
                </div>
              )}
            </div>
            <div className="space-y-0.5">
              {customer?.tax_number && (
                <div className="text-xs text-gray-500">
                  Vergi Numarası: {customer.tax_number}
                  {customer.tax_office ? ` · ${customer.tax_office}` : ''}
                </div>
              )}
              {customer?.email && (
                <div className="text-xs text-gray-500">E-posta: {customer.email}</div>
              )}
              {customer?.phone && (
                <div className="text-xs text-gray-500">Telefon: {customer.phone}</div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Table ─────────────────────────────────────────────────────────── */}
      <div className="overflow-x-auto px-4">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-900 text-white text-xs font-semibold uppercase tracking-wide">
              <th className="text-left px-4 py-3 rounded-tl-lg" style={{ width: '26%' }}>
                Ürün / Hizmet
              </th>
              <th className="text-center px-2 py-3" style={{ width: '7%' }}>Birim</th>
              <th className="text-center px-2 py-3" style={{ width: '6%' }}>Adet</th>
              <th className="text-right px-2 py-3" style={{ width: '13%' }}>
                Birim Fiyat ({S})
              </th>
              <th className="text-center px-2 py-3" style={{ width: '8%' }}>
                İskonto (%)
              </th>
              <th className="text-right px-2 py-3" style={{ width: '14%' }}>
                Net Tutar ({S})
              </th>
              <th className="text-center px-2 py-3" style={{ width: '7%' }}>KDV (%)</th>
              <th className="text-right px-4 py-3 rounded-tr-lg" style={{ width: '15%' }}>
                Satır Toplamı ({S})
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => {
              const c = computed[i]
              return (
                <tr
                  key={it.id}
                  className={`border-b border-gray-100 text-sm ${
                    i % 2 === 1 ? 'bg-gray-50/60' : ''
                  }`}
                >
                  <td className="px-4 py-3 font-medium text-gray-900">
                    {it.name}
                  </td>
                  <td className="px-2 py-3 text-center text-gray-500 text-xs">
                    {it.unit || 'adet'}
                  </td>
                  <td className="px-2 py-3 text-center tabular-nums">
                    {c.qty}
                  </td>
                  <td className="px-2 py-3 text-right tabular-nums">
                    {money(c.price, S)}
                  </td>
                  <td className="px-2 py-3 text-center text-gray-500">
                    {c.disc > 0 ? `%${c.disc}` : '—'}
                  </td>
                  <td className="px-2 py-3 text-right tabular-nums">
                    {money(c.lineSubtotal, S)}
                  </td>
                  <td className="px-2 py-3 text-center text-gray-500">
                    %{c.kdvPct}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums">
                    {money(c.lineTotal, S)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* ── Totals ────────────────────────────────────────────────────────── */}
      <div className="px-8 py-6 border-t border-gray-200 bg-gray-50/30">
        <div className="ml-auto w-80 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Ara Toplam</span>
            <span className="tabular-nums font-medium">{money(subtotal, S)}</span>
          </div>

          {totalDiscount > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Toplam İskonto</span>
              <span className="tabular-nums text-red-600 font-medium">
                -{money(totalDiscount, S)}
              </span>
            </div>
          )}

          {kdvRates.map((rate) => (
            <div key={rate} className="flex justify-between text-sm text-gray-500">
              <span>KDV %{rate}</span>
              <span className="tabular-nums">{money(kdvMap[rate], S)}</span>
            </div>
          ))}

          <div className="border-t border-gray-300 pt-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Toplam KDV</span>
              <span className="tabular-nums font-medium">{money(kdvTotal, S)}</span>
            </div>
          </div>

          <div className="bg-gray-900 text-white rounded-xl px-5 py-3.5 flex justify-between items-center mt-2">
            <span className="font-bold text-sm tracking-wide">GENEL TOPLAM</span>
            <span className="font-black text-lg tabular-nums">
              {money(grand, S)}
            </span>
          </div>
        </div>
      </div>

      {/* ── Footer ────────────────────────────────────────────────────────── */}
      <div className="px-8 py-5 border-t border-gray-200 space-y-4">
        <p className="text-sm text-gray-600">
          <span className="font-semibold text-gray-400">Yalnız: </span>
          {grand.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{' '}
          {currencyLabel(proforma.currency || 'TRY')}
        </p>

        <div className="flex items-center justify-between text-sm text-gray-500 flex-wrap gap-2">
          <span>
            Bu fiyat teklifi{' '}
            <strong className="text-gray-700">
              {proforma.validity_days} gün
            </strong>{' '}
            geçerlidir.
          </span>
          <span>
            Son geçerlilik:{' '}
            <strong className="text-gray-700">{expiry}</strong>
          </span>
        </div>

        {proforma.notes && (
          <p className="text-sm text-gray-600">
            <span className="font-semibold text-gray-400">Not: </span>
            {proforma.notes}
          </p>
        )}

        {banks.length > 0 && (
          <div className="pt-4 border-t border-gray-200">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">
              Ödeme Bilgileri
            </p>
            <div className="space-y-2">
              {banks.map((b, i) => (
                <div
                  key={i}
                  className="flex items-baseline justify-between gap-4 flex-wrap"
                >
                  <span className="text-sm font-semibold text-gray-700">
                    {b.bank_name}
                    {b.branch_name ? (
                      <span className="text-gray-400 font-normal">
                        {' '}— {b.branch_name}
                      </span>
                    ) : null}
                  </span>
                  <span className="text-sm font-mono text-gray-600 tracking-wide">
                    {b.iban}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Print button (optional) ───────────────────────────────────────── */}
      {showPrintButton && (
        <div className="px-8 py-4 border-t border-gray-100 print:hidden">
          <button
            onClick={() => window.print()}
            className="px-5 py-2.5 bg-gray-900 text-white text-sm font-semibold rounded-lg hover:bg-gray-800 transition-colors"
          >
            Yazdır
          </button>
        </div>
      )}
    </div>
  )
}
