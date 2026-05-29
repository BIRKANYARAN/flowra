'use client'

// ─────────────────────────────────────────────────────────────────────────────
// BudgetVarianceClient
//
// Bütçe Sapma Analizi — actual vs budget for revenue, expenses, and P&L.
//
// Features:
//   - 3 KPI cells: revenue variance %, expense variance %, net income variance %
//   - Performance badge (classifyBudgetPerformance result in Turkish)
//   - Budget lines table: category (Turkish), budget, actual, variance, indicator
//   - "Tahminsel bütçe kullanılıyor" badge when is_using_derived_budget
// ─────────────────────────────────────────────────────────────────────────────

import { useQuery } from '@tanstack/react-query'
import {
  Panel,
  PanelHeader,
  KpiStrip,
  KpiCell,
  EmptySlate,
  Skeleton,
  NarrativeFooter,
} from '@/components/ds/shell'
import type { BudgetVarianceReport, BudgetLine } from '@/lib/services/finance/budget-variance.service'
import { fmtTRY, fmtPct } from '@/lib/format'

// ── Turkish category labels ───────────────────────────────────────────────────

const CATEGORY_TR: Record<string, string> = {
  revenue:    'Gelir',
  sales:      'Gelir',
  income:     'Gelir',
  salary:     'Maaş',
  rent:       'Kira',
  software:   'Yazılım',
  marketing:  'Pazarlama',
  logistics:  'Lojistik',
  general:    'Genel Giderler',
  cogs:       'SMM',
  other:      'Diğer',
  tax:        'Vergi',
  utilities:  'Faturalar',
  operational: 'Operasyonel',
}

function categoryLabel(cat: string): string {
  return CATEGORY_TR[cat.toLowerCase()] ?? cat
}

// ── Performance badge ─────────────────────────────────────────────────────────

type PerformanceKey =
  | 'excellent'
  | 'on_track'
  | 'slight_miss'
  | 'miss'
  | 'significant_miss'
  | 'no_budget'

const PERFORMANCE_CONFIG: Record<PerformanceKey, { label: string; cls: string }> = {
  excellent:        { label: 'Mükemmel',          cls: 'bg-green-50 border-green-200 text-green-800' },
  on_track:         { label: 'Hedefe Uygun',       cls: 'bg-blue-50 border-blue-200 text-blue-800' },
  slight_miss:      { label: 'Hafif Sapma',        cls: 'bg-yellow-50 border-yellow-200 text-yellow-800' },
  miss:             { label: 'Bütçe Altında',      cls: 'bg-orange-50 border-orange-200 text-orange-700' },
  significant_miss: { label: 'Kritik Sapma',       cls: 'bg-red-50 border-red-200 text-red-800' },
  no_budget:        { label: 'Bütçe Yok',          cls: 'bg-slate-50 border-slate-200 text-slate-600' },
}

// ── Trend badge ───────────────────────────────────────────────────────────────

type TrendKey = 'improving' | 'declining' | 'stable' | 'insufficient_data'

const TREND_CONFIG: Record<TrendKey, { label: string; cls: string }> = {
  improving:         { label: 'İyileşiyor ↑',  cls: 'bg-green-50 border-green-200 text-green-700' },
  declining:         { label: 'Kötüleşiyor ↓', cls: 'bg-red-50 border-red-200 text-red-700' },
  stable:            { label: 'Sabit →',        cls: 'bg-slate-50 border-slate-200 text-slate-600' },
  insufficient_data: { label: 'Veri Yetersiz',  cls: 'bg-slate-50 border-slate-200 text-slate-400' },
}

// ── KPI tone helper ───────────────────────────────────────────────────────────

function varianceTone(pct: number, isRevenue: boolean): 'ok' | 'warn' | 'critical' | 'neutral' {
  if (isRevenue) {
    if (pct >= 5)  return 'ok'
    if (pct >= -5) return 'neutral'
    if (pct >= -15) return 'warn'
    return 'critical'
  } else {
    // expense: negative variance is good
    if (pct <= -5)  return 'ok'
    if (pct <= 5)   return 'neutral'
    if (pct <= 15)  return 'warn'
    return 'critical'
  }
}

// ── Budget line row ───────────────────────────────────────────────────────────

