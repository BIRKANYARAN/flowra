'use client'

// ─────────────────────────────────────────────────────────────────────────────
// CostCenterClient
//
// Cost Center Analysis & Expense Intelligence panel.
//
// Features:
//   - Header: "Maliyet Merkezi Analizi"
//   - Cost structure health badge (flexible/balanced/rigid/fragile)
//   - 4 KPIs: Katkı Payı Marjı / Başabaş Gelir / Güvenlik Marjı / Sabit Maliyet Oranı
//   - Expense breakdown by category with behavior tags (sabit/değişken/karma)
//   - Breakeven coverage bar
// ─────────────────────────────────────────────────────────────────────────────

import { useQuery }       from '@tanstack/react-query'
import { fmtTRY, fmtPct } from '@/lib/format'
import type { CostBehavior } from '@/lib/services/finance/cost-center.service'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Props {
  companyId: string
}

type CostStructureHealth = 'flexible' | 'balanced' | 'rigid' | 'fragile' | 'insufficient_data'

interface CostCenterReport {
  current_month: {
    total_expenses:                 number
    fixed_costs:                    number
    variable_costs:                 number
    semi_variable_costs:            number
    fixed_cost_ratio_pct:           number | null
    variable_cost_ratio_pct:        number | null
    contribution_margin:            number
    contribution_margin_ratio_pct:  number | null
    breakeven_revenue:              number | null
    margin_of_safety_pct:           number | null
    operating_leverage_ratio:       number | null
    cost_structure:                 CostStructureHealth
  }
  expense_categories: Array<{
    category:       string
    amount:         number
    pct_of_total:   number
    behavior:       CostBehavior
    mom_change_pct: number | null
  }>
  concentration_index: number
  summary: {
    revenue:                number
    ebit:                   number
    breakeven_coverage_pct: number | null
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function healthCfg(h: CostStructureHealth): { label: string; color: string } {
  switch (h) {
    case 'flexible':          return { label: 'Esnek Yapı',     color: 'bg-[#dcfce7] border-green-200 text-[#16a34a]' }
    case 'balanced':          return { label: 'Dengeli Yapı',   color: 'bg-blue-50 border-blue-200 text-blue-700' }
    case 'rigid':             return { label: 'Katı Yapı',      color: 'bg-[#fefce8] border-yellow-200 text-yellow-700' }
    case 'fragile':           return { label: 'Kırılgan Yapı',  color: 'bg-[#fee2e2] border-red-200 text-[#dc2626]' }
    case 'insufficient_data': return { label: 'Yetersiz Veri',  color: 'bg-[#f1f5f9] border-[#e2e8f0] text-[#94a3b8]' }
  }
}

function behaviorCfg(b: CostBehavior): { label: string; color: string } {
  switch (b) {
    case 'fixed':         return { label: 'Sabit',    color: 'bg-blue-50 text-blue-700' }
    case 'variable':      return { label: 'Değişken', color: 'bg-orange-50 text-orange-700' }
    case 'semi_variable': return { label: 'Karma',    color: 'bg-[#f1f5f9] text-[#64748b]' }
  }
}

function momColor(pct: number | null): string {
  if (pct === null) return 'text-[#94a3b8]'
  if (pct > 5)  return 'text-[#dc2626]'
  if (pct < -5) return 'text-[#16a34a]'
  return 'text-[#64748b]'
}

// ── KPI card ──────────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  sub,
  valueClass,
}: {
  label:       string
  value:       string
  sub?:        string
  valueClass?: string
}) {
  return (
    <div className="bg-white border border-[#e2e8f0] rounded p-3 flex flex-col gap-1">
      <div className="text-[9px] font-black uppercase tracking-widest text-[#94a3b8]">
        {label}
      </div>
      <div className={`text-xl font-black tabular-nums leading-tight ${valueClass ?? 'text-[#0f172a]'}`}>
        {value}
      </div>
      {sub && (
        <div className="text-[10px] text-[#94a3b8]">{sub}</div>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function CostCenterClient({ companyId }: Props) {
  const { data, isLoading, isError } = useQuery<{ report: CostCenterReport }>({
    queryKey:  ['cost-center', companyId],
    queryFn:   () =>
      fetch('/api/finance/cost-center').then(r => {
        if (!r.ok) throw new Error('Maliyet merkezi verileri yüklenemedi')
        return r.json()
      }),
    staleTime: 1_800_000,
  })

  const report = data?.report
  const cm     = report?.current_month
  const health = cm?.cost_structure ?? 'insufficient_data'
  const hCfg   = healthCfg(health)

  return (
    <div>
      <div className="text-[9px] font-black uppercase tracking-widest text-[#94a3b8] mb-1.5">
        Maliyet Merkezi Analizi
      </div>

      <div className="bg-white border border-[#e2e8f0] rounded shadow-sm overflow-hidden">

        {/* ── Header ──────────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#f1f5f9] bg-[#f8fafc]">
          <span className="text-sm font-black text-[#0f172a]">Maliyet Merkezi Analizi</span>
          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full border text-[10px] font-black uppercase tracking-wide ${hCfg.color}`}>
            {hCfg.label}
          </span>
        </div>

        {/* ── Loading / Error ──────────────────────────────────────────────────── */}
        {isLoading && (
          <div className="px-4 py-8 text-center text-xs text-[#94a3b8]">
            Maliyet analizi hesaplanıyor…
          </div>
        )}

        {isError && (
          <div className="px-4 py-6 text-center text-xs text-[#dc2626]">
            Veriler yüklenemedi — lütfen tekrar deneyin.
          </div>
        )}

        {report && !isLoading && (
          <>
            {/* ── KPI Cards ─────────────────────────────────────────────────── */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 border-b border-[#f1f5f9]">
              <KpiCard
                label="Katkı Payı Marjı"
                value={cm?.contribution_margin_ratio_pct !== null && cm?.contribution_margin_ratio_pct !== undefined
                  ? fmtPct(cm.contribution_margin_ratio_pct)
                  : '—'}
                sub="Gelirden değişken maliyet payı"
                valueClass={
                  cm?.contribution_margin_ratio_pct !== null && cm?.contribution_margin_ratio_pct !== undefined
                    ? cm.contribution_margin_ratio_pct >= 40
                      ? 'text-[#16a34a]'
                      : cm.contribution_margin_ratio_pct >= 20
                      ? 'text-yellow-600'
                      : 'text-[#dc2626]'
                    : 'text-[#94a3b8]'
                }
              />
              <KpiCard
                label="Başabaş Geliri"
                value={cm?.breakeven_revenue !== null && cm?.breakeven_revenue !== undefined
                  ? fmtTRY(cm.breakeven_revenue)
                  : '—'}
                sub="Sabit maliyetleri karşılayan eşik"
                valueClass="text-[#0f172a]"
              />
              <KpiCard
                label="Güvenlik Marjı"
                value={cm?.margin_of_safety_pct !== null && cm?.margin_of_safety_pct !== undefined
                  ? `${cm.margin_of_safety_pct >= 0 ? '+' : ''}${cm.margin_of_safety_pct.toFixed(1)}%`
                  : '—'}
                sub="Başabaş noktasının üzerindeki tampon"
                valueClass={
                  cm?.margin_of_safety_pct !== null && cm?.margin_of_safety_pct !== undefined
                    ? cm.margin_of_safety_pct >= 20
                      ? 'text-[#16a34a]'
                      : cm.margin_of_safety_pct >= 0
                      ? 'text-yellow-600'
                      : 'text-[#dc2626]'
                    : 'text-[#94a3b8]'
                }
              />
              <KpiCard
                label="Sabit Maliyet Oranı"
                value={cm?.fixed_cost_ratio_pct !== null && cm?.fixed_cost_ratio_pct !== undefined
                  ? fmtPct(cm.fixed_cost_ratio_pct)
                  : '—'}
                sub="Toplam gider içindeki sabit pay"
                valueClass={
                  cm?.fixed_cost_ratio_pct !== null && cm?.fixed_cost_ratio_pct !== undefined
                    ? cm.fixed_cost_ratio_pct > 70
                      ? 'text-[#dc2626]'
                      : cm.fixed_cost_ratio_pct > 50
                      ? 'text-yellow-600'
                      : 'text-[#16a34a]'
                    : 'text-[#94a3b8]'
                }
              />
            </div>

            {/* ── Cost behavior summary ─────────────────────────────────────── */}
            <div className="px-4 py-3 border-b border-[#f1f5f9] bg-[#f8fafc]">
              <div className="text-[9px] font-black uppercase tracking-widest text-[#94a3b8] mb-2">
                Maliyet Yapısı Dağılımı
              </div>
              <div className="flex items-center gap-4">
                {[
                  { label: 'Sabit', amount: cm?.fixed_costs ?? 0, color: 'bg-blue-500' },
                  { label: 'Karma', amount: cm?.semi_variable_costs ?? 0, color: 'bg-[#94a3b8]' },
                  { label: 'Değişken', amount: cm?.variable_costs ?? 0, color: 'bg-orange-400' },
                ].map(({ label, amount, color }) => {
                  const total = cm?.total_expenses ?? 1
                  const pct   = total > 0 ? Math.round((amount / total) * 100) : 0
                  return (
                    <div key={label} className="flex items-center gap-1.5">
                      <div className={`w-2.5 h-2.5 rounded-sm ${color}`} />
                      <span className="text-[10px] text-[#64748b]">
                        {label}: <span className="font-black text-[#0f172a]">{pct}%</span>
                      </span>
                    </div>
                  )
                })}
                {cm && cm.total_expenses > 0 && (
                  <div className="ml-auto text-[10px] text-[#94a3b8]">
                    Toplam: <span className="font-black text-[#0f172a]">{fmtTRY(cm.total_expenses)}</span>
                  </div>
                )}
              </div>
              {/* Stacked bar */}
              {cm && cm.total_expenses > 0 && (
                <div className="flex h-1.5 rounded-full overflow-hidden mt-2 gap-px">
                  <div
                    className="bg-blue-500 transition-all"
                    style={{ width: `${(cm.fixed_costs / cm.total_expenses) * 100}%` }}
                  />
                  <div
                    className="bg-[#94a3b8] transition-all"
                    style={{ width: `${(cm.semi_variable_costs / cm.total_expenses) * 100}%` }}
                  />
                  <div
                    className="bg-orange-400 transition-all"
                    style={{ width: `${(cm.variable_costs / cm.total_expenses) * 100}%` }}
                  />
                </div>
              )}
            </div>

            {/* ── Expense breakdown by category ─────────────────────────────── */}
            {report.expense_categories.length > 0 && (
              <div className="px-4 py-3 border-b border-[#f1f5f9]">
                <div className="text-[9px] font-black uppercase tracking-widest text-[#94a3b8] mb-2">
                  Gider Kategorileri
                </div>
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="text-[9px] font-black uppercase tracking-widest text-[#94a3b8]">
                      <th className="text-left pb-1.5 font-black">Kategori</th>
                      <th className="text-right pb-1.5 font-black">Tutar</th>
                      <th className="text-right pb-1.5 font-black">Pay</th>
                      <th className="text-center pb-1.5 font-black">Davranış</th>
                      <th className="text-right pb-1.5 font-black">AoA</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#f1f5f9]">
                    {report.expense_categories.map((cat, idx) => {
                      const bCfg = behaviorCfg(cat.behavior)
                      return (
                        <tr key={idx}>
                          <td className="py-1.5 text-[#334155] font-semibold capitalize max-w-[140px] truncate">
                            {cat.category}
                          </td>
                          <td className="py-1.5 text-right tabular-nums font-black text-[#0f172a]">
                            {fmtTRY(cat.amount)}
                          </td>
                          <td className="py-1.5 text-right tabular-nums text-[#64748b]">
                            {cat.pct_of_total.toFixed(1)}%
                          </td>
                          <td className="py-1.5 text-center">
                            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-black ${bCfg.color}`}>
                              {bCfg.label}
                            </span>
                          </td>
                          <td className={`py-1.5 text-right tabular-nums text-[10px] font-semibold ${momColor(cat.mom_change_pct)}`}>
                            {cat.mom_change_pct !== null
                              ? `${cat.mom_change_pct >= 0 ? '+' : ''}${cat.mom_change_pct.toFixed(1)}%`
                              : '—'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* ── Breakeven coverage bar ─────────────────────────────────────── */}
            {report.summary.breakeven_coverage_pct !== null && (
              <div className="px-4 py-3 border-b border-[#f1f5f9]">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="text-[9px] font-black uppercase tracking-widest text-[#94a3b8]">
                    Başabaş Noktası Karşılaması
                  </div>
                  <span className={`text-[10px] font-black tabular-nums ${
                    report.summary.breakeven_coverage_pct >= 120 ? 'text-[#16a34a]' :
                    report.summary.breakeven_coverage_pct >= 100 ? 'text-yellow-600' :
                    'text-[#dc2626]'
                  }`}>
                    %{report.summary.breakeven_coverage_pct.toFixed(1)}
                  </span>
                </div>
                <div className="h-2 bg-[#f1f5f9] rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      report.summary.breakeven_coverage_pct >= 120 ? 'bg-[#16a34a]' :
                      report.summary.breakeven_coverage_pct >= 100 ? 'bg-yellow-400' :
                      'bg-[#dc2626]'
                    }`}
                    style={{ width: `${Math.min(100, report.summary.breakeven_coverage_pct)}%` }}
                  />
                </div>
                <div className="flex items-center justify-between mt-1 text-[9px] text-[#94a3b8]">
                  <span>0%</span>
                  <span className="text-[#64748b] font-semibold">
                    Başabaş: {cm?.breakeven_revenue !== null && cm?.breakeven_revenue !== undefined
                      ? fmtTRY(cm.breakeven_revenue)
                      : '—'}
                  </span>
                  <span>100%+</span>
                </div>
              </div>
            )}

            {/* ── Summary footer ─────────────────────────────────────────────── */}
            <div className="px-4 py-3 bg-[#f8fafc] grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-[9px] font-black uppercase tracking-widest text-[#94a3b8] mb-0.5">
                  Cari Ay Cirosu
                </div>
                <div className="text-sm font-black tabular-nums text-[#334155]">
                  {fmtTRY(report.summary.revenue)}
                </div>
              </div>
              <div>
                <div className="text-[9px] font-black uppercase tracking-widest text-[#94a3b8] mb-0.5">
                  FVÖK (EBIT)
                </div>
                <div className={`text-sm font-black tabular-nums ${report.summary.ebit >= 0 ? 'text-[#16a34a]' : 'text-[#dc2626]'}`}>
                  {fmtTRY(report.summary.ebit)}
                </div>
              </div>
              <div>
                <div className="text-[9px] font-black uppercase tracking-widest text-[#94a3b8] mb-0.5">
                  Konsantrasyon (HHI)
                </div>
                <div className={`text-sm font-black tabular-nums ${
                  report.concentration_index > 2500 ? 'text-[#dc2626]' :
                  report.concentration_index > 1500 ? 'text-yellow-600' :
                  'text-[#16a34a]'
                }`}>
                  {Math.round(report.concentration_index)}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
