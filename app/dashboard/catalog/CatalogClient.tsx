'use client'

// ── CatalogClient — interactive catalog table with cost + margin analysis ─────
// Receives prefetched products + real costs as props — no loading spinner.
// Client-side: FX rates (lightweight mount fetch), lots on demand, inline edit,
// cost calculator modal, search, currency toggle.

import { useCallback, useEffect, useMemo, useState, type KeyboardEvent } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { CURRENCIES, type Currency, type Product, type StockLot } from '@/types'
import { getSalePrice } from '@/lib/product-adapter'
import { resolveCompanyId } from '@/lib/resolve-company'
import { fmtNum as fmt, fmtDate } from '@/lib/format'

// ── Pure helpers (tested in tests/catalog-analytics.test.ts) ─────────────────

export function marginColor(margin: number): string {
  if (margin < 10)  return 'text-neg'
  if (margin < 25)  return 'text-warn-text'
  if (margin < 50)  return 'text-pos-text'
  return 'text-pos-text'
}

export function marginBg(margin: number): string {
  if (margin < 10)  return 'bg-neg-light'
  if (margin < 25)  return 'bg-warn-light'
  if (margin < 50)  return 'bg-pos-light'
  return 'bg-pos-light'
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

  const router = useRouter()

  // ── Inline edit state ─────────────────────────────────────────────────────
  const [editingId,    setEditingId]    = useState<string | null>(null)
  const [editingValue, setEditingValue] = useState('')
  const [savingPrice,  setSavingPrice]  = useState(false)

  // ── New-product modal state ───────────────────────────────────────────────
  const [showCreate, setShowCreate] = useState(false)
  const [creating,   setCreating]   = useState(false)
  const [createErr,  setCreateErr]  = useState('')
  const [np, setNp] = useState({ name: '', unit: 'adet', category: '', catalog_price: '', unit_cost: '', stock_qty: '', stock_alert_qty: '' })

  // Task-first: open the new-product modal immediately when reached via ?new=1
  const searchParams = useSearchParams()
  useEffect(() => { if (searchParams.get('new') === '1') setShowCreate(true) }, [searchParams])

  function resetNp() { setNp({ name: '', unit: 'adet', category: '', catalog_price: '', unit_cost: '', stock_qty: '', stock_alert_qty: '' }); setCreateErr('') }

  async function createProduct() {
    const name = np.name.trim()
    if (!name) { setCreateErr('Ürün adı zorunludur.'); return }
    setCreating(true); setCreateErr('')
    try {
      const res = await fetch('/api/products', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          unit:            np.unit.trim() || 'adet',
          category:        np.category.trim() || undefined,
          catalog_price:   parseFloat(np.catalog_price) || 0,
          unit_cost:       parseFloat(np.unit_cost) || 0,
          stock_qty:       parseFloat(np.stock_qty) || 0,
          stock_alert_qty: parseFloat(np.stock_alert_qty) || 0,
          is_active:       true,   // catalog list filters .eq('is_active', true)
        }),
      })
      if (!res.ok) { setCreateErr((await res.json().catch(() => ({})))?.error || 'Ürün oluşturulamadı.'); setCreating(false); return }
      setShowCreate(false); resetNp(); setCreating(false)
      router.refresh()   // re-fetch the server-rendered product list
    } catch {
      setCreateErr('Ürün oluşturulamadı.'); setCreating(false)
    }
  }

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
          <p className="text-sm text-[#64748b] mt-0.5">
            {filtered.length} / {products.length} ürün
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Currency selector */}
          <div className="flex items-center gap-1 bg-white border border-[#e8eaef] rounded-xl shadow-soft px-1 py-1">
            {CURRENCIES.map(c => (
              <button
                key={c}
                onClick={() => setCurrency(c)}
                className={`px-3 py-1.5 rounded text-xs font-semibold transition-colors ${
                  currency === c ? 'bg-brand-light text-white' : 'text-[#64748b] hover:bg-[#f1f5f9]'
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
            className="border border-[#e8eaef] rounded px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 w-56"
          />

          {/* New product */}
          <button
            onClick={() => { resetNp(); setShowCreate(true) }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-brand text-white text-sm font-semibold hover:bg-brand-light transition-colors whitespace-nowrap">
            + Yeni Ürün
          </button>
        </div>
      </div>

      {/* ── New product modal ────────────────────────────────────────── */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4" onClick={() => !creating && setShowCreate(false)}>
          <div className="bg-white rounded-2xl shadow-soft-lg w-full max-w-md p-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-[#0f172a]">Yeni Ürün</h3>
              <button onClick={() => !creating && setShowCreate(false)} className="text-[#94a3b8] hover:text-[#334155] text-xl leading-none">×</button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-[11px] font-semibold text-[#64748b]">Ürün Adı *</label>
                <input autoFocus value={np.name} onChange={e => setNp({ ...np, name: e.target.value })}
                  onKeyDown={e => { if (e.key === 'Enter') createProduct() }}
                  className="mt-1 w-full border border-[#e8eaef] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30" placeholder="örn. Danışmanlık Hizmeti" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-semibold text-[#64748b]">Birim</label>
                  <input value={np.unit} onChange={e => setNp({ ...np, unit: e.target.value })}
                    className="mt-1 w-full border border-[#e8eaef] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30" placeholder="adet" />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-[#64748b]">Kategori</label>
                  <input value={np.category} onChange={e => setNp({ ...np, category: e.target.value })}
                    className="mt-1 w-full border border-[#e8eaef] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30" placeholder="opsiyonel" />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-[#64748b]">Satış Fiyatı (₺)</label>
                  <input type="number" min="0" value={np.catalog_price} onChange={e => setNp({ ...np, catalog_price: e.target.value })}
                    className="mt-1 w-full border border-[#e8eaef] rounded-lg px-3 py-2 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-brand/30" placeholder="0" />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-[#64748b]">Birim Maliyet (₺)</label>
                  <input type="number" min="0" value={np.unit_cost} onChange={e => setNp({ ...np, unit_cost: e.target.value })}
                    className="mt-1 w-full border border-[#e8eaef] rounded-lg px-3 py-2 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-brand/30" placeholder="0" />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-[#64748b]">Başlangıç Stok</label>
                  <input type="number" min="0" value={np.stock_qty} onChange={e => setNp({ ...np, stock_qty: e.target.value })}
                    className="mt-1 w-full border border-[#e8eaef] rounded-lg px-3 py-2 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-brand/30" placeholder="0" />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-[#64748b]">Kritik Stok Eşiği</label>
                  <input type="number" min="0" value={np.stock_alert_qty} onChange={e => setNp({ ...np, stock_alert_qty: e.target.value })}
                    className="mt-1 w-full border border-[#e8eaef] rounded-lg px-3 py-2 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-brand/30" placeholder="0" />
                </div>
              </div>
              {createErr && <div className="text-xs text-neg font-medium">{createErr}</div>}
            </div>
            <div className="flex items-center justify-end gap-2 mt-5">
              <button onClick={() => !creating && setShowCreate(false)} className="px-3.5 py-2 rounded-lg text-sm font-semibold text-[#64748b] hover:bg-[#f1f5f9] transition-colors">İptal</button>
              <button onClick={createProduct} disabled={creating}
                className="px-4 py-2 rounded-lg bg-brand text-white text-sm font-semibold hover:bg-brand-light transition-colors disabled:opacity-50">
                {creating ? 'Kaydediliyor…' : 'Ürünü Oluştur'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Catalog Intelligence Alerts ──────────────────────────────── */}
      {(catalogInsights.negativeMarginCount > 0 || catalogInsights.lowMarginCount > 0 || catalogInsights.highestMargin.margin > -Infinity) && (
        <div className="flex flex-wrap gap-2 mb-5">
          {catalogInsights.highestMargin.margin > -Infinity && (
            <div className="bg-pos-light border border-pos-light rounded px-3 py-2 text-xs font-semibold text-pos-text">
              En yüksek marj: {catalogInsights.highestMargin.name} (%{catalogInsights.highestMargin.margin.toFixed(0)})
            </div>
          )}
          {catalogInsights.lowMarginCount > 0 && (
            <div className="bg-warn-light border border-warn-light rounded px-3 py-2 text-xs font-semibold text-warn-text">
              {catalogInsights.lowMarginCount} üründe düşük marj (&lt;%10)
            </div>
          )}
          {catalogInsights.negativeMarginCount > 0 && (
            <div className="bg-neg-light border border-neg-light rounded px-3 py-2 text-xs font-semibold text-neg-text">
              {catalogInsights.negativeMarginCount} üründe negatif marj
            </div>
          )}
        </div>
      )}

      {/* ── Table ────────────────────────────────────────────────────── */}
      <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft overflow-hidden">
        {filtered.length === 0 ? (
          <div className="py-12 flex flex-col items-center justify-center gap-3 text-center">
            <div className="text-3xl opacity-50">📦</div>
            <div className="text-sm text-[#64748b]">
              {products.length === 0 ? 'Henüz ürün eklenmedi.' : 'Aramayla eşleşen ürün bulunamadı.'}
            </div>
            {products.length === 0 && (
              <button
                onClick={() => { resetNp(); setShowCreate(true) }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-brand text-white text-xs font-semibold hover:bg-brand-light transition-colors">
                + İlk ürününü ekle
              </button>
            )}
          </div>
        ) : (
          <>
            {/* Column headers */}
            <div className="grid grid-cols-12 text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] px-5 py-3 border-b border-[#e8eaef]">
              <div className="col-span-3">Ürün</div>
              <div className="col-span-1 text-right">Stok</div>
              <div className="col-span-2 text-right">Gerçek Maliyet</div>
              <div className="col-span-2 text-right">Katalog Fiyat</div>
              <div className="col-span-2 text-right">Kâr</div>
              <div className="col-span-2 text-right">Marj %</div>
            </div>

            {/* Rows */}
            <div className="divide-y divide-[#f1f5f9]">
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
                      className="grid grid-cols-12 items-center px-5 py-3.5 hover:bg-[#f8fafc]/60 transition-colors cursor-pointer"
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
                                className="text-xs text-[#cbd5e1] hover:text-brand-light hover:bg-brand-subtle px-1.5 py-0.5 rounded transition-colors flex-shrink-0"
                                title="Maliyet Hesapla"
                              >
                                &#9998;
                              </button>
                            </div>
                            {p.sku && <div className="text-xs text-[#94a3b8] mt-0.5">SKU: {p.sku}</div>}
                          </div>
                        </div>
                      </div>

                      {/* Stok */}
                      <div className="col-span-1 text-right text-sm tabular-nums font-medium text-[#334155]">
                        {Number(p.stock_qty).toFixed(0)}
                      </div>

                      {/* Gerçek Maliyet */}
                      <div className="col-span-2 text-right text-sm tabular-nums">
                        {isRcNull ? (
                          <span className="text-[#cbd5e1] text-xs">—</span>
                        ) : !canConvert ? (
                          <span className="text-xs text-warn-text">Kur yok</span>
                        ) : (
                          <span className="text-[#334155]">{SYM}{fmt(realCost)}</span>
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
                            className="w-28 ml-auto text-right border border-[#e8eaef] rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
                          />
                        ) : (
                          <button
                            onClick={() => startEdit(p)}
                            className="text-brand-light hover:text-brand hover:bg-brand-subtle px-2 py-1 rounded transition-colors font-medium"
                            title="Düzenlemek için tıklayın"
                          >
                            {catalogPrice > 0 ? (
                              <>{SYM}{fmt(catalogPrice)}</>
                            ) : (
                              <span className="text-[#94a3b8] text-xs">Fiyat girin</span>
                            )}
                          </button>
                        )}
                      </div>

                      {/* Kâr */}
                      <div className="col-span-2 text-right text-sm tabular-nums font-medium">
                        {isRcNull || catalogPrice === 0 ? (
                          <span className="text-[#cbd5e1]">&mdash;</span>
                        ) : (
                          <span className={profit >= 0 ? 'text-pos-text' : 'text-neg'}>
                            {profit >= 0 ? '+' : '-'}{SYM}{fmt(Math.abs(profit))}
                          </span>
                        )}
                      </div>

                      {/* Marj % */}
                      <div className="col-span-2 text-right">
                        {isRcNull || catalogPrice === 0 ? (
                          <span className="text-[#cbd5e1] text-sm">&mdash;</span>
                        ) : (
                          <div className="flex flex-col items-end gap-0.5">
                            <span className={`inline-flex items-center px-2.5 py-1 rounded text-xs font-bold tabular-nums ${marginColor(margin)} ${marginBg(margin)}`}>
                              %{margin.toFixed(1)}
                            </span>
                            {margin < 0 && <span className="text-[10px] text-neg font-medium">Fiyat artır</span>}
                            {margin >= 0 && margin < 10 && <span className="text-[10px] text-warn font-medium">Marj düşük</span>}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* ── Expanded: stock lots ─────────────────────────── */}
                    {isExpanded && (
                      <div className="bg-[#f8fafc] px-5 py-4 border-t border-[#e8eaef]">
                        <h4 className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-3">Stok Lotları</h4>

                        {!productLots || productLots.loading ? (
                          <div className="flex items-center gap-2 text-sm text-[#94a3b8] py-2">
                            <span className="w-4 h-4 border-2 border-[#e8eaef] border-t-transparent rounded-full animate-spin" />
                            Yükleniyor...
                          </div>
                        ) : productLots.lots.length === 0 ? (
                          <p className="text-sm text-[#94a3b8] py-2">Bu ürün için stok lotu bulunamadı.</p>
                        ) : (
                          <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft overflow-hidden">
                            <div className="grid text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] px-4 py-2 border-b border-[#e8eaef]" style={{ gridTemplateColumns: 'repeat(14, minmax(0, 1fr))' }}>
                              <div className="col-span-2">Giriş Tarihi</div>
                              <div className="col-span-2 text-right">Kalan Adet</div>
                              <div className="col-span-2 text-right">Birim Maliyet</div>
                              <div className="col-span-2 text-center">Döviz</div>
                              <div className="col-span-2 text-right">Kur</div>
                              <div className="col-span-2 text-right">Maliyet (TRY)</div>
                              <div className="col-span-2 text-right">Lot Değeri</div>
                            </div>
                            <div className="divide-y divide-[#f1f5f9]">
                              {productLots.lots.map(lot => {
                                const unitCost   = Number(lot.cost_price ?? lot.unit_cost ?? 0)
                                const fxRate     = Number(lot.cost_fx_rate ?? lot.fx_rate_at_entry ?? 1) || 1
                                const lotCostTry = lot.cost_price_try != null && Number(lot.cost_price_try) > 0
                                  ? Number(lot.cost_price_try)
                                  : unitCost * fxRate
                                const lotValue   = lotCostTry * Number(lot.qty_remaining)
                                return (
                                  <div key={lot.id} className="items-center px-4 py-2.5 text-sm grid" style={{ gridTemplateColumns: 'repeat(14, minmax(0, 1fr))' }}>
                                    <div className="col-span-2 text-[#64748b]">{fmtDate(lot.received_at ?? lot.entry_date ?? '')}</div>
                                    <div className="col-span-2 text-right tabular-nums font-medium text-[#1e293b]">{Number(lot.qty_remaining).toFixed(2)}</div>
                                    <div className="col-span-2 text-right tabular-nums text-[#334155]">{currencySym(lot.cost_currency ?? 'TRY')}{fmt(unitCost)}</div>
                                    <div className="col-span-2 text-center text-[#64748b]">{lot.cost_currency ?? 'TRY'}</div>
                                    <div className="col-span-2 text-right tabular-nums text-[#64748b]">{fxRate.toFixed(4)}</div>
                                    <div className="col-span-2 text-right tabular-nums font-medium text-[#1e293b]">₺{fmt(lotCostTry)}</div>
                                    <div className="col-span-2 text-right tabular-nums font-bold text-brand">₺{fmt(lotValue)}</div>
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
              <div className="grid grid-cols-12 items-center px-5 py-4 bg-[#0f172a] text-white rounded-b-2xl -mt-1">
                <div className="col-span-3 text-sm font-bold">
                  PORTFÖY TOPLAMI
                  <span className="text-xs text-[#94a3b8] ml-2 font-normal">({portfolioTotals.productsCounted} ürün)</span>
                </div>
                <div className="col-span-1" />
                <div className="col-span-2 text-right text-sm tabular-nums font-semibold">{SYM}{fmt(portfolioTotals.totalCost)}</div>
                <div className="col-span-2 text-right text-sm tabular-nums font-semibold">{SYM}{fmt(portfolioTotals.totalRevenue)}</div>
                <div className="col-span-2 text-right text-sm tabular-nums font-bold">
                  <span className={portfolioTotals.totalProfit >= 0 ? 'text-pos' : 'text-neg'}>
                    {SYM}{fmt(portfolioTotals.totalProfit)}
                  </span>
                </div>
                <div className="col-span-2 text-right text-sm tabular-nums font-bold">
                  <span className={`px-2 py-0.5 rounded text-xs ${
                    portfolioTotals.avgMargin < 10  ? 'bg-neg-light/20 text-neg/70'
                  : portfolioTotals.avgMargin < 25  ? 'bg-warn-light/20 text-warn/70'
                  :                                   'bg-pos-light/20 text-pos/70'
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
          <div className="bg-white rounded border border-[#e8eaef] shadow-sm w-full max-w-lg">
            <div className="flex items-center justify-between px-6 py-5 border-b border-[#e8eaef]">
              <div>
                <h2 className="font-black text-lg">Maliyet Hesapla</h2>
                <p className="text-sm text-[#64748b] mt-0.5">{products.find(p => p.id === costCalcId)?.name ?? ''}</p>
              </div>
              <button
                onClick={() => setCostCalcId(null)}
                className="w-8 h-8 flex items-center justify-center rounded hover:bg-[#f1f5f9] text-xl text-[#94a3b8] hover:text-[#334155]"
              >
                x
              </button>
            </div>

            <div className="px-6 py-5 space-y-3 max-h-[60vh] overflow-y-auto">
              {costLoadingEntries ? (
                <div className="text-center py-6 text-sm text-[#94a3b8]">Yükleniyor...</div>
              ) : (
                <>
                  <div>
                    <label className="block text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-1.5">Adet</label>
                    <input
                      type="number" min="1" step="1"
                      className="w-full border border-[#e8eaef] rounded px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
                      value={costCalcQty}
                      onChange={e => setCostCalcQty(e.target.value)}
                    />
                  </div>
                  <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Maliyet Kalemleri</div>
                  {costRows.map((row, i) => (
                    <div key={i} className="space-y-1.5 p-3 bg-[#f8fafc] rounded">
                      <div className="flex items-center gap-2">
                        <input
                          className="flex-1 border border-[#e8eaef] rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 bg-white"
                          value={row.label}
                          onChange={e => setCostRows(rs => rs.map((r, j) => j === i ? { ...r, label: e.target.value } : r))}
                          placeholder="Kalem adı"
                        />
                        {costRows.length > 1 && (
                          <button
                            onClick={() => setCostRows(rs => rs.filter((_, j) => j !== i))}
                            className="text-[#cbd5e1] hover:text-neg text-lg flex-shrink-0"
                          >x</button>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="number" min="0" step="0.01"
                          className="flex-1 border border-[#e8eaef] rounded px-3 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-brand/30 bg-white"
                          value={row.amount}
                          onChange={e => setCostRows(rs => rs.map((r, j) => j === i ? { ...r, amount: e.target.value } : r))}
                          placeholder="0.00"
                        />
                        <select
                          className="border border-[#e8eaef] rounded px-2 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand/30"
                          value={row.currency}
                          onChange={e => setCostRows(rs => rs.map((r, j) => j === i ? { ...r, currency: e.target.value as Currency } : r))}
                        >
                          {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                        <input
                          type="date"
                          className="border border-[#e8eaef] rounded px-2 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand/30"
                          value={row.entry_date}
                          onChange={e => setCostRows(rs => rs.map((r, j) => j === i ? { ...r, entry_date: e.target.value } : r))}
                        />
                      </div>
                    </div>
                  ))}
                  <button
                    onClick={() => setCostRows(rs => [...rs, { label: '', amount: '', currency: 'TRY' as Currency, entry_date: new Date().toISOString().slice(0, 10) }])}
                    className="text-xs text-brand-light hover:text-brand font-semibold"
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
                <div className="px-6 py-5 border-t border-[#e8eaef] bg-[#f8fafc] rounded-b-2xl space-y-4">
                  <div className="grid grid-cols-2 gap-4 text-center">
                    <div>
                      <div className="text-xs text-[#94a3b8] font-semibold uppercase mb-1">Toplam Maliyet</div>
                      <div className="text-xl font-black tabular-nums text-[#0f172a]">₺{fmt(totalCost)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-[#94a3b8] font-semibold uppercase mb-1">Birim Maliyet</div>
                      <div className="text-xl font-black tabular-nums text-brand">₺{fmt(unitCost)}</div>
                    </div>
                  </div>
                  <button
                    onClick={saveCostEntries}
                    disabled={costSaving}
                    className="w-full py-2.5 bg-brand-light text-white text-sm font-bold rounded hover:bg-brand transition-colors disabled:opacity-50"
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
