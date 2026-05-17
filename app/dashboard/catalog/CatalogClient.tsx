'use client'

// ── CatalogClient — interactive catalog table with cost + margin analysis ─────
// Receives prefetched products + real costs as props — no loading spinner.
// Client-side: FX rates (lightweight mount fetch), lots on demand, inline edit,
// cost calculator modal, search, currency toggle.

import { useCallback, useEffect, useMemo, useState, type KeyboardEvent } from 'react'
import { CURRENCIES, type Currency, type Product, type StockLot } from '@/types'
import { getSalePrice } from '@/lib/product-adapter'
import { resolveCompanyId } from '@/lib/resolve-company'
import { fmtNum as fmt, fmtDate } from '@/lib/format'

// ── Pure helpers (tested in tests/catalog-analytics.test.ts) ─────────────────

export function marginColor(margin: number): string {
  if (margin < 10)  return 'text-red-600'
  if (margin < 25)  return 'text-amber-600'
  if (margin < 50)  return 'text-green-600'
  return 'text-emerald-700'
}

export function marginBg(margin: number): string {
  if (margin < 10)  return 'bg-red-50'
  if (margin < 25)  return 'bg-amber-50'
  if (margin < 50)  return 'bg-green-50'
  return 'bg-emerald-50'
}

export function currencySym(c: string): string {
  return c === 'USD' ? '$' : c === 'EUR' ? '€' : '₺'
}

export function computeMargin(catalogPrice: number, realCost: number): number {
  if (catalogPrice <= 0) return 0
  return ((catalogPrice - realCost) / catalogPrice) * 100
}

export function toDisplayCurrency(
  tryAmount:  number,
  currency:   string,
  fxRates:    { USD: number; EUR: number }
): number {
  if (currency === 'TRY') return tryAmount
  const rate = currency === 'USD' ? fxRates.USD : fxRates.EUR
  return rate > 0 ? tryAmount / rate : 0
}

// ── Entry type map ────────────────────────────────────────────────────────────

const ENTRY_TYPE_MAP: Record<string, string> = {
  'Satın Alma': 'purchase', 'Gümrük': 'customs', 'Vergi': 'tax', 'Nakliye': 'shipping',
}

// ── Local types ───────────────────────────────────────────────────────────────

