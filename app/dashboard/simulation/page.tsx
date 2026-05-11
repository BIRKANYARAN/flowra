'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSupabase } from '@/lib/hooks/useSupabase'
import { CURRENCIES, type Currency, type Product, type RecurringProjectionMonth } from '@/types'
import { round2 } from '@/lib/calc'
import { getSalePrice, getSaleCurrency, getLegacyProductCost } from '@/lib/product-adapter'
import { resolveCompanyId } from '@/lib/resolve-company'

/* ── Style tokens ───────────────────────────────────────────────────────────── */
const IL  = 'w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-primary-400 bg-white transition-colors'
const LAB = 'block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5'

function currSym(c: string): string {
  return c === 'USD' ? '$' : c === 'EUR' ? '€' : '₺'
}

function fmtC(n: number, sym: string) {
  return sym + Number(n || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}


function pct(n: number) {
  return '%' + Number(n || 0).toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
}

/** Format YYYY-MM as Turkish short month name + year */
function fmtMonth(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  const names = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara']
  return `${names[m - 1] ?? ym} ${y}`
}

/* ── Partner equalization types ─────────────────────────────────────────────── */
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

/* ── Debt burden types (from partner.service) ───────────────────────────────── */
interface DebtBurdenSummary {
  total_outstanding:     number
  total_loans_given:     number
  total_loans_repaid:    number
  weighted_avg_per_unit: number
  is_balanced:           boolean
  equalization_needed:   number
  partner_count:         number
}
interface DebtBurdenResult {
  entries: unknown[]
  summary: DebtBurdenSummary
}

/* ── Component ──────────────────────────────────────────────────────────────── */
export default function SimulationPage() {
  const supabase = useSupabase()

  /* data from DB */
  const [products, setProducts]   = useState<Product[]>([])
  const [loading, setLoading]     = useState(true)

  /* Policy rates per currency (from DB) */
  const [policyRates, setPolicyRates] = useState<{ TRY: number; USD: number; EUR: number }>({ TRY: 0, USD: 0, EUR: 0 })

  /* FX rates for multi-currency display */
  const [fxRates, setFxRates]         = useState<{ USD: number; EUR: number }>({ USD: 0, EUR: 0 })
  const [displayCurrency, setDisplayCurrency] = useState<Currency>('TRY')

  /* Partner equalization */
  const [partnerEq,    setPartnerEq]    = useState<SimEqResult>(ZERO_SIM_EQ)
  const [partnerCount, setPartnerCount] = useState(0)

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
  const [interestRate, setInterestRate] = useState('')
  const [saleDate,     setSaleDate]     = useState(new Date().toISOString().slice(0, 10))
  const [userId,       setUserId]       = useState<string | null>(null)
  const [companyId,    setCompanyId]    = useState<string | null>(null)

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

  /* ── Load products & policy rates ───────────────────────────────────────── */
  const load = useCallback(async () => {
    const { data: authData, error: authError } = await supabase.auth.getUser()
    if (authError || !authData?.user) { setLoading(false); return }
    const user = authData.user
    const cid  = await resolveCompanyId(user.id, supabase)
    setUserId(user.id)
    setCompanyId(cid)

    const today = new Date().toISOString().slice(0, 10)

    const [pRes, tryRateRes, usdRateRes, eurRateRes] = await Promise.all([
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

    const tryRate = pRes.data && tryRateRes.data?.[0] ? Number(tryRateRes.data[0].annual_rate) : 0
    const usdRate = usdRateRes.data?.[0] ? Number(usdRateRes.data[0].annual_rate) : 0
    const eurRate = eurRateRes.data?.[0] ? Number(eurRateRes.data[0].annual_rate) : 0
    setPolicyRates({ TRY: tryRate, USD: usdRate, EUR: eurRate })
    setInterestRate(String(tryRate))

    setLoading(false)

    // Fetch FX rates
    try {
      const fxRes  = await fetch('/api/fx', { cache: 'no-store' })
      const fxData = await fxRes.json()
      if (fxRes.ok && fxData.USD > 0) {
        setFxRates({ USD: Number(fxData.USD), EUR: Number(fxData.EUR) })
      }
    } catch { /* non-fatal */ }

    // Count partners
    try {
      const partnersRes = await fetch('/api/partners')
      if (partnersRes.ok) {
        const pData = await partnersRes.json()
        setPartnerCount(Array.isArray(pData) ? pData.length : 0)
      }
    } catch { /* non-fatal */ }
  }, [supabase])

  useEffect(() => {
    void load()
    void fetchRecurringProjection()
    void fetchDebtBurden()
  }, [load, fetchRecurringProjection, fetchDebtBurden])

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
      setInterestRate(String(policyRates.TRY))
    }
  }, [selectedProduct, supabase, companyId, policyRates])

  /* ── Parsed numeric inputs ──────────────────────────────────────────────── */
  const unitCost    = parseFloat(manualCost) || 0
  const catPrice    = parseFloat(catalogPrice) || 0
  const qty         = parseInt(monthlyQty, 10) || 0
  const discountPct = parseFloat(discount) || 0
  const annualRate  = parseFloat(interestRate) || 0

  /* ── Holding time ───────────────────────────────────────────────────────── */
  const holdingDays = useMemo(() => {
    if (!entryDate) return 30
    const entry = new Date(entryDate)
    const sale  = new Date(saleDate)
    return Math.max(0, Math.round((sale.getTime() - entry.getTime()) / 86_400_000))
  }, [entryDate, saleDate])

  const rateBlocked: boolean = false

  /* ── Core per-unit calculations ─────────────────────────────────────────── */
  const clampedDiscount   = Math.min(100, Math.max(0, discountPct))
  const realCost          = rateBlocked ? unitCost : round2(unitCost * (1 + annualRate / 100 * holdingDays / 365))
  const netPrice          = round2(catPrice * (1 - clampedDiscount / 100))

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
      } catch { /* fallback */ }
      setBackendRealCost(null)
    })()
  }, [selectedProduct, userId, supabase])

  const effectiveRealCost = backendRealCost !== null && selectedProduct ? backendRealCost : realCost
  const effectiveProfitPU = rateBlocked ? 0 : round2(netPrice - effectiveRealCost)
  const effectiveHoldingPU = round2(effectiveRealCost - unitCost)
  const effectiveMargin   = rateBlocked ? 0 : (netPrice > 0 ? round2((effectiveProfitPU / netPrice) * 100) : 0)

  /* ── Monthly projection (12 months) using per-month recurring expenses ─── */
  const projection = useMemo(() => {
    // Build a lookup from YYYY-MM → recurring expense amount
    const recurringByMonth = new Map<string, number>()
    for (const row of recurringProjection) {
      recurringByMonth.set(row.month, row.amount_try)
    }

    // Generate YYYY-MM for the next 12 months starting from current month
    const now = new Date()
    const startYear  = now.getFullYear()
    const startMonth = now.getMonth() + 1 // 1-based

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
      // Use actual recurring projection for this month (fallback to 0 if not loaded)
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
    const totalUnits       = projection.reduce((s, r) => s + qty, 0)
    const unitGrossProfit  = totalUnits > 0 ? totalGrossProfit / totalUnits : 0
    const breakEvenUnits   = unitGrossProfit > 0 ? Math.ceil(yearlyExpenses / unitGrossProfit) : 0
    return { totalRevenue, totalCOGS, totalHolding, totalGrossProfit, avgMargin, yearlyExpenses, totalNetProfit, breakEvenUnits }
  }, [projection, qty])

  /* ── Sync yearly net profit to partner equalization fetch ───────────────── */
  useEffect(() => {
    setEqNetProfit(yearly.totalNetProfit)
  }, [yearly.totalNetProfit])

  /* ── Loading state ──────────────────────────────────────────────────────── */
  if (loading) return (
    <div className="flex items-center justify-center h-40">
      <div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

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
  const totalOutstanding   = debtBurden?.summary.total_outstanding ?? 0
  const monthlyDistributable = netAfterCorpTax / 12
  const monthsToClear = monthlyDistributable > 0
    ? Math.ceil(totalOutstanding / monthlyDistributable)
    : null

  function debtStatus() {
    if (totalOutstanding <= 0) return { label: 'Borç yok — tam dağıtım kapasitesi', color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200' }
    if (monthlyDistributable <= 0) return { label: 'Kritik nakit riski — borç ödenemez', color: 'text-red-700', bg: 'bg-red-50', border: 'border-red-200' }
    if (monthsToClear !== null && monthsToClear > 24) return { label: 'Borç baskısı yüksek — 2 yıldan uzun', color: 'text-red-700', bg: 'bg-red-50', border: 'border-red-200' }
    if (monthsToClear !== null && monthsToClear > 12) return { label: 'Borç baskısı azalıyor — 1-2 yıl', color: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200' }
    return { label: 'Güvenli dağıtım bölgesi — 12 ay içinde', color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200' }
  }
  const ds = debtStatus()

  return (
    <div className="max-w-5xl space-y-4">

      {/* ── Dark header bar ───────────────────────────────────────────────────── */}
      <div className="bg-gray-950 text-white rounded-xl px-5 py-3 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mr-3">Simülasyon</span>
          {!hasInputs ? (
            <span className="text-sm text-gray-400">Maliyet ve fiyat girerek başlayın</span>
          ) : isViable ? (
            <span className="text-sm font-bold text-emerald-400">
              ✓ Kârlı plan &mdash; {qty} adet/ay &middot; yıllık{' '}
              <span className="tabular-nums">{fmtC(toDisplay(yearly.totalNetProfit), S)}</span> net
            </span>
          ) : isBirimKarli ? (
            <span className="text-sm font-bold text-amber-400">
              Birim kârlı &mdash; giderler yıllık{' '}
              <span className="tabular-nums">{fmtC(toDisplay(Math.abs(yearly.totalNetProfit)), S)}</span> açık bırakıyor
            </span>
          ) : (
            <span className="text-sm font-bold text-red-400">
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
          <div className="flex items-center gap-1 bg-gray-800 border border-gray-700 rounded-lg px-1 py-0.5">
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

      {/* ── HERO METRICS: 4 cards ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-0 bg-white border border-gray-200 rounded-xl overflow-hidden">
        {[
          {
            label: 'Birim Kâr',
            value: hasInputs ? fmtC(toDisplay(effectiveProfitPU), S) : '—',
            sub:   hasInputs ? `${fmtC(toDisplay(netPrice), S)} − ${fmtC(toDisplay(effectiveRealCost), S)}` : 'Maliyet ve fiyat girin',
            color: !hasInputs ? 'text-gray-300' : effectiveProfitPU >= 0 ? 'text-emerald-700' : 'text-red-600',
          },
          {
            label: 'Kâr Marjı',
            value: hasInputs ? pct(effectiveMargin) : '—',
            sub:   'Kâr / Gelir',
            color: !hasInputs ? 'text-gray-300' : effectiveMargin >= 0 ? 'text-primary-700' : 'text-red-600',
          },
          {
            label: 'Yıllık Net',
            value: hasInputs ? fmtC(toDisplay(yearly.totalNetProfit), S) : '—',
            sub:   hasInputs ? `${qty * 12} adet · gider dahil` : 'Parametreler girin',
            color: !hasInputs ? 'text-gray-300' : yearly.totalNetProfit >= 0 ? 'text-emerald-700' : 'text-red-600',
          },
          {
            label: 'Başabaş',
            value: yearly.breakEvenUnits > 0 ? `${yearly.breakEvenUnits.toLocaleString('tr-TR')} adet` : '—',
            sub:   monthsToBreakEven ? `≈ ${monthsToBreakEven} ay` : 'Giderleri karşılamak için',
            color: yearly.breakEvenUnits > 0 ? 'text-amber-600' : 'text-gray-300',
          },
        ].map((card, i) => (
          <div key={card.label}
            className={`p-3 ${i < 3 ? 'border-b sm:border-b-0 sm:border-r border-gray-100' : ''}`}>
            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">{card.label}</div>
            <div className={`text-xl font-black tabular-nums leading-none ${card.color}`}>{card.value}</div>
            <div className="text-[10px] text-gray-400 mt-1 leading-tight">{card.sub}</div>
          </div>
        ))}
      </div>

      {/* ── TAX EFFECT ───────────────────────────────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <h2 className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-3">
          Vergi Etkisi — Yıllık Tahmin
        </h2>
        <div className="grid grid-cols-3 gap-4 mb-3">
          <div>
            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-0.5">Net Kâr (Vergi Öncesi)</div>
            <div className={`text-lg font-black tabular-nums ${!hasInputs ? 'text-gray-300' : yearly.totalNetProfit >= 0 ? 'text-gray-800' : 'text-red-600'}`}>
              {hasInputs ? fmtC(toDisplay(yearly.totalNetProfit), S) : '—'}
            </div>
          </div>
          <div>
            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-0.5">
              Kurumlar Vergisi (%{CORP_TAX_RATE})
            </div>
            <div className="text-lg font-black tabular-nums text-orange-600">
              {estimatedCorpTax > 0 ? `−${fmtC(toDisplay(estimatedCorpTax), S)}` : '—'}
            </div>
            <div className="text-[10px] text-gray-400 mt-0.5">Tahmini KV</div>
          </div>
          <div>
            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-0.5">Vergi Sonrası Net</div>
            <div className={`text-lg font-black tabular-nums ${!hasInputs ? 'text-gray-300' : netAfterCorpTax >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
              {hasInputs ? fmtC(toDisplay(netAfterCorpTax), S) : '—'}
            </div>
            <div className="text-[10px] text-gray-400 mt-0.5">Ortaklara dağıtılabilir</div>
          </div>
        </div>
        {hasInputs && yearly.totalNetProfit > 0 && (
          <>
            <div className="flex rounded-full h-1.5 overflow-hidden bg-gray-100">
              <div className="bg-emerald-400 h-1.5" style={{ width: `${100 - CORP_TAX_RATE}%` }} />
              <div className="bg-orange-300 h-1.5" style={{ width: `${CORP_TAX_RATE}%` }} />
            </div>
            <div className="flex justify-between mt-0.5">
              <span className="text-[10px] text-emerald-600 font-semibold">%{100 - CORP_TAX_RATE} size kalır</span>
              <span className="text-[10px] text-orange-500 font-semibold">%{CORP_TAX_RATE} kurumlar vergisi</span>
            </div>
          </>
        )}
        {hasInputs && yearly.yearlyExpenses > 0 && (
          <div className="mt-2 pt-2 border-t border-gray-100 text-[10px] text-gray-400">
            Gider matrahı {fmtC(toDisplay(yearly.yearlyExpenses), S)} vergiden düşürülmüştür.
            KDV ayrıca Analitik sayfasında gösterilir.
          </div>
        )}
      </div>

      {/* ── PARTNER IMPACT ───────────────────────────────────────────────────── */}
      {partnerCount > 0 && yearly.totalNetProfit !== 0 && (
        <div className={`border rounded-xl p-4 ${
          yearly.totalNetProfit > 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'
        }`}>
          <div className="flex items-center justify-between mb-2">
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
              <div className="grid gap-2 mb-2"
                style={{ gridTemplateColumns: `repeat(${Math.min(partnerEq.entries.length, 4)}, 1fr)` }}>
                {partnerEq.entries.map(e => (
                  <div key={e.partner_id} className="bg-white rounded-xl px-3 py-2 text-center border border-emerald-100">
                    <div className="text-xs text-gray-500 font-semibold truncate mb-0.5">{e.partner_name}</div>
                    <div className="text-base font-black tabular-nums text-emerald-700">
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
              ⚠ Zarar durumunda ortak dağıtımı yapılamaz. Parametreleri ayarlayarak kâra geçin.
            </div>
          )}
        </div>
      )}

      {/* ── INPUTS ────────────────────────────────────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Parametreler</h2>
          <span className="text-[10px] text-gray-400 italic">Sonuçlar yukarıda otomatik güncellenir ↑</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
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

        {/* Sale date + holding + expense info */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className={LAB}>Satış Tarihi</label>
            <input
              type="date"
              className={IL}
              value={saleDate}
              onChange={e => setSaleDate(e.target.value)}
            />
          </div>
          {/* Expense month picker replaced with info note */}
          <div className="flex items-end">
            <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5 text-xs text-blue-700 w-full">
              ℹ Giderler tekrarlı gider planından otomatik hesaplanır
              {recurringLoading && <span className="ml-2 opacity-60">yükleniyor…</span>}
            </div>
          </div>
          <div className="flex items-end">
            <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-xs w-full">
              <span className="text-gray-400 uppercase tracking-wide font-semibold block mb-0.5">Stok Tutma Süresi</span>
              <span className="font-bold text-gray-700">
                {holdingDays} gün
                {holdingDays >= 30 && <span className="text-gray-400 font-normal"> ({(holdingDays / 30).toFixed(1)} ay)</span>}
              </span>
              {!entryDate && !productId && (
                <span className="text-amber-600 ml-2">(varsayılan 30 gün)</span>
              )}
              {!entryDate && productId && (
                <span className="text-amber-600 ml-2">(stok lotu bulunamadı)</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Monthly projection table ──────────────────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <h2 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Aylık Projeksiyon (12 Ay)</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-gray-50">
              <tr className="border-b border-gray-100 text-left text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                <th className="py-1.5 pr-3">Ay</th>
                <th className="py-1.5 pr-3 text-right">Gelir</th>
                <th className="py-1.5 pr-3 text-right">SMM</th>
                <th className="py-1.5 pr-3 text-right">Finansman</th>
                <th className="py-1.5 pr-3 text-right">Brüt Kâr</th>
                <th className="py-1.5 pr-3 text-right">Tekrarlı Gider</th>
                <th className="py-1.5 pr-3 text-right">Net Kâr</th>
                <th className="py-1.5 text-right">Kümülatif</th>
              </tr>
            </thead>
            <tbody>
              {projection.map(r => (
                <tr key={r.month} className="border-b border-gray-50 hover:bg-gray-50/50">
                  <td className="py-1.5 pr-3 font-medium text-gray-600">{r.month}. Ay</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{fmtC(toDisplay(r.revenue), S)}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums text-gray-500">{fmtC(toDisplay(r.cogs), S)}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums text-gray-500">{fmtC(toDisplay(r.holding), S)}</td>
                  <td className={`py-1.5 pr-3 text-right tabular-nums font-semibold ${r.grossProfit >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                    {fmtC(toDisplay(r.grossProfit), S)}
                  </td>
                  <td className="py-1.5 pr-3 text-right tabular-nums text-red-600">{fmtC(toDisplay(r.expense), S)}</td>
                  <td className={`py-1.5 pr-3 text-right tabular-nums font-semibold ${r.netProfit >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                    {fmtC(toDisplay(r.netProfit), S)}
                  </td>
                  <td className={`py-1.5 text-right tabular-nums font-semibold ${r.cumProfit >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                    {fmtC(toDisplay(r.cumProfit), S)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Yearly totals ─────────────────────────────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <h2 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Yıllık Toplam</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {[
            { label: 'Toplam Gelir',               value: fmtC(toDisplay(yearly.totalRevenue), S) },
            { label: 'Toplam SMM',                 value: fmtC(toDisplay(yearly.totalCOGS), S) },
            { label: 'Toplam Finansman Maliyeti',  value: fmtC(toDisplay(yearly.totalHolding), S) },
            {
              label: 'Brüt Kâr',
              value: fmtC(toDisplay(yearly.totalGrossProfit), S),
              color: yearly.totalGrossProfit >= 0 ? 'text-emerald-700' : 'text-red-600',
            },
          ].map(t => (
            <div key={t.label}>
              <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-0.5">{t.label}</div>
              <div className={`text-lg font-black tabular-nums ${t.color ?? 'text-gray-700'}`}>{t.value}</div>
            </div>
          ))}
        </div>
        <div className="mt-4 pt-4 border-t border-gray-100 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          <div>
            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-0.5">Yıllık Gider (Tekrarlı)</div>
            <div className="text-lg font-black tabular-nums text-red-600">{fmtC(toDisplay(yearly.yearlyExpenses), S)}</div>
            <div className="text-[10px] text-gray-400 mt-0.5">Tekrarlı gider planından</div>
          </div>
          <div>
            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-0.5">Net Kâr</div>
            <div className={`text-lg font-black tabular-nums ${yearly.totalNetProfit >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
              {fmtC(toDisplay(yearly.totalNetProfit), S)}
            </div>
            <div className="text-[10px] text-gray-400 mt-0.5">Brüt Kâr − Gider</div>
          </div>
          <div>
            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-0.5">Ortalama Marj</div>
            <div className={`text-lg font-black tabular-nums ${yearly.avgMargin >= 0 ? 'text-primary-700' : 'text-red-600'}`}>
              {pct(yearly.avgMargin)}
            </div>
          </div>
          {yearly.breakEvenUnits > 0 && (
            <div>
              <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-0.5">Başabaş Noktası</div>
              <div className="text-lg font-black tabular-nums text-amber-600">
                {yearly.breakEvenUnits.toLocaleString('tr-TR')} adet
              </div>
              <div className="text-[10px] text-gray-400 mt-0.5">Giderleri karşılamak için</div>
            </div>
          )}
        </div>
      </div>

      {/* ── FINANSAL BASKI ZAMAN ÇİZELGESİ ──────────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <h2 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">
          Finansal Baskı Zaman Çizelgesi
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-gray-50">
              <tr className="border-b border-gray-100 text-left text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                <th className="py-1.5 pr-3">Ay</th>
                <th className="py-1.5 pr-3 text-right">Gelir</th>
                <th className="py-1.5 pr-3 text-right">Tekrarlı Giderler</th>
                <th className="py-1.5 pr-3 text-right">Brüt Kâr</th>
                <th className="py-1.5 pr-3 text-right">Net Kâr</th>
                <th className="py-1.5 pr-3 text-right">Kümülatif Nakit</th>
                <th className="py-1.5 text-right">Baskı</th>
              </tr>
            </thead>
            <tbody>
              {projection.map(r => {
                // Pressure indicator
                let pressureLabel: string
                let pressureClass: string
                if (r.cumProfit < 0) {
                  pressureLabel = 'Kritik'
                  pressureClass = 'bg-red-100 text-red-700'
                } else if (r.netProfit < 0) {
                  pressureLabel = 'Dikkat'
                  pressureClass = 'bg-amber-100 text-amber-700'
                } else {
                  pressureLabel = 'Güvenli'
                  pressureClass = 'bg-emerald-100 text-emerald-700'
                }

                return (
                  <tr key={r.ym} className="border-b border-gray-50 hover:bg-gray-50/50">
                    <td className="py-1.5 pr-3 font-medium text-gray-600">{fmtMonth(r.ym)}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{fmtC(toDisplay(r.revenue), S)}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums text-red-600">{fmtC(toDisplay(r.expense), S)}</td>
                    <td className={`py-1.5 pr-3 text-right tabular-nums font-semibold ${r.grossProfit >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                      {fmtC(toDisplay(r.grossProfit), S)}
                    </td>
                    <td className={`py-1.5 pr-3 text-right tabular-nums font-semibold ${r.netProfit >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                      {fmtC(toDisplay(r.netProfit), S)}
                    </td>
                    <td className={`py-1.5 pr-3 text-right tabular-nums font-semibold ${r.cumProfit >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                      {fmtC(toDisplay(r.cumProfit), S)}
                    </td>
                    <td className="py-1.5 text-right">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${pressureClass}`}>
                        {pressureLabel}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── BORÇ BASKISI TAKİBİ ───────────────────────────────────────────────── */}
      <div className={`border rounded-xl p-4 ${ds.bg} ${ds.border}`}>
        <h2 className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-3">
          Borç Baskısı Takibi
        </h2>
        {debtBurdenLoading ? (
          <div className="text-xs text-gray-400">Yükleniyor...</div>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-3">
              <div>
                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-0.5">Toplam Borç</div>
                <div className="text-lg font-black tabular-nums text-gray-800">
                  {totalOutstanding > 0 ? fmtC(toDisplay(totalOutstanding), S) : '—'}
                </div>
                <div className="text-[10px] text-gray-400">Ortaklara kalan</div>
              </div>
              <div>
                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-0.5">Aylık Dağıtım Kapasitesi</div>
                <div className={`text-lg font-black tabular-nums ${monthlyDistributable >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                  {hasInputs ? fmtC(toDisplay(monthlyDistributable), S) : '—'}
                </div>
                <div className="text-[10px] text-gray-400">Vergi sonrası / 12</div>
              </div>
              <div>
                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-0.5">Tahmini Temizlenme</div>
                <div className={`text-lg font-black tabular-nums ${
                  monthsToClear === null ? 'text-gray-300'
                  : monthsToClear > 24 ? 'text-red-600'
                  : monthsToClear > 12 ? 'text-amber-600'
                  : 'text-emerald-700'
                }`}>
                  {totalOutstanding <= 0 ? '—'
                    : monthsToClear === null ? '∞'
                    : `${monthsToClear} ay`}
                </div>
                <div className="text-[10px] text-gray-400">Borç / aylık kapasite</div>
              </div>
              <div>
                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-0.5">Ortak Sayısı</div>
                <div className="text-lg font-black tabular-nums text-gray-700">
                  {debtBurden?.summary.partner_count ?? partnerCount}
                </div>
                <div className="text-[10px] text-gray-400">Aktif ortak</div>
              </div>
            </div>
            <div className={`rounded-xl px-3 py-2 border text-xs font-semibold ${ds.color} ${ds.bg} ${ds.border}`}>
              {ds.label}
            </div>
          </>
        )}
      </div>

    </div>
  )
}
