'use client'

// ═══════════════════════════════════════════════════════════════════════════════
// Flowra — Proforma Invoice  (premium corporate, print-safe)
//
// Design language: financial-grade document typography
//   — tight 11–12px body, 14–16px emphasis, never childish 20–24px
//   — left-to-right information hierarchy
//   — clean white + one accent color (gray-900 for stripes)
//   — generous but measured A4-proportioned whitespace
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
  if (c === 'USD') return 'ABD Doları'
  if (c === 'EUR') return 'Euro'
  if (c === 'GBP') return 'İngiliz Sterlini'
  return 'Türk Lirası'
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
      day: '2-digit', month: '2-digit', year: 'numeric',
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

// ── Micro-components ─────────────────────────────────────────────────────────

function MetaRow({ label, value }: { label: string; value: string }) {
  if (!value) return null
  return (
    <div className="flex items-baseline justify-between gap-3 py-0.5">
      <span style={{ fontSize: '9px', color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', flexShrink: 0 }}>
        {label}
      </span>
      <span style={{ fontSize: '11px', color: '#374151', fontWeight: 600, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </span>
    </div>
  )
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
  const S    = sym(proforma.currency || 'TRY')
  const no   = proforma.proforma_no || ('PRF-' + proforma.id.slice(-8).toUpperCase())
  const expiry    = addDays(proforma.created_at, proforma.validity_days || 30)
  const issueDate = fmtDate(proforma.created_at)

  // ── Per-line calculations ─────────────────────────────────────────────────
  const computed = items.map((it) => {
    const line = calculateLine(it as LineInput)
    return {
      price:        line.price,
      qty:          line.quantity,
      disc:         line.discount_percent,
      kdvPct:       line.kdv,
      lineSubtotal: line.line_subtotal,
      lineKdv:      line.line_vat,
      lineTotal:    line.line_total,
    }
  })

  // ── Totals ────────────────────────────────────────────────────────────────
  const totals        = calculateTotals(items as LineInput[])
  const subtotal      = totals.subtotal
  const totalDiscount = totals.total_discount
  const kdvTotal      = totals.kdv_total
  const kdvMap        = totals.kdv_breakdown
  const grand         = totals.grand_total
  const kdvRates      = Object.keys(kdvMap).filter((k) => kdvMap[k] > 0).sort((a, b) => +a - +b)

  return (
    <div
      className="bg-white"
      style={{
        fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif",
        maxWidth: '794px',   // A4 width at 96dpi
        margin: '0 auto',
      }}
    >

      {/* ═══════════════════════════════════════════════════════════════════
          HEADER — premium two-panel layout
          LEFT:  logo + company legal identity
          RIGHT: PROFORMA FATURA title + document number + dates
      ═══════════════════════════════════════════════════════════════════ */}
      <div style={{ padding: '28px 32px 20px', borderBottom: '1px solid #e5e7eb' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '24px' }}>

          {/* LEFT — Company identity */}
          <div style={{ flex: 1 }}>
            {/* Logo or monogram */}
            {settings?.logo_url ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={settings.logo_url}
                alt={settings.company_name || 'Logo'}
                style={{ height: '40px', width: 'auto', objectFit: 'contain', marginBottom: '10px', maxWidth: '160px' }}
              />
            ) : (
              <div style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: '36px', height: '36px', borderRadius: '6px',
                backgroundColor: '#1f2937', color: '#fff',
                fontSize: '14px', fontWeight: 900, letterSpacing: '0.02em',
                marginBottom: '10px',
              }}>
                {settings?.company_name?.slice(0, 2).toUpperCase() || 'FL'}
              </div>
            )}

            {/* Company legal name */}
            <div style={{ fontSize: '14px', fontWeight: 700, color: '#111827', lineHeight: 1.2, marginBottom: '6px' }}>
              {settings?.company_name || '—'}
            </div>

            {/* Address, legal IDs */}
            <div style={{ fontSize: '10px', color: '#6b7280', lineHeight: 1.6 }}>
              {settings?.address && (
                <div style={{ marginBottom: '2px', whiteSpace: 'pre-line' }}>{settings.address}</div>
              )}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '3px' }}>
                {settings?.phone && <span>T: {settings.phone}</span>}
                {settings?.website && <span>{settings.website}</span>}
              </div>
              {(settings?.tax_number || settings?.tax_office) && (
                <div style={{ marginTop: '3px', color: '#9ca3af' }}>
                  {settings?.tax_number && <span>VKN: <strong style={{ color: '#6b7280' }}>{settings.tax_number}</strong></span>}
                  {settings?.tax_office && <span style={{ marginLeft: '8px' }}>V.D.: <strong style={{ color: '#6b7280' }}>{settings.tax_office}</strong></span>}
                </div>
              )}
              {settings?.mersis_no && (
                <div style={{ marginTop: '2px', color: '#9ca3af' }}>
                  MERSİS: <strong style={{ color: '#6b7280' }}>{settings.mersis_no}</strong>
                </div>
              )}
            </div>
          </div>

          {/* RIGHT — Document identity */}
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            {/* Document type — small caps */}
            <div style={{
              fontSize: '9px', fontWeight: 800, color: '#6b7280',
              textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '4px',
            }}>
              Proforma Fatura
            </div>
            {/* Document number — prominent but not oversized */}
            <div style={{ fontSize: '16px', fontWeight: 900, color: '#111827', letterSpacing: '-0.01em', marginBottom: '10px' }}>
              {no}
            </div>
            {/* Currency tag */}
            <div style={{
              display: 'inline-flex', alignItems: 'center',
              padding: '2px 8px', borderRadius: '999px',
              backgroundColor: '#f3f4f6', border: '1px solid #e5e7eb',
              fontSize: '9px', fontWeight: 600, color: '#6b7280',
              letterSpacing: '0.04em', marginBottom: '12px',
            }}>
              {currencyLabel(proforma.currency || 'TRY')} ({S})
            </div>
            {/* Dates */}
            <div style={{ fontSize: '10px', color: '#9ca3af', lineHeight: 1.7 }}>
              <div>Düzenleme: <strong style={{ color: '#374151' }}>{issueDate}</strong></div>
              <div>Son Geçerlilik: <strong style={{ color: '#374151' }}>{expiry}</strong></div>
              <div>Geçerlilik: <strong style={{ color: '#374151' }}>{proforma.validity_days} gün</strong></div>
            </div>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          PARTIES — Satıcı | Alıcı in two-column grid
      ═══════════════════════════════════════════════════════════════════ */}
      <div style={{ padding: '16px 32px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', borderBottom: '1px solid #e5e7eb', backgroundColor: '#fafafa' }}>

        {/* Satıcı */}
        <div>
          <div style={{ fontSize: '9px', fontWeight: 800, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '6px', paddingBottom: '4px', borderBottom: '1px solid #e5e7eb' }}>
            Satıcı
          </div>
          <div style={{ fontSize: '12px', fontWeight: 700, color: '#111827', marginBottom: '2px' }}>
            {settings?.company_name || '—'}
          </div>
          {settings?.address && (
            <div style={{ fontSize: '10px', color: '#6b7280', whiteSpace: 'pre-line', lineHeight: 1.5, marginBottom: '2px' }}>
              {settings.address}
            </div>
          )}
          {settings?.tax_number && (
            <div style={{ fontSize: '10px', color: '#9ca3af' }}>
              VKN: <span style={{ color: '#6b7280' }}>{settings.tax_number}</span>
              {settings.tax_office && <span> · {settings.tax_office} V.D.</span>}
            </div>
          )}
        </div>

        {/* Alıcı */}
        <div>
          <div style={{ fontSize: '9px', fontWeight: 800, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '6px', paddingBottom: '4px', borderBottom: '1px solid #e5e7eb' }}>
            Alıcı
          </div>
          <div style={{ fontSize: '12px', fontWeight: 700, color: '#111827', marginBottom: '2px' }}>
            {proforma.customer_name || customer?.name || '—'}
          </div>
          {customer?.address && (
            <div style={{ fontSize: '10px', color: '#6b7280', whiteSpace: 'pre-line', lineHeight: 1.5, marginBottom: '2px' }}>
              {customer.address}
            </div>
          )}
          {customer?.tax_number && (
            <div style={{ fontSize: '10px', color: '#9ca3af' }}>
              VKN: <span style={{ color: '#6b7280' }}>{customer.tax_number}</span>
              {customer.tax_office && <span> · {customer.tax_office} V.D.</span>}
            </div>
          )}
          {customer?.email && (
            <div style={{ fontSize: '10px', color: '#9ca3af' }}>
              E: <span style={{ color: '#6b7280' }}>{customer.email}</span>
            </div>
          )}
          {customer?.phone && (
            <div style={{ fontSize: '10px', color: '#9ca3af' }}>
              T: <span style={{ color: '#6b7280' }}>{customer.phone}</span>
            </div>
          )}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          ITEMS TABLE — dense, professional
      ═══════════════════════════════════════════════════════════════════ */}
      <div style={{ margin: '0 32px', marginTop: '16px', borderRadius: '6px', overflow: 'hidden', border: '1px solid #e5e7eb' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
          <thead>
            <tr style={{ backgroundColor: '#1f2937' }}>
              <th style={{ textAlign: 'left', padding: '8px 12px', fontSize: '9px', fontWeight: 700, color: 'rgba(255,255,255,0.65)', textTransform: 'uppercase', letterSpacing: '0.06em', width: '30%' }}>
                Ürün / Hizmet
              </th>
              <th style={{ textAlign: 'center', padding: '8px 6px', fontSize: '9px', fontWeight: 700, color: 'rgba(255,255,255,0.65)', textTransform: 'uppercase', letterSpacing: '0.06em', width: '6%' }}>
                Birim
              </th>
              <th style={{ textAlign: 'center', padding: '8px 6px', fontSize: '9px', fontWeight: 700, color: 'rgba(255,255,255,0.65)', textTransform: 'uppercase', letterSpacing: '0.06em', width: '6%' }}>
                Adet
              </th>
              <th style={{ textAlign: 'right', padding: '8px 6px', fontSize: '9px', fontWeight: 700, color: 'rgba(255,255,255,0.65)', textTransform: 'uppercase', letterSpacing: '0.06em', width: '14%' }}>
                Birim Fiyat
              </th>
              <th style={{ textAlign: 'center', padding: '8px 6px', fontSize: '9px', fontWeight: 700, color: 'rgba(255,255,255,0.65)', textTransform: 'uppercase', letterSpacing: '0.06em', width: '8%' }}>
                İsk.
              </th>
              <th style={{ textAlign: 'right', padding: '8px 6px', fontSize: '9px', fontWeight: 700, color: 'rgba(255,255,255,0.65)', textTransform: 'uppercase', letterSpacing: '0.06em', width: '14%' }}>
                Net Tutar
              </th>
              <th style={{ textAlign: 'center', padding: '8px 6px', fontSize: '9px', fontWeight: 700, color: 'rgba(255,255,255,0.65)', textTransform: 'uppercase', letterSpacing: '0.06em', width: '7%' }}>
                KDV
              </th>
              <th style={{ textAlign: 'right', padding: '8px 12px', fontSize: '9px', fontWeight: 700, color: 'rgba(255,255,255,0.65)', textTransform: 'uppercase', letterSpacing: '0.06em', width: '15%' }}>
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
                  style={{
                    backgroundColor: i % 2 === 1 ? '#f9fafb' : '#ffffff',
                    borderBottom: '1px solid #f3f4f6',
                  }}
                >
                  <td style={{ padding: '7px 12px', fontWeight: 500, color: '#111827', fontSize: '11px' }}>
                    {it.name}
                  </td>
                  <td style={{ padding: '7px 6px', textAlign: 'center', color: '#6b7280', fontSize: '10px' }}>
                    {it.unit || 'adet'}
                  </td>
                  <td style={{ padding: '7px 6px', textAlign: 'center', fontVariantNumeric: 'tabular-nums', color: '#374151', fontSize: '11px' }}>
                    {c.qty}
                  </td>
                  <td style={{ padding: '7px 6px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#374151', fontSize: '11px' }}>
                    {money(c.price, S)}
                  </td>
                  <td style={{ padding: '7px 6px', textAlign: 'center', color: '#9ca3af', fontSize: '10px' }}>
                    {c.disc > 0 ? `%${c.disc}` : '—'}
                  </td>
                  <td style={{ padding: '7px 6px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#374151', fontSize: '11px' }}>
                    {money(c.lineSubtotal, S)}
                  </td>
                  <td style={{ padding: '7px 6px', textAlign: 'center', color: '#9ca3af', fontSize: '10px' }}>
                    %{c.kdvPct}
                  </td>
                  <td style={{ padding: '7px 12px', textAlign: 'right', fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: '#111827', fontSize: '11px' }}>
                    {money(c.lineTotal, S)}
                  </td>
                </tr>
              )
            })}
            {items.length === 0 && (
              <tr>
                <td colSpan={8} style={{ padding: '20px', textAlign: 'center', fontSize: '11px', color: '#9ca3af' }}>
                  — Ürün yok —
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          TOTALS — right-aligned, professional hierarchy
          subtotal → discount → KDV breakdown → grand total bar
      ═══════════════════════════════════════════════════════════════════ */}
      <div style={{ padding: '16px 32px 8px', display: 'flex', justifyContent: 'flex-end' }}>
        <div style={{ width: '280px' }}>

          {/* Line items */}
          <div style={{ border: '1px solid #e5e7eb', borderRadius: '6px 6px 0 0', padding: '12px 14px', backgroundColor: '#fff' }}>
            <MetaRow label="Ara Toplam" value={money(subtotal, S)} />
            {totalDiscount > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '2px 0' }}>
                <span style={{ fontSize: '9px', color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  İskonto
                </span>
                <span style={{ fontSize: '11px', color: '#dc2626', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                  − {money(totalDiscount, S)}
                </span>
              </div>
            )}
            {kdvRates.map((rate) => (
              <MetaRow key={rate} label={`KDV %${rate}`} value={money(kdvMap[rate], S)} />
            ))}
            <div style={{ borderTop: '1px solid #f3f4f6', marginTop: '6px', paddingTop: '6px' }}>
              <MetaRow label="Toplam KDV" value={money(kdvTotal, S)} />
            </div>
          </div>

          {/* Grand total bar — dark, but with controlled proportions */}
          <div style={{
            backgroundColor: '#1f2937', borderRadius: '0 0 6px 6px',
            padding: '10px 14px',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <div>
              <div style={{ fontSize: '9px', fontWeight: 700, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Genel Toplam
              </div>
              <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.35)', marginTop: '1px' }}>
                {currencyLabel(proforma.currency || 'TRY')}
              </div>
            </div>
            {/* 16px max for grand total — professional, not childish */}
            <span style={{ fontSize: '16px', fontWeight: 900, color: '#fff', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.01em' }}>
              {money(grand, S)}
            </span>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          FOOTER — validity note, banks, signature
      ═══════════════════════════════════════════════════════════════════ */}
      <div style={{ margin: '8px 32px 28px', border: '1px solid #e5e7eb', borderRadius: '6px', overflow: 'hidden' }}>

        {/* Written amount */}
        <div style={{ padding: '10px 14px', backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb', fontSize: '10px', color: '#6b7280' }}>
          Yalnız{' '}
          <strong style={{ color: '#374151' }}>
            {grand.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} {currencyLabel(proforma.currency || 'TRY')}
          </strong>{' '}
          tutarındadır.
        </div>

        {/* Validity + Notes */}
        {(proforma.validity_days || proforma.notes) && (
          <div style={{ padding: '10px 14px', display: 'grid', gridTemplateColumns: proforma.notes ? '1fr 1fr' : '1fr', gap: '16px', borderBottom: '1px solid #e5e7eb', fontSize: '10px', color: '#6b7280', lineHeight: 1.6 }}>
            <div>
              Bu teklif <strong style={{ color: '#374151' }}>{proforma.validity_days} gün</strong> geçerlidir.
              Son geçerlilik: <strong style={{ color: '#374151' }}>{expiry}</strong>
            </div>
            {proforma.notes && (
              <div>
                <span style={{ display: 'block', fontSize: '9px', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '2px' }}>Not</span>
                {proforma.notes}
              </div>
            )}
          </div>
        )}

        {/* Bank / payment info */}
        {banks.length > 0 && (
          <div style={{ padding: '10px 14px', borderBottom: '1px solid #e5e7eb' }}>
            <div style={{ fontSize: '9px', fontWeight: 800, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px' }}>
              Ödeme Bilgileri
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {banks.map((b, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '12px' }}>
                  <span style={{ fontSize: '10px', fontWeight: 600, color: '#374151' }}>
                    {b.bank_name}
                    {b.branch_name && (
                      <span style={{ color: '#9ca3af', fontWeight: 400 }}> / {b.branch_name}</span>
                    )}
                  </span>
                  <span style={{ fontSize: '10px', fontFamily: 'monospace', color: '#6b7280', letterSpacing: '0.04em', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                    {b.iban}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Signature area */}
        <div style={{ padding: '14px 14px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px' }}>
          {[
            { label: 'Satıcı Onayı', name: settings?.company_name },
            { label: 'Alıcı Onayı',  name: proforma.customer_name || customer?.name },
          ].map(({ label, name }) => (
            <div key={label}>
              <div style={{ fontSize: '9px', fontWeight: 700, color: '#d1d5db', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '10px' }}>{label}</div>
              <div style={{ height: '36px', borderBottom: '1px dashed #e5e7eb' }} />
              <div style={{ marginTop: '4px', fontSize: '9px', color: '#9ca3af' }}>{name || ''}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Print button (hidden in print mode) ──────────────────────────── */}
      {showPrintButton && (
        <div style={{ padding: '0 32px 24px' }} className="print:hidden">
          <button
            onClick={() => window.print()}
            style={{
              padding: '8px 20px', backgroundColor: '#1f2937', color: '#fff',
              fontSize: '12px', fontWeight: 600, borderRadius: '6px',
              border: 'none', cursor: 'pointer',
            }}
          >
            Yazdır / PDF İndir
          </button>
        </div>
      )}
    </div>
  )
}
