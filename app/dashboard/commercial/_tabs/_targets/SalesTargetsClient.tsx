'use client'
// ── SalesTargetsClient — Sales Target Tracking & Pacing ──────────────────────
// Fetches /api/commercial/sales-targets via TanStack Query.
// Features:
//   • YTD attainment gauge (CSS-based)
//   • Monthly bar chart: target vs actual
//   • Run-rate annualized projection
//   • Required daily revenue indicator
//   • Consecutive months above target streak
//   • Turkish narrative summary

import { useQuery } from '@tanstack/react-query'
import type {
  SalesTargetReport,
  TargetActual,
} from '@/lib/services/commercial/sales-target.service'

// ── Formatters ────────────────────────────────────────────────────────────────

const TRY_FMT = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 })
const PCT_FMT = new Intl.NumberFormat('tr-TR', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})

function fmtTRY(n: number): string {
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return `₺${(n / 1_000_000).toFixed(2)}M`
  if (abs >= 1_000)     return `₺${(n / 1_000).toFixed(1)}K`
  return `₺${TRY_FMT.format(Math.round(n))}`
}

function fmtPct(n: number, sign = false): string {
  const str = `%${PCT_FMT.format(Math.abs(n))}`
  if (!sign) return str
  return n >= 0 ? `+${str}` : `-${str}`
}

// ── Month labels (Turkish abbreviations) ─────────────────────────────────────

const TR_MONTHS: Record<number, string> = {
  1: 'Oca', 2: 'Şub', 3: 'Mar', 4: 'Nis',
  5: 'May', 6: 'Haz', 7: 'Tem', 8: 'Ağu',
  9: 'Eyl', 10: 'Eki', 11: 'Kas', 12: 'Ara',
}

function ymToLabel(ym: string): string {
  const month = parseInt(ym.slice(5, 7), 10)
  return TR_MONTHS[month] ?? ym
}

// ── Status configurations ─────────────────────────────────────────────────────

type AttainmentStatus = 'exceeded' | 'on_track' | 'at_risk' | 'behind' | 'critical' | 'no_target'
type YtdStatus = 'outperforming' | 'on_track' | 'slightly_behind' | 'behind' | 'critical' | 'no_target'

const STATUS_CFG: Record<AttainmentStatus, { label: string; bg: string; text: string; border: string }> = {
  exceeded:  { label: 'Aşıldı',    bg: 'bg-emerald-100', text: 'text-emerald-800', border: 'border-emerald-300' },
  on_track:  { label: 'Yolunda',   bg: 'bg-teal-100',    text: 'text-teal-700',    border: 'border-teal-300'    },
  at_risk:   { label: 'Risk',      bg: 'bg-yellow-100',  text: 'text-yellow-700',  border: 'border-yellow-300'  },
  behind:    { label: 'Geride',    bg: 'bg-orange-100',  text: 'text-orange-700',  border: 'border-orange-300'  },
  critical:  { label: 'Kritik',    bg: 'bg-red-100',     text: 'text-red-700',     border: 'border-red-300'     },
  no_target: { label: 'Hedefsiz',  bg: 'bg-gray-100',    text: 'text-gray-500',    border: 'border-gray-200'    },
}

const YTD_STATUS_CFG: Record<YtdStatus, { label: string; bg: string; text: string }> = {
  outperforming:  { label: 'Hedefi Aşıyor',     bg: 'bg-emerald-100', text: 'text-emerald-800' },
  on_track:       { label: 'Hedefte',            bg: 'bg-teal-100',    text: 'text-teal-700'    },
  slightly_behind: { label: 'Hafif Geride',      bg: 'bg-yellow-100',  text: 'text-yellow-700'  },
  behind:         { label: 'Geride',             bg: 'bg-orange-100',  text: 'text-orange-700'  },
  critical:       { label: 'Kritik',             bg: 'bg-red-100',     text: 'text-red-700'     },
  no_target:      { label: 'Hedef Yok',          bg: 'bg-gray-100',    text: 'text-gray-500'    },
}

