'use client'
// ── CustomerCreditClient — Customer Credit Scoring Dashboard ──────────────────
// Fetches /api/commercial/customer-credit via TanStack Query.
// Features:
//   • Grade distribution bar chart (CSS): A/B/C/D/F counts
//   • Summary strip: Total Customers / Avg Score / High Risk Count / Total Limits
//   • High-risk alert: grade D/F customers with outstanding > 0
//   • Customer credit table: sorted by credit_score desc (toggle)
//   • Grade badges: A=green / B=teal / C=yellow / D=orange / F=red
//   • Empty state: "Müşteri verisi bulunamadı"

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type {
  CustomerCreditReport,
  CustomerCreditProfile,
} from '@/lib/services/commercial/customer-credit.service'

// ── Formatters ────────────────────────────────────────────────────────────────

const TRY_FMT = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 })

function fmtTRY(n: number): string {
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return `₺${(n / 1_000_000).toFixed(2)}M`
  if (abs >= 1_000)     return `₺${(n / 1_000).toFixed(1)}K`
  return `₺${TRY_FMT.format(Math.round(n))}`
}

function fmtPct(n: number | null): string {
  if (n === null) return '—'
  return `%${n.toFixed(1)}`
}

// ── Grade config ──────────────────────────────────────────────────────────────

const GRADE_CFG = {
  A: { bg: 'bg-emerald-100', text: 'text-emerald-800', bar: 'bg-emerald-500', label: 'A — Mükemmel' },
  B: { bg: 'bg-teal-100',    text: 'text-teal-800',    bar: 'bg-teal-500',    label: 'B — İyi'      },
  C: { bg: 'bg-yellow-100',  text: 'text-yellow-800',  bar: 'bg-yellow-500',  label: 'C — Orta'     },
  D: { bg: 'bg-orange-100',  text: 'text-orange-800',  bar: 'bg-orange-500',  label: 'D — Zayıf'    },
  F: { bg: 'bg-red-100',     text: 'text-red-800',     bar: 'bg-red-500',     label: 'F — Riskli'   },
} as const

type Grade = keyof typeof GRADE_CFG

function GradeBadge({ grade }: { grade: Grade }) {
  const cfg = GRADE_CFG[grade]
  return (
    <span className={`inline-block text-[9px] font-black uppercase tracking-wide px-2 py-0.5 rounded ${cfg.bg} ${cfg.text}`}>
      {grade}
    </span>
  )
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="bg-white border border-[#e2e8f0] rounded px-4 py-3 space-y-3 animate-pulse">
      <div className="h-3 w-52 bg-[#f1f5f9] rounded" />
      <div className="grid grid-cols-4 gap-3">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="h-14 bg-[#f1f5f9] rounded" />
        ))}
      </div>
      <div className="h-48 bg-[#f8fafc] rounded" />
    </div>
  )
}

// ── Grade distribution chart ──────────────────────────────────────────────────

