'use client'

// ─────────────────────────────────────────────────────────────────────────────
// CashSensitivityClient
//
// Cash Flow Sensitivity Analysis (Stress Testing)
//
// Features:
//   - Base metrics strip: Current Cash / Base Runway / Monthly Revenue / Monthly Burn
//   - Scenario comparison table with Impact badges
//   - Worst case row highlighted with red background
//   - Key risk callout
//   - No-data empty state
// ─────────────────────────────────────────────────────────────────────────────

import { useQuery }  from '@tanstack/react-query'
import { fmtTRY, fmtRunway } from '@/lib/format'
import type { CashSensitivityReport, StressScenario } from '@/lib/services/finance/cash-sensitivity.service'

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  companyId: string
}

// ── Impact badge ──────────────────────────────────────────────────────────────

function ImpactBadge({ impact }: { impact: StressScenario['stress_impact'] }) {
  const map: Record<StressScenario['stress_impact'], { label: string; cls: string }> = {
    resilient:  { label: 'Dayanıklı',  cls: 'bg-green-100 text-green-800' },
    moderate:   { label: 'Orta',       cls: 'bg-yellow-100 text-yellow-800' },
    vulnerable: { label: 'Kırılgan',   cls: 'bg-orange-100 text-orange-800' },
    critical:   { label: 'Kritik',     cls: 'bg-red-100 text-red-800' },
    unknown:    { label: 'Bilinmiyor', cls: 'bg-[#f1f5f9] text-[#475569]' },
  }
  const cfg = map[impact]
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold ${cfg.cls}`}>
      {cfg.label}
    </span>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────

export function CashSensitivityClient({ companyId }: Props) {
  const { data, isLoading, isError } = useQuery<{ report: CashSensitivityReport }>({
    queryKey: ['cash-sensitivity', companyId],
    queryFn: async () => {
      const res = await fetch('/api/finance/cash-sensitivity', { cache: 'no-store' })
      if (!res.ok) throw new Error('Stres testi verisi alınamadı')
      return res.json()
    },
    staleTime: 1000 * 60 * 30, // 30 minutes
  })

  const report = data?.report

  return (
    <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft overflow-hidden shadow-sm">
      {/* Header */}
      <div className="px-4 py-3 border-b border-[#e8eaef]">
        <div className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8]">
          Nakit Duyarlılık Analizi — Stres Testi
        </div>
        <p className="text-[10px] text-[#94a3b8] mt-0.5">
          5 olumsuz senaryoda nakit pozisyonunun stres testi
        </p>
      </div>

      {isLoading && (
        <div className="px-4 py-8 text-center text-xs text-[#94a3b8]">
          Stres analizi hesaplanıyor...
        </div>
      )}

      {isError && (
        <div className="px-4 py-4 text-xs text-red-600 font-semibold">
          Veri yüklenemedi. Lütfen sayfayı yenileyin.
        </div>
      )}

      {!isLoading && !isError && !report && (
        <div className="px-4 py-8 text-center text-xs text-[#94a3b8]">
          Nakit akışı verisi hesaplanamadı
        </div>
      )}

      {report && report.scenarios.length === 0 && (
        <div className="px-4 py-8 text-center text-xs text-[#94a3b8]">
          Nakit akışı verisi hesaplanamadı
        </div>
      )}

      {report && report.scenarios.length > 0 && (
        <>
          {/* Base metrics strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 divide-y sm:divide-y-0 divide-x-0 sm:divide-x divide-[#e8eaef] border-b border-[#e8eaef]">
            {[
              {
                label: 'Mevcut Nakit',
                value: fmtTRY(report.current_cash_try, 0),
                tone:  report.current_cash_try > 0 ? 'text-[#0f172a]' : 'text-red-600',
              },
              {
                label: 'Baz Runway',
                value: fmtRunway(report.base_runway_months),
                tone:
                  report.base_runway_months === null
                    ? 'text-[#94a3b8]'
                    : report.base_runway_months <= 2
                      ? 'text-red-600'
                      : report.base_runway_months <= 6
                        ? 'text-amber-600'
                        : 'text-green-700',
              },
              {
                label: 'Aylık Gelir (Ort.)',
                value: fmtTRY(report.base_monthly_revenue_try, 0),
                tone:  'text-green-700',
              },
              {
                label: 'Aylık Gider (Ort.)',
                value: fmtTRY(report.base_monthly_burn_try, 0),
                tone:  'text-red-600',
              },
            ].map(item => (
              <div key={item.label} className="px-4 py-3">
                <div className="text-[0.6rem] font-bold uppercase tracking-wider text-[#94a3b8] mb-1">
                  {item.label}
                </div>
                <div className={`text-base font-extrabold tabular-nums leading-none ${item.tone}`}>
                  {item.value}
                </div>
              </div>
            ))}
          </div>

          {/* Key risk callout */}
          <div className="px-4 py-3 bg-amber-50 border-b border-amber-200">
            <p className="text-xs font-semibold text-amber-800">
              En kritik risk: {report.key_risk}
            </p>
          </div>

          {/* Scenario table */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[700px]">
              <thead>
                <tr className="bg-[#f8fafc] border-b border-[#e8eaef]">
                  <th className="text-left px-3 py-2.5 text-[0.6rem] font-bold uppercase tracking-wider text-[#94a3b8]">
                    Senaryo
                  </th>
                  <th className="text-right px-3 py-2.5 text-[0.6rem] font-bold uppercase tracking-wider text-red-600">
                    Gelir Şoku
                  </th>
                  <th className="text-right px-3 py-2.5 text-[0.6rem] font-bold uppercase tracking-wider text-amber-600">
                    Tahsilat Gecikmesi
                  </th>
                  <th className="text-right px-3 py-2.5 text-[0.6rem] font-bold uppercase tracking-wider text-orange-600">
                    Gider Artışı
                  </th>
                  <th className="text-right px-3 py-2.5 text-[0.6rem] font-bold uppercase tracking-wider text-[#94a3b8]">
                    Stresli Runway
                  </th>
                  <th className="text-right px-3 py-2.5 text-[0.6rem] font-bold uppercase tracking-wider text-[#94a3b8]">
                    Delta
                  </th>
                  <th className="px-3 py-2.5 text-[0.6rem] font-bold uppercase tracking-wider text-[#94a3b8]">
                    Etki
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f1f5f9]">
                {report.scenarios.map(scenario => {
                  const isWorstCase = scenario.scenario_id === report.worst_case.scenario_id
                  const rowBg = isWorstCase ? 'bg-red-50/60' : ''

                  return (
                    <tr
                      key={scenario.scenario_id}
                      className={`hover:bg-[#f8fafc]/60 ${rowBg}`}
                    >
                      <td className={`px-3 py-2.5 font-semibold ${isWorstCase ? 'text-red-700' : 'text-[#334155]'}`}>
                        {scenario.scenario_name}
                        {isWorstCase && (
                          <span className="ml-1.5 text-[9px] font-black text-red-600 uppercase">
                            En Kötü
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums font-mono text-red-600">
                        {scenario.revenue_shock_pct > 0
                          ? `−%${scenario.revenue_shock_pct}`
                          : <span className="text-[#cbd5e1]">—</span>}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums font-mono text-amber-700">
                        {scenario.collections_delay_days > 0
                          ? `${scenario.collections_delay_days} gün`
                          : <span className="text-[#cbd5e1]">—</span>}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums font-mono text-orange-700">
                        {scenario.expense_surge_pct > 0
                          ? `+%${scenario.expense_surge_pct}`
                          : <span className="text-[#cbd5e1]">—</span>}
                      </td>
                      <td className={`px-3 py-2.5 text-right tabular-nums font-mono ${
                        scenario.stressed_runway_months === null
                          ? 'text-[#94a3b8]'
                          : scenario.stressed_runway_months <= 2
                            ? 'text-red-600'
                            : scenario.stressed_runway_months <= 6
                              ? 'text-amber-600'
                              : 'text-green-700'
                      }`}>
                        {fmtRunway(scenario.stressed_runway_months)}
                      </td>
                      <td className={`px-3 py-2.5 text-right tabular-nums font-mono font-bold ${
                        scenario.runway_delta_months === null
                          ? 'text-[#94a3b8]'
                          : scenario.runway_delta_months >= 0
                            ? 'text-green-700'
                            : scenario.runway_delta_months >= -3
                              ? 'text-amber-700'
                              : 'text-red-600'
                      }`}>
                        {scenario.runway_delta_months !== null
                          ? `${scenario.runway_delta_months >= 0 ? '+' : ''}${scenario.runway_delta_months.toFixed(1)} ay`
                          : '—'}
                      </td>
                      <td className="px-3 py-2.5">
                        <ImpactBadge impact={scenario.stress_impact} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Footer */}
          <div className="px-4 py-2.5 border-t border-[#e8eaef] bg-[#f8fafc]">
            <p className="text-[10px] text-[#94a3b8]">
              Baz değerler son 3 aylık ortalamadan hesaplanmıştır.
              Runway, mevcut nakit / aylık net nakit tüketimi üzerinden tahmin edilmektedir.
            </p>
          </div>
        </>
      )}
    </div>
  )
}