// ── KPI cell ──────────────────────────────────────────────────────────────────

function KpiCell({
  label,
  value,
  sub,
  highlight,
}: {
  label: string
  value: string
  sub?: string
  highlight?: boolean
}) {
  return (
    <div className={`rounded border px-3 py-2.5 ${highlight ? 'bg-brand/5 border-brand/20' : 'bg-white border-[#e2e8f0]'}`}>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-[#64748b] mb-1">{label}</p>
      <p className="text-xl font-black tabular-nums text-[#0f172a]">{value}</p>
      {sub && <p className="text-[10px] text-[#94a3b8] mt-0.5">{sub}</p>}
    </div>
  )
}

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: AttainmentStatus }) {
  const cfg = STATUS_CFG[status] ?? STATUS_CFG.no_target
  return (
    <span className={`inline-flex items-center text-[10px] font-black uppercase tracking-wide px-2 py-0.5 rounded border ${cfg.bg} ${cfg.text} ${cfg.border}`}>
      {cfg.label}
    </span>
  )
}

function YtdBadge({ status }: { status: YtdStatus }) {
  const cfg = YTD_STATUS_CFG[status] ?? YTD_STATUS_CFG.no_target
  return (
    <span className={`inline-flex items-center text-[10px] font-black uppercase tracking-wide px-2 py-0.5 rounded ${cfg.bg} ${cfg.text}`}>
      {cfg.label}
    </span>
  )
}

// ── YTD Attainment Gauge (CSS-based) ─────────────────────────────────────────

function AttainmentGauge({ pct }: { pct: number | null }) {
  const clamped = Math.min(Math.max(pct ?? 0, 0), 130)
  const barPct  = (clamped / 130) * 100

  const color =
    clamped >= 105 ? 'bg-emerald-500' :
    clamped >= 90  ? 'bg-teal-500'    :
    clamped >= 70  ? 'bg-yellow-400'  :
    clamped >= 50  ? 'bg-orange-400'  :
                     'bg-red-500'

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold text-[#64748b]">YTD Gerçekleşme</span>
        <span className="text-sm font-black tabular-nums text-[#0f172a]">
          {pct !== null ? fmtPct(pct) : '—'}
        </span>
      </div>
      <div className="h-3 w-full bg-[#f1f5f9] rounded-full overflow-hidden">
        <div
          className={`h-3 rounded-full transition-all duration-500 ${color}`}
          style={{ width: `${barPct}%` }}
        />
      </div>
      {/* Threshold markers */}
      <div className="relative h-2">
        {/* 100% marker at ~76.9% of bar */}
        <div className="absolute h-2 w-0.5 bg-[#94a3b8] rounded" style={{ left: 'calc(100%/130*100)' }} />
        <span className="absolute text-[9px] text-[#94a3b8]" style={{ left: 'calc(100%/130*100 + 2px)', transform: 'translateY(-1px)' }}>
          100%
        </span>
      </div>
    </div>
  )
}

// ── Monthly Bar Chart (target vs actual) ─────────────────────────────────────

