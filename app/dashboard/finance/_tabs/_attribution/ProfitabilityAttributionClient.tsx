'use client'

// ─────────────────────────────────────────────────────────────────────────────
// ProfitabilityAttributionClient
//
// Kârlılık Kaynağı Analizi — multi-dimensional profitability attribution.
//
// Displays:
//   - Summary: overall margin, Gini coefficient, Pareto category count
//   - By-category Pareto table: sorted by margin, Pareto flag, margin lift vs avg
//   - Profit drag section: categories dragging down overall margin
//   - Monthly time series: 12-month table with MoM changes, peak/trough markers
// ─────────────────────────────────────────────────────────────────────────────

import { useQuery }        from '@tanstack/react-query'
import { fmtTRY, fmtPct }  from '@/lib/format'

// ── API response shape ────────────────────────────────────────────────────────

interface CategoryRow {
  name: string
  revenue: number
  margin: number
  revenue_pct: number
  margin_pct: number | null
  cumulative_revenue_pct: number
  is_pareto_80: boolean
}

interface MonthRow {
  month: string
  revenue: number
  gross_margin: number
  margin_pct: number | null
  revenue_mom_pct: number | null
  margin_mom_pct: number | null
  is_peak_month: boolean
  is_trough_month: boolean
}

interface DragRow {
  name: string
  margin_pct: number | null
  revenue: number
  revenue_pct: number | null
  drag_magnitude: number | null
}

