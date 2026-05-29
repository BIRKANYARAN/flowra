'use client'

// ─────────────────────────────────────────────────────────────────────────────
// BreakevenAnalysisClient
//
// Company-level and per-product breakeven analysis dashboard.
//
// Features:
//   - 4 KPI cells: breakeven revenue, current revenue, margin of safety %,
//     operating leverage
//   - Margin of safety health badge
//   - Visual breakeven chart (dual-bar: fixed costs vs contribution margin)
//   - Product breakeven table: product, CM%, breakeven units, current units,
//     above/below BEP indicator
//   - Target revenue cards: 10% profit, 20% profit
// ─────────────────────────────────────────────────────────────────────────────

import { useQuery }    from '@tanstack/react-query'
import { fmtTRY, fmtPct } from '@/lib/format'
import type {
  BreakevenAnalysisReport,
  ProductBreakeven,
} from '@/lib/services/finance/breakeven-analysis.service'

// ── Helpers ───────────────────────────────────────────────────────────────────

type MosHealth = BreakevenAnalysisReport['margin_of_safety_health']
type LevRisk   = BreakevenAnalysisReport['operating_leverage_risk']

const MOS_HEALTH_CONFIG: Record<MosHealth, { label: string; style: string }> = {
  excellent:      { label: 'Mükemmel (≥40%)',    style: 'bg-green-100 text-green-800 border-green-200' },
  good:           { label: 'İyi (≥25%)',          style: 'bg-teal-100 text-teal-800 border-teal-200' },
  adequate:       { label: 'Yeterli (≥15%)',      style: 'bg-blue-100 text-blue-800 border-blue-200' },
  thin:           { label: 'İnce (≥5%)',          style: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
  critical:       { label: 'Kritik (<5%)',         style: 'bg-orange-100 text-orange-800 border-orange-200' },
  below_breakeven:{ label: 'Zarar Bölgesi',       style: 'bg-red-100 text-red-800 border-red-200' },
}

const LEV_RISK_CONFIG: Record<LevRisk, { label: string; style: string }> = {
  high_risk: { label: 'Yüksek Risk (>5)',  style: 'text-red-700' },
  elevated:  { label: 'Yüksek (>3)',       style: 'text-orange-700' },
  moderate:  { label: 'Orta (>2)',         style: 'text-yellow-700' },
  low:       { label: 'Düşük (≤2)',        style: 'text-green-700' },
  na:        { label: 'N/A',               style: 'text-slate-500' },
}

// ── Sub-components ────────────────────────────────────────────────────────────

function MosHealthBadge({ health }: { health: MosHealth }) {
  const c = MOS_HEALTH_CONFIG[health]
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] font-bold ${c.style}`}>
      {c.label}
    </span>
  )
}

function KpiCell({
  label,
  value,
  sub,
}: {
  label: string
  value: string
  sub?: React.ReactNode
}) {
  return (
    <div className="bg-white border border-[#e2e8f0] rounded px-4 py-4 shadow-sm">
      <div className="text-[9px] font-black uppercase tracking-widest text-[#94a3b8] mb-1">{label}</div>
      <div className="text-xl font-black tabular-nums text-[#0f172a]">{value}</div>
      {sub && <div className="mt-1.5">{sub}</div>}
    </div>
  )
}

// Dual-bar chart: Fixed Costs vs Contribution Margin
function BreakevenChart({
  fixedCosts,
  contributionMargin,
  breakevenRevenue,
  currentRevenue,
}: {
  fixedCosts: number
  contributionMargin: number
  breakevenRevenue: number | null
  currentRevenue: number
}) {
  const maxVal  = Math.max(fixedCosts, contributionMargin, 1)
  const fixedPct = Math.min(100, (fixedCosts / maxVal) * 100)
  const cmPct    = Math.min(100, (Math.max(0, contributionMargin) / maxVal) * 100)

  const coversPct = breakevenRevenue !== null && breakevenRevenue > 0 && currentRevenue > 0
    ? Math.min(100, (currentRevenue / breakevenRevenue) * 100)
    : null

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {/* Fixed costs bar */}
        <div>
          <div className="flex justify-between mb-1">
            <span className="text-[10px] text-[#64748b] font-semibold">Sabit Maliyetler</span>
            <span className="text-[10px] tabular-nums text-[#0f172a] font-bold">{fmtTRY(fixedCosts, 0)}</span>
          </div>
          <div className="w-full h-4 bg-[#f1f5f9] rounded-full overflow-hidden">
            <div
              className="h-full bg-[#ef4444] rounded-full transition-all duration-500"
              style={{ width: `${fixedPct}%` }}
            />
          </div>
        </div>

        {/* Contribution margin bar */}
        <div>
          <div className="flex justify-between mb-1">
            <span className="text-[10px] text-[#64748b] font-semibold">Katkı Marjı</span>
            <span className="text-[10px] tabular-nums text-[#0f172a] font-bold">{fmtTRY(contributionMargin, 0)}</span>
          </div>
          <div className="w-full h-4 bg-[#f1f5f9] rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                contributionMargin >= fixedCosts ? 'bg-[#10b981]' : 'bg-[#f59e0b]'
              }`}
              style={{ width: `${cmPct}%` }}
            />
          </div>
        </div>
      </div>

      {/* Breakeven coverage */}
      {coversPct !== null && (
        <div className="pt-2 border-t border-[#f1f5f9]">
          <div className="flex justify-between mb-1">
            <span className="text-[10px] text-[#64748b] font-semibold">BEP Karşılama</span>
            <span className="text-[10px] tabular-nums font-bold text-[#0f172a]">
              %{coversPct.toFixed(0)}
            </span>
          </div>
          <div className="w-full h-2 bg-[#f1f5f9] rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                coversPct >= 100 ? 'bg-green-500' : 'bg-orange-400'
              }`}
              style={{ width: `${coversPct}%` }}
            />
          </div>
          <div className="text-[9px] text-[#94a3b8] mt-1">
            Mevcut ciro / başabaş noktası cirosu
          </div>
        </div>
      )}
    </div>
  )
}

// Product breakeven row
function ProductRow({ p }: { p: ProductBreakeven }) {
  return (
    <tr className="border-b border-[#f1f5f9] hover:bg-[#f8fafc]">
      <td className="py-2 px-3 text-[11px] text-[#1e293b] font-medium max-w-[140px] truncate">
        {p.product_name}
      </td>
      <td className="py-2 px-3 text-[11px] tabular-nums text-right text-[#64748b]">
        %{p.contribution_margin_pct.toFixed(1)}
      </td>
      <td className="py-2 px-3 text-[11px] tabular-nums text-right text-[#64748b]">
        {p.breakeven_units !== null ? p.breakeven_units.toFixed(0) : '—'}
      </td>
      <td className="py-2 px-3 text-[11px] tabular-nums text-right text-[#1e293b] font-semibold">
        {p.current_units_sold.toFixed(0)}
      </td>
      <td className="py-2 px-3 text-center">
        {p.is_above_breakeven ? (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-green-700">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
            Üstünde
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-red-700">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block" />
            Altında
          </span>
        )}
      </td>
      <td className="py-2 px-3 text-[11px] tabular-nums text-right text-[#64748b]">
        {fmtTRY(p.current_revenue, 0)}
      </td>
    </tr>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

interface Props {
  companyId: string
}

export function BreakevenAnalysisClient({ companyId }: Props) {
  const { data, isLoading, isError } = useQuery<{ report: BreakevenAnalysisReport }>({
    queryKey: ['breakeven-analysis', companyId],
    queryFn:  async () => {
      const res = await fetch('/api/finance/breakeven-analysis')
      if (!res.ok) throw new Error('Başabaş analizi verisi yüklenemedi')
      return res.json()
    },
    staleTime: 5 * 60 * 1000,
  })

  // ── Loading ────────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-4 gap-3">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className="bg-white border border-[#e2e8f0] rounded p-4 animate-pulse">
              <div className="h-2 bg-[#f1f5f9] rounded w-24 mb-2" />
              <div className="h-6 bg-[#f1f5f9] rounded w-32" />
            </div>
          ))}
        </div>
        <div className="bg-white border border-[#e2e8f0] rounded p-6 animate-pulse">
          <div className="h-3 bg-[#f1f5f9] rounded w-40 mb-4" />
          <div className="h-32 bg-[#f1f5f9] rounded" />
        </div>
      </div>
    )
  }

  // ── Error ──────────────────────────────────────────────────────────────────
  if (isError || !data?.report) {
    return (
      <div className="bg-white border border-[#e2e8f0] rounded p-6 shadow-sm text-center">
        <p className="text-sm text-[#64748b] font-medium">
          Başabaş analizi verisi yüklenirken hata oluştu.
        </p>
      </div>
    )
  }

  const r = data.report
  const levRiskCfg = LEV_RISK_CONFIG[r.operating_leverage_risk]

  return (
    <div className="space-y-4">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">
            Başabaş Analizi — {r.period}
          </h3>
          <p className="text-[10px] text-[#94a3b8] mt-0.5">
            {r.analysis_days} günlük dönem analizi
          </p>
        </div>
        <MosHealthBadge health={r.margin_of_safety_health} />
      </div>

      {/* ── 4 KPI cells ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-4 gap-3">
        <KpiCell
          label="Başabaş Noktası"
          value={r.breakeven_revenue_try !== null ? fmtTRY(r.breakeven_revenue_try, 0) : '—'}
          sub={
            <span className="text-[9px] text-[#94a3b8]">
              {r.days_to_breakeven !== null
                ? `${r.days_to_breakeven.toFixed(0)} günde ulaşılır`
                : 'Hesaplanamıyor'}
            </span>
          }
        />
        <KpiCell
          label="Mevcut Ciro"
          value={fmtTRY(r.total_revenue_try, 0)}
          sub={
            <span className="text-[9px] text-[#94a3b8]">
              KM: %{r.contribution_margin_pct.toFixed(1)}
            </span>
          }
        />
        <KpiCell
          label="Güvenlik Marjı"
          value={`%${r.margin_of_safety_pct.toFixed(1)}`}
          sub={
            <span className="text-[9px] text-[#94a3b8]">
              {fmtTRY(r.margin_of_safety_try, 0)}
            </span>
          }
        />
        <KpiCell
          label="Faaliyet Kaldıracı"
          value={r.operating_leverage !== null ? r.operating_leverage.toFixed(2) + 'x' : '—'}
          sub={
            <span className={`text-[9px] font-bold ${levRiskCfg.style}`}>
              {levRiskCfg.label}
            </span>
          }
        />
      </div>

      <div className="grid grid-cols-12 gap-4">

        {/* ── Left: chart + targets ────────────────────────────────────────── */}
        <div className="col-span-5 space-y-4">

          {/* Breakeven chart */}
          <div className="bg-white border border-[#e2e8f0] rounded p-5 shadow-sm">
            <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-4">
              Maliyet vs Katkı Görünümü
            </div>
            <BreakevenChart
              fixedCosts={r.fixed_costs_try}
              contributionMargin={r.contribution_margin_try}
              breakevenRevenue={r.breakeven_revenue_try}
              currentRevenue={r.total_revenue_try}
            />
          </div>

          {/* Target revenue cards */}
          <div className="bg-white border border-[#e2e8f0] rounded p-5 shadow-sm">
            <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-3">
              Hedef Ciro
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[10px] font-semibold text-[#64748b]">%10 Kar Hedefi</div>
                  <div className="text-[9px] text-[#94a3b8]">Ciro × 10% net kar için gereken ciro</div>
                </div>
                <div className="text-right">
                  <div className="text-base font-black tabular-nums text-[#0f172a]">
                    {r.revenue_for_10pct_profit !== null ? fmtTRY(r.revenue_for_10pct_profit, 0) : '—'}
                  </div>
                </div>
              </div>
              <div className="border-t border-[#f1f5f9] pt-3 flex items-center justify-between">
                <div>
                  <div className="text-[10px] font-semibold text-[#64748b]">%20 Kar Hedefi</div>
                  <div className="text-[9px] text-[#94a3b8]">Ciro × 20% net kar için gereken ciro</div>
                </div>
                <div className="text-right">
                  <div className="text-base font-black tabular-nums text-[#0f172a]">
                    {r.revenue_for_20pct_profit !== null ? fmtTRY(r.revenue_for_20pct_profit, 0) : '—'}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Right: product table ──────────────────────────────────────────── */}
        <div className="col-span-7">
          <div className="bg-white border border-[#e2e8f0] rounded shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-[#f1f5f9]">
              <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">
                Ürün Bazlı Başabaş Analizi
              </div>
              <div className="text-[9px] text-[#94a3b8] mt-0.5">
                Ciroya göre ilk {r.product_breakevenss.length} ürün
              </div>
            </div>

            {r.product_breakevenss.length === 0 ? (
              <div className="px-5 py-10 text-center">
                <p className="text-[11px] text-[#94a3b8]">Ürün satış verisi bulunamadı.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-[#f8fafc] border-b border-[#e2e8f0]">
                      <th className="py-2 px-3 text-left text-[9px] font-black uppercase tracking-widest text-[#94a3b8]">Ürün</th>
                      <th className="py-2 px-3 text-right text-[9px] font-black uppercase tracking-widest text-[#94a3b8]">KM%</th>
                      <th className="py-2 px-3 text-right text-[9px] font-black uppercase tracking-widest text-[#94a3b8]">BEP Adet</th>
                      <th className="py-2 px-3 text-right text-[9px] font-black uppercase tracking-widest text-[#94a3b8]">Sat. Adet</th>
                      <th className="py-2 px-3 text-center text-[9px] font-black uppercase tracking-widest text-[#94a3b8]">Durum</th>
                      <th className="py-2 px-3 text-right text-[9px] font-black uppercase tracking-widest text-[#94a3b8]">Ciro</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.product_breakevenss.map(p => (
                      <ProductRow key={p.product_id} p={p} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Summary row ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white border border-[#e2e8f0] rounded px-4 py-3 shadow-sm">
          <div className="text-[9px] font-black uppercase tracking-widest text-[#94a3b8] mb-1">Sabit Maliyetler</div>
          <div className="text-base font-black tabular-nums text-[#0f172a]">{fmtTRY(r.fixed_costs_try, 0)}</div>
        </div>
        <div className="bg-white border border-[#e2e8f0] rounded px-4 py-3 shadow-sm">
          <div className="text-[9px] font-black uppercase tracking-widest text-[#94a3b8] mb-1">Değişken Maliyetler</div>
          <div className="text-base font-black tabular-nums text-[#0f172a]">{fmtTRY(r.variable_costs_try, 0)}</div>
        </div>
        <div className="bg-white border border-[#e2e8f0] rounded px-4 py-3 shadow-sm">
          <div className="text-[9px] font-black uppercase tracking-widest text-[#94a3b8] mb-1">FVÖK (EBIT)</div>
          <div className={`text-base font-black tabular-nums ${r.current_ebit_try >= 0 ? 'text-green-700' : 'text-red-700'}`}>
            {fmtTRY(r.current_ebit_try, 0)}
          </div>
        </div>
      </div>
    </div>
  )
}
