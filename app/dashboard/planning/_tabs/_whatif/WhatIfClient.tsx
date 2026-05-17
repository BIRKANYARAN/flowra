'use client'
// WhatIfClient — Real interactive what-if sliders.
// All recalculation is pure client-side math (no API round-trips on slider move).
// Baseline = current month actuals loaded server-side; sliders mutate it live.

import { useState, useMemo } from 'react'

const FMT = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 })
function fmt(n: number) {
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
  if (abs >= 1_000)     return `${(n / 1_000).toFixed(1)}K`
  return FMT.format(n)
}
function fmtFull(n: number) {
  return (n < 0 ? '−' : '') + FMT.format(Math.abs(n))
}
function pct(v: number) { return `${(v * 100).toFixed(1).replace('.', ',')}%` }

interface Baseline {
  revenue:            number
  cogs:               number
  expenses:           number
  salesVat:           number
  purchaseVat:        number
  monthlyDebtService: number
}

interface Props {
  period:   string
  baseline: Baseline
}

export function WhatIfClient({ period, baseline }: Props) {

  // ── Slider states ─────────────────────────────────────────────────────────
  const [revChange,      setRevChange]      = useState(0)      // −50 → +50 %
  const [expChange,      setExpChange]      = useState(0)      // −30 → +50 %
  const [cogsChange,     setCogsChange]     = useState(0)      // −20 → +20 %
  const [collDelay,      setCollDelay]      = useState(0)      // 0 → 90 days
  const [debtChange,     setDebtChange]     = useState(0)      // −50 → +100 %
  const [taxRateOverride, setTaxRateOverride] = useState(25)   // 0 → 40 %

  // ── Computed outputs (pure math, instant) ─────────────────────────────────
  const result = useMemo(() => {
    const revenue  = Math.max(0, baseline.revenue  * (1 + revChange  / 100))
    const cogs     = Math.max(0, baseline.cogs     * (1 + cogsChange / 100))
    const expenses = Math.max(0, baseline.expenses * (1 + expChange  / 100))
    const debtSvc  = Math.max(0, baseline.monthlyDebtService * (1 + debtChange / 100))

    const grossProfit    = revenue - cogs
    const grossMarginPct = revenue > 0 ? grossProfit / revenue : 0
    const ebitda         = grossProfit - expenses
    const ebt            = ebitda - debtSvc
    const tax            = ebt > 0 ? ebt * taxRateOverride / 100 : 0
    const netIncome      = ebt - tax

    // Collection delay effect: % of revenue effectively delayed this month
    const collectionEfficiency = Math.max(0, 1 - collDelay / 90)
    const cashCollected = revenue * collectionEfficiency

    // Cash runway: how many months the current cash covers at current burn
    const monthlyBurn  = expenses + debtSvc
    const runwayMonths = netIncome < 0 && monthlyBurn > 0
      ? Math.max(0, cashCollected / monthlyBurn)
      : null

    // VAT net (proportional to revenue change)
    const revScale   = baseline.revenue > 0 ? revenue / baseline.revenue : 1
    const salesVat   = baseline.salesVat   * revScale
    const vatNet     = salesVat - baseline.purchaseVat

    // Distributable proxy: net income minus 5% legal reserve
    const legalReserve   = Math.max(0, netIncome * 0.05)
    const distributable  = Math.max(0, netIncome - legalReserve)
    const dividendWH     = distributable * 0.10
    const netDistrib     = distributable - dividendWH

    return {
      revenue, cogs, grossProfit, grossMarginPct,
      expenses, debtSvc, ebitda, ebt, tax, netIncome,
      cashCollected, runwayMonths,
      vatNet, distributable, dividendWH, netDistrib,
    }
  }, [revChange, expChange, cogsChange, collDelay, debtChange, taxRateOverride, baseline])

  // ── Baseline helpers ──────────────────────────────────────────────────────
  const baseGross   = baseline.revenue - baseline.cogs
  const baseEbitda  = baseGross - baseline.expenses
  const baseNet     = baseEbitda - baseline.monthlyDebtService

  const hasBaseline = baseline.revenue > 0

  return (
    <div className="space-y-5">

      {/* ── INTRO BANNER ─────────────────────────────────────────────────── */}
      <div className="px-4 py-3 bg-primary-50 border border-primary-100 rounded-xl flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-black text-primary-800">Senaryo Editörü — {period}</div>
          <div className="text-[10px] text-primary-500 mt-0.5">
            Kaydırıcıları hareket ettirin → P&amp;L, EBITDA, vergi ve dağıtım anında güncellenir
          </div>
        </div>
        {!hasBaseline && (
          <span className="text-[9px] bg-amber-100 text-amber-700 px-2 py-1 rounded-lg font-semibold flex-shrink-0">
            Kayıt yok — sıfır baz
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* ── LEFT: SLIDERS ───────────────────────────────────────────────── */}
        <div className="space-y-4">
          <div className="text-[9px] font-black uppercase tracking-widest text-gray-400">Değişkenler</div>

          <SliderRow
            label="Gelir Değişimi"
            value={revChange}
            min={-50} max={50} step={1}
            onChange={setRevChange}
            display={revChange > 0 ? `+${revChange}%` : `${revChange}%`}
            sub={`Baz: ₺${fmt(baseline.revenue)} → ₺${fmt(result.revenue)}`}
            positiveGood
          />

          <SliderRow
            label="Gider Değişimi"
            value={expChange}
            min={-30} max={50} step={1}
            onChange={setExpChange}
            display={expChange > 0 ? `+${expChange}%` : `${expChange}%`}
            sub={`Baz: ₺${fmt(baseline.expenses)} → ₺${fmt(result.expenses)}`}
            positiveGood={false}
          />

          <SliderRow
            label="COGS Değişimi"
            value={cogsChange}
            min={-20} max={30} step={1}
            onChange={setCogsChange}
            display={cogsChange > 0 ? `+${cogsChange}%` : `${cogsChange}%`}
            sub={`Baz: ₺${fmt(baseline.cogs)} → ₺${fmt(result.cogs)}`}
            positiveGood={false}
          />

          <SliderRow
            label="Tahsilat Gecikmesi"
            value={collDelay}
            min={0} max={90} step={5}
            onChange={setCollDelay}
            display={collDelay === 0 ? 'Yok' : `${collDelay} gün`}
            sub={`Tahsil oranı: %${Math.round((1 - collDelay / 90) * 100)}`}
            positiveGood={false}
          />

          <SliderRow
            label="Borç Servisi Değişimi"
            value={debtChange}
            min={-50} max={100} step={5}
            onChange={setDebtChange}
            display={debtChange > 0 ? `+${debtChange}%` : `${debtChange}%`}
            sub={`Baz: ₺${fmt(baseline.monthlyDebtService)}/ay → ₺${fmt(result.debtSvc)}/ay`}
            positiveGood={false}
          />

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-700">Kurumlar Vergisi Oranı</span>
              <span className="text-xs font-black tabular-nums text-gray-900">%{taxRateOverride}</span>
            </div>
            <input
              type="range" min={0} max={40} step={1}
              value={taxRateOverride}
              onChange={e => setTaxRateOverride(Number(e.target.value))}
              className="w-full h-1.5 appearance-none rounded-full bg-gray-200 accent-primary-600 cursor-pointer"
            />
            <div className="text-[9px] text-gray-400">Mevcut KVK oranı %25 · Bu tahminidir</div>
          </div>

          {/* Reset button */}
          {(revChange !== 0 || expChange !== 0 || cogsChange !== 0 || collDelay !== 0 || debtChange !== 0 || taxRateOverride !== 25) && (
            <button
              onClick={() => { setRevChange(0); setExpChange(0); setCogsChange(0); setCollDelay(0); setDebtChange(0); setTaxRateOverride(25) }}
              className="text-xs font-semibold text-gray-500 hover:text-gray-700 border border-gray-200 px-3 py-1.5 rounded-lg hover:border-gray-300 transition-colors"
            >
              ↺ Bazı Sıfırla
            </button>
          )}
        </div>

        {/* ── RIGHT: OUTPUT ───────────────────────────────────────────────── */}
        <div className="space-y-3">
          <div className="text-[9px] font-black uppercase tracking-widest text-gray-400">Sonuçlar</div>

          {/* P&L Summary */}
          <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
            <div className="px-4 py-2.5 bg-gray-50/60 border-b border-gray-100">
              <span className="text-[9px] font-black uppercase tracking-widest text-gray-400">Kar/Zarar Özeti</span>
            </div>
            <div className="divide-y divide-gray-50">
              <PnlRow label="Gelir"       value={result.revenue}      base={baseline.revenue}   indent={0} positive />
              <PnlRow label="COGS"        value={-result.cogs}        base={-baseline.cogs}     indent={1} />
              <PnlRow label="Brüt Kâr"   value={result.grossProfit}  base={baseGross}           indent={0} positive bold />
              <PnlRow label="Giderler"    value={-result.expenses}    base={-baseline.expenses} indent={1} />
              <PnlRow label="EBITDA"      value={result.ebitda}       base={baseEbitda}          indent={0} positive bold />
              <PnlRow label="Borç Srv."   value={-result.debtSvc}     base={-baseline.monthlyDebtService} indent={1} />
              <PnlRow label="Vergi"       value={-result.tax}         base={0}                  indent={1} />
              <PnlRow label="Net Kâr"     value={result.netIncome}    base={baseNet}             indent={0} positive bold accent />
            </div>
          </div>

          {/* Key metrics row */}
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-white border border-gray-100 rounded-xl px-3 py-2.5">
              <div className="text-[9px] font-black uppercase tracking-widest text-gray-400">Brüt Marj</div>
              <div className={`text-lg font-black tabular-nums ${result.grossMarginPct >= 0.25 ? 'text-emerald-700' : result.grossMarginPct > 0 ? 'text-amber-700' : 'text-red-600'}`}>
                {pct(result.grossMarginPct)}
              </div>
            </div>
            <div className="bg-white border border-gray-100 rounded-xl px-3 py-2.5">
              <div className="text-[9px] font-black uppercase tracking-widest text-gray-400">KDV Net</div>
              <div className={`text-lg font-black tabular-nums ${result.vatNet > 0 ? 'text-orange-600' : 'text-emerald-700'}`}>
                {result.vatNet > 0 ? '+' : ''}₺{fmt(result.vatNet)}
              </div>
              <div className="text-[9px] text-gray-400 mt-0.5">{result.vatNet > 0 ? 'ödenecek' : 'devreden'}</div>
            </div>
          </div>

          {/* Cash + distribution */}
          <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
            <div className="px-4 py-2.5 bg-gray-50/60 border-b border-gray-100">
              <span className="text-[9px] font-black uppercase tracking-widest text-gray-400">Dağıtım & Nakit</span>
            </div>
            <div className="px-4 py-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-gray-500">Tahsil edilen (bu ay)</span>
                <span className="text-[11px] font-black tabular-nums text-gray-800">₺{fmtFull(result.cashCollected)}</span>
              </div>
              {result.runwayMonths !== null && (
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-gray-500">Tahmini runway</span>
                  <span className={`text-[11px] font-black tabular-nums ${result.runwayMonths < 3 ? 'text-red-600' : 'text-amber-600'}`}>
                    {result.runwayMonths.toFixed(1)} ay
                  </span>
                </div>
              )}
              <div className="border-t border-gray-50 pt-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-gray-500">Dağıtılabilir (brüt)</span>
                  <span className={`text-[11px] font-black tabular-nums ${result.distributable > 0 ? 'text-emerald-700' : 'text-gray-400'}`}>
                    {result.distributable > 0 ? `₺${fmtFull(result.distributable)}` : '—'}
                  </span>
                </div>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-[10px] text-gray-500">− Stopaj (%10)</span>
                  <span className="text-[11px] tabular-nums text-gray-500">
                    {result.distributable > 0 ? `−₺${fmtFull(result.dividendWH ?? 0)}` : '—'}
                  </span>
                </div>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-[10px] font-semibold text-gray-700">Net Dağıtım</span>
                  <span className={`text-[12px] font-black tabular-nums ${result.netDistrib > 0 ? 'text-emerald-700' : 'text-gray-400'}`}>
                    {result.netDistrib > 0 ? `₺${fmtFull(result.netDistrib)}` : '—'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Stress indicator */}
          {result.netIncome < 0 && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-xs text-red-700">
              <span className="font-bold">⚠ Zarar senaryosu.</span>{' '}
              Bu kombinasyonda aylık <strong>₺{fmt(Math.abs(result.netIncome))}</strong> zarar edilir.
              {result.runwayMonths !== null && result.runwayMonths < 6 &&
                ` Mevcut nakitin ${result.runwayMonths.toFixed(1)} ay yeteceği tahmin edilmektedir.`}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SliderRow({
  label, value, min, max, step, onChange, display, sub, positiveGood,
}: {
  label:       string
  value:       number
  min:         number
  max:         number
  step:        number
  onChange:    (v: number) => void
  display:     string
  sub:         string
  positiveGood?: boolean
}) {
  const isChanged = value !== 0
  const isGood    = positiveGood ? value > 0 : value < 0
  const valueColor = !isChanged ? 'text-gray-500' : isGood ? 'text-emerald-700' : 'text-red-600'

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-700">{label}</span>
        <span className={`text-xs font-black tabular-nums ${valueColor}`}>{display}</span>
      </div>
      <input
        type="range" min={min} max={max} step={step}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full h-1.5 appearance-none rounded-full bg-gray-200 accent-primary-600 cursor-pointer"
      />
      <div className="text-[9px] text-gray-400">{sub}</div>
    </div>
  )
}

function PnlRow({
  label, value, base, indent, positive, bold, accent,
}: {
  label:    string
  value:    number
  base:     number
  indent:   number
  positive?: boolean
  bold?:    boolean
  accent?:  boolean
}) {
  const changed    = Math.abs(value - base) > 0.5
  const improved   = positive ? value > base : value > base
  const deltaColor = changed
    ? (positive ? (value > base ? 'text-emerald-600' : 'text-red-500')
                : (value < base ? 'text-emerald-600' : 'text-red-500'))
    : 'text-gray-300'

  return (
    <div className={`flex items-center justify-between px-4 py-2 ${accent ? 'bg-gray-50/60' : ''}`}
         style={{ paddingLeft: `${16 + indent * 12}px` }}>
      <span className={`text-[10px] ${bold ? 'font-black text-gray-800' : 'text-gray-500'}`}>{label}</span>
      <div className="flex items-center gap-2">
        {changed && (
          <span className={`text-[9px] font-semibold tabular-nums ${deltaColor}`}>
            {value > base ? '▲' : '▼'}{Math.abs(value - base) >= 1000
              ? `₺${fmt(Math.abs(value - base))}`
              : `₺${Math.abs(Math.round(value - base))}`}
          </span>
        )}
        <span className={`text-[11px] tabular-nums ${bold ? 'font-black' : 'font-semibold'} ${
          accent ? (value >= 0 ? 'text-emerald-700' : 'text-red-600')
                 : (value >= 0 ? 'text-gray-800'    : 'text-red-500')
        }`}>
          {value >= 0 ? '' : '−'}₺{fmt(Math.abs(value))}
        </span>
      </div>
    </div>
  )
}
