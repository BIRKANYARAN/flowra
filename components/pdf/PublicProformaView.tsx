'use client'

// NOTE: This is a read-only HTML render of the proforma.
// It deliberately omits: unit_cost, profit, internal_notes — same rule as PDF.

import { calculateLine, calculateTotals, type LineInput } from '@/lib/calc'

function sym(c: string) { return c === 'USD' ? '$' : c === 'EUR' ? '€' : c === 'GBP' ? '£' : '₺' }

function fmtDate(d: string) {
  try { return new Date(d).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' }) }
  catch { return d }
}

function addDays(d: string, n: number) {
  try {
    const dt = new Date(d); dt.setDate(dt.getDate() + n)
    return dt.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  } catch { return '' }
}

interface Props {
  proforma: any
  items:    any[]
  settings: any
  customer: any
  banks:    any[]
}

export function PublicProformaView({ proforma, items, settings, customer, banks }: Props) {
  const currency = proforma.currency || 'TRY'
  const S        = sym(currency)
  const no       = proforma.proforma_no || ('PRF-' + proforma.id.slice(-8).toUpperCase())
  const expiry   = addDays(proforma.created_at, proforma.validity_days || 1)

  // Use central calc engine for line calculations
  const lineInputs: LineInput[] = items.map(it => ({
    price:            Number(it.price) || 0,
    quantity:         Number(it.quantity) || 1,
    discount_percent: Number(it.discount_percent) || 0,
    kdv:              Number(it.kdv) || 0,
  }))
  const totals   = calculateTotals(lineInputs)
  const subtotal = totals.subtotal
  const kdvTotal = totals.kdv_total
  const grand    = totals.grand_total
  const kdvMap   = totals.kdv_breakdown
  const kdvRates = Object.keys(kdvMap).filter(k => kdvMap[k] > 0).sort((a, b) => +a - +b)

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      {/* Header: LEFT = Flowra brand + doc info | RIGHT = Company logo + info */}
      <div className="border-b-2 border-gray-900 px-8 py-6">
        <div className="flex items-start justify-between gap-4">
          {/* LEFT: Flowra brand + document metadata */}
          <div className="min-w-0">
            <div className="text-xl font-black text-indigo-600 tracking-tight mb-1">Flowra</div>
            <div className="w-8 h-0.5 bg-indigo-500 mb-3" />
            <div className="text-xs text-gray-400 uppercase tracking-widest font-semibold mb-1">Proforma Fatura</div>
            <div className="inline-block bg-gray-100 rounded px-3 py-0.5 text-sm font-bold text-gray-700 mb-1">{no}</div>
            <div className="text-xs text-gray-400 mt-1">{fmtDate(proforma.created_at)}</div>
            <div className="text-xs text-gray-400">Geçerlilik: {proforma.validity_days} gün</div>
            <div className="text-xs font-semibold text-indigo-600 mt-1">Para Birimi: {currency}</div>
          </div>

          {/* RIGHT: Company (user's company) logo + info */}
          <div className="text-right min-w-0">
            {settings?.logo_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={settings.logo_url} alt="Logo" className="h-12 object-contain mb-2 ml-auto max-w-[160px]"
                onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
            )}
            <div className="font-bold text-sm">{settings?.company_name || ''}</div>
            {settings?.address    && <div className="text-xs text-gray-500 mt-0.5 whitespace-pre-line">{settings.address}</div>}
            {settings?.tax_number && (
              <div className="text-xs text-gray-400">
                Vergi No: {settings.tax_number}
                {settings.tax_office ? ' · Vergi Dairesi: ' + settings.tax_office : ''}
              </div>
            )}
            {settings?.phone      && <div className="text-xs text-gray-400">Telefon: {settings.phone}</div>}
            {settings?.website    && <div className="text-xs text-gray-400">{settings.website}</div>}
          </div>
        </div>
      </div>

      {/* Customer section with explicit header */}
      <div className="px-8 py-4 bg-gray-50/50 border-b border-gray-100">
        <div className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Müşteri Bilgileri</div>
        <div className="font-bold text-sm text-gray-900">{proforma.customer_name || customer?.name || '—'}</div>
        {customer?.address    && <div className="text-xs text-gray-500 mt-0.5 whitespace-pre-line">{customer.address}</div>}
        {customer?.tax_number && (
          <div className="text-xs text-gray-400">
            Vergi No: {customer.tax_number}
            {customer.tax_office ? ' · Vergi Dairesi: ' + customer.tax_office : ''}
          </div>
        )}
        {customer?.email      && <div className="text-xs text-gray-400">{customer.email}</div>}
        {customer?.phone      && <div className="text-xs text-gray-400">Telefon: {customer.phone}</div>}
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-900 text-white text-xs font-semibold uppercase tracking-wide">
              <th className="text-left px-5 py-2.5 w-[30%]">Ürün / Hizmet</th>
              <th className="text-center px-3 py-2.5 w-[7%]">Birim</th>
              <th className="text-center px-3 py-2.5 w-[7%]">Adet</th>
              <th className="text-right  px-3 py-2.5 w-[13%]">Birim Fiyat</th>
              <th className="text-center px-3 py-2.5 w-[8%]">İskonto</th>
              <th className="text-right  px-3 py-2.5 w-[13%]">İskontolu Fiyat</th>
              <th className="text-center px-3 py-2.5 w-[7%]">KDV %</th>
              <th className="text-right  px-5 py-2.5 w-[15%]">Tutar</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => {
              const line  = calculateLine({
                price:            Number(it.price) || 0,
                quantity:         Number(it.quantity) || 1,
                discount_percent: Number(it.discount_percent) || 0,
                kdv:              Number(it.kdv) || 0,
              })
              const disc = line.discount_percent
              return (
                <tr key={it.id || i} className={`border-b border-gray-100 text-sm ${i % 2 === 1 ? 'bg-gray-50/60' : ''}`}>
                  <td className="px-5 py-3 font-medium text-gray-900">{it.name}</td>
                  <td className="px-3 py-3 text-center text-gray-500">{it.unit || 'adet'}</td>
                  <td className="px-3 py-3 text-center tabular-nums">{line.quantity}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{S}{line.price.toFixed(2)}</td>
                  <td className="px-3 py-3 text-center text-gray-500">{disc > 0 ? `%${disc}` : '—'}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{S}{line.discounted_unit_price.toFixed(2)}</td>
                  <td className="px-3 py-3 text-center text-gray-500">%{line.kdv}</td>
                  <td className="px-5 py-3 text-right font-bold tabular-nums">{S}{line.line_total.toFixed(2)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Totals */}
      <div className="px-8 py-5 bg-gray-50/40 border-t border-gray-100">
        <div className="ml-auto w-64 space-y-1.5">
          {kdvRates.map(rate => (
            <div key={rate} className="flex justify-between text-sm text-gray-500">
              <span>KDV %{rate}</span>
              <span className="tabular-nums">{S}{kdvMap[rate].toFixed(2)}</span>
            </div>
          ))}
          <div className="border-t border-gray-200 pt-2 space-y-1.5">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Ara Toplam</span>
              <span className="tabular-nums">{S}{subtotal.toFixed(2)}</span>
            </div>
            {totals.total_discount > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Toplam İskonto</span>
                <span className="tabular-nums text-red-600">-{S}{totals.total_discount.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Toplam KDV</span>
              <span className="tabular-nums">{S}{kdvTotal.toFixed(2)}</span>
            </div>
          </div>
          <div className="bg-gray-900 text-white rounded-xl px-4 py-3 flex justify-between items-center">
            <span className="font-bold text-sm">GENEL TOPLAM</span>
            <span className="font-black text-base tabular-nums">{S}{grand.toFixed(2)}</span>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="px-8 py-5 border-t border-gray-100 space-y-3">
        <p className="text-sm text-gray-600">
          <span className="font-semibold text-gray-400">Yalnız: </span>
          {grand.toFixed(2)} {currency === 'USD' ? 'ABD Doları' : currency === 'EUR' ? 'Euro' : 'Türk Lirası'}
        </p>
        <div className="flex items-center justify-between text-sm text-gray-500 flex-wrap gap-2">
          <span>Bu fiyat teklifi <strong className="text-gray-700">{proforma.validity_days} gün</strong> geçerlidir.</span>
          <span>Son geçerlilik: <strong className="text-gray-700">{expiry}</strong></span>
        </div>

        {proforma.notes && (
          <p className="text-sm text-gray-600">
            <span className="font-semibold text-gray-400">Not: </span>{proforma.notes}
          </p>
        )}

        {banks.length > 0 && (
          <div className="pt-3 border-t border-gray-100">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2.5">Ödeme Bilgileri</p>
            <div className="space-y-2.5">
              {banks.map((b, i) => (
                <div key={i} className="flex items-baseline justify-between gap-4 flex-wrap">
                  <span className="text-sm font-semibold">
                    {b.bank_name}{b.branch_name ? <span className="text-gray-400 font-normal"> — {b.branch_name}</span> : null}
                  </span>
                  <span className="text-sm font-mono text-gray-600 tracking-wide">{b.iban}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="pt-3 text-center text-xs text-gray-300">Flowra ile oluşturuldu</div>
      </div>
    </div>
  )
}
