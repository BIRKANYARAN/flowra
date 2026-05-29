'use client'

// ─────────────────────────────────────────────────────────────────────────────
// ExpenseRunRateClient
//
// Expense Run Rate Momentum Dashboard.
//
// Features:
//   - 4 KPI cells: total monthly run rate, annual run rate, YTD variance,
//     fastest growing category
//   - Overall trend badge
//   - Top 5 category cards with 3-month trend sparkline, momentum badge,
//     and optional spike badge
//   - Spike alert section when any spikes detected
// ─────────────────────────────────────────────────────────────────────────────

import { useQuery }  from '@tanstack/react-query'
import { fmtTRY }   from '@/lib/format'
import type {
  ExpenseRunRateReport,
  ExpenseCategoryMetrics,
} from '@/lib/services/finance/expense-run-rate.service'

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtPct(v: number): string {
  const sign = v >= 0 ? '+' : ''
  return `${sign}${v.toFixed(1)}%`
}

// ── KPI cell ──────────────────────────────────────────────────────────────────

function KpiCell({
  label,
  value,
  sub,
  valueClass,
}: {
  label: string
  value: string
  sub?: string
  valueClass?: string
}) {
  return (
    <div className="bg-white border border-[#e2e8f0] rounded p-4 shadow-sm">
      <div className="text-[9px] font-black uppercase tracking-widest text-[#94a3b8] mb-1">{label}</div>
      <div className={`text-xl font-black tabular-nums text-[#0f172a] ${valueClass ?? ''}`}>{value}</div>
      {sub && <div className="text-[10px] text-[#94a3b8] mt-1">{sub}</div>}
    </div>
  )
}

// ── Momentum badge ────────────────────────────────────────────────────────────

type Momentum = ExpenseCategoryMetrics['momentum']

function MomentumBadge({ momentum }: { momentum: Momentum }) {
  const config: Record<Momentum, { label: string; cls: string }> = {
    accelerating:      { label: 'Hızlanıyor',       cls: 'bg-red-100 text-red-800 border-red-200' },
    stable:            { label: 'Sabit',             cls: 'bg-slate-100 text-slate-600 border-slate-200' },
    decelerating:      { label: 'Yavaşlıyor',        cls: 'bg-green-100 text-green-800 border-green-200' },
    volatile:          { label: 'Değişken',          cls: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
    insufficient_data: { label: 'Yetersiz Veri',     cls: 'bg-slate-100 text-slate-500 border-slate-200' },
  }
  const c = config[momentum]
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-bold ${c.cls}`}>
      {c.label}
    </span>
  )
}

// ── Overall trend badge ───────────────────────────────────────────────────────

type OverallTrend = ExpenseRunRateReport['overall_trend']

function OverallTrendBadge({ trend }: { trend: OverallTrend }) {
  const config: Record<OverallTrend, { label: string; icon: string; cls: string }> = {
    rising:  { label: 'Giderler Artıyor',  icon: '↑', cls: 'bg-red-100 text-red-800 border-red-300' },
    falling: { label: 'Giderler Düşüyor',  icon: '↓', cls: 'bg-green-100 text-green-800 border-green-300' },
    stable:  { label: 'Giderler Sabit',    icon: '→', cls: 'bg-slate-100 text-slate-700 border-slate-300' },
    mixed:   { label: 'Karışık Trend',     icon: '~', cls: 'bg-yellow-100 text-yellow-800 border-yellow-300' },
  }
  const c = config[trend]
  return (
    <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full border text-xs font-bold ${c.cls}`}>
      <span className="font-black">{c.icon}</span>
      {c.label}
    </span>
  )
}

// ── Sparkline (inline divs, last 3 months) ────────────────────────────────────

function Sparkline({ months }: { months: Array<{ month: string; amount_try: number }> }) {
  const last3 = months.slice(-3)
  if (last3.length === 0) return <div className="text-[9px] text-[#94a3b8]">—</div>
  const max = Math.max(...last3.map(m => m.amount_try), 1)
  return (
    <div className="flex items-end gap-1 h-8">
      {last3.map((m, i) => {
        const heightPct = max > 0 ? (m.amount_try / max) * 100 : 0
        return (
          <div
            key={m.month}
            title={`${m.month}: ${fmtTRY(m.amount_try, 0)}`}
            className="flex-1 rounded-sm bg-[#3b82f6] opacity-70 hover:opacity-100 transition-opacity"
            style={{ height: `${Math.max(heightPct, 4)}%` }}
            aria-label={`${m.month}: ${fmtTRY(m.amount_try, 0)}`}
          />
        )
      })}
    </div>
  )
}

