'use client'
// WhatIfClient — Real interactive what-if sliders.
// All recalculation is pure client-side math (no API round-trips on slider move).
// Baseline = current month actuals loaded server-side; sliders mutate it live.

import { useState, useMemo, useCallback, useEffect } from 'react'

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

interface SavedScenario {
  id:          string
  name:        string
  savedAt:     string
  is_baseline?: boolean
  sliders: {
    revChange:      number
    expChange:      number
    cogsChange:     number
    collDelay:      number
    debtChange:     number
    taxRateOverride: number
  }
  summary: {
    netIncome:       number
    grossMarginPct:  number
    distributable:   number
    runwayMonths:    number | null
  }
}

const STORAGE_KEY = 'flowra_whatif_scenarios'
const MAX_SAVED   = 20

// ── localStorage helpers (offline / optimistic fallback) ──────────────────────
function loadLocal(): SavedScenario[] {
  try {
    const raw = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null
    return raw ? (JSON.parse(raw) as SavedScenario[]) : []
  } catch { return [] }
}
function persistLocal(scenarios: SavedScenario[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(scenarios)) } catch { /* quota */ }
}

// ── DB helpers — best-effort, errors are non-fatal ────────────────────────────
async function fetchDBScenarios(): Promise<SavedScenario[]> {
  try {
    const res  = await fetch('/api/simulation/scenarios', { cache: 'no-store' })
    if (!res.ok) return []
    const json = await res.json() as { scenarios?: Array<{ id: string; name: string; is_baseline: boolean; inputs: { sliders: SavedScenario['sliders'] }; summary: SavedScenario['summary']; created_at: string }> }
    return (json.scenarios ?? []).map(r => ({
      id:          r.id,
      name:        r.name,
      savedAt:     r.created_at,
      is_baseline: r.is_baseline ?? false,
      sliders: r.inputs?.sliders ?? { revChange: 0, expChange: 0, cogsChange: 0, collDelay: 0, debtChange: 0, taxRateOverride: 25 },
      summary: r.summary ?? { netIncome: 0, grossMarginPct: 0, distributable: 0, runwayMonths: null },
    }))
  } catch { return [] }
}

async function saveDBScenario(
  name: string,
  sliders: SavedScenario['sliders'],
  summary: SavedScenario['summary'],
): Promise<string | null> {
  try {
    const res  = await fetch('/api/simulation/scenarios', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ name, inputs: { sliders }, summary }),
    })
    if (!res.ok) return null
    const json = await res.json() as { scenario?: { id: string } }
    return json.scenario?.id ?? null
  } catch { return null }
}

async function deleteDBScenario(id: string): Promise<void> {
  // UUIDs from DB; skip for local-only IDs (timestamp strings)
  if (!id.includes('-')) return
  try {
    await fetch(`/api/simulation/scenarios/${id}`, { method: 'DELETE' })
  } catch { /* non-fatal */ }
}