function MonthlyTargetActualChart({ rows }: { rows: TargetActual[] }) {
  if (rows.length === 0) return null

  const maxVal = Math.max(
    ...rows.map(r => Math.max(r.actual_revenue, r.target_revenue ?? 0)),
    1,
  )

  return (
    <div className="space-y-1.5">
      {rows.map(row => {
        const actualPct  = (row.actual_revenue / maxVal) * 100
        const targetPct  = ((row.target_revenue ?? 0) / maxVal) * 100
        const attainment = row.target_revenue
          ? (row.actual_revenue / row.target_revenue) * 100
          : null
        const exceeded   = attainment !== null && attainment >= 100

        return (
          <div key={row.year_month} className="flex items-center gap-2">
            <div className="w-7 shrink-0 text-[11px] font-semibold text-[#64748b]">
              {ymToLabel(row.year_month)}
            </div>
            <div className="flex-1 space-y-0.5">
              {/* Actual bar */}
              <div className="h-2.5 bg-[#f1f5f9] rounded overflow-hidden">
                <div
                  className={`h-2.5 rounded ${exceeded ? 'bg-emerald-500' : 'bg-brand'}`}
                  style={{ width: `${actualPct}%` }}
                />
              </div>
              {/* Target bar */}
              {row.target_revenue !== null && (
                <div className="h-1 bg-[#f1f5f9] rounded overflow-hidden">
                  <div
                    className="h-1 rounded bg-[#cbd5e1]"
                    style={{ width: `${targetPct}%` }}
                  />
                </div>
              )}
            </div>
            <div className="w-20 text-right shrink-0 space-y-0.5">
              <div className="text-[11px] font-bold tabular-nums text-[#334155]">
                {fmtTRY(row.actual_revenue)}
              </div>
              {row.target_revenue !== null && (
                <div className="text-[10px] text-[#94a3b8] tabular-nums">
                  H: {fmtTRY(row.target_revenue)}
                </div>
              )}
            </div>
            {attainment !== null && (
              <div className={`w-10 text-right shrink-0 text-[10px] font-bold tabular-nums ${exceeded ? 'text-emerald-600' : attainment >= 70 ? 'text-yellow-600' : 'text-red-500'}`}>
                {fmtPct(attainment)}
              </div>
            )}
          </div>
        )
      })}

      {/* Legend */}
      <div className="flex items-center gap-4 pt-1">
        <div className="flex items-center gap-1">
          <div className="w-3 h-2 bg-brand rounded" />
          <span className="text-[10px] text-[#94a3b8]">Gerçekleşen</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-1 bg-[#cbd5e1] rounded" />
          <span className="text-[10px] text-[#94a3b8]">Hedef</span>
        </div>
      </div>
    </div>
  )
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="bg-white border border-[#e2e8f0] rounded px-4 py-3 space-y-3 animate-pulse">
      <div className="h-3 w-52 bg-[#f1f5f9] rounded" />
      <div className="grid grid-cols-4 gap-3">
        {[0, 1, 2, 3].map(i => <div key={i} className="h-16 bg-[#f1f5f9] rounded" />)}
      </div>
      <div className="h-40 bg-[#f1f5f9] rounded" />
    </div>
  )
}

// ── No targets slate ──────────────────────────────────────────────────────────

