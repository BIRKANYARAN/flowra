'use client'

// ─────────────────────────────────────────────────────────────────────────────
// CostAllocationClient
//
// Cost Center Allocation & Overhead Distribution panel.
//
// Features:
//   - Header with allocation method selector
//   - Overhead ratio gauge (lean/normal/elevated/heavy/critical)
//   - 4 KPIs: Genel Gider Oranı / Başabaş Geliri / Katkı Payı Marjı / Hedef Maliyet İndirimi
//   - Cost segregation breakdown (fixed/variable/semi-variable)
//   - Allocation results table (per cost center)
//   - Narrative summary
// ─────────────────────────────────────────────────────────────────────────────

import { useState }       from 'react'
import { useQuery }       from '@tanstack/react-query'
import { fmtTRY, fmtPct } from '@/lib/format'
import type {
  AllocationMethod,
  AllocationResult,
  CostAllocationReport,
} from '@/lib/services/finance/cost-allocation.service'

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  companyId: string
}

// ── Method labels ─────────────────────────────────────────────────────────────

const METHOD_LABELS: Record<AllocationMethod, string> = {
  revenue_based:   'Gelir Bazlı',
  headcount_based: 'Personel Bazlı',
  equal_split:     'Eşit Dağılım',
  direct_only:     'Sadece Direkt',
  activity_based:  'Aktivite Bazlı',
}

// ── Overhead level config ─────────────────────────────────────────────────────

type OverheadLevel = 'lean' | 'normal' | 'elevated' | 'heavy' | 'critical'

function overheadLevelCfg(level: OverheadLevel): { label: string; color: string; barColor: string } {
  switch (level) {
    case 'lean':     return { label: 'Düşük',    color: 'bg-[#dcfce7] border-green-200 text-[#16a34a]', barColor: 'bg-[#16a34a]' }
    case 'normal':   return { label: 'Normal',   color: 'bg-blue-50 border-blue-200 text-blue-700',      barColor: 'bg-blue-500'   }
    case 'elevated': return { label: 'Yükselen', color: 'bg-[#fefce8] border-yellow-200 text-yellow-700', barColor: 'bg-yellow-400' }
    case 'heavy':    return { label: 'Ağır',     color: 'bg-orange-50 border-orange-200 text-orange-700', barColor: 'bg-orange-400' }
    case 'critical': return { label: 'Kritik',   color: 'bg-[#fee2e2] border-red-200 text-[#dc2626]',    barColor: 'bg-[#dc2626]'  }
  }
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

// ── Overhead rate bar ─────────────────────────────────────────────────────────

function OverheadGauge({
  ratioPct,
  level,
}: {
  ratioPct: number | null
  level: OverheadLevel
}) {
  const cfg     = overheadLevelCfg(level)
  const display = ratioPct !== null ? `%${ratioPct.toFixed(1)}` : '—'
  const barPct  = ratioPct !== null ? Math.min(100, (ratioPct / 100) * 100) : 0

  return (
    <div className="px-4 py-3 border-b border-[#f1f5f9]">
      <div className="flex items-center justify-between mb-2">
        <div className="text-[9px] font-black uppercase tracking-widest text-[#94a3b8]">
          Genel Gider Oranı
        </div>
        <div className="flex items-center gap-2">
          <span className="text-lg font-black tabular-nums text-[#0f172a]">{display}</span>
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[9px] font-black uppercase tracking-wide ${cfg.color}`}>
            {cfg.label}
          </span>
        </div>
      </div>
      <div className="h-2.5 bg-[#f1f5f9] rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${cfg.barColor}`}
          style={{ width: `${barPct}%` }}
        />
      </div>
      <div className="flex items-center justify-between mt-1 text-[9px] text-[#94a3b8]">
        <span>0%</span>
        <span>25% Normal</span>
        <span>60%+</span>
      </div>
    </div>
  )
}

// ── Allocation results table ───────────────────────────────────────────────────

