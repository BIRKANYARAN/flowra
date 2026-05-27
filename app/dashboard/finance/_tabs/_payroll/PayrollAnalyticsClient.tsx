'use client'

// ─────────────────────────────────────────────────────────────────────────────
// PayrollAnalyticsClient
//
// Payroll analytics dashboard — salary expense trends, payroll-to-revenue
// ratio, SGK compliance, and headcount cost efficiency.
//
// Features:
//   - Period selector: 6 / 12 months
//   - Summary strip: Current Month Payroll / Payroll Ratio% / YTD Payroll / YTD SGK Estimate
//   - Payroll ratio status badge: lean / healthy / elevated / high
//   - SGK deadline card
//   - Salary trend arrow
//   - Monthly breakdown table with color-coded Payroll% column
//   - "Salary is largest expense" warning
//   - Empty state
// ─────────────────────────────────────────────────────────────────────────────

import { useState }   from 'react'
import { useQuery }   from '@tanstack/react-query'
import { fmtTRY, fmtPct, fmtDelta, fmtDate } from '@/lib/format'
import type { PayrollAnalyticsReport } from '@/lib/services/finance/payroll-analytics.service'

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  companyId: string
}

// ── Ratio status badge ────────────────────────────────────────────────────────

type RatioStatus = 'lean' | 'healthy' | 'elevated' | 'high' | 'unknown'

