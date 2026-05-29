'use client'

// ─────────────────────────────────────────────────────────────────────────────
// MarginTrendClient
//
// Profit Margin Trend Decomposition dashboard.
//
// Features:
//   - 3 margin KPI tiles: Brüt Marj / EBITDA Marjı / Net Marj (trailing 12m avg)
//     with trend arrows (expanding=green / contracting=red / stable=gray)
//   - Monthly trend table (last 12 months):
//     Month | Revenue | Gross Margin% | EBITDA% | Net% | Gross Δ
//     Color arrows on delta column; best period gold, worst period red
//   - Margin drivers section: top 3 drivers with TRY impact and Turkish description
//   - Overall trend banner: "Brüt marj [genişliyor / daralıyor / stabil seyrediyor]"
//   - Empty state: "Marj verisi hesaplanamadı"
// ─────────────────────────────────────────────────────────────────────────────

import { useQuery } from '@tanstack/react-query'
import { fmtTRY, fmtPct, fmtDelta, fmtMonthShort } from '@/lib/format'
import type { MarginTrendReport, MarginPeriod } from '@/lib/services/finance/margin-trend.service'

// ── Trend arrow ───────────────────────────────────────────────────────────────

type TrendDir = 'expanding' | 'contracting' | 'stable' | 'insufficient_data'

function TrendArrow({ trend, size = 'md' }: { trend: TrendDir; size?: 'sm' | 'md' }) {
  const config: Record<TrendDir, { icon: string; cls: string; label: string }> = {
    expanding:         { icon: '↑', cls: 'text-green-600',  label: 'Genişliyor' },
    contracting:       { icon: '↓', cls: 'text-red-600',    label: 'Daralıyor' },
    stable:            { icon: '→', cls: 'text-slate-400',  label: 'Stabil' },
    insufficient_data: { icon: '—', cls: 'text-slate-300',  label: 'Yetersiz Veri' },
  }
  const c = config[trend]
  const iconCls = size === 'sm' ? 'text-sm' : 'text-xl'
  const lblCls  = size === 'sm' ? 'text-[9px]' : 'text-[11px]'
  return (
    <span className={`font-black ${iconCls} ${c.cls}`} title={c.label}>
      {c.icon}
      <span className={`font-semibold ml-0.5 ${lblCls}`}>{c.label}</span>
    </span>
  )
}

// ── Delta cell ────────────────────────────────────────────────────────────────

function DeltaCell({ delta }: { delta: number | null }) {
  if (delta === null) return <span className="text-[#94a3b8]">—</span>
  const isPos = delta > 0
  const cls = delta > 1 ? 'text-green-600' : delta < -1 ? 'text-red-600' : 'text-slate-400'
  const icon = delta > 1 ? '↑' : delta < -1 ? '↓' : '→'
  return (
    <span className={`font-bold tabular-nums ${cls}`}>
      {icon} {isPos ? '+' : ''}{delta.toFixed(1)}pp
    </span>
  )
}

// ── KPI tile ──────────────────────────────────────────────────────────────────

function KpiTile({
  label,
  subtitle,
  value,
  trend,
  accent,
}: {
  label:    string
  subtitle: string
  value:    number | null
  trend:    TrendDir
  accent:   string
}) {
  return (
    <div className={`bg-white border border-l-4 border-[#e2e8f0] ${accent} rounded px-4 py-4 shadow-sm`}>
      <div className="text-[9px] font-black uppercase tracking-widest text-[#94a3b8] mb-0.5">{label}</div>
      <div className="text-[10px] text-[#94a3b8] mb-2">{subtitle}</div>
      <div className="text-2xl font-black tabular-nums text-[#0f172a] mb-2">
        {value !== null ? fmtPct(value) : '—'}
      </div>
      <TrendArrow trend={trend} size="sm" />
    </div>
  )
}

// ── Driver badge ──────────────────────────────────────────────────────────────

type DriverType =
  | 'cogs_increase' | 'cogs_decrease'
  | 'opex_increase' | 'opex_decrease'
  | 'revenue_growth' | 'revenue_decline'

const DRIVER_STYLE: Record<DriverType, { dot: string; badge: string }> = {
  cogs_increase:   { dot: 'bg-red-500',    badge: 'bg-red-50 border-red-200 text-red-800' },
  cogs_decrease:   { dot: 'bg-green-500',  badge: 'bg-green-50 border-green-200 text-green-800' },
  opex_increase:   { dot: 'bg-orange-500', badge: 'bg-orange-50 border-orange-200 text-orange-800' },
  opex_decrease:   { dot: 'bg-teal-500',   badge: 'bg-teal-50 border-teal-200 text-teal-800' },
  revenue_growth:  { dot: 'bg-blue-500',   badge: 'bg-blue-50 border-blue-200 text-blue-800' },
  revenue_decline: { dot: 'bg-red-400',    badge: 'bg-red-50 border-red-200 text-red-700' },
}

