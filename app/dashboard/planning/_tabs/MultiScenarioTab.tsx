'use client'

// ── MultiScenarioTab — Senaryo Karşılaştırması ────────────────────────────────
//
// Multi-scenario comparison UI for the Flowra Planning Hub.
// Displays up to 5 scenarios in a comparison table with debt pressure timeline.
// Uses pure helpers from simulation.service for DSR and recommendations.

import { useState, useMemo } from 'react'
import {
  computeMonthlyDSR,
  classifyDSR,
  recommendScenario,
  findBreakEvenMonth,
  findRunwayEnd,
  distributeRevenue,
  SEASONAL_PRESETS,
} from '@/lib/services/simulation.pure'

// ── Types ─────────────────────────────────────────────────────────────────────

type SeasonalPreset = 'uniform' | 'q4_heavy' | 'summer_peak' | 'jan_reset'

interface ScenarioInput {
  name: string
  period_months: number
  revenue_model: SeasonalPreset
  base_revenue: number
  growth_pct: number
  expense_multiplier: number
  monthly_debt_service: number
  initial_cash: number
}

interface ScenarioSummary {
  id: string
  name: string
  net_income_total: number
  runway_end_month: number | null
  max_dsr: number
  breakeven_month: number | null
  end_cash: number
  monthly_net: number[]
  monthly_dsr: number[]
}

// ── Constants ─────────────────────────────────────────────────────────────────

const PRESET_LABELS: Record<SeasonalPreset, string> = {
  uniform:     'Düzgün Dağılım',
  q4_heavy:    'Q4 Ağır (Perakende)',
  summer_peak: 'Yaz Pik (Turizm)',
  jan_reset:   'Ocak Sıfırla (B2B)',
}

const DSR_COLORS: Record<ReturnType<typeof classifyDSR>, string> = {
  healthy:  'bg-emerald-500',
  strained: 'bg-amber-400',
  critical: 'bg-red-500',
  insolvent:'bg-red-800',
}

const DSR_TEXT: Record<ReturnType<typeof classifyDSR>, string> = {
  healthy:  'Sağlıklı',
  strained: 'Gergin',
  critical: 'Kritik',
  insolvent:'İflas',
}

// ── Mock scenarios (pre-loaded) ───────────────────────────────────────────────

const MOCK_SCENARIOS: ScenarioInput[] = [
  {
    name:                 'Temel',
    period_months:        12,
    revenue_model:        'uniform',
    base_revenue:         4_800_000,
    growth_pct:           0,
    expense_multiplier:   1.0,
    monthly_debt_service: 80_000,
    initial_cash:         500_000,
  },
  {
    name:                 'İyimser',
    period_months:        12,
    revenue_model:        'q4_heavy',
    base_revenue:         4_800_000,
    growth_pct:           15,
    expense_multiplier:   1.05,
    monthly_debt_service: 80_000,
    initial_cash:         500_000,
  },
  {
    name:                 'Kötümser',
    period_months:        12,
    revenue_model:        'uniform',
    base_revenue:         4_800_000,
    growth_pct:           -25,
    expense_multiplier:   1.1,
    monthly_debt_service: 80_000,
    initial_cash:         500_000,
  },
]

const EMPTY_FORM: ScenarioInput = {
  name:                 '',
  period_months:        12,
  revenue_model:        'uniform',
  base_revenue:         4_800_000,
  growth_pct:           0,
  expense_multiplier:   1.0,
  monthly_debt_service: 80_000,
  initial_cash:         500_000,
}

// ── Pure compute ──────────────────────────────────────────────────────────────

function computeScenario(input: ScenarioInput, id: string): ScenarioSummary {
  const annualRevenue = input.base_revenue * (1 + input.growth_pct / 100)
  const weights       = SEASONAL_PRESETS[input.revenue_model]
  const monthlyRev    = distributeRevenue(annualRevenue, weights)

  // Expense: flat monthly = (annualRevenue * 0.6 * multiplier) / 12 (illustrative)
  const monthlyExpense = (annualRevenue * 0.6 * input.expense_multiplier) / 12

  const monthly_net: number[] = monthlyRev.map(rev => rev - monthlyExpense)

  // DSR per month
  const monthly_dsr: number[] = monthly_net.map(net =>
    computeMonthlyDSR(net, input.monthly_debt_service * 0.4, input.monthly_debt_service * 0.6),
  )

  const net_income_total = monthly_net.reduce((s, v) => s + v, 0)
  const breakeven_month  = findBreakEvenMonth(monthly_net)

  // Cash timeline
  const monthlyCash: number[] = monthly_net.map(net => net - input.monthly_debt_service)
  const runway_end_month = findRunwayEnd(monthlyCash)
  const cumulativeCash   = monthlyCash.reduce((s, v) => s + v, 0)
  const end_cash         = input.initial_cash + cumulativeCash

  const max_dsr = Math.max(...monthly_dsr)

  return {
    id,
    name: input.name,
    net_income_total,
    runway_end_month,
    max_dsr,
    breakeven_month,
    end_cash,
    monthly_net,
    monthly_dsr,
  }
}