// ── Category card ─────────────────────────────────────────────────────────────

function CategoryCard({
  cat,
  hasSpike,
}: {
  cat: ExpenseCategoryMetrics
  hasSpike: boolean
}) {
  return (
    <div className="bg-white border border-[#e2e8f0] rounded p-4 shadow-sm space-y-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-xs font-black text-[#0f172a]">{cat.label}</div>
          <div className="text-[10px] text-[#94a3b8] mt-0.5">{cat.category}</div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <MomentumBadge momentum={cat.momentum} />
          {hasSpike && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-bold bg-orange-100 text-orange-800 border-orange-200">
              Ani Artış
            </span>
          )}
        </div>
      </div>

      {/* Run rates */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <div className="text-[9px] font-black uppercase tracking-widest text-[#94a3b8]">Aylık Run Rate</div>
          <div className="text-sm font-black tabular-nums text-[#0f172a]">
            {fmtTRY(cat.monthly_run_rate_try, 0)}
          </div>
        </div>
        <div>
          <div className="text-[9px] font-black uppercase tracking-widest text-[#94a3b8]">Yıllık Run Rate</div>
          <div className="text-sm font-black tabular-nums text-[#475569]">
            {fmtTRY(cat.annual_run_rate_try, 0)}
          </div>
        </div>
      </div>

      {/* MoM change */}
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-[#94a3b8]">Geçen aya göre</span>
        <span className={`text-xs font-bold tabular-nums ${cat.mom_change_pct > 5 ? 'text-red-600' : cat.mom_change_pct < -5 ? 'text-green-600' : 'text-[#475569]'}`}>
          {cat.mom_change_pct === 0 && cat.prior_month_try === 0
            ? '—'
            : fmtPct(cat.mom_change_pct)}
        </span>
      </div>

      {/* 3-month trend sparkline */}
      <div>
        <div className="text-[9px] font-black uppercase tracking-widest text-[#94a3b8] mb-1">
          3 Aylık Trend
        </div>
        <Sparkline months={cat.months} />
      </div>
    </div>
  )
}

// ── Loading skeleton ──────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="grid grid-cols-4 gap-3">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="bg-white border border-[#e2e8f0] rounded p-4 h-20 shadow-sm">
            <div className="h-3 bg-[#f1f5f9] rounded w-24 mb-2" />
            <div className="h-6 bg-[#f1f5f9] rounded w-32" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-5 gap-3">
        {[0, 1, 2, 3, 4].map(i => (
          <div key={i} className="bg-white border border-[#e2e8f0] rounded p-4 h-48 shadow-sm" />
        ))}
      </div>
    </div>
  )
}

// ── Empty slate ───────────────────────────────────────────────────────────────

