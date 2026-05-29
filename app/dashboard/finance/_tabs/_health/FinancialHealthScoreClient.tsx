'use client'
// ─────────────────────────────────────────────────────────────────────────────
// app/dashboard/finance/_tabs/_health/FinancialHealthScoreClient.tsx
//
// Financial Health Score — Altman Z"-Score + Flowra Composite Display
//
// Shows:
//   - Flowra Health Score (0-100) with health class badge
//   - Altman Z"-Score card with zone badge
//   - 4 Altman component bars (X1-X4)
//   - Key Risk Indicators list
//   - Inputs summary
// ─────────────────────────────────────────────────────────────────────────────

import { useQuery }       from '@tanstack/react-query'
import { fmtTRY, fmtPct } from '@/lib/format'
import type { FinancialHealthReport } from '@/lib/services/intelligence/financial-health-score.service'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Props {
  companyId: string
}

interface ApiResponse {
  report: FinancialHealthReport
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function healthClassColors(
  cls: FinancialHealthReport['health_class'],
): { bg: string; text: string; border: string; label: string } {
  switch (cls) {
    case 'excellent': return { bg: 'bg-[#dcfce7]', text: 'text-[#15803d]', border: 'border-[#bbf7d0]', label: 'Mükemmel' }
    case 'strong':    return { bg: 'bg-[#d1fae5]', text: 'text-[#047857]', border: 'border-[#6ee7b7]', label: 'Güçlü' }
    case 'adequate':  return { bg: 'bg-[#fef9c3]', text: 'text-[#854d0e]', border: 'border-[#fde047]', label: 'Yeterli' }
    case 'weak':      return { bg: 'bg-[#ffedd5]', text: 'text-[#9a3412]', border: 'border-[#fed7aa]', label: 'Zayıf' }
    case 'critical':  return { bg: 'bg-[#fee2e2]', text: 'text-[#991b1b]', border: 'border-[#fca5a5]', label: 'Kritik' }
  }
}

function zoneColors(
  zone: FinancialHealthReport['altman']['zone'],
): { bg: string; text: string; border: string; label: string } {
  switch (zone) {
    case 'safe':              return { bg: 'bg-[#dcfce7]', text: 'text-[#15803d]', border: 'border-[#bbf7d0]', label: 'Güvenli Bölge' }
    case 'grey':              return { bg: 'bg-[#fef9c3]', text: 'text-[#854d0e]', border: 'border-[#fde047]', label: 'Gri Bölge' }
    case 'distress':          return { bg: 'bg-[#fee2e2]', text: 'text-[#991b1b]', border: 'border-[#fca5a5]', label: 'Tehlike Bölgesi' }
    case 'insufficient_data': return { bg: 'bg-[#f1f5f9]', text: 'text-[#64748b]', border: 'border-[#e2e8f0]', label: 'Yetersiz Veri' }
  }
}

function scoreGaugeColor(score: number): string {
  if (score >= 80) return 'text-[#15803d]'
  if (score >= 65) return 'text-[#047857]'
  if (score >= 50) return 'text-[#854d0e]'
  if (score >= 35) return 'text-[#c2410c]'
  return 'text-[#991b1b]'
}

function ComponentBar({
  label,
  sublabel,
  value,
  weight,
}: {
  label: string
  sublabel: string
  value: number | null
  weight: string
}) {
  const displayVal = value !== null ? value.toFixed(3) : '—'
  // Normalize value to bar width: value typically -1 to +3
  const barPct = value !== null
    ? Math.min(100, Math.max(0, ((value + 1) / 4) * 100))
    : 0
  const barColor = value === null
    ? 'bg-[#e2e8f0]'
    : value >= 0 ? 'bg-[#22c55e]' : 'bg-[#ef4444]'

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <div>
          <span className="text-[11px] font-black text-[#0f172a]">{label}</span>
          <span className="text-[10px] text-[#94a3b8] ml-1">({sublabel})</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-mono text-[#475569]">{displayVal}</span>
          <span className="text-[10px] text-[#94a3b8]">× {weight}</span>
        </div>
      </div>
      <div className="h-1.5 bg-[#f1f5f9] rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${barColor}`}
          style={{ width: `${barPct}%` }}
        />
      </div>
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function FinancialHealthScoreClient({ companyId }: Props) {
  const { data, isLoading, isError } = useQuery<ApiResponse>({
    queryKey: ['financial-health-score', companyId],
    queryFn: async () => {
      const res = await fetch('/api/intelligence/financial-health-score')
      if (!res.ok) throw new Error(await res.text())
      return res.json()
    },
    staleTime: 60 * 60 * 1000,  // 1 hr
  })

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="space-y-3 animate-pulse">
        <div className="h-5 bg-[#f1f5f9] rounded w-48" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="h-32 bg-[#f1f5f9] rounded" />
          <div className="h-32 bg-[#f1f5f9] rounded" />
        </div>
        <div className="h-24 bg-[#f1f5f9] rounded" />
      </div>
    )
  }

  // ── Error ────────────────────────────────────────────────────────────────────
  if (isError || !data?.report) {
    return (
      <div className="text-[11px] text-[#94a3b8] py-3">
        Finansal sağlık skoru yüklenemedi.
      </div>
    )
  }

  const { report } = data
  const hc = healthClassColors(report.health_class)
  const zc = zoneColors(report.altman.zone)
  const { components } = report.altman

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-black uppercase tracking-widest text-[#64748b]">
          Finansal Sağlık Skoru
        </h3>
      </div>

      {/* Top row: Flowra score + Altman Z" */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">

        {/* Flowra Health Score */}
        <div className="bg-white border border-[#e2e8f0] rounded-lg px-5 py-4 shadow-sm">
          <div className="text-[0.62rem] font-black uppercase tracking-widest text-[#94a3b8] mb-2">
            Flowra Sağlık Skoru
          </div>
          <div className="flex items-end gap-3">
            <div className={`text-5xl font-black tabular-nums leading-none ${scoreGaugeColor(report.flowra_score)}`}>
              {report.flowra_score.toFixed(1)}
            </div>
            <div className="pb-1">
              <div className="text-[10px] text-[#94a3b8] leading-tight">/ 100</div>
            </div>
          </div>
          <div className="mt-2">
            <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-black border ${hc.bg} ${hc.text} ${hc.border}`}>
              {hc.label}
            </span>
          </div>
          <div className="mt-3 h-1.5 bg-[#f1f5f9] rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                report.flowra_score >= 65 ? 'bg-[#22c55e]' :
                report.flowra_score >= 50 ? 'bg-[#eab308]' : 'bg-[#ef4444]'
              }`}
              style={{ width: `${report.flowra_score}%` }}
            />
          </div>
        </div>

        {/* Altman Z"-Score */}
        <div className="bg-white border border-[#e2e8f0] rounded-lg px-5 py-4 shadow-sm">
          <div className="text-[0.62rem] font-black uppercase tracking-widest text-[#94a3b8] mb-2">
            Altman Z"-Skoru
          </div>
          <div className="flex items-end gap-3">
            <div className="text-5xl font-black tabular-nums leading-none text-[#0f172a]">
              {report.altman.z_score !== null ? report.altman.z_score.toFixed(2) : '—'}
            </div>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-black border ${zc.bg} ${zc.text} ${zc.border}`}>
              {zc.label}
            </span>
            {report.altman.percentile !== null && (
              <span className="text-[10px] text-[#94a3b8]">
                Persentil: {report.altman.percentile.toFixed(0)}
              </span>
            )}
          </div>
          <div className="mt-2 text-[9px] text-[#94a3b8] leading-snug">
            Eşikler: Güvenli ≥ 2.6 · Gri ≥ 1.1 · Tehlike &lt; 1.1
          </div>
        </div>
      </div>

      {/* Altman components */}
      <div className="bg-white border border-[#e2e8f0] rounded-lg px-5 py-4 shadow-sm space-y-3">
        <div className="text-[0.62rem] font-black uppercase tracking-widest text-[#94a3b8] mb-1">
          Altman Bileşenleri
        </div>
        <ComponentBar
          label="X1"
          sublabel="İşletme Sermayesi / Toplam Varlık"
          value={components.x1_working_capital}
          weight="6.56"
        />
        <ComponentBar
          label="X2"
          sublabel="Dağıtılmamış Kâr / Toplam Varlık"
          value={components.x2_retained_earnings}
          weight="3.26"
        />
        <ComponentBar
          label="X3"
          sublabel="EBIT / Toplam Varlık"
          value={components.x3_ebit}
          weight="6.72"
        />
        <ComponentBar
          label="X4"
          sublabel="Öz Sermaye / Toplam Yükümlülük"
          value={components.x4_equity_to_debt}
          weight="1.05"
        />
      </div>

      {/* Key Risk Indicators */}
      <div className="bg-white border border-[#e2e8f0] rounded-lg px-5 py-4 shadow-sm">
        <div className="text-[0.62rem] font-black uppercase tracking-widest text-[#94a3b8] mb-3">
          Risk Göstergeleri
        </div>
        {report.key_risk_indicators.length === 0 ? (
          <div className="flex items-center gap-2 text-[#15803d]">
            <span className="text-base">&#10003;</span>
            <span className="text-[11px] font-semibold">Risk göstergesi tespit edilmedi</span>
          </div>
        ) : (
          <ul className="space-y-1.5">
            {report.key_risk_indicators.map((indicator, i) => {
              const isCritical = indicator.startsWith('Kritik') || indicator.startsWith('Negatif')
              return (
                <li key={i} className="flex items-start gap-2">
                  <span className={`mt-0.5 text-[11px] font-black ${isCritical ? 'text-[#ef4444]' : 'text-[#f59e0b]'}`}>
                    {isCritical ? '!' : '△'}
                  </span>
                  <span className={`text-[11px] font-medium ${isCritical ? 'text-[#991b1b]' : 'text-[#92400e]'}`}>
                    {indicator}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {/* Inputs summary */}
      <div className="bg-[#f8fafc] border border-[#e2e8f0] rounded-lg px-5 py-3">
        <div className="text-[0.62rem] font-black uppercase tracking-widest text-[#94a3b8] mb-2">
          Girdi Özeti
        </div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-[#64748b]">Toplam Varlık</span>
            <span className="text-[11px] font-bold text-[#0f172a] tabular-nums">{fmtTRY(report.inputs.total_assets, 0)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-[#64748b]">Toplam Yükümlülük</span>
            <span className="text-[11px] font-bold text-[#0f172a] tabular-nums">{fmtTRY(report.inputs.total_liabilities, 0)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-[#64748b]">EBIT</span>
            <span className={`text-[11px] font-bold tabular-nums ${report.inputs.ebit >= 0 ? 'text-[#15803d]' : 'text-[#ef4444]'}`}>
              {fmtTRY(report.inputs.ebit, 0)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-[#64748b]">Dönen Varlık</span>
            <span className="text-[11px] font-bold text-[#0f172a] tabular-nums">{fmtTRY(report.inputs.current_assets, 0)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-[#64748b]">Kısa Vadeli Borç</span>
            <span className="text-[11px] font-bold text-[#0f172a] tabular-nums">{fmtTRY(report.inputs.current_liabilities, 0)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-[#64748b]">Brüt Marj</span>
            <span className="text-[11px] font-bold text-[#0f172a] tabular-nums">
              {report.inputs.gross_margin_pct !== null ? fmtPct(report.inputs.gross_margin_pct) : '—'}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-[#64748b]">Nakit Runway</span>
            <span className={`text-[11px] font-bold tabular-nums ${
              report.inputs.runway_months === null ? 'text-[#94a3b8]' :
              report.inputs.runway_months < 3 ? 'text-[#ef4444]' :
              report.inputs.runway_months < 6 ? 'text-[#f59e0b]' : 'text-[#15803d]'
            }`}>
              {report.inputs.runway_months !== null
                ? `${report.inputs.runway_months.toFixed(1)} ay`
                : '—'}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
