export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase-server'
import Link from 'next/link'
import { normalizeSaleDetail, normalizeSaleItem, type NormalizedSaleDetail, type NormalizedSaleItem } from '@/lib/normalize'
import { calculateLine, type LineInput } from '@/lib/calc'
import { resolveCompanyId } from '@/lib/resolve-company'
import { fmtTRY as fmt } from '@/lib/format'

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
        <Link href="/dashboard/sales" className="text-sm text-[#94a3b8] hover:text-[#0f172a] mb-4 inline-block">← Satışlar</Link>
        <div className="bg-white border border-[#e2e8f0] rounded p-10 text-center">
          <p className="text-[#94a3b8] text-sm">Satış bulunamadı veya silinmiş.</p>
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
          <Link href="/dashboard/sales" className="text-sm text-[#94a3b8] hover:text-[#0f172a] mb-1 inline-block">← Satışlar</Link>
          <h1 className="text-2xl font-black">{s.customer_name}</h1>
          <p className="text-sm text-[#94a3b8] mt-0.5">{fmtDate(s.sale_date || s.created_at)}</p>
        </div>
        {s.proforma_no && s.proforma_id && s.proforma_exists ? (
          <Link href={`/dashboard/proformas/${s.proforma_id}`}
            className="text-xs font-mono text-primary-700 bg-primary-50 border border-primary-200 px-3 py-1.5 rounded hover:bg-primary-100 transition-colors">
            {s.proforma_no} →
          </Link>
        ) : s.proforma_no ? (
          <span className="text-xs font-mono text-[#94a3b8] bg-[#f8fafc] border border-[#e2e8f0] px-3 py-1.5 rounded">
            {s.proforma_no} (silinmiş)
          </span>
        ) : null}
      </div>

      {/* Items table */}
      <div className="bg-white border border-[#e2e8f0] rounded overflow-hidden mb-5">
        <table className="w-full">
          <thead>
            <tr className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] bg-[#f8fafc] border-b border-[#e2e8f0]">
              <th className="text-left px-5 py-3">Ürün</th>
              <th className="text-center px-3 py-3">Miktar</th>
              <th className="text-right px-3 py-3">Birim Fiyat</th>
              <th className="text-center px-3 py-3">İskonto %</th>
              <th className="text-right px-3 py-3">İskontolu Fiyat</th>
              <th className="text-center px-3 py-3">KDV%</th>
              <th className="text-right px-5 py-3">Toplam</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#e2e8f0]">
            {saleItems.length === 0 ? (
              <tr><td colSpan={7} className="px-5 py-6 text-center text-sm text-[#94a3b8]">Ürün verisi bulunamadı.</td></tr>
            ) : saleItems.map((it, i) => {
              const line = calculateLine(it as LineInput)
              const disc = line.discount_percent
              const discountedPrice = line.discounted_unit_price
              const total = line.line_total
              return (
                <tr key={it.id || String(i)} className={`text-sm ${i % 2 === 1 ? 'bg-[#f8fafc]/50' : ''}`}>
                  <td className="px-5 py-3 font-medium">{it.product_name}</td>
                  <td className="px-3 py-3 text-center tabular-nums">{it.quantity}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{S}{it.price.toFixed(2)}</td>
                  <td className="px-3 py-3 text-center text-[#64748b]">{disc > 0 ? `%${disc}` : '—'}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{S}{discountedPrice.toFixed(2)}</td>
                  <td className="px-3 py-3 text-center text-[#64748b]">%{it.kdv}</td>
                  <td className="px-5 py-3 text-right font-bold tabular-nums">{S}{total.toFixed(2)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>

        <div className="px-5 py-4 border-t border-[#e2e8f0] bg-[#f8fafc]/40">
          <div className="ml-auto w-56 space-y-1.5">
            <div className="flex justify-between text-sm">
              <span className="text-[#64748b]">Ara Toplam</span>
              <span className="tabular-nums">{S}{s.subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-[#64748b]">KDV</span>
              <span className="tabular-nums">{S}{s.kdv_total.toFixed(2)}</span>
            </div>
            <div className="bg-[#0f172a] text-white rounded px-4 py-3 flex justify-between mt-1">
              <span className="font-bold text-sm">TOPLAM</span>
              <span className="font-black tabular-nums">{S}{s.total.toFixed(2)}</span>
            </div>
            {s.currency !== 'TRY' && (
              <div className="flex justify-between text-xs text-[#64748b] pt-1">
                <span>TRY karşılığı{s.fx_rate_source ? ` (${s.fx_rate_source})` : ''}</span>
                <span className="tabular-nums">{fmt(s.total_try)}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Profit card */}
      <div className="bg-white border border-[#e2e8f0] rounded p-5">
        <h2 className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-4">Finansal Özet</h2>
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <div className="text-xs text-[#94a3b8] mb-1">Maliyet</div>
            <div className="text-lg font-black tabular-nums text-[#64748b]">{fmt(s.total_cost)}</div>
          </div>
          <div>
            <div className="text-xs text-[#94a3b8] mb-1">Nominal Kâr</div>
            <div className={`text-lg font-black tabular-nums ${s.nominal_profit >= 0 ? 'text-pos-text' : 'text-neg'}`}>
              {fmt(s.nominal_profit)}
            </div>
          </div>
          <div>
            <div className="text-xs text-[#94a3b8] mb-1">Reel Kâr</div>
            <div className={`text-lg font-black tabular-nums ${s.real_profit >= 0 ? 'text-pos-text' : 'text-neg'}`}>
              {fmt(s.real_profit)}
            </div>
            {s.interest_rate > 0 && (
              <div className="text-xs text-[#94a3b8] mt-0.5">%{s.interest_rate} · {s.interest_days}g</div>
            )}
          </div>
        </div>
      </div>

      {/* Cross-navigation */}
      <div className="flex items-center justify-between px-1">
        <p className="text-[10px] text-[#94a3b8] leading-relaxed">
          Satış detayı tahsilat ve P&amp;L analiziyle birlikte değerlendirilmeli.
        </p>
        <div className="flex items-center gap-2 shrink-0 ml-4">
          <Link href="/dashboard/commercial?tab=sales" className="text-[11px] font-bold text-primary-600 hover:text-primary-700 underline underline-offset-2 whitespace-nowrap">
            Satışlar →
          </Link>
          <span className="text-[#e2e8f0]">|</span>
          <Link href="/dashboard/commercial?tab=collections" className="text-[11px] font-bold text-primary-600 hover:text-primary-700 underline underline-offset-2 whitespace-nowrap">
            Tahsilat →
          </Link>
          <span className="text-[#e2e8f0]">|</span>
          <Link href="/dashboard/finance?tab=pnl" className="text-[11px] font-bold text-primary-600 hover:text-primary-700 underline underline-offset-2 whitespace-nowrap">
            P&amp;L →
          </Link>
        </div>
      </div>
    </div>
  )
}