// ── Overall trend banner ──────────────────────────────────────────────────────

const OVERALL_TREND_CONFIG: Record<TrendDir, { text: string; cls: string; dotCls: string }> = {
  expanding:         { text: 'Brüt marj son 12 ayda genişliyor.',         cls: 'bg-green-50 border-green-200 text-green-800',  dotCls: 'bg-green-500' },
  contracting:       { text: 'Brüt marj son 12 ayda daralıyor.',          cls: 'bg-red-50 border-red-200 text-red-800',        dotCls: 'bg-red-500' },
  stable:            { text: 'Brüt marj son 12 ayda stabil seyrediyor.',  cls: 'bg-slate-50 border-slate-200 text-slate-600',  dotCls: 'bg-slate-400' },
  insufficient_data: { text: 'Brüt marj trendi için yeterli veri yok.',   cls: 'bg-slate-50 border-slate-200 text-slate-500',  dotCls: 'bg-slate-300' },
}

// ── Main component ─────────────────────────────────────────────────────────────

interface Props {
  companyId: string
}

export function MarginTrendClient({ companyId }: Props) {
  const { data, isLoading, isError } = useQuery<{ report: MarginTrendReport }>({
    queryKey:  ['margin-trend', companyId],
    queryFn:   async () => {
      const res = await fetch('/api/finance/margin-trend')
      if (!res.ok) throw new Error('Marj trendi verisi yüklenemedi')
      return res.json()
    },
    staleTime: 10 * 60 * 1000,
  })

  // ── Loading ────────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="bg-white border border-[#e2e8f0] rounded p-6 shadow-sm">
        <div className="animate-pulse space-y-3">
          <div className="h-4 bg-[#f1f5f9] rounded w-64" />
          <div className="grid grid-cols-3 gap-3">
            <div className="h-24 bg-[#f1f5f9] rounded" />
            <div className="h-24 bg-[#f1f5f9] rounded" />
            <div className="h-24 bg-[#f1f5f9] rounded" />
          </div>
          <div className="h-48 bg-[#f1f5f9] rounded" />
        </div>
      </div>
    )
  }

  // ── Error / empty ──────────────────────────────────────────────────────────
  if (isError || !data?.report) {
    return (
      <div className="bg-white border border-[#e2e8f0] rounded p-6 shadow-sm text-center">
        <p className="text-sm text-[#64748b] font-medium">Marj verisi hesaplanamadı</p>
        <p className="text-xs text-[#94a3b8] mt-1">Satış ve gider verileri mevcut olduğunda otomatik hesaplanır.</p>
      </div>
    )
  }

  const report = data.report
  const overall = OVERALL_TREND_CONFIG[report.overall_gross_margin_trend]

  // Determine overall gross/ebitda/net trend from current period delta
  const cur = report.current
  const grossTrend:  TrendDir = cur ? cur.gross_margin_trend : 'insufficient_data'

  // For EBITDA and Net: classify from current period's delta
  function trendFromDelta(delta: number | null): TrendDir {
    if (delta === null) return 'insufficient_data'
    if (delta > 1)  return 'expanding'
    if (delta < -1) return 'contracting'
    return 'stable'
  }
  const ebitdaTrend: TrendDir = trendFromDelta(cur?.ebitda_margin_delta ?? null)
  const netTrend:    TrendDir = trendFromDelta(cur?.net_margin_delta ?? null)

  const bestPeriod  = report.best_gross_margin_period
  const worstPeriod = report.worst_gross_margin_period

  return (
    <div className="space-y-4">

      {/* ── Section header ──────────────────────────────────────────────────── */}
      <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">
        Kâr Marjı Trend Analizi — Son 12 Ay
      </div>

      {/* ── Overall trend banner ─────────────────────────────────────────────── */}
      <div className={`rounded border px-4 py-3 flex items-center gap-3 ${overall.cls}`}>
        <span className={`w-2 h-2 rounded-full shrink-0 ${overall.dotCls}`} />
        <span className="text-[12px] font-semibold">{overall.text}</span>
      </div>

      {/* ── 3 KPI tiles ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3">
        <KpiTile
          label="Brüt Marj"
          subtitle="12 aylık ortalama"
          value={report.trailing_12m_avg_gross_margin}
          trend={grossTrend}
          accent="border-l-[#059669]"
        />
        <KpiTile
          label="EBITDA Marjı"
          subtitle="12 aylık ortalama"
          value={
            report.periods.length > 0
              ? (report.periods
                  .map(p => p.ebitda_margin_pct)
                  .filter((v): v is number => v !== null)
                  .reduce((a, b, _, arr) => a + b / arr.length, 0) || null)
              : null
          }
          trend={ebitdaTrend}
          accent="border-l-[#3b82f6]"
        />
        <KpiTile
          label="Net Marj"
          subtitle="12 aylık ortalama"
          value={report.trailing_12m_avg_net_margin}
          trend={netTrend}
          accent="border-l-[#d97706]"
        />
      </div>

      {/* ── Monthly trend table ───────────────────────────────────────────────── */}
      <div className="bg-white border border-[#e2e8f0] rounded p-5 shadow-sm overflow-x-auto">
        <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-4">
          Aylık Marj Detayı
        </div>
        <table className="w-full text-xs border-collapse min-w-[640px]">
          <thead>
            <tr className="border-b border-[#e2e8f0]">
              {['Dönem', 'Ciro', 'Brüt Marj', 'EBITDA', 'Net Marj', 'Brüt Δ'].map(h => (
                <th key={h} className="text-right py-2 px-2 first:text-left text-[10px] font-black uppercase tracking-wide text-[#94a3b8] whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[...report.periods].reverse().map((p: MarginPeriod) => {
              const isBest  = p.period_key === bestPeriod
              const isWorst = p.period_key === worstPeriod
              const rowCls  = isBest
                ? 'bg-yellow-50 border-t border-yellow-200'
                : isWorst
                ? 'bg-red-50 border-t border-red-100'
                : 'border-t border-[#f1f5f9]'

              return (
                <tr key={p.period_key} className={rowCls}>
                  <td className="py-1.5 px-2 text-left">
                    <span className="text-[11px] font-semibold text-[#334155]">
                      {fmtMonthShort(p.period_key)}
                    </span>
                    {isBest  && <span className="ml-1 text-[9px] text-yellow-700 font-bold">★ En İyi</span>}
                    {isWorst && <span className="ml-1 text-[9px] text-red-600 font-bold">▼ En Kötü</span>}
                  </td>
                  <td className="py-1.5 px-2 text-right text-[11px] tabular-nums text-[#475569]">
                    {fmtTRY(p.revenue_try, 0)}
                  </td>
                  <td className="py-1.5 px-2 text-right text-[11px] tabular-nums font-semibold text-[#1e293b]">
                    {p.gross_margin_pct !== null ? fmtPct(p.gross_margin_pct) : '—'}
                  </td>
                  <td className="py-1.5 px-2 text-right text-[11px] tabular-nums text-[#475569]">
                    {p.ebitda_margin_pct !== null ? fmtPct(p.ebitda_margin_pct) : '—'}
                  </td>
                  <td className="py-1.5 px-2 text-right text-[11px] tabular-nums text-[#475569]">
                    {p.net_margin_pct !== null ? fmtPct(p.net_margin_pct) : '—'}
                  </td>
                  <td className="py-1.5 px-2 text-right text-[11px]">
                    <DeltaCell delta={p.gross_margin_delta} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <div className="text-[9px] text-[#94a3b8] mt-3 font-semibold">
          Δ = bir önceki aya göre puan farkı (pp). ★ En yüksek brüt marjlı dönem. ▼ En düşük brüt marjlı dönem.
        </div>
      </div>

      {/* ── Margin drivers ───────────────────────────────────────────────────── */}
      {report.margin_drivers.length > 0 && (
        <div className="bg-white border border-[#e2e8f0] rounded p-5 shadow-sm">
          <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-4">
            Marj Sürücüleri — Son vs 3 Ay Önce
          </div>
          <div className="space-y-3">
            {report.margin_drivers.map((d, idx) => {
              const style = DRIVER_STYLE[d.driver] ?? { dot: 'bg-slate-400', badge: 'bg-slate-50 border-slate-200 text-slate-700' }
              return (
                <div key={idx} className="flex items-start gap-3">
                  <span className={`w-2 h-2 rounded-full shrink-0 mt-1.5 ${style.dot}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-semibold text-[#334155]">{d.description}</p>
                  </div>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-bold shrink-0 ${style.badge}`}>
                    {fmtTRY(d.impact_try, 0)}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Empty drivers state */}
      {report.margin_drivers.length === 0 && (
        <div className="bg-white border border-[#e2e8f0] rounded p-4 shadow-sm text-center">
          <p className="text-[11px] text-[#94a3b8]">Marj sürücüsü analizi için yeterli tarihsel veri yok.</p>
        </div>
      )}

    </div>
  )
}
