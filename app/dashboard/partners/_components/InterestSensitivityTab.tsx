'use client'

// ─────────────────────────────────────────────────────────────────────────────
// InterestSensitivityTab — Faiz Oranı Duyarlılık Analizi
//
// Displays:
//   - 4 KPI cells: total outstanding, weighted avg rate, base annual interest, ICR
//   - Sensitivity risk badge
//   - Scenario comparison table (5 rows, one per scenario)
//   - Breakeven rate indicator
// ─────────────────────────────────────────────────────────────────────────────

import { useQuery } from '@tanstack/react-query'
import {
  Panel, PanelHeader, KpiStrip, KpiCell, EmptySlate, Skeleton,
} from '@/components/ds'
import { fmtTRY, fmtPct } from '@/lib/format'
import type {
  InterestRateSensitivityReport,
  PortfolioSensitivity,
} from '@/lib/services/pcle/interest-rate-sensitivity.service'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Props {
  companyId?: string
}

// ── Fetch ─────────────────────────────────────────────────────────────────────

async function fetchReport(): Promise<InterestRateSensitivityReport> {
  const res = await fetch('/api/partners/interest-sensitivity')
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body?.error ?? `HTTP ${res.status}`)
  }
  const json = await res.json()
  return json.report as InterestRateSensitivityReport
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function icrHealthColor(
  health: InterestRateSensitivityReport['interest_coverage_health'],
): string {
  switch (health) {
    case 'excellent': return 'text-pos-text'
    case 'good':      return 'text-pos-text'
    case 'adequate':  return 'text-info-text'
    case 'thin':      return 'text-warn-text'
    case 'critical':  return 'text-neg-text'
    case 'no_debt':   return 'text-[#64748b]'
    default:          return 'text-[#64748b]'
  }
}

function icrHealthLabel(
  health: InterestRateSensitivityReport['interest_coverage_health'],
): string {
  switch (health) {
    case 'excellent': return 'Mükemmel'
    case 'good':      return 'İyi'
    case 'adequate':  return 'Yeterli'
    case 'thin':      return 'Sınırda'
    case 'critical':  return 'Kritik'
    case 'no_debt':   return 'Borç Yok'
    default:          return '—'
  }
}

function riskBadgeStyle(
  risk: InterestRateSensitivityReport['rate_sensitivity_risk'],
): { bg: string; text: string } {
  switch (risk) {
    case 'low_risk':  return { bg: 'bg-pos-light',  text: 'text-pos-text'  }
    case 'moderate':  return { bg: 'bg-info-light',  text: 'text-info-text' }
    case 'elevated':  return { bg: 'bg-warn-light',  text: 'text-warn-text' }
    case 'high_risk': return { bg: 'bg-orange-50',   text: 'text-orange-700'}
    case 'critical':  return { bg: 'bg-neg-light',   text: 'text-neg-text'  }
    case 'no_debt':   return { bg: 'bg-[#f1f5f9]',   text: 'text-[#64748b]' }
    default:          return { bg: 'bg-[#f1f5f9]',   text: 'text-[#64748b]' }
  }
}

function riskLabel(
  risk: InterestRateSensitivityReport['rate_sensitivity_risk'],
): string {
  switch (risk) {
    case 'low_risk':  return 'Düşük Risk'
    case 'moderate':  return 'Orta Risk'
    case 'elevated':  return 'Artmış Risk'
    case 'high_risk': return 'Yüksek Risk'
    case 'critical':  return 'Kritik'
    case 'no_debt':   return 'Borç Yok'
    default:          return '—'
  }
}

function incrementalCostColor(amount: number): string {
  if (amount < 0) return 'text-pos-text'   // savings — green
  if (amount > 0) return 'text-neg-text'   // higher cost — red
  return 'text-[#64748b]'                  // base — neutral
}

function isBaseScenario(rateDelta: number): boolean {
  return rateDelta === 0
}

// ── Scenario Table ────────────────────────────────────────────────────────────

