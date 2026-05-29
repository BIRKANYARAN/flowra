'use client'

// ─────────────────────────────────────────────────────────────────────────────
// ScenarioComparisonClient
//
// Multi-scenario side-by-side comparison dashboard.
//
// Features:
//   - Query param filter: ?ids=id1,id2 for up to 5 scenarios
//   - Side-by-side metric table (scenarios as columns)
//   - Recommended scenario badge (star icon)
//   - Risk level color badges per scenario
//   - Ranking indicators (trophy for top by metric)
//   - Comparison matrix: delta % vs baseline
//   - Turkish narrative summary
// ─────────────────────────────────────────────────────────────────────────────

import { useState }  from 'react'
import { useQuery }  from '@tanstack/react-query'
import { fmtTRY, fmtPct } from '@/lib/format'
import {
  classifyScenarioRisk,
  type ScenarioMetrics,
  type ScenarioComparisonReport,
} from '@/lib/services/finance/scenario-comparison.service'

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number | null | undefined, decimals = 0): string {
  if (n === null || n === undefined) return '—'
  return fmtTRY(n)
}

function fmtPctSafe(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—'
  return `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`
}

function fmtMonths(n: number | null | undefined): string {
  if (n === null || n === undefined) return '∞'
  return `${n} ay`
}

// ── Risk Badge ────────────────────────────────────────────────────────────────

type RiskLevel = 'low' | 'moderate' | 'high' | 'very_high'

