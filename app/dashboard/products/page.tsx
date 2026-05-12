// ── /dashboard/products — Ürün Yönetimi (server component) ───────────────────
//
// FAZ 17: Converted from 'use client' to server component.
//
// Server-rendered sections (static, no JS):
//   Zone 1 — KPI strip: total products, low-stock alerts, active lots, top currency
//   Zone 2 — Stock value distribution bar chart (top 5 products by stock value)
//
// Client island:
//   ProductsClient — CRUD form + stock adjustment modal
//
// Self-HTTP eliminated: products + stock_lots prefetched directly via Supabase.
// lotCosts (weighted average cost per product) computed server-side and passed
// as initialLotCosts prop — no recalculation on the client.

export const dynamic = 'force-dynamic'

import { redirect }         from 'next/navigation'
import { createClient }     from '@/lib/supabase-server'
import { resolveCompanyId } from '@/lib/resolve-company'
import type { Product }     from '@/types'
import ProductsClient, { type LotCostEntry } from './ProductsClient'

// ── Analytics helpers (pure, tested in tests/product-analytics.test.ts) ───────

type LotRow = { product_id: string; unit_cost: number; qty_remaining: number; cost_currency: string }

function computeLotCosts(lots: LotRow[]): Record<string, LotCostEntry> {
  const raw: Record<string, { totalCost: number; totalQty: number; lotCount: number; currency: string }> = {}
  for (const lot of lots) {
    const pid = lot.product_id
    const uc  = Number(lot.unit_cost)      || 0
    const qr  = Number(lot.qty_remaining)  || 0
    if (!raw[pid]) raw[pid] = { totalCost: 0, totalQty: 0, lotCount: 0, currency: lot.cost_currency || 'TRY' }
    raw[pid].totalCost += uc * qr
    raw[pid].totalQty  += qr
    raw[pid].lotCount  += 1
  }
  const result: Record<string, LotCostEntry> = {}
  for (const [pid, c] of Object.entries(raw)) {
    result[pid] = {
      avgCost:  c.totalQty > 0 ? Math.round((c.totalCost / c.totalQty) * 100) / 100 : 0,
      lotCount: c.lotCount,
      currency: c.currency,
    }
  }
  return result
}

function lowStockCount(products: Pick<Product, 'stock_qty' | 'stock_alert_qty'>[]): number {
  return products.filter(p =>
    Number(p.stock_alert_qty) > 0 &&
    Number(p.stock_qty) <= Number(p.stock_alert_qty)
  ).length
}

function totalActiveLots(lotCosts: Record<string, LotCostEntry>): number {
  return Object.values(lotCosts).reduce((sum, e) => sum + e.lotCount, 0)
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function ProductsPage() {
  const supabase = createClient()
  let uid: string
  try {
    const { data, error } = await supabase.auth.getUser()
    if (error || !data?.user) redirect('/auth')
    uid = data.user.id
  } catch (e) {
    if (e && typeof e === 'object' && 'digest' in e) throw e
    redirect('/auth')
  }

  let companyId: string
  try { companyId = await resolveCompanyId(uid, supabase) }
  catch { redirect('/auth') }

  // ── Parallel fetch ─────────────────────────────────────────────────────────
  const [prodRes, lotRes] = await Promise.all([
    supabase
      .from('products')
      .select('*')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .order('name'),
    supabase
      .from('stock_lots')
      .select('product_id, unit_cost, qty_remaining, cost_currency')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .gt('qty_remaining', 0),
  ])

  const products = (prodRes.data ?? []) as Product[]
  const lots     = (lotRes.data  ?? []) as LotRow[]

  // ── Server-side analytics ──────────────────────────────────────────────────
  const lotCosts   = computeLotCosts(lots)
  const lowStock   = lowStockCount(products)
  const activeLots = totalActiveLots(lotCosts)

  // Top 5 products by total stock value (avgCost × stock_qty)
  const topByValue = products
    .map(p => ({
      name:  p.name,
      value: (lotCosts[p.id]?.avgCost ?? 0) * (Number(p.stock_qty) || 0),
      unit:  p.unit,
    }))
    .filter(p => p.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 5)

  const maxValue = topByValue[0]?.value ?? 1

  return (
    <div className="max-w-4xl space-y-6">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-xl font-black text-gray-900 tracking-tight">Ürünler</h1>
        <p className="text-xs text-gray-400 mt-0.5">
          Ürün kataloğu ve stok yönetimi · {products.length} ürün
        </p>
      </div>

      {/* ── Zone 1: KPI Strip ────────────────────────────────────────────── */}
      {products.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-0 bg-white border border-gray-200 rounded-xl overflow-hidden">
          {[
            {
              label: 'Toplam Ürün',
              value: String(products.length),
              sub:   'aktif katalog',
              color: 'text-gray-900',
            },
            {
              label: 'Düşük Stok',
              value: lowStock > 0 ? String(lowStock) : '—',
              sub:   lowStock > 0 ? 'uyarı seviyesinde' : 'stok yeterli ✓',
              color: lowStock > 0 ? 'text-amber-600' : 'text-emerald-600',
            },
            {
              label: 'Aktif Lot',
              value: activeLots > 0 ? String(activeLots) : '—',
              sub:   'stok loları',
              color: activeLots > 0 ? 'text-blue-700' : 'text-gray-400',
            },
            {
              label: 'Lot Olan Ürün',
              value: Object.keys(lotCosts).length > 0 ? String(Object.keys(lotCosts).length) : '—',
              sub:   'FIFO maliyet aktif',
              color: 'text-gray-700',
            },
          ].map((card, i) => (
            <div key={card.label}
              className={`p-3 ${i < 3 ? 'border-b sm:border-b-0 sm:border-r border-gray-100' : ''}`}>
              <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">{card.label}</div>
              <div className={`text-xl font-black tabular-nums leading-none ${card.color}`}>{card.value}</div>
              <div className="text-[10px] text-gray-400 mt-1">{card.sub}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── Zone 2: Top products by stock value (server-rendered) ────────── */}
      {topByValue.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">
            Stok Değeri — İlk 5 Ürün
          </div>
          <div className="space-y-2">
            {topByValue.map(item => {
              const pct = Math.round((item.value / maxValue) * 100)
              return (
                <div key={item.name}>
                  <div className="flex justify-between items-center mb-0.5">
                    <span className="text-xs text-gray-600 truncate max-w-[60%]">{item.name}</span>
                    <span className="text-xs font-semibold tabular-nums text-gray-700">
                      {new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(item.value)}
                    </span>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary-400 rounded-full transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Client island: CRUD + stock adjustment ────────────────────────── */}
      <ProductsClient
        initialProducts={products}
        initialLotCosts={lotCosts}
      />

    </div>
  )
}
