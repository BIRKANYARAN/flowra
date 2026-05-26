'use client'
// ── BudgetTab — Bütçe vs Gerçekleşen ────────────────────────────────────────
//
// Client component: fetches budget-variance report and shows:
//   - YTD summary strip
//   - 12-month variance table with color coding
//   - Inline form for admins to enter/update current-month budget
//
// Color coding:
//   Revenue — green = on_track/above, red = below, gray = no_budget
//   Expense  — green = under_budget/on_budget, red = over_budget, gray = no_budget

import { useState, useEffect, useCallback } from 'react'
import { usePermissions } from '@/lib/workspace-context'
import { fmtTRY, fmtPct } from '@/lib/format'
import type { BudgetVarianceReport, MonthlyVariance } from '@/lib/services/finance/budget-variance.service'

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

// ── Main component ────────────────────────────────────────────────────────────

export function BudgetTab() {
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
