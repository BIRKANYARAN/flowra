'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSupabase } from '@/lib/hooks/useSupabase'
import { CURRENCIES, type Currency, type Product } from '@/types'
import { round2 } from '@/lib/calc'
import { getSalePrice, getSaleCurrency, getLegacyProductCost } from '@/lib/product-adapter'
import { resolveCompanyId } from '@/lib/resolve-company'

/* ── Style tokens (matching existing Flowra design) ───────────────────────── */
const IL  = 'w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-primary-400 bg-white transition-colors'
const LAB = 'block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5'

function currSym(c: string): string {
  return c === 'USD' ? '$' : c === 'EUR' ? '€' : '₺'
}

/* ── Helpers ──────────────────────────────────────────────────────────────── */
function fmtC(n: number, sym: string) {
  return sym + Number(n || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function pct(n: number) {
  return '%' + Number(n || 0).toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
}

/* ── Partner types ────────────────────────────────────────────────────────── */
interface SimEqEntry {
  partner_id:          string
  partner_name:        string
  share_ratio:         number
  equalization_amount: number
  pro_rata_share:      number
  total_payout:        number
}
interface SimEqResult {
  baseline_per_unit:  number
  total_equalization: number
  distributable:      number
  remaining_after_eq: number
  entries:            SimEqEntry[]
}
const ZERO_SIM_EQ: SimEqResult = {
  baseline_per_unit: 0, total_equalization: 0, distributable: 0,
  remaining_after_eq: 0, entries: [],
}

/* ── Component ────────────────────────────────────────────────────────────── */
export default function SimulationPage() {
  // useMemo ensures the client instance is stable across re-renders,
  // preventing the supabase → fetchMonthExpenses → load → useEffect chain
  // from firing on every render cycle.
  const supabase = useSupabase()

  /* data from DB */
  const [products, setProducts]       = useState<Product[]>([])
  const [loading, setLoading]         = useState(true)

  /* Policy rates per currency (from DB) */
  const [policyRates, setPolicyRates] = useState<{ TRY: number; USD: number; EUR: number }>({ TRY: 0, USD: 0, EUR: 0 })

  /* FX rates for multi-currency display */
  const [fxRates, setFxRates] = useState<{ USD: number; EUR: number }>({ USD: 0, EUR: 0 })
  const [displayCurrency, setDisplayCurrency] = useState<Currency>('TRY')

  /* Partner equalization impact */
  const [partnerEq,    setPartnerEq]    = useState<SimEqResult>(ZERO_SIM_EQ)
  const [partnerCount, setPartnerCount] = useState(0)

  /* Selected month expenses (actual sum, not averaged) */
  const [monthlyExpenses, setMonthlyExpenses] = useState(0)
  const [expenseMonth, setExpenseMonth] = useState(new Date().toISOString().slice(0, 7)) // YYYY-MM

  /* user inputs */
  const [productId, setProductId]     = useState('')
  const [manualCost, setManualCost]   = useState('')
  const [catalogPrice, setCatalogPrice] = useState('')
  const [monthlyQty, setMonthlyQty]   = useState('100')
  const [discount, setDiscount]       = useState('0')
  const [interestRate, setInterestRate] = useState('')
  const [saleDate, setSaleDate]       = useState(new Date().toISOString().slice(0, 10))
  const [userId, setUserId]           = useState<string | null>(null)
  const [companyId, setCompanyId]     = useState<string | null>(null)

  /* ── Fetch expenses for a specific month ────────────────────────────────── */
  const fetchMonthExpenses = useCallback(async (cid: string, month: string) => {
    const startDate = `${month}-01`
    const [y, m] = month.split('-').map(Number)
    const lastDay = new Date(y, m, 0).getDate()
    const endDate = `${month}-${String(lastDay).padStart(2, '0')}`

    const { data } = await supabase
      .from('expenses')
      .select('amount_try')
      .eq('company_id', cid)
      .is('deleted_at', null)
      .gte('expense_date', startDate)
      .lte('expense_date', endDate)

    const total = (data ?? []).reduce((s: number, e: { amount_try: number }) => s + (Number(e.amount_try) || 0), 0)
    setMonthlyExpenses(round2(total))
  }, [supabase])

  /* ── Load products & policy rates ───────────────────────────────────────── */
  const load = useCallback(async () => {
    const { data: authData, error: authError } = await supabase.auth.getUser()
    if (authError || !authData?.user) { setLoading(false); return }
    const user = authData.user
    const cid = await resolveCompanyId(user.id, supabase)
    setUserId(user.id)
    setCompanyId(cid)

    const today = new Date().toISOString().slice(0, 10)

    const [pRes, tryRateRes, usdRateRes, eurRateRes] = await Promise.all([
      // Simulation picker — only active catalog products.
      supabase.from('products').select('*')
        .eq('company_id', cid).is('deleted_at', null).eq('is_active', true).order('name'),
      supabase.from('policy_rates').select('annual_rate')
        .eq('currency', 'TRY').lte('rate_date', today)
        .order('rate_date', { ascending: false }).limit(1),
      supabase.from('policy_rates').select('annual_rate')
        .eq('currency', 'USD').lte('rate_date', today)
        .order('rate_date', { ascending: false }).limit(1),
      supabase.from('policy_rates').select('annual_rate')
        .eq('currency', 'EUR').lte('rate_date', today)
        .order('rate_date', { ascending: false }).limit(1),
    ])

    setProducts((pRes.data ?? []) as Product[])

    const tryRate = (tryRateRes.data?.[0]) ? Number(tryRateRes.data[0].annual_rate) : 0
    const usdRate = (usdRateRes.data?.[0]) ? Number(usdRateRes.data[0].annual_rate) : 0
    const eurRate = (eurRateRes.data?.[0]) ? Number(eurRateRes.data[0].annual_rate) : 0
    setPolicyRates({ TRY: tryRate, USD: usdRate, EUR: eurRate })

    // Default: use TRY rate
    setInterestRate(String(tryRate))

    // Fetch selected month expenses
    await fetchMonthExpenses(cid, expenseMonth)
    setLoading(false)

    // Fetch FX rates for display conversion (DB-cached, no external call)
    try {
      const fxRes = await fetch('/api/fx', { cache: 'no-store' })
      const fxData = await fxRes.json()
      if (fxRes.ok && fxData.USD > 0) {
        setFxRates({ USD: Number(fxData.USD), EUR: Number(fxData.EUR) })
      }
    } catch { /* non-fatal */ }

    // Count partners (for showing the impact section)
    try {
      const pRes = await fetch('/api/partners')
      if (pRes.ok) {
        const pData = await pRes.json()
        setPartnerCount(Array.isArray(pData) ? pData.length : 0)
      }
    } catch { /* non-fatal */ }
  }, [supabase, expenseMonth, fetchMonthExpenses])

  useEffect(() => { load() }, [load])

  /* ── Partner equalization: refetch when yearly net profit changes ──────── */
  const [eqNetProfit, setEqNetProfit] = useState(0)

  useEffect(() => {
    if (partnerCount === 0) return
    const distributable = Math.max(0, eqNetProfit)
    let cancelled = false
    fetch(`/api/partners/equalization?distributable=${distributable}`)
      .then(r => r.ok ? r.json() : ZERO_SIM_EQ)
      .then((data: SimEqResult) => { if (!cancelled) setPartnerEq(data) })
      .catch(() => { /* non-fatal */ })
    return () => { cancelled = true }
  }, [eqNetProfit, partnerCount])

  /* ── When product selection changes, auto-fill cost & catalog price ──── */
  const selectedProduct = useMemo(
    () => products.find(p => p.id === productId) ?? null,
    [products, productId],
  )

  /* entry_date from the product's earliest stock lot */
  const [entryDate, setEntryDate] = useState<string | null>(null)

  useEffect(() => {
    if (selectedProduct) {
      // Prefill form via adapter so products using only new canonical fields work too.
      const legacyCost = getLegacyProductCost(selectedProduct)
      const salePrice  = getSalePrice(selectedProduct)
      setManualCost(legacyCost != null ? String(legacyCost) : '')
      setCatalogPrice(salePrice != null ? String(salePrice) : '')

      // Interest rate by product currency (TRY→TCMB, USD→FED, EUR→ECB).
      // Adapter may return null → explicit 'TRY' fallback here because the
      // policy-rate table is keyed by currency and needs a concrete code.
      const cur = (getSaleCurrency(selectedProduct) ?? 'TRY') as keyof typeof policyRates
      const rateForCurrency = policyRates[cur] ?? policyRates.TRY
      setInterestRate(String(rateForCurrency))

      // fetch earliest stock lot entry_date
      if (companyId) {
        ;(async () => {
          const { data: lots } = await supabase
            .from('stock_lots')
            .select('entry_date')
            .eq('product_id', selectedProduct.id)
            .eq('company_id', companyId)
            .gt('qty_remaining', 0)
            .order('entry_date', { ascending: true })
            .limit(1)
          setEntryDate(lots?.[0]?.entry_date ?? null)
        })()
      }
    } else {
      setEntryDate(null)
      // Reset to TRY rate when no product selected
      setInterestRate(String(policyRates.TRY))
    }
  }, [selectedProduct, supabase, companyId, policyRates])

  /* ── Parsed numeric inputs ──────────────────────────────────────────────── */
  const unitCost       = parseFloat(manualCost) || 0
  const catPrice       = parseFloat(catalogPrice) || 0
  const qty            = parseInt(monthlyQty, 10) || 0
  const discountPct    = parseFloat(discount) || 0
  const annualRate     = parseFloat(interestRate) || 0

  /* ── Holding time: auto-computed from entry_date → sale_date ────────────── */
  const holdingDays = useMemo(() => {
    if (!entryDate) return 30 // default 30 days when no entry_date
    const entry = new Date(entryDate)
    const sale  = new Date(saleDate)
    const diff  = Math.max(0, Math.round((sale.getTime() - entry.getTime()) / 86_400_000))
    return diff
  }, [entryDate, saleDate])

  // When no DB rate is found, annualRate resolves to 0 via parseFloat('0') || 0.
  // Calculations always run — 0% rate simply means no carrying cost (realCost = unitCost).
  // A compact info message is shown in the UI when annualRate is 0.
  // rateBlocked is kept as a typed boolean (always false) so existing render
  // expressions compile unchanged; they all evaluate to the non-blocked branch.
  const rateBlocked: boolean = false

  /* ── Core calculations (using central round2) ───────────────────────────── */
  const clampedDiscount = Math.min(100, Math.max(0, discountPct))
  // When rate is blocked, do NOT compute carry cost — show raw cost only
  const realCost       = rateBlocked ? unitCost : round2(unitCost * (1 + annualRate / 100 * holdingDays / 365))
  const netPrice       = round2(catPrice * (1 - clampedDiscount / 100))

  /* ── Currency conversion for display ─────────────────────────────────────── */
  const toDisplay = useCallback((tryVal: number): number => {
    if (displayCurrency === 'TRY') return tryVal
    const rate = displayCurrency === 'USD' ? fxRates.USD : fxRates.EUR
    return rate > 0 ? tryVal / rate : 0
  }, [displayCurrency, fxRates])

  const S = currSym(displayCurrency)

  /* ── Backend real cost fetch when product is selected ─────────────────── */
  const [backendRealCost, setBackendRealCost] = useState<number | null>(null)

  useEffect(() => {
    if (!selectedProduct || !userId) { setBackendRealCost(null); return }
    ;(async () => {
      try {
        const { data } = await supabase.rpc('get_real_cost', {
          p_user_id:    userId,
          p_product_id: selectedProduct.id,
        })
        if (data && typeof data === 'object' && 'real_cost' in (data as Record<string, unknown>)) {
          const rc = Number((data as Record<string, unknown>).real_cost)
          if (rc > 0) { setBackendRealCost(rc); return }
        }
      } catch { /* fallback to UI calc */ }
      setBackendRealCost(null)
    })()
  }, [selectedProduct, userId, supabase])

  // Use backend real cost when available for a selected product; otherwise UI calc
  const effectiveRealCost = backendRealCost !== null && selectedProduct ? backendRealCost : realCost
  const effectiveProfitPU = rateBlocked ? 0 : round2(netPrice - effectiveRealCost)
  const effectiveHoldingPU = round2(effectiveRealCost - unitCost)
  const effectiveMargin   = rateBlocked ? 0 : (netPrice > 0 ? round2((effectiveProfitPU / netPrice) * 100) : 0)

  /* ── Monthly projection (12 months) with full metrics ───────────────────── */
  const projection = useMemo(() => {
    let cumProfit = 0
    const monthlyExp = monthlyExpenses
    return Array.from({ length: 12 }, (_, i) => {
      const month     = i + 1
      const revenue   = round2(qty * netPrice)
      const cogs      = round2(qty * unitCost)
      const holding   = round2(qty * effectiveHoldingPU)
      const grossProfit = round2(qty * effectiveProfitPU)
      const expense   = monthlyExp
      const netProfit = round2(grossProfit - expense)
      cumProfit       = round2(cumProfit + netProfit)
      return { month, qty, revenue, cogs, holding, grossProfit, expense, netProfit, cumProfit }
    })
  }, [qty, netPrice, unitCost, effectiveHoldingPU, effectiveProfitPU, monthlyExpenses])

  /* ── Yearly totals ──────────────────────────────────────────────────────── */
  const yearly = useMemo(() => {
    const totalRevenue  = round2(projection.reduce((s, r) => s + r.revenue, 0))
    const totalCOGS     = round2(projection.reduce((s, r) => s + r.cogs, 0))
    const totalHolding  = round2(projection.reduce((s, r) => s + r.holding, 0))
    const totalGrossProfit = round2(projection.reduce((s, r) => s + r.grossProfit, 0))
    const yearlyExpenses = round2(projection.reduce((s, r) => s + r.expense, 0))
    const totalNetProfit = round2(projection.reduce((s, r) => s + r.netProfit, 0))
    const avgMargin     = totalRevenue > 0 ? round2((totalGrossProfit / totalRevenue) * 100) : 0
    const totalUnits    = projection.reduce((s, r) => s + r.qty, 0)
    const unitGrossProfit = totalUnits > 0 ? totalGrossProfit / totalUnits : 0
    const breakEvenUnits = unitGrossProfit > 0 ? Math.ceil(yearlyExpenses / unitGrossProfit) : 0
    return { totalRevenue, totalCOGS, totalHolding, totalGrossProfit, avgMargin, yearlyExpenses, totalNetProfit, breakEvenUnits }
  }, [projection])

  /* ── Sync yearly net profit to partner equalization fetch ───────────────── */
  useEffect(() => {
    setEqNetProfit(yearly.totalNetProfit)
  }, [yearly.totalNetProfit])

  /* ── Render ─────────────────────────────────────────────────────────────── */
  if (loading) return (
    <div className="flex items-center justify-center h-40">
      <div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  // Pre-compute verdict helpers
  const hasInputs         = unitCost > 0 && catPrice > 0
  const isViable          = hasInputs && effectiveProfitPU > 0 && yearly.totalNetProfit > 0
  const isBirimKarli      = hasInputs && effectiveProfitPU > 0
  const monthsToBreakEven = yearly.breakEvenUnits > 0 && qty > 0
    ? Math.ceil(yearly.breakEvenUnits / qty) : null

  // Tax estimate (same 25% rate as dashboard)
  const CORP_TAX_RATE    = 25
  const estimatedCorpTax = Math.max(0, yearly.totalNetProfit) * CORP_TAX_RATE / 100
  const netAfterCorpTax  = yearly.totalNetProfit - estimatedCorpTax

  return (
    <div className="max-w-5xl space-y-5">
      {/* ── Header ───────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black">Simülasyon</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Parametreler aşağıda — sonuçlar hemen burada
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {annualRate === 0 && (
            <span className="text-xs bg-gray-100 text-gray-500 px-3 py-1.5 rounded-xl border border-gray-200">
              ℹ Faiz girilmedi, %0 varsayıldı ·{' '}
              <a href="/dashboard/settings" className="text-primary-500 hover:underline">ekle →</a>
            </span>
          )}
          <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-xl px-1 py-1">
            {CURRENCIES.map(c => (
              <button key={c} onClick={() => setDisplayCurrency(c)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  displayCurrency === c ? 'bg-primary-600 text-white' : 'text-gray-500 hover:bg-gray-100'
                }`}>
                {c}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── ACTION PANEL: "Satış yaparsam ne olur?" ──────────────────────────── */}
      <div className={`rounded-2xl border p-5 transition-colors ${
        !hasInputs         ? 'bg-gray-50 border-gray-200'
        : isViable         ? 'bg-emerald-50 border-emerald-200'
        : isBirimKarli     ? 'bg-amber-50 border-amber-200'
                           : 'bg-red-50 border-red-200'
      }`}>
        <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">
          Satış Yaparsam Ne Olur?
        </div>
        {!hasInputs ? (
          <p className="text-sm text-gray-500">Aşağıdan maliyet ve fiyat girin, karar burada belirecek.</p>
        ) : (
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex-1 min-w-0">
              {isViable ? (
                <p className="text-sm font-bold text-emerald-800">
                  ✓ Kârlı plan — {qty} adet/ay satışla yıllık{' '}
                  <span className="tabular-nums">{fmtC(toDisplay(yearly.totalNetProfit), S)}</span> net kâr
                </p>
              ) : isBirimKarli ? (
                <p className="text-sm font-bold text-amber-800">
                  Birim kârlı ama giderler yıllık{' '}
                  <span className="tabular-nums">{fmtC(toDisplay(Math.abs(yearly.totalNetProfit)), S)}</span> açık bırakıyor —
                  adedi artırın veya giderleri azaltın
                </p>
              ) : (
                <p className="text-sm font-bold text-red-800">
                  ✗ Zarar — birim başına{' '}
                  <span className="tabular-nums">{fmtC(toDisplay(Math.abs(effectiveProfitPU)), S)}</span> ekside.
                  Fiyatı artırın veya maliyeti düşürün.
                </p>
              )}
              {monthsToBreakEven !== null && isBirimKarli && (
                <p className="text-xs mt-1.5 text-gray-600">
                  Başabaş:{' '}
                  <span className="font-bold">{yearly.breakEvenUnits.toLocaleString('tr-TR')} adet</span>{' '}
                  satışta giderler karşılanır
                  {monthsToBreakEven <= 12 && (
                    <span className="text-gray-500"> (~{monthsToBreakEven} ay)</span>
                  )}
                </p>
              )}
            </div>
            <div className="shrink-0 text-right">
              <div className="text-[10px] text-gray-500 uppercase font-semibold tracking-wide">Aylık Net</div>
              <div className={`text-2xl font-black tabular-nums ${
                (projection[0]?.netProfit ?? 0) >= 0 ? 'text-emerald-700' : 'text-red-600'
              }`}>
                {fmtC(toDisplay(projection[0]?.netProfit ?? 0), S)}
              </div>
              <div className="text-[10px] text-gray-400">{qty} adet</div>
            </div>
          </div>
        )}
      </div>

      {/* ── HERO METRICS: 4 key numbers ──────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white border border-gray-200 rounded-2xl p-4">
          <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Birim Kâr</div>
          <div className={`text-2xl font-black tabular-nums leading-none ${
            !hasInputs ? 'text-gray-300' : effectiveProfitPU >= 0 ? 'text-emerald-700' : 'text-red-600'
          }`}>{hasInputs ? fmtC(toDisplay(effectiveProfitPU), S) : '—'}</div>
          <div className="text-[11px] text-gray-400 mt-1.5 leading-tight">
            {hasInputs
              ? `${fmtC(toDisplay(netPrice), S)} − ${fmtC(toDisplay(effectiveRealCost), S)}`
              : 'Maliyet ve fiyat girin'}
          </div>
        </div>
        <div className="bg-white border border-gray-200 rounded-2xl p-4">
          <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Kâr Marjı</div>
          <div className={`text-2xl font-black tabular-nums leading-none ${
            !hasInputs ? 'text-gray-300' : effectiveMargin >= 0 ? 'text-primary-700' : 'text-red-600'
          }`}>{hasInputs ? pct(effectiveMargin) : '—'}</div>
          <div className="text-[11px] text-gray-400 mt-1.5">Kâr / Gelir</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-2xl p-4">
          <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Yıllık Net</div>
          <div className={`text-2xl font-black tabular-nums leading-none ${
            !hasInputs ? 'text-gray-300' : yearly.totalNetProfit >= 0 ? 'text-emerald-700' : 'text-red-600'
          }`}>{hasInputs ? fmtC(toDisplay(yearly.totalNetProfit), S) : '—'}</div>
          <div className="text-[11px] text-gray-400 mt-1.5">
            {hasInputs ? `${qty * 12} adet · gider dahil` : 'Parametreler girin'}
          </div>
        </div>
        <div className="bg-white border border-gray-200 rounded-2xl p-4">
          <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Başabaş</div>
          {yearly.breakEvenUnits > 0 ? (
            <>
              <div className="text-2xl font-black tabular-nums leading-none text-amber-600">
                {yearly.breakEvenUnits.toLocaleString('tr-TR')}
                <span className="text-sm font-semibold ml-1">adet</span>
              </div>
              <div className="text-[11px] text-gray-400 mt-1.5">
                {monthsToBreakEven ? `≈ ${monthsToBreakEven} ay` : 'Giderleri karşılamak için'}
              </div>
            </>
          ) : (
            <div className="text-2xl font-black leading-none text-gray-300">—</div>
          )}
        </div>
      </div>

      {/* ── TAX EFFECT ───────────────────────────────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5">
        <h2 className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-4">
          Vergi Etkisi — Yıllık Tahmin
        </h2>
        <div className="grid grid-cols-3 gap-5 mb-4">
          <div>
            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Net Kâr (Vergi Öncesi)</div>
            <div className={`text-xl font-black tabular-nums ${
              !hasInputs ? 'text-gray-300' : yearly.totalNetProfit >= 0 ? 'text-gray-800' : 'text-red-600'
            }`}>{hasInputs ? fmtC(toDisplay(yearly.totalNetProfit), S) : '—'}</div>
          </div>
          <div>
            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">
              Kurumlar Vergisi (%{CORP_TAX_RATE})
            </div>
            <div className="text-xl font-black tabular-nums text-orange-600">
              {estimatedCorpTax > 0 ? `−${fmtC(toDisplay(estimatedCorpTax), S)}` : '—'}
            </div>
            <div className="text-[11px] text-gray-400 mt-0.5">Tahmini KV</div>
          </div>
          <div>
            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Vergi Sonrası Net</div>
            <div className={`text-xl font-black tabular-nums ${
              !hasInputs ? 'text-gray-300' : netAfterCorpTax >= 0 ? 'text-emerald-700' : 'text-red-600'
            }`}>{hasInputs ? fmtC(toDisplay(netAfterCorpTax), S) : '—'}</div>
            <div className="text-[11px] text-gray-400 mt-0.5">Ortaklara dağıtılabilir</div>
          </div>
        </div>
        {hasInputs && yearly.totalNetProfit > 0 && (
          <>
            <div className="flex rounded-full h-2 overflow-hidden bg-gray-100">
              <div className="bg-emerald-400 h-2" style={{ width: `${100 - CORP_TAX_RATE}%` }} />
              <div className="bg-orange-300 h-2" style={{ width: `${CORP_TAX_RATE}%` }} />
            </div>
            <div className="flex justify-between mt-1">
              <span className="text-[10px] text-emerald-600 font-semibold">%{100 - CORP_TAX_RATE} size kalır</span>
              <span className="text-[10px] text-orange-500 font-semibold">%{CORP_TAX_RATE} kurumlar vergisi</span>
            </div>
          </>
        )}
        {hasInputs && yearly.yearlyExpenses > 0 && (
          <div className="mt-3 pt-3 border-t border-gray-100 text-xs text-gray-400">
            Gider matrahı {fmtC(toDisplay(yearly.yearlyExpenses), S)} vergiden düşürülmüştür.
            KDV ayrıca Analitik sayfasında gösterilir.
          </div>
        )}
      </div>

      {/* ── PARTNER IMPACT ───────────────────────────────────────────────────── */}
      {partnerCount > 0 && yearly.totalNetProfit !== 0 && (
        <div className={`border rounded-2xl p-5 ${
          yearly.totalNetProfit > 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'
        }`}>
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-0.5">
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
              <div className="grid gap-3 mb-3"
                style={{ gridTemplateColumns: `repeat(${Math.min(partnerEq.entries.length, 4)}, 1fr)` }}>
                {partnerEq.entries.map(e => (
                  <div key={e.partner_id} className="bg-white rounded-xl px-4 py-3 text-center border border-emerald-100">
                    <div className="text-xs text-gray-500 font-semibold truncate mb-1">{e.partner_name}</div>
                    <div className="text-lg font-black tabular-nums text-emerald-700">
                      {fmtC(toDisplay(e.total_payout), S)}
                    </div>
                    <div className="text-[10px] text-gray-400 mt-0.5">%{(e.share_ratio * 100).toFixed(0)} pay</div>
                    {e.equalization_amount > 0.01 && (
                      <div className="text-[10px] text-amber-600 font-semibold mt-0.5">
                        +{fmtC(toDisplay(e.equalization_amount), S)} eşitleme
                      </div>
                    )}
                  </div>
                ))}
              </div>
              {partnerEq.total_equalization > 0.01 ? (
                <div className="text-xs text-amber-700 bg-amber-100 rounded-xl px-3 py-2 border border-amber-200">
                  ⚖ Bu plan <span className="font-bold">{fmtC(toDisplay(partnerEq.total_equalization), S)}</span> eşitleme açığını kapatır.{' '}
                  {partnerEq.remaining_after_eq > 0.01
                    ? `Kalan ${fmtC(toDisplay(partnerEq.remaining_after_eq), S)} hisse oranına göre dağıtılır.`
                    : 'Tüm tutar eşitlemeye gider.'}
                </div>
              ) : (
                <div className="text-xs text-emerald-700 bg-emerald-100 rounded-xl px-3 py-2 border border-emerald-200">
                  ✓ Ortak dengesi sağlıklı — tüm dağıtım hisse oranına göre yapılır.
                </div>
              )}
            </>
          ) : yearly.totalNetProfit > 0 ? (
            <div className="text-xs text-gray-400">Yükleniyor...</div>
          ) : (
            <div className="text-xs text-red-700 bg-red-100 rounded-xl px-3 py-2 border border-red-200">
              ⚠ Zarar durumunda ortak dağıtımı yapılamaz. Adet, fiyat veya gider parametrelerini ayarlayarak kâra geçin.
            </div>
          )}
        </div>
      )}

      {/* ── INPUTS — below results ────────────────────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-2xl p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Parametreler</h2>
          <span className="text-[10px] text-gray-400 italic">Sonuçlar yukarıda otomatik güncellenir ↑</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {/* Product selector */}
          <div>
            <label className={LAB}>Ürün Seç (opsiyonel)</label>
            <select
              className={IL}
              value={productId}
              onChange={e => {
                setProductId(e.target.value)
                if (!e.target.value) { setManualCost(''); setCatalogPrice('') }
              }}
            >
              <option value="">-- Manuel giris --</option>
              {products.map(p => (
                <option key={p.id} value={p.id}>{p.name} ({p.sku || '-'})</option>
              ))}
            </select>
          </div>

          {/* Unit cost */}
          <div>
            <label className={LAB}>Birim Maliyet</label>
            <input
              type="number" min="0" step="0.01"
              className={IL}
              value={manualCost}
              onChange={e => { setManualCost(e.target.value); if (productId) setProductId('') }}
              placeholder="0.00"
            />
          </div>

          {/* Catalog price */}
          <div>
            <label className={LAB}>Katalog Fiyatı</label>
            <input
              type="number" min="0" step="0.01"
              className={IL}
              value={catalogPrice}
              onChange={e => setCatalogPrice(e.target.value)}
              placeholder="0.00"
            />
          </div>

          {/* Monthly qty */}
          <div>
            <label className={LAB}>Aylık Satış Adedi</label>
            <input
              type="number" min="0" step="1"
              className={IL}
              value={monthlyQty}
              onChange={e => setMonthlyQty(e.target.value)}
              placeholder="100"
            />
          </div>

          {/* Discount */}
          <div>
            <label className={LAB}>İskonto (%)</label>
            <input
              type="number" min="0" max="100" step="0.1"
              className={IL}
              value={discount}
              onChange={e => setDiscount(e.target.value)}
              placeholder="0"
            />
          </div>

          {/* Interest rate */}
          <div>
            <label className={LAB}>
              Yıllık Faiz Oranı (%)
              {selectedProduct && (
                <span className="text-primary-500 normal-case font-normal ml-1">
                  — {getSaleCurrency(selectedProduct) ?? 'TRY'}
                </span>
              )}
            </label>
            <input
              type="number" min="0" step="0.1"
              className={IL}
              value={interestRate}
              onChange={e => setInterestRate(e.target.value)}
              placeholder={String(policyRates.TRY)}
            />
          </div>
        </div>

        {/* Sale date + holding + expense month */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <div>
            <label className={LAB}>Satış Tarihi</label>
            <input
              type="date"
              className={IL}
              value={saleDate}
              onChange={e => setSaleDate(e.target.value)}
            />
          </div>
          <div>
            <label className={LAB}>Gider Ayı</label>
            <input
              type="month"
              className={IL}
              value={expenseMonth}
              onChange={e => {
                const m = e.target.value
                setExpenseMonth(m)
                if (companyId) fetchMonthExpenses(companyId, m)
              }}
            />
          </div>
          <div className="flex items-end pb-1">
            <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm w-full">
              <span className="text-gray-400 text-xs uppercase tracking-wide font-semibold">Stok Tutma Süresi:</span>
              <span className="font-bold text-gray-700">
                {holdingDays} gün
                {holdingDays >= 30 && <span className="text-gray-400 font-normal"> ({(holdingDays / 30).toFixed(1)} ay)</span>}
              </span>
              {!entryDate && !productId && (
                <span className="text-xs text-amber-600 ml-2">(varsayılan 30 gün)</span>
              )}
              {!entryDate && productId && (
                <span className="text-xs text-amber-600 ml-2">(stok lotu bulunamadı, varsayılan 30 gün)</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Summary cards removed — metrics now live in hero strip above */}

      {/* ── Monthly projection table ──────────────────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-2xl p-6">
        <h2 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-4">Aylık Projeksiyon (12 Ay)</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                <th className="pb-2 pr-3">Ay</th>
                <th className="pb-2 pr-3 text-right">Adet</th>
                <th className="pb-2 pr-3 text-right">Gelir</th>
                <th className="pb-2 pr-3 text-right">SMM</th>
                <th className="pb-2 pr-3 text-right">Finansman</th>
                <th className="pb-2 pr-3 text-right">Brüt Kâr</th>
                <th className="pb-2 pr-3 text-right">Aylık Gider</th>
                <th className="pb-2 pr-3 text-right">Net Kâr</th>
                <th className="pb-2 text-right">Kümülatif Kâr</th>
              </tr>
            </thead>
            <tbody>
              {projection.map(r => (
                <tr key={r.month} className="border-b border-gray-50 hover:bg-gray-50/50">
                  <td className="py-2 pr-3 font-medium">{r.month}. Ay</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{r.qty.toLocaleString('tr-TR')}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{fmtC(toDisplay(r.revenue), S)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{fmtC(toDisplay(r.cogs), S)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{fmtC(toDisplay(r.holding), S)}</td>
                  <td className={`py-2 pr-3 text-right tabular-nums font-semibold ${r.grossProfit >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                    {fmtC(toDisplay(r.grossProfit), S)}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums text-red-600">{fmtC(toDisplay(r.expense), S)}</td>
                  <td className={`py-2 pr-3 text-right tabular-nums font-semibold ${r.netProfit >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                    {fmtC(toDisplay(r.netProfit), S)}
                  </td>
                  <td className={`py-2 text-right tabular-nums font-semibold ${r.cumProfit >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                    {fmtC(toDisplay(r.cumProfit), S)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Yearly totals ─────────────────────────────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-2xl p-6">
        <h2 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-4">Yıllık Toplam</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-5">
          {[
            { label: 'Toplam Gelir',                      value: fmtC(toDisplay(yearly.totalRevenue), S) },
            { label: 'Toplam Satılan Malın Maliyeti',     value: fmtC(toDisplay(yearly.totalCOGS), S) },
            { label: 'Toplam Finansman Maliyeti', value: fmtC(toDisplay(yearly.totalHolding), S) },
            {
              label: 'Brüt Kâr',
              value: fmtC(toDisplay(yearly.totalGrossProfit), S),
              color: yearly.totalGrossProfit >= 0 ? 'text-emerald-700' : 'text-red-600',
            },
          ].map(t => (
            <div key={t.label}>
              <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">{t.label}</div>
              <div className={`text-xl font-black tabular-nums ${t.color ?? 'text-gray-700'}`}>{t.value}</div>
            </div>
          ))}
        </div>

        {/* Expenses + Net Profit + Break-even */}
        <div className="mt-5 pt-5 border-t border-gray-100">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-5">
            <div>
              <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Yıllık Gider</div>
              <div className="text-xl font-black tabular-nums text-red-600">{fmtC(toDisplay(yearly.yearlyExpenses), S)}</div>
              <div className="text-[11px] text-gray-400 mt-0.5">{expenseMonth} gideri × 12 ay</div>
            </div>
            <div>
              <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Net Kâr</div>
              <div className={`text-xl font-black tabular-nums ${yearly.totalNetProfit >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                {fmtC(toDisplay(yearly.totalNetProfit), S)}
              </div>
              <div className="text-[11px] text-gray-400 mt-0.5">Brüt Kâr − Gider</div>
            </div>
            <div>
              <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Ortalama Marj</div>
              <div className={`text-xl font-black tabular-nums ${yearly.avgMargin >= 0 ? 'text-primary-700' : 'text-red-600'}`}>
                {pct(yearly.avgMargin)}
              </div>
            </div>
            {yearly.breakEvenUnits > 0 && (
              <div>
                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Başabaş Noktası</div>
                <div className="text-xl font-black tabular-nums text-amber-600">
                  {yearly.breakEvenUnits.toLocaleString('tr-TR')} adet
                </div>
                <div className="text-[11px] text-gray-400 mt-0.5">Giderleri karşılamak için</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Partner impact moved above inputs — see PARTNER IMPACT section */}

    </div>
  )
}
