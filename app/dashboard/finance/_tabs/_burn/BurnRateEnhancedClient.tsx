'use client'
// ─────────────────────────────────────────────────────────────────────────────
// app/dashboard/finance/_tabs/_burn/BurnRateEnhancedClient.tsx
//
// Cash Burn Rate Enhanced — runway gauge, net burn KPI, efficiency badge,
// scenarios table, decomposition bars, and trend visualization.
// ─────────────────────────────────────────────────────────────────────────────

import { useQuery } from '@tanstack/react-query'
import { fmtTRY, fmtPct } from '@/lib/format'
import type {
  BurnRateEnhancedReport,
  BurnScenario,
  BurnDecomposition,
} from '@/lib/services/finance/burn-rate-enhanced.service'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Props {
  companyId: string
}

interface ApiResponse {
  report: BurnRateEnhancedReport
}

// ── Color helpers ─────────────────────────────────────────────────────────────

function runwayHealthColors(
  health: BurnRateEnhancedReport['runway_health'],
): { bg: string; text: string; border: string; label: string } {
  switch (health) {
    case 'strong':   return { bg: 'bg-[#dcfce7]', text: 'text-[#15803d]', border: 'border-[#bbf7d0]', label: 'Güçlü' }
    case 'adequate': return { bg: 'bg-[#d1fae5]', text: 'text-[#047857]', border: 'border-[#6ee7b7]', label: 'Yeterli' }
    case 'low':      return { bg: 'bg-[#fef9c3]', text: 'text-[#854d0e]', border: 'border-[#fde047]', label: 'Düşük' }
    case 'critical': return { bg: 'bg-[#fee2e2]', text: 'text-[#991b1b]', border: 'border-[#fca5a5]', label: 'Kritik' }
    case 'no_burn':  return { bg: 'bg-[#eff6ff]', text: 'text-[#1d4ed8]', border: 'border-[#bfdbfe]', label: 'Yakma Yok' }
  }
}

function efficiencyColors(
  eff: BurnRateEnhancedReport['burn_efficiency'],
): { bg: string; text: string; border: string; label: string } {
  switch (eff) {
    case 'profitable':  return { bg: 'bg-[#dcfce7]', text: 'text-[#15803d]', border: 'border-[#bbf7d0]', label: 'Karlı' }
    case 'efficient':   return { bg: 'bg-[#d1fae5]', text: 'text-[#047857]', border: 'border-[#6ee7b7]', label: 'Verimli' }
    case 'neutral':     return { bg: 'bg-[#fef9c3]', text: 'text-[#854d0e]', border: 'border-[#fde047]', label: 'Nötr' }
    case 'inefficient': return { bg: 'bg-[#ffedd5]', text: 'text-[#9a3412]', border: 'border-[#fed7aa]', label: 'Verimsiz' }
    case 'critical':    return { bg: 'bg-[#fee2e2]', text: 'text-[#991b1b]', border: 'border-[#fca5a5]', label: 'Kritik' }
  }
}

// ── Sub-components ────────────────────────────────────────────────────────────

function RunwayGauge({
  runwayMonths,
  health,
}: {
  runwayMonths: number | null
  health: BurnRateEnhancedReport['runway_health']
}) {
  const colors = runwayHealthColors(health)
  const displayMonths =
    runwayMonths !== null ? `${runwayMonths.toFixed(1)} ay` : 'Nakit Yakma Yok'

  // Gauge fill: cap at 24 months = 100%
  const fillPct =
    runwayMonths !== null ? Math.min(100, (runwayMonths / 24) * 100) : 100

  return (
    <div
      className={`rounded-xl border ${colors.border} ${colors.bg} p-5 flex flex-col gap-3`}
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-[#64748b]">Nakit Pisti</span>
        <span
          className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${colors.bg} ${colors.text} ${colors.border}`}
        >
          {colors.label}
        </span>
      </div>
      <div className={`text-3xl font-bold ${colors.text}`}>{displayMonths}</div>
      <div className="h-2 rounded-full bg-[#e2e8f0] overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${
            health === 'strong' || health === 'adequate' || health === 'no_burn'
              ? 'bg-[#22c55e]'
              : health === 'low'
              ? 'bg-[#eab308]'
              : 'bg-[#ef4444]'
          }`}
          style={{ width: `${fillPct}%` }}
        />
      </div>
    </div>
  )
}

