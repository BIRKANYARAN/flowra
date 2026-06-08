// ── StockContent — Operations hub / stock tab ─────────────────────────────────

import Link                                         from 'next/link'
import { NarrativeFooter }                          from '@/components/ds'
import { createClient }                             from '@/lib/supabase-server'
import { fmtTRY, fmtDate as fmtDateShort, fmtDatetime as fmtDateTime } from '@/lib/format'
import type { StockMovement }                       from '@/types'
import StockAdjustClient                            from '@/app/dashboard/stocks/StockAdjustClient'
import { StockQueryService }                        from '@/lib/services/stock-query.service'
import { InventoryValuationService }                from '@/lib/services/inventory/inventory-valuation.service'
import type { InventoryValuationReport }            from '@/lib/services/inventory/inventory-valuation.service'
import { ReorderAlertService }                      from '@/lib/services/inventory/reorder-alert.service'
import type { ReorderAlertReport }                  from '@/lib/services/inventory/reorder-alert.service'
import { DemandForecastService }                    from '@/lib/services/inventory/demand-forecast.service'
import type { DemandForecastReport }                from '@/lib/services/inventory/demand-forecast.service'
import { FifoAuditClient }                          from './_fifo/FifoAuditClient'
import { SalesVelocityClient }                      from './_velocity/SalesVelocityClient'
import InventoryTurnoverClient                      from './_inventory/InventoryTurnoverClient'
import { StockCharts }                              from './StockCharts'
import { DetailSection }                            from '@/components/dashboard/DetailSection'

function holdingDays(entryDate: string): number {
  const today = new Date()
  const entry = new Date(entryDate + 'T00:00:00')
  return Math.max(0, Math.round((today.getTime() - entry.getTime()) / 86_400_000))
}

const TYPE_LABELS: Record<string, string> = {
  purchase: 'Alım', sale: 'Satış', adjustment: 'Düzeltme', return: 'İade',
}

// Demand-forecast display maps (labels + tone for the existing service's literal unions)
const DEMAND_TREND_META: Record<string, { label: string; cls: string }> = {
  growing:           { label: 'Artıyor',     cls: 'text-pos-text' },
  stable:            { label: 'Sabit',       cls: 'text-[#64748b]' },
  declining:         { label: 'Azalıyor',    cls: 'text-warn-text' },
  insufficient_data: { label: 'Veri yok',    cls: 'text-[#94a3b8]' },
}
const STOCKOUT_RISK_META: Record<string, { label: string; cls: string }> = {
  critical: { label: 'Kritik', cls: 'bg-neg-light text-neg-text' },
  high:     { label: 'Yüksek', cls: 'bg-orange-50 text-orange-700' },
  medium:   { label: 'Orta',   cls: 'bg-warn-light text-warn-text' },
  low:      { label: 'Düşük',  cls: 'bg-pos-light text-pos-text' },
  no_data:  { label: '—',      cls: 'text-[#94a3b8]' },
}

interface ProductRow { id: string; name: string; sku: string; unit: string; stock_qty: number; stock_alert_qty: number }
interface StockLotRow { id: string; product_id: string; received_at: string; qty_remaining: number; cost_price: number; cost_currency: string; cost_fx_rate: number; cost_price_try: number }

interface Props { companyId: string; userId: string }