interface AttributionReport {
  by_category: CategoryRow[]
  by_month: MonthRow[]
  overall_margin_pct: number | null
  gini_by_category: number | null
  profit_drags: DragRow[]
  summary: {
    pareto_80_category_count: number
    total_categories: number
    best_month: string | null
    worst_month: string | null
    margin_volatility_pct: number | null
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtMonth(ym: string): string {
  if (!ym || ym.length < 7) return ym
  const [y, m] = ym.split('-')
  const months = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara']
  const idx = parseInt(m, 10) - 1
  return `${months[idx] ?? m} ${y}`
}

function fmtPctSigned(v: number | null): string {
  if (v === null) return '—'
  const sign = v > 0 ? '+' : ''
  return `${sign}${fmtPct(v)}`
}

function giniLabel(g: number | null): string {
  if (g === null) return '—'
  if (g < 0.3) return 'Dengeli'
  if (g < 0.6) return 'Orta'
  return 'Yoğunlaşmış'
}

function giniColor(g: number | null): string {
  if (g === null) return 'text-[#94a3b8]'
  if (g < 0.3) return 'text-pos-text'
  if (g < 0.6) return 'text-warn-text'
  return 'text-neg'
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SummaryCards({ report }: { report: AttributionReport }) {
  const { overall_margin_pct, gini_by_category, summary } = report

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
      {/* Overall margin */}
      <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft p-4">
        <div className="text-[9px] font-bold uppercase tracking-wider text-[#94a3b8] mb-1">
          Genel Brüt Marj
        </div>
        <div className={`text-lg font-black tabular-nums ${
          overall_margin_pct !== null && overall_margin_pct >= 0 ? 'text-pos-text' : 'text-neg'
        }`}>
          {overall_margin_pct !== null ? fmtPct(overall_margin_pct) : '—'}
        </div>
      </div>

      {/* Gini */}
      <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft p-4">
        <div className="text-[9px] font-bold uppercase tracking-wider text-[#94a3b8] mb-1">
          Gini Katsayısı
        </div>
        <div className={`text-lg font-black tabular-nums ${giniColor(gini_by_category)}`}>
          {gini_by_category !== null ? gini_by_category.toFixed(2) : '—'}
        </div>
        <div className="text-[9px] text-[#94a3b8] mt-0.5">
          {giniLabel(gini_by_category)}
        </div>
      </div>

      {/* Pareto */}
      <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft p-4">
        <div className="text-[9px] font-bold uppercase tracking-wider text-[#94a3b8] mb-1">
          Pareto 80% Kategorisi
        </div>
        <div className="text-lg font-black tabular-nums text-[#0f172a]">
          {summary.pareto_80_category_count}
          <span className="text-[#94a3b8] text-xs font-semibold">
            /{summary.total_categories}
          </span>
        </div>
        <div className="text-[9px] text-[#94a3b8] mt-0.5">Kârın %80&apos;ini</div>
      </div>

      {/* Volatility */}
      <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft p-4">
        <div className="text-[9px] font-bold uppercase tracking-wider text-[#94a3b8] mb-1">
          Marj Volatilitesi
        </div>
        <div className={`text-lg font-black tabular-nums ${
          summary.margin_volatility_pct !== null && summary.margin_volatility_pct > 10
            ? 'text-warn-text' : 'text-[#0f172a]'
        }`}>
          {summary.margin_volatility_pct !== null
            ? fmtPct(summary.margin_volatility_pct)
            : '—'}
        </div>
        <div className="text-[9px] text-[#94a3b8] mt-0.5">Aylık std sapma</div>
      </div>
    </div>
  )
}

function CategoryParetoTable({
  categories,
  overallMarginPct,
}: {
  categories: CategoryRow[]
  overallMarginPct: number | null
}) {
  if (categories.length === 0) {
    return (
      <div className="text-center py-8 text-[#94a3b8] text-sm">
        Kategori verisi bulunamadı.
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-collapse min-w-[640px]">
        <thead>
          <tr className="border-b border-[#e8eaef]">
            <th className="text-left py-2 pr-3 text-[10px] font-bold uppercase tracking-wide text-[#94a3b8]">
              Kategori
            </th>
            <th className="text-right py-2 px-2 text-[10px] font-bold uppercase tracking-wide text-[#94a3b8]">
              Ciro
            </th>
            <th className="text-right py-2 px-2 text-[10px] font-bold uppercase tracking-wide text-[#94a3b8]">
              Ciro %
            </th>
            <th className="text-right py-2 px-2 text-[10px] font-bold uppercase tracking-wide text-[#94a3b8]">
              Brüt Marj
            </th>
            <th className="text-right py-2 px-2 text-[10px] font-bold uppercase tracking-wide text-[#94a3b8]">
              Marj %
            </th>
            <th className="text-right py-2 px-2 text-[10px] font-bold uppercase tracking-wide text-[#94a3b8]">
              Marj Katkısı
            </th>
            <th className="text-center py-2 px-2 text-[10px] font-bold uppercase tracking-wide text-[#94a3b8]">
              Pareto
            </th>
          </tr>
        </thead>
        <tbody>
          {categories.map(cat => {
            const lift = overallMarginPct !== null && cat.margin_pct !== null
              ? cat.margin_pct - overallMarginPct
              : null

            return (
              <tr
                key={cat.name}
                className={`border-t border-[#f1f5f9] ${cat.is_pareto_80 ? 'bg-pos-light/30' : ''}`}
              >
                <td className="py-2 pr-3 font-semibold text-[#334155]">
                  {cat.name}
                </td>
                <td className="py-2 px-2 text-right tabular-nums text-[#1e293b]">
                  {fmtTRY(cat.revenue, 0)}
                </td>
                <td className="py-2 px-2 text-right tabular-nums text-[#64748b]">
                  {fmtPct(cat.revenue_pct)}
                </td>
                <td className="py-2 px-2 text-right tabular-nums text-[#1e293b]">
                  {fmtTRY(cat.margin, 0)}
                </td>
                <td className={`py-2 px-2 text-right tabular-nums font-bold ${
                  cat.margin_pct !== null && cat.margin_pct >= 0 ? 'text-pos-text' : 'text-neg'
                }`}>
                  {cat.margin_pct !== null ? fmtPct(cat.margin_pct) : '—'}
                </td>
                <td className={`py-2 px-2 text-right tabular-nums text-[10px] font-bold ${
                  lift === null ? 'text-[#94a3b8]'
                  : lift > 0 ? 'text-pos-text'
                  : 'text-neg'
                }`}>
                  {lift !== null ? fmtPctSigned(lift) : '—'}
                </td>
                <td className="py-2 px-2 text-center">
                  {cat.is_pareto_80 && (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-black bg-pos-light text-pos-text border border-pos-light">
                      TOP 80%
                    </span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function ProfitDragSection({ drags }: { drags: DragRow[] }) {
  if (drags.length === 0) {
    return (
      <div className="flex items-center gap-2 py-3 px-4 bg-pos-light rounded border border-pos-light">
        <span className="w-1.5 h-1.5 rounded-full bg-pos shrink-0" />
        <span className="text-xs text-pos-text font-semibold">
          Belirgin kârlılık sürükleyicisi tespit edilmedi.
        </span>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {drags.map(drag => (
        <div key={drag.name} className="flex items-center justify-between gap-3 bg-neg-light border border-neg-light rounded px-4 py-3">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-1.5 h-1.5 rounded-full bg-neg shrink-0" />
            <span className="text-xs font-black text-neg-text truncate">{drag.name}</span>
            {drag.revenue_pct !== null && (
              <span className="text-[10px] text-neg-text/70">
                (Ciro: {fmtPct(drag.revenue_pct)})
              </span>
            )}
          </div>
          <div className="shrink-0 text-right">
            <div className="text-xs font-black tabular-nums text-neg">
              {drag.margin_pct !== null ? fmtPct(drag.margin_pct) : 'Bilinmiyor'}
            </div>
            {drag.drag_magnitude !== null && (
              <div className="text-[9px] text-neg-text/70">
                -{fmtPct(drag.drag_magnitude)} puan
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

function MonthlyTimeSeriesTable({ months }: { months: MonthRow[] }) {
  if (months.length === 0) {
    return (
      <div className="text-center py-8 text-[#94a3b8] text-sm">
        Aylık veri bulunamadı.
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-collapse min-w-[640px]">
        <thead>
          <tr className="border-b border-[#e8eaef]">
            <th className="text-left py-2 pr-3 text-[10px] font-bold uppercase tracking-wide text-[#94a3b8]">
              Ay
            </th>
            <th className="text-right py-2 px-2 text-[10px] font-bold uppercase tracking-wide text-[#94a3b8]">
              Ciro
            </th>
            <th className="text-right py-2 px-2 text-[10px] font-bold uppercase tracking-wide text-[#94a3b8]">
              Brüt Kâr
            </th>
            <th className="text-right py-2 px-2 text-[10px] font-bold uppercase tracking-wide text-[#94a3b8]">
              Brüt Marj
            </th>
            <th className="text-right py-2 px-2 text-[10px] font-bold uppercase tracking-wide text-[#94a3b8]">
              Ciro AoA
            </th>
            <th className="text-right py-2 px-2 text-[10px] font-bold uppercase tracking-wide text-[#94a3b8]">
              Marj AoA
            </th>
            <th className="text-center py-2 px-2 text-[10px] font-bold uppercase tracking-wide text-[#94a3b8]">
              Not
            </th>
          </tr>
        </thead>
        <tbody>
          {months.map(m => (
            <tr
              key={m.month}
              className={`border-t border-[#f1f5f9] ${
                m.is_peak_month ? 'bg-pos-light/40'
                : m.is_trough_month ? 'bg-neg-light/40'
                : ''
              }`}
            >
              <td className="py-2 pr-3 font-semibold text-[#334155] whitespace-nowrap">
                {fmtMonth(m.month)}
              </td>
              <td className="py-2 px-2 text-right tabular-nums text-[#1e293b]">
                {fmtTRY(m.revenue, 0)}
              </td>
              <td className="py-2 px-2 text-right tabular-nums text-[#1e293b]">
                {fmtTRY(m.gross_margin, 0)}
              </td>
              <td className={`py-2 px-2 text-right tabular-nums font-bold ${
                m.margin_pct !== null && m.margin_pct >= 0 ? 'text-pos-text' : 'text-neg'
              }`}>
                {m.margin_pct !== null ? fmtPct(m.margin_pct) : '—'}
              </td>
              <td className={`py-2 px-2 text-right tabular-nums text-[10px] font-bold ${
                m.revenue_mom_pct === null ? 'text-[#94a3b8]'
                : m.revenue_mom_pct > 0 ? 'text-pos-text'
                : 'text-neg'
              }`}>
                {m.revenue_mom_pct !== null ? fmtPctSigned(m.revenue_mom_pct) : '—'}
              </td>
              <td className={`py-2 px-2 text-right tabular-nums text-[10px] font-bold ${
                m.margin_mom_pct === null ? 'text-[#94a3b8]'
                : m.margin_mom_pct > 0 ? 'text-pos-text'
                : 'text-neg'
              }`}>
                {m.margin_mom_pct !== null ? fmtPctSigned(m.margin_mom_pct) : '—'}
              </td>
              <td className="py-2 px-2 text-center">
                {m.is_peak_month && (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-black bg-pos-light text-pos-text border border-pos-light">
                    ZİRVE
                  </span>
                )}
                {m.is_trough_month && (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-black bg-neg-light text-neg border border-neg-light">
                    DİP
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  companyId: string
}

export function ProfitabilityAttributionClient({ companyId }: Props) {
  const { data, isLoading, isError } = useQuery<{ report: AttributionReport }>({
    queryKey: ['profitability-attribution', companyId],
    queryFn:  async () => {
      const res = await fetch('/api/finance/profitability-attribution')
      if (!res.ok) throw new Error('API hatası')
      return res.json()
    },
    staleTime: 1000 * 60 * 5,
  })

  if (isLoading) {
    return (
      <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft p-5 shadow-sm">
        <div className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8] mb-4">
          Kârlılık Kaynağı Analizi
        </div>
        <div className="animate-pulse space-y-3">
          <div className="grid grid-cols-4 gap-3">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-16 bg-[#f1f5f9] rounded" />
            ))}
          </div>
          <div className="h-48 bg-[#f1f5f9] rounded" />
        </div>
      </div>
    )
  }

  if (isError || !data?.report) {
    return (
      <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft p-5 shadow-sm">
        <div className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8] mb-2">
          Kârlılık Kaynağı Analizi
        </div>
        <div className="text-center py-6 text-[#94a3b8] text-sm">
          Veri yüklenirken hata oluştu.
        </div>
      </div>
    )
  }

  const report = data.report

  return (
    <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft p-5 shadow-sm space-y-5">
      {/* Header */}
      <div className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8]">
        Kârlılık Kaynağı Analizi
      </div>

      {/* Summary cards */}
      <SummaryCards report={report} />

      {/* By-category Pareto table */}
      <div>
        <div className="text-[10px] font-bold uppercase tracking-wide text-[#64748b] mb-3">
          Kategori Bazlı Kârlılık (Pareto)
        </div>
        <CategoryParetoTable
          categories={report.by_category}
          overallMarginPct={report.overall_margin_pct}
        />
      </div>

      {/* Profit drag section */}
      {report.profit_drags.length > 0 && (
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wide text-neg mb-2">
            Kârlılık Sürükleyicileri
          </div>
          <ProfitDragSection drags={report.profit_drags} />
        </div>
      )}

      {/* Monthly time series */}
      <div>
        <div className="text-[10px] font-bold uppercase tracking-wide text-[#64748b] mb-3">
          Aylık Kârlılık Trendi (Son 12 Ay)
        </div>
        {report.summary.best_month && (
          <div className="flex flex-wrap gap-3 mb-3">
            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-pos-text">
              <span className="w-1.5 h-1.5 rounded-full bg-pos shrink-0" />
              En iyi ay: {fmtMonth(report.summary.best_month)}
            </span>
            {report.summary.worst_month && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-neg">
                <span className="w-1.5 h-1.5 rounded-full bg-neg shrink-0" />
                En kötü ay: {fmtMonth(report.summary.worst_month)}
              </span>
            )}
          </div>
        )}
        <MonthlyTimeSeriesTable months={report.by_month} />
      </div>
    </div>
  )
}
