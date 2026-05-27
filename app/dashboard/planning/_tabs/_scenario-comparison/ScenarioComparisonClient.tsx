'use client'
// ── ScenarioComparisonClient — Senaryo Karşılaştırma Matrisi ─────────────────
//
// Client island. Fetches /api/planning/scenario-comparison via TanStack Query.
// Lets user pick which scenarios to compare (chips).
// Renders side-by-side metric matrix with best-value highlights and baseline deltas.

import { useState, useMemo }      from 'react'
import { useQuery }               from '@tanstack/react-query'
import type {
  ScenarioComparisonReport,
  ScenarioSnapshot,
} from '@/lib/services/planning/scenario-comparison.service'
import { COMPARISON_METRICS }     from '@/lib/services/planning/scenario-comparison.service'

// ── Helpers ───────────────────────────────────────────────────────────────────

const FMT_TRY = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 })

function fmtValue(value: number | null, unit: string): string {
  if (value === null) return '—'
  if (unit === 'TRY') {
    const abs = Math.abs(value)
    if (abs >= 1_000_000) return `₺${(value / 1_000_000).toFixed(1)}M`
    if (abs >= 1_000)     return `₺${(value / 1_000).toFixed(0)}K`
    return `₺${FMT_TRY.format(Math.round(value))}`
  }
  if (unit === '%')  return `%${value.toFixed(1)}`
  if (unit === 'ay') return `${Math.round(value)} ay`
  if (unit === 'x')  return `${(value * 100).toFixed(0)}%`
  return String(value)
}

function fmtDelta(delta: number | null): string {
  if (delta === null) return ''
  const sign = delta >= 0 ? '+' : ''
  return `${sign}${delta.toFixed(1)}%`
}

// ── API response type ─────────────────────────────────────────────────────────

interface ApiResponse {
  report: ScenarioComparisonReport
}

// ── ScenarioChip — clickable selector ────────────────────────────────────────

function ScenarioChip({
  scenario,
  selected,
  onToggle,
}: {
  scenario: ScenarioSnapshot
  selected: boolean
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={[
        'inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-[10px] font-semibold border transition-all',
        selected
          ? 'bg-brand text-white border-brand shadow-sm'
          : 'bg-white text-[#64748b] border-[#e2e8f0] hover:border-brand/40 hover:text-brand',
      ].join(' ')}
    >
      {scenario.is_baseline && (
        <span className="text-[8px] font-black uppercase tracking-wide opacity-70 mr-0.5">BZ</span>
      )}
      {scenario.name}
    </button>
  )
}

// ── ComparisonMatrix ──────────────────────────────────────────────────────────