export async function StockContent({ companyId, userId }: Props) {
  const supabase = createClient()

  const [productsRes, movementsRes, lotsRes, inconsistencies, valuation, reorderAlertsResult, demandForecastResult] = await Promise.allSettled([
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
    InventoryValuationService.getReport(companyId, supabase).catch(() => null),
    ReorderAlertService.getReport(companyId, supabase).catch(() => null),
    new DemandForecastService(supabase).getReport(companyId).catch(() => null),
  ])

  const products  = (productsRes.status === 'fulfilled' ? (productsRes.value.data  ?? []) : []) as ProductRow[]
  const movements = (movementsRes.status === 'fulfilled' ? (movementsRes.value.data ?? []) : []) as StockMovement[]
  const lots      = (lotsRes.status === 'fulfilled' ? (lotsRes.value.data      ?? []) : []) as StockLotRow[]
  // inconsistencies: products where stock_qty (legacy counter) ≠ Σ stock_movements.qty
  const inconsistentItems = inconsistencies.status === 'fulfilled' ? inconsistencies.value : []
  const valuationReport: InventoryValuationReport | null =
    valuation.status === 'fulfilled' ? valuation.value : null
  const reorderReport: ReorderAlertReport | null =
    reorderAlertsResult.status === 'fulfilled' ? reorderAlertsResult.value : null
  const demandForecastReport: DemandForecastReport | null =
    demandForecastResult.status === 'fulfilled' ? demandForecastResult.value : null

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
    <div className="max-w-4xl space-y-4">
      <div>
        <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Stok Zekası</div>
        <p className="text-xs text-[#94a3b8] mt-0.5">FIFO lot değerlemesi · stok hareketleri · portföy özeti</p>
      </div>

      {/* Visual summary — stock value mix + aging buckets */}
      {valuationReport && valuationReport.total_inventory_value_try > 0 && (
        <StockCharts
          totalValue={valuationReport.total_inventory_value_try}
          byProduct={valuationReport.products.slice(0, 6).map(p => ({ name: p.product_name, value: Math.round(p.total_value) }))}
          aging={{
            current: Math.round(valuationReport.aging_summary.current_try),
            d30:     Math.round(valuationReport.aging_summary.aging_30_try),
            d60:     Math.round(valuationReport.aging_summary.aging_60_try),
            d90plus: Math.round(valuationReport.aging_summary.aging_90_plus_try),
          }}
        />
      )}

      {/* Stok Devir Analizi — turnover ratio, DIO, dead stock, shrinkage, reorder alerts */}
      <InventoryTurnoverClient companyId={companyId} />

      {/* Yeniden Sipariş Uyarıları — reorder alert summary + action table */}
      {reorderReport && (reorderReport.out_of_stock_count > 0 || reorderReport.critical_count > 0 || reorderReport.low_count > 0) && (
        <div className="bg-white border border-[#e2e8f0] rounded-xl shadow-soft overflow-hidden shadow-sm">
          <div className="px-5 py-4 border-b border-[#e2e8f0] flex items-center justify-between">
            <div>
              <span className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Yeniden Sipariş Uyarıları</span>
              <span className="ml-2 text-[10px] text-[#94a3b8]">— düşük stok tespiti ve sipariş önerileri</span>
            </div>
            {/* Alert count badges */}
            <div className="flex items-center gap-2">
              {reorderReport.out_of_stock_count > 0 && (
                <span className="text-[10px] font-black bg-neg-light text-neg-text px-2 py-0.5 rounded">
                  {reorderReport.out_of_stock_count} Stok Bitti
                </span>
              )}
              {reorderReport.critical_count > 0 && (
                <span className="text-[10px] font-black bg-orange-50 text-orange-700 px-2 py-0.5 rounded">
                  {reorderReport.critical_count} Kritik
                </span>
              )}
              {reorderReport.low_count > 0 && (
                <span className="text-[10px] font-black bg-warn-light text-warn-text px-2 py-0.5 rounded">
                  {reorderReport.low_count} Düşük
                </span>
              )}
            </div>
          </div>

          {/* Action-required products table */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] bg-[#f8fafc] border-b border-[#e2e8f0]">
                  <th className="text-left px-5 py-2.5">Ürün</th>
                  <th className="text-right px-4 py-2.5">Mevcut Stok</th>
                  <th className="text-right px-4 py-2.5">Kalan Gün</th>
                  <th className="text-right px-4 py-2.5">Önerilen Sipariş</th>
                  <th className="text-right px-5 py-2.5">Durum</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f1f5f9]">
                {reorderReport.alerts
                  .filter(a => a.action_required)
                  .map(alert => {
                    const badgeClass =
                      alert.alert_level === 'out_of_stock' ? 'bg-neg-light text-neg-text'
                      : alert.alert_level === 'critical'   ? 'bg-orange-50 text-orange-700'
                      : 'bg-warn-light text-warn-text'
                    const qtyColor =
                      alert.alert_level === 'out_of_stock' ? 'text-neg'
                      : alert.alert_level === 'critical'   ? 'text-orange-700'
                      : 'text-warn-text'
                    return (
                      <tr key={alert.product_id} className="hover:bg-[#f8fafc]/60">
                        <td className="px-5 py-3 font-semibold text-[#0f172a]">
                          {alert.product_name}
                          {alert.product_sku && (
                            <span className="ml-2 text-[10px] font-mono text-[#94a3b8]">{alert.product_sku}</span>
                          )}
                        </td>
                        <td className={`px-4 py-3 text-right tabular-nums font-bold ${qtyColor}`}>
                          {alert.current_qty.toLocaleString('tr-TR', { maximumFractionDigits: 3 })}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-[#64748b]">
                          {alert.days_of_stock_remaining != null
                            ? `${alert.days_of_stock_remaining} gün`
                            : '—'}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-brand font-semibold">
                          {alert.suggested_order_qty != null
                            ? alert.suggested_order_qty.toLocaleString('tr-TR', { maximumFractionDigits: 3 })
                            : '—'}
                        </td>
                        <td className="px-5 py-3 text-right">
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${badgeClass}`}>
                            {alert.urgency_label}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
              </tbody>
            </table>
          </div>

          {/* Footer: no-threshold count */}
          {reorderReport.products_without_threshold > 0 && (
            <div className="px-5 py-3 border-t border-[#e2e8f0] bg-[#f8fafc]">
              <span className="text-[10px] text-[#64748b]">
                <span className="font-semibold">{reorderReport.products_without_threshold} ürün</span>
                {' '}için yeniden sipariş eşiği tanımlanmamış — eşik belirlemek için ürün ayarlarını güncelleyin.
              </span>
            </div>
          )}
        </div>
      )}

      {/* Talep Tahmini — demand forecast: forecasted demand, reorder point, stockout risk */}
      {demandForecastReport && demandForecastReport.products.length > 0 && (
        <div className="bg-white border border-[#e2e8f0] rounded-xl shadow-soft overflow-hidden shadow-sm">
          <div className="px-5 py-4 border-b border-[#e2e8f0] flex items-center justify-between">
            <div>
              <span className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Talep Tahmini</span>
              <span className="ml-2 text-[10px] text-[#94a3b8]">
                — {demandForecastReport.period_months} aylık geçmişe dayalı 3 aylık talep projeksiyonu
              </span>
            </div>
            <div className="flex items-center gap-2">
              {demandForecastReport.critical_stockout_count > 0 && (
                <span className="text-[10px] font-black bg-neg-light text-neg-text px-2 py-0.5 rounded">
                  {demandForecastReport.critical_stockout_count} Kritik Stok-out
                </span>
              )}
              {demandForecastReport.needs_reorder_count > 0 && (
                <span className="text-[10px] font-black bg-warn-light text-warn-text px-2 py-0.5 rounded">
                  {demandForecastReport.needs_reorder_count} Sipariş Gerekli
                </span>
              )}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] bg-[#f8fafc] border-b border-[#e2e8f0]">
                  <th className="text-left px-5 py-2.5">Ürün</th>
                  <th className="text-right px-4 py-2.5">Mevcut Stok</th>
                  <th className="text-right px-4 py-2.5">Aylık Ort.</th>
                  <th className="text-right px-4 py-2.5">3 Aylık Tahmin</th>
                  <th className="text-right px-4 py-2.5">Sipariş Noktası</th>
                  <th className="text-right px-4 py-2.5">Önerilen Sipariş</th>
                  <th className="text-right px-4 py-2.5">Kapsam</th>
                  <th className="text-center px-4 py-2.5">Trend</th>
                  <th className="text-right px-5 py-2.5">Stok-out Riski</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f1f5f9]">
                {demandForecastReport.products.map(p => {
                  const forecast3m = p.forecasted_next_3m.reduce((s, v) => s + v, 0)
                  const trend = DEMAND_TREND_META[p.demand_trend] ?? DEMAND_TREND_META.insufficient_data
                  const risk  = STOCKOUT_RISK_META[p.stockout_risk] ?? STOCKOUT_RISK_META.no_data
                  return (
                    <tr key={p.product_id} className={`hover:bg-[#f8fafc]/60 ${p.needs_reorder ? 'bg-warn-light/30' : ''}`}>
                      <td className="px-5 py-3 font-semibold text-[#0f172a]">{p.product_name}</td>
                      <td className={`px-4 py-3 text-right tabular-nums font-bold ${p.needs_reorder ? 'text-warn-text' : 'text-[#334155]'}`}>
                        {p.current_stock_units.toLocaleString('tr-TR', { maximumFractionDigits: 3 })}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-[#64748b]">
                        {p.avg_monthly_units.toLocaleString('tr-TR', { maximumFractionDigits: 1 })}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-[#334155]">
                        {forecast3m.toLocaleString('tr-TR', { maximumFractionDigits: 1 })}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-[#64748b]">
                        {p.reorder_point_units.toLocaleString('tr-TR', { maximumFractionDigits: 1 })}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-brand font-semibold">
                        {p.optimal_order_qty != null
                          ? p.optimal_order_qty.toLocaleString('tr-TR', { maximumFractionDigits: 1 })
                          : '—'}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-[#64748b]">
                        {p.coverage_months != null ? `${p.coverage_months.toLocaleString('tr-TR', { maximumFractionDigits: 1 })} ay` : '—'}
                      </td>
                      <td className={`px-4 py-3 text-center font-semibold ${trend.cls}`}>{trend.label}</td>
                      <td className="px-5 py-3 text-right">
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${risk.cls}`}>{risk.label}</span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Portfolio summary strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-0 bg-white border border-[#e2e8f0] rounded-xl shadow-soft overflow-hidden shadow-sm">
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

      {/* Stok Değerleme — FIFO aging + product summary */}
      {valuationReport && valuationReport.total_lots > 0 && (
        <div className="bg-white border border-[#e2e8f0] rounded-xl shadow-soft overflow-hidden shadow-sm">
          <div className="px-5 py-4 border-b border-[#e2e8f0] flex items-center justify-between">
            <div>
              <span className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Stok Değerleme</span>
              <span className="ml-2 text-[10px] text-[#94a3b8]">— FIFO maliyet bazlı lot yaşlandırması</span>
            </div>
            <span className="text-[10px] text-[#94a3b8] bg-[#f1f5f9] px-2 py-0.5 rounded">
              {fmtTRY(valuationReport.total_inventory_value_try)} toplam
            </span>
          </div>

          {/* Aging buckets */}
          <div className="grid grid-cols-4 divide-x divide-[#e2e8f0] border-b border-[#e2e8f0]">
            {[
              { label: 'Güncel (<30g)',  value: valuationReport.aging_summary.current_try,       color: 'text-pos-text' },
              { label: '30-60 gün',      value: valuationReport.aging_summary.aging_30_try,       color: 'text-[#0f172a]' },
              { label: '60-90 gün',      value: valuationReport.aging_summary.aging_60_try,       color: 'text-warn-text' },
              { label: '90+ gün',        value: valuationReport.aging_summary.aging_90_plus_try,  color: 'text-neg' },
            ].map(b => (
              <div key={b.label} className="px-4 py-3">
                <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-1">{b.label}</div>
                <div className={`text-base font-black tabular-nums leading-none ${b.color}`}>{fmtTRY(b.value)}</div>
              </div>
            ))}
          </div>

          {/* Product summary table */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] bg-[#f8fafc] border-b border-[#e2e8f0]">
                  <th className="text-left px-5 py-2.5">Ürün</th>
                  <th className="text-right px-4 py-2.5">Toplam Miktar</th>
                  <th className="text-right px-4 py-2.5">Stok Değeri (₺)</th>
                  <th className="text-right px-4 py-2.5">Ort. Birim Maliyet</th>
                  <th className="text-right px-4 py-2.5">Maks. Yaş</th>
                  <th className="text-right px-5 py-2.5">Durum</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f1f5f9]">
                {valuationReport.products.map(prod => {
                  const ageColor = prod.max_age_days >= 90 ? 'text-neg'
                    : prod.max_age_days >= 60 ? 'text-warn-text' : 'text-[#64748b]'
                  return (
                    <tr key={prod.product_id} className="hover:bg-[#f8fafc]/60">
                      <td className="px-5 py-3 font-semibold text-[#0f172a]">{prod.product_name}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-[#334155]">
                        {prod.total_qty.toLocaleString('tr-TR', { maximumFractionDigits: 3 })}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-semibold text-brand">
                        {fmtTRY(prod.total_value_try)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-[#64748b]">
                        ₺{prod.avg_cost_try.toFixed(2)}
                      </td>
                      <td className={`px-4 py-3 text-right tabular-nums font-semibold ${ageColor}`}>
                        {prod.max_age_days} gün
                      </td>
                      <td className="px-5 py-3 text-right">
                        {prod.is_low_stock ? (
                          <span className="text-[10px] bg-warn-light text-warn-text px-2 py-0.5 rounded font-semibold">Düşük</span>
                        ) : (
                          <span className="text-[10px] text-[#94a3b8]">Normal</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {valuationReport.low_stock_count > 0 && (
            <div className="px-5 py-3 border-t border-[#e2e8f0] bg-warn-light">
              <span className="text-[10px] font-semibold text-warn-text">
                ⚠ {valuationReport.low_stock_count} ürün yeniden sipariş eşiğinin altında
              </span>
            </div>
          )}
        </div>
      )}

      {/* FIFO Lot Panel */}
      {lots.length > 0 && (
        <div className="bg-white border border-[#e2e8f0] rounded-xl shadow-soft overflow-hidden shadow-sm">
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
                      <span className="text-xs font-bold text-[#0f172a]">{product.name}</span>
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
                        <div className="text-sm font-black tabular-nums text-brand">{fmtTRY(productValue)}</div>
                      </div>
                    </div>
                  </div>
                  <div className="bg-[#f8fafc] rounded overflow-hidden">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] border-b border-[#e2e8f0]">
                          <th className="text-left px-4 py-2.5">Giriş Tarihi</th>
                          <th className="text-right px-4 py-2.5">Kalan Adet</th>
                          <th className="text-right px-4 py-2.5">Birim Maliyet</th>
                          <th className="text-right px-4 py-2.5">Lot Değeri (₺)</th>
                          <th className="text-right px-4 py-2.5">Tutma Süresi</th>
                        </tr>
                      </thead>
                      <tbody>
                        {productLots.map(lot => {
                          const perUnitTry = lot.cost_price_try != null && lot.cost_price_try > 0
                            ? lot.cost_price_try : lot.cost_price * (lot.cost_fx_rate || 1)
                          const urgency = lot.days > 180 ? 'text-neg' : lot.days > 90 ? 'text-warn-text' : 'text-[#64748b]'
                          return (
                            <tr key={lot.id} className="border-b border-[#e2e8f0] last:border-0">
                              <td className="px-4 py-3 text-[#334155]">{fmtDateShort(lot.received_at)}</td>
                              <td className="px-4 py-3 text-right tabular-nums font-semibold text-[#1e293b]">
                                {lot.qty_remaining.toLocaleString('tr-TR', { maximumFractionDigits: 3 })}
                              </td>
                              <td className="px-4 py-3 text-right tabular-nums text-[#64748b]">
                                {lot.cost_currency !== 'TRY'
                                  ? `${lot.cost_price.toFixed(2)} ${lot.cost_currency} → ₺${perUnitTry.toFixed(2)}`
                                  : `₺${perUnitTry.toFixed(2)}`}
                              </td>
                              <td className="px-4 py-3 text-right tabular-nums font-semibold text-brand">{fmtTRY(lot.costTry)}</td>
                              <td className={`px-4 py-3 text-right tabular-nums font-semibold ${urgency}`}>
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
      <div className="bg-white border border-[#e2e8f0] rounded-xl shadow-soft overflow-hidden shadow-sm">
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
                <div key={p.id} className="flex items-center justify-between px-4 py-3 hover:bg-[#f8fafc]/60">
                  <div>
                    <span className="text-xs font-semibold text-[#0f172a]">{p.name}</span>
                    {p.sku && <span className="text-xs text-[#94a3b8] ml-2">{p.sku}</span>}
                    {lotValue > 0 && (
                      <div className="text-[10px] text-[#94a3b8] mt-0.5">
                        Lot değeri: <span className="font-semibold text-brand-light">{fmtTRY(lotValue)}</span>
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
      <div className="bg-white border border-[#e2e8f0] rounded-xl shadow-soft overflow-hidden shadow-sm">
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

      {/* Detaylı Analiz — deep panels, collapsed by default (load on demand) */}
      <DetailSection title="Detaylı Stok Analizi" subtitle="Satış hızı · stok-out tahmini · FIFO lot denetimi">
        {/* Satış Hız Analizi — velocity, stock-out predictions, reorder intelligence */}
        <SalesVelocityClient companyId={companyId} />
        {/* FIFO Lot Denetimi — integrity audit, over-consumed lots, orphaned allocations */}
        <FifoAuditClient companyId={companyId} />
      </DetailSection>

      {/* Cross-navigation */}
      <NarrativeFooter
        narrative="Stok yaşı arttıkça FIFO maliyeti yükselir — eski lot satışı marjı ve P&L'i doğrudan etkiler."
        links={[
          { label: 'Katalog',     href: '/dashboard/operations?tab=catalog' },
          { label: 'P&L Analizi', href: '/dashboard/finance?tab=pnl' },
        ]}
      />
    </div>
  )
}
