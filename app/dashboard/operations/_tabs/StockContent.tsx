// ── StockContent — Operations hub / stock tab ─────────────────────────────────

import Link                                         from 'next/link'
import { createClient }                             from '@/lib/supabase-server'
import { fmtTRY, fmtDate as fmtDateShort, fmtDatetime as fmtDateTime } from '@/lib/format'
import type { StockMovement }                       from '@/types'
import StockAdjustClient                            from '@/app/dashboard/stocks/StockAdjustClient'
import { StockQueryService }                        from '@/lib/services/stock-query.service'

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

interface Props { companyId: string; userId: string }

export async function StockContent({ companyId, userId }: Props) {
  const supabase = createClient()

  const [productsRes, movementsRes, lotsRes, inconsistencies] = await Promise.all([
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
    StockQueryService.listInconsistentProducts(userId, companyId).catch(() => []),
  ])

  const products  = (productsRes.data  ?? []) as ProductRow[]
  const movements = (movementsRes.data ?? []) as StockMovement[]
  const lots      = (lotsRes.data      ?? []) as StockLotRow[]
  // inconsistencies: products where stock_qty (legacy counter) ≠ Σ stock_movements.qty
  const inconsistentItems = inconsistencies

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
        <h2 className="text-xl font-black text-[#0f172a] tracking-tight">Stok Zekası</h2>
        <p className="text-xs text-[#94a3b8] mt-0.5">FIFO lot değerlemesi · stok hareketleri · portföy özeti</p>
      </div>

      {/* Portfolio summary strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-0 bg-white border border-[#e2e8f0] rounded overflow-hidden shadow-sm">
        {[
          { label: 'Toplam Stok Değeri', value: fmtTRY(portfolioValueTry),      sub: 'FIFO lot maliyeti bazlı',  color: 'text-[#0f172a]' },
          { label: 'Ürün Sayısı',        value: String(products.length),         sub: `${lots.length} açık lot`, color: 'text-[#0f172a]' },
          { label: 'Düşük Stok',         value: String(lowStockCount),           sub: 'Eşik altı ürün',           color: lowStockCount > 0 ? 'text-warn-text' : 'text-[#94a3b8]' },
          {
            label: 'Tutarsız Kayıt',
            value: String(inconsistentItems.length),
            sub:   inconsistentItems.length > 0 ? 'Hareket ≠ stok sayacı' : 'Tutarlı ✓',
            color: inconsistentItems.length > 0 ? 'text-neg' : 'text-[#94a3b8]',
          },
        ].map((card, i) => (
          <div key={card.label} className={`p-3 ${i < 3 ? 'border-b sm:border-b-0 sm:border-r border-[#e2e8f0]' : ''}`}>
            <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-1">{card.label}</div>
            <div className={`text-xl font-black tabular-nums leading-none ${card.color}`}>{card.value}</div>
            <div className="text-[10px] text-[#94a3b8] mt-1">{card.sub}</div>
          </div>
        ))}
      </div>

      {/* Zero-stock alert — products completely out of stock */}
      {zeroStockCount > 0 && (
        <div className="bg-warn-light border border-warn-light rounded px-4 py-3 flex items-start gap-3">
          <span className="text-base mt-0.5">⚠</span>
          <div className="flex-1">
            <div className="text-[0.65rem] font-black uppercase tracking-widest text-warn-text mb-1">
              Stok Tükendi — {zeroStockCount} Ürün
            </div>
            <div className="flex flex-wrap gap-2">
              {products.filter(p => p.stock_qty <= 0).slice(0, 6).map(p => (
                <span key={p.id} className="text-[10px] bg-warn-light text-warn-text font-semibold px-2 py-0.5 rounded">
                  {p.name}
                </span>
              ))}
              {zeroStockCount > 6 && (
                <span className="text-[10px] text-warn-text font-semibold">+{zeroStockCount - 6} ürün daha</span>
              )}
            </div>
            <p className="text-[10px] text-warn-text mt-1">Satış öncesi stok alımı yapılmalı.</p>
          </div>
        </div>
      )}

      {/* Stock consistency warning — only shown when stock_qty counter diverges from movement sum */}
      {inconsistentItems.length > 0 && (
        <div className="bg-neg-light border border-neg-light rounded px-4 py-3">
          <div className="text-[0.65rem] font-black uppercase tracking-widest text-neg-text mb-2">
            ⚠ Stok Tutarsızlığı — {inconsistentItems.length} Ürün
          </div>
          <div className="space-y-1.5">
            {inconsistentItems.map(item => (
              <div key={item.product_id} className="flex items-start gap-2 text-[11px] text-neg-text">
                <span className="shrink-0 mt-px">•</span>
                <span>
                  <span className="font-bold">
                    {products.find(p => p.id === item.product_id)?.name ?? item.product_id}
                  </span>
                  {' '}— Hareket toplamı:{' '}
                  <span className="font-semibold">{item.computed_qty.toLocaleString('tr-TR', { maximumFractionDigits: 3 })}</span>
                  {' '}· Stok sayacı:{' '}
                  <span className="font-semibold">{item.legacy_qty.toLocaleString('tr-TR', { maximumFractionDigits: 3 })}</span>
                  {' '}· Fark:{' '}
                  <span className={`font-black ${item.drift > 0 ? 'text-pos-text' : 'text-neg-text'}`}>
                    {item.drift > 0 ? '+' : ''}{item.drift.toLocaleString('tr-TR', { maximumFractionDigits: 3 })}
                  </span>
                </span>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[10px] text-neg">
            Stok sayacı ile hareket geçmişi arasındaki fark FIFO maliyet hesaplamalarını etkileyebilir.
            Manuel düzeltme için Stok Düzeltme aracını kullanın.
          </p>
        </div>
      )}

      {/* FIFO Lot Panel */}
      {lots.length > 0 && (
        <div className="bg-white border border-[#e2e8f0] rounded overflow-hidden shadow-sm">
          <div className="px-5 py-4 border-b border-[#e2e8f0] flex items-center justify-between">
            <div>
              <span className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">FIFO Lot Paneli</span>
              <span className="ml-2 text-[10px] text-[#94a3b8]">— açık lotlar, tutma süresi ve maliyet</span>
            </div>
            <span className="text-[10px] text-[#94a3b8] bg-[#f1f5f9] px-2 py-0.5 rounded">
              {lots.length} lot · {fmtTRY(portfolioValueTry)}
            </span>
          </div>
          <div className="divide-y divide-[#f1f5f9]">
            {products.filter(p => lotsByProduct.has(p.id)).map(product => {
              const productLots  = lotsByProduct.get(product.id) ?? []
              const productValue = productLots.reduce((s, l) => s + l.costTry, 0)
              const totalQty     = productLots.reduce((s, l) => s + l.qty_remaining, 0)
              const oldestLot    = productLots[0]
              return (
                <div key={product.id} className="px-5 py-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-[#0f172a]">{product.name}</span>
                      {product.sku && <span className="text-[10px] font-mono text-[#94a3b8]">{product.sku}</span>}
                    </div>
                    <div className="flex items-center gap-4 text-right">
                      <div>
                        <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Toplam Miktar</div>
                        <div className="text-sm font-black tabular-nums text-[#1e293b]">
                          {totalQty.toLocaleString('tr-TR', { maximumFractionDigits: 3 })} {product.unit}
                        </div>
                      </div>
                      <div>
                        <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Lot Değeri</div>
                        <div className="text-sm font-black tabular-nums text-primary-700">{fmtTRY(productValue)}</div>
                      </div>
                    </div>
                  </div>
                  <div className="bg-[#f8fafc] rounded overflow-hidden">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] border-b border-[#e2e8f0]">
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
                          const urgency = lot.days > 180 ? 'text-neg' : lot.days > 90 ? 'text-warn-text' : 'text-[#64748b]'
                          return (
                            <tr key={lot.id} className="border-b border-[#e2e8f0] last:border-0">
                              <td className="px-3 py-2 text-[#334155]">{fmtDateShort(lot.received_at)}</td>
                              <td className="px-3 py-2 text-right tabular-nums font-semibold text-[#1e293b]">
                                {lot.qty_remaining.toLocaleString('tr-TR', { maximumFractionDigits: 3 })}
                              </td>
                              <td className="px-3 py-2 text-right tabular-nums text-[#64748b]">
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
                    <div className="mt-2 text-[10px] text-neg bg-neg-light border border-neg-light rounded px-3 py-1.5 font-semibold">
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
      <div className="bg-white border border-[#e2e8f0] rounded overflow-hidden shadow-sm">
        <div className="px-5 py-4 border-b border-[#e2e8f0]">
          <span className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Mevcut Stok</span>
        </div>
        {products.length === 0 ? (
          <div className="py-10 text-center">
            <div className="text-xs font-medium text-[#334155] mb-1">Ürün bulunamadı</div>
            <div className="text-[0.65rem] text-[#94a3b8]">Katalogda henüz ürün yok</div>
          </div>
        ) : (
          <div className="divide-y divide-[#f1f5f9]">
            {products.map(p => {
              const stockNum = Number(p.stock_qty)
              const alertNum = Number(p.stock_alert_qty)
              const isLow    = stockNum > 0 && stockNum <= alertNum
              const isZero   = stockNum <= 0
              const lotValue = (lotsByProduct.get(p.id) ?? []).reduce((s, l) => s + l.costTry, 0)
              return (
                <div key={p.id} className="flex items-center justify-between px-5 py-3 hover:bg-[#f8fafc]/60">
                  <div>
                    <span className="text-sm font-semibold text-[#0f172a]">{p.name}</span>
                    {p.sku && <span className="text-xs text-[#94a3b8] ml-2">{p.sku}</span>}
                    {lotValue > 0 && (
                      <div className="text-[10px] text-[#94a3b8] mt-0.5">
                        Lot değeri: <span className="font-semibold text-primary-600">{fmtTRY(lotValue)}</span>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    {isLow  && <span className="text-xs bg-warn-light text-warn-text px-2 py-0.5 rounded font-semibold">Düşük</span>}
                    {isZero && <span className="text-xs bg-neg-light text-neg-text px-2 py-0.5 rounded font-semibold">Tükendi</span>}
                    <span className={`text-sm font-bold tabular-nums ${isZero ? 'text-neg' : isLow ? 'text-warn-text' : 'text-[#0f172a]'}`}>
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
      <div className="bg-white border border-[#e2e8f0] rounded overflow-hidden shadow-sm">
        <div className="px-5 py-4 border-b border-[#e2e8f0]">
          <span className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Son Hareketler</span>
          <span className="ml-2 text-[10px] text-[#94a3b8]">— son 50 kayıt</span>
        </div>
        {movements.length === 0 ? (
          <div className="py-10 text-center">
            <div className="text-xs font-medium text-[#334155] mb-1">Hareket bulunamadı</div>
            <div className="text-[0.65rem] text-[#94a3b8]">Bu döneme ait stok hareketi yok</div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] bg-[#f8fafc] border-b border-[#e2e8f0]">
                  <th className="text-left px-5 py-3">Ürün</th>
                  <th className="text-center px-3 py-3">Tip</th>
                  <th className="text-right px-3 py-3">Değişim</th>
                  <th className="text-right px-3 py-3">Maliyet/Birim</th>
                  <th className="text-center px-3 py-3">Giriş Tarihi</th>
                  <th className="text-right px-3 py-3">Sonrası</th>
                  <th className="text-right px-5 py-3">Tarih</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f1f5f9]">
                {movements.map(m => {
                  const prod = productMap.get(m.product_id)
                  const cost = Number(m.unit_cost || 0)
                  return (
                    <tr key={m.id} className="hover:bg-[#f8fafc]/60">
                      <td className="px-5 py-3 font-medium text-[#0f172a]">
                        {prod?.name ?? '—'}
                        {prod?.sku && <span className="text-xs text-[#94a3b8] ml-1">{prod.sku}</span>}
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span className="text-xs bg-[#f1f5f9] text-[#64748b] px-2 py-0.5 rounded">
                          {TYPE_LABELS[m.reference_type] ?? m.reference_type}
                        </span>
                      </td>
                      <td className={`px-3 py-3 text-right font-bold tabular-nums ${Number(m.qty_change) >= 0 ? 'text-pos-text' : 'text-neg'}`}>
                        {Number(m.qty_change) > 0 ? '+' : ''}{Number(m.qty_change)}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums text-[#64748b] text-xs">
                        {cost > 0 ? `₺${cost.toFixed(2)}` : '—'}
                      </td>
                      <td className="px-3 py-3 text-center text-[#64748b] text-xs tabular-nums">
                        {m.entry_date ? fmtDateShort(m.entry_date) : '—'}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums text-[#334155]">
                        {Number(m.qty_after).toLocaleString('tr-TR', { maximumFractionDigits: 3 })}
                      </td>
                      <td className="px-5 py-3 text-right text-[#94a3b8] text-xs">{fmtDateTime(m.created_at)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Cross-navigation */}
      <div className="flex items-center justify-between px-1">
        <p className="text-[10px] text-[#94a3b8] leading-relaxed">
          FIFO stok maliyetleri satış marjlarını ve P&amp;L&apos;i doğrudan etkiler.
        </p>
        <div className="flex items-center gap-2 shrink-0 ml-4">
          <Link
            href="/dashboard/operations?tab=catalog"
            className="text-[11px] font-bold text-primary-600 hover:text-primary-700 underline underline-offset-2 whitespace-nowrap"
          >
            Katalog →
          </Link>
          <span className="text-[#e2e8f0]">|</span>
          <Link
            href="/dashboard/finance?tab=pnl"
            className="text-[11px] font-bold text-primary-600 hover:text-primary-700 underline underline-offset-2 whitespace-nowrap"
          >
            P&amp;L Analizi →
          </Link>
        </div>
      </div>
    </div>
  )
}
