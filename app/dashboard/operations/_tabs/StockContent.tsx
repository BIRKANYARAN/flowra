// ── StockContent — Operations hub / stock tab ─────────────────────────────────

import { createClient }                             from '@/lib/supabase-server'
import { fmtTRY, fmtDate as fmtDateShort, fmtDatetime as fmtDateTime } from '@/lib/format'
import type { StockMovement }                       from '@/types'
import StockAdjustClient                            from '@/app/dashboard/stocks/StockAdjustClient'

function holdingDays(entryDate: string): number {
  const today = new Date()
  const entry = new Date(entryDate + 'T00:00:00')
  return Math.max(0, Math.round((today.getTime() - entry.getTime()) / 86_400_000))
}

const TYPE_LABELS: Record<string, string> = {
  purchase: 'Alım', sale: 'Satış', adjustment: 'Düzeltme', return: 'İade',
}

interface ProductRow { id: string; name: string; sku: string; unit: string; stock_qty: number; stock_alert_qty: number }
interface StockLotRow { id: string; product_id: string; received_at: string; qty_remaining: number; cost_price: number; cost_currency: string; cost_fx_rate: number; cost_price_try: number }

interface Props { companyId: string }

export async function StockContent({ companyId }: Props) {
  const supabase = createClient()

  const [productsRes, movementsRes, lotsRes] = await Promise.all([
    supabase
      .from('products')
      .select('id, name, sku, unit, stock_qty, stock_alert_qty')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .eq('is_active', true)
      .order('name'),
    supabase
      .from('stock_movements')
      .select('*')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('stock_lots')
      .select('id, product_id, received_at, qty_remaining, cost_price, cost_currency, cost_fx_rate, cost_price_try')
      .eq('company_id', companyId)
      .gt('qty_remaining', 0)
      .is('deleted_at', null)
      .order('received_at', { ascending: true }),
  ])

  const products  = (productsRes.data  ?? []) as ProductRow[]
  const movements = (movementsRes.data ?? []) as StockMovement[]
  const lots      = (lotsRes.data      ?? []) as StockLotRow[]

  interface LotMeta extends StockLotRow { days: number; costTry: number }

  const lotsByProduct = new Map<string, LotMeta[]>()
  let portfolioValueTry = 0

  for (const lot of lots) {
    const perUnitTry = lot.cost_price_try != null && lot.cost_price_try > 0
      ? lot.cost_price_try
      : lot.cost_price * (lot.cost_fx_rate || 1)
    const days    = holdingDays(lot.received_at)
    const costTry = lot.qty_remaining * perUnitTry
    portfolioValueTry += costTry
    const meta: LotMeta = { ...lot, days, costTry }
    if (!lotsByProduct.has(lot.product_id)) lotsByProduct.set(lot.product_id, [])
    lotsByProduct.get(lot.product_id)!.push(meta)
  }

  const lowStockCount  = products.filter(p => p.stock_qty > 0 && p.stock_qty <= p.stock_alert_qty).length
  const zeroStockCount = products.filter(p => p.stock_qty <= 0).length
  const productMap     = new Map(products.map(p => [p.id, p]))

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h2 className="text-xl font-black text-gray-900 tracking-tight">Stok Zekası</h2>
        <p className="text-xs text-gray-400 mt-0.5">FIFO lot değerlemesi · stok hareketleri · portföy özeti</p>
      </div>

      {/* Portfolio summary strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-0 bg-white border border-gray-200 rounded-xl overflow-hidden">
        {[
          { label: 'Toplam Stok Değeri', value: fmtTRY(portfolioValueTry), sub: 'FIFO lot maliyeti bazlı',  color: 'text-gray-900' },
          { label: 'Ürün Sayısı',        value: String(products.length),   sub: `${lots.length} açık lot`, color: 'text-gray-900' },
          { label: 'Düşük Stok',         value: String(lowStockCount),     sub: 'Eşik altı ürün',           color: lowStockCount > 0 ? 'text-amber-700' : 'text-gray-400' },
          { label: 'Stok Tükenmiş',      value: String(zeroStockCount),    sub: 'Sıfır veya negatif',       color: zeroStockCount > 0 ? 'text-red-600' : 'text-gray-400' },
        ].map((card, i) => (
          <div key={card.label} className={`p-3 ${i < 3 ? 'border-b sm:border-b-0 sm:border-r border-gray-100' : ''}`}>
            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">{card.label}</div>
            <div className={`text-xl font-black tabular-nums leading-none ${card.color}`}>{card.value}</div>
            <div className="text-[10px] text-gray-400 mt-1">{card.sub}</div>
          </div>
        ))}
      </div>

      {/* FIFO Lot Panel */}
      {lots.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <div>
              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">FIFO Lot Paneli</span>
              <span className="ml-2 text-[10px] text-gray-400">— açık lotlar, tutma süresi ve maliyet</span>
            </div>
            <span className="text-[10px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
              {lots.length} lot · {fmtTRY(portfolioValueTry)}
            </span>
          </div>
          <div className="divide-y divide-gray-50">
            {products.filter(p => lotsByProduct.has(p.id)).map(product => {
              const productLots  = lotsByProduct.get(product.id) ?? []
              const productValue = productLots.reduce((s, l) => s + l.costTry, 0)
              const totalQty     = productLots.reduce((s, l) => s + l.qty_remaining, 0)
              const oldestLot    = productLots[0]
              return (
                <div key={product.id} className="px-5 py-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-gray-900">{product.name}</span>
                      {product.sku && <span className="text-[10px] font-mono text-gray-400">{product.sku}</span>}
                    </div>
                    <div className="flex items-center gap-4 text-right">
                      <div>
                        <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Toplam Miktar</div>
                        <div className="text-sm font-black tabular-nums text-gray-800">
                          {totalQty.toLocaleString('tr-TR', { maximumFractionDigits: 3 })} {product.unit}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Lot Değeri</div>
                        <div className="text-sm font-black tabular-nums text-primary-700">{fmtTRY(productValue)}</div>
                      </div>
                    </div>
                  </div>
                  <div className="bg-gray-50 rounded-xl overflow-hidden">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-[10px] font-bold text-gray-400 uppercase tracking-widest border-b border-gray-100">
                          <th className="text-left px-3 py-2">Giriş Tarihi</th>
                          <th className="text-right px-3 py-2">Kalan Adet</th>
                          <th className="text-right px-3 py-2">Birim Maliyet</th>
                          <th className="text-right px-3 py-2">Lot Değeri (₺)</th>
                          <th className="text-right px-3 py-2">Tutma Süresi</th>
                        </tr>
                      </thead>
                      <tbody>
                        {productLots.map(lot => {
                          const perUnitTry = lot.cost_price_try != null && lot.cost_price_try > 0
                            ? lot.cost_price_try : lot.cost_price * (lot.cost_fx_rate || 1)
                          const urgency = lot.days > 180 ? 'text-red-600' : lot.days > 90 ? 'text-amber-600' : 'text-gray-600'
                          return (
                            <tr key={lot.id} className="border-b border-gray-100 last:border-0">
                              <td className="px-3 py-2 text-gray-700">{fmtDateShort(lot.received_at)}</td>
                              <td className="px-3 py-2 text-right tabular-nums font-semibold text-gray-800">
                                {lot.qty_remaining.toLocaleString('tr-TR', { maximumFractionDigits: 3 })}
                              </td>
                              <td className="px-3 py-2 text-right tabular-nums text-gray-600">
                                {lot.cost_currency !== 'TRY'
                                  ? `${lot.cost_price.toFixed(2)} ${lot.cost_currency} → ₺${perUnitTry.toFixed(2)}`
                                  : `₺${perUnitTry.toFixed(2)}`}
                              </td>
                              <td className="px-3 py-2 text-right tabular-nums font-semibold text-primary-700">{fmtTRY(lot.costTry)}</td>
                              <td className={`px-3 py-2 text-right tabular-nums font-semibold ${urgency}`}>
                                {lot.days} gün{lot.days > 180 && <span className="ml-1 text-[10px]">⚠</span>}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                  {oldestLot && oldestLot.days > 180 && (
                    <div className="mt-2 text-[10px] text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-1.5 font-semibold">
                      ⚠ En eski lot {oldestLot.days} gündür tutulmakta — finansman maliyeti yüksek
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Current stock levels */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Mevcut Stok</span>
        </div>
        {products.length === 0 ? (
          <div className="py-14 text-center">
            <div className="text-4xl mb-2">📦</div>
            <div className="text-sm font-semibold text-gray-600">Ürün bulunamadı.</div>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {products.map(p => {
              const stockNum = Number(p.stock_qty)
              const alertNum = Number(p.stock_alert_qty)
              const isLow    = stockNum > 0 && stockNum <= alertNum
              const isZero   = stockNum <= 0
              const lotValue = (lotsByProduct.get(p.id) ?? []).reduce((s, l) => s + l.costTry, 0)
              return (
                <div key={p.id} className="flex items-center justify-between px-5 py-3 hover:bg-gray-50/60">
                  <div>
                    <span className="text-sm font-semibold text-gray-900">{p.name}</span>
                    {p.sku && <span className="text-xs text-gray-400 ml-2">{p.sku}</span>}
                    {lotValue > 0 && (
                      <div className="text-[10px] text-gray-400 mt-0.5">
                        Lot değeri: <span className="font-semibold text-primary-600">{fmtTRY(lotValue)}</span>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    {isLow  && <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-lg font-semibold">Düşük</span>}
                    {isZero && <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-lg font-semibold">Tükendi</span>}
                    <span className={`text-sm font-bold tabular-nums ${isZero ? 'text-red-600' : isLow ? 'text-amber-700' : 'text-gray-900'}`}>
                      {stockNum.toLocaleString('tr-TR', { maximumFractionDigits: 3 })} {p.unit}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <StockAdjustClient products={products.map(p => ({ id: p.id, name: p.name, unit: p.unit }))} />

      {/* Movement history */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Son Hareketler</span>
          <span className="ml-2 text-[10px] text-gray-400">— son 50 kayıt</span>
        </div>
        {movements.length === 0 ? (
          <div className="py-14 text-center">
            <div className="text-4xl mb-2">📋</div>
            <div className="text-sm font-semibold text-gray-600">Hareket bulunamadı.</div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] font-bold text-gray-400 uppercase tracking-widest bg-gray-50 border-b border-gray-100">
                  <th className="text-left px-5 py-3">Ürün</th>
                  <th className="text-center px-3 py-3">Tip</th>
                  <th className="text-right px-3 py-3">Değişim</th>
                  <th className="text-right px-3 py-3">Maliyet/Birim</th>
                  <th className="text-center px-3 py-3">Giriş Tarihi</th>
                  <th className="text-right px-3 py-3">Sonrası</th>
                  <th className="text-right px-5 py-3">Tarih</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {movements.map(m => {
                  const prod = productMap.get(m.product_id)
                  const cost = Number(m.unit_cost || 0)
                  return (
                    <tr key={m.id} className="hover:bg-gray-50/60">
                      <td className="px-5 py-3 font-medium text-gray-900">
                        {prod?.name ?? '—'}
                        {prod?.sku && <span className="text-xs text-gray-400 ml-1">{prod.sku}</span>}
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-lg">
                          {TYPE_LABELS[m.reference_type] ?? m.reference_type}
                        </span>
                      </td>
                      <td className={`px-3 py-3 text-right font-bold tabular-nums ${Number(m.qty_change) >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                        {Number(m.qty_change) > 0 ? '+' : ''}{Number(m.qty_change)}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums text-gray-500 text-xs">
                        {cost > 0 ? `₺${cost.toFixed(2)}` : '—'}
                      </td>
                      <td className="px-3 py-3 text-center text-gray-500 text-xs tabular-nums">
                        {m.entry_date ? fmtDateShort(m.entry_date) : '—'}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums text-gray-700">
                        {Number(m.qty_after).toLocaleString('tr-TR', { maximumFractionDigits: 3 })}
                      </td>
                      <td className="px-5 py-3 text-right text-gray-400 text-xs">{fmtDateTime(m.created_at)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