// ── Formatters ────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `₺${(n / 1_000_000).toFixed(1)}M`
  if (Math.abs(n) >= 1_000)     return `₺${(n / 1_000).toFixed(0)}K`
  return `₺${n.toFixed(0)}`
}

function fmtMonth(m: number | null): string {
  if (m === null) return '—'
  return `Ay ${m + 1}`
}

// ── Sub-components ────────────────────────────────────────────────────────────

function DebtTimeline({ scenario }: { scenario: ScenarioSummary }) {
  const maxDsr = Math.max(...scenario.monthly_dsr, 0.01)
  return (
    <div>
      <p className="text-[0.65rem] font-bold uppercase tracking-widest text-[#94a3b8] mb-2">
        Borç Baskısı Zaman Çizelgesi — {scenario.name}
      </p>
      <div className="flex gap-1 items-end h-16">
        {scenario.monthly_dsr.map((dsr, i) => {
          const level   = classifyDSR(dsr)
          const height  = Math.max(8, Math.round((dsr / Math.max(maxDsr, 1)) * 56))
          return (
            <div key={i} className="flex flex-col items-center flex-1 gap-0.5">
              <div
                className={`w-full rounded-t ${DSR_COLORS[level]}`}
                style={{ height: `${height}px` }}
                title={`Ay ${i + 1}: DSR ${dsr.toFixed(2)} — ${DSR_TEXT[level]}`}
              />
              <span className="text-[0.5rem] text-[#94a3b8]">{i + 1}</span>
            </div>
          )
        })}
      </div>
      {/* Legend */}
      <div className="flex gap-3 mt-2 flex-wrap">
        {(['healthy', 'strained', 'critical', 'insolvent'] as const).map(level => (
          <div key={level} className="flex items-center gap-1">
            <span className={`w-2.5 h-2.5 rounded-sm inline-block ${DSR_COLORS[level]}`} />
            <span className="text-[0.6rem] text-[#64748b]">{DSR_TEXT[level]}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function AddScenarioForm({
  onAdd,
  onCancel,
}: {
  onAdd: (input: ScenarioInput) => void
  onCancel: () => void
}) {
  const [form, setForm] = useState<ScenarioInput>({ ...EMPTY_FORM })

  function set<K extends keyof ScenarioInput>(key: K, value: ScenarioInput[K]) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) return
    onAdd(form)
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="border border-[#e2e8f0] rounded-xl p-4 bg-[#f8fafc] space-y-3"
    >
      <p className="text-xs font-bold text-[#0f172a]">Yeni Senaryo</p>

      <div className="grid grid-cols-2 gap-3">
        {/* Name */}
        <div className="col-span-2">
          <label className="block text-[0.65rem] font-semibold text-[#64748b] mb-0.5">
            Senaryo Adı
          </label>
          <input
            type="text"
            value={form.name}
            onChange={e => set('name', e.target.value)}
            placeholder="Agresif Büyüme"
            required
            className="w-full border border-[#e2e8f0] rounded-lg px-2.5 py-1.5 text-xs text-[#0f172a] bg-white focus:outline-none focus:ring-1 focus:ring-[#6366f1]"
          />
        </div>

        {/* Period months */}
        <div>
          <label className="block text-[0.65rem] font-semibold text-[#64748b] mb-0.5">
            Dönem (ay)
          </label>
          <select
            value={form.period_months}
            onChange={e => set('period_months', Number(e.target.value))}
            className="w-full border border-[#e2e8f0] rounded-lg px-2.5 py-1.5 text-xs text-[#0f172a] bg-white focus:outline-none focus:ring-1 focus:ring-[#6366f1]"
          >
            {[1, 3, 6, 9, 12].map(m => (
              <option key={m} value={m}>{m} ay</option>
            ))}
          </select>
        </div>

        {/* Revenue model */}
        <div>
          <label className="block text-[0.65rem] font-semibold text-[#64748b] mb-0.5">
            Gelir Modeli
          </label>
          <select
            value={form.revenue_model}
            onChange={e => set('revenue_model', e.target.value as SeasonalPreset)}
            className="w-full border border-[#e2e8f0] rounded-lg px-2.5 py-1.5 text-xs text-[#0f172a] bg-white focus:outline-none focus:ring-1 focus:ring-[#6366f1]"
          >
            {(Object.keys(PRESET_LABELS) as SeasonalPreset[]).map(k => (
              <option key={k} value={k}>{PRESET_LABELS[k]}</option>
            ))}
          </select>
        </div>

        {/* Base revenue */}
        <div>
          <label className="block text-[0.65rem] font-semibold text-[#64748b] mb-0.5">
            Baz Gelir (₺)
          </label>
          <input
            type="number"
            min={0}
            step={100000}
            value={form.base_revenue}
            onChange={e => set('base_revenue', Number(e.target.value))}
            className="w-full border border-[#e2e8f0] rounded-lg px-2.5 py-1.5 text-xs text-[#0f172a] bg-white focus:outline-none focus:ring-1 focus:ring-[#6366f1]"
          />
        </div>

        {/* Growth % */}
        <div>
          <label className="block text-[0.65rem] font-semibold text-[#64748b] mb-0.5">
            Büyüme (%)
          </label>
          <input
            type="number"
            min={-100}
            max={500}
            step={5}
            value={form.growth_pct}
            onChange={e => set('growth_pct', Number(e.target.value))}
            className="w-full border border-[#e2e8f0] rounded-lg px-2.5 py-1.5 text-xs text-[#0f172a] bg-white focus:outline-none focus:ring-1 focus:ring-[#6366f1]"
          />
        </div>

        {/* Expense multiplier */}
        <div>
          <label className="block text-[0.65rem] font-semibold text-[#64748b] mb-0.5">
            Gider Çarpanı
          </label>
          <input
            type="number"
            min={0.5}
            max={3}
            step={0.05}
            value={form.expense_multiplier}
            onChange={e => set('expense_multiplier', Number(e.target.value))}
            className="w-full border border-[#e2e8f0] rounded-lg px-2.5 py-1.5 text-xs text-[#0f172a] bg-white focus:outline-none focus:ring-1 focus:ring-[#6366f1]"
          />
        </div>

        {/* Monthly debt repayment */}
        <div>
          <label className="block text-[0.65rem] font-semibold text-[#64748b] mb-0.5">
            Aylık Borç Servisi (₺)
          </label>
          <input
            type="number"
            min={0}
            step={10000}
            value={form.monthly_debt_service}
            onChange={e => set('monthly_debt_service', Number(e.target.value))}
            className="w-full border border-[#e2e8f0] rounded-lg px-2.5 py-1.5 text-xs text-[#0f172a] bg-white focus:outline-none focus:ring-1 focus:ring-[#6366f1]"
          />
        </div>
      </div>

      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          className="flex-1 bg-[#6366f1] hover:bg-[#4f46e5] text-white text-xs font-semibold rounded-lg py-1.5 transition-colors"
        >
          Ekle
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 border border-[#e2e8f0] text-[#64748b] text-xs font-semibold rounded-lg py-1.5 hover:bg-[#f1f5f9] transition-colors"
        >
          Vazgec
        </button>
      </div>
    </form>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function MultiScenarioTab() {
  const [scenarioInputs, setScenarioInputs] = useState<ScenarioInput[]>(MOCK_SCENARIOS)
  const [showForm, setShowForm]             = useState(false)
  const [selectedId, setSelectedId]         = useState<string>('s0')

  const scenarios = useMemo<ScenarioSummary[]>(
    () => scenarioInputs.map((s, i) => computeScenario(s, `s${i}`)),
    [scenarioInputs],
  )

  const recommendedId = useMemo(() => {
    try { return recommendScenario(scenarios) } catch { return null }
  }, [scenarios])

  const selected = scenarios.find(s => s.id === selectedId) ?? scenarios[0]

  function addScenario(input: ScenarioInput) {
    setScenarioInputs(prev => [...prev, input])
    setShowForm(false)
  }

  function removeScenario(id: string) {
    const idx = scenarios.findIndex(s => s.id === id)
    setScenarioInputs(prev => prev.filter((_, i) => i !== idx))
    if (selectedId === id) setSelectedId(scenarios[0]?.id ?? 's0')
  }

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-black text-[#0f172a]">Senaryo Karsilastirmasi</h2>
          <p className="text-[0.65rem] text-[#94a3b8]">
            {scenarios.length} senaryo · En fazla 5 senaryo karsilastirabilirsiniz
          </p>
        </div>
        {scenarios.length < 5 && !showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-1.5 bg-[#6366f1] hover:bg-[#4f46e5] text-white text-[0.7rem] font-bold rounded-lg px-3 py-1.5 transition-colors"
          >
            <span>+</span>
            <span>Senaryo Ekle</span>
          </button>
        )}
      </div>

      {/* Add form */}
      {showForm && (
        <AddScenarioForm onAdd={addScenario} onCancel={() => setShowForm(false)} />
      )}

      {/* Comparison table */}
      <div className="overflow-x-auto rounded-xl border border-[#e2e8f0]">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-[#e2e8f0] bg-[#f8fafc]">
              <th className="text-left px-3 py-2.5 text-[0.65rem] font-bold uppercase tracking-widest text-[#94a3b8] w-28">
                Metrik
              </th>
              {scenarios.map(s => (
                <th
                  key={s.id}
                  className="px-3 py-2.5 text-center"
                >
                  <button
                    onClick={() => setSelectedId(s.id)}
                    className={`text-[0.7rem] font-bold rounded-lg px-2 py-0.5 transition-colors ${
                      selectedId === s.id
                        ? 'bg-[#6366f1] text-white'
                        : 'text-[#0f172a] hover:bg-[#f1f5f9]'
                    }`}
                  >
                    {s.name}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#f1f5f9]">
            {/* Net Kar */}
            <tr>
              <td className="px-3 py-2 text-[0.65rem] text-[#64748b] font-semibold">Net Kar</td>
              {scenarios.map(s => (
                <td key={s.id} className={`px-3 py-2 text-center font-bold ${
                  s.net_income_total >= 0 ? 'text-emerald-600' : 'text-red-500'
                }`}>
                  {fmt(s.net_income_total)}
                </td>
              ))}
            </tr>
            {/* Nakit Sonu */}
            <tr className="bg-[#fafafa]">
              <td className="px-3 py-2 text-[0.65rem] text-[#64748b] font-semibold">Nakit Sonu</td>
              {scenarios.map(s => (
                <td key={s.id} className={`px-3 py-2 text-center font-semibold ${
                  s.end_cash >= 0 ? 'text-[#0f172a]' : 'text-red-500'
                }`}>
                  {fmt(s.end_cash)}
                </td>
              ))}
            </tr>
            {/* Runway */}
            <tr>
              <td className="px-3 py-2 text-[0.65rem] text-[#64748b] font-semibold">Runway</td>
              {scenarios.map(s => (
                <td key={s.id} className="px-3 py-2 text-center text-[#0f172a]">
                  {s.runway_end_month === null
                    ? <span className="text-emerald-600 font-semibold">12+ ay</span>
                    : <span className="text-red-500 font-semibold">{s.runway_end_month + 1} ay</span>
                  }
                </td>
              ))}
            </tr>
            {/* Max DSR */}
            <tr className="bg-[#fafafa]">
              <td className="px-3 py-2 text-[0.65rem] text-[#64748b] font-semibold">Max DSR</td>
              {scenarios.map(s => {
                const level = classifyDSR(s.max_dsr)
                const colors = {
                  healthy:  'text-emerald-600',
                  strained: 'text-amber-500',
                  critical: 'text-red-500',
                  insolvent:'text-red-800',
                }
                return (
                  <td key={s.id} className={`px-3 py-2 text-center font-semibold ${colors[level]}`}>
                    {s.max_dsr.toFixed(2)}
                  </td>
                )
              })}
            </tr>
            {/* Basabas */}
            <tr>
              <td className="px-3 py-2 text-[0.65rem] text-[#64748b] font-semibold">Basabas</td>
              {scenarios.map(s => (
                <td key={s.id} className="px-3 py-2 text-center text-[#0f172a]">
                  {fmtMonth(s.breakeven_month)}
                </td>
              ))}
            </tr>
            {/* Recommended */}
            <tr className="bg-[#fafafa]">
              <td className="px-3 py-2 text-[0.65rem] text-[#64748b] font-semibold">Onerilen</td>
              {scenarios.map(s => (
                <td key={s.id} className="px-3 py-2 text-center">
                  {s.id === recommendedId ? (
                    <span className="text-amber-500 text-base" title="Onerilen senaryo">
                      ★
                    </span>
                  ) : null}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      {/* Remove buttons */}
      {scenarios.length > 1 && (
        <div className="flex gap-2 flex-wrap">
          {scenarios.map(s => (
            <button
              key={s.id}
              onClick={() => removeScenario(s.id)}
              className="text-[0.6rem] text-[#94a3b8] hover:text-red-500 border border-[#e2e8f0] rounded px-2 py-0.5 transition-colors"
            >
              {s.name} sil
            </button>
          ))}
        </div>
      )}

      {/* Debt pressure timeline for selected scenario */}
      {selected && (
        <div className="border border-[#e2e8f0] rounded-xl p-4 bg-white">
          <DebtTimeline scenario={selected} />
        </div>
      )}

      {/* Footer note */}
      <p className="text-[0.6rem] text-[#cbd5e1]">
        * Gider = Baz Gelir × 0.6 × Gider Cerpani (illustrative). Gercek veri entegrasyonu production ortaminda etkinlestirilir.
      </p>
    </div>
  )
}