function BudgetLineRow({ line }: { line: BudgetLine }) {
  const varColor  = line.is_favorable ? 'text-[#059669]' : 'text-[#dc2626]'
  const indicator = line.is_favorable ? '▲' : '▼'
  const sign      = line.variance_try > 0 ? '+' : line.variance_try < 0 ? '' : ''

  return (
    <tr className="border-t border-[#f1f5f9] hover:bg-[#f8fafc]">
      <td className="py-2 px-3 text-[11px] font-medium text-[#475569]">
        {categoryLabel(line.category)}
      </td>
      <td className="py-2 px-3 text-right text-[11px] tabular-nums text-[#64748b]">
        {fmtTRY(line.budget_try, 0)}
      </td>
      <td className="py-2 px-3 text-right text-[11px] tabular-nums font-medium text-[#1e293b]">
        {fmtTRY(line.actual_try, 0)}
      </td>
      <td className={`py-2 px-3 text-right text-[11px] tabular-nums font-bold ${varColor}`}>
        {sign}{fmtTRY(line.variance_try, 0)}
      </td>
      <td className={`py-2 px-3 text-right text-[11px] tabular-nums font-bold ${varColor}`}>
        {line.variance_pct !== 0 ? `${line.variance_pct > 0 ? '+' : ''}${line.variance_pct.toFixed(1)}%` : '—'}
      </td>
      <td className={`py-2 px-3 text-center text-[11px] font-bold ${varColor}`}>
        {indicator}
      </td>
    </tr>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  companyId: string
}

export function BudgetVarianceClient({ companyId }: Props) {
  const { data, isLoading, isError } = useQuery<{ report: BudgetVarianceReport }>({
    queryKey: ['budget-variance', companyId],
    queryFn: async () => {
      const res = await fetch('/api/finance/budget-variance')
      if (!res.ok) throw new Error('Bütçe sapma verisi yüklenemedi')
      return res.json()
    },
    staleTime: 30 * 60 * 1000,
  })

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-[72px]" />
        <Skeleton className="h-[320px]" />
      </div>
    )
  }

  // ── Error / empty ────────────────────────────────────────────────────────────
  if (isError || !data?.report) {
    return (
      <EmptySlate
        title="Bütçe verisi yüklenemedi"
        sub="Satış ve gider verileri mevcut olduğunda bütçe analizi otomatik hesaplanır."
      />
    )
  }

  const { report }     = data
  const { current_period, ytd, performance, trend, run_rate } = report

  const revenueVarPct  = ytd.ytd_revenue_variance_pct
  const expenseVarPct  = ytd.ytd_expense_variance_pct
  const netVarPct      = ytd.ytd_net_income_variance_pct

  const perfCfg  = PERFORMANCE_CONFIG[performance as PerformanceKey] ?? PERFORMANCE_CONFIG.no_budget
  const trendCfg = TREND_CONFIG[trend as TrendKey]     ?? TREND_CONFIG.insufficient_data

  // Sort lines: revenue first, then expenses by absolute variance desc
  const sortedLines = [...current_period.lines].sort((a, b) => {
    const aIsRev = ['revenue', 'sales', 'income'].includes(a.category.toLowerCase())
    const bIsRev = ['revenue', 'sales', 'income'].includes(b.category.toLowerCase())
    if (aIsRev !== bIsRev) return aIsRev ? -1 : 1
    return Math.abs(b.variance_try) - Math.abs(a.variance_try)
  })

  return (
    <div className="space-y-4">

      {/* ── Section header ──────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">
          Bütçe Sapma Analizi
        </div>

        <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-bold ${perfCfg.cls}`}>
          {perfCfg.label}
        </span>

        <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-bold ${trendCfg.cls}`}>
          {trendCfg.label}
        </span>

        {report.is_using_derived_budget && (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full border border-amber-200 bg-amber-50 text-[10px] font-bold text-amber-700">
            Tahminsel bütçe kullanılıyor
          </span>
        )}
      </div>

      {/* ── KPI strip: 3 variances ───────────────────────────────────────────── */}
      <KpiStrip cols={3}>
        <KpiCell
          label="YTD Gelir Sapması"
          value={`${revenueVarPct > 0 ? '+' : ''}${revenueVarPct.toFixed(1)}%`}
          sub={`Bütçe: ${fmtTRY(ytd.ytd_budget_revenue, 0)} → Gerçek: ${fmtTRY(ytd.ytd_actual_revenue, 0)}`}
          tone={varianceTone(revenueVarPct, true)}
        />
        <KpiCell
          label="YTD Gider Sapması"
          value={`${expenseVarPct > 0 ? '+' : ''}${expenseVarPct.toFixed(1)}%`}
          sub={`Bütçe: ${fmtTRY(ytd.ytd_budget_expenses, 0)} → Gerçek: ${fmtTRY(ytd.ytd_actual_expenses, 0)}`}
          tone={varianceTone(expenseVarPct, false)}
        />
        <KpiCell
          label="YTD Net Kâr Sapması"
          value={`${netVarPct > 0 ? '+' : ''}${netVarPct.toFixed(1)}%`}
          sub={`Gerçek net: ${fmtTRY(current_period.actual_net_income, 0)}`}
          tone={netVarPct >= 0 ? 'ok' : netVarPct >= -15 ? 'warn' : 'critical'}
        />
      </KpiStrip>

      {/* ── Budget lines table ───────────────────────────────────────────────── */}
      <Panel>
        <PanelHeader
          label={`Bütçe Kalemleri — ${report.period}`}
          sub="Bütçe / Gerçek / Sapma"
        />
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b border-[#e2e8f0]">
                {['Kategori', 'Bütçe', 'Gerçek', 'Sapma (₺)', 'Sapma (%)', ''].map(h => (
                  <th
                    key={h}
                    className={`py-2 px-3 text-[10px] font-black uppercase tracking-wide text-[#94a3b8] ${
                      h === 'Kategori' || h === '' ? 'text-left' : 'text-right'
                    }`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedLines.map(line => (
                <BudgetLineRow key={line.category} line={line} />
              ))}

              {/* Net income summary row */}
              <tr className="border-t-2 border-[#e2e8f0] bg-[#f8fafc]">
                <td className="py-2 px-3 text-[11px] font-black text-[#0f172a]">Net Kâr</td>
                <td className="py-2 px-3 text-right text-[11px] tabular-nums font-bold text-[#475569]">
                  {fmtTRY(current_period.budget_net_income, 0)}
                </td>
                <td className="py-2 px-3 text-right text-[11px] tabular-nums font-black text-[#0f172a]">
                  {fmtTRY(current_period.actual_net_income, 0)}
                </td>
                <td className={`py-2 px-3 text-right text-[11px] tabular-nums font-black ${
                  current_period.is_net_income_favorable ? 'text-[#059669]' : 'text-[#dc2626]'
                }`}>
                  {current_period.net_income_variance_try > 0 ? '+' : ''}{fmtTRY(current_period.net_income_variance_try, 0)}
                </td>
                <td className={`py-2 px-3 text-right text-[11px] tabular-nums font-black ${
                  current_period.is_net_income_favorable ? 'text-[#059669]' : 'text-[#dc2626]'
                }`}>
                  {current_period.net_income_variance_pct !== 0
                    ? `${current_period.net_income_variance_pct > 0 ? '+' : ''}${current_period.net_income_variance_pct.toFixed(1)}%`
                    : '—'}
                </td>
                <td className={`py-2 px-3 text-center text-[11px] font-black ${
                  current_period.is_net_income_favorable ? 'text-[#059669]' : 'text-[#dc2626]'
                }`}>
                  {current_period.is_net_income_favorable ? '▲' : '▼'}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </Panel>

      {/* ── Run rate card ────────────────────────────────────────────────────── */}
      <Panel>
        <PanelHeader label="Yıl Sonu Projeksiyonu (Run Rate)" tight />
        <div className="grid grid-cols-3 divide-x divide-[#f1f5f9] px-0">
          <div className="px-5 py-4">
            <div className="text-[10px] font-black uppercase tracking-wide text-[#94a3b8] mb-1">
              Tahmini Yıllık Gelir
            </div>
            <div className="text-xl font-black tabular-nums text-[#0f172a]">
              {fmtTRY(run_rate.run_rate_revenue, 0)}
            </div>
          </div>
          <div className="px-5 py-4">
            <div className="text-[10px] font-black uppercase tracking-wide text-[#94a3b8] mb-1">
              Tahmini Yıllık Gider
            </div>
            <div className="text-xl font-black tabular-nums text-[#dc2626]">
              {fmtTRY(run_rate.run_rate_expenses, 0)}
            </div>
          </div>
          <div className="px-5 py-4">
            <div className="text-[10px] font-black uppercase tracking-wide text-[#94a3b8] mb-1">
              Tahmini Yıllık Net Kâr
            </div>
            <div className={`text-xl font-black tabular-nums ${
              run_rate.run_rate_net_income >= 0 ? 'text-[#059669]' : 'text-[#dc2626]'
            }`}>
              {fmtTRY(run_rate.run_rate_net_income, 0)}
            </div>
          </div>
        </div>
      </Panel>

      {/* ── Largest variance callout ─────────────────────────────────────────── */}
      {report.largest_variance && (
        <div className="bg-orange-50 border border-orange-200 rounded px-5 py-3">
          <div className="text-[10px] font-black uppercase tracking-wide text-orange-500 mb-1">
            En Büyük Sapma
          </div>
          <div className="text-sm font-bold text-orange-900">
            {categoryLabel(report.largest_variance.category)}:{' '}
            <span className="tabular-nums">
              {report.largest_variance.variance_try > 0 ? '+' : ''}{fmtTRY(report.largest_variance.variance_try, 0)}
            </span>
            {' '}
            <span className="text-[11px] font-normal">
              ({report.largest_variance.variance_pct > 0 ? '+' : ''}{report.largest_variance.variance_pct.toFixed(1)}%)
            </span>
          </div>
        </div>
      )}

      {/* ── Narrative footer ─────────────────────────────────────────────────── */}
      <NarrativeFooter
        narrative="Bütçe analizi, gerçek gelir ve giderleri hedeflerle karşılaştırır. Tahminsel bütçe, geçen ayın %5 büyüme varsayımıyla hesaplanır."
        links={[
          { label: 'Giderler', href: '/dashboard/finance?tab=costs' },
          { label: 'Gelir Tablosu', href: '/dashboard/finance?tab=pnl' },
        ]}
      />
    </div>
  )
}
