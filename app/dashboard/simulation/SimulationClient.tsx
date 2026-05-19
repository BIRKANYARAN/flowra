'use client'

// ── SimulationClient — interactive simulation engine ──────────────────────────
//
// Receives pre-fetched data from the server component (page.tsx):
//   • initialProducts      — active product catalogue (no DB call on mount)
//   • initialPolicyRates   — TRY/USD/EUR annual rates from policy_rates table
//   • initialFxRates       — USD/EUR → TRY conversion rates
//   • userId / companyId   — already resolved server-side
//
// Remaining client-side fetches (triggered by user action, not page load):
//   • fetchRecurringProjection — /api/simulation/recurring (12-month expense plan)
//   • fetchDebtBurden          — /api/partners/debt-burden
//   • stock_lots query         — only when a product is selected (entryDate)
//   • get_real_cost RPC        — only when a product is selected
//   • partner equalization     — /api/partners/equalization (when net profit changes)

import { useCallback, useEffect, useMemo, useState } from 'react'
import { CURRENCIES, type Currency, type Product, type RecurringProjectionMonth } from '@/types'
import { round2 } from '@/lib/calc'
import { getSalePrice, getSaleCurrency, getLegacyProductCost } from '@/lib/product-adapter'
import {
  currSym, fmtC, pct, fmtMonth,
  ZERO_SIM_EQ,
  type SimEqResult, type DebtBurdenResult, type SimulationClientProps,
} from './_components/types'
import { MiniBar } from './_components/MiniBar'
import { InputPanel } from './_components/InputPanel'
import { ProjectionTable } from './_components/ProjectionTable'

export type { SimulationClientProps }