function ScenarioTable({
  portfolio,
}: {
  portfolio: PortfolioSensitivity
}) {
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-[#e2e8f0] text-[#64748b]">
            <th className="pb-2 text-left font-medium">Senaryo</th>
            <th className="pb-2 text-right font-medium">Yıllık Faiz</th>
            <th className="pb-2 text-right font-medium">Artış / Azalış</th>
            <th className="pb-2 text-right font-medium">Net Gelir Etkisi</th>
            <th className="pb-2 text-right font-medium">Faiz Karşılama</th>
          </tr>
        </thead>
        <tbody>
          {portfolio.scenarios.map(scenario => {
            const isBase  = isBaseScenario(scenario.rate_delta_pct)
            const rowBg   = isBase ? 'bg-[#f8fafc]' : ''

            return (
              <tr
                key={scenario.scenario_name}
                className={`border-b border-[#f1f5f9] last:border-0 ${rowBg}`}
              >
                <td className="py-2">
                  <div className="flex items-center gap-2">
                    <span className={`font-medium ${isBase ? 'text-info-text' : 'text-[#1e293b]'}`}>
                      {scenario.scenario_name}
                    </span>
                    {isBase && (
                      <span className="rounded bg-info-light px-1.5 py-0.5 text-[10px] font-medium text-info-text">
                        Baz
                      </span>
                    )}
                  </div>
                  <div className="text-[#94a3b8] text-[10px] mt-0.5">
                    Aylık: {fmtTRY(scenario.total_monthly_interest_try)}
                  </div>
                </td>
                <td className="py-2 text-right font-semibold text-[#1e293b]">
                  {fmtTRY(scenario.total_annual_interest_try)}
                </td>
                <td className={`py-2 text-right font-semibold ${incrementalCostColor(scenario.incremental_annual_cost_try)}`}>
                  {isBase
                    ? <span className="text-[#94a3b8]">—</span>
                    : scenario.incremental_annual_cost_try >= 0
                      ? `+${fmtTRY(scenario.incremental_annual_cost_try)}`
                      : fmtTRY(scenario.incremental_annual_cost_try)
                  }
                </td>
                <td className="py-2 text-right text-[#64748b]">
                  {scenario.net_income_impact_pct !== null
                    ? (
                      <span className={incrementalCostColor(scenario.net_income_impact_pct)}>
                        {scenario.net_income_impact_pct >= 0
                          ? `+${fmtPct(scenario.net_income_impact_pct)}`
                          : fmtPct(scenario.net_income_impact_pct)
                        }
                      </span>
                    )
                    : <span className="text-[#94a3b8]">—</span>
                  }
                </td>
                <td className="py-2 text-right text-[#64748b]">
                  {scenario.dscr_impact !== null
                    ? (
                      <span className={
                        scenario.dscr_impact >= 3.0 ? 'text-pos-text' :
                        scenario.dscr_impact >= 1.5 ? 'text-warn-text' :
                        'text-neg-text'
                      }>
                        {scenario.dscr_impact.toFixed(2)}x
                      </span>
                    )
                    : <span className="text-[#94a3b8]">—</span>
                  }
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ── Breakeven Indicator ───────────────────────────────────────────────────────

function BreakevenIndicator({
  breakevenRate,
  weightedAvgRate,
}: {
  breakevenRate: number | null
  weightedAvgRate: number
}) {
  if (breakevenRate === null) return null

  const isAbove  = weightedAvgRate >= breakevenRate
  const headroom = breakevenRate - weightedAvgRate

  return (
    <Panel>
      <PanelHeader
        label="Başabaş Faiz Oranı"
        sub="Net kârın sıfırlandığı faiz seviyesi"
      />
      <div className="mt-3 flex items-start justify-between gap-4">
        <div>
          <div className="text-2xl font-bold text-[#1e293b]">
            %{breakevenRate.toFixed(2)}
          </div>
          <div className="text-xs text-[#64748b] mt-1">
            Başabaş faiz oranı
          </div>
        </div>
        <div className="text-right">
          <div className={`text-xl font-semibold ${isAbove ? 'text-neg-text' : 'text-pos-text'}`}>
            {isAbove
              ? `−%${Math.abs(headroom).toFixed(2)} aşım`
              : `+%${headroom.toFixed(2)} marj`
            }
          </div>
          <div className="text-xs text-[#64748b] mt-1">
            Mevcut ağırlıklı ort. oran: %{weightedAvgRate.toFixed(2)}
          </div>
        </div>
      </div>
      {!isAbove && (
        <div className="mt-3 h-2 w-full rounded bg-[#f1f5f9] overflow-hidden">
          <div
            className="h-full rounded bg-pos-text transition-all"
            style={{
              width: `${Math.min(100, (weightedAvgRate / breakevenRate) * 100)}%`,
            }}
          />
        </div>
      )}
      {isAbove && (
        <div className="mt-3 rounded border border-neg-text/20 bg-neg-light px-3 py-2 text-xs text-neg-text">
          Mevcut faiz oranı başabaş seviyesini aşmış — borç yükü kârlılığı olumsuz etkiliyor.
        </div>
      )}
    </Panel>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export function InterestSensitivityTab({ companyId }: Props) {
  const { data: report, isLoading, error } = useQuery<InterestRateSensitivityReport, Error>({
    queryKey:  ['interest-sensitivity', companyId ?? ''],
    queryFn:   fetchReport,
    staleTime: 1000 * 60 * 30,
  })

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded border border-neg-text/20 bg-neg-light px-4 py-3 text-xs font-medium text-neg-text">
        {error.message}
      </div>
    )
  }

  if (!report || report.total_outstanding_try === 0) {
    return (
      <EmptySlate
        title="Aktif Borç Tranşı Bulunamadı"
        sub="Faiz duyarlılık analizi için henüz aktif ortak kredi tranşı girilmemiş."
      />
    )
  }

  const icrLabel = report.interest_coverage_ratio !== null
    ? `${report.interest_coverage_ratio.toFixed(2)}x`
    : '—'

  const { bg: riskBg, text: riskText } = riskBadgeStyle(report.rate_sensitivity_risk)

  return (
    <div className="space-y-5">
      {/* ── KPI Strip ──────────────────────────────────────────────────────── */}
      <Panel>
        <PanelHeader
          label="Faiz Oranı Duyarlılık Analizi"
          sub="Partner kredi tranşlarının faiz değişimlerine karşı duyarlılığı"
        />

        {/* Sensitivity risk badge */}
        <div className="mt-3 mb-4 flex items-center gap-2">
          <span className="text-xs text-[#64748b]">Duyarlılık Riski:</span>
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${riskBg} ${riskText}`}>
            {riskLabel(report.rate_sensitivity_risk)}
          </span>
        </div>

        <KpiStrip cols={4}>
          <KpiCell
            label="Toplam Kalan Borç"
            value={fmtTRY(report.total_outstanding_try)}
          />
          <KpiCell
            label="Ağırlıklı Ort. Faiz"
            value={`%${report.weighted_avg_rate_pct.toFixed(2)}`}
          />
          <KpiCell
            label="Yıllık Faiz Gideri (Baz)"
            value={fmtTRY(report.base_annual_interest_try)}
          />
          <KpiCell
            label="Faiz Karşılama Oranı"
            value={
              <span className={icrHealthColor(report.interest_coverage_health)}>
                {icrLabel} — {icrHealthLabel(report.interest_coverage_health)}
              </span>
            }
          />
        </KpiStrip>
      </Panel>

      {/* ── Scenario Comparison Table ───────────────────────────────────────── */}
      <Panel>
        <PanelHeader
          label="Senaryo Karşılaştırması"
          sub="5 farklı faiz senaryosunda yıllık faiz yükü ve P&L etkisi"
        />
        <ScenarioTable portfolio={report.portfolio_sensitivity} />
      </Panel>

      {/* ── Breakeven Rate Indicator ────────────────────────────────────────── */}
      <BreakevenIndicator
        breakevenRate={report.breakeven_rate_pct}
        weightedAvgRate={report.weighted_avg_rate_pct}
      />
    </div>
  )
}
