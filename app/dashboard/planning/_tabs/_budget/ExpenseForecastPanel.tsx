'use client'

// ── ExpenseForecastPanel — extracted verbatim from BudgetTab.tsx ──────────────
// Self-contained: own TanStack Query fetch + exclusive chip helpers. No behavior change.

import { useQuery } from '@tanstack/react-query'
import { fmtTRY, fmtPct } from '@/lib/format'
import type { ExpenseForecastReport } from '@/lib/services/finance/expense-forecast.service'

// ── Expense Forecast helpers ──────────────────────────────────────────────────

function trendChip(trend: 'growing' | 'stable' | 'declining'): JSX.Element {
  if (trend === 'growing') {
    return (
      <span className="inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded bg-neg-light text-neg-text">
        ↑ Artıyor
      </span>
    )
  }
  if (trend === 'declining') {
    return (
      <span className="inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded bg-pos-light text-pos-text">
        ↓ Düşüyor
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#f1f5f9] text-[#64748b]">
      → Stabil
    </span>
  )
}

function confidenceChip(confidence: 'high' | 'medium' | 'low'): JSX.Element {
  if (confidence === 'high') {
    return (
      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-pos-light text-pos-text">
        Yüksek
      </span>
    )
  }
  if (confidence === 'medium') {
    return (
      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-warn-light text-warn-text">
        Orta
      </span>
    )
  }
  return (
    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-[#fef2f2] text-neg-text">
      Düşük
    </span>
  )
}

async function fetchForecast(): Promise<ExpenseForecastReport> {
  const res = await fetch('/api/finance/expense-forecast')
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`)
  }
  const data = await res.json() as { report: ExpenseForecastReport }
  return data.report
}

export function ExpenseForecastPanel() {
  const { data: report, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['expense-forecast'],
    queryFn: fetchForecast,
    staleTime: 5 * 60 * 1000,
  })

  if (isLoading) {
    return (
      <div className="space-y-2 animate-pulse">
        <div className="bg-[#f1f5f9] rounded h-6 w-40" />
        <div className="bg-[#f1f5f9] rounded h-32" />
      </div>
    )
  }

  if (isError || !report) {
    return (
      <div className="bg-white border border-[#e2e8f0] rounded-xl shadow-soft p-4 text-xs text-[#94a3b8]">
        Gider tahmini yüklenemedi.
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
    <div className="bg-white border border-[#e2e8f0] rounded-xl shadow-soft shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <div>
          <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">
            Gider Tahmini
          </div>
          <div className="text-sm font-black text-[#0f172a] mt-0.5">
            Sonraki Ay Projeksiyon
          </div>
        </div>
        {/* Forecast month chip */}
        <span className="text-xs font-black px-3 py-1.5 rounded border bg-[#f8fafc] border-[#e2e8f0] text-[#334155]">
          {report.forecast_month_label}
        </span>
      </div>

      {/* Summary callout */}
      <div className="mx-4 mb-3 px-4 py-3 bg-[#f8fafc] border border-[#e2e8f0] rounded text-xs text-[#334155]">
        {report.summary_line}
      </div>

      {/* Category table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-[#f1f5f9]">
              <th className="text-left px-4 py-2 font-semibold text-[#64748b]">Kategori</th>
              <th className="text-right px-3 py-2 font-semibold text-[#64748b]">3A Ort.</th>
              <th className="text-right px-3 py-2 font-semibold text-[#64748b]">Tahmin</th>
              <th className="text-center px-3 py-2 font-semibold text-[#64748b]">Trend</th>
              <th className="text-center px-3 py-2 font-semibold text-[#64748b]">Güven</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {report.categories.map(cat => (
              <tr
                key={cat.category}
                className="border-b border-[#f8fafc] hover:bg-[#f8fafc] transition-colors"
              >
                <td className="px-4 py-2 font-semibold text-[#334155]">
                  {cat.category_label}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-[#64748b]">
                  {fmtTRY(cat.last_3m_avg)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums font-bold text-[#0f172a]">
                  {fmtTRY(cat.forecast_next_month)}
                </td>
                <td className="px-3 py-2 text-center">
                  {trendChip(cat.trend)}
                </td>
                <td className="px-3 py-2 text-center">
                  {confidenceChip(cat.confidence)}
                </td>
                <td className="px-3 py-2 text-center">
                  {cat.anomaly_flag && (
                    <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-neg-light text-neg-text">
                      Anomali
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          {/* Total row */}
          <tfoot>
            <tr className="border-t-2 border-[#e2e8f0] bg-[#f8fafc]">
              <td className="px-4 py-2 font-black text-[#0f172a]">Toplam</td>
              <td className="px-3 py-2 text-right tabular-nums font-bold text-[#334155]">
                {fmtTRY(report.categories.reduce((s, c) => s + c.last_3m_avg, 0))}
              </td>
              <td className="px-3 py-2 text-right tabular-nums font-black text-[#0f172a]">
                {fmtTRY(report.total_forecast)}
              </td>
              <td colSpan={3} />
            </tr>
            {/* Budget comparison row if available */}
            {report.budget_total !== undefined && (
              <tr className="border-t border-[#f1f5f9] bg-[#f8fafc]">
                <td className="px-4 py-2 font-semibold text-[#64748b]">Bütçe Hedefi</td>
                <td colSpan={2} className="px-3 py-2 text-right tabular-nums font-bold text-[#334155]">
                  {fmtTRY(report.budget_total)}
                </td>
                <td colSpan={3} className="px-3 py-2">
                  {report.budget_variance_pct !== undefined && (
                    <span className={`text-xs font-bold ${
                      report.budget_variance_pct > 0 ? 'text-neg-text' : 'text-pos-text'
                    }`}>
                      {report.budget_variance_pct > 0 ? '+' : ''}
                      {fmtPct(report.budget_variance_pct)} bütçeye göre
                    </span>
                  )}
                </td>
              </tr>
            )}
          </tfoot>
        </table>
      </div>
      <div className="px-4 py-2 text-[10px] text-[#94a3b8] border-t border-[#f1f5f9]">
        Son hesaplama: {new Date(report.computed_at).toLocaleString('tr-TR')}
      </div>
    </div>
  )
}
