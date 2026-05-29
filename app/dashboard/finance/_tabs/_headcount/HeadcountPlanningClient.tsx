'use client'

// ─────────────────────────────────────────────────────────────────────────────
// HeadcountPlanningClient
//
// Headcount Cost Planning dashboard.
//
// Features:
//   - 4 KPI cells: headcount, monthly cost, cost ratio %, revenue per head
//   - Efficiency badge (Turkish SME benchmarks)
//   - Cost breakdown section: gross vs employer SGK vs net (stacked bar)
//   - 5-scenario comparison table (current, +1, +2, +3, -1)
//   - 6-month cost projection trend bars
// ─────────────────────────────────────────────────────────────────────────────

import { useQuery }  from '@tanstack/react-query'
import { fmtTRY, fmtPct } from '@/lib/format'
import type {
  HeadcountPlanningReport,
  HeadcountScenario,
} from '@/lib/services/finance/headcount-planning.service'

// ── Types ──────────────────────────────────────────────────────────────────────

type EffClass = 'excellent' | 'good' | 'acceptable' | 'high' | 'excessive'

// ── Efficiency badge ──────────────────────────────────────────────────────────

function EfficiencyBadge({ cls }: { cls: EffClass }) {
  const config: Record<EffClass, { label: string; style: string }> = {
    excellent:  { label: 'Mükemmel (≤15%)',   style: 'bg-green-100 text-green-800 border-green-200' },
    good:       { label: 'İyi (≤25%)',         style: 'bg-teal-100 text-teal-800 border-teal-200' },
    acceptable: { label: 'Kabul Edilebilir (≤35%)', style: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
    high:       { label: 'Yüksek (≤50%)',      style: 'bg-orange-100 text-orange-800 border-orange-200' },
    excessive:  { label: 'Aşırı (>50%)',       style: 'bg-red-100 text-red-800 border-red-200' },
  }
  const c = config[cls]
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] font-bold ${c.style}`}>
      {c.label}
    </span>
  )
}

// ── KPI cell ──────────────────────────────────────────────────────────────────

function KpiCell({
  label,
  value,
  sub,
}: {
  label: string
  value: string
  sub?: string
}) {
  return (
    <div className="bg-white border border-[#e2e8f0] rounded px-4 py-4 shadow-sm">
      <div className="text-[9px] font-black uppercase tracking-widest text-[#94a3b8] mb-1">{label}</div>
      <div className="text-xl font-black tabular-nums text-[#0f172a]">{value}</div>
      {sub && <div className="text-[10px] text-[#94a3b8] mt-0.5">{sub}</div>}
    </div>
  )
}

// ── Cost breakdown bar ────────────────────────────────────────────────────────

function CostBreakdownBar({ report }: { report: HeadcountPlanningReport }) {
  const bd = report.cost_breakdown
  const total = bd.total_employer_cost_try
  if (total === 0) return null

  const grossPct      = (bd.gross_salary_try / total) * 100
  const sgkPct        = (bd.employer_sgk_try / total) * 100
  const unemployPct   = (bd.employer_unemployment_try / total) * 100

  return (
    <div className="bg-white border border-[#e2e8f0] rounded p-5 shadow-sm">
      <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-4">
        Maliyet Dağılımı — Çalışan Başına
      </div>

      {/* Stacked bar */}
      <div className="flex h-6 rounded overflow-hidden mb-3">
        <div
          className="bg-[#3b82f6] h-full"
          style={{ width: `${grossPct.toFixed(1)}%` }}
          title={`Brüt Maaş: ${fmtTRY(bd.gross_salary_try, 0)}`}
        />
        <div
          className="bg-[#f59e0b] h-full"
          style={{ width: `${sgkPct.toFixed(1)}%` }}
          title={`SGK İşveren: ${fmtTRY(bd.employer_sgk_try, 0)}`}
        />
        <div
          className="bg-[#ef4444] h-full"
          style={{ width: `${unemployPct.toFixed(1)}%` }}
          title={`İşsizlik: ${fmtTRY(bd.employer_unemployment_try, 0)}`}
        />
      </div>

      {/* Legend */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { color: 'bg-[#3b82f6]', label: 'Brüt Maaş',       value: bd.gross_salary_try,            pct: grossPct },
          { color: 'bg-[#f59e0b]', label: 'SGK İşveren',      value: bd.employer_sgk_try,            pct: sgkPct },
          { color: 'bg-[#ef4444]', label: 'İşsizlik',          value: bd.employer_unemployment_try,   pct: unemployPct },
        ].map(item => (
          <div key={item.label} className="flex items-start gap-1.5">
            <span className={`w-2.5 h-2.5 rounded-sm shrink-0 mt-0.5 ${item.color}`} />
            <div>
              <div className="text-[9px] font-black uppercase tracking-widest text-[#94a3b8]">{item.label}</div>
              <div className="text-[11px] font-bold tabular-nums text-[#1e293b]">{fmtTRY(item.value, 0)}</div>
              <div className="text-[9px] text-[#94a3b8]">%{item.pct.toFixed(1)}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Net salary callout */}
      <div className="mt-4 bg-[#f8fafc] rounded p-3 border border-[#e2e8f0]">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[9px] font-black uppercase tracking-widest text-[#94a3b8]">Çalışanın Eline Geçen (Net)</div>
            <div className="text-[10px] text-[#64748b] mt-0.5">
              SGK işçi ({(14).toFixed(0)}%) + Gelir vergisi ({(15).toFixed(0)}%) düşülünce
            </div>
          </div>
          <div className="text-right">
            <div className="text-lg font-black tabular-nums text-[#0f172a]">{fmtTRY(bd.net_salary_try, 0)}</div>
            <div className="text-[10px] text-[#94a3b8]">
              %{((bd.net_salary_try / bd.gross_salary_try) * 100).toFixed(1)} oran
            </div>
          </div>
        </div>
      </div>

      {/* Multiplier callout */}
      <div className="mt-2 text-[10px] text-[#64748b]">
        İşveren Maliyet Çarpanı:{' '}
        <span className="font-bold text-[#0f172a]">×{bd.employer_cost_multiplier.toFixed(4)}</span>
        <span className="ml-1 text-[#94a3b8]">(toplam maliyet / brüt maaş)</span>
      </div>
    </div>
  )
}

// ── Scenario table ────────────────────────────────────────────────────────────

function ScenarioTable({ scenarios }: { scenarios: HeadcountScenario[] }) {
  return (
    <div className="bg-white border border-[#e2e8f0] rounded shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-[#e2e8f0]">
        <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">
          Senaryo Karşılaştırması
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="bg-[#f8fafc] border-b border-[#e2e8f0]">
              <th className="px-4 py-2 text-left font-black text-[#94a3b8] text-[9px] uppercase tracking-widest">Senaryo</th>
              <th className="px-4 py-2 text-right font-black text-[#94a3b8] text-[9px] uppercase tracking-widest">Kadro</th>
              <th className="px-4 py-2 text-right font-black text-[#94a3b8] text-[9px] uppercase tracking-widest">Aylık Maliyet</th>
              <th className="px-4 py-2 text-right font-black text-[#94a3b8] text-[9px] uppercase tracking-widest">Yıllık Maliyet</th>
              <th className="px-4 py-2 text-right font-black text-[#94a3b8] text-[9px] uppercase tracking-widest">Gelire Oranı</th>
              <th className="px-4 py-2 text-center font-black text-[#94a3b8] text-[9px] uppercase tracking-widest">Sürdürülebilir</th>
            </tr>
          </thead>
          <tbody>
            {scenarios.map((s, i) => {
              const isCurrentRow = s.name === 'Mevcut Kadro'
              return (
                <tr
                  key={i}
                  className={`border-b border-[#f1f5f9] ${isCurrentRow ? 'bg-blue-50' : 'hover:bg-[#f8fafc]'}`}
                >
                  <td className="px-4 py-2.5 font-bold text-[#1e293b]">
                    {s.name}
                    {isCurrentRow && (
                      <span className="ml-1.5 text-[9px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-black">
                        Şu an
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-[#1e293b]">
                    {s.headcount}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-[#1e293b]">
                    {fmtTRY(s.monthly_cost_try, 0)}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-[#64748b]">
                    {fmtTRY(s.annual_cost_try, 0)}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-[#64748b]">
                    {s.cost_as_pct_revenue !== null ? `%${s.cost_as_pct_revenue.toFixed(1)}` : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    {s.cost_as_pct_revenue !== null ? (
                      s.is_sustainable ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-[9px] font-black border border-green-200">
                          Evet
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-[9px] font-black border border-red-200">
                          Hayır
                        </span>
                      )
                    ) : (
                      <span className="text-[#94a3b8]">—</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── 6-month projection ────────────────────────────────────────────────────────

function ProjectionSection({
  projection,
}: {
  projection: HeadcountPlanningReport['six_month_projection']
}) {
  const maxCost = Math.max(...projection.map(m => m.monthly_cost_try), 1)
  return (
    <div className="bg-white border border-[#e2e8f0] rounded p-5 shadow-sm">
      <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-4">
        6 Aylık Maliyet Projeksiyonu
        <span className="ml-1.5 text-[9px] font-medium text-[#cbd5e1] normal-case">(aylık %0.5 maaş artışı ile)</span>
      </div>
      <div className="space-y-1.5">
        {projection.map(m => {
          const barWidth = (m.monthly_cost_try / maxCost) * 100
          return (
            <div key={m.month} className="flex items-center gap-3">
              <span className="text-[10px] text-[#94a3b8] w-12 shrink-0 font-semibold">
                {m.month}. ay
              </span>
              <div className="flex-1 h-3 bg-[#f1f5f9] rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full bg-[#3b82f6] transition-all duration-300"
                  style={{ width: `${barWidth}%` }}
                />
              </div>
              <span className="text-[10px] tabular-nums font-semibold text-[#1e293b] w-28 text-right shrink-0">
                {fmtTRY(m.monthly_cost_try, 0)}
              </span>
              <span className="text-[9px] text-[#94a3b8] w-12 shrink-0 text-right">
                {m.headcount} kişi
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

interface Props {
  companyId: string
}

export function HeadcountPlanningClient({ companyId }: Props) {
  const { data, isLoading, isError } = useQuery<{ report: HeadcountPlanningReport }>({
    queryKey: ['headcount-planning', companyId],
    queryFn: async () => {
      const res = await fetch('/api/finance/headcount-planning')
      if (!res.ok) throw new Error('Kadro planlama verisi yüklenemedi')
      return res.json()
    },
    staleTime: 30 * 60 * 1000,
  })

  // ── Loading ────────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-4 gap-3">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className="bg-white border border-[#e2e8f0] rounded p-4 shadow-sm animate-pulse">
              <div className="h-3 bg-[#f1f5f9] rounded w-20 mb-2" />
              <div className="h-6 bg-[#f1f5f9] rounded w-32" />
            </div>
          ))}
        </div>
        <div className="h-40 bg-white border border-[#e2e8f0] rounded animate-pulse" />
        <div className="h-48 bg-white border border-[#e2e8f0] rounded animate-pulse" />
      </div>
    )
  }

  // ── Error ──────────────────────────────────────────────────────────────────
  if (isError || !data?.report) {
    return (
      <div className="bg-white border border-[#e2e8f0] rounded p-6 shadow-sm text-center">
        <p className="text-sm text-[#64748b] font-medium">
          Kadro planlama verisi yüklenirken hata oluştu.
        </p>
      </div>
    )
  }

  const report = data.report

  return (
    <div className="space-y-4">

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">
            Kadro Maliyet Planlaması
          </h3>
        </div>
        {report.efficiency && (
          <EfficiencyBadge cls={report.efficiency} />
        )}
      </div>

      {/* ── 4 KPI cells ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-4 gap-3">
        <KpiCell
          label="Mevcut Kadro"
          value={`${report.current_headcount} kişi`}
          sub="Tahmin (bordro verilerinden)"
        />
        <KpiCell
          label="Aylık Toplam Maliyet"
          value={fmtTRY(report.current_monthly_cost_try, 0)}
          sub="İşveren maliyeti dahil"
        />
        <KpiCell
          label="Gelire Maliyet Oranı"
          value={report.current_cost_ratio_pct !== null
            ? `%${report.current_cost_ratio_pct.toFixed(1)}`
            : '—'}
          sub={report.current_cost_ratio_pct !== null ? 'Personel / gelir' : 'Gelir verisi yok'}
        />
        <KpiCell
          label="Çalışan Başına Gelir"
          value={report.revenue_per_head !== null
            ? fmtTRY(report.revenue_per_head, 0)
            : '—'}
          sub="Aylık gelir / kadro"
        />
      </div>

      {/* ── Cost breakdown ────────────────────────────────────────────────── */}
      <CostBreakdownBar report={report} />

      {/* ── Scenarios + projection side by side ───────────────────────────── */}
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-8">
          <ScenarioTable scenarios={report.scenarios} />
        </div>
        <div className="col-span-4 space-y-3">

          {/* Breakeven headcount */}
          {report.breakeven_headcount !== null && (
            <div className="bg-white border border-[#e2e8f0] rounded px-4 py-4 shadow-sm">
              <div className="text-[9px] font-black uppercase tracking-widest text-[#94a3b8] mb-0.5">
                Başabaş Kadro
              </div>
              <div className="text-[10px] text-[#94a3b8] mb-2">
                Mevcut gelirin %25 kriteri ile destekleyebileceği max kadro
              </div>
              <div className="text-2xl font-black tabular-nums text-[#0f172a]">
                {report.breakeven_headcount} kişi
              </div>
              {report.breakeven_headcount < report.current_headcount && (
                <div className="mt-2 text-[10px] font-semibold text-red-600">
                  Mevcut kadro başabaş noktasının üzerinde
                </div>
              )}
              {report.breakeven_headcount >= report.current_headcount && (
                <div className="mt-2 text-[10px] font-semibold text-green-600">
                  {report.breakeven_headcount - report.current_headcount} kişilik ek kapasite mevcut
                </div>
              )}
            </div>
          )}

          {/* Ortalama brüt maaş */}
          <div className="bg-white border border-[#e2e8f0] rounded px-4 py-4 shadow-sm">
            <div className="text-[9px] font-black uppercase tracking-widest text-[#94a3b8] mb-0.5">
              Ort. Brüt Maaş
            </div>
            <div className="text-[10px] text-[#94a3b8] mb-2">Çalışan başına tahmini</div>
            <div className="text-xl font-black tabular-nums text-[#0f172a]">
              {fmtTRY(report.avg_gross_salary_try, 0)}
            </div>
            <div className="mt-2 text-[10px] text-[#64748b]">
              Net: <span className="font-semibold">{fmtTRY(report.cost_breakdown.net_salary_try, 0)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── 6-month projection ────────────────────────────────────────────── */}
      <ProjectionSection projection={report.six_month_projection} />

      {/* ── Turkish payroll reference ─────────────────────────────────────── */}
      <div className="bg-[#f8fafc] border border-[#e2e8f0] rounded px-4 py-3">
        <div className="text-[9px] font-black uppercase tracking-widest text-[#94a3b8] mb-2">
          Türkiye Bordro Referans Oranları (2025)
        </div>
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: 'SGK İşveren',       value: '%20.25' },
            { label: 'SGK İşçi',          value: '%14.0' },
            { label: 'Gelir Vergisi',     value: '%15.0 (efektif)' },
            { label: 'İşsizlik İşveren',  value: '%2.0' },
          ].map(item => (
            <div key={item.label}>
              <div className="text-[9px] text-[#94a3b8]">{item.label}</div>
              <div className="text-[11px] font-bold text-[#1e293b]">{item.value}</div>
            </div>
          ))}
        </div>
      </div>

    </div>
  )
}