function EmptySlate() {
  return (
    <div className="bg-white border border-[#e2e8f0] rounded p-10 text-center shadow-sm">
      <div className="text-3xl mb-3">📊</div>
      <div className="text-sm font-bold text-[#64748b]">Gider verisi bulunamadı</div>
      <div className="text-[10px] text-[#94a3b8] mt-1">Son 6 ayda kayıtlı gider yok.</div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

interface Props {
  companyId: string
}

export function ExpenseRunRateClient({ companyId }: Props) {
  const { data, isLoading, isError } = useQuery<{ report: ExpenseRunRateReport }>({
    queryKey: ['expense-run-rate', companyId],
    queryFn: async () => {
      const res = await fetch('/api/finance/expense-run-rate')
      if (!res.ok) throw new Error('Gider run rate verisi yüklenemedi')
      return res.json()
    },
    staleTime: 5 * 60 * 1000,
  })

  if (isLoading) return <LoadingSkeleton />

  if (isError || !data?.report) {
    return (
      <div className="bg-white border border-[#e2e8f0] rounded p-6 shadow-sm text-center">
        <p className="text-sm text-[#64748b] font-medium">
          Gider run rate verisi yüklenirken hata oluştu.
        </p>
      </div>
    )
  }

  const report = data.report
  const summary = report.run_rate_summary
  const spikeCatSet = new Set(report.spike_categories.map(c => c.category))

  if (report.categories.length === 0) return <EmptySlate />

  const fastestLabel = report.fastest_growing_category
    ? (report.categories.find(c => c.category === report.fastest_growing_category)?.label ?? report.fastest_growing_category)
    : '—'

  return (
    <div className="space-y-4">

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">
            Gider Run Rate &amp; Momentum
          </h3>
          <div className="text-[10px] text-[#94a3b8] mt-0.5">
            Son 6 ay · {report.current_month}
          </div>
        </div>
        <OverallTrendBadge trend={report.overall_trend} />
      </div>

      {/* ── KPI strip ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCell
          label="Aylık Run Rate"
          value={fmtTRY(summary.total_monthly_run_rate_try, 0)}
          sub="3 aylık ortalamaya göre"
        />
        <KpiCell
          label="Yıllık Run Rate"
          value={fmtTRY(summary.total_annual_run_rate_try, 0)}
          sub="Aylık × 12"
        />
        <KpiCell
          label="YTD Sapması"
          value={fmtTRY(Math.abs(summary.ytd_variance_try), 0)}
          sub={summary.ytd_variance_try >= 0 ? 'Bütçe üzerinde' : 'Bütçe altında'}
          valueClass={summary.ytd_variance_try > 0 ? 'text-red-600' : 'text-green-600'}
        />
        <KpiCell
          label="En Hızlı Büyüyen"
          value={fastestLabel}
          sub={
            report.fastest_growing_category
              ? (() => {
                  const cat = report.categories.find(c => c.category === report.fastest_growing_category)
                  return cat ? `${fmtPct(cat.mom_change_pct)} AoA` : undefined
                })()
              : undefined
          }
        />
      </div>

      {/* ── Spike alert ───────────────────────────────────────────────────── */}
      {report.spike_categories.length > 0 && (
        <div className="rounded border border-orange-200 bg-orange-50 px-4 py-3">
          <div className="text-[11px] font-black text-orange-800 mb-1.5 uppercase tracking-wide">
            Ani Artış Uyarısı ({report.spike_categories.length} kategori)
          </div>
          <div className="flex flex-wrap gap-2">
            {report.spike_categories.map(cat => (
              <div
                key={cat.category}
                className="bg-white border border-orange-200 rounded px-3 py-1.5 text-[11px]"
              >
                <span className="font-bold text-orange-800">{cat.label}</span>
                <span className="text-orange-600 ml-2 tabular-nums">{fmtTRY(cat.current_month_try, 0)}</span>
                <span className="text-[#94a3b8] ml-1">
                  (3 ay ort. {fmtTRY(cat.three_month_avg_try, 0)})
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Top 5 category cards ──────────────────────────────────────────── */}
      <div>
        <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-3">
          En Yüksek 5 Kategori — Run Rate
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {report.top_categories.map(cat => (
            <CategoryCard
              key={cat.category}
              cat={cat}
              hasSpike={spikeCatSet.has(cat.category)}
            />
          ))}
        </div>
      </div>

      {/* ── Risk projection ───────────────────────────────────────────────── */}
      {report.months_until_expense_risk !== null && (
        <div className="rounded border border-red-200 bg-red-50 px-4 py-3 flex items-start gap-3">
          <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0 mt-1.5" />
          <div>
            <span className="text-[11px] font-bold text-red-800">
              Gider riski tahmini:
            </span>{' '}
            <span className="text-[11px] text-red-700 font-semibold">
              ~{report.months_until_expense_risk} ay içinde giderler geliri aşabilir.
            </span>
          </div>
        </div>
      )}

      {/* ── YTD summary ───────────────────────────────────────────────────── */}
      <div className="bg-white border border-[#e2e8f0] rounded p-4 shadow-sm">
        <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-3">
          YTD Özeti — {report.months_elapsed_ytd} Ay
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <div className="text-[9px] font-bold uppercase text-[#94a3b8] mb-0.5">Gerçekleşen</div>
            <div className="text-base font-black tabular-nums text-[#0f172a]">
              {fmtTRY(summary.ytd_actual_try, 0)}
            </div>
          </div>
          <div>
            <div className="text-[9px] font-bold uppercase text-[#94a3b8] mb-0.5">Bütçe Karşılığı</div>
            <div className="text-base font-black tabular-nums text-[#0f172a]">
              {fmtTRY(summary.ytd_budget_equivalent_try, 0)}
            </div>
          </div>
          <div>
            <div className="text-[9px] font-bold uppercase text-[#94a3b8] mb-0.5">Sapma</div>
            <div className={`text-base font-black tabular-nums ${summary.ytd_variance_try > 0 ? 'text-red-600' : 'text-green-600'}`}>
              {summary.ytd_variance_try >= 0 ? '+' : ''}{fmtTRY(summary.ytd_variance_try, 0)}
              {summary.ytd_budget_equivalent_try > 0 && (
                <span className="text-[10px] font-semibold ml-1">
                  ({fmtPct(summary.ytd_variance_pct)})
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
