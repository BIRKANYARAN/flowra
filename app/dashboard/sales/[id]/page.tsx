export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase-server'
import Link from 'next/link'
import { normalizeSaleDetail, normalizeSaleItem, type NormalizedSaleDetail, type NormalizedSaleItem } from '@/lib/normalize'
import { calculateLine, type LineInput } from '@/lib/calc'
import { resolveCompanyId } from '@/lib/resolve-company'

function fmt(n: number) {
  return '₺' + n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function fmtDate(d: string) {
  try {
    return new Date(d).toLocaleDateString('tr-TR', { day:'2-digit', month:'2-digit', year:'numeric' })
  } catch { return d }
}
function sym(c: string) { return c === 'USD' ? '$' : c === 'EUR' ? '€' : '₺' }

export default async function SaleDetailPage({ params }: { params: { id: string } }) {
  const supabase = createClient()

  let user: { id: string } | null = null
  try {
    const { data } = await supabase.auth.getUser()
    user = data.user
  } catch { return null }
  if (!user) return null

  let sale: NormalizedSaleDetail | null = null
  let saleItems: NormalizedSaleItem[] = []

  try {
    const companyId = await resolveCompanyId(user.id, supabase)
    const { data, error } = await supabase
      .from('sales')
      .select('*, proformas(proforma_no, deleted_at)')
      .eq('id', params.id)
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .maybeSingle()

    if (!error) sale = normalizeSaleDetail(data)
  } catch {
    // show "not found" state below
  }

  if (!sale) {
    return (
      <div className="max-w-3xl">
        <Link href="/dashboard/sales" className="text-sm text-gray-400 hover:text-gray-900 mb-4 inline-block">← Satışlar</Link>
        <div className="bg-white border border-gray-200 rounded-xl p-10 text-center">
          <div className="text-4xl mb-3">🔍</div>
          <p className="text-gray-500 font-medium">Satış bulunamadı.</p>
        </div>
      </div>
    )
  }

  try {
    const { data, error } = await supabase
      .from('sale_items').select('*').eq('sale_id', params.id).order('sort_order')
    if (!error) saleItems = (data ?? []).map(normalizeSaleItem).filter((r): r is NormalizedSaleItem => r !== null)
  } catch {
    // items are optional — page continues without them
  }

  const s = sale
  const S = sym(s.currency)

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link href="/dashboard/sales" className="text-sm text-gray-400 hover:text-gray-900 mb-1 inline-block">← Satışlar</Link>
          <h1 className="text-2xl font-black">{s.customer_name}</h1>
          <p className="text-sm text-gray-400 mt-0.5">{fmtDate(s.created_at)}</p>
        </div>
        {s.proforma_no && s.proforma_id && s.proforma_exists ? (
          <Link href={`/dashboard/proformas/${s.proforma_id}`}
            className="text-xs font-mono text-primary-700 bg-primary-50 border border-primary-200 px-3 py-1.5 rounded-lg hover:bg-primary-100 transition-colors">
            {s.proforma_no} →
          </Link>
        ) : s.proforma_no ? (
          <span className="text-xs font-mono text-gray-400 bg-gray-50 border border-gray-200 px-3 py-1.5 rounded-lg">
            {s.proforma_no} (silinmiş)
          </span>
        ) : null}
      </div>

      {/* Items table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden mb-5">
        <table className="w-full">
          <thead>
            <tr className="text-[10px] font-bold text-gray-400 uppercase tracking-widest bg-gray-50 border-b border-gray-200">
              <th className="text-left px-5 py-3">Ürün</th>
              <th className="text-center px-3 py-3">Miktar</th>
              <th className="text-right px-3 py-3">Birim Fiyat</th>
              <th className="text-center px-3 py-3">İskonto %</th>
              <th className="text-right px-3 py-3">İskontolu Fiyat</th>
              <th className="text-center px-3 py-3">KDV%</th>
              <th className="text-right px-5 py-3">Toplam</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {saleItems.length === 0 ? (
              <tr><td colSpan={7} className="px-5 py-6 text-center text-sm text-gray-400">Ürün verisi bulunamadı.</td></tr>
            ) : saleItems.map((it, i) => {
              const line = calculateLine(it as LineInput)
              const disc = line.discount_percent
              const discountedPrice = line.discounted_unit_price
              const total = line.line_total
              return (
                <tr key={it.id || String(i)} className={`text-sm ${i % 2 === 1 ? 'bg-gray-50/50' : ''}`}>
                  <td className="px-5 py-3 font-medium">{it.product_name}</td>
                  <td className="px-3 py-3 text-center tabular-nums">{it.quantity}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{S}{it.price.toFixed(2)}</td>
                  <td className="px-3 py-3 text-center text-gray-500">{disc > 0 ? `%${disc}` : '—'}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{S}{discountedPrice.toFixed(2)}</td>
                  <td className="px-3 py-3 text-center text-gray-500">%{it.kdv}</td>
                  <td className="px-5 py-3 text-right font-bold tabular-nums">{S}{total.toFixed(2)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>

        <div className="px-5 py-4 border-t border-gray-100 bg-gray-50/40">
          <div className="ml-auto w-56 space-y-1.5">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Ara Toplam</span>
              <span className="tabular-nums">{S}{s.subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">KDV</span>
              <span className="tabular-nums">{S}{s.kdv_total.toFixed(2)}</span>
            </div>
            <div className="bg-gray-900 text-white rounded-xl px-4 py-3 flex justify-between mt-1">
              <span className="font-bold text-sm">TOPLAM</span>
              <span className="font-black tabular-nums">{S}{s.total.toFixed(2)}</span>
            </div>
            {s.currency !== 'TRY' && (
              <div className="flex justify-between text-xs text-gray-500 pt-1">
                <span>TRY karşılığı{s.fx_rate_source ? ` (${s.fx_rate_source})` : ''}</span>
                <span className="tabular-nums">{fmt(s.total_try)}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Profit card */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <h2 className="font-bold text-sm text-gray-500 uppercase tracking-wide mb-4">Finansal Özet</h2>
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <div className="text-xs text-gray-400 mb-1">Maliyet</div>
            <div className="text-lg font-black tabular-nums text-gray-600">{fmt(s.total_cost)}</div>
          </div>
          <div>
            <div className="text-xs text-gray-400 mb-1">Nominal Kâr</div>
            <div className={`text-lg font-black tabular-nums ${s.nominal_profit >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
              {fmt(s.nominal_profit)}
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-400 mb-1">Reel Kâr</div>
            <div className={`text-lg font-black tabular-nums ${s.real_profit >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
              {fmt(s.real_profit)}
            </div>
            {s.interest_rate > 0 && (
              <div className="text-xs text-gray-400 mt-0.5">%{s.interest_rate} · {s.interest_days}g</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
