// ── SeasonalitySection — extracted verbatim from OverviewTab.tsx ─────────────
// Pure presentational (props → JSX); no hooks, no data fetch. No behavior change.

import type { SeasonalityReport } from '@/lib/services/finance/seasonality.service'

// ── Seasonality section ───────────────────────────────────────────────────────

function SeasonalityStrengthBadge({ strength }: { strength: SeasonalityReport['seasonality_strength'] }) {
  const cfg: Record<SeasonalityReport['seasonality_strength'], { label: string; colors: string }> = {
    strong:            { label: 'Güçlü Mevsimsellik',     colors: 'bg-warn-light border-warn/30 text-warn-text' },
    moderate:          { label: 'Orta Mevsimsellik',       colors: 'bg-blue-50 border-blue-200 text-blue-700' },
    weak:              { label: 'Zayıf Mevsimsellik',      colors: 'bg-pos-light border-pos-light text-pos-text' },
    insufficient_data: { label: 'Yetersiz Veri',           colors: 'bg-[#f1f5f9] border-[#e2e8f0] text-[#64748b]' },
  }
  const { label, colors } = cfg[strength]
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[9px] font-black uppercase tracking-wide ${colors}`}>
      {label}
    </span>
  )
}

export function SeasonalitySection({ report }: { report: SeasonalityReport }) {
  // Bar chart: height proportional to seasonal_index, centered at 100
  const maxIndex = Math.max(...report.monthly_data.map(d => d.seasonal_index), 100)
  const minIndex = Math.min(...report.monthly_data.map(d => d.seasonal_index), 100)
  // Normalize for display: we scale each bar 0-100% relative to max
  // Baseline (index=100) is shown as a reference line

  return (
    <div>
      <div className="text-[9px] font-black uppercase tracking-widest text-[#94a3b8] mb-1.5">Gelir Mevsimselliği</div>
      <div className="bg-white border border-[#e2e8f0] rounded shadow-sm overflow-hidden">

        {/* Header strip */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#f1f5f9] bg-[#f8fafc]">
          <SeasonalityStrengthBadge strength={report.seasonality_strength} />
          <span className="text-[9px] text-[#94a3b8]">
            {report.years_analyzed} yıl veri analiz edildi
          </span>
        </div>

        {/* 12-month bar chart */}
        <div className="px-4 pt-4 pb-2">
          <div className="relative">
            {/* Baseline at 100 (average line) */}
            <div
              className="absolute left-0 right-0 border-t border-dashed border-[#cbd5e1] pointer-events-none"
              style={{
                bottom: `${maxIndex > 0 ? Math.round((100 / maxIndex) * 64) : 64}px`,
              }}
            />
            <div className="flex items-end gap-1 h-16">
              {report.monthly_data.map((md) => {
                const barH = maxIndex > 0
                  ? Math.max(2, Math.round((md.seasonal_index / maxIndex) * 64))
                  : 8
                const isAboveAvg = md.seasonal_index >= 100
                const isPeak     = md.month_number === report.peak_month_number
                const isTrough   = md.month_number === report.trough_month_number
                const barColor   = isPeak
                  ? 'bg-pos'
                  : isTrough
                  ? 'bg-neg'
                  : isAboveAvg
                  ? 'bg-brand-light'
                  : 'bg-[#cbd5e1]'
                return (
                  <div
                    key={md.month_number}
                    className="flex-1 flex flex-col items-center gap-0.5"
                    title={`${md.month_name}: endeks ${md.seasonal_index.toFixed(0)}`}
                  >
                    <div className="w-full flex items-end justify-center" style={{ height: '64px' }}>
                      <div
                        className={`w-full rounded-sm ${barColor} opacity-90 transition-all`}
                        style={{ height: `${barH}px` }}
                      />
                    </div>
                    <span className="text-[7px] text-[#94a3b8] font-medium truncate w-full text-center leading-none">
                      {md.month_name.slice(0, 3)}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
          <div className="flex items-center justify-between mt-1 text-[9px] text-[#94a3b8]">
            <span>Mevsimsel Endeks (100 = ortalama)</span>
            <span>
              Min: {Math.round(minIndex)} · Max: {Math.round(maxIndex)}
            </span>
          </div>
        </div>

        {/* Peak / Trough callout */}
        {(report.peak_month_name || report.trough_month_name) && (
          <div className="px-4 pb-2 flex gap-3">
            {report.peak_month_name && (
              <div className="flex items-center gap-1.5 bg-pos-light rounded px-2.5 py-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-pos shrink-0" />
                <span className="text-[10px] font-semibold text-pos-text">
                  Pik: {report.peak_month_name} (endeks {report.monthly_data.find(d => d.month_number === report.peak_month_number)?.seasonal_index.toFixed(0)})
                </span>
              </div>
            )}
            {report.trough_month_name && (
              <div className="flex items-center gap-1.5 bg-neg-light rounded px-2.5 py-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-neg shrink-0" />
                <span className="text-[10px] font-semibold text-neg-text">
                  Dip: {report.trough_month_name} (endeks {report.monthly_data.find(d => d.month_number === report.trough_month_number)?.seasonal_index.toFixed(0)})
                </span>
              </div>
            )}
          </div>
        )}

        {/* Recommendation */}
        <div className="px-4 py-3 border-t border-[#f1f5f9] bg-blue-50/30">
          <p className="text-[11px] text-[#334155] leading-snug">
            <span className="text-[#94a3b8] mr-1.5">—</span>{report.recommendation}
          </p>
        </div>
      </div>
    </div>
  )
}
