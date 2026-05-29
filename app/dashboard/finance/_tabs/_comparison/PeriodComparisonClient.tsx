'use client'

// ─────────────────────────────────────────────────────────────────────────────
// PeriodComparisonClient
//
// Period Performance Comparison dashboard — MoM, YoY, YTD.
//
// Features:
//   - 3 tabs: MoM / YoY / YTD
//   - Overall trend badge per comparison
//   - Comparison table: revenue, expenses, gross profit, net income,
//     gross margin %, expense ratio %
//   - 12-month revenue sparkline (proportional div widths)
//   - CMGR badge
// ─────────────────────────────────────────────────────────────────────────────

import { useState }  from 'react'
import { useQuery }  from '@tanstack/react-query'
import { fmtTRY, fmtPct, fmtDelta } from '@/lib/format'
import type {
  PeriodComparisonReport,
  PeriodComparison,
  PeriodMetrics,
} from '@/lib/services/finance/period-comparison.service'

// ── Types ─────────────────────────────────────────────────────────────────────

type TabKey = 'mom' | 'yoy' | 'ytd'

// ── Trend badge ───────────────────────────────────────────────────────────────

type OverallTrend = 'improving' | 'stable' | 'declining'

function TrendBadge({ trend }: { trend: OverallTrend }) {
  const config: Record<OverallTrend, { label: string; style: string; icon: string }> = {
    improving: { label: 'İyileşiyor', style: 'bg-green-100 text-green-800 border-green-200',  icon: '↑' },
    stable:    { label: 'Stabil',     style: 'bg-slate-100 text-slate-700 border-slate-200',  icon: '→' },
    declining: { label: 'Kötüleşiyor', style: 'bg-red-100 text-red-800 border-red-200',       icon: '↓' },
  }
  const c = config[trend]
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border text-[11px] font-bold ${c.style}`}>
      <span>{c.icon}</span>
      {c.label}
    </span>
  )
}

// ── Significance badge ─────────────────────────────────────────────────────────

type Significance = 'material' | 'moderate' | 'minor'

function SignificanceDot({ sig }: { sig: Significance }) {
  const color = sig === 'material' ? 'bg-orange-500' : sig === 'moderate' ? 'bg-yellow-400' : 'bg-slate-300'
  return <span className={`inline-block w-1.5 h-1.5 rounded-full ${color}`} title={sig} />
}

// ── Comparison table ──────────────────────────────────────────────────────────

function ComparisonTable({ comparison }: { comparison: PeriodComparison }) {
  const relevantMetrics = ['revenue_try', 'expenses_try', 'gross_profit_try', 'net_income_try', 'gross_margin_pct', 'expense_ratio_pct']
  const rows = comparison.comparisons.filter(c => relevantMetrics.includes(c.metric_name))
  const isPctMetric = (name: string) => name.endsWith('_pct')

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-[#e2e8f0]">
            <th className="text-left py-2 pr-3 font-black text-[#94a3b8] uppercase tracking-widest text-[9px]">Metrik</th>
            <th className="text-right py-2 px-2 font-black text-[#94a3b8] uppercase tracking-widest text-[9px]">Güncel</th>
            <th className="text-right py-2 px-2 font-black text-[#94a3b8] uppercase tracking-widest text-[9px]">Önceki</th>
            <th className="text-right py-2 px-2 font-black text-[#94a3b8] uppercase tracking-widest text-[9px]">Değişim</th>
            <th className="text-right py-2 pl-2 font-black text-[#94a3b8] uppercase tracking-widest text-[9px]">%</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const isUp  = row.change_pct > 0
            const isDown = row.change_pct < 0
            const arrowCls = row.is_favorable
              ? (isUp ? 'text-green-600' : isDown ? 'text-red-600' : 'text-slate-400')
              : (isDown ? 'text-green-600' : isUp ? 'text-red-600' : 'text-slate-400')
            const pctCls = row.is_favorable
              ? (isUp ? 'text-green-700' : isDown ? 'text-red-700' : 'text-slate-500')
              : (isDown ? 'text-green-700' : isUp ? 'text-red-700' : 'text-slate-500')
            const arrow = isUp ? '↑' : isDown ? '↓' : '—'

            const fmtValue = (v: number) =>
              isPctMetric(row.metric_name) ? fmtPct(v) : fmtTRY(v, 0)

            return (
              <tr key={row.metric_name} className="border-b border-[#f1f5f9] hover:bg-[#f8fafc] transition-colors">
                <td className="py-2 pr-3">
                  <div className="flex items-center gap-1.5">
                    <SignificanceDot sig={row.significance} />
                    <span className="text-[#1e293b] font-semibold">{row.label}</span>
                  </div>
                </td>
                <td className="py-2 px-2 text-right font-semibold tabular-nums text-[#0f172a]">
                  {fmtValue(row.current_value)}
                </td>
                <td className="py-2 px-2 text-right tabular-nums text-[#64748b]">
                  {fmtValue(row.prior_value)}
                </td>
                <td className={`py-2 px-2 text-right font-bold text-lg leading-none ${arrowCls}`}>
                  {arrow}
                </td>
                <td className={`py-2 pl-2 text-right tabular-nums font-bold text-[11px] ${pctCls}`}>
                  {row.change_pct !== 0
                    ? `${row.change_pct > 0 ? '+' : ''}${row.change_pct.toFixed(1)}%`
                    : '—'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ── Sparkline (12-month revenue) ──────────────────────────────────────────────

function RevenueSparkline({ series }: { series: PeriodMetrics[] }) {
  if (series.length === 0) return null
  const maxRev = Math.max(...series.map(m => m.revenue_try), 1)

  return (
    <div className="space-y-1">
      <div className="text-[9px] font-black uppercase tracking-widest text-[#94a3b8] mb-2">
        12 Aylık Ciro Trendi
      </div>
      <div className="flex items-end gap-1 h-16">
        {series.map((m) => {
          const heightPct = (m.revenue_try / maxRev) * 100
          return (
            <div key={m.period} className="flex-1 flex flex-col justify-end" title={`${m.period}: ${fmtTRY(m.revenue_try, 0)}`}>
              <div
                className="bg-[#3b82f6] rounded-sm opacity-80 hover:opacity-100 transition-all"
                style={{ height: `${Math.max(2, heightPct)}%` }}
              />
            </div>
          )
        })}
      </div>
      <div className="flex justify-between text-[8px] text-[#94a3b8]">
        <span>{series[0]?.period ?? ''}</span>
        <span>{series[series.length - 1]?.period ?? ''}</span>
      </div>
    </div>
  )
}

// ── CMGR badge ────────────────────────────────────────────────────────────────

function CmgrBadge({ cmgr }: { cmgr: number | null }) {
  if (cmgr === null) {
    return (
      <div className="text-[9px] text-[#94a3b8] font-semibold">CMGR — hesaplanamadı</div>
    )
  }
  const isPositive = cmgr > 0
  const cls = isPositive ? 'text-green-700 bg-green-50 border-green-200' : cmgr < 0 ? 'text-red-700 bg-red-50 border-red-200' : 'text-slate-600 bg-slate-50 border-slate-200'
  return (
    <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded border text-[11px] font-bold ${cls}`}>
      <span className="text-[9px] font-black uppercase tracking-widest opacity-70">CMGR</span>
      <span>{isPositive ? '+' : ''}{cmgr.toFixed(2)}%</span>
    </div>
  )
}

