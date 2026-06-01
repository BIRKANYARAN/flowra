'use client'
// ── BudgetTab — Bütçe vs Gerçekleşen ────────────────────────────────────────
//
// Client component: fetches budget-variance report and shows:
//   - YTD summary strip
//   - 12-month variance table with color coding
//   - Inline form for admins to enter/update current-month budget
//   - Expense Forecast panel (next month category-level prediction)
//   - 3-Way Variance Analysis (Actual vs Budget vs Forecast)
//
// Color coding:
//   Revenue — green = on_track/above, red = below, gray = no_budget
//   Expense  — green = under_budget/on_budget, red = over_budget, gray = no_budget

import { useState, useEffect, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { usePermissions } from '@/lib/workspace-context'
import { fmtTRY, fmtPct } from '@/lib/format'
import type { BudgetVarianceReport, MonthlyVariance } from '@/lib/services/finance/budget-variance.service'
import type { ExpenseForecastReport } from '@/lib/services/finance/expense-forecast.service'
import { ExpenseForecastPanel } from './_budget/ExpenseForecastPanel'
import type { VarianceReport, VarianceRow, VarianceCell, VarianceDirection } from '@/lib/services/planning/variance-analysis.service'
import { BudgetTrackerClient } from './_budget/BudgetTrackerClient'

// ── Small helpers ─────────────────────────────────────────────────────────────

function varSign(v: number | null): string {
  if (v === null) return '—'
  return v >= 0 ? `+${fmtTRY(v)}` : fmtTRY(v)
}

function varPctSign(v: number | null): string {
  if (v === null) return '—'
  return v >= 0 ? `+${fmtPct(v)}` : fmtPct(v)
}

function revenueStatusColor(status: MonthlyVariance['revenue_status']): string {
  switch (status) {
    case 'above':    return 'text-pos-text font-bold'
    case 'on_track': return 'text-pos-text'
    case 'below':    return 'text-neg-text font-bold'
    case 'no_budget': return 'text-[#94a3b8]'
  }
}

function expenseStatusColor(status: MonthlyVariance['expense_status']): string {
  switch (status) {
    case 'under_budget': return 'text-pos-text font-bold'
    case 'on_budget':    return 'text-pos-text'
    case 'over_budget':  return 'text-neg-text font-bold'
    case 'no_budget':    return 'text-[#94a3b8]'
    case 'on_track':     return 'text-pos-text'
  }
}

function overallStatusBadge(status: BudgetVarianceReport['overall_status']): {
  label: string
  cls: string
} {
  switch (status) {
    case 'on_track':
      return { label: 'Hedefte', cls: 'bg-pos-light border-pos-light text-pos-text' }
    case 'at_risk':
      return { label: 'Risk Var', cls: 'bg-warn-light border-warn-light text-warn-text' }
    case 'over_budget':
      return { label: 'Bütçe Aşımı', cls: 'bg-neg-light border-neg-light text-neg-text' }
    case 'no_budget':
      return { label: 'Bütçe Yok', cls: 'bg-[#f1f5f9] border-[#e2e8f0] text-[#94a3b8]' }
  }
}


// ── Variance Analysis helpers ─────────────────────────────────────────────────

const MONTH_LABELS_SHORT = ['Oc', 'Şb', 'Mr', 'Ns', 'My', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Ek', 'Ks', 'Ar']

function varianceCellBg(dir: VarianceDirection): string {
  switch (dir) {
    case 'favorable':   return 'bg-pos-light text-pos-text'
    case 'unfavorable': return 'bg-neg-light text-neg-text'
    case 'neutral':     return 'bg-[#f1f5f9] text-[#64748b]'
    case 'no_data':
    default:            return 'bg-transparent text-[#cbd5e1]'
  }
}

function variancePctChip(pct: number | null, dir: VarianceDirection): JSX.Element {
  if (pct === null) return <span className="text-[#cbd5e1]">—</span>
  const cls = varianceCellBg(dir)
  const sign = pct >= 0 ? '+' : ''
  return (
    <span className={`inline-block text-[9px] font-bold px-1 py-0.5 rounded ${cls}`}>
      {sign}{pct.toFixed(1)}%
    </span>
  )
}

function YtdValueBlock({ cell, label }: { cell: VarianceCell; label: string }): JSX.Element {
  return (
    <div className="text-right">
      <div className="text-[9px] font-semibold text-[#94a3b8] mb-0.5">{label}</div>
      {cell.actual !== null && (
        <div className="text-xs font-black tabular-nums text-[#0f172a]">{fmtTRY(cell.actual)}</div>
      )}
      {cell.budget !== null && (
        <div className="text-[9px] tabular-nums text-[#64748b]">B: {fmtTRY(cell.budget)}</div>
      )}
      {cell.forecast !== null && (
        <div className="text-[9px] tabular-nums text-[#64748b]">T: {fmtTRY(cell.forecast)}</div>
      )}
      <div className="mt-0.5 space-y-0.5">
        {cell.actual_vs_budget_pct !== null && (
          <div className="flex items-center justify-end gap-0.5">
            <span className="text-[8px] text-[#94a3b8]">B:</span>
            {variancePctChip(cell.actual_vs_budget_pct, cell.actual_vs_budget_dir)}
          </div>
        )}
        {cell.actual_vs_forecast_pct !== null && (
          <div className="flex items-center justify-end gap-0.5">
            <span className="text-[8px] text-[#94a3b8]">T:</span>
            {variancePctChip(cell.actual_vs_forecast_pct, cell.actual_vs_forecast_dir)}
          </div>
        )}
      </div>
    </div>
  )
}

function VarianceMatrixRow({ row }: { row: VarianceRow }): JSX.Element {
  return (
    <tr className="border-b border-[#f8fafc] hover:bg-[#f8fafc] transition-colors">
      {/* Metric label */}
      <td className="px-3 py-2 font-semibold text-[#334155] text-xs whitespace-nowrap sticky left-0 bg-white z-10">
        {row.metric_label}
      </td>
      {/* 12 monthly cells */}
      {row.monthly.map((cell, i) => (
        <td key={i} className="px-1 py-2 text-center">
          {variancePctChip(cell.actual_vs_budget_pct, cell.actual_vs_budget_dir)}
        </td>
      ))}
      {/* YTD */}
      <td className="px-3 py-2 bg-[#f8fafc] border-l border-[#e2e8f0]">
        <YtdValueBlock cell={row.ytd} label={row.metric_label} />
      </td>
    </tr>
  )
}

async function fetchVarianceAnalysis(year: number): Promise<VarianceReport> {
  const res = await fetch(`/api/planning/variance-analysis?year=${year}`)
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`)
  }
  const data = await res.json() as { report: VarianceReport }
  return data.report
}

function VarianceAnalysisPanel(): JSX.Element {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())

  const { data: report, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['variance-analysis', year],
    queryFn: () => fetchVarianceAnalysis(year),
    staleTime: 5 * 60 * 1000,
  })

  const yearOptions = Array.from({ length: 5 }, (_, i) => now.getFullYear() - 2 + i)

  if (isLoading) {
    return (
      <div className="space-y-2 animate-pulse">
        <div className="bg-[#f1f5f9] rounded h-6 w-48" />
        <div className="bg-[#f1f5f9] rounded h-64" />
      </div>
    )
  }

  if (isError || !report) {
    return (
      <div className="bg-white border border-[#e2e8f0] rounded p-4 text-xs text-[#94a3b8]">
        Varyans analizi yüklenemedi.
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

  return (
    <div className="bg-white border border-[#e2e8f0] rounded shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-[#f1f5f9]">
        <div>
          <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">
            3 Yönlü Analiz
          </div>
          <div className="text-sm font-black text-[#0f172a] mt-0.5">
            Varyans Analizi
          </div>
          <p className="text-[10px] text-[#94a3b8] mt-0.5">
            Gerçekleşen / Bütçe / Tahmin karşılaştırması
          </p>
        </div>
        {/* Year selector */}
        <select
          value={year}
          onChange={e => setYear(parseInt(e.target.value))}
          className="border border-[#e2e8f0] rounded px-3 py-1.5 text-xs text-[#0f172a] focus:outline-none focus:ring-1 focus:ring-brand-light"
        >
          {yearOptions.map(y => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </div>

      {/* Summary chips */}
      <div className="grid grid-cols-3 gap-3 px-4 py-3 border-b border-[#f1f5f9]">
        {/* YTD Revenue Variance */}
        <div className="bg-[#f8fafc] rounded px-3 py-2 text-center">
          <div className="text-[9px] font-black uppercase tracking-wide text-[#94a3b8] mb-1">
            YTD Gelir Varyansı
          </div>
          {report.ytd_revenue_variance_pct !== null ? (
            <div className={`text-sm font-black tabular-nums ${
              report.ytd_revenue_variance_pct >= 0 ? 'text-pos-text' : 'text-neg-text'
            }`}>
              {report.ytd_revenue_variance_pct >= 0 ? '+' : ''}
              {fmtPct(report.ytd_revenue_variance_pct)}
            </div>
          ) : (
            <div className="text-sm font-black text-[#94a3b8]">—</div>
          )}
          <div className="text-[9px] text-[#94a3b8] mt-0.5">vs Bütçe</div>
        </div>

        {/* YTD Expense Variance */}
        <div className="bg-[#f8fafc] rounded px-3 py-2 text-center">
          <div className="text-[9px] font-black uppercase tracking-wide text-[#94a3b8] mb-1">
            YTD Gider Varyansı
          </div>
          {report.ytd_expense_variance_pct !== null ? (
            <div className={`text-sm font-black tabular-nums ${
              report.ytd_expense_variance_pct <= 0 ? 'text-pos-text' : 'text-neg-text'
            }`}>
              {report.ytd_expense_variance_pct >= 0 ? '+' : ''}
              {fmtPct(report.ytd_expense_variance_pct)}
            </div>
          ) : (
            <div className="text-sm font-black text-[#94a3b8]">—</div>
          )}
          <div className="text-[9px] text-[#94a3b8] mt-0.5">vs Bütçe</div>
        </div>

        {/* Forecast Accuracy */}
        <div className="bg-[#f8fafc] rounded px-3 py-2 text-center">
          <div className="text-[9px] font-black uppercase tracking-wide text-[#94a3b8] mb-1">
            Tahmin Doğruluğu
          </div>
          {report.forecast_accuracy_score !== null ? (
            <div className={`text-sm font-black tabular-nums ${
              report.forecast_accuracy_score >= 90 ? 'text-pos-text'
              : report.forecast_accuracy_score >= 70 ? 'text-warn-text'
              : 'text-neg-text'
            }`}>
              {report.forecast_accuracy_score.toFixed(0)}
              <span className="text-xs font-normal">/100</span>
            </div>
          ) : (
            <div className="text-sm font-black text-[#94a3b8]">—</div>
          )}
          <div className="text-[9px] text-[#94a3b8] mt-0.5">
            {report.months_available} ay verisi
          </div>
        </div>
      </div>

      {/* Status flags */}
      {!report.has_budget && !report.has_forecast && (
        <div className="px-4 py-2 text-[10px] text-[#94a3b8] border-b border-[#f1f5f9]">
          Bu yıl için bütçe ve tahmin verisi bulunmuyor. Sadece gerçekleşen veriler gösteriliyor.
        </div>
      )}
      {report.has_budget && !report.has_forecast && (
        <div className="px-4 py-2 text-[10px] text-[#94a3b8] border-b border-[#f1f5f9]">
          Tahmin senaryosu (baseline) bulunamadı — sadece bütçe varyansı gösteriliyor.
        </div>
      )}

      {/* Variance matrix */}
      <div className="overflow-x-auto">
        <table className="w-full text-[10px]">
          <thead>
            <tr className="border-b border-[#f1f5f9] bg-[#f8fafc]">
              <th className="text-left px-3 py-2 font-semibold text-[#64748b] sticky left-0 bg-[#f8fafc] z-10">
                Metrik
              </th>
              {MONTH_LABELS_SHORT.map((m, i) => (
                <th key={i} className="text-center px-1 py-2 font-semibold text-[#64748b] min-w-[36px]">
                  {m}
                </th>
              ))}
              <th className="text-right px-3 py-2 font-semibold text-[#64748b] bg-[#f1f5f9] border-l border-[#e2e8f0] min-w-[100px]">
                YTD
              </th>
            </tr>
          </thead>
          <tbody>
            {report.rows.map(row => (
              <VarianceMatrixRow key={row.metric_key} row={row} />
            ))}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="px-4 py-2 border-t border-[#f1f5f9] flex items-center gap-4 flex-wrap">
        <span className="text-[9px] text-[#94a3b8] font-semibold uppercase tracking-wide">Renk kodlaması (Bütçe vs Gerçekleşen):</span>
        <span className="inline-flex items-center gap-1 text-[9px]">
          <span className="w-2 h-2 rounded-sm bg-pos-light inline-block" />
          <span className="text-pos-text font-semibold">Olumlu</span>
        </span>
        <span className="inline-flex items-center gap-1 text-[9px]">
          <span className="w-2 h-2 rounded-sm bg-neg-light inline-block" />
          <span className="text-neg-text font-semibold">Olumsuz</span>
        </span>
        <span className="inline-flex items-center gap-1 text-[9px]">
          <span className="w-2 h-2 rounded-sm bg-[#f1f5f9] inline-block" />
          <span className="text-[#64748b] font-semibold">Nötr (&lt;1%)</span>
        </span>
        <span className="ml-auto text-[9px] text-[#cbd5e1]">
          Son güncelleme: {new Date(report.computed_at).toLocaleString('tr-TR')}
        </span>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

interface BudgetTabProps {
  companyId?: string
}

export function BudgetTab({ companyId }: BudgetTabProps = {}) {
  const permissions = usePermissions()
  const isAdmin = permissions.canManageSettings

  const [report, setReport] = useState<BudgetVarianceReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Form state
  const now = new Date()
  const [formYear, setFormYear] = useState(now.getFullYear())
  const [formMonth, setFormMonth] = useState(now.getMonth() + 1)
  const [formRevenue, setFormRevenue] = useState('')
  const [formExpense, setFormExpense] = useState('')
  const [formNotes, setFormNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState(false)

  const fetchReport = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/finance/budget-variance')
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`)
      }
      const data = (await res.json()) as { report: BudgetVarianceReport }
      setReport(data.report)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchReport() }, [fetchReport])

  // Pre-fill form when report loads
  useEffect(() => {
    if (!report) return
    const currentKey = `${formYear}-${String(formMonth).padStart(2, '0')}`
    const existingMonth = report.months.find(
      m => m.year === formYear && m.month === formMonth,
    )
    if (existingMonth && existingMonth.budget_revenue_try !== null) {
      setFormRevenue(String(existingMonth.budget_revenue_try))
      setFormExpense(String(existingMonth.budget_expense_try ?? ''))
    }
    // Suppress unused variable lint
    void currentKey
  }, [report, formYear, formMonth])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaveError(null)
    setSaveSuccess(false)
    const revNum = parseFloat(formRevenue)
    const expNum = parseFloat(formExpense)
    if (isNaN(revNum) || isNaN(expNum)) {
      setSaveError('Gelir ve gider hedefi geçerli sayı olmalıdır.')
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/finance/budget-variance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          year: formYear,
          month: formMonth,
          revenue_target_try: revNum,
          expense_target_try: expNum,
          notes: formNotes || null,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`)
      }
      setSaveSuccess(true)
      await fetchReport()
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-3 animate-pulse">
        <div className="grid grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => <div key={i} className="bg-[#f1f5f9] rounded h-16" />)}
        </div>
        <div className="bg-[#f1f5f9] rounded h-64" />
      </div>
    )
  }

  if (error || !report) {
    return (
      <div className="bg-white border border-[#e2e8f0] rounded p-6 text-center text-xs text-[#94a3b8]">
        {error ?? 'Bütçe raporu yüklenemedi.'}
        <button
          onClick={fetchReport}
          className="ml-2 text-brand-light font-semibold hover:underline"
        >
          Yeniden Dene
        </button>
      </div>
    )
  }

  const badge = overallStatusBadge(report.overall_status)

  return (
    <div className="space-y-5">

      {/* Budget Tracker — primary content */}
      {companyId && <BudgetTrackerClient companyId={companyId} />}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-black text-[#0f172a]">Bütçe vs Gerçekleşen</h2>
          <p className="text-xs text-[#94a3b8] mt-0.5">12 aylık bütçe hedefleri ve varyans analizi</p>
        </div>
        <span className={`text-xs font-black px-3 py-1.5 rounded border ${badge.cls}`}>
          {badge.label}
        </span>
      </div>

      {/* YTD Summary strip */}
      <div className="grid grid-cols-3 gap-3">
        {/* YTD Revenue */}
        <div className="bg-white border border-[#e2e8f0] rounded px-4 py-3 shadow-sm">
          <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-1">
            YTD Gelir
          </div>
          <div className="text-xl font-black tabular-nums text-[#0f172a]">
            {fmtTRY(report.ytd_revenue_actual)}
          </div>
          {report.ytd_revenue_budget !== null && (
            <>
              <div className="text-[10px] text-[#94a3b8] mt-0.5">
                Hedef: {fmtTRY(report.ytd_revenue_budget)}
              </div>
              {report.ytd_revenue_variance_pct !== null && (
                <div className={`text-xs font-bold mt-0.5 ${
                  report.ytd_revenue_variance_pct >= 0 ? 'text-pos-text' : 'text-neg-text'
                }`}>
                  {varPctSign(report.ytd_revenue_variance_pct)}
                </div>
              )}
            </>
          )}
          {report.ytd_revenue_budget === null && (
            <div className="text-[10px] text-[#94a3b8] mt-0.5">Hedef belirlenmedi</div>
          )}
        </div>

        {/* YTD Expense */}
        <div className="bg-white border border-[#e2e8f0] rounded px-4 py-3 shadow-sm">
          <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-1">
            YTD Gider
          </div>
          <div className="text-xl font-black tabular-nums text-[#0f172a]">
            {fmtTRY(report.ytd_expense_actual)}
          </div>
          {report.ytd_expense_budget !== null && (
            <>
              <div className="text-[10px] text-[#94a3b8] mt-0.5">
                Hedef: {fmtTRY(report.ytd_expense_budget)}
              </div>
              {report.ytd_expense_variance_pct !== null && (
                <div className={`text-xs font-bold mt-0.5 ${
                  report.ytd_expense_variance_pct <= 0 ? 'text-pos-text' : 'text-neg-text'
                }`}>
                  {varPctSign(report.ytd_expense_variance_pct)}
                </div>
              )}
            </>
          )}
          {report.ytd_expense_budget === null && (
            <div className="text-[10px] text-[#94a3b8] mt-0.5">Hedef belirlenmedi</div>
          )}
        </div>

        {/* YTD Gross Profit */}
        <div className="bg-white border border-[#e2e8f0] rounded px-4 py-3 shadow-sm">
          <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-1">
            YTD Brüt Kâr
          </div>
          <div className={`text-xl font-black tabular-nums ${
            report.ytd_gross_profit_actual >= 0 ? 'text-pos-text' : 'text-neg-text'
          }`}>
            {fmtTRY(report.ytd_gross_profit_actual)}
          </div>
          {report.ytd_gross_profit_budget !== null && (
            <div className="text-[10px] text-[#94a3b8] mt-0.5">
              Hedef: {fmtTRY(report.ytd_gross_profit_budget)}
            </div>
          )}
          {report.ytd_gross_profit_budget === null && (
            <div className="text-[10px] text-[#94a3b8] mt-0.5">Hedef belirlenmedi</div>
          )}
        </div>
      </div>

      {/* No budget callout */}
      {!report.has_any_budget && (
        <div className="bg-[#f8fafc] border border-[#e2e8f0] rounded px-4 py-3 text-xs text-[#64748b]">
          Henüz hiç bütçe hedefi girilmemiş.
          {isAdmin
            ? ' Aşağıdaki formdan aylık hedeflerinizi ekleyebilirsiniz.'
            : ' Yönetici bütçe hedefleri girdiğinde burada görünecek.'}
        </div>
      )}

      {/* 12-month variance table */}
      <div className="bg-white border border-[#e2e8f0] rounded shadow-sm overflow-x-auto">
        <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] px-4 pt-4 pb-2">
          Aylık Varyans (Son 12 Ay)
        </div>
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-[#f1f5f9]">
              <th className="text-left px-4 py-2 font-semibold text-[#64748b]">Dönem</th>
              <th className="text-right px-3 py-2 font-semibold text-[#64748b]">Gelir (G)</th>
              <th className="text-right px-3 py-2 font-semibold text-[#64748b]">Hedef (G)</th>
              <th className="text-right px-3 py-2 font-semibold text-[#64748b]">Varyans (G)</th>
              <th className="text-right px-3 py-2 font-semibold text-[#64748b]">Gider (G)</th>
              <th className="text-right px-3 py-2 font-semibold text-[#64748b]">Hedef (Gr)</th>
              <th className="text-right px-3 py-2 font-semibold text-[#64748b]">Varyans (Gr)</th>
            </tr>
          </thead>
          <tbody>
            {report.months.map(m => (
              <tr
                key={`${m.year}-${m.month}`}
                className="border-b border-[#f8fafc] hover:bg-[#f8fafc] transition-colors"
              >
                <td className="px-4 py-2 font-semibold text-[#334155]">{m.label}</td>

                {/* Revenue actual */}
                <td className="px-3 py-2 text-right tabular-nums text-[#0f172a]">
                  {fmtTRY(m.actual_revenue_try)}
                </td>

                {/* Revenue budget */}
                <td className="px-3 py-2 text-right tabular-nums text-[#64748b]">
                  {m.budget_revenue_try !== null ? fmtTRY(m.budget_revenue_try) : '—'}
                </td>

                {/* Revenue variance */}
                <td className={`px-3 py-2 text-right tabular-nums ${revenueStatusColor(m.revenue_status)}`}>
                  {m.revenue_variance_pct !== null
                    ? varPctSign(m.revenue_variance_pct)
                    : varSign(m.revenue_variance_try)}
                </td>

                {/* Expense actual */}
                <td className="px-3 py-2 text-right tabular-nums text-[#0f172a]">
                  {fmtTRY(m.actual_expense_try)}
                </td>

                {/* Expense budget */}
                <td className="px-3 py-2 text-right tabular-nums text-[#64748b]">
                  {m.budget_expense_try !== null ? fmtTRY(m.budget_expense_try) : '—'}
                </td>

                {/* Expense variance */}
                <td className={`px-3 py-2 text-right tabular-nums ${expenseStatusColor(m.expense_status)}`}>
                  {m.expense_variance_pct !== null
                    ? varPctSign(m.expense_variance_pct)
                    : varSign(m.expense_variance_try)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Expense Forecast panel */}
      <ExpenseForecastPanel />

      {/* 3-Way Variance Analysis */}
      <VarianceAnalysisPanel />

      {/* Admin budget entry form */}
      {isAdmin && (
        <div className="bg-white border border-[#e2e8f0] rounded p-4 shadow-sm">
          <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-3">
            Bütçe Hedefi Gir / Güncelle
          </div>
          <form onSubmit={handleSave} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              {/* Year */}
              <div>
                <label className="block text-[10px] font-semibold text-[#64748b] mb-1">Yıl</label>
                <input
                  type="number"
                  min={2020}
                  max={2100}
                  value={formYear}
                  onChange={e => setFormYear(parseInt(e.target.value) || now.getFullYear())}
                  className="w-full border border-[#e2e8f0] rounded px-3 py-1.5 text-xs text-[#0f172a] focus:outline-none focus:ring-1 focus:ring-brand-light"
                />
              </div>
              {/* Month */}
              <div>
                <label className="block text-[10px] font-semibold text-[#64748b] mb-1">Ay</label>
                <select
                  value={formMonth}
                  onChange={e => setFormMonth(parseInt(e.target.value))}
                  className="w-full border border-[#e2e8f0] rounded px-3 py-1.5 text-xs text-[#0f172a] focus:outline-none focus:ring-1 focus:ring-brand-light"
                >
                  {[
                    'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
                    'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
                  ].map((name, i) => (
                    <option key={i + 1} value={i + 1}>{name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {/* Revenue target */}
              <div>
                <label className="block text-[10px] font-semibold text-[#64748b] mb-1">
                  Gelir Hedefi (₺)
                </label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={formRevenue}
                  onChange={e => setFormRevenue(e.target.value)}
                  placeholder="0.00"
                  className="w-full border border-[#e2e8f0] rounded px-3 py-1.5 text-xs text-[#0f172a] focus:outline-none focus:ring-1 focus:ring-brand-light"
                  required
                />
              </div>
              {/* Expense target */}
              <div>
                <label className="block text-[10px] font-semibold text-[#64748b] mb-1">
                  Gider Hedefi (₺)
                </label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={formExpense}
                  onChange={e => setFormExpense(e.target.value)}
                  placeholder="0.00"
                  className="w-full border border-[#e2e8f0] rounded px-3 py-1.5 text-xs text-[#0f172a] focus:outline-none focus:ring-1 focus:ring-brand-light"
                  required
                />
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-[10px] font-semibold text-[#64748b] mb-1">
                Notlar (isteğe bağlı)
              </label>
              <input
                type="text"
                value={formNotes}
                onChange={e => setFormNotes(e.target.value)}
                placeholder="Bütçe notu..."
                className="w-full border border-[#e2e8f0] rounded px-3 py-1.5 text-xs text-[#0f172a] focus:outline-none focus:ring-1 focus:ring-brand-light"
              />
            </div>

            {/* Error / success */}
            {saveError && (
              <p className="text-xs text-neg-text">{saveError}</p>
            )}
            {saveSuccess && (
              <p className="text-xs text-pos-text">Bütçe hedefi kaydedildi.</p>
            )}

            <button
              type="submit"
              disabled={saving}
              className="bg-brand-light text-white text-xs font-black px-4 py-2 rounded hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {saving ? 'Kaydediliyor...' : 'Kaydet'}
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
