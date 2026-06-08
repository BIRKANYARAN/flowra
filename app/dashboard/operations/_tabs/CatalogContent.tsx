// ── CatalogContent — Operations hub / catalog tab ─────────────────────────────

import Link from 'next/link'
import { Suspense } from 'react'
import { NarrativeFooter } from '@/components/ds'
import { createClient } from '@/lib/supabase-server'
import type { Product } from '@/types'
import CatalogClient from '@/app/dashboard/catalog/CatalogClient'
import { CatalogCommandBar } from '@/app/dashboard/catalog/_components/CatalogCommandBar'
import { ProductMarginService } from '@/lib/services/inventory/product-margin.service'
import type { ProductMarginReport } from '@/lib/services/inventory/product-margin.service'
import { InventoryValuationClient } from './_inventory-valuation/InventoryValuationClient'
import { PriceOptimizationClient } from './_price-optimization/PriceOptimizationClient'
import { ProductProfitabilityWaterfall } from './_product-profitability/ProductProfitabilityWaterfall'
import { AbcAnalysisClient } from './_abc/AbcAnalysisClient'
import MarketBasketClient from '@/app/dashboard/commercial/_tabs/_basket/MarketBasketClient'

function CommandBarSkeleton() {
  return (
    <div className="flex items-center gap-2 animate-pulse">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="h-8 w-28 bg-[#f1f5f9] rounded" />
      ))}
    </div>
  )
}

const FMT = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 })
function fmtTRY(n: number): string {
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return `₺${(n / 1_000_000).toFixed(2)}M`
  if (abs >= 1_000)     return `₺${(n / 1_000).toFixed(1)}K`
  return `₺${FMT.format(Math.round(n))}`
}

interface Props { companyId: string; userId: string }