// ── Tab button ────────────────────────────────────────────────────────────────

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-[11px] font-bold transition-colors border-b-2 ${
        active
          ? 'border-[#0f172a] text-[#0f172a] bg-white'
          : 'border-transparent text-[#64748b] hover:text-[#1e293b] hover:bg-[#f8fafc]'
      }`}
    >
      {children}
    </button>
  )
}

// ── Comparison panel ──────────────────────────────────────────────────────────

function ComparisonPanel({ comparison, title }: { comparison: PeriodComparison | null; title: string }) {
  if (!comparison) {
    return (
      <div className="text-center py-10 text-[#94a3b8] text-sm">
        {title} karşılaştırması için yeterli veri mevcut değil.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Headline + trend */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex-1">
          <p className="text-sm font-semibold text-[#1e293b]">{comparison.headline}</p>
          <p className="text-[11px] text-[#64748b] mt-1">{comparison.key_driver}</p>
        </div>
        <TrendBadge trend={comparison.overall_trend} />
      </div>

      {/* Comparison table */}
      <ComparisonTable comparison={comparison} />
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  companyId: string
}

export function PeriodComparisonClient({ companyId }: Props) {
  const [activeTab, setActiveTab] = useState<TabKey>('mom')

  const { data, isLoading, isError } = useQuery<{ report: PeriodComparisonReport }>({
    queryKey: ['period-comparison', companyId],
    queryFn:  async () => {
      const res = await fetch('/api/finance/period-comparison')
      if (!res.ok) throw new Error('Dönem karşılaştırma verisi yüklenemedi')
      return res.json()
    },
    staleTime: 30 * 60 * 1000,
  })

  // ── Loading ────────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="bg-white border border-[#e2e8f0] rounded p-6 shadow-sm animate-pulse space-y-3">
        <div className="h-4 bg-[#f1f5f9] rounded w-48" />
        <div className="h-8 bg-[#f1f5f9] rounded" />
        <div className="h-40 bg-[#f1f5f9] rounded" />
        <div className="h-20 bg-[#f1f5f9] rounded" />
      </div>
    )
  }

  // ── Error ──────────────────────────────────────────────────────────────────
  if (isError || !data?.report) {
    return (
      <div className="bg-white border border-[#e2e8f0] rounded p-6 shadow-sm text-center">
        <p className="text-sm text-[#64748b] font-medium">
          Dönem karşılaştırma verisi yüklenirken hata oluştu.
        </p>
      </div>
    )
  }

  const report = data.report

  const activeComparison: PeriodComparison | null =
    activeTab === 'mom' ? report.mom_comparison
    : activeTab === 'yoy' ? report.yoy_comparison
    : report.ytd_comparison

  const tabTitle: Record<TabKey, string> = {
    mom: 'Aylık Karşılaştırma (MoM)',
    yoy: 'Yıllık Karşılaştırma (YoY)',
    ytd: 'Yıl Başından İtibaren (YTD)',
  }

  return (
    <div className="space-y-4">

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">
            Dönem Performans Karşılaştırması — {report.current_month}
          </h3>
        </div>
        <CmgrBadge cmgr={report.cmgr_pct} />
      </div>

      {/* ── Tabs ──────────────────────────────────────────────────────────── */}
      <div className="bg-white border border-[#e2e8f0] rounded shadow-sm overflow-hidden">
        {/* Tab nav */}
        <div className="flex border-b border-[#e2e8f0] bg-[#f8fafc]">
          <TabButton active={activeTab === 'mom'} onClick={() => setActiveTab('mom')}>
            Aylık (MoM)
          </TabButton>
          <TabButton active={activeTab === 'yoy'} onClick={() => setActiveTab('yoy')}>
            Yıllık (YoY)
          </TabButton>
          <TabButton active={activeTab === 'ytd'} onClick={() => setActiveTab('ytd')}>
            YTD
          </TabButton>
        </div>

        {/* Tab content */}
        <div className="p-5">
          <ComparisonPanel
            comparison={activeComparison}
            title={tabTitle[activeTab]}
          />
        </div>
      </div>

      {/* ── Bottom: sparkline + best/worst ────────────────────────────────── */}
      <div className="grid grid-cols-12 gap-4">

        {/* Sparkline */}
        <div className="col-span-8 bg-white border border-[#e2e8f0] rounded p-4 shadow-sm">
          <RevenueSparkline series={report.monthly_series} />
          <div className="mt-3 flex items-center gap-3">
            <div className="text-[9px] font-black uppercase tracking-widest text-[#94a3b8]">
              Trend Serisi
            </div>
            {report.trend_streak !== 0 && (
              <span className={`text-[10px] font-bold ${report.trend_streak > 0 ? 'text-green-600' : 'text-red-600'}`}>
                {report.trend_streak > 0 ? `↑ ${report.trend_streak} ay art arda büyüme` : `↓ ${Math.abs(report.trend_streak)} ay art arda düşüş`}
              </span>
            )}
          </div>
        </div>

        {/* Best / worst months */}
        <div className="col-span-4 space-y-3">
          {report.best_month && (
            <div className="bg-white border border-[#e2e8f0] border-l-4 border-l-green-400 rounded px-4 py-3 shadow-sm">
              <div className="text-[9px] font-black uppercase tracking-widest text-[#94a3b8] mb-1">En İyi Ay</div>
              <div className="text-[11px] text-[#64748b] mb-0.5">{report.best_month.period}</div>
              <div className="text-base font-black tabular-nums text-[#0f172a]">
                {fmtTRY(report.best_month.revenue_try, 0)}
              </div>
            </div>
          )}
          {report.worst_month && (
            <div className="bg-white border border-[#e2e8f0] border-l-4 border-l-red-400 rounded px-4 py-3 shadow-sm">
              <div className="text-[9px] font-black uppercase tracking-widest text-[#94a3b8] mb-1">En Zayıf Ay</div>
              <div className="text-[11px] text-[#64748b] mb-0.5">{report.worst_month.period}</div>
              <div className="text-base font-black tabular-nums text-[#0f172a]">
                {fmtTRY(report.worst_month.revenue_try, 0)}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
