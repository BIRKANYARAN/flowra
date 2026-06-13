'use client'
// ── BudgetTrackerClient — Aylık Bütçe vs Gerçekleşen ─────────────────────────
//
// Displays budget health score, per-line variance, YTD pacing, and narrative.
// Uses TanStack Query for data fetching with period selector.

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fmtTRY, fmtPct } from '@/lib/format'
import type {
  MonthlyBudgetReport,
  BudgetLineItem,
  BudgetAdherence,
} from '@/lib/services/planning/budget-tracker.service'

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  companyId: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const MONTH_LABELS_TR = [
  'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
]

function buildPeriodOptions(): { value: string; label: string }[] {
  const now  = new Date()
  const opts = []
  for (let i = 0; i < 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const y = d.getFullYear()
    const m = d.getMonth() + 1
    const value = `${y}-${String(m).padStart(2, '0')}`
    const label = `${MONTH_LABELS_TR[m - 1]} ${y}`
    opts.push({ value, label })
  }
  return opts
}

function adherenceBadge(adherence: BudgetAdherence): JSX.Element {
  switch (adherence) {
    case 'on_target':
      return (
        <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded bg-[#f1f5f9] text-[#64748b]">
          Hedefte
        </span>
      )
    case 'favorable':
      return (
        <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded bg-pos-light text-pos-text">
          Olumlu
        </span>
      )
    case 'strongly_favorable':
      return (
        <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded bg-pos-light text-pos-text">
          Çok Olumlu
        </span>
      )
    case 'at_risk':
      return (
        <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded bg-warn-light text-warn-text">
          Risk
        </span>
      )
    case 'off_track':
      return (
        <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded bg-neg-light text-neg-text">
          Bütçe Aşımı
        </span>
      )
    case 'no_budget':
    default:
      return (
        <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded bg-[#f8fafc] text-[#94a3b8]">
          —
        </span>
      )
  }
}

function rowBg(adherence: BudgetAdherence): string {
  if (adherence === 'off_track') return 'bg-[#fef2f2]'
  if (adherence === 'at_risk')   return 'bg-[#fffbeb]'
  return 'hover:bg-[#f8fafc]'
}

function categoryLabel(category: string): string {
  const MAP: Record<string, string> = {
    revenue:           'Gelir',
    total_expense:     'Toplam Gider',
    salary:            'Maaş',
    rent:              'Kira',
    utilities:         'Faturalar',
    marketing:         'Pazarlama',
    office:            'Ofis',
    travel:            'Seyahat',
    software:          'Yazılım',
    other:             'Diğer',
    tax:               'Vergi',
    insurance:         'Sigorta',
    maintenance:       'Bakım / Onarım',
    logistics:         'Lojistik',
  }
  return MAP[category] ?? category
}

function gradeColor(grade: string): string {
  switch (grade) {
    case 'A': return 'text-pos-text'
    case 'B': return 'text-pos-text'
    case 'C': return 'text-warn-text'
    case 'D': return 'text-neg-text'
    case 'F': return 'text-neg-text'
    default:  return 'text-[#64748b]'
  }
}

function scoreColor(score: number): string {
  if (score >= 80) return 'text-pos-text'
  if (score >= 60) return 'text-warn-text'
  return 'text-neg-text'
}

// ── Fetcher ───────────────────────────────────────────────────────────────────

async function fetchBudgetTracker(period: string): Promise<MonthlyBudgetReport> {
  const res = await fetch(`/api/planning/budget-tracker?period=${period}`)
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`)
  }
  const data = await res.json() as { report: MonthlyBudgetReport }
  return data.report
}

// ── Expense table ─────────────────────────────────────────────────────────────

function ExpenseRow({ item }: { item: BudgetLineItem }): JSX.Element {
  const varSign = item.variance_pct !== null
    ? (item.variance_pct >= 0 ? `+${fmtPct(item.variance_pct)}` : fmtPct(item.variance_pct))
    : '—'

  return (
    <tr className={`border-b border-[#f8fafc] transition-colors ${rowBg(item.adherence)}`}>
      <td className="px-4 py-2 font-semibold text-[#334155] text-xs">
        {categoryLabel(item.category)}
      </td>
      <td className="px-3 py-2 text-right tabular-nums text-xs text-[#64748b]">
        {item.budget_try > 0 ? fmtTRY(item.budget_try) : '—'}
      </td>
      <td className="px-3 py-2 text-right tabular-nums text-xs font-bold text-[#0f172a]">
        {fmtTRY(item.actual_try)}
      </td>
      <td className={`px-3 py-2 text-right tabular-nums text-xs font-bold ${
        item.variance_pct !== null && item.variance_pct > 0 ? 'text-neg-text' : 'text-pos-text'
      }`}>
        {varSign}
      </td>
      <td className="px-3 py-2 text-center">
        {adherenceBadge(item.adherence)}
      </td>
    </tr>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function BudgetTrackerClient({ companyId }: Props) {
  const periodOptions = buildPeriodOptions()
  const [period, setPeriod] = useState(periodOptions[0].value)

  const { data: report, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['budget-tracker', companyId, period],
    queryFn:  () => fetchBudgetTracker(period),
    staleTime: 5 * 60 * 1000,
  })

  // ── Loading ───────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="flex items-center justify-between">
          <div className="bg-[#f1f5f9] rounded h-6 w-48" />
          <div className="bg-[#f1f5f9] rounded h-8 w-36" />
        </div>
        <div className="bg-[#f1f5f9] rounded h-28" />
        <div className="bg-[#f1f5f9] rounded h-64" />
      </div>
    )
  }

  // ── Error ─────────────────────────────────────────────────────────────────
  if (isError || !report) {
    return (
      <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft p-6 text-center text-xs text-[#94a3b8]">
        Bütçe takip raporu yüklenemedi.
        {error instanceof Error ? ` (${error.message})` : ''}
        <button
          onClick={() => refetch()}
          className="ml-2 text-brand-light font-semibold hover:underline"
        >
          Yeniden Dene
        </button>
      </div>
    )
  }

  // ── No budget data ────────────────────────────────────────────────────────
  if (!report.has_budget_data) {
    return (
      <div className="space-y-4">
        {/* Period selector */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-[#0f172a]">Bütçe Takibi</h2>
            <p className="text-xs text-[#94a3b8] mt-0.5">Aylık bütçe hedefleri ve varyans analizi</p>
          </div>
          <select
            value={period}
            onChange={e => setPeriod(e.target.value)}
            className="border border-[#e8eaef] rounded px-3 py-1.5 text-xs text-[#0f172a] focus:outline-none focus:ring-1 focus:ring-brand-light"
          >
            {periodOptions.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        <div className="bg-[#f8fafc] border border-[#e8eaef] rounded px-5 py-6 text-center">
          <div className="text-sm font-bold text-[#64748b] mb-1">
            Bu dönem için bütçe verisi girilmemiş
          </div>
          <div className="text-xs text-[#94a3b8]">
            {report.period_label} dönemi için bütçe hedefleri tanımlanmamış.
          </div>
          <div className="text-xs text-[#94a3b8] mt-2">
            Bütçe hedefi eklemek için{' '}
            <span className="font-semibold text-brand-light">
              Ayarlar → Bütçe Yönetimi
            </span>{' '}
            sayfasını kullanabilirsiniz.
          </div>
        </div>
      </div>
    )
  }

  // ── Expense line items (exclude revenue and total_expense, show categories) ─
  const expenseCategories = report.line_items.filter(
    i => i.metric_type === 'expense' && i.category !== 'total_expense',
  )

  // YTD pacing (from revenue line item)
  const ytdPacingPct = report.revenue_adherence?.ytd_pacing_pct ?? null

  return (
    <div className="space-y-5">

      {/* Header + Period selector */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-[#0f172a]">Bütçe Takibi</h2>
          <p className="text-xs text-[#94a3b8] mt-0.5">
            Aylık bütçe hedefleri ve varyans analizi — {report.period_label}
          </p>
        </div>
        <select
          value={period}
          onChange={e => setPeriod(e.target.value)}
          className="border border-[#e8eaef] rounded px-3 py-1.5 text-xs text-[#0f172a] focus:outline-none focus:ring-1 focus:ring-brand-light"
        >
          {periodOptions.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      {/* Budget Health Score Hero */}
      <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft shadow-sm px-6 py-5">
        <div className="flex items-center gap-6">
          {/* Score */}
          <div className="text-center min-w-[80px]">
            <div className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8] mb-1">
              Bütçe Sağlığı
            </div>
            <div className={`text-4xl font-bold tabular-nums ${scoreColor(report.budget_health_score)}`}>
              {report.budget_health_score}
            </div>
            <div className="text-[10px] text-[#94a3b8]">/100</div>
          </div>

          {/* Grade */}
          <div className="text-center min-w-[48px]">
            <div className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8] mb-1">
              Not
            </div>
            <div className={`text-3xl font-bold ${gradeColor(report.budget_health_grade)}`}>
              {report.budget_health_grade}
            </div>
          </div>

          {/* Divider */}
          <div className="w-px h-12 bg-[#e2e8f0]" />

          {/* Alerts summary */}
          <div className="flex-1 grid grid-cols-2 gap-3">
            <div className="bg-[#fef2f2] rounded px-3 py-2">
              <div className="text-[10px] font-bold uppercase tracking-wide text-neg-text mb-0.5">
                Bütçe Aşımı
              </div>
              <div className="text-lg font-bold text-[#0f172a]">
                {report.off_track_items.length}
              </div>
              <div className="text-[9px] text-[#94a3b8]">kalem</div>
            </div>
            <div className="bg-[#fffbeb] rounded px-3 py-2">
              <div className="text-[10px] font-bold uppercase tracking-wide text-warn-text mb-0.5">
                Risk
              </div>
              <div className="text-lg font-bold text-[#0f172a]">
                {report.at_risk_items.length}
              </div>
              <div className="text-[9px] text-[#94a3b8]">kalem</div>
            </div>
          </div>

          {/* Narrative */}
          <div className="flex-1 bg-[#f8fafc] rounded px-4 py-3 text-xs text-[#334155] italic">
            {report.narrative}
          </div>
        </div>
      </div>

      {/* Revenue Budget Card */}
      {report.revenue_adherence && (
        <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft shadow-sm">
          <div className="px-4 pt-4 pb-2 border-b border-[#f1f5f9]">
            <div className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8]">
              Gelir Bütçesi
            </div>
          </div>
          <div className="grid grid-cols-4 gap-0 px-0">
            {/* Budget */}
            <div className="px-4 py-3">
              <div className="text-[10px] text-[#94a3b8] mb-0.5">Bütçe Hedefi</div>
              <div className="text-sm font-bold tabular-nums text-[#0f172a]">
                {fmtTRY(report.revenue_adherence.budget_try)}
              </div>
            </div>
            {/* Actual */}
            <div className="px-4 py-3">
              <div className="text-[10px] text-[#94a3b8] mb-0.5">Gerçekleşen</div>
              <div className="text-sm font-bold tabular-nums text-[#0f172a]">
                {fmtTRY(report.revenue_adherence.actual_try)}
              </div>
            </div>
            {/* Variance */}
            <div className="px-4 py-3">
              <div className="text-[10px] text-[#94a3b8] mb-0.5">Varyans</div>
              <div className={`text-sm font-bold tabular-nums ${
                report.revenue_adherence.variance_try >= 0 ? 'text-pos-text' : 'text-neg-text'
              }`}>
                {report.revenue_adherence.variance_pct !== null
                  ? (report.revenue_adherence.variance_pct >= 0 ? `+${fmtPct(report.revenue_adherence.variance_pct)}` : fmtPct(report.revenue_adherence.variance_pct))
                  : (report.revenue_adherence.variance_try >= 0 ? `+${fmtTRY(report.revenue_adherence.variance_try)}` : fmtTRY(report.revenue_adherence.variance_try))
                }
              </div>
            </div>
            {/* Adherence */}
            <div className="px-4 py-3">
              <div className="text-[10px] text-[#94a3b8] mb-1">Durum</div>
              {adherenceBadge(report.revenue_adherence.adherence)}
            </div>
          </div>
        </div>
      )}

      {/* Expense Budget Table */}
      <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft shadow-sm">
        <div className="px-4 pt-4 pb-2 border-b border-[#f1f5f9] flex items-center justify-between">
          <div>
            <div className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8]">
              Gider Bütçesi
            </div>
            <div className="text-xs text-[#94a3b8] mt-0.5">
              Toplam varyans:{' '}
              <span className={`font-bold ${report.total_expense_variance_try > 0 ? 'text-neg-text' : 'text-pos-text'}`}>
                {report.total_expense_variance_try >= 0
                  ? `+${fmtTRY(report.total_expense_variance_try)}`
                  : fmtTRY(report.total_expense_variance_try)}
              </span>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[#f1f5f9] bg-[#f8fafc]">
                <th className="text-left px-4 py-2 font-semibold text-[#64748b]">Kategori</th>
                <th className="text-right px-3 py-2 font-semibold text-[#64748b]">Bütçe</th>
                <th className="text-right px-3 py-2 font-semibold text-[#64748b]">Gerçekleşen</th>
                <th className="text-right px-3 py-2 font-semibold text-[#64748b]">Varyans</th>
                <th className="text-center px-3 py-2 font-semibold text-[#64748b]">Durum</th>
              </tr>
            </thead>
            <tbody>
              {/* Total expense row */}
              {report.line_items
                .filter(i => i.category === 'total_expense')
                .map(item => (
                  <tr
                    key="total_expense"
                    className={`border-b border-[#e8eaef] font-bold transition-colors ${rowBg(item.adherence)}`}
                  >
                    <td className="px-4 py-2 text-xs text-[#0f172a] font-bold">Toplam Gider</td>
                    <td className="px-3 py-2 text-right tabular-nums text-xs text-[#64748b]">
                      {item.budget_try > 0 ? fmtTRY(item.budget_try) : '—'}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-xs font-bold text-[#0f172a]">
                      {fmtTRY(item.actual_try)}
                    </td>
                    <td className={`px-3 py-2 text-right tabular-nums text-xs font-bold ${
                      item.variance_try > 0 ? 'text-neg-text' : 'text-pos-text'
                    }`}>
                      {item.variance_pct !== null
                        ? (item.variance_pct >= 0 ? `+${fmtPct(item.variance_pct)}` : fmtPct(item.variance_pct))
                        : (item.variance_try >= 0 ? `+${fmtTRY(item.variance_try)}` : fmtTRY(item.variance_try))
                      }
                    </td>
                    <td className="px-3 py-2 text-center">
                      {adherenceBadge(item.adherence)}
                    </td>
                  </tr>
                ))}

              {/* Category rows */}
              {expenseCategories.length > 0 ? (
                expenseCategories.map(item => (
                  <ExpenseRow key={item.category} item={item} />
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="px-4 py-3 text-center text-[10px] text-[#94a3b8]">
                    Bu dönem için gider kategorisi bulunamadı
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* YTD Pacing */}
      {ytdPacingPct !== null && (
        <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft shadow-sm px-4 py-3">
          <div className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8] mb-1">
            Yılbaşından Bu Yana Bütçe Yürüyüşü
          </div>
          <div className="flex items-center gap-3">
            <div className={`text-xl font-bold tabular-nums ${
              ytdPacingPct >= 95 && ytdPacingPct <= 110 ? 'text-pos-text'
              : ytdPacingPct < 80 || ytdPacingPct > 120 ? 'text-neg-text'
              : 'text-warn-text'
            }`}>
              %{ytdPacingPct.toFixed(1)}
            </div>
            <div className="text-xs text-[#64748b]">
              Yılbaşından bu yana bütçenin %{ytdPacingPct.toFixed(1)}&apos;ındayız
            </div>
          </div>
          {/* Progress bar */}
          <div className="mt-2 h-1.5 bg-[#f1f5f9] rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                ytdPacingPct >= 95 && ytdPacingPct <= 110 ? 'bg-pos-text'
                : ytdPacingPct < 80 || ytdPacingPct > 120 ? 'bg-neg-text'
                : 'bg-warn-text'
              }`}
              style={{ width: `${Math.min(ytdPacingPct, 150)}%` }}
            />
          </div>
        </div>
      )}

    </div>
  )
}