function RatioStatusBadge({ status }: { status: RatioStatus }) {
  const config: Record<RatioStatus, { label: string; cls: string }> = {
    lean:     { label: 'Düşük (<20%)',    cls: 'bg-green-100 text-green-800 border-green-200' },
    healthy:  { label: 'Sağlıklı (20–35%)', cls: 'bg-teal-100 text-teal-800 border-teal-200' },
    elevated: { label: 'Yüksek (35–50%)', cls: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
    high:     { label: 'Kritik (>50%)',   cls: 'bg-red-100 text-red-800 border-red-200' },
    unknown:  { label: 'Veri Yok',        cls: 'bg-slate-100 text-slate-600 border-slate-200' },
  }
  const cfg = config[status]
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] font-bold ${cfg.cls}`}>
      {cfg.label}
    </span>
  )
}

// ── Trend arrow ───────────────────────────────────────────────────────────────

type SalaryTrend = 'increasing' | 'stable' | 'decreasing' | 'insufficient_data'

function TrendArrow({ trend }: { trend: SalaryTrend }) {
  const config: Record<SalaryTrend, { icon: string; cls: string; label: string }> = {
    increasing:        { icon: '↑', cls: 'text-red-600',   label: 'Artıyor' },
    stable:            { icon: '→', cls: 'text-slate-500', label: 'Sabit' },
    decreasing:        { icon: '↓', cls: 'text-green-600', label: 'Azalıyor' },
    insufficient_data: { icon: '—', cls: 'text-slate-400', label: 'Yetersiz Veri' },
  }
  const cfg = config[trend]
  return (
    <span className={`font-black text-lg ${cfg.cls}`} title={cfg.label}>
      {cfg.icon}
      <span className="text-[11px] font-semibold ml-1">{cfg.label}</span>
    </span>
  )
}

// ── Payroll ratio color ────────────────────────────────────────────────────────

function ratioColor(ratio: number | null): string {
  if (ratio === null) return 'text-slate-400'
  if (ratio < 20)  return 'text-green-700'
  if (ratio < 35)  return 'text-teal-700'
  if (ratio <= 50) return 'text-yellow-700'
  return 'text-red-700'
}

// ── Summary KPI card ──────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, colorClass = '' }: {
  label: string
  value: string
  sub?: string
  colorClass?: string
}) {
  return (
    <div className="bg-white border border-[#e2e8f0] rounded px-4 py-3 shadow-sm">
      <div className="text-[9px] font-black uppercase tracking-widest text-[#94a3b8] mb-0.5">{label}</div>
      {sub && <div className="text-[10px] text-[#94a3b8]">{sub}</div>}
      <div className={`text-lg font-black tabular-nums text-[#0f172a] mt-1 ${colorClass}`}>{value}</div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export function PayrollAnalyticsClient({ companyId }: Props) {
  const [months, setMonths] = useState<6 | 12>(12)

  const { data, isLoading, isError } = useQuery<{ report: PayrollAnalyticsReport }>({
    queryKey: ['payroll-analytics', companyId, months],
    queryFn:  async () => {
      const res = await fetch(`/api/finance/payroll-analytics?months=${months}`)
      if (!res.ok) throw new Error('Maaş verisi yüklenemedi')
      return res.json()
    },
    staleTime: 5 * 60 * 1000,
  })

  // ── Loading state ─────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="bg-white border border-[#e2e8f0] rounded p-6 shadow-sm">
        <div className="animate-pulse space-y-3">
          <div className="h-4 bg-[#f1f5f9] rounded w-48" />
          <div className="h-24 bg-[#f1f5f9] rounded" />
          <div className="h-32 bg-[#f1f5f9] rounded" />
        </div>
      </div>
    )
  }

  // ── Error state ───────────────────────────────────────────────────────────
  if (isError || !data?.report) {
    return (
      <div className="bg-white border border-[#e2e8f0] rounded p-6 shadow-sm text-center">
        <p className="text-sm text-[#64748b] font-medium">Maaş verisi yüklenirken hata oluştu.</p>
      </div>
    )
  }

  const report = data.report

  // ── Empty state ────────────────────────────────────────────────────────────
  const hasSalaryData = report.monthly_data.some(m => m.salary_try > 0)
  if (!hasSalaryData) {
    return (
      <div className="bg-white border border-[#e2e8f0] rounded p-8 shadow-sm text-center">
        <div className="w-10 h-10 rounded-full bg-[#f1f5f9] mx-auto mb-3 flex items-center justify-center">
          <span className="text-[#94a3b8] text-lg font-bold">—</span>
        </div>
        <p className="text-sm text-[#64748b] font-medium">Maaş gider verisi bulunamadı</p>
        <p className="text-[#94a3b8] text-xs mt-1">
          Gider kategorisi &quot;maaş&quot; olan kayıt eklendiğinde analiz otomatik hesaplanır.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">

      {/* ── Header + period selector ────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">
            Maaş / Bordro Analitiği
          </h3>
        </div>
        <div className="flex gap-1 border border-[#e2e8f0] rounded overflow-hidden">
          {([6, 12] as const).map(m => (
            <button
              key={m}
              onClick={() => setMonths(m)}
              className={`px-3 py-1 text-[11px] font-bold transition-colors ${
                months === m
                  ? 'bg-[#0f172a] text-white'
                  : 'bg-white text-[#64748b] hover:bg-[#f8fafc]'
              }`}
            >
              {m} Ay
            </button>
          ))}
        </div>
      </div>

      {/* ── Salary is largest expense warning ────────────────────────────── */}
      {report.salary_as_largest_expense && (
        <div className="rounded border border-yellow-200 bg-yellow-50 px-4 py-3 flex items-start gap-3">
          <span className="w-1.5 h-1.5 rounded-full bg-yellow-500 shrink-0 mt-1.5" />
          <p className="text-xs font-semibold text-yellow-800">
            Maaş giderleri bu ay en büyük gider kalemi
          </p>
        </div>
      )}

      {/* ── Summary KPI strip ────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard
          label="Bu Ay Maaş"
          value={fmtTRY(report.current_month_salary_try, 0)}
          sub="Aylık bordro toplamı"
        />
        <KpiCard
          label="Maaş / Ciro Oranı"
          value={
            report.current_payroll_ratio_pct !== null
              ? fmtPct(report.current_payroll_ratio_pct)
              : '—'
          }
          sub="Bu ay"
          colorClass={ratioColor(report.current_payroll_ratio_pct)}
        />
        <KpiCard
          label="YTD Maaş Toplamı"
          value={fmtTRY(report.ytd_salary_try, 0)}
          sub="Yıl başından bugüne"
        />
        <KpiCard
          label="YTD SGK Tahmini"
          value={fmtTRY(report.ytd_sgk_estimate_try, 0)}
          sub="İşveren ~%20,5"
        />
      </div>

      {/* ── Ratio status + trend row ──────────────────────────────────────── */}
      <div className="bg-white border border-[#e2e8f0] rounded p-4 shadow-sm flex flex-wrap items-center gap-4">
        <div>
          <div className="text-[9px] font-black uppercase tracking-widest text-[#94a3b8] mb-1.5">Oran Durumu</div>
          <RatioStatusBadge status={report.payroll_ratio_status} />
        </div>
        <div className="w-px h-8 bg-[#e2e8f0] hidden sm:block" />
        <div>
          <div className="text-[9px] font-black uppercase tracking-widest text-[#94a3b8] mb-1.5">Maaş Trendi</div>
          <TrendArrow trend={report.salary_trend} />
        </div>
        <div className="w-px h-8 bg-[#e2e8f0] hidden sm:block" />
        <div>
          <div className="text-[9px] font-black uppercase tracking-widest text-[#94a3b8] mb-1.5">Aylık Ortalama</div>
          <span className="text-sm font-black tabular-nums text-[#0f172a]">
            {fmtTRY(report.avg_monthly_salary_try, 0)}
          </span>
        </div>
      </div>

      {/* ── SGK deadline card ─────────────────────────────────────────────── */}
      {report.next_sgk_due_date && (
        <div className="bg-blue-50 border border-blue-200 rounded px-4 py-3 flex items-start gap-3">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0 mt-1.5" />
          <div>
            <p className="text-xs font-semibold text-blue-800">
              Bir sonraki SGK ödemesi:{' '}
              <span className="font-black">{fmtDate(report.next_sgk_due_date)}</span>
              {report.current_month_salary_try > 0 && (
                <> — ~{fmtTRY(report.current_month_salary_try * 0.205, 0)}</>
              )}
            </p>
            <p className="text-[10px] text-blue-600 mt-0.5">
              İşveren SGK payı tahmini (%20,5 oran ile hesaplanmıştır)
            </p>
          </div>
        </div>
      )}

      {/* ── Monthly breakdown table ───────────────────────────────────────── */}
      <div className="bg-white border border-[#e2e8f0] rounded p-5 shadow-sm overflow-x-auto">
        <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-4">
          Aylık Maaş Dağılımı — Son {months} Ay
        </div>
        <table className="w-full text-xs border-collapse min-w-[560px]">
          <thead>
            <tr className="border-b border-[#e2e8f0]">
              {['Dönem', 'Maaş', 'Ciro', 'Bordro / Ciro', 'Aylık Değişim'].map(h => (
                <th
                  key={h}
                  className="text-right first:text-left py-2 px-2 text-[10px] font-black uppercase tracking-wide text-[#94a3b8] whitespace-nowrap"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {report.monthly_data.map((row) => {
              const ratioClass = row.payroll_ratio_pct === null
                ? 'text-slate-400'
                : row.payroll_ratio_pct < 20
                ? 'text-green-700 font-bold'
                : row.payroll_ratio_pct < 35
                ? 'text-teal-700 font-bold'
                : row.payroll_ratio_pct <= 50
                ? 'text-yellow-700 font-bold'
                : 'text-red-700 font-bold'

              const growthClass = row.payroll_growth_pct === null
                ? 'text-slate-400'
                : row.payroll_growth_pct > 0
                ? 'text-red-600'
                : row.payroll_growth_pct < 0
                ? 'text-green-600'
                : 'text-slate-500'

              return (
                <tr key={row.month_key} className="border-t border-[#f1f5f9] hover:bg-[#f8fafc]">
                  <td className="py-2 px-2 text-left text-[11px] font-semibold text-[#334155] whitespace-nowrap">
                    {row.month_label}
                  </td>
                  <td className="py-2 px-2 text-right tabular-nums text-[11px] text-[#1e293b]">
                    {row.salary_try > 0 ? fmtTRY(row.salary_try, 0) : '—'}
                  </td>
                  <td className="py-2 px-2 text-right tabular-nums text-[11px] text-[#1e293b]">
                    {row.revenue_try > 0 ? fmtTRY(row.revenue_try, 0) : '—'}
                  </td>
                  <td className={`py-2 px-2 text-right tabular-nums text-[11px] ${ratioClass}`}>
                    {row.payroll_ratio_pct !== null ? fmtPct(row.payroll_ratio_pct) : '—'}
                  </td>
                  <td className={`py-2 px-2 text-right tabular-nums text-[11px] ${growthClass}`}>
                    {row.payroll_growth_pct !== null
                      ? fmtDelta(row.payroll_growth_pct)
                      : '—'}
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