/* ── Component ──────────────────────────────────────────────────────────────── */
export default function SimulationClient({
  userId,
  companyId,
  initialProducts,
  initialPolicyRates,
  initialFxRates,
  initialPartnerCount,
}: SimulationClientProps) {
  /* data — initialized from server-side props, no loading state needed */
  const [products,     setProducts]     = useState<Product[]>(initialProducts)
  const [policyRates,  setPolicyRates]  = useState(initialPolicyRates)
  const [fxRates,      setFxRates]      = useState(initialFxRates)
  const [partnerCount, setPartnerCount] = useState(initialPartnerCount)
  const [displayCurrency, setDisplayCurrency] = useState<Currency>('TRY')

  /* Partner equalization */
  const [partnerEq, setPartnerEq] = useState<SimEqResult>(ZERO_SIM_EQ)

  /* Recurring expense projection (12 months) */
  const [recurringProjection, setRecurringProjection] = useState<RecurringProjectionMonth[]>([])
  const [recurringLoading,    setRecurringLoading]    = useState(false)

  /* Debt burden */
  const [debtBurden,        setDebtBurden]        = useState<DebtBurdenResult | null>(null)
  const [debtBurdenLoading, setDebtBurdenLoading] = useState(false)

  /* user inputs */
  const [productId,    setProductId]    = useState('')
  const [manualCost,   setManualCost]   = useState('')
  const [catalogPrice, setCatalogPrice] = useState('')
  const [monthlyQty,   setMonthlyQty]   = useState('100')
  const [discount,     setDiscount]     = useState('0')
  const [interestRate, setInterestRate] = useState(String(initialPolicyRates.TRY))
  const [saleDate,     setSaleDate]     = useState(new Date().toISOString().slice(0, 10))

  /* scenario layers */
  const [collectionDelay,  setCollectionDelay]  = useState('0')
  const [extraPartnerDebt, setExtraPartnerDebt] = useState('')

  /* ── Fetch recurring projection ──────────────────────────────────────────── */
  const fetchRecurringProjection = useCallback(async () => {
    setRecurringLoading(true)
    try {
      const res = await fetch('/api/simulation/recurring?months=12', { cache: 'no-store' })
      if (res.ok) {
        const data: RecurringProjectionMonth[] = await res.json()
        setRecurringProjection(Array.isArray(data) ? data : [])
      }
    } catch { /* non-fatal */ }
    setRecurringLoading(false)
  }, [])

  /* ── Fetch debt burden ───────────────────────────────────────────────────── */
  const fetchDebtBurden = useCallback(async () => {
    setDebtBurdenLoading(true)
    try {
      const res = await fetch('/api/partners/debt-burden', { cache: 'no-store' })
      if (res.ok) {
        const data: DebtBurdenResult = await res.json()
        setDebtBurden(data)
      }
    } catch { /* non-fatal */ }
    setDebtBurdenLoading(false)
  }, [])

  /* ── Fetch partner count (if not server-provided) ────────────────────────── */
  const fetchPartnerCount = useCallback(async () => {
    if (initialPartnerCount > 0) return // already have it from server
    try {
      const res = await fetch('/api/partners')
      if (res.ok) {
        const pData = await res.json()
        setPartnerCount(Array.isArray(pData) ? pData.length : 0)
      }
    } catch { /* non-fatal */ }
  }, [initialPartnerCount])

  /* ── Refresh FX rates from live API (fallback to server-provided values) ─── */
  const refreshFxRates = useCallback(async () => {
    if (initialFxRates.USD > 0) return // server already provided good rates
    try {
      const fxRes  = await fetch('/api/fx', { cache: 'no-store' })
      const fxData = await fxRes.json()
      if (fxRes.ok && fxData.USD > 0) {
        setFxRates({ USD: Number(fxData.USD), EUR: Number(fxData.EUR) })
      }
    } catch { /* non-fatal */ }
  }, [initialFxRates.USD])

  useEffect(() => {
    void fetchRecurringProjection()
    void fetchDebtBurden()
    void fetchPartnerCount()
    void refreshFxRates()
  }, [fetchRecurringProjection, fetchDebtBurden, fetchPartnerCount, refreshFxRates])

  /* ── Partner equalization: refetch when yearly net profit changes ─────── */
  const [eqNetProfit, setEqNetProfit] = useState(0)
  useEffect(() => {
    if (partnerCount === 0 || eqNetProfit <= 0) return
    let cancelled = false
    fetch(`/api/partners/equalization?distributable=${eqNetProfit}`)
      .then(r => r.ok ? r.json() : ZERO_SIM_EQ)
      .then((data: SimEqResult) => { if (!cancelled) setPartnerEq(data) })
      .catch(() => { /* non-fatal */ })
    return () => { cancelled = true }
  }, [eqNetProfit, partnerCount])

  /* ── Auto-fill from selected product ───────────────────────────────────── */
  const selectedProduct = useMemo(
    () => products.find(p => p.id === productId) ?? null,
    [products, productId],
  )

  const [entryDate, setEntryDate] = useState<string | null>(null)

  useEffect(() => {
    if (selectedProduct) {
      const legacyCost = getLegacyProductCost(selectedProduct)
      const salePrice  = getSalePrice(selectedProduct)
      setManualCost(legacyCost != null ? String(legacyCost) : '')
      setCatalogPrice(salePrice != null ? String(salePrice) : '')

      const cur = (getSaleCurrency(selectedProduct) ?? 'TRY') as keyof typeof policyRates
      const rateForCurrency = policyRates[cur] ?? policyRates.TRY
      setInterestRate(String(rateForCurrency))

      if (companyId) {
        const controller = new AbortController()
        ;(async () => {
          try {
            const res = await fetch(
              `/api/products/lots?product_id=${encodeURIComponent(selectedProduct.id)}&active=1&order=asc&limit=1`,
              { signal: controller.signal },
            )
            if (res.ok) {
              const json = await res.json()
              setEntryDate((json.lots?.[0] as { entry_date?: string } | undefined)?.entry_date ?? null)
            } else {
              setEntryDate(null)
            }
          } catch {
            setEntryDate(null)
          }
        })()
        return () => controller.abort()
      }
    } else {
      setEntryDate(null)
      setInterestRate(String(policyRates.TRY))
    }
  }, [selectedProduct, companyId, policyRates])

  /* ── Parsed numeric inputs ──────────────────────────────────────────────── */
  const unitCost           = parseFloat(manualCost) || 0
  const catPrice           = parseFloat(catalogPrice) || 0
  const qty                = parseInt(monthlyQty, 10) || 0
  const discountPct        = parseFloat(discount) || 0
  const annualRate         = parseFloat(interestRate) || 0
  const collectionDelayPct = Math.min(50, Math.max(0, parseFloat(collectionDelay) || 0))
  const extraDebtTRY       = parseFloat(extraPartnerDebt) || 0

  /* ── Holding time ───────────────────────────────────────────────────────── */
  const holdingDays = useMemo(() => {
    if (!entryDate) return 30
    const entry = new Date(entryDate)
    const sale  = new Date(saleDate)
    return Math.max(0, Math.round((sale.getTime() - entry.getTime()) / 86_400_000))
  }, [entryDate, saleDate])

  /* ── Core per-unit calculations ─────────────────────────────────────────── */
  const clampedDiscount = Math.min(100, Math.max(0, discountPct))
  const realCost        = round2(unitCost * (1 + annualRate / 100 * holdingDays / 365))
  const netPrice        = round2(catPrice * (1 - clampedDiscount / 100))

  /* ── Currency conversion ────────────────────────────────────────────────── */
  const toDisplay = useCallback((tryVal: number): number => {
    if (displayCurrency === 'TRY') return tryVal
    const rate = displayCurrency === 'USD' ? fxRates.USD : fxRates.EUR
    return rate > 0 ? tryVal / rate : 0
  }, [displayCurrency, fxRates])

  const S = currSym(displayCurrency)

  /* ── Backend real cost fetch ─────────────────────────────────────────────── */
  const [backendRealCost, setBackendRealCost] = useState<number | null>(null)
  useEffect(() => {
    if (!selectedProduct) { setBackendRealCost(null); return }
    const controller = new AbortController()
    ;(async () => {
      try {
        const res = await fetch(
          `/api/cost-breakdown?product_id=${encodeURIComponent(selectedProduct.id)}`,
          { signal: controller.signal },
        )
        if (res.ok) {
          const json = await res.json()
          const entries: Array<{ final_unit_cost_try: number }> = json.entries ?? []
          if (entries.length > 0) {
            // entries are ordered by entry_date DESC — first entry = most recent lot cost
            const rc = Number(entries[0].final_unit_cost_try)
            if (rc > 0) { setBackendRealCost(rc); return }
          }
        }
      } catch { /* fallback to manual cost — includes AbortError */ }
      setBackendRealCost(null)
    })()
    return () => controller.abort()
  }, [selectedProduct])

  const effectiveRealCost  = backendRealCost !== null && selectedProduct ? backendRealCost : realCost
  const effectiveProfitPU  = round2(netPrice - effectiveRealCost)
  const effectiveHoldingPU = round2(effectiveRealCost - unitCost)
  const effectiveMargin    = netPrice > 0 ? round2((effectiveProfitPU / netPrice) * 100) : 0

  /* ── Monthly projection (12 months) ────────────────────────────────────── */
  const projection = useMemo(() => {
    const recurringByMonth = new Map<string, number>()
    for (const row of recurringProjection) {
      recurringByMonth.set(row.month, row.amount_try)
    }

    const now        = new Date()
    const startYear  = now.getFullYear()
    const startMonth = now.getMonth() + 1

    let cumProfit = 0
    return Array.from({ length: 12 }, (_, i) => {
      const totalM = startYear * 12 + (startMonth - 1) + i
      const y      = Math.floor(totalM / 12)
      const m      = (totalM % 12) + 1
      const ym     = `${y}-${String(m).padStart(2, '0')}`

      const revenue     = round2(qty * netPrice)
      const cogs        = round2(qty * unitCost)
      const holding     = round2(qty * effectiveHoldingPU)
      const grossProfit = round2(qty * effectiveProfitPU)
      const expense     = recurringByMonth.get(ym) ?? 0
      const netProfit   = round2(grossProfit - expense)
      cumProfit         = round2(cumProfit + netProfit)

      return { month: i + 1, ym, revenue, cogs, holding, grossProfit, expense, netProfit, cumProfit }
    })
  }, [qty, netPrice, unitCost, effectiveHoldingPU, effectiveProfitPU, recurringProjection])

  /* ── Yearly totals ──────────────────────────────────────────────────────── */
  const yearly = useMemo(() => {
    const totalRevenue     = round2(projection.reduce((s, r) => s + r.revenue, 0))
    const totalCOGS        = round2(projection.reduce((s, r) => s + r.cogs, 0))
    const totalHolding     = round2(projection.reduce((s, r) => s + r.holding, 0))
    const totalGrossProfit = round2(projection.reduce((s, r) => s + r.grossProfit, 0))
    const yearlyExpenses   = round2(projection.reduce((s, r) => s + r.expense, 0))
    const totalNetProfit   = round2(projection.reduce((s, r) => s + r.netProfit, 0))
    const avgMargin        = totalRevenue > 0 ? round2((totalGrossProfit / totalRevenue) * 100) : 0
    const totalUnits       = projection.reduce((s) => s + qty, 0)
    const unitGrossProfit  = totalUnits > 0 ? totalGrossProfit / totalUnits : 0
    const breakEvenUnits   = unitGrossProfit > 0 ? Math.ceil(yearlyExpenses / unitGrossProfit) : 0
    return { totalRevenue, totalCOGS, totalHolding, totalGrossProfit, avgMargin, yearlyExpenses, totalNetProfit, breakEvenUnits }
  }, [projection, qty])

  /* ── Sync yearly net profit to partner equalization fetch ───────────────── */
  useEffect(() => {
    setEqNetProfit(yearly.totalNetProfit)
  }, [yearly.totalNetProfit])

  /* ── Scenario projection (collection delay reduces effective cashflow) ────── */
  const scenarioProjection = useMemo(() => {
    if (collectionDelayPct === 0) return projection
    const mult = 1 - collectionDelayPct / 100
    let cum = 0
    return projection.map(r => {
      const rev   = round2(r.revenue * mult)
      const gross = round2(rev - r.cogs - r.holding)
      const net   = round2(gross - r.expense)
      cum = round2(cum + net)
      return { ...r, revenue: rev, grossProfit: gross, netProfit: net, cumProfit: cum }
    })
  }, [projection, collectionDelayPct])

  const hasScenario      = collectionDelayPct > 0 || extraDebtTRY > 0
  const activeProjection = hasScenario ? scenarioProjection : projection

  /* ── Pre-compute verdict helpers ────────────────────────────────────────── */
  const hasInputs         = unitCost > 0 && catPrice > 0
  const isViable          = hasInputs && effectiveProfitPU > 0 && yearly.totalNetProfit > 0
  const isBirimKarli      = hasInputs && effectiveProfitPU > 0
  const monthsToBreakEven = yearly.breakEvenUnits > 0 && qty > 0
    ? Math.ceil(yearly.breakEvenUnits / qty) : null

  const CORP_TAX_RATE    = 25
  const estimatedCorpTax = Math.max(0, yearly.totalNetProfit) * CORP_TAX_RATE / 100
  const netAfterCorpTax  = yearly.totalNetProfit - estimatedCorpTax

  /* ── Debt burden helpers ────────────────────────────────────────────────── */
  const totalOutstanding     = debtBurden?.summary.total_outstanding ?? 0
  const monthlyDistributable = netAfterCorpTax / 12
  const monthsToClear = monthlyDistributable > 0
    ? Math.ceil(totalOutstanding / monthlyDistributable)
    : null

  /* scenario-adjusted debt + runway forecast */
  const adjustedOutstanding   = totalOutstanding + extraDebtTRY
  const adjustedMonthsToClear = monthlyDistributable > 0
    ? Math.ceil(adjustedOutstanding / monthlyDistributable)
    : null

  const firstPositiveCumIdx = activeProjection.findIndex(r => r.cumProfit > 0)
  const turnsPositiveMonth  = firstPositiveCumIdx >= 0 ? firstPositiveCumIdx + 1 : null
  const stableFromMonth     = firstPositiveCumIdx >= 0 &&
    activeProjection.slice(firstPositiveCumIdx).every(r => r.cumProfit > 0)
    ? firstPositiveCumIdx + 1
    : null

  function debtStatus() {
    if (adjustedOutstanding <= 0) return { label: 'Borç yok — tam dağıtım kapasitesi', color: 'text-pos-text', bg: 'bg-pos-light', border: 'border-pos-light' }
    if (monthlyDistributable <= 0) return { label: 'Kritik nakit riski — borç ödenemez', color: 'text-neg-text', bg: 'bg-neg-light', border: 'border-neg-light' }
    if (adjustedMonthsToClear !== null && adjustedMonthsToClear > 24) return { label: 'Borç baskısı yüksek — 2 yıldan uzun', color: 'text-neg-text', bg: 'bg-neg-light', border: 'border-neg-light' }
    if (adjustedMonthsToClear !== null && adjustedMonthsToClear > 12) return { label: 'Borç baskısı azalıyor — 1-2 yıl', color: 'text-warn-text', bg: 'bg-warn-light', border: 'border-warn-light' }
    return { label: 'Güvenli dağıtım bölgesi — 12 ay içinde', color: 'text-pos-text', bg: 'bg-pos-light', border: 'border-pos-light' }
  }
  const ds = debtStatus()

  /* ── Max values for mini bar chart ─────────────────────────────────────── */
  const maxRevenue = Math.max(...projection.map(r => r.revenue), 1)

  /* ── InputPanel handler: clear product when manual cost changes ─────────── */
  const handleManualCostChange = (v: string) => {
    setManualCost(v)
    if (productId) setProductId('')
  }

  const handleProductChange = (id: string) => {
    setProductId(id)
    if (!id) { setManualCost(''); setCatalogPrice('') }
  }

  return (
    <div className="max-w-5xl space-y-4">

      {/* ── Zone 1: Status header ─────────────────────────────────────────────── */}
      <div className="bg-gray-950 text-white rounded px-5 py-3 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <span className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mr-3">Simülasyon</span>
          {!hasInputs ? (
            <span className="text-sm text-gray-400">Maliyet ve fiyat girerek başlayın</span>
          ) : isViable ? (
            <span className="text-sm font-bold text-pos">
              ✓ Kârlı plan &mdash; {qty} adet/ay &middot; yıllık{' '}
              <span className="tabular-nums">{fmtC(toDisplay(yearly.totalNetProfit), S)}</span> net
            </span>
          ) : isBirimKarli ? (
            <span className="text-sm font-bold text-warn">
              Birim kârlı &mdash; giderler yıllık{' '}
              <span className="tabular-nums">{fmtC(toDisplay(Math.abs(yearly.totalNetProfit)), S)}</span> açık bırakıyor
            </span>
          ) : (
            <span className="text-sm font-bold text-neg">
              ✗ Zarar &mdash; birim başına {fmtC(toDisplay(Math.abs(effectiveProfitPU)), S)} ekside
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {annualRate === 0 && (
            <span className="text-xs text-gray-500">
              Faiz girilmedi · <a href="/dashboard/settings" className="text-primary-400 hover:underline">ekle →</a>
            </span>
          )}
          <div className="flex items-center gap-1 bg-gray-800 border border-gray-700 rounded px-1 py-0.5">
            {CURRENCIES.map(c => (
              <button key={c} onClick={() => setDisplayCurrency(c)}
                className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors ${
                  displayCurrency === c ? 'bg-primary-600 text-white' : 'text-gray-400 hover:bg-gray-700'
                }`}>
                {c}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Zone 1: Hero KPI cards ────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-0 bg-white border border-[#e2e8f0] rounded overflow-hidden shadow-sm">
        {[
          {
            label: 'Birim Kâr',
            value: hasInputs ? fmtC(toDisplay(effectiveProfitPU), S) : '—',
            sub:   hasInputs ? `${fmtC(toDisplay(netPrice), S)} − ${fmtC(toDisplay(effectiveRealCost), S)}` : 'Maliyet ve fiyat girin',
            color: !hasInputs ? 'text-gray-300' : effectiveProfitPU >= 0 ? 'text-pos-text' : 'text-neg',
          },
          {
            label: 'Kâr Marjı',
            value: hasInputs ? pct(effectiveMargin) : '—',
            sub:   'Kâr / Gelir',
            color: !hasInputs ? 'text-gray-300' : effectiveMargin >= 0 ? 'text-primary-700' : 'text-neg',
          },
          {
            label: 'Yıllık Net',
            value: hasInputs ? fmtC(toDisplay(yearly.totalNetProfit), S) : '—',
            sub:   hasInputs ? `${qty * 12} adet · gider dahil` : 'Parametreler girin',
            color: !hasInputs ? 'text-gray-300' : yearly.totalNetProfit >= 0 ? 'text-pos-text' : 'text-neg',
          },
          {
            label: 'Başabaş',
            value: yearly.breakEvenUnits > 0 ? `${yearly.breakEvenUnits.toLocaleString('tr-TR')} adet` : '—',
            sub:   monthsToBreakEven ? `≈ ${monthsToBreakEven} ay` : 'Giderleri karşılamak için',
            color: yearly.breakEvenUnits > 0 ? 'text-warn-text' : 'text-gray-300',
          },
        ].map((card, i) => (
          <div key={card.label}
            className={`p-3 ${i < 3 ? 'border-b sm:border-b-0 sm:border-r border-[#e2e8f0]' : ''}`}>
            <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-1">{card.label}</div>
            <div className={`text-xl font-black tabular-nums leading-none ${card.color}`}>{card.value}</div>
            <div className="text-[10px] text-gray-400 mt-1 leading-tight">{card.sub}</div>
          </div>
        ))}
      </div>

      {/* ── Zone 1: Input panel ───────────────────────────────────────────────── */}
      <InputPanel
        products={products}
        productId={productId}
        manualCost={manualCost}
        catalogPrice={catalogPrice}
        monthlyQty={monthlyQty}
        discount={discount}
        interestRate={interestRate}
        saleDate={saleDate}
        displayCurrency={displayCurrency}
        collectionDelay={collectionDelay}
        extraPartnerDebt={extraPartnerDebt}
        fxRates={fxRates}
        policyRates={policyRates}
        selectedProduct={selectedProduct}
        backendRealCost={backendRealCost}
        recurringLoading={recurringLoading}
        holdingDays={holdingDays}
        entryDate={entryDate}
        collectionDelayPct={collectionDelayPct}
        hasScenario={hasScenario}
        onProductChange={handleProductChange}
        onManualCostChange={handleManualCostChange}
        onCatalogPriceChange={setCatalogPrice}
        onMonthlyQtyChange={setMonthlyQty}
        onDiscountChange={setDiscount}
        onInterestRateChange={setInterestRate}
        onSaleDateChange={setSaleDate}
        onDisplayCurrencyChange={setDisplayCurrency}
        onCollectionDelayChange={setCollectionDelay}
        onExtraPartnerDebtChange={setExtraPartnerDebt}
      />

      {/* ── Zone 2: Revenue timeline chart (CSS bars) ─────────────────────────── */}
      {hasInputs && (
        <div className="bg-white border border-[#e2e8f0] rounded p-4 shadow-sm">
          <h2 className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-4">
            Gelir Çizelgesi — 12 Ay
          </h2>
          <div className="grid grid-cols-12 gap-1 items-end h-24">
            {projection.map(r => {
              const heightPct = maxRevenue > 0 ? Math.max(4, (r.revenue / maxRevenue) * 100) : 4
              const isProfit  = r.netProfit >= 0
              return (
                <div key={r.ym} className="flex flex-col items-center gap-1 group relative">
                  <div
                    className={`w-full rounded-t transition-all ${isProfit ? 'bg-pos group-hover:bg-pos-light' : 'bg-neg-light group-hover:bg-neg'}`}
                    style={{ height: `${heightPct}%` }}
                  />
                  <div className="text-[8px] text-gray-400 font-semibold leading-none">
                    {fmtMonth(r.ym).slice(0, 3)}
                  </div>
                  {/* Tooltip on hover */}
                  <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 hidden group-hover:block z-10 bg-gray-900 text-white rounded px-2 py-1 text-[10px] whitespace-nowrap">
                    <div className="font-bold">{fmtMonth(r.ym)}</div>
                    <div>Gelir: {fmtC(toDisplay(r.revenue), S)}</div>
                    <div className={r.netProfit >= 0 ? 'text-pos' : 'text-neg'}>
                      Net: {fmtC(toDisplay(r.netProfit), S)}
                    </div>
                    <div className={r.cumProfit >= 0 ? 'text-pos' : 'text-neg'}>
                      Kümülatif: {fmtC(toDisplay(r.cumProfit), S)}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
          <div className="flex items-center gap-4 mt-3 text-[10px] text-gray-400">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-pos inline-block" /> Kârlı ay</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-neg-light inline-block" /> Zararlı ay</span>
            <span className="ml-auto">Sütun yüksekliği = aylık gelir oranı</span>
          </div>
        </div>
      )}

      {/* ── Zone 2: Tax effect ───────────────────────────────────────────────── */}
      <div className="bg-white border border-[#e2e8f0] rounded p-4 shadow-sm">
        <h2 className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-3">
          Vergi Etkisi — Yıllık Tahmin
        </h2>
        <div className="grid grid-cols-3 gap-4 mb-3">
          <div>
            <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-0.5">Net Kâr (Vergi Öncesi)</div>
            <div className={`text-lg font-black tabular-nums ${!hasInputs ? 'text-gray-300' : yearly.totalNetProfit >= 0 ? 'text-gray-800' : 'text-neg'}`}>
              {hasInputs ? fmtC(toDisplay(yearly.totalNetProfit), S) : '—'}
            </div>
          </div>
          <div>
            <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-0.5">
              Kurumlar Vergisi (%{CORP_TAX_RATE})
            </div>
            <div className="text-lg font-black tabular-nums text-orange-600">
              {estimatedCorpTax > 0 ? `−${fmtC(toDisplay(estimatedCorpTax), S)}` : '—'}
            </div>
            <div className="text-[10px] text-gray-400 mt-0.5">Tahmini KV</div>
          </div>
          <div>
            <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-0.5">Vergi Sonrası Net</div>
            <div className={`text-lg font-black tabular-nums ${!hasInputs ? 'text-gray-300' : netAfterCorpTax >= 0 ? 'text-pos-text' : 'text-neg'}`}>
              {hasInputs ? fmtC(toDisplay(netAfterCorpTax), S) : '—'}
            </div>
            <div className="text-[10px] text-gray-400 mt-0.5">Ortaklara dağıtılabilir</div>
          </div>
        </div>
        {hasInputs && yearly.totalNetProfit > 0 && (
          <>
            <div className="flex rounded-full h-1.5 overflow-hidden bg-gray-100">
              <div className="bg-pos h-1.5" style={{ width: `${100 - CORP_TAX_RATE}%` }} />
              <div className="bg-orange-300 h-1.5" style={{ width: `${CORP_TAX_RATE}%` }} />
            </div>
            <div className="flex justify-between mt-0.5">
              <span className="text-[10px] text-pos-text font-semibold">%{100 - CORP_TAX_RATE} size kalır</span>
              <span className="text-[10px] text-orange-500 font-semibold">%{CORP_TAX_RATE} kurumlar vergisi</span>
            </div>
          </>
        )}
        {hasInputs && yearly.yearlyExpenses > 0 && (
          <div className="mt-2 pt-2 border-t border-[#e2e8f0] text-[10px] text-gray-400">
            Gider matrahı {fmtC(toDisplay(yearly.yearlyExpenses), S)} vergiden düşürülmüştür.
            KDV ayrıca Analitik sayfasında gösterilir.
          </div>
        )}
      </div>

      {/* ── Zone 2: Partner impact ────────────────────────────────────────────── */}
      {partnerCount > 0 && yearly.totalNetProfit !== 0 && (
        <div className={`border rounded p-4 ${
          yearly.totalNetProfit > 0 ? 'bg-pos-light border-pos-light' : 'bg-neg-light border-neg-light'
        }`}>
          <div className="flex items-center justify-between mb-2">
            <div>
              <h2 className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-0.5">
                Ortak Dengesi Nasıl Etkilenir?
              </h2>
              <p className="text-xs text-gray-500">
                {yearly.totalNetProfit > 0
                  ? `Vergi sonrası ${fmtC(toDisplay(netAfterCorpTax), S)} dağıtılır`
                  : 'Zarar durumunda ortak dağıtımı yapılamaz'}
              </p>
            </div>
            <a href="/dashboard/partners" className="text-xs text-primary-600 font-semibold hover:underline shrink-0">
              Ortak sayfası →
            </a>
          </div>

          {yearly.totalNetProfit > 0 && partnerEq.entries.length > 0 ? (
            <>
              <div className="grid gap-2 mb-2"
                style={{ gridTemplateColumns: `repeat(${Math.min(partnerEq.entries.length, 4)}, 1fr)` }}>
                {partnerEq.entries.map(e => (
                  <div key={e.partner_id} className="bg-white rounded px-3 py-2 text-center border border-pos-light">
                    <div className="text-xs text-gray-500 font-semibold truncate mb-0.5">{e.partner_name}</div>
                    <div className="text-base font-black tabular-nums text-pos-text">
                      {fmtC(toDisplay(e.total_payout), S)}
                    </div>
                    <div className="text-[10px] text-gray-400 mt-0.5">%{(e.share_ratio * 100).toFixed(0)} pay</div>
                    {e.equalization_amount > 0.01 && (
                      <div className="text-[10px] text-warn-text font-semibold mt-0.5">
                        +{fmtC(toDisplay(e.equalization_amount), S)} eşitleme
                      </div>
                    )}
                  </div>
                ))}
              </div>
              {partnerEq.total_equalization > 0.01 ? (
                <div className="text-xs text-warn-text bg-warn-light rounded px-3 py-2 border border-warn-light">
                  ⚖ Bu plan <span className="font-bold">{fmtC(toDisplay(partnerEq.total_equalization), S)}</span> eşitleme açığını kapatır.{' '}
                  {partnerEq.remaining_after_eq > 0.01
                    ? `Kalan ${fmtC(toDisplay(partnerEq.remaining_after_eq), S)} hisse oranına göre dağıtılır.`
                    : 'Tüm tutar eşitlemeye gider.'}
                </div>
              ) : (
                <div className="text-xs text-pos-text bg-pos-light rounded px-3 py-2 border border-pos-light">
                  ✓ Ortak dengesi sağlıklı — tüm dağıtım hisse oranına göre yapılır.
                </div>
              )}
            </>
          ) : yearly.totalNetProfit > 0 ? (
            <div className="text-xs text-gray-400">Yükleniyor...</div>
          ) : (
            <div className="text-xs text-neg-text bg-neg-light rounded px-3 py-2 border border-neg-light">
              ⚠ Zarar durumunda ortak dağıtımı yapılamaz. Parametreleri ayarlayarak kâra geçin.
            </div>
          )}
        </div>
      )}

      {/* ── Zone 3: Monthly projection table ─────────────────────────────────── */}
      <ProjectionTable
        projection={projection}
        toDisplay={toDisplay}
        S={S}
        hasInputs={hasInputs}
      />

      {/* ── Zone 3: Yearly totals ─────────────────────────────────────────────── */}
      <div className="bg-white border border-[#e2e8f0] rounded p-4 shadow-sm">
        <h2 className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-3">Yıllık Toplam</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {[
            { label: 'Toplam Gelir',               value: fmtC(toDisplay(yearly.totalRevenue), S) },
            { label: 'Toplam SMM',                 value: fmtC(toDisplay(yearly.totalCOGS), S) },
            { label: 'Toplam Finansman Maliyeti',  value: fmtC(toDisplay(yearly.totalHolding), S) },
            {
              label: 'Brüt Kâr',
              value: fmtC(toDisplay(yearly.totalGrossProfit), S),
              color: yearly.totalGrossProfit >= 0 ? 'text-pos-text' : 'text-neg',
            },
          ].map(t => (
            <div key={t.label}>
              <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-0.5">{t.label}</div>
              <div className={`text-lg font-black tabular-nums ${t.color ?? 'text-gray-700'}`}>{t.value}</div>
            </div>
          ))}
        </div>
        <div className="mt-4 pt-4 border-t border-[#e2e8f0] grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          <div>
            <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-0.5">Yıllık Gider (Tekrarlı)</div>
            <div className="text-lg font-black tabular-nums text-neg">{fmtC(toDisplay(yearly.yearlyExpenses), S)}</div>
            <div className="text-[10px] text-gray-400 mt-0.5">Tekrarlı gider planından</div>
          </div>
          <div>
            <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-0.5">Net Kâr</div>
            <div className={`text-lg font-black tabular-nums ${yearly.totalNetProfit >= 0 ? 'text-pos-text' : 'text-neg'}`}>
              {fmtC(toDisplay(yearly.totalNetProfit), S)}
            </div>
            <div className="text-[10px] text-gray-400 mt-0.5">Brüt Kâr − Gider</div>
          </div>
          <div>
            <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-0.5">Ortalama Marj</div>
            <div className={`text-lg font-black tabular-nums ${yearly.avgMargin >= 0 ? 'text-primary-700' : 'text-neg'}`}>
              {pct(yearly.avgMargin)}
            </div>
          </div>
          {yearly.breakEvenUnits > 0 && (
            <div>
              <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-0.5">Başabaş Noktası</div>
              <div className="text-lg font-black tabular-nums text-warn-text">
                {yearly.breakEvenUnits.toLocaleString('tr-TR')} adet
              </div>
              <div className="text-[10px] text-gray-400 mt-0.5">Giderleri karşılamak için</div>
            </div>
          )}
        </div>
      </div>

      {/* ── Zone 4: Visual Pressure Timeline ─────────────────────────────────── */}
      <div className="bg-white border border-[#e2e8f0] rounded p-4 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">
            Finansal Baskı Zaman Çizelgesi — 12 Ay
          </h2>
          {hasScenario && (
            <span className="text-[10px] bg-warn-light text-warn-text border border-warn-light rounded px-2 py-0.5 font-bold">
              Senaryo aktif{collectionDelayPct > 0 ? ` · %${collectionDelayPct} gecikme` : ''}{extraDebtTRY > 0 ? ` · +${fmtC(extraDebtTRY, '₺')} borç` : ''}
            </span>
          )}
        </div>
        <div className="grid grid-cols-12 gap-1.5">
          {activeProjection.map(r => {
            const isKritik = r.cumProfit < 0
            const isDikkat = !isKritik && r.netProfit < 0
            const bg   = isKritik ? 'bg-neg-light border-neg-light'     : isDikkat ? 'bg-warn-light border-warn-light'     : 'bg-pos-light border-pos-light'
            const text = isKritik ? 'text-neg-text'                   : isDikkat ? 'text-warn-text'                    : 'text-pos-text'
            const lbl  = isKritik ? 'Kritik'                         : isDikkat ? 'Dikkat'                            : 'Güvenli'
            return (
              <div key={r.ym}
                className={`border rounded p-1.5 flex flex-col items-center gap-0.5 group relative cursor-default ${bg}`}>
                <div className={`text-[9px] font-bold leading-none ${text}`}>
                  {fmtMonth(r.ym).slice(0, 3)}
                </div>
                <div className={`text-[8px] font-semibold leading-none ${text} opacity-80`}>{lbl}</div>
                <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 hidden group-hover:block z-10 bg-gray-900 text-white rounded px-2 py-1.5 text-[10px] whitespace-nowrap pointer-events-none">
                  <div className="font-bold mb-0.5">{fmtMonth(r.ym)}</div>
                  <div>Gelir: {fmtC(toDisplay(r.revenue), S)}</div>
                  <div className={r.netProfit >= 0 ? 'text-pos' : 'text-neg'}>
                    Net: {fmtC(toDisplay(r.netProfit), S)}
                  </div>
                  <div className={r.cumProfit >= 0 ? 'text-pos' : 'text-neg'}>
                    Kümülatif: {fmtC(toDisplay(r.cumProfit), S)}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
        <div className="flex items-center gap-4 mt-3 text-[10px] text-gray-400">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-pos-light border border-pos inline-block" />
            Güvenli
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-warn-light border border-warn inline-block" />
            Dikkat
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-neg-light border border-neg inline-block" />
            Kritik
          </span>
          <span className="ml-auto text-[10px] text-gray-300">Hover = detay</span>
        </div>
      </div>

      {/* ── Zone 4: Runway Forecast ───────────────────────────────────────────── */}
      {hasInputs && (
        <div className="bg-white border border-[#e2e8f0] rounded p-4 shadow-sm">
          <h2 className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-3">
            Pist Tahmini — Güvenli Bölgeye Ne Zaman Ulaşılır?
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-0.5">İlk Kümülatif Kâr</div>
              <div className={`text-xl font-black tabular-nums ${turnsPositiveMonth ? 'text-pos-text' : 'text-neg'}`}>
                {turnsPositiveMonth ? `${turnsPositiveMonth}. Ay` : '12+ ay'}
              </div>
              <div className="text-[10px] text-gray-400 mt-0.5">Kümülatif nakit pozitife geçer</div>
            </div>
            <div>
              <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-0.5">
                {adjustedOutstanding > 0 ? 'Borç Temizlenir' : 'Borç Durumu'}
              </div>
              <div className={`text-xl font-black tabular-nums ${
                adjustedOutstanding <= 0 ? 'text-pos-text'
                : adjustedMonthsToClear === null ? 'text-neg'
                : adjustedMonthsToClear > 24 ? 'text-neg'
                : adjustedMonthsToClear > 12 ? 'text-warn-text'
                : 'text-pos-text'
              }`}>
                {adjustedOutstanding <= 0 ? 'Borç yok'
                  : adjustedMonthsToClear === null ? '∞'
                  : `${adjustedMonthsToClear} ay`}
              </div>
              <div className="text-[10px] text-gray-400 mt-0.5">Dağıtım kapasitesine göre</div>
            </div>
            <div>
              <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-0.5">12 Ay Sonu Kümülatif</div>
              <div className={`text-xl font-black tabular-nums ${(activeProjection[11]?.cumProfit ?? 0) >= 0 ? 'text-pos-text' : 'text-neg'}`}>
                {activeProjection[11] ? fmtC(toDisplay(activeProjection[11].cumProfit), S) : '—'}
              </div>
              <div className="text-[10px] text-gray-400 mt-0.5">Yıl sonu kümülatif nakit</div>
            </div>
          </div>
          {stableFromMonth ? (
            <div className="mt-3 bg-pos-light border border-pos-light rounded px-3 py-2 text-xs text-pos-text font-semibold">
              ✓ {stableFromMonth}. aydan itibaren güvenli bölge — kümülatif nakit kalıcı olarak pozitif
            </div>
          ) : turnsPositiveMonth ? (
            <div className="mt-3 bg-warn-light border border-warn-light rounded px-3 py-2 text-xs text-warn-text font-semibold">
              ⚠ {turnsPositiveMonth}. ayda pozitife geçiyor ancak sonraki aylarda dalgalanma var
            </div>
          ) : (
            <div className="mt-3 bg-neg-light border border-neg-light rounded px-3 py-2 text-xs text-neg-text font-semibold">
              ✗ 12 ay içinde kümülatif pozitife geçilemiyor — parametreleri gözden geçirin
            </div>
          )}
        </div>
      )}

      {/* ── Zone 4: Debt burden tracking ─────────────────────────────────────── */}
      <div className={`border rounded p-4 ${ds.bg} ${ds.border}`}>
        <h2 className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-3">
          Borç Baskısı Takibi
        </h2>
        {debtBurdenLoading ? (
          <div className="text-xs text-gray-400">Yükleniyor...</div>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-3">
              <div>
                <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-0.5">
                  Toplam Borç{extraDebtTRY > 0 && <span className="text-warn ml-1">(+senaryo)</span>}
                </div>
                <div className="text-lg font-black tabular-nums text-gray-800">
                  {adjustedOutstanding > 0 ? fmtC(toDisplay(adjustedOutstanding), S) : '—'}
                </div>
                <div className="text-[10px] text-gray-400">
                  Ortaklara kalan{extraDebtTRY > 0 && ` · +${fmtC(toDisplay(extraDebtTRY), S)} senaryo`}
                </div>
              </div>
              <div>
                <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-0.5">Aylık Dağıtım Kapasitesi</div>
                <div className={`text-lg font-black tabular-nums ${monthlyDistributable >= 0 ? 'text-pos-text' : 'text-neg'}`}>
                  {hasInputs ? fmtC(toDisplay(monthlyDistributable), S) : '—'}
                </div>
                <div className="text-[10px] text-gray-400">Vergi sonrası / 12</div>
              </div>
              <div>
                <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-0.5">Tahmini Temizlenme</div>
                <div className={`text-lg font-black tabular-nums ${
                  adjustedMonthsToClear === null ? 'text-gray-300'
                  : adjustedMonthsToClear > 24 ? 'text-neg'
                  : adjustedMonthsToClear > 12 ? 'text-warn-text'
                  : 'text-pos-text'
                }`}>
                  {adjustedOutstanding <= 0 ? '—'
                    : adjustedMonthsToClear === null ? '∞'
                    : `${adjustedMonthsToClear} ay`}
                </div>
                <div className="text-[10px] text-gray-400">Borç / aylık kapasite</div>
              </div>
              <div>
                <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-0.5">Ortak Sayısı</div>
                <div className="text-lg font-black tabular-nums text-gray-700">
                  {debtBurden?.summary.partner_count ?? partnerCount}
                </div>
                <div className="text-[10px] text-gray-400">Aktif ortak</div>
              </div>
            </div>
            <div className={`rounded px-3 py-2 border text-xs font-semibold ${ds.color} ${ds.bg} ${ds.border}`}>
              {ds.label}
            </div>
          </>
        )}
      </div>

    </div>
  )
}