export async function CatalogContent({ companyId, userId }: Props) {
  const supabase = createClient()

  const today  = new Date().toISOString().slice(0, 10)
  const ytdFrom = today.slice(0, 4) + '-01-01'

  const [prodRes, lotRes, marginReport] = await Promise.all([
    supabase
      .from('products')
      .select('*')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .eq('is_active', true)
      .order('name'),

    // Batch FIFO cost: one query for all products instead of N×RPC.
    // real_cost = weighted average entry_cost_try weighted by qty_remaining.
    supabase
      .from('stock_lots')
      .select('product_id, cost_price_try, qty_remaining')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .gt('qty_remaining', 0),

    ProductMarginService.getReport(companyId, supabase, { from: ytdFrom, to: today })
      .catch(() => null as ProductMarginReport | null),
  ])

  const products = (prodRes.data ?? []) as Product[]

  const initialRealCosts: Record<string, number | null> = {}
  const lotSums: Record<string, { costQty: number; qty: number }> = {}
  for (const lot of lotRes.data ?? []) {
    const pid = String(lot.product_id ?? '')
    if (!pid) continue
    const prev = lotSums[pid] ?? { costQty: 0, qty: 0 }
    lotSums[pid] = {
      costQty: prev.costQty + Number((lot as { cost_price_try?: number | null }).cost_price_try ?? 0) * Number(lot.qty_remaining ?? 0),
      qty:     prev.qty     + Number(lot.qty_remaining ?? 0),
    }
  }
  for (const [pid, { costQty, qty }] of Object.entries(lotSums)) {
    initialRealCosts[pid] = qty > 0 ? costQty / qty : null
  }

  // ── Catalog analytics ─────────────────────────────────────────────────────────
  const totalListValue    = products.reduce((s, p) => s + Number(p.default_sale_price ?? 0), 0)
  const productsWithStock = products.filter(p => Number(p.stock_qty ?? 0) > 0)
  const lowStockProducts  = products.filter(p => {
    const qty   = Number(p.stock_qty ?? 0)
    const alert = Number(p.stock_alert_qty ?? 0)
    return qty > 0 && alert > 0 && qty <= alert
  })
  const zeroStockProducts = products.filter(p => Number(p.stock_qty ?? 0) <= 0)

  // Products with a real FIFO cost — compute margin quality
  const withMargin: Array<{ name: string; margin: number }> = []
  for (const p of products) {
    const listPrice = Number(p.default_sale_price ?? 0)
    const fifoCost  = initialRealCosts[p.id]
    if (listPrice > 0 && fifoCost != null && fifoCost > 0) {
      withMargin.push({ name: p.name, margin: (listPrice - fifoCost) / listPrice })
    }
  }
  const lowMarginProducts = withMargin.filter(m => m.margin < 0.15).slice(0, 5)
  const avgMargin = withMargin.length > 0
    ? withMargin.reduce((s, m) => s + m.margin, 0) / withMargin.length
    : null

  return (
    <div className="space-y-4">
      <Suspense fallback={<CommandBarSkeleton />}>
        <CatalogCommandBar companyId={companyId} />
      </Suspense>

      {/* ── Catalog KPI strip ─────────────────────────────────────────────── */}
      {products.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-0 bg-white border border-[#e8eaef] rounded-xl shadow-soft overflow-hidden shadow-sm">
          {[
            {
              label: 'Aktif Ürün',
              value: String(products.length),
              sub:   `${productsWithStock.length} stokta · ${zeroStockProducts.length} tükenmiş`,
              color: 'text-[#0f172a]',
            },
            {
              label: 'Katalog Liste Değeri',
              value: totalListValue > 0 ? fmtTRY(totalListValue) : '—',
              sub:   'Toplam liste fiyatı toplamı',
              color: 'text-[#0f172a]',
            },
            {
              label: 'Ort. Brüt Marj',
              value: avgMargin !== null ? `%${(avgMargin * 100).toFixed(1)}` : '—',
              sub:   avgMargin !== null
                ? `${withMargin.length} ürün FIFO maliyetiyle`
                : 'FIFO maliyet verisi yok',
              color: avgMargin === null ? 'text-[#94a3b8]'
                : avgMargin >= 0.30 ? 'text-pos-text'
                : avgMargin >= 0.15 ? 'text-warn-text'
                : 'text-neg',
            },
            {
              label: 'Düşük Stok Uyarısı',
              value: lowStockProducts.length > 0 ? String(lowStockProducts.length) : '—',
              sub:   lowStockProducts.length > 0
                ? `${lowStockProducts.map(p => p.name).slice(0, 2).join(', ')}${lowStockProducts.length > 2 ? '…' : ''}`
                : 'Tüm ürünler eşik üstünde',
              color: lowStockProducts.length > 0 ? 'text-warn-text' : 'text-pos-text',
            },
          ].map((card, i) => (
            <div key={card.label} className={`p-3 ${i < 3 ? 'border-b sm:border-b-0 sm:border-r border-[#e8eaef]' : ''}`}>
              <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-1">{card.label}</div>
              <div className={`text-xl font-black tabular-nums leading-none ${card.color}`}>{card.value}</div>
              <div className="text-[10px] text-[#94a3b8] mt-1 truncate" title={card.sub}>{card.sub}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── Low margin alert ─────────────────────────────────────────────────── */}
      {lowMarginProducts.length > 0 && (
        <div className="bg-warn-light border border-warn-light rounded px-4 py-3">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-[0.65rem] font-black uppercase tracking-widest text-warn-text">⚠ Düşük Marjlı Ürünler</span>
            <span className="text-[9px] text-warn-text">({lowMarginProducts.length} ürün &lt;%15 brüt marj)</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {lowMarginProducts.map(p => (
              <span key={p.name} className="text-[10px] bg-warn-light text-warn-text font-semibold px-2 py-0.5 rounded">
                {p.name} · %{(p.margin * 100).toFixed(1)}
              </span>
            ))}
          </div>
          <div className="text-[10px] text-warn-text mt-1.5">
            Liste fiyatını artırın veya tedarik maliyetini düşürün.
          </div>
        </div>
      )}

      <CatalogClient
        initialProducts={products}
        initialRealCosts={initialRealCosts}
        userId={userId}
        companyId={companyId}
      />

      {/* ── Ürün Karlılığı ────────────────────────────────────────────────────── */}
      {marginReport && marginReport.products.length > 0 && (
        <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft shadow-sm">
          {/* Header strip */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#f1f5f9]">
            <div>
              <div className="text-[9px] font-black uppercase tracking-widest text-[#94a3b8]">Ürün Karlılığı</div>
              <div className="text-xs text-[#64748b] mt-0.5">FIFO maliyet bazlı brüt marj · {today.slice(0, 4)} yılı</div>
            </div>
            <div className="flex items-center gap-4 text-xs">
              <div className="text-right">
                <div className="text-[9px] uppercase tracking-wide text-[#94a3b8]">Toplam Gelir</div>
                <div className="font-black tabular-nums text-[#0f172a]">{fmtTRY(marginReport.total_revenue_try)}</div>
              </div>
              <div className="text-right">
                <div className="text-[9px] uppercase tracking-wide text-[#94a3b8]">Genel Brüt Marj</div>
                <div className={`font-black tabular-nums ${
                  marginReport.overall_gross_margin_pct > 40 ? 'text-pos-text' :
                  marginReport.overall_gross_margin_pct > 20 ? 'text-warn-text' : 'text-neg'
                }`}>%{marginReport.overall_gross_margin_pct.toFixed(1)}</div>
              </div>
            </div>
          </div>

          {/* Below-threshold warning */}
          {marginReport.products_below_threshold_count > 0 && (
            <div className="px-4 py-2 bg-warn-light border-b border-warn/20 text-xs text-warn-text font-semibold flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-warn shrink-0" />
              {marginReport.products_below_threshold_count} ürün %10 altında marj — fiyat veya maliyet revizyonu gerekebilir.
            </div>
          )}

          {/* Best/worst callouts */}
          {(marginReport.top_margin_product || marginReport.lowest_margin_product) && (
            <div className="flex gap-4 px-4 py-2 border-b border-[#f1f5f9] text-[10px]">
              {marginReport.top_margin_product && (
                <span className="text-pos-text">
                  <span className="font-black">En yüksek marj:</span> {marginReport.top_margin_product}
                </span>
              )}
              {marginReport.lowest_margin_product && marginReport.products.length > 1 && (
                <span className="text-neg">
                  <span className="font-black">En düşük marj:</span> {marginReport.lowest_margin_product}
                </span>
              )}
            </div>
          )}

          {/* Product table */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[#f1f5f9]">
                  <th className="text-left px-4 py-2 text-[9px] font-black uppercase tracking-widest text-[#94a3b8]">Ürün</th>
                  <th className="text-right px-4 py-2 text-[9px] font-black uppercase tracking-widest text-[#94a3b8]">Satış Adedi</th>
                  <th className="text-right px-4 py-2 text-[9px] font-black uppercase tracking-widest text-[#94a3b8]">Gelir</th>
                  <th className="text-right px-4 py-2 text-[9px] font-black uppercase tracking-widest text-[#94a3b8]">Brüt Marj %</th>
                  <th className="text-center px-4 py-2 text-[9px] font-black uppercase tracking-widest text-[#94a3b8]">Not</th>
                </tr>
              </thead>
              <tbody>
                {marginReport.products.slice(0, 10).map(p => {
                  const gradeColors: Record<string, string> = {
                    excellent: 'bg-pos-light text-pos-text',
                    good:      'bg-blue-50 text-blue-700',
                    fair:      'bg-warn-light text-warn-text',
                    poor:      'bg-neg-light text-neg-text',
                  }
                  const gradeLabels: Record<string, string> = {
                    excellent: 'Mükemmel', good: 'İyi', fair: 'Orta', poor: 'Zayıf',
                  }
                  const colors = gradeColors[p.margin_grade] ?? 'bg-[#f1f5f9] text-[#64748b]'
                  return (
                    <tr key={p.product_id} className="border-b border-[#f8fafc] hover:bg-[#fafafa]">
                      <td className="px-4 py-2">
                        <div className="font-semibold text-[#0f172a]">{p.product_name}</div>
                        {p.category && <div className="text-[10px] text-[#94a3b8]">{p.category}</div>}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-[#334155]">{p.units_sold}</td>
                      <td className="px-4 py-2 text-right tabular-nums font-semibold text-[#0f172a]">{fmtTRY(p.revenue_try)}</td>
                      <td className={`px-4 py-2 text-right tabular-nums font-black ${
                        p.gross_margin_pct > 40 ? 'text-pos-text' :
                        p.gross_margin_pct > 20 ? 'text-warn-text' : 'text-neg'
                      }`}>%{p.gross_margin_pct.toFixed(1)}</td>
                      <td className="px-4 py-2 text-center">
                        <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold ${colors}`}>
                          {gradeLabels[p.margin_grade]}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── ABC Stok Analizi ─────────────────────────────────────────────────── */}
      <AbcAnalysisClient companyId={companyId} />

      {/* ── Sepet Analizi — Çapraz Satış Fırsatları ─────────────────────────── */}
      <MarketBasketClient companyId={companyId} />

      {/* ── Ürün Kârlılık Şelalesi ────────────────────────────────────────────── */}
      <ProductProfitabilityWaterfall />

      {/* ── Fiyat Optimizasyonu ───────────────────────────────────────────────── */}
      <PriceOptimizationClient />

      {/* ── Envanter Değerleme ────────────────────────────────────────────────── */}
      <InventoryValuationClient />

      {/* Cross-navigation */}
      <NarrativeFooter
        narrative="Düşük marjlı ürün hacmi ciro üretir ama kâr değil — her ürünün birim kârını satış hacmiyle birlikte takip edin."
        links={[
          { label: 'Stok',               href: '/dashboard/operations?tab=stock' },
          { label: 'P&L Analizi',        href: '/dashboard/finance?tab=pnl' },
          { label: 'Senaryo Analizi',    href: '/dashboard/planning?tab=scenarios' },
        ]}
      />
    </div>
  )
}