function AllocationTable({ results }: { results: AllocationResult[] }) {
  if (results.length === 0) return null
  return (
    <div className="px-4 py-3 border-b border-[#f1f5f9]">
      <div className="text-[9px] font-black uppercase tracking-widest text-[#94a3b8] mb-2">
        Maliyet Merkezi Dağılımı
      </div>
      <table className="w-full text-[11px]">
        <thead>
          <tr className="text-[9px] font-black uppercase tracking-widest text-[#94a3b8]">
            <th className="text-left pb-1.5 font-black">Merkez</th>
            <th className="text-right pb-1.5 font-black">Direkt</th>
            <th className="text-right pb-1.5 font-black">Dolaylı</th>
            <th className="text-right pb-1.5 font-black">Toplam</th>
            <th className="text-right pb-1.5 font-black">GG Oranı</th>
            <th className="text-right pb-1.5 font-black">Pay</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#f1f5f9]">
          {results.map((r) => (
            <tr key={r.cost_center_id}>
              <td className="py-1.5 text-[#334155] font-semibold max-w-[120px] truncate">
                {r.cost_center_name}
              </td>
              <td className="py-1.5 text-right tabular-nums text-[#64748b]">
                {fmtTRY(r.direct_costs)}
              </td>
              <td className="py-1.5 text-right tabular-nums text-[#64748b]">
                {fmtTRY(r.allocated_overhead)}
              </td>
              <td className="py-1.5 text-right tabular-nums font-black text-[#0f172a]">
                {fmtTRY(r.total_cost)}
              </td>
              <td className="py-1.5 text-right tabular-nums">
                {r.overhead_rate_pct !== null ? (
                  <span className={
                    r.overhead_rate_pct >= 60 ? 'text-[#dc2626] font-black' :
                    r.overhead_rate_pct >= 40 ? 'text-orange-600 font-semibold' :
                    r.overhead_rate_pct >= 25 ? 'text-yellow-600' :
                    'text-[#16a34a]'
                  }>
                    %{r.overhead_rate_pct.toFixed(1)}
                  </span>
                ) : (
                  <span className="text-[#94a3b8]">—</span>
                )}
              </td>
              <td className="py-1.5 text-right tabular-nums text-[#64748b]">
                %{r.allocation_share_pct.toFixed(1)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Cost segregation bar ──────────────────────────────────────────────────────

function SegregationBar({ seg }: { seg: CostAllocationReport['cost_segregation'] }) {
  return (
    <div className="px-4 py-3 border-b border-[#f1f5f9] bg-[#f8fafc]">
      <div className="text-[9px] font-black uppercase tracking-widest text-[#94a3b8] mb-2">
        Maliyet Yapısı Dağılımı
      </div>
      <div className="flex items-center gap-4 flex-wrap mb-2">
        {[
          { label: 'Sabit',    amount: seg.fixed_costs,        pct: seg.fixed_pct,        color: 'bg-blue-500' },
          { label: 'Karma',    amount: seg.semi_variable_costs, pct: seg.semi_variable_pct, color: 'bg-[#94a3b8]' },
          { label: 'Değişken', amount: seg.variable_costs,     pct: seg.variable_pct,     color: 'bg-orange-400' },
        ].map(({ label, amount, pct, color }) => (
          <div key={label} className="flex items-center gap-1.5">
            <div className={`w-2.5 h-2.5 rounded-sm ${color}`} />
            <span className="text-[10px] text-[#64748b]">
              {label}: <span className="font-black text-[#0f172a]">{pct.toFixed(1)}%</span>
              <span className="text-[#94a3b8] ml-1">({fmtTRY(amount)})</span>
            </span>
          </div>
        ))}
        {seg.total > 0 && (
          <div className="ml-auto text-[10px] text-[#94a3b8]">
            Toplam: <span className="font-black text-[#0f172a]">{fmtTRY(seg.total)}</span>
          </div>
        )}
      </div>
      {seg.total > 0 && (
        <div className="flex h-2 rounded-full overflow-hidden gap-px">
          <div className="bg-blue-500 transition-all"   style={{ width: `${seg.fixed_pct}%` }} />
          <div className="bg-[#94a3b8] transition-all"  style={{ width: `${seg.semi_variable_pct}%` }} />
          <div className="bg-orange-400 transition-all" style={{ width: `${seg.variable_pct}%` }} />
        </div>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function CostAllocationClient({ companyId }: Props) {
  const [method, setMethod] = useState<AllocationMethod>('revenue_based')

  const { data, isLoading, isError } = useQuery<{ report: CostAllocationReport }>({
    queryKey:  ['cost-allocation', companyId, method],
    queryFn:   () =>
      fetch(`/api/finance/cost-allocation?method=${method}`).then(r => {
        if (!r.ok) throw new Error('Maliyet dağıtım verileri yüklenemedi')
        return r.json()
      }),
    staleTime: 1_800_000,
  })

  const report = data?.report
  const level  = (report?.overhead_level ?? 'normal') as OverheadLevel
  const lCfg   = overheadLevelCfg(level)

  return (
    <div>
      <div className="text-[9px] font-black uppercase tracking-widest text-[#94a3b8] mb-1.5">
        Maliyet Merkezi Dağıtımı
      </div>

      <div className="bg-white border border-[#e2e8f0] rounded shadow-sm overflow-hidden">

        {/* ── Header ──────────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#f1f5f9] bg-[#f8fafc]">
          <span className="text-sm font-black text-[#0f172a]">Genel Gider Dağıtımı</span>
          <div className="flex items-center gap-2">
            <select
              value={method}
              onChange={e => setMethod(e.target.value as AllocationMethod)}
              className="text-[10px] font-semibold border border-[#e2e8f0] rounded px-2 py-1 bg-white text-[#334155] focus:outline-none"
            >
              {(Object.entries(METHOD_LABELS) as [AllocationMethod, string][]).map(([val, label]) => (
                <option key={val} value={val}>{label}</option>
              ))}
            </select>
            {report && (
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full border text-[10px] font-black uppercase tracking-wide ${lCfg.color}`}>
                {lCfg.label}
              </span>
            )}
          </div>
        </div>

        {/* ── Loading / Error ──────────────────────────────────────────────────── */}
        {isLoading && (
          <div className="px-4 py-8 text-center text-xs text-[#94a3b8]">
            Maliyet dağıtımı hesaplanıyor…
          </div>
        )}

        {isError && (
          <div className="px-4 py-6 text-center text-xs text-[#dc2626]">
            Veriler yüklenemedi — lütfen tekrar deneyin.
          </div>
        )}

        {report && !isLoading && (
          <>
            {/* ── Overhead gauge ─────────────────────────────────────────────── */}
            <OverheadGauge ratioPct={report.overhead_ratio_pct} level={level} />

            {/* ── KPI Cards ─────────────────────────────────────────────────── */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 border-b border-[#f1f5f9]">
              <KpiCard
                label="Katkı Payı Marjı"
                value={report.contribution_margin_ratio !== null
                  ? fmtPct(report.contribution_margin_ratio)
                  : '—'}
                sub="Gelirden değişken maliyet payı"
                valueClass={
                  report.contribution_margin_ratio !== null
                    ? report.contribution_margin_ratio >= 40
                      ? 'text-[#16a34a]'
                      : report.contribution_margin_ratio >= 20
                      ? 'text-yellow-600'
                      : 'text-[#dc2626]'
                    : 'text-[#94a3b8]'
                }
              />
              <KpiCard
                label="Başabaş Geliri"
                value={report.breakeven_revenue !== null
                  ? fmtTRY(report.breakeven_revenue)
                  : '—'}
                sub="Sabit maliyetleri karşılayan eşik"
              />
              <KpiCard
                label="Direkt Maliyetler"
                value={fmtTRY(report.total_direct_costs)}
                sub="Tahsisli maliyet merkezleri toplamı"
              />
              <KpiCard
                label="Hedef Maliyet İndirimi"
                value={report.target_cost_reduction !== null
                  ? `${report.target_cost_reduction >= 0 ? '-' : '+'}${fmtTRY(Math.abs(report.target_cost_reduction))}`
                  : '—'}
                sub="%15 marj için gerekli indirim"
                valueClass={
                  report.target_cost_reduction !== null
                    ? report.target_cost_reduction <= 0
                      ? 'text-[#16a34a]'
                      : 'text-[#dc2626]'
                    : 'text-[#94a3b8]'
                }
              />
            </div>

            {/* ── Cost segregation ──────────────────────────────────────────── */}
            <SegregationBar seg={report.cost_segregation} />

            {/* ── Allocation results table ───────────────────────────────────── */}
            <AllocationTable results={report.allocation_results} />

            {/* ── Highest overhead center callout ───────────────────────────── */}
            {report.highest_overhead_center && (
              <div className="px-4 py-3 border-b border-[#f1f5f9] bg-[#fff7ed]">
                <div className="flex items-start gap-2">
                  <div className="flex-1">
                    <div className="text-[9px] font-black uppercase tracking-widest text-orange-400 mb-0.5">
                      En Yüksek Genel Gider Oranı
                    </div>
                    <div className="text-[11px] font-black text-[#0f172a]">
                      {report.highest_overhead_center.cost_center_name}
                      <span className="ml-2 text-orange-600">
                        %{report.highest_overhead_center.overhead_rate_pct?.toFixed(1)}
                      </span>
                    </div>
                    <div className="text-[10px] text-[#94a3b8] mt-0.5">
                      Direkt: {fmtTRY(report.highest_overhead_center.direct_costs)} •
                      Dolaylı: {fmtTRY(report.highest_overhead_center.allocated_overhead)}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── Narrative footer ───────────────────────────────────────────── */}
            <div className="px-4 py-3 bg-[#f8fafc]">
              <div className="text-[10px] text-[#64748b] italic leading-relaxed">
                {report.narrative}
              </div>
              <div className="mt-2 flex items-center gap-4 text-[9px] text-[#94a3b8]">
                <span>Dönem: <span className="font-black text-[#334155]">{report.period_label}</span></span>
                <span>Yöntem: <span className="font-black text-[#334155]">{METHOD_LABELS[report.allocation_method]}</span></span>
                <span>Genel Gider: <span className="font-black text-[#334155]">{fmtTRY(report.total_overhead)}</span></span>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