async function markDBBaseline(id: string): Promise<boolean> {
  if (!id.includes('-')) return false
  try {
    const res = await fetch(`/api/simulation/scenarios/${id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ is_baseline: true }),
    })
    return res.ok
  } catch { return false }
}

// ── Pure scenario compute (no React state — usable outside component) ─────────
function computeScenario(sliders: SavedScenario['sliders'], baseline: Baseline) {
  const revenue  = Math.max(0, baseline.revenue  * (1 + sliders.revChange  / 100))
  const cogs     = Math.max(0, baseline.cogs     * (1 + sliders.cogsChange / 100))
  const expenses = Math.max(0, baseline.expenses * (1 + sliders.expChange  / 100))
  const debtSvc  = Math.max(0, baseline.monthlyDebtService * (1 + sliders.debtChange / 100))
  const grossProfit    = revenue - cogs
  const grossMarginPct = revenue > 0 ? grossProfit / revenue : 0
  const ebitda         = grossProfit - expenses
  const ebt            = ebitda - debtSvc
  const tax            = ebt > 0 ? ebt * sliders.taxRateOverride / 100 : 0
  const netIncome      = ebt - tax
  const distributable  = Math.max(0, netIncome * 0.95) // after 5% legal reserve
  const monthlyBurn    = expenses + debtSvc
  const runwayMonths   = netIncome < 0 && monthlyBurn > 0
    ? Math.max(0, revenue / monthlyBurn)
    : null
  return { revenue, cogs, grossProfit, grossMarginPct, expenses, debtSvc, ebitda, ebt, tax, netIncome, distributable, runwayMonths }
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

  // ── Saved scenarios ───────────────────────────────────────────────────────
  const [saved,        setSaved]        = useState<SavedScenario[]>([])
  const [saveName,     setSaveName]     = useState('')
  const [showSaveBox,  setShowSaveBox]  = useState(false)
  const [scenariosLoading, setScenariosLoading] = useState(true)
  const [saving,       setSaving]       = useState(false)

  // ── Compare mode ──────────────────────────────────────────────────────────
  const [compareMode,      setCompareMode]      = useState(false)
  const [compareSelected,  setCompareSelected]  = useState<Set<string>>(new Set())

  const toggleCompareSelect = useCallback((id: string) => {
    setCompareSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) { next.delete(id) }
      else if (next.size < 5) { next.add(id) }
      return next
    })
  }, [])

  // Load: try DB first, fall back to localStorage
  useEffect(() => {
    setScenariosLoading(true)
    fetchDBScenarios()
      .then(dbRows => {
        if (dbRows.length > 0) {
          setSaved(dbRows)
          persistLocal(dbRows) // sync localStorage cache
        } else {
          setSaved(loadLocal())
        }
      })
      .catch(() => setSaved(loadLocal()))
      .finally(() => setScenariosLoading(false))
  }, [])

  const deleteSaved = useCallback(async (id: string) => {
    const updated = saved.filter(s => s.id !== id)
    setSaved(updated)
    persistLocal(updated)
    await deleteDBScenario(id)        // best-effort — non-fatal
  }, [saved])

  const restoreScenario = useCallback((s: SavedScenario) => {
    setRevChange(s.sliders.revChange)
    setExpChange(s.sliders.expChange)
    setCogsChange(s.sliders.cogsChange)
    setCollDelay(s.sliders.collDelay)
    setDebtChange(s.sliders.debtChange)
    setTaxRateOverride(s.sliders.taxRateOverride)
  }, [])

  const markAsBaseline = useCallback(async (id: string) => {
    // Optimistic update — mark locally first
    setSaved(prev => {
      const next = prev.map(s => ({ ...s, is_baseline: s.id === id }))
      persistLocal(next)
      return next
    })
    await markDBBaseline(id)
    // Re-fetch to confirm server state
    const fresh = await fetchDBScenarios()
    if (fresh.length > 0) {
      setSaved(fresh)
      persistLocal(fresh)
    }
  }, [])

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

  // ── Save scenario — defined after `result` so it can reference it ────────
  const saveScenario = useCallback(async () => {
    const name = saveName.trim()
    if (!name) return
    setSaving(true)

    const sliders = { revChange, expChange, cogsChange, collDelay, debtChange, taxRateOverride }
    const summary = {
      netIncome:      result.netIncome,
      grossMarginPct: result.grossMarginPct,
      distributable:  result.distributable,
      runwayMonths:   result.runwayMonths,
    }

    // Optimistic local update first (instant UX)
    const localId  = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `${Date.now()}`
    const scenario: SavedScenario = { id: localId, name, savedAt: new Date().toISOString(), sliders, summary }
    const updated  = [scenario, ...saved].slice(0, MAX_SAVED)
    setSaved(updated)
    persistLocal(updated)
    setSaveName('')
    setShowSaveBox(false)

    // Best-effort DB persist (replace local ID with DB ID on success)
    const dbId = await saveDBScenario(name, sliders, summary)
    if (dbId) {
      setSaved(prev => {
        const next = prev.map(s => s.id === localId ? { ...s, id: dbId } : s)
        persistLocal(next)
        return next
      })
    }
    setSaving(false)
  }, [saveName, saved, revChange, expChange, cogsChange, collDelay, debtChange, taxRateOverride, result])

  // ── Baseline helpers ──────────────────────────────────────────────────────
  const baseGross   = baseline.revenue - baseline.cogs
  const baseEbitda  = baseGross - baseline.expenses
  const baseNet     = baseEbitda - baseline.monthlyDebtService

  const hasBaseline = baseline.revenue > 0

  // ── Cascade story — cause → chain reaction narrative ─────────────────────
  // Only fires when total deviation is meaningful (any slider meaningfully moved)
  const cascadeStory = useMemo(() => {
    const anySignificant = Math.abs(revChange) >= 10 || Math.abs(expChange) >= 15
      || Math.abs(cogsChange) >= 10 || collDelay >= 20 || Math.abs(debtChange) >= 20

    if (!anySignificant) return null

    const baseRunway = baseNet < 0 && baseline.expenses > 0
      ? Math.max(0, (baseline.revenue / (baseline.expenses + baseline.monthlyDebtService)) * 30)
      : null

    const impacts: Array<{ label: string; delta: string; severity: 'ok' | 'warn' | 'critical' }> = []

    // Gross margin change
    const baseMarginPct = baseline.revenue > 0 ? (baseGross / baseline.revenue) * 100 : 0
    const newMarginPct  = result.grossMarginPct * 100
    const marginDelta   = newMarginPct - baseMarginPct
    if (Math.abs(marginDelta) > 2) {
      impacts.push({
        label: 'Brüt Marj',
        delta: `${baseMarginPct.toFixed(1)}% → ${newMarginPct.toFixed(1)}% (${marginDelta >= 0 ? '+' : ''}${marginDelta.toFixed(1)}pp)`,
        severity: newMarginPct < 10 ? 'critical' : newMarginPct < 20 ? 'warn' : 'ok',
      })
    }

    // Net income change
    const netDelta = result.netIncome - baseNet
    if (Math.abs(netDelta) > 100) {
      impacts.push({
        label: 'Net Kâr',
        delta: `${baseNet >= 0 ? '+' : ''}${fmt(baseNet)} → ${result.netIncome >= 0 ? '+' : ''}${fmt(result.netIncome)}`,
        severity: result.netIncome < -baseline.expenses * 0.2 ? 'critical' : result.netIncome < 0 ? 'warn' : 'ok',
      })
    }

    // Runway change
    if (result.runwayMonths !== null) {
      const from = baseRunway !== null ? `${baseRunway.toFixed(1)} ay` : '∞'
      impacts.push({
        label: 'Runway',
        delta: `${from} → ${result.runwayMonths.toFixed(1)} ay`,
        severity: result.runwayMonths < 2 ? 'critical' : result.runwayMonths < 6 ? 'warn' : 'ok',
      })
    } else if (baseRunway !== null) {
      impacts.push({
        label: 'Runway',
        delta: `${baseRunway.toFixed(1)} ay → ∞ (kârlı)`,
        severity: 'ok',
      })
    }

    // Distributable change
    const baseDistrib = Math.max(0, baseNet * 0.95)
    const distDelta   = result.distributable - baseDistrib
    if (Math.abs(distDelta) > 500) {
      impacts.push({
        label: 'Dağıtılabilir',
        delta: `${fmt(baseDistrib)} → ${result.distributable > 0 ? fmt(result.distributable) : '₺0 (sıfır)'}`,
        severity: result.distributable <= 0 ? 'critical' : result.distributable < baseDistrib * 0.5 ? 'warn' : 'ok',
      })
    }

    // Collection pressure
    if (collDelay >= 20) {
      const efficiencyLoss = Math.round(collDelay / 90 * 100)
      impacts.push({
        label: 'Tahsilat',
        delta: `%${efficiencyLoss} daha az nakit giriyor bu ay`,
        severity: collDelay >= 60 ? 'critical' : 'warn',
      })
    }

    return impacts.length > 0 ? impacts : null
  }, [revChange, expChange, cogsChange, collDelay, debtChange, taxRateOverride, result, baseline, baseGross, baseNet])

  return (
    <div className="space-y-5">

      {/* ── INTRO BANNER ─────────────────────────────────────────────────── */}
      <div className="px-4 py-3 bg-primary-50 border border-primary-100 rounded flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-black text-primary-800">Senaryo Editörü — {period}</div>
          <div className="text-[10px] text-primary-500 mt-0.5">
            Kaydırıcıları hareket ettirin → P&amp;L, EBITDA, vergi ve dağıtım anında güncellenir
          </div>
        </div>
        {!hasBaseline && (
          <span className="text-[9px] bg-amber-100 text-amber-700 px-2 py-1 rounded font-semibold flex-shrink-0">
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

          {/* Reset + Save buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            {(revChange !== 0 || expChange !== 0 || cogsChange !== 0 || collDelay !== 0 || debtChange !== 0 || taxRateOverride !== 25) && (
              <button
                onClick={() => { setRevChange(0); setExpChange(0); setCogsChange(0); setCollDelay(0); setDebtChange(0); setTaxRateOverride(25) }}
                className="text-xs font-semibold text-gray-500 hover:text-gray-700 border border-gray-200 px-3 py-1.5 rounded hover:border-gray-300 transition-colors"
              >
                ↺ Bazı Sıfırla
              </button>
            )}
            <button
              onClick={() => setShowSaveBox(v => !v)}
              className="text-xs font-semibold text-primary-600 hover:text-primary-700 border border-primary-200 px-3 py-1.5 rounded hover:border-primary-300 transition-colors"
            >
              {showSaveBox ? '✕ Kapat' : '＋ Kaydet'}
            </button>
          </div>

          {/* Save scenario inline form */}
          {showSaveBox && (
            <div className="bg-primary-50 border border-primary-100 rounded px-3 py-3 space-y-2">
              <div className="text-[9px] font-black uppercase tracking-widest text-primary-400">Senaryo Adı</div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={saveName}
                  onChange={e => setSaveName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') saveScenario() }}
                  placeholder="Örn: Agresif büyüme, Q3 baskı…"
                  className="flex-1 border border-primary-200 rounded px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary-400 bg-white"
                />
                <button
                  onClick={saveScenario}
                  disabled={!saveName.trim() || saving}
                  className="text-xs font-bold text-white bg-primary-600 hover:bg-primary-700 rounded px-3 py-1.5 disabled:opacity-50 transition-colors flex items-center gap-1"
                >
                  {saving ? (
                    <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                  ) : null}
                  Kaydet
                </button>
              </div>
              <div className="text-[9px] text-gray-400 flex items-center gap-1">
                <span>☁</span>
                <span>Buluta kaydedilir · tüm cihazlarda erişilebilir</span>
              </div>
            </div>
          )}

          {/* Saved scenarios list */}
          {(scenariosLoading || saved.length > 0) && (
            <div className="space-y-1.5">
              <div className="text-[9px] font-black uppercase tracking-widest text-gray-400 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  Kayıtlı Senaryolar
                  {scenariosLoading && <span className="inline-block w-3 h-3 border border-gray-300 border-t-gray-500 rounded-full animate-spin" />}
                  {!scenariosLoading && saved.length > 0 && <span className="font-normal text-gray-300">({saved.length})</span>}
                </div>
                {!scenariosLoading && saved.length >= 2 && (
                  <button
                    onClick={() => { setCompareMode(v => !v); setCompareSelected(new Set()) }}
                    className={`text-[9px] font-bold px-2 py-0.5 rounded border transition-colors ${
                      compareMode
                        ? 'bg-primary-600 text-white border-primary-600'
                        : 'border-gray-200 text-gray-500 hover:border-primary-300 hover:text-primary-600'
                    }`}
                  >
                    {compareMode ? '✕ Kapat' : '⇄ Karşılaştır'}
                  </button>
                )}
              </div>

              {compareMode && (
                <div className="bg-primary-50 border border-primary-100 rounded px-3 py-2 text-[9px] text-primary-600">
                  Karşılaştırmak istediğiniz senaryoları seçin (maks. 5) → sağ panelde tablo görünür.
                </div>
              )}

              {saved.map(s => {
                const netColor    = s.summary.netIncome >= 0 ? 'text-emerald-700' : 'text-red-600'
                const isSelected  = compareSelected.has(s.id)
                const canSelect   = compareSelected.size < 5 || isSelected
                const isBaseline  = s.is_baseline === true
                return (
                  <div key={s.id} className={`bg-white border rounded px-3 py-2.5 flex items-center justify-between gap-2 transition-colors ${
                    isBaseline
                      ? 'border-violet-200 bg-violet-50/30'
                      : compareMode && isSelected
                        ? 'border-primary-300 bg-primary-50/40'
                        : 'border-gray-100'
                  }`}>
                    {compareMode && (
                      <button
                        onClick={() => canSelect && toggleCompareSelect(s.id)}
                        className={`flex-shrink-0 w-4 h-4 rounded border transition-colors ${
                          isSelected
                            ? 'bg-primary-600 border-primary-600 text-white'
                            : canSelect
                              ? 'border-gray-300 hover:border-primary-400'
                              : 'border-gray-200 opacity-40 cursor-not-allowed'
                        }`}
                      >
                        {isSelected && <svg viewBox="0 0 12 12" fill="none" className="w-4 h-4 -m-px"><path d="M2 6l3 3 5-5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                      </button>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <div className="text-[11px] font-bold text-gray-800 truncate">{s.name}</div>
                        {isBaseline && (
                          <span className="flex-shrink-0 text-[8px] font-black uppercase tracking-wide bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded-md">
                            ⭐ Referans
                          </span>
                        )}
                      </div>
                      <div className="text-[9px] text-gray-400 flex gap-2 mt-0.5 flex-wrap">
                        <span className={netColor}>Net: {s.summary.netIncome >= 0 ? '+' : ''}₺{fmt(s.summary.netIncome)}</span>
                        <span>Marj: {pct(s.summary.grossMarginPct)}</span>
                        {s.summary.runwayMonths !== null && (
                          <span className={s.summary.runwayMonths < 3 ? 'text-red-500' : 'text-gray-400'}>
                            Runway: {s.summary.runwayMonths.toFixed(1)}ay
                          </span>
                        )}
                      </div>
                    </div>
                    {!compareMode && (
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {!isBaseline && s.id.includes('-') && (
                          <button
                            onClick={() => markAsBaseline(s.id)}
                            title="Referans senaryo olarak ayarla"
                            className="text-[9px] font-bold text-violet-600 hover:text-violet-700 border border-violet-200 rounded px-2 py-1 hover:bg-violet-50 transition-colors"
                          >
                            Referans →
                          </button>
                        )}
                        <button
                          onClick={() => restoreScenario(s)}
                          title="Bu senaryoyu yükle"
                          className="text-[9px] font-bold text-primary-600 hover:text-primary-700 border border-primary-200 rounded px-2 py-1 hover:bg-primary-50 transition-colors"
                        >
                          Yükle
                        </button>
                        <button
                          onClick={() => deleteSaved(s.id)}
                          title="Sil"
                          className="text-[9px] text-gray-400 hover:text-red-500 border border-gray-100 rounded px-1.5 py-1 hover:bg-red-50 transition-colors"
                        >
                          ✕
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* ── RIGHT: OUTPUT ───────────────────────────────────────────────── */}
        <div className="space-y-3">
          <div className="text-[9px] font-black uppercase tracking-widest text-gray-400">
            {compareMode && compareSelected.size >= 2 ? 'Senaryo Karşılaştırması' : 'Sonuçlar'}
          </div>

          {/* ── COMPARE TABLE (shown when compare mode active + ≥2 selected) ─ */}
          {compareMode && compareSelected.size >= 2 && (() => {
            const cols = saved.filter(s => compareSelected.has(s.id))
            const computed = cols.map(s => computeScenario(s.sliders, baseline))

            // For each metric: find best index (highest for income/margin/distributable, lowest for debt/tax/cogs)
            const bestIdx = (vals: number[], higherIsBetter: boolean) => {
              let bestI = 0
              vals.forEach((v, i) => {
                if (higherIsBetter ? v > vals[bestI] : v < vals[bestI]) bestI = i
              })
              return bestI
            }

            const rowDef: Array<{ label: string; get: (r: ReturnType<typeof computeScenario>) => number; fmt: (v: number) => string; higherIsBetter: boolean; divider?: boolean }> = [
              { label: 'Gelir',       get: r => r.revenue,        fmt: v => `₺${fmt(v)}`,       higherIsBetter: true  },
              { label: 'Brüt Kâr',   get: r => r.grossProfit,    fmt: v => `₺${fmt(v)}`,       higherIsBetter: true  },
              { label: 'Brüt Marj',  get: r => r.grossMarginPct, fmt: v => pct(v),              higherIsBetter: true, divider: true },
              { label: 'Giderler',   get: r => r.expenses,        fmt: v => `₺${fmt(v)}`,       higherIsBetter: false },
              { label: 'EBITDA',     get: r => r.ebitda,          fmt: v => `₺${fmt(v)}`,       higherIsBetter: true  },
              { label: 'Borç Srv.',  get: r => r.debtSvc,         fmt: v => `₺${fmt(v)}`,       higherIsBetter: false },
              { label: 'Vergi',      get: r => r.tax,             fmt: v => `₺${fmt(v)}`,       higherIsBetter: false, divider: true },
              { label: 'Net Kâr',    get: r => r.netIncome,       fmt: v => `₺${fmt(v)}`,       higherIsBetter: true  },
              { label: 'Dağıtım',   get: r => r.distributable,   fmt: v => `₺${fmt(v)}`,       higherIsBetter: true  },
            ]
            const hasRunway = computed.some(r => r.runwayMonths !== null)

            return (
              <div className="bg-white border border-gray-100 rounded overflow-hidden">
                {/* Header row */}
                <div className="px-3 py-2 bg-gray-50/60 border-b border-gray-100 grid gap-1" style={{ gridTemplateColumns: `5rem repeat(${cols.length}, 1fr)` }}>
                  <div />
                  {cols.map((s, i) => (
                    <div key={s.id} className="text-center">
                      <div className="text-[9px] font-black text-gray-700 truncate leading-tight" title={s.name}>{s.name}</div>
                      <div className="text-[8px] text-gray-400">{i === bestIdx(computed.map(r => r.netIncome), true) ? '🏆 en iyi' : ''}</div>
                    </div>
                  ))}
                </div>
                {/* Metric rows */}
                <div className="divide-y divide-gray-50">
                  {rowDef.map(row => {
                    const vals = computed.map(row.get)
                    const best = bestIdx(vals, row.higherIsBetter)
                    return (
                      <div key={row.label} className={`grid gap-1 px-3 py-2 items-center ${row.divider ? 'border-t border-gray-100 bg-gray-50/30' : ''}`} style={{ gridTemplateColumns: `5rem repeat(${cols.length}, 1fr)` }}>
                        <div className="text-[9px] font-semibold text-gray-500">{row.label}</div>
                        {vals.map((v, i) => (
                          <div key={i} className={`text-center text-[10px] font-black tabular-nums rounded py-0.5 ${
                            i === best
                              ? row.higherIsBetter
                                ? 'text-emerald-700 bg-emerald-50'
                                : 'text-emerald-700 bg-emerald-50'
                              : v < 0 ? 'text-red-600' : 'text-gray-700'
                          }`}>
                            {row.fmt(v)}
                          </div>
                        ))}
                      </div>
                    )
                  })}
                  {hasRunway && (
                    <div className="grid gap-1 px-3 py-2 items-center" style={{ gridTemplateColumns: `5rem repeat(${cols.length}, 1fr)` }}>
                      <div className="text-[9px] font-semibold text-gray-500">Runway</div>
                      {computed.map((r, i) => (
                        <div key={i} className={`text-center text-[10px] font-black tabular-nums ${r.runwayMonths === null ? 'text-emerald-600' : r.runwayMonths < 3 ? 'text-red-600' : 'text-amber-600'}`}>
                          {r.runwayMonths === null ? '∞' : `${r.runwayMonths.toFixed(1)}ay`}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {/* Load best scenario CTA */}
                <div className="px-3 py-2 border-t border-gray-100 bg-gray-50/40 flex items-center justify-between">
                  <span className="text-[9px] text-gray-400">En iyi Net Kâr: <strong className="text-gray-700">{cols[bestIdx(computed.map(r => r.netIncome), true)]?.name}</strong></span>
                  <button
                    onClick={() => restoreScenario(cols[bestIdx(computed.map(r => r.netIncome), true)]!)}
                    className="text-[9px] font-bold text-primary-600 border border-primary-200 px-2 py-1 rounded hover:bg-primary-50 transition-colors"
                  >
                    Yükle →
                  </button>
                </div>
              </div>
            )
          })()}

          {/* Normal P&L (hidden in compare mode when table shown) */}
          {!(compareMode && compareSelected.size >= 2) && (
          <>
          {/* P&L Summary */}
          <div className="bg-white border border-gray-100 rounded overflow-hidden">
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
            <div className="bg-white border border-gray-100 rounded px-3 py-2.5">
              <div className="text-[9px] font-black uppercase tracking-widest text-gray-400">Brüt Marj</div>
              <div className={`text-lg font-black tabular-nums ${result.grossMarginPct >= 0.25 ? 'text-emerald-700' : result.grossMarginPct > 0 ? 'text-amber-700' : 'text-red-600'}`}>
                {pct(result.grossMarginPct)}
              </div>
            </div>
            <div className="bg-white border border-gray-100 rounded px-3 py-2.5">
              <div className="text-[9px] font-black uppercase tracking-widest text-gray-400">KDV Net</div>
              <div className={`text-lg font-black tabular-nums ${result.vatNet > 0 ? 'text-orange-600' : 'text-emerald-700'}`}>
                {result.vatNet > 0 ? '+' : ''}₺{fmt(result.vatNet)}
              </div>
              <div className="text-[9px] text-gray-400 mt-0.5">{result.vatNet > 0 ? 'ödenecek' : 'devreden'}</div>
            </div>
          </div>

          {/* Cash + distribution */}
          <div className="bg-white border border-gray-100 rounded overflow-hidden">
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
            <div className="bg-red-50 border border-red-200 rounded px-4 py-3 text-xs text-red-700">
              <span className="font-bold">⚠ Zarar senaryosu.</span>{' '}
              Bu kombinasyonda aylık <strong>₺{fmt(Math.abs(result.netIncome))}</strong> zarar edilir.
              {result.runwayMonths !== null && result.runwayMonths < 6 &&
                ` Mevcut nakitin ${result.runwayMonths.toFixed(1)} ay yeteceği tahmin edilmektedir.`}
            </div>
          )}

          {/* Cascade story — cause → chain reaction narrative (only in normal mode) */}
          {cascadeStory && (
            <div className="bg-gray-50 border border-gray-200 rounded overflow-hidden">
              <div className="px-4 py-2.5 border-b border-gray-100">
                <span className="text-[9px] font-black uppercase tracking-widest text-gray-400">Bu Senaryo Zinciri</span>
              </div>
              <div className="divide-y divide-gray-100">
                {cascadeStory.map(impact => (
                  <div key={impact.label} className={`px-4 py-2.5 flex items-center justify-between gap-3 ${
                    impact.severity === 'critical' ? 'bg-red-50/40' :
                    impact.severity === 'warn'     ? 'bg-amber-50/30' : ''
                  }`}>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                        impact.severity === 'critical' ? 'bg-red-400' :
                        impact.severity === 'warn'     ? 'bg-amber-400' : 'bg-emerald-400'
                      }`} />
                      <span className="text-[10px] font-bold text-gray-600">{impact.label}</span>
                    </div>
                    <span className={`text-[10px] font-semibold tabular-nums text-right leading-snug ${
                      impact.severity === 'critical' ? 'text-red-700' :
                      impact.severity === 'warn'     ? 'text-amber-700' : 'text-emerald-700'
                    }`}>{impact.delta}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          </> /* end normal mode output */
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