function NetBurnKPI({ netBurn }: { netBurn: number }) {
  const isPositive = netBurn > 0
  return (
    <div className="rounded-xl border border-[#e2e8f0] bg-white p-5 flex flex-col gap-2">
      <span className="text-sm font-medium text-[#64748b]">
        Aylık Net Nakit Yakma
      </span>
      <span
        className={`text-2xl font-bold ${isPositive ? 'text-[#ef4444]' : 'text-[#22c55e]'}`}
      >
        {isPositive ? '+' : ''}
        {fmtTRY(netBurn)}
      </span>
      <span className="text-xs text-[#94a3b8]">
        {isPositive ? 'Nakit tüketiliyor' : 'Nakit birikimi var'}
      </span>
    </div>
  )
}

function EfficiencyBadge({
  ratio,
  efficiency,
}: {
  ratio: number | null
  efficiency: BurnRateEnhancedReport['burn_efficiency']
}) {
  const colors = efficiencyColors(efficiency)
  return (
    <div className="rounded-xl border border-[#e2e8f0] bg-white p-5 flex flex-col gap-2">
      <span className="text-sm font-medium text-[#64748b]">
        Verimlilik Oranı
      </span>
      <div className="flex items-center gap-2">
        <span className="text-2xl font-bold text-[#0f172a]">
          {ratio !== null ? ratio.toFixed(2) : '—'}
        </span>
        <span
          className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${colors.bg} ${colors.text} ${colors.border}`}
        >
          {colors.label}
        </span>
      </div>
      <span className="text-xs text-[#94a3b8]">
        Gelir ÷ Brüt Nakit Yakma
      </span>
    </div>
  )
}

function ScenariosTable({ scenarios }: { scenarios: BurnScenario[] }) {
  return (
    <div className="rounded-xl border border-[#e2e8f0] bg-white overflow-hidden">
      <div className="px-5 py-3 border-b border-[#f1f5f9]">
        <h3 className="text-sm font-semibold text-[#0f172a]">Senaryolar</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[#f8fafc]">
              <th className="text-left px-4 py-2 text-[#64748b] font-medium">
                Senaryo
              </th>
              <th className="text-right px-4 py-2 text-[#64748b] font-medium">
                Gider
              </th>
              <th className="text-right px-4 py-2 text-[#64748b] font-medium">
                Gelir
              </th>
              <th className="text-right px-4 py-2 text-[#64748b] font-medium">
                Net Yakma
              </th>
              <th className="text-right px-4 py-2 text-[#64748b] font-medium">
                Pist (ay)
              </th>
            </tr>
          </thead>
          <tbody>
            {scenarios.map((s, i) => (
              <tr
                key={i}
                className={i % 2 === 0 ? 'bg-white' : 'bg-[#f8fafc]'}
              >
                <td className="px-4 py-2 font-medium text-[#0f172a]">
                  {s.name}
                </td>
                <td className="px-4 py-2 text-right text-[#64748b]">
                  {fmtTRY(s.monthly_burn)}
                </td>
                <td className="px-4 py-2 text-right text-[#64748b]">
                  {fmtTRY(s.revenue_assumption)}
                </td>
                <td
                  className={`px-4 py-2 text-right font-medium ${
                    s.net_burn > 0 ? 'text-[#ef4444]' : 'text-[#22c55e]'
                  }`}
                >
                  {s.net_burn > 0 ? '+' : ''}
                  {fmtTRY(s.net_burn)}
                </td>
                <td className="px-4 py-2 text-right text-[#0f172a]">
                  {s.runway_months !== null
                    ? s.runway_months.toFixed(1)
                    : '∞'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function DecompositionBars({
  decomposition,
}: {
  decomposition: BurnDecomposition[]
}) {
  const max = decomposition[0]?.monthly_amount ?? 1

  return (
    <div className="rounded-xl border border-[#e2e8f0] bg-white p-5">
      <h3 className="text-sm font-semibold text-[#0f172a] mb-4">
        Gider Dağılımı
      </h3>
      <div className="flex flex-col gap-3">
        {decomposition.map((d, i) => (
          <div key={i} className="flex flex-col gap-1">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-1.5">
                <span className="font-medium text-[#0f172a]">{d.category}</span>
                {d.is_fixed && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#e0f2fe] text-[#0369a1] border border-[#bae6fd]">
                    Sabit
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 text-[#64748b]">
                <span>{fmtTRY(d.monthly_amount)}</span>
                <span className="text-[#94a3b8]">
                  {fmtPct(d.pct_of_total_burn / 100)}
                </span>
              </div>
            </div>
            <div className="h-1.5 rounded-full bg-[#f1f5f9] overflow-hidden">
              <div
                className="h-full rounded-full bg-[#6366f1] transition-all"
                style={{
                  width: `${(d.monthly_amount / max) * 100}%`,
                }}
              />
            </div>
          </div>
        ))}
        {decomposition.length === 0 && (
          <p className="text-sm text-[#94a3b8]">Gider verisi bulunamadı.</p>
        )}
      </div>
    </div>
  )
}

function TrendChart({
  trend,
}: {
  trend: BurnRateEnhancedReport['burn_trend']
}) {
  const maxBurn = Math.max(...trend.map(t => t.burn), 1)

  return (
    <div className="rounded-xl border border-[#e2e8f0] bg-white p-5">
      <h3 className="text-sm font-semibold text-[#0f172a] mb-4">
        Aylık Yakma Trendi
      </h3>
      <div className="flex items-end gap-2 h-24">
        {trend.map((t, i) => {
          const barH = Math.max(4, (t.burn / maxBurn) * 96)
          const avgH =
            t.rolling_avg !== null
              ? Math.max(4, (t.rolling_avg / maxBurn) * 96)
              : null
          return (
            <div
              key={i}
              className="flex-1 flex flex-col items-center justify-end gap-0.5"
              title={`Ay ${i + 1}: ${fmtTRY(t.burn)}${t.rolling_avg !== null ? ` / Ort: ${fmtTRY(t.rolling_avg)}` : ''}`}
            >
              <div className="relative w-full flex items-end justify-center">
                <div
                  className="w-full rounded-t bg-[#6366f1] opacity-80"
                  style={{ height: `${barH}px` }}
                />
                {avgH !== null && (
                  <div
                    className="absolute w-full border-t-2 border-[#f97316]"
                    style={{ bottom: `${avgH}px` }}
                  />
                )}
              </div>
              <span className="text-[9px] text-[#94a3b8]">{i + 1}</span>
            </div>
          )
        })}
      </div>
      <div className="flex items-center gap-4 mt-3 text-xs text-[#64748b]">
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-sm bg-[#6366f1]" />
          <span>Brüt Yakma</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-0.5 bg-[#f97316]" />
          <span>Hareketli Ortalama (3 ay)</span>
        </div>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function BurnRateEnhancedClient({ companyId }: Props) {
  const { data, isLoading, isError, error } = useQuery<ApiResponse>({
    queryKey: ['burn-rate-enhanced', companyId],
    queryFn: async () => {
      const res = await fetch('/api/finance/burn-rate-enhanced')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json()
    },
    staleTime: 1000 * 60 * 5,
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-48 text-sm text-[#94a3b8]">
        Yükleniyor…
      </div>
    )
  }

  if (isError || !data?.report) {
    return (
      <div className="rounded-xl border border-[#fca5a5] bg-[#fef2f2] p-5 text-sm text-[#991b1b]">
        Veri yüklenemedi:{' '}
        {error instanceof Error ? error.message : 'Bilinmeyen hata'}
      </div>
    )
  }

  const r = data.report

  return (
    <div className="flex flex-col gap-5">
      {/* Narrative banner */}
      <div className="rounded-xl border border-[#e2e8f0] bg-[#f8fafc] px-5 py-3 text-sm text-[#475569]">
        {r.narrative}
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <RunwayGauge runwayMonths={r.runway_months} health={r.runway_health} />
        <NetBurnKPI netBurn={r.monthly_net_burn} />
        <EfficiencyBadge
          ratio={r.burn_efficiency_ratio}
          efficiency={r.burn_efficiency}
        />
      </div>

      {/* Scenarios table */}
      <ScenariosTable scenarios={r.burn_scenarios} />

      {/* Decomposition + Trend side by side on large screens */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <DecompositionBars decomposition={r.burn_decomposition} />
        <TrendChart trend={r.burn_trend} />
      </div>

      {/* Ideal burn footer */}
      <div className="rounded-xl border border-[#e2e8f0] bg-white px-5 py-3 flex items-center justify-between text-sm">
        <span className="text-[#64748b]">
          12 Aylık Pist için İdeal Brüt Gider
        </span>
        <span className="font-semibold text-[#0f172a]">
          {fmtTRY(r.ideal_burn_for_12_month_runway)}
        </span>
      </div>
    </div>
  )
}