function RiskBadge({ level }: { level: RiskLevel }) {
  const config: Record<RiskLevel, { label: string; style: string }> = {
    low:       { label: 'Düşük Risk',    style: 'bg-green-100 text-green-800 border-green-200' },
    moderate:  { label: 'Orta Risk',     style: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
    high:      { label: 'Yüksek Risk',   style: 'bg-orange-100 text-orange-800 border-orange-200' },
    very_high: { label: 'Çok Yüksek',    style: 'bg-red-100 text-red-800 border-red-200' },
  }
  const c = config[level]
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] font-bold ${c.style}`}>
      {c.label}
    </span>
  )
}

// ── Recommended Badge ─────────────────────────────────────────────────────────

function RecommendedBadge() {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border bg-indigo-100 text-indigo-800 border-indigo-200 text-[11px] font-bold">
      ★ Önerilen
    </span>
  )
}

// ── Delta Cell ────────────────────────────────────────────────────────────────

function DeltaCell({ value }: { value: number | null }) {
  if (value === null) return <span className="text-slate-400">—</span>
  const isPos = value > 0
  const isNeg = value < 0
  return (
    <span className={isPos ? 'text-green-600 font-semibold' : isNeg ? 'text-red-600 font-semibold' : 'text-slate-500'}>
      {value >= 0 ? '+' : ''}{value.toFixed(1)}%
    </span>
  )
}

// ── Metric Row ────────────────────────────────────────────────────────────────

function MetricRow({
  label,
  values,
  format = 'try',
  highlight,
}: {
  label: string
  values: Array<number | null>
  format?: 'try' | 'pct' | 'months' | 'month'
  highlight?: number   // index of best (for ranking indicator)
}) {
  const formatVal = (v: number | null) => {
    if (v === null) return '—'
    if (format === 'try')    return fmtTRY(v)
    if (format === 'pct')    return `${v.toFixed(1)}%`
    if (format === 'months') return `${v} ay`
    if (format === 'month')  return v === null ? '—' : `Ay ${v}`
    return String(v)
  }

  return (
    <tr className="border-b border-slate-100 hover:bg-slate-50/50">
      <td className="py-2 pr-4 text-[13px] text-slate-600 font-medium whitespace-nowrap">{label}</td>
      {values.map((v, i) => (
        <td key={i} className="py-2 px-3 text-[13px] text-right font-mono">
          {formatVal(v)}
          {highlight === i && (
            <span className="ml-1 text-amber-500 text-[10px]">▲</span>
          )}
        </td>
      ))}
    </tr>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function ScenarioComparisonClient() {
  const [filterIds, setFilterIds] = useState<string>('')

  const queryKey = ['scenario-comparison', filterIds]

  const { data, isLoading, error, refetch } = useQuery<{ report: ScenarioComparisonReport }>({
    queryKey,
    queryFn: async () => {
      const params = filterIds.trim() ? `?ids=${encodeURIComponent(filterIds.trim())}` : ''
      const res = await fetch(`/api/finance/scenario-comparison${params}`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.error ?? 'API hatası')
      }
      return res.json()
    },
    staleTime: 5 * 60 * 1000,
  })

  const report = data?.report

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-48 text-slate-500 text-sm">
        Senaryolar yükleniyor...
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
        Hata: {error instanceof Error ? error.message : 'Bilinmeyen hata'}
      </div>
    )
  }

  if (!report || report.scenarios.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-48 gap-3 text-slate-500 text-sm">
        <span>Karşılaştırılacak senaryo bulunamadı.</span>
        <span className="text-xs text-slate-400">Simülasyon modülünden senaryo kaydedin.</span>
      </div>
    )
  }

  const { scenarios, comparison_matrix, recommended_scenario_id, narrative, rankings, scenario_spread } = report

  const riskLevels: RiskLevel[] = scenarios.map(s => classifyScenarioRisk(s))

  // Find best index per key metric for ranking indicators
  const bestNetIncomeIdx = scenarios.reduce((best, s, i) =>
    s.net_income > (scenarios[best]?.net_income ?? -Infinity) ? i : best, 0)
  const bestCashIdx = scenarios.reduce((best, s, i) =>
    s.ending_cash > (scenarios[best]?.ending_cash ?? -Infinity) ? i : best, 0)

  return (
    <div className="space-y-6">

      {/* Filter bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <label className="text-[12px] font-semibold text-slate-600 uppercase tracking-wide">
          Senaryo ID Filtresi
        </label>
        <input
          type="text"
          value={filterIds}
          onChange={e => setFilterIds(e.target.value)}
          placeholder="id1,id2,id3 (virgülle ayırın)"
          className="flex-1 min-w-[240px] max-w-[480px] px-3 py-1.5 border border-slate-200 rounded-lg text-[13px] text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-300"
        />
        <button
          onClick={() => refetch()}
          className="px-4 py-1.5 rounded-lg bg-indigo-600 text-white text-[13px] font-semibold hover:bg-indigo-700 transition-colors"
        >
          Yenile
        </button>
      </div>

      {/* Narrative */}
      <div className="p-4 rounded-xl bg-indigo-50 border border-indigo-100 text-[13px] text-indigo-900">
        {narrative}
      </div>

      {/* Scenario header row */}
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[640px]">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="py-3 pr-4 text-left text-[12px] font-semibold text-slate-500 uppercase tracking-wide w-48">
                Metrik
              </th>
              {scenarios.map((s, i) => (
                <th key={s.scenario_id} className="py-3 px-3 text-right text-[12px] font-semibold text-slate-700">
                  <div className="flex flex-col items-end gap-1">
                    <span className="truncate max-w-[120px]">{s.scenario_name}</span>
                    <div className="flex items-center gap-1 flex-wrap justify-end">
                      {s.is_baseline && (
                        <span className="px-1.5 py-0.5 rounded bg-slate-200 text-slate-600 text-[10px] font-bold">
                          Baz
                        </span>
                      )}
                      {s.scenario_id === recommended_scenario_id && <RecommendedBadge />}
                      <RiskBadge level={riskLevels[i]} />
                    </div>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <MetricRow
              label="Toplam Gelir"
              values={scenarios.map(s => s.total_revenue)}
              highlight={scenarios.reduce((b, s, i) => s.total_revenue > (scenarios[b]?.total_revenue ?? -Infinity) ? i : b, 0)}
            />
            <MetricRow
              label="Brüt Kar"
              values={scenarios.map(s => s.gross_profit)}
              highlight={scenarios.reduce((b, s, i) => s.gross_profit > (scenarios[b]?.gross_profit ?? -Infinity) ? i : b, 0)}
            />
            <MetricRow
              label="Brüt Kar Marjı"
              values={scenarios.map(s => s.gross_margin_pct)}
              format="pct"
            />
            <MetricRow
              label="EBITDA"
              values={scenarios.map(s => s.ebitda)}
              highlight={scenarios.reduce((b, s, i) => s.ebitda > (scenarios[b]?.ebitda ?? -Infinity) ? i : b, 0)}
            />
            <MetricRow
              label="Net Kar"
              values={scenarios.map(s => s.net_income)}
              highlight={bestNetIncomeIdx}
            />
            <MetricRow
              label="Net Kar Marjı"
              values={scenarios.map(s => s.net_margin_pct)}
              format="pct"
            />
            <MetricRow
              label="Vergi"
              values={scenarios.map(s => s.tax_amount)}
            />
            <MetricRow
              label="Kapanış Nakit"
              values={scenarios.map(s => s.ending_cash)}
              highlight={bestCashIdx}
            />
            <MetricRow
              label="Pik Nakit"
              values={scenarios.map(s => s.peak_cash)}
            />
            <MetricRow
              label="Min Nakit"
              values={scenarios.map(s => s.min_cash)}
            />
            <MetricRow
              label="Nakit Yeterliliği"
              values={scenarios.map(s => s.runway_months)}
              format="months"
              highlight={scenarios.reduce((b, s, i) => {
                const vb = scenarios[b]?.runway_months ?? -1
                const vi = s.runway_months ?? -1
                return vi > vb ? i : b
              }, 0)}
            />
            <MetricRow
              label="Başabaş Ay"
              values={scenarios.map(s => s.break_even_month)}
              format="month"
            />
            <MetricRow
              label="Toplam Borç Servisi"
              values={scenarios.map(s => s.total_debt_service)}
            />
            <MetricRow
              label="Ort. DSCR"
              values={scenarios.map(s => s.dscr_avg)}
              format="pct"
            />
          </tbody>
        </table>
      </div>

      {/* Comparison Matrix (vs baseline) */}
      {comparison_matrix.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-[13px] font-semibold text-slate-700 uppercase tracking-wide">
            Baz Senaryo Karşılaştırması
          </h3>
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full min-w-[480px]">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[12px] text-slate-500 uppercase">
                  <th className="py-2 pr-4 text-left font-semibold">Senaryo</th>
                  <th className="py-2 px-3 text-right font-semibold">Gelir Δ%</th>
                  <th className="py-2 px-3 text-right font-semibold">EBITDA Δ%</th>
                  <th className="py-2 px-3 text-right font-semibold">Net Kar Δ%</th>
                  <th className="py-2 px-3 text-right font-semibold">Nakit Δ</th>
                  <th className="py-2 px-3 text-right font-semibold">Runway Δ</th>
                </tr>
              </thead>
              <tbody>
                {comparison_matrix.map((cmp, i) => (
                  <tr key={i} className="border-b border-slate-100 hover:bg-slate-50/50 text-[13px]">
                    <td className="py-2 pr-4 font-medium text-slate-700">
                      {cmp.scenario_b.scenario_name}
                      {cmp.scenario_b.scenario_id === recommended_scenario_id && (
                        <span className="ml-2 text-indigo-500 text-[11px]">★</span>
                      )}
                    </td>
                    <td className="py-2 px-3 text-right">
                      <DeltaCell value={cmp.revenue_delta_pct} />
                    </td>
                    <td className="py-2 px-3 text-right">
                      <DeltaCell value={cmp.ebitda_delta_pct} />
                    </td>
                    <td className="py-2 px-3 text-right">
                      <DeltaCell value={cmp.net_income_delta_pct} />
                    </td>
                    <td className="py-2 px-3 text-right font-mono">
                      {cmp.cash_delta >= 0
                        ? <span className="text-green-600">+{fmtTRY(cmp.cash_delta)}</span>
                        : <span className="text-red-600">{fmtTRY(cmp.cash_delta)}</span>
                      }
                    </td>
                    <td className="py-2 px-3 text-right">
                      {cmp.runway_delta_months !== null
                        ? (
                          <span className={cmp.runway_delta_months >= 0 ? 'text-green-600' : 'text-red-600'}>
                            {cmp.runway_delta_months >= 0 ? '+' : ''}{cmp.runway_delta_months} ay
                          </span>
                        )
                        : <span className="text-slate-400">—</span>
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Scenario Spread */}
      {(scenario_spread.net_income || scenario_spread.ending_cash) && (
        <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {scenario_spread.net_income && (
            <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-sm space-y-2">
              <p className="text-[12px] font-semibold text-slate-500 uppercase tracking-wide">Net Kar Yayılımı</p>
              <div className="grid grid-cols-2 gap-x-4 text-[13px]">
                <span className="text-slate-500">Min</span>
                <span className="font-mono text-right">{fmtTRY(scenario_spread.net_income.min)}</span>
                <span className="text-slate-500">Max</span>
                <span className="font-mono text-right">{fmtTRY(scenario_spread.net_income.max)}</span>
                <span className="text-slate-500">Aralık</span>
                <span className="font-mono text-right">{fmtTRY(scenario_spread.net_income.range)}</span>
                {scenario_spread.net_income.cv !== null && (
                  <>
                    <span className="text-slate-500">CV</span>
                    <span className="font-mono text-right">{(scenario_spread.net_income.cv * 100).toFixed(1)}%</span>
                  </>
                )}
              </div>
            </div>
          )}
          {scenario_spread.ending_cash && (
            <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-sm space-y-2">
              <p className="text-[12px] font-semibold text-slate-500 uppercase tracking-wide">Kapanış Nakit Yayılımı</p>
              <div className="grid grid-cols-2 gap-x-4 text-[13px]">
                <span className="text-slate-500">Min</span>
                <span className="font-mono text-right">{fmtTRY(scenario_spread.ending_cash.min)}</span>
                <span className="text-slate-500">Max</span>
                <span className="font-mono text-right">{fmtTRY(scenario_spread.ending_cash.max)}</span>
                <span className="text-slate-500">Aralık</span>
                <span className="font-mono text-right">{fmtTRY(scenario_spread.ending_cash.range)}</span>
                {scenario_spread.ending_cash.cv !== null && (
                  <>
                    <span className="text-slate-500">CV</span>
                    <span className="font-mono text-right">{(scenario_spread.ending_cash.cv * 100).toFixed(1)}%</span>
                  </>
                )}
              </div>
            </div>
          )}
        </section>
      )}

      {/* Rankings */}
      <section className="space-y-2">
        <h3 className="text-[13px] font-semibold text-slate-700 uppercase tracking-wide">Sıralamalar</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { title: 'Net Kara Göre', list: rankings.by_profitability, metric: (s: ScenarioMetrics) => s.net_income },
            { title: 'Nakite Göre', list: rankings.by_cash, metric: (s: ScenarioMetrics) => s.ending_cash },
            { title: 'Runway\'a Göre', list: rankings.by_runway, metric: (s: ScenarioMetrics) => s.runway_months },
          ].map(({ title, list, metric }) => (
            <div key={title} className="p-4 rounded-xl border border-slate-200 bg-white shadow-sm">
              <p className="text-[12px] font-semibold text-slate-500 uppercase tracking-wide mb-2">{title}</p>
              <ol className="space-y-1">
                {list.map((s, i) => (
                  <li key={s.scenario_id} className="flex items-center gap-2 text-[13px]">
                    <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold ${
                      i === 0 ? 'bg-amber-100 text-amber-700' :
                      i === 1 ? 'bg-slate-100 text-slate-600' :
                      'bg-slate-50 text-slate-500'
                    }`}>
                      {i + 1}
                    </span>
                    <span className="truncate text-slate-700">{s.scenario_name}</span>
                    <span className="ml-auto font-mono text-slate-500 text-[11px]">
                      {metric(s) !== null ? fmtTRY(metric(s)!) : '∞'}
                    </span>
                    {s.scenario_id === recommended_scenario_id && (
                      <span className="text-indigo-500 text-[11px]">★</span>
                    )}
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      </section>

    </div>
  )
}