function NoTargetsSlate() {
  return (
    <div className="bg-white border border-[#e2e8f0] rounded px-4 py-10 text-center">
      <p className="text-[13px] font-medium text-[#64748b]">
        Bu yıl için satış hedefi tanımlanmamış.
      </p>
      <p className="text-[11px] text-[#94a3b8] mt-1">
        Hedef takibi için satış_hedefleri tablosuna veri giriniz.
      </p>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  companyId: string
}

interface ApiResponse {
  report: SalesTargetReport
}

export default function SalesTargetsClient({ companyId }: Props) {
  const { data, isLoading, error } = useQuery<ApiResponse>({
    queryKey: ['sales-targets', companyId],
    queryFn: async () => {
      const res = await fetch('/api/commercial/sales-targets')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json() as Promise<ApiResponse>
    },
    staleTime: 5 * 60 * 1000,
  })

  if (isLoading) return <Skeleton />

  if (error || !data?.report) {
    return (
      <div className="bg-white border border-[#e2e8f0] rounded px-4 py-3">
        <p className="text-xs text-red-600">Satış hedef raporu yüklenemedi.</p>
      </div>
    )
  }

  const r = data.report

  if (!r.has_targets) return <NoTargetsSlate />

  const ytd     = r.ytd_summary
  const rrp     = r.run_rate_projection
  const bestM   = r.best_month
  const worstM  = r.worst_month

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-sm font-bold text-[#0f172a]">Satış Hedef Takibi</h2>
          <p className="text-[11px] text-[#64748b]">{r.current_year} Yılı</p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={r.current_month_status as AttainmentStatus} />
          <YtdBadge status={r.ytd_performance as YtdStatus} />
        </div>
      </div>

      {/* YTD Attainment Gauge */}
      <div className="bg-white border border-[#e2e8f0] rounded px-4 py-3">
        <AttainmentGauge pct={ytd.ytd_attainment_pct} />
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <KpiCell
          label="YTD Gerçekleşen"
          value={fmtTRY(ytd.ytd_actual_revenue)}
          sub={ytd.ytd_target_revenue !== null ? `Hedef: ${fmtTRY(ytd.ytd_target_revenue)}` : undefined}
          highlight
        />
        <KpiCell
          label="YTD Fark"
          value={ytd.ytd_variance !== null ? fmtTRY(ytd.ytd_variance) : '—'}
          sub={
            ytd.months_exceeded > 0
              ? `${ytd.months_exceeded} ay aşıldı`
              : `${ytd.months_behind} ay geride`
          }
        />
        <KpiCell
          label="Yıllık Projeksiyon"
          value={fmtTRY(rrp.annualized_projection)}
          sub={
            rrp.vs_full_year_target_pct !== null
              ? `H'ye göre ${fmtPct(rrp.vs_full_year_target_pct, true)}`
              : undefined
          }
        />
        <KpiCell
          label="Gerekli Günlük Gelir"
          value={r.required_daily_revenue !== null ? fmtTRY(r.required_daily_revenue) : '—'}
          sub={r.consecutive_above_target > 0 ? `${r.consecutive_above_target} ay üst üste üstünde` : undefined}
        />
      </div>

      {/* Monthly chart */}
      <div className="bg-white border border-[#e2e8f0] rounded px-4 py-3">
        <p className="text-[11px] font-bold uppercase tracking-wide text-[#64748b] mb-3">
          Aylık Hedef / Gerçekleşme
        </p>
        <MonthlyTargetActualChart rows={r.monthly_target_actuals} />
      </div>

      {/* Run-rate projection */}
      <div className="bg-white border border-[#e2e8f0] rounded px-4 py-3">
        <p className="text-[11px] font-bold uppercase tracking-wide text-[#64748b] mb-2">
          Run-Rate Projeksiyonu
        </p>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <p className="text-[10px] text-[#94a3b8] mb-0.5">Aylık Run-Rate</p>
            <p className="text-base font-black tabular-nums text-[#0f172a]">
              {fmtTRY(rrp.monthly_run_rate)}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-[#94a3b8] mb-0.5">Yıllık Projeksiyon</p>
            <p className="text-base font-black tabular-nums text-[#0f172a]">
              {fmtTRY(rrp.annualized_projection)}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-[#94a3b8] mb-0.5">Yıllık Hedefe Göre</p>
            <p className="text-base font-black tabular-nums text-[#0f172a]">
              {rrp.vs_full_year_target_pct !== null ? fmtPct(rrp.vs_full_year_target_pct) : '—'}
            </p>
          </div>
        </div>
      </div>

      {/* Best / worst months */}
      {(bestM || worstM) && (
        <div className="grid grid-cols-2 gap-2">
          {bestM && (
            <div className="bg-emerald-50 border border-emerald-200 rounded px-3 py-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700 mb-0.5">
                En İyi Ay
              </p>
              <p className="text-sm font-black text-[#0f172a]">{fmtTRY(bestM.actual_revenue)}</p>
              <p className="text-[11px] text-emerald-700">{ymToLabel(bestM.year_month)} {bestM.year_month.slice(0, 4)}</p>
            </div>
          )}
          {worstM && (
            <div className="bg-orange-50 border border-orange-200 rounded px-3 py-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-orange-700 mb-0.5">
                En Zayıf Ay
              </p>
              <p className="text-sm font-black text-[#0f172a]">{fmtTRY(worstM.actual_revenue)}</p>
              <p className="text-[11px] text-orange-700">{ymToLabel(worstM.year_month)} {worstM.year_month.slice(0, 4)}</p>
            </div>
          )}
        </div>
      )}

      {/* Narrative */}
      <div className="bg-[#f8fafc] border border-[#e2e8f0] rounded px-4 py-3">
        <p className="text-[11px] text-[#334155] leading-relaxed">{r.narrative}</p>
      </div>
    </div>
  )
}