function ComparisonMatrix({
  report,
  selectedIds,
}: {
  report:      ScenarioComparisonReport
  selectedIds: string[]
}) {
  const selectedScenarios = useMemo(
    () => report.scenarios.filter(s => selectedIds.includes(s.id)),
    [report.scenarios, selectedIds],
  )

  if (selectedScenarios.length === 0) {
    return (
      <div className="text-center py-8 text-xs text-[#94a3b8]">
        Karşılaştırmak için en az bir senaryo seçin.
      </div>
    )
  }

  const metricMap = Object.fromEntries(COMPARISON_METRICS.map(m => [m.key, m]))

  return (
    <div className="overflow-x-auto rounded border border-[#e2e8f0]">
      <table className="w-full text-[10px] min-w-[500px]">
        <thead>
          <tr className="bg-[#f8fafc]">
            <th className="text-left px-4 py-2.5 font-black text-[#94a3b8] whitespace-nowrap w-44">
              Metrik
            </th>
            {selectedScenarios.map(s => (
              <th key={s.id} className="text-right px-4 py-2.5 whitespace-nowrap">
                <div className="flex items-center justify-end gap-1 font-black text-[#0f172a]">
                  {s.is_baseline && (
                    <span className="text-[8px] font-black text-brand-light uppercase tracking-wide">BZ</span>
                  )}
                  {s.name}
                </div>
                {report.recommended_scenario_id === s.id && (
                  <div className="text-[8px] font-bold text-brand-light mt-0.5 text-right">★ Önerilen</div>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[#f1f5f9]">
          {report.comparison_rows.map(row => {
            const metric = metricMap[row.metric_key]
            if (!metric) return null

            return (
              <tr key={row.metric_key} className="hover:bg-[#f8fafc]/60">
                <td className="px-4 py-2.5 text-[#475569] font-semibold whitespace-nowrap">
                  {metric.label}
                  <span className="ml-1 text-[#cbd5e1] font-normal">({metric.unit})</span>
                </td>
                {selectedScenarios.map(s => {
                  const value = row.values[s.id] ?? null
                  const delta = row.baseline_deltas[s.id] ?? null
                  const isBest = row.best_scenario_id === s.id && value !== null

                  return (
                    <td key={s.id} className="px-4 py-2.5 text-right tabular-nums">
                      <div
                        className={[
                          'font-black',
                          isBest ? 'text-pos-text' : 'text-[#334155]',
                        ].join(' ')}
                      >
                        {isBest && <span className="mr-0.5">★ </span>}
                        {fmtValue(value, metric.unit)}
                      </div>
                      {delta !== null && !s.is_baseline && (
                        <div
                          className={[
                            'text-[9px] mt-0.5 font-semibold',
                            delta > 0 ? 'text-pos-text' : 'text-neg',
                          ].join(' ')}
                        >
                          {fmtDelta(delta)}
                        </div>
                      )}
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ── ScenarioComparisonClient — main export ────────────────────────────────────

export function ScenarioComparisonClient() {
  const { data, isLoading, isError } = useQuery<ApiResponse>({
    queryKey: ['scenario-comparison'],
    queryFn:  async () => {
      const res = await fetch('/api/planning/scenario-comparison', { cache: 'no-store' })
      if (!res.ok) throw new Error('Karşılaştırma verisi yüklenemedi')
      return res.json() as Promise<ApiResponse>
    },
    staleTime: 5 * 60 * 1000,
    retry:     1,
  })

  const report = data?.report

  // Explicit selection state; empty = "all"
  const [selectedIds, setSelectedIds] = useState<string[]>([])

  // Derive effective selection: fall back to all if nothing explicitly chosen
  const effectiveSelected = useMemo(() => {
    if (!report) return selectedIds
    if (selectedIds.length === 0 && report.scenarios.length > 0) {
      return report.scenarios.map(s => s.id)
    }
    return selectedIds
  }, [report, selectedIds])

  function toggleScenario(id: string) {
    setSelectedIds(prev => {
      const base = prev.length > 0 ? prev : (report?.scenarios.map(s => s.id) ?? [])
      return base.includes(id)
        ? base.filter(x => x !== id)
        : [...base, id]
    })
  }

  // Loading skeleton
  if (isLoading) {
    return (
      <div className="animate-pulse space-y-3">
        <div className="flex gap-2">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-7 w-24 bg-[#f1f5f9] rounded" />
          ))}
        </div>
        <div className="h-40 bg-[#f1f5f9] rounded" />
      </div>
    )
  }

  // Error state
  if (isError || !report) {
    return (
      <div className="px-4 py-3 rounded border border-[#fecaca] bg-[#fef2f2] text-[#ef4444] text-xs">
        Karşılaştırma verisi yüklenemedi. Lütfen sayfayı yenileyin.
      </div>
    )
  }

  // Empty state — no saved scenarios
  if (report.scenarios.length === 0) {
    return (
      <div className="px-4 py-6 rounded border border-[#e2e8f0] bg-[#f8fafc] text-center">
        <div className="text-xs text-[#94a3b8]">Kayıtlı senaryo bulunamadı.</div>
        <div className="text-[10px] text-[#cbd5e1] mt-1">
          Yukarıdaki what-if motoruyla senaryo oluşturun ve kaydedin.
        </div>
      </div>
    )
  }

  const recommended = report.scenarios.find(s => s.id === report.recommended_scenario_id)

  return (
    <div className="space-y-4">

      {/* Recommendation banner */}
      {recommended && (
        <div className="px-4 py-3 bg-brand-subtle border border-brand/10 rounded flex items-start gap-2">
          <span className="text-brand font-black text-sm mt-0.5">✓</span>
          <div>
            <span className="text-xs font-black text-brand">Önerilen: {recommended.name}</span>
            <p className="text-[10px] text-brand-light mt-0.5 leading-relaxed max-w-xl">
              {report.recommendation_reason}
            </p>
          </div>
        </div>
      )}

      {/* Scenario selector chips */}
      <div className="space-y-1.5">
        <div className="text-[9px] font-black uppercase tracking-widest text-[#94a3b8]">
          Karşılaştırma Seçimi
        </div>
        <div className="flex flex-wrap gap-2">
          {report.scenarios.map(s => (
            <ScenarioChip
              key={s.id}
              scenario={s}
              selected={effectiveSelected.includes(s.id)}
              onToggle={() => toggleScenario(s.id)}
            />
          ))}
        </div>
        {report.baseline_id && (
          <div className="text-[9px] text-[#cbd5e1]">
            BZ = Baz senaryo · Delta değerleri baz senaryoya göre hesaplanır · ★ = Metrik bazında en iyi
          </div>
        )}
      </div>

      {/* Comparison matrix */}
      <ComparisonMatrix report={report} selectedIds={effectiveSelected} />

      <div className="text-[9px] text-[#cbd5e1] px-1">
        Son 5 senaryo gösterilmektedir · Önerilen senaryo: runway {'>'}6 ay ve maks. DSR {'<'}%70 koşullarını karşılayan en yüksek net kârlı senaryo
      </div>
    </div>
  )
}