interface LotsMap {
  [productId: string]: { loading: boolean; lots: StockLot[] }
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  initialProducts:  Product[]
  initialRealCosts: Record<string, number | null>   // productId → real cost in TRY (null = not available)
  userId:           string
  companyId:        string
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function CatalogClient({ initialProducts, initialRealCosts, userId, companyId }: Props) {
  const [products,    setProducts]    = useState<Product[]>(initialProducts)
  const [search,      setSearch]      = useState('')
  const [currency,    setCurrency]    = useState<Currency>('TRY')
  const [realCosts,   setRealCosts]   = useState<Record<string, number | null>>(initialRealCosts)
  const [rcLoading,   setRcLoading]   = useState(false)   // true only on explicit refresh
  const [expandedId,  setExpandedId]  = useState<string | null>(null)
  const [lots,        setLots]        = useState<LotsMap>({})

  // FX rates — fetched client-side (lightweight, external source)
  const [fxRates, setFxRates] = useState<{ USD: number; EUR: number }>({ USD: 0, EUR: 0 })

  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/fx', { cache: 'no-store', signal: controller.signal })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.USD > 0 && d?.EUR > 0) setFxRates({ USD: Number(d.USD), EUR: Number(d.EUR) }) })
      .catch(() => { /* FX failure is non-fatal — includes AbortError */ })
    return () => controller.abort()
  }, [])

  const conv = useCallback(
    (tryAmount: number) => toDisplayCurrency(tryAmount, currency, fxRates),
    [currency, fxRates]
  )

  const canConvert: boolean = currency === 'TRY' || (currency === 'USD' ? fxRates.USD > 0 : fxRates.EUR > 0)
  const SYM = currencySym(currency)

  // ── Inline edit state ─────────────────────────────────────────────────────
  const [editingId,    setEditingId]    = useState<string | null>(null)
  const [editingValue, setEditingValue] = useState('')
  const [savingPrice,  setSavingPrice]  = useState(false)

  // ── Cost calculator modal state ───────────────────────────────────────────
  const [costCalcId,         setCostCalcId]         = useState<string | null>(null)
  const [costCalcQty,        setCostCalcQty]        = useState('1')
  const [costSaving,         setCostSaving]         = useState(false)
  const [costLoadingEntries, setCostLoadingEntries] = useState(false)
  const [costRows, setCostRows] = useState<Array<{
    label: string; amount: string; currency: Currency; entry_date: string
  }>>([])

  // ── Filtered products ─────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    if (!search.trim()) return products
    const q = search.toLowerCase()
    return products.filter(p =>
      p.name.toLowerCase().includes(q) ||
      (p.sku && p.sku.toLowerCase().includes(q))
    )
  }, [products, search])

  // ── Catalog intelligence ──────────────────────────────────────────────────
  const catalogInsights = useMemo(() => {
    let highestMargin = { name: '', margin: -Infinity }
    let lowMarginCount = 0
    let negativeMarginCount = 0

    for (const p of products) {
      const cost  = realCosts[p.id]
      if (cost == null) continue
      const price = getSalePrice(p) ?? 0
      if (price <= 0) continue
      const margin = computeMargin(price, cost)
      if (margin > highestMargin.margin) highestMargin = { name: p.name, margin }
      if (margin < 10  && margin >= 0) lowMarginCount++
      if (margin < 0) negativeMarginCount++
    }

    return { highestMargin, lowMarginCount, negativeMarginCount }
  }, [products, realCosts])

  // ── Portfolio totals ──────────────────────────────────────────────────────
  const portfolioTotals = useMemo(() => {
    let totalCostTry    = 0
    let totalRevenueTry = 0
    let productsCounted = 0

    for (const p of filtered) {
      const cost = realCosts[p.id]
      if (cost == null) continue
      const qty = Number(p.stock_qty) || 0
      if (qty <= 0) continue
      const catalogPrice = getSalePrice(p) ?? 0
      totalCostTry    += cost * qty
      totalRevenueTry += catalogPrice * qty
      productsCounted++
    }

    const totalCost    = conv(totalCostTry)
    const totalRevenue = conv(totalRevenueTry)
    const totalProfit  = totalRevenue - totalCost
    const avgMargin    = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0

    return { totalCost, totalRevenue, totalProfit, avgMargin, productsCounted }
  }, [filtered, realCosts, conv])

  // ── Expand row → load lots on demand ────────────────────────────────────
  async function toggleExpand(productId: string) {
    if (expandedId === productId) { setExpandedId(null); return }
    setExpandedId(productId)
    if (lots[productId]) return

    setLots(prev => ({ ...prev, [productId]: { loading: true, lots: [] } }))
    try {
      const res  = await fetch(`/api/products/lots?product_id=${encodeURIComponent(productId)}`)
      const json = res.ok ? await res.json() : { lots: [] }
      setLots(prev => ({
        ...prev,
        [productId]: { loading: false, lots: (json.lots ?? []) as StockLot[] },
      }))
    } catch {
      setLots(prev => ({ ...prev, [productId]: { loading: false, lots: [] } }))
    }
  }

  // ── Inline edit catalog_price ─────────────────────────────────────────────
  function startEdit(p: Product) {
    setEditingId(p.id)
    setEditingValue(String(getSalePrice(p) ?? ''))
  }

  async function savePrice(productId: string) {
    const price = parseFloat(editingValue)
    if (!isFinite(price) || price < 0) { setEditingId(null); return }

    setSavingPrice(true)
    const res = await fetch('/api/products', {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ id: productId, catalog_price: price }),
    })

    if (res.ok) {
      setProducts(prev => prev.map(p => p.id === productId ? { ...p, catalog_price: price } : p))
    }
    setSavingPrice(false)
    setEditingId(null)
  }

  function handlePriceKeyDown(e: KeyboardEvent, productId: string) {
    if (e.key === 'Enter') { e.preventDefault(); savePrice(productId) }
    if (e.key === 'Escape') setEditingId(null)
  }

  // ── Cost calculator ────────────────────────────────────────────────────────
  const openCostCalc = useCallback(async (productId: string) => {
    const today = new Date().toISOString().slice(0, 10)
    const emptyRows = [
      { label: 'Satın Alma', amount: '', currency: 'TRY' as Currency, entry_date: today },
      { label: 'Gümrük',     amount: '', currency: 'TRY' as Currency, entry_date: today },
      { label: 'Vergi',      amount: '', currency: 'TRY' as Currency, entry_date: today },
      { label: 'Nakliye',    amount: '', currency: 'TRY' as Currency, entry_date: today },
    ]
    setCostCalcId(productId)
    setCostCalcQty('1')
    setCostLoadingEntries(true)
    setCostRows(emptyRows)

    try {
      const res = await fetch(`/api/cost-entries?product_id=${productId}`)
      if (res.ok) {
        const entries = await res.json()
        if (Array.isArray(entries) && entries.length > 0) {
          setCostRows(entries.map((e: { description: string; amount: number; currency: string; entry_date: string }) => ({
            label:      e.description || 'Diğer',
            amount:     String(Number(e.amount) || ''),
            currency:   (CURRENCIES.includes(e.currency as Currency) ? e.currency : 'TRY') as Currency,
            entry_date: e.entry_date || today,
          })))
        }
      }
    } catch { /* non-fatal */ }
    setCostLoadingEntries(false)
  }, [])

  const saveCostEntries = useCallback(async () => {
    if (!costCalcId || !userId) return
    setCostSaving(true)
    try {
      const entries = costRows
        .filter(r => (parseFloat(r.amount) || 0) > 0)
        .map(r => ({
          entry_type:  ENTRY_TYPE_MAP[r.label] ?? 'other',
          description: r.label,
          amount:      parseFloat(r.amount) || 0,
          currency:    r.currency,
          entry_date:  r.entry_date,
        }))

      if (entries.length > 0) {
        await fetch('/api/cost-entries', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ product_id: costCalcId, entries, replace_existing: true }),
        })
      }
      setCostCalcId(null)
    } catch { /* non-fatal */ }
    setCostSaving(false)
  }, [costCalcId, userId, costRows])

  // Suppress unused warning — userId is needed for saveCostEntries guard
  void rcLoading
  void setRcLoading
  void resolveCompanyId

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-6xl">
      {/* ── Header ──────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-black">Katalog</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {filtered.length} / {products.length} ürün
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Currency selector */}
          <div className="flex items-center gap-1 bg-white border border-gray-100 rounded-xl px-1 py-1">
            {CURRENCIES.map(c => (
              <button
                key={c}
                onClick={() => setCurrency(c)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  currency === c ? 'bg-primary-600 text-white' : 'text-gray-500 hover:bg-gray-100'
                }`}
              >
                {c}
              </button>
            ))}
          </div>

          {/* Search */}
          <input
            type="text"
            placeholder="Ürün ara..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="border border-gray-200 rounded-xl px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400 w-56"
          />
        </div>
      </div>

      {/* ── Catalog Intelligence Alerts ──────────────────────────────── */}
      {(catalogInsights.negativeMarginCount > 0 || catalogInsights.lowMarginCount > 0 || catalogInsights.highestMargin.margin > -Infinity) && (
        <div className="flex flex-wrap gap-2 mb-5">
          {catalogInsights.highestMargin.margin > -Infinity && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2 text-xs font-semibold text-emerald-700">
              En yüksek marj: {catalogInsights.highestMargin.name} (%{catalogInsights.highestMargin.margin.toFixed(0)})
            </div>
          )}
          {catalogInsights.lowMarginCount > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-xs font-semibold text-amber-700">
              {catalogInsights.lowMarginCount} üründe düşük marj (&lt;%10)
            </div>
          )}
          {catalogInsights.negativeMarginCount > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-xs font-semibold text-red-700">
              {catalogInsights.negativeMarginCount} üründe negatif marj
            </div>
          )}
        </div>
      )}

      {/* ── Table ────────────────────────────────────────────────────── */}
      <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
        {filtered.length === 0 ? (
          <div className="py-16 text-center">
            <div className="text-4xl mb-3">{products.length === 0 ? '📦' : '🔍'}</div>
            <div className="text-sm font-semibold text-gray-600 mb-1">
              {products.length === 0 ? 'Henüz ürün eklenmedi.' : 'Aramayla eşleşen ürün bulunamadı.'}
            </div>
            {products.length === 0 && <p className="text-xs text-gray-400">Katalog oluşturmak için ürün ekleyin.</p>}
          </div>
        ) : (
          <>
            {/* Column headers */}
            <div className="grid grid-cols-12 text-[10px] font-bold text-gray-400 uppercase tracking-widest px-5 py-3 border-b border-gray-100">
              <div className="col-span-3">Ürün</div>
              <div className="col-span-1 text-right">Stok</div>
              <div className="col-span-2 text-right">Gerçek Maliyet</div>
              <div className="col-span-2 text-right">Katalog Fiyat</div>
              <div className="col-span-2 text-right">Kâr</div>
              <div className="col-span-2 text-right">Marj %</div>
            </div>

            {/* Rows */}
            <div className="divide-y divide-gray-50">
              {filtered.map(p => {
                const realCostTry   = realCosts[p.id] ?? 0
                const isRcNull      = realCosts[p.id] == null
                const catPriceTry   = getSalePrice(p) ?? 0
                const realCost      = conv(realCostTry)
                const catalogPrice  = conv(catPriceTry)
                const profit        = catalogPrice - realCost
                const margin        = computeMargin(catalogPrice, realCost)
                const isExpanded    = expandedId === p.id
                const productLots   = lots[p.id]

                return (
                  <div key={p.id}>
                    {/* Main row */}
                    <div
                      className="grid grid-cols-12 items-center px-5 py-3.5 hover:bg-gray-50/60 transition-colors cursor-pointer"
                      onClick={() => toggleExpand(p.id)}
                    >
                      {/* Ürün */}
                      <div className="col-span-3 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`text-xs transition-transform ${isExpanded ? 'rotate-90' : ''}`}>&#9654;</span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold truncate">{p.name}</span>
                              <button
                                onClick={e => {
                                  e.stopPropagation()
                                  openCostCalc(p.id)
                                  setCostCalcQty(String(Math.max(1, Math.round(Number(p.stock_qty)))))
                                }}
                                className="text-xs text-gray-300 hover:text-primary-600 hover:bg-primary-50 px-1.5 py-0.5 rounded transition-colors flex-shrink-0"
                                title="Maliyet Hesapla"
                              >
                                &#9998;
                              </button>
                            </div>
                            {p.sku && <div className="text-xs text-gray-400 mt-0.5">SKU: {p.sku}</div>}
                          </div>
                        </div>
                      </div>

                      {/* Stok */}
                      <div className="col-span-1 text-right text-sm tabular-nums font-medium text-gray-700">
                        {Number(p.stock_qty).toFixed(0)}
                      </div>

                      {/* Gerçek Maliyet */}
                      <div className="col-span-2 text-right text-sm tabular-nums">
                        {isRcNull ? (
                          <span className="text-gray-300 text-xs">—</span>
                        ) : !canConvert ? (
                          <span className="text-xs text-amber-600">Kur yok</span>
                        ) : (
                          <span className="text-gray-700">{SYM}{fmt(realCost)}</span>
                        )}
                      </div>

                      {/* Katalog Fiyat (inline edit) */}
                      <div className="col-span-2 text-right text-sm tabular-nums" onClick={e => e.stopPropagation()}>
                        {editingId === p.id ? (
                          <input
                            type="number" min="0" step="0.01" autoFocus
                            value={editingValue}
                            onChange={e => setEditingValue(e.target.value)}
                            onBlur={() => savePrice(p.id)}
                            onKeyDown={e => handlePriceKeyDown(e, p.id)}
                            disabled={savingPrice}
                            className="w-28 ml-auto text-right border border-primary-300 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
                          />
                        ) : (
                          <button
                            onClick={() => startEdit(p)}
                            className="text-primary-600 hover:text-primary-800 hover:bg-primary-50 px-2 py-1 rounded-lg transition-colors font-medium"
                            title="Düzenlemek için tıklayın"
                          >
                            {catalogPrice > 0 ? (
                              <>{SYM}{fmt(catalogPrice)}</>
                            ) : (
                              <span className="text-gray-400 text-xs">Fiyat girin</span>
                            )}
                          </button>
                        )}
                      </div>

                      {/* Kâr */}
                      <div className="col-span-2 text-right text-sm tabular-nums font-medium">
                        {isRcNull || catalogPrice === 0 ? (
                          <span className="text-gray-300">&mdash;</span>
                        ) : (
                          <span className={profit >= 0 ? 'text-green-600' : 'text-red-600'}>
                            {profit >= 0 ? '+' : '-'}{SYM}{fmt(Math.abs(profit))}
                          </span>
                        )}
                      </div>

                      {/* Marj % */}
                      <div className="col-span-2 text-right">
                        {isRcNull || catalogPrice === 0 ? (
                          <span className="text-gray-300 text-sm">&mdash;</span>
                        ) : (
                          <div className="flex flex-col items-end gap-0.5">
                            <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold tabular-nums ${marginColor(margin)} ${marginBg(margin)}`}>
                              %{margin.toFixed(1)}
                            </span>
                            {margin < 0 && <span className="text-[10px] text-red-500 font-medium">Fiyat artır</span>}
                            {margin >= 0 && margin < 10 && <span className="text-[10px] text-amber-500 font-medium">Marj düşük</span>}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* ── Expanded: stock lots ─────────────────────────── */}
                    {isExpanded && (
                      <div className="bg-gray-50 px-5 py-4 border-t border-gray-100">
                        <h4 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-3">Stok Lotları</h4>

                        {!productLots || productLots.loading ? (
                          <div className="flex items-center gap-2 text-sm text-gray-400 py-2">
                            <span className="w-4 h-4 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
                            Yükleniyor...
                          </div>
                        ) : productLots.lots.length === 0 ? (
                          <p className="text-sm text-gray-400 py-2">Bu ürün için stok lotu bulunamadı.</p>
                        ) : (
                          <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
                            <div className="grid text-[10px] font-bold text-gray-400 uppercase tracking-widest px-4 py-2 border-b border-gray-100" style={{ gridTemplateColumns: 'repeat(14, minmax(0, 1fr))' }}>
                              <div className="col-span-2">Giriş Tarihi</div>
                              <div className="col-span-2 text-right">Kalan Adet</div>
                              <div className="col-span-2 text-right">Birim Maliyet</div>
                              <div className="col-span-2 text-center">Döviz</div>
                              <div className="col-span-2 text-right">Kur</div>
                              <div className="col-span-2 text-right">Maliyet (TRY)</div>
                              <div className="col-span-2 text-right">Lot Değeri</div>
                            </div>
                            <div className="divide-y divide-gray-50">
                              {productLots.lots.map(lot => {
                                const unitCost   = Number(lot.cost_price ?? lot.unit_cost ?? 0)
                                const fxRate     = Number(lot.cost_fx_rate ?? lot.fx_rate_at_entry ?? 1) || 1
                                const lotCostTry = lot.cost_price_try != null && Number(lot.cost_price_try) > 0
                                  ? Number(lot.cost_price_try)
                                  : unitCost * fxRate
                                const lotValue   = lotCostTry * Number(lot.qty_remaining)
                                return (
                                  <div key={lot.id} className="items-center px-4 py-2.5 text-sm grid" style={{ gridTemplateColumns: 'repeat(14, minmax(0, 1fr))' }}>
                                    <div className="col-span-2 text-gray-600">{fmtDate(lot.received_at ?? lot.entry_date ?? '')}</div>
                                    <div className="col-span-2 text-right tabular-nums font-medium text-gray-800">{Number(lot.qty_remaining).toFixed(2)}</div>
                                    <div className="col-span-2 text-right tabular-nums text-gray-700">{currencySym(lot.cost_currency ?? 'TRY')}{fmt(unitCost)}</div>
                                    <div className="col-span-2 text-center text-gray-500">{lot.cost_currency ?? 'TRY'}</div>
                                    <div className="col-span-2 text-right tabular-nums text-gray-500">{fxRate.toFixed(4)}</div>
                                    <div className="col-span-2 text-right tabular-nums font-medium text-gray-800">₺{fmt(lotCostTry)}</div>
                                    <div className="col-span-2 text-right tabular-nums font-bold text-primary-700">₺{fmt(lotValue)}</div>
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* ── Portfolio Totals Row ──────────────────────────────── */}
            {portfolioTotals.productsCounted > 0 && canConvert && (
              <div className="grid grid-cols-12 items-center px-5 py-4 bg-gray-900 text-white rounded-b-2xl -mt-1">
                <div className="col-span-3 text-sm font-bold">
                  PORTFÖY TOPLAMI
                  <span className="text-xs text-gray-400 ml-2 font-normal">({portfolioTotals.productsCounted} ürün)</span>
                </div>
                <div className="col-span-1" />
                <div className="col-span-2 text-right text-sm tabular-nums font-semibold">{SYM}{fmt(portfolioTotals.totalCost)}</div>
                <div className="col-span-2 text-right text-sm tabular-nums font-semibold">{SYM}{fmt(portfolioTotals.totalRevenue)}</div>
                <div className="col-span-2 text-right text-sm tabular-nums font-bold">
                  <span className={portfolioTotals.totalProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                    {SYM}{fmt(portfolioTotals.totalProfit)}
                  </span>
                </div>
                <div className="col-span-2 text-right text-sm tabular-nums font-bold">
                  <span className={`px-2 py-0.5 rounded text-xs ${
                    portfolioTotals.avgMargin < 10  ? 'bg-red-500/20 text-red-300'
                  : portfolioTotals.avgMargin < 25  ? 'bg-amber-500/20 text-amber-300'
                  :                                   'bg-emerald-500/20 text-emerald-300'
                  }`}>
                    %{portfolioTotals.avgMargin.toFixed(1)}
                  </span>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Cost Calculator Modal ─────────────────────────────────── */}
      {costCalcId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}
          onClick={e => { if (e.target === e.currentTarget) setCostCalcId(null) }}
        >
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg">
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
              <div>
                <h2 className="font-black text-lg">Maliyet Hesapla</h2>
                <p className="text-sm text-gray-500 mt-0.5">{products.find(p => p.id === costCalcId)?.name ?? ''}</p>
              </div>
              <button
                onClick={() => setCostCalcId(null)}
                className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-xl text-gray-400 hover:text-gray-700"
              >
                x
              </button>
            </div>

            <div className="px-6 py-5 space-y-3 max-h-[60vh] overflow-y-auto">
              {costLoadingEntries ? (
                <div className="text-center py-6 text-sm text-gray-400">Yükleniyor...</div>
              ) : (
                <>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Adet</label>
                    <input
                      type="number" min="1" step="1"
                      className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
                      value={costCalcQty}
                      onChange={e => setCostCalcQty(e.target.value)}
                    />
                  </div>
                  <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Maliyet Kalemleri</div>
                  {costRows.map((row, i) => (
                    <div key={i} className="space-y-1.5 p-3 bg-gray-50 rounded-xl">
                      <div className="flex items-center gap-2">
                        <input
                          className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400 bg-white"
                          value={row.label}
                          onChange={e => setCostRows(rs => rs.map((r, j) => j === i ? { ...r, label: e.target.value } : r))}
                          placeholder="Kalem adı"
                        />
                        {costRows.length > 1 && (
                          <button
                            onClick={() => setCostRows(rs => rs.filter((_, j) => j !== i))}
                            className="text-gray-300 hover:text-red-500 text-lg flex-shrink-0"
                          >x</button>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="number" min="0" step="0.01"
                          className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-primary-400 bg-white"
                          value={row.amount}
                          onChange={e => setCostRows(rs => rs.map((r, j) => j === i ? { ...r, amount: e.target.value } : r))}
                          placeholder="0.00"
                        />
                        <select
                          className="border border-gray-200 rounded-lg px-2 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-400"
                          value={row.currency}
                          onChange={e => setCostRows(rs => rs.map((r, j) => j === i ? { ...r, currency: e.target.value as Currency } : r))}
                        >
                          {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                        <input
                          type="date"
                          className="border border-gray-200 rounded-lg px-2 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-400"
                          value={row.entry_date}
                          onChange={e => setCostRows(rs => rs.map((r, j) => j === i ? { ...r, entry_date: e.target.value } : r))}
                        />
                      </div>
                    </div>
                  ))}
                  <button
                    onClick={() => setCostRows(rs => [...rs, { label: '', amount: '', currency: 'TRY' as Currency, entry_date: new Date().toISOString().slice(0, 10) }])}
                    className="text-xs text-primary-600 hover:text-primary-800 font-semibold"
                  >
                    + Kalem Ekle
                  </button>
                </>
              )}
            </div>

            {/* Result + Save */}
            {(() => {
              const totalCost = costRows.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0)
              const qty       = parseInt(costCalcQty, 10) || 1
              const unitCost  = totalCost / qty
              return (
                <div className="px-6 py-5 border-t border-gray-100 bg-gray-50 rounded-b-2xl space-y-4">
                  <div className="grid grid-cols-2 gap-4 text-center">
                    <div>
                      <div className="text-xs text-gray-400 font-semibold uppercase mb-1">Toplam Maliyet</div>
                      <div className="text-xl font-black tabular-nums text-gray-900">₺{fmt(totalCost)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-400 font-semibold uppercase mb-1">Birim Maliyet</div>
                      <div className="text-xl font-black tabular-nums text-primary-700">₺{fmt(unitCost)}</div>
                    </div>
                  </div>
                  <button
                    onClick={saveCostEntries}
                    disabled={costSaving}
                    className="w-full py-2.5 bg-primary-600 text-white text-sm font-bold rounded-xl hover:bg-primary-700 transition-colors disabled:opacity-50"
                  >
                    {costSaving ? 'Kaydediliyor...' : 'Kaydet'}
                  </button>
                </div>
              )
            })()}
          </div>
        </div>
      )}
    </div>
  )
}