function GradeDistribution({ dist, total }: { dist: CustomerCreditReport['grade_distribution']; total: number }) {
  const grades: Grade[] = ['A', 'B', 'C', 'D', 'F']
  const maxCount = Math.max(...grades.map(g => dist[g]), 1)

  return (
    <div className="space-y-2">
      {grades.map(g => {
        const count  = dist[g]
        const barPct = (count / maxCount) * 100
        const share  = total > 0 ? ((count / total) * 100).toFixed(0) : '0'
        const cfg    = GRADE_CFG[g]
        return (
          <div key={g} className="flex items-center gap-3">
            <div className="w-24 text-[11px] font-bold text-[#334155] shrink-0">{cfg.label}</div>
            <div className="flex-1 h-5 bg-[#f1f5f9] rounded overflow-hidden">
              {count > 0 && (
                <div className={`h-5 rounded ${cfg.bar}`} style={{ width: `${barPct}%` }} />
              )}
            </div>
            <div className="w-16 text-right shrink-0 tabular-nums">
              <span className="text-xs font-bold text-[#334155]">{count}</span>
              <span className="text-[10px] text-[#94a3b8] ml-1">%{share}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  companyId: string
}

interface ApiResponse {
  report: CustomerCreditReport
}

export default function CustomerCreditClient({ companyId: _companyId }: Props) {
  const [sortAsc, setSortAsc] = useState(false)

  const { data, isLoading, error } = useQuery<ApiResponse>({
    queryKey: ['customer-credit', _companyId],
    queryFn: async () => {
      const res = await fetch('/api/commercial/customer-credit')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json() as Promise<ApiResponse>
    },
    staleTime: 60 * 60 * 1000, // 1 hour
  })

  if (isLoading) return <Skeleton />
  if (error)     return null

  const report = data?.report

  // Empty state
  if (!report || report.total_customers === 0) {
    return (
      <div className="bg-white border border-[#e2e8f0] rounded px-4 py-6 text-center">
        <p className="text-sm text-[#94a3b8]">Müşteri verisi bulunamadı</p>
      </div>
    )
  }

  // Sort customers
  const sortedCustomers: CustomerCreditProfile[] = [...report.all_customers].sort(
    (a, b) => sortAsc ? a.credit_score - b.credit_score : b.credit_score - a.credit_score,
  )

  // High-risk customers with outstanding > 0
  const alertCustomers = report.high_risk_customers.filter(c => c.current_outstanding_try > 0)

  return (
    <div className="bg-white border border-[#e2e8f0] rounded overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-[#f1f5f9]">
        <span className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">
          Müşteri Kredi Skoru
        </span>
      </div>

      {/* Summary KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-0 divide-x divide-[#e2e8f0] border-b border-[#e2e8f0]">
        <div className="p-3">
          <div className="text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8] mb-1">Toplam Müşteri</div>
          <div className="text-xl font-black tabular-nums text-[#0f172a] leading-none">{report.total_customers}</div>
        </div>
        <div className="p-3">
          <div className="text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8] mb-1">Ort. Kredi Skoru</div>
          <div className={`text-xl font-black tabular-nums leading-none ${
            report.avg_credit_score >= 65 ? 'text-emerald-700'
            : report.avg_credit_score >= 50 ? 'text-yellow-700'
            : 'text-red-700'
          }`}>
            {report.avg_credit_score.toFixed(1)}
          </div>
        </div>
        <div className="p-3">
          <div className="text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8] mb-1">Yüksek Risk</div>
          <div className={`text-xl font-black tabular-nums leading-none ${
            report.high_risk_customers.length > 0 ? 'text-red-700' : 'text-emerald-700'
          }`}>
            {report.high_risk_customers.length > 0 ? report.high_risk_customers.length : '—'}
          </div>
          <div className="text-[9px] text-[#94a3b8] mt-0.5">D / F dereceli müşteri</div>
        </div>
        <div className="p-3">
          <div className="text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8] mb-1">Toplam Kredi Limiti</div>
          <div className="text-xl font-black tabular-nums leading-none text-brand">
            {fmtTRY(report.total_recommended_limits_try)}
          </div>
          <div className="text-[9px] text-[#94a3b8] mt-0.5">
            {fmtTRY(report.total_current_outstanding_try)} açık bakiye
          </div>
        </div>
      </div>

      {/* High-risk alert */}
      {alertCustomers.length > 0 && (
        <div className="mx-4 my-3 bg-red-50 border border-red-200 rounded px-3 py-2">
          <div className="text-[11px] font-black uppercase tracking-wide text-red-800 mb-1">
            Yüksek Risk Uyarısı — {alertCustomers.length} Müşteri
          </div>
          <div className="text-xs text-red-700">
            D veya F dereceli müşterilerin toplam açık bakiyesi:{' '}
            <strong>
              {fmtTRY(alertCustomers.reduce((s, c) => s + c.current_outstanding_try, 0))}
            </strong>
          </div>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {alertCustomers.slice(0, 5).map(c => (
              <span key={c.customer_name} className="text-[10px] bg-red-100 text-red-800 px-1.5 py-0.5 rounded font-medium">
                {c.customer_name} — {fmtTRY(c.current_outstanding_try)}
              </span>
            ))}
            {alertCustomers.length > 5 && (
              <span className="text-[10px] text-red-600">+{alertCustomers.length - 5} daha</span>
            )}
          </div>
        </div>
      )}

      {/* Grade distribution */}
      <div className="px-4 pt-3 pb-2 border-b border-[#f1f5f9]">
        <div className="text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8] mb-2">
          Derece Dağılımı
        </div>
        <GradeDistribution dist={report.grade_distribution} total={report.total_customers} />
      </div>

      {/* Customer credit table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-[#f1f5f9]">
              <th className="text-left px-4 py-2 text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8]">
                Müşteri
              </th>
              <th className="text-center px-3 py-2 text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8] w-20">
                <button
                  onClick={() => setSortAsc(v => !v)}
                  className="flex items-center gap-1 mx-auto hover:text-brand transition-colors"
                  title="Sırala"
                >
                  Skor {sortAsc ? '↑' : '↓'}
                </button>
              </th>
              <th className="text-center px-3 py-2 text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8] w-16">
                Derece
              </th>
              <th className="text-right px-3 py-2 text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8] w-28">
                Limit
              </th>
              <th className="text-right px-3 py-2 text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8] w-28">
                Açık Bakiye
              </th>
              <th className="text-right px-3 py-2 text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8] w-20">
                Bakiye %
              </th>
              <th className="text-center px-3 py-2 text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8] w-24 hidden sm:table-cell">
                Geç (30/60/90+)
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#f8fafc]">
            {sortedCustomers.map(c => {
              const isHighRisk = c.credit_grade === 'D' || c.credit_grade === 'F'
              return (
                <tr
                  key={c.customer_name}
                  className={`hover:bg-[#f8fafc]/60 ${isHighRisk ? 'bg-red-50/30' : ''}`}
                >
                  <td className="px-4 py-2">
                    <div className="text-[11px] font-bold text-[#1e293b] truncate max-w-[150px]" title={c.customer_name}>
                      {c.customer_name}
                    </div>
                    <div className="text-[9px] text-[#94a3b8] mt-0.5">
                      {c.total_orders} sipariş · {c.orders_per_month.toFixed(1)}/ay
                    </div>
                  </td>
                  <td className="px-3 py-2 text-center">
                    <div className="text-sm font-black tabular-nums text-[#0f172a]">{c.credit_score}</div>
                    <div className="w-16 h-1 bg-[#f1f5f9] rounded-full overflow-hidden mx-auto mt-1">
                      <div
                        className={`h-full rounded-full ${GRADE_CFG[c.credit_grade].bar}`}
                        style={{ width: `${c.credit_score}%` }}
                      />
                    </div>
                  </td>
                  <td className="px-3 py-2 text-center">
                    <GradeBadge grade={c.credit_grade} />
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-[11px] font-medium text-[#334155]">
                    {c.recommended_limit_try > 0 ? fmtTRY(c.recommended_limit_try) : '—'}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-[11px]">
                    {c.current_outstanding_try > 0 ? (
                      <span className={isHighRisk ? 'text-red-700 font-bold' : 'text-[#334155]'}>
                        {fmtTRY(c.current_outstanding_try)}
                      </span>
                    ) : (
                      <span className="text-[#94a3b8]">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-[11px]">
                    {c.outstanding_vs_limit_pct !== null ? (
                      <span className={
                        c.outstanding_vs_limit_pct > 100 ? 'text-red-700 font-bold'
                        : c.outstanding_vs_limit_pct > 80 ? 'text-orange-600'
                        : 'text-[#94a3b8]'
                      }>
                        {fmtPct(c.outstanding_vs_limit_pct)}
                      </span>
                    ) : (
                      <span className="text-[#cbd5e1]">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-center text-[10px] text-[#64748b] hidden sm:table-cell">
                    <span className="text-yellow-700">{c.late_30_count}</span>
                    <span className="text-[#94a3b8] mx-0.5">/</span>
                    <span className="text-orange-600">{c.late_60_count}</span>
                    <span className="text-[#94a3b8] mx-0.5">/</span>
                    <span className="text-red-700">{c.late_90plus_count}</span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Footer note */}
      <div className="px-4 py-2 border-t border-[#f8fafc] text-[9px] text-[#cbd5e1]">
        Kredi skoru: %40 ödeme geçmişi · %30 sipariş tutarlılığı · %20 ilişki yaşı · %10 hacim.
        A≥80 / B 65-79 / C 50-64 / D 35-49 / F&lt;35
      </div>
    </div>
  )
}
