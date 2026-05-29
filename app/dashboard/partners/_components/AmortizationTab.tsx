'use client'

// ─────────────────────────────────────────────────────────────────────────────
// AmortizationTab — Amortisman Takvimi + Faiz Tahakkuku + Vade Takvimi
//
// Per-tranche monthly payment schedule (up to 60 months).
// Summary strip + expandable tranche detail with full amortization table.
// Row colors: gray = past, white = current, light blue = future.
//
// Also shows a "Faiz Tahakkuku" interest accrual section:
//   - Portfolio summary: outstanding principal, YTD accrual, outstanding interest
//   - VUK örtülü kazanç risk alert
//   - Market rate reference chip
//   - Per-tranche accrual table with compliance coloring
//   - Next month interest obligation chip
//
// Also shows a "Vade Takvimi" debt maturity section:
//   - 5-bucket maturity bar chart
//   - Refinancing pressure score chip
//   - Concentration warnings
//   - 36-month month-by-month schedule table
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fmtTRY, fmtDate } from '@/lib/format'
import type {
  LoanAmortizationReport,
  TrancheAmortization,
  AmortizationRow,
} from '@/lib/services/pcle/amortization.service'
import type { DebtMaturityReport } from '@/lib/services/pcle/debt-maturity.service'
import type { InterestAccrualReport } from '@/lib/services/pcle/interest-accrual.service'
import type {
  AmortizationReport,
  LoanAmortizationSchedule,
} from '@/lib/services/pcle/amortization-schedule.service'

// ── API fetch hooks ───────────────────────────────────────────────────────────

function useDebtMaturityReport() {
  const [report, setReport] = useState<DebtMaturityReport | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)

  async function load() {
    if (loaded) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/partners/debt-maturity')
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(body.error ?? `HTTP ${res.status}`)
      }
      const json = await res.json() as { report: DebtMaturityReport }
      setReport(json.report)
      setLoaded(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Vade verisi yüklenemedi')
    } finally {
      setLoading(false)
    }
  }

  return { report, loading, error, load, loaded }
}

function useAmortizationReport() {
  const [report, setReport] = useState<LoanAmortizationReport | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)

  async function load() {
    if (loaded) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/partners/amortization')
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(body.error ?? `HTTP ${res.status}`)
      }
      const json = await res.json() as { report: LoanAmortizationReport }
      setReport(json.report)
      setLoaded(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Veri yüklenemedi')
    } finally {
      setLoading(false)
    }
  }

  return { report, loading, error, load, loaded }
}

function useInterestAccrualReport() {
  return useQuery<InterestAccrualReport>({
    queryKey: ['partners', 'interest-accrual'],
    queryFn: async () => {
      const res = await fetch('/api/partners/interest-accrual')
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(body.error ?? `HTTP ${res.status}`)
      }
      const json = await res.json() as { report: InterestAccrualReport }
      return json.report
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  })
}

function useAmortizationScheduleReport(companyId: string) {
  return useQuery<AmortizationReport>({
    queryKey: ['amortization-schedule', companyId],
    queryFn: async () => {
      const res = await fetch('/api/partners/amortization-schedule')
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(body.error ?? `HTTP ${res.status}`)
      }
      const json = await res.json() as { report: AmortizationReport }
      return json.report
    },
    staleTime: 60 * 60 * 1000, // 1 hour
  })
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function pctFmt(rate: number): string {
  return `%${(rate * 100).toLocaleString('tr-TR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 2,
  })}`
}

// ── Summary strip ─────────────────────────────────────────────────────────────

function SummaryStrip({ report }: { report: LoanAmortizationReport }) {
  const items = [
    { label: 'Toplam Bakiye', value: fmtTRY(report.total_outstanding_try) },
    { label: 'Aylık Servis', value: fmtTRY(report.total_monthly_service_try) },
    {
      label: 'Ağırlıklı Faiz',
      value:
        report.weighted_avg_rate !== null
          ? pctFmt(report.weighted_avg_rate)
          : '—',
    },
    { label: 'Kalan Toplam Faiz', value: fmtTRY(report.total_interest_remaining_try) },
  ]

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {items.map(({ label, value }) => (
        <div
          key={label}
          className="rounded border border-[#e2e8f0] bg-[#f8fafc] px-4 py-3"
        >
          <div className="text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8] mb-1">
            {label}
          </div>
          <div className="text-base font-black text-[#0f172a] leading-tight tabular-nums">
            {value}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Amortization table ────────────────────────────────────────────────────────

function ScheduleTable({ rows }: { rows: AmortizationRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="text-xs text-[#94a3b8] py-3 text-center">
        Amortisman takvimi hesaplanamadı.
      </p>
    )
  }

  return (
    <div className="overflow-x-auto mt-3">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="border-b border-[#e2e8f0]">
            <th className="py-1.5 px-2 text-left font-semibold text-[#64748b] whitespace-nowrap">#</th>
            <th className="py-1.5 px-2 text-left font-semibold text-[#64748b] whitespace-nowrap">Dönem</th>
            <th className="py-1.5 px-2 text-right font-semibold text-[#64748b] whitespace-nowrap">Açılış Bakiye</th>
            <th className="py-1.5 px-2 text-right font-semibold text-[#64748b] whitespace-nowrap">Faiz</th>
            <th className="py-1.5 px-2 text-right font-semibold text-[#64748b] whitespace-nowrap">Anapara</th>
            <th className="py-1.5 px-2 text-right font-semibold text-[#64748b] whitespace-nowrap">Kapanış Bakiye</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const bg = row.is_past
              ? 'bg-[#f1f5f9] text-[#94a3b8]'
              : row.is_current
              ? 'bg-white font-semibold text-[#0f172a]'
              : 'bg-[#f8fafc] text-[#334155]'

            return (
              <tr
                key={row.period_number}
                className={`border-b border-[#f1f5f9] ${bg}`}
              >
                <td className="py-1 px-2 tabular-nums">{row.period_number}</td>
                <td className="py-1 px-2 whitespace-nowrap">
                  {row.month_label}
                  {row.is_current && (
                    <span className="ml-1.5 text-[0.55rem] font-black uppercase tracking-widest text-blue-500">
                      Şimdi
                    </span>
                  )}
                </td>
                <td className="py-1 px-2 text-right tabular-nums">
                  {fmtTRY(row.opening_balance_try)}
                </td>
                <td className="py-1 px-2 text-right tabular-nums text-amber-600">
                  {fmtTRY(row.interest_try)}
                </td>
                <td className="py-1 px-2 text-right tabular-nums">
                  {fmtTRY(row.principal_try)}
                </td>
                <td className="py-1 px-2 text-right tabular-nums">
                  {fmtTRY(row.closing_balance_try)}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ── Tranche card ──────────────────────────────────────────────────────────────

function TrancheCard({ tranche }: { tranche: TrancheAmortization }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="rounded border border-[#e2e8f0] overflow-hidden">
      {/* Summary row (always visible) */}
      <button
        onClick={() => setExpanded(prev => !prev)}
        className="w-full text-left bg-white hover:bg-[#f8fafc] transition-colors px-4 py-3 flex items-center gap-3"
      >
        <span
          className={`text-[#94a3b8] transition-transform text-xs ${expanded ? 'rotate-90' : ''}`}
          aria-hidden
        >
          ▶
        </span>

        <div className="flex-1 grid grid-cols-2 gap-x-4 gap-y-0.5 sm:grid-cols-4">
          <div>
            <div className="text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8]">
              Ortak
            </div>
            <div className="text-xs font-semibold text-[#0f172a] truncate">
              {tranche.partner_name}
            </div>
          </div>
          <div>
            <div className="text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8]">
              Bakiye
            </div>
            <div className="text-xs font-semibold text-[#0f172a] tabular-nums">
              {fmtTRY(tranche.outstanding_try)}
            </div>
          </div>
          <div>
            <div className="text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8]">
              Aylık Ödeme
            </div>
            <div className="text-xs font-semibold text-[#0f172a] tabular-nums">
              {fmtTRY(tranche.monthly_payment_try)}
            </div>
          </div>
          <div>
            <div className="text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8]">
              Faiz Oranı
            </div>
            <div className="text-xs font-semibold text-[#0f172a]">
              {pctFmt(tranche.annual_interest_rate)} / yıl
            </div>
          </div>
        </div>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-[#e2e8f0] px-4 pb-4 bg-[#f8fafc]">
          {/* Tranche summary stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 pb-1">
            <div>
              <div className="text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8]">
                Kullandırılan
              </div>
              <div className="text-xs font-semibold text-[#0f172a] tabular-nums">
                {fmtTRY(tranche.disbursed_try)}
              </div>
            </div>
            <div>
              <div className="text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8]">
                Kalan Toplam Faiz
              </div>
              <div className="text-xs font-semibold text-amber-600 tabular-nums">
                {fmtTRY(tranche.total_interest_remaining_try)}
              </div>
            </div>
            <div>
              <div className="text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8]">
                Toplam Kalan Ödeme
              </div>
              <div className="text-xs font-semibold text-[#0f172a] tabular-nums">
                {fmtTRY(tranche.total_payment_remaining_try)}
              </div>
            </div>
            <div>
              <div className="text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8]">
                Kapanış Ayı
              </div>
              <div className="text-xs font-semibold text-[#0f172a]">
                {tranche.payoff_month ?? 'Açık uçlu (60+ ay)'}
              </div>
            </div>
          </div>

          <ScheduleTable rows={tranche.schedule} />
        </div>
      )}
    </div>
  )
}

// ── Faiz Tahakkuku — Interest Accrual Section ─────────────────────────────────

function RateChip({ ratePct, marketRatePct }: { ratePct: number; marketRatePct: number }) {
  if (ratePct === 0) {
    return (
      <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[0.6rem] font-black uppercase tracking-wide bg-red-50 border border-red-200 text-red-700">
        %0
      </span>
    )
  }
  if (ratePct < marketRatePct * 0.5) {
    return (
      <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[0.6rem] font-black uppercase tracking-wide bg-orange-50 border border-orange-200 text-orange-700">
        %{ratePct.toFixed(1)}
      </span>
    )
  }
  return (
    <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[0.6rem] font-black uppercase tracking-wide bg-emerald-50 border border-emerald-200 text-emerald-700">
      %{ratePct.toFixed(1)}
    </span>
  )
}

function FaizTahakkuku() {
  const { data: report, isLoading, isError, error } = useInterestAccrualReport()

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-7 rounded bg-[#f1f5f9] animate-pulse" />
        ))}
      </div>
    )
  }

  if (isError) {
    return (
      <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700 font-medium">
        {error instanceof Error ? error.message : 'Faiz tahakkuk verisi yüklenemedi'}
      </div>
    )
  }

  if (!report) return null

  const { tranches } = report

  return (
    <div className="flex flex-col gap-4">
      {/* Portfolio summary */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded border border-[#e2e8f0] bg-[#f8fafc] px-4 py-3">
          <div className="text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8] mb-1">
            Toplam Anapara
          </div>
          <div className="text-base font-black text-[#0f172a] leading-tight tabular-nums">
            {fmtTRY(report.total_outstanding_principal)}
          </div>
        </div>
        <div className="rounded border border-[#e2e8f0] bg-[#f8fafc] px-4 py-3">
          <div className="text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8] mb-1">
            YTD Tahakkuk
          </div>
          <div className="text-base font-black text-amber-600 leading-tight tabular-nums">
            {fmtTRY(report.total_accrued_ytd)}
          </div>
        </div>
        <div className="rounded border border-[#e2e8f0] bg-[#f8fafc] px-4 py-3">
          <div className="text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8] mb-1">
            Ödenmemiş Faiz
          </div>
          <div className="text-base font-black text-[#0f172a] leading-tight tabular-nums">
            {fmtTRY(report.total_outstanding_interest)}
          </div>
        </div>
      </div>

      {/* VUK risk alert */}
      {report.vuk_risk_count > 0 && (
        <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-[0.7rem] font-semibold text-red-800">
          ⚠ {report.vuk_risk_count} tranche VUK örtülü kazanç riski — sıfır faizli büyük borç
        </div>
      )}

      {/* Reference rate + next month obligation chips */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="inline-flex items-center gap-1.5 rounded border border-[#e2e8f0] bg-[#f8fafc] px-3 py-1.5">
          <span className="text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8]">
            Referans Faiz
          </span>
          <span className="text-sm font-black text-[#0f172a]">%{report.market_rate_pct}</span>
        </div>
        {report.next_month_interest_try > 0 && (
          <div className="inline-flex items-center gap-1.5 rounded border border-amber-200 bg-amber-50 px-3 py-1.5">
            <span className="text-[0.6rem] font-black uppercase tracking-widest text-amber-700">
              Gelecek ay faiz yükü
            </span>
            <span className="text-sm font-black text-amber-800 tabular-nums">
              {fmtTRY(report.next_month_interest_try)}
            </span>
          </div>
        )}
        {report.weighted_avg_rate !== null && (
          <span className="text-[0.7rem] text-[#64748b]">
            Ağırlıklı ort. faiz:{' '}
            <strong className="text-[#334155]">%{report.weighted_avg_rate.toFixed(2)}</strong>
          </span>
        )}
      </div>

      {/* Per-tranche table */}
      {tranches.length === 0 ? (
        <p className="text-xs text-[#94a3b8] py-2 text-center">
          Tahakkuk hesaplanacak aktif tranche bulunamadı.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b border-[#e2e8f0]">
                <th className="py-1.5 px-2 text-left font-semibold text-[#64748b] whitespace-nowrap">Ortak</th>
                <th className="py-1.5 px-2 text-right font-semibold text-[#64748b] whitespace-nowrap">Anapara</th>
                <th className="py-1.5 px-2 text-right font-semibold text-[#64748b] whitespace-nowrap">Faiz</th>
                <th className="py-1.5 px-2 text-right font-semibold text-[#64748b] whitespace-nowrap">₺/gün</th>
                <th className="py-1.5 px-2 text-right font-semibold text-[#64748b] whitespace-nowrap">Aylık</th>
                <th className="py-1.5 px-2 text-right font-semibold text-[#64748b] whitespace-nowrap">YTD</th>
                <th className="py-1.5 px-2 text-right font-semibold text-[#64748b] whitespace-nowrap">Ödenmemiş</th>
                <th className="py-1.5 px-2 text-center font-semibold text-[#64748b] whitespace-nowrap">Risk</th>
              </tr>
            </thead>
            <tbody>
              {tranches.map(t => (
                <tr
                  key={t.tranche_id}
                  className="border-b border-[#f1f5f9] bg-white hover:bg-[#f8fafc]"
                >
                  <td className="py-1 px-2 font-medium text-[#334155] whitespace-nowrap max-w-[140px] truncate">
                    {t.partner_name}
                  </td>
                  <td className="py-1 px-2 text-right tabular-nums text-[#0f172a]">
                    {fmtTRY(t.outstanding_principal)}
                  </td>
                  <td className="py-1 px-2 text-right">
                    <RateChip ratePct={t.interest_rate_annual_pct} marketRatePct={report.market_rate_pct} />
                  </td>
                  <td className="py-1 px-2 text-right tabular-nums text-[#334155]">
                    {fmtTRY(t.daily_interest_try)}
                  </td>
                  <td className="py-1 px-2 text-right tabular-nums text-amber-600">
                    {fmtTRY(t.monthly_accrual_try)}
                  </td>
                  <td className="py-1 px-2 text-right tabular-nums text-[#334155]">
                    {fmtTRY(t.ytd_accrual_try)}
                  </td>
                  <td className="py-1 px-2 text-right tabular-nums font-semibold text-[#0f172a]">
                    {fmtTRY(t.outstanding_interest_try)}
                  </td>
                  <td className="py-1 px-2 text-center">
                    {t.vuk_risk && (
                      <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[0.55rem] font-black uppercase tracking-wide bg-red-50 border border-red-200 text-red-700">
                        VUK
                      </span>
                    )}
                    {t.is_below_market && !t.vuk_risk && (
                      <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[0.55rem] font-black uppercase tracking-wide bg-orange-50 border border-orange-200 text-orange-700">
                        Düşük
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Vade Takvimi — Debt Maturity Section ─────────────────────────────────────

interface BucketBarItem {
  label: string
  amount: number
  pct: number
  color: string
  textColor: string
}

function MaturityBucketBar({ items, total }: { items: BucketBarItem[]; total: number }) {
  if (total <= 0) return (
    <p className="text-xs text-[#94a3b8] py-2 text-center">Vadelendirilebilir borç bulunamadı.</p>
  )

  return (
    <div className="flex flex-col gap-2">
      {items.map(item => {
        if (item.amount <= 0) return null
        const barWidth = Math.max(item.pct, 2)
        return (
          <div key={item.label} className="flex items-center gap-3">
            <div className="w-28 text-[0.65rem] font-semibold text-[#64748b] shrink-0 text-right">
              {item.label}
            </div>
            <div className="flex-1 h-5 bg-[#f1f5f9] rounded overflow-hidden">
              <div
                className={`h-full rounded flex items-center justify-end pr-2 ${item.color}`}
                style={{ width: `${barWidth}%` }}
              >
                {item.pct >= 8 && (
                  <span className={`text-[0.6rem] font-black tabular-nums ${item.textColor}`}>
                    {item.pct.toFixed(1)}%
                  </span>
                )}
              </div>
            </div>
            <div className="w-28 text-right text-[0.7rem] font-semibold text-[#0f172a] tabular-nums shrink-0">
              {fmtTRY(item.amount)}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function RefinancingScoreChip({ score }: { score: number }) {
  const rounded = Math.round(score)
  const color =
    rounded >= 70
      ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
      : rounded >= 40
      ? 'bg-amber-50 border-amber-200 text-amber-700'
      : 'bg-red-50 border-red-200 text-red-700'

  const label =
    rounded >= 70 ? 'Düşük Baskı' : rounded >= 40 ? 'Orta Baskı' : 'Yüksek Baskı'

  return (
    <div className={`inline-flex items-center gap-2 rounded border px-3 py-1.5 ${color}`}>
      <span className="text-[0.6rem] font-black uppercase tracking-widest">Yeniden Finansman Baskısı</span>
      <span className="text-base font-black tabular-nums">{rounded}</span>
      <span className="text-[0.65rem] font-semibold">/100</span>
      <span className="text-[0.65rem] font-semibold">·</span>
      <span className="text-[0.65rem] font-semibold">{label}</span>
    </div>
  )
}

function ConcentrationWarnings({
  concentrationMonth,
  concentrationPartner,
  schedule,
}: {
  concentrationMonth?: string
  concentrationPartner?: string
  schedule: Array<{ month: string; label: string; maturing_try: number; tranche_count: number; partner_ids: string[] }>
}) {
  const warnings: string[] = []

  if (concentrationMonth) {
    const entry = schedule.find(s => s.month === concentrationMonth)
    warnings.push(
      `Konsantrasyon Riski: ${entry?.label ?? concentrationMonth} ayında toplam borcun %30'undan fazlası vadesi doluyor.`,
    )
  }

  if (concentrationPartner) {
    warnings.push(
      `Ortak Konsantrasyonu: "${concentrationPartner}" — önümüzdeki 12 ayda olgunlaşan borcun %50'sinden fazlasından sorumlu.`,
    )
  }

  if (warnings.length === 0) return null

  return (
    <div className="flex flex-col gap-1.5">
      {warnings.map(w => (
        <div
          key={w}
          className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-[0.7rem] font-semibold text-amber-800"
        >
          ⚠ {w}
        </div>
      ))}
    </div>
  )
}

function MaturityScheduleTable({ schedule }: { schedule: Array<{ month: string; label: string; maturing_try: number; tranche_count: number; partner_ids: string[] }> }) {
  const nonEmpty = schedule.filter(s => s.maturing_try > 0)

  if (nonEmpty.length === 0) {
    return (
      <p className="text-xs text-[#94a3b8] py-3 text-center">
        Önümüzdeki 36 ayda vadesi dolacak borç bulunamadı.
      </p>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="border-b border-[#e2e8f0]">
            <th className="py-1.5 px-2 text-left font-semibold text-[#64748b] whitespace-nowrap">Ay</th>
            <th className="py-1.5 px-2 text-right font-semibold text-[#64748b] whitespace-nowrap">Vade Tutarı</th>
            <th className="py-1.5 px-2 text-right font-semibold text-[#64748b] whitespace-nowrap">Tranche</th>
          </tr>
        </thead>
        <tbody>
          {nonEmpty.map(row => (
            <tr key={row.month} className="border-b border-[#f1f5f9] bg-white hover:bg-[#f8fafc]">
              <td className="py-1 px-2 font-medium text-[#334155] whitespace-nowrap">{row.label}</td>
              <td className="py-1 px-2 text-right tabular-nums font-semibold text-[#0f172a]">
                {fmtTRY(row.maturing_try)}
              </td>
              <td className="py-1 px-2 text-right tabular-nums text-[#64748b]">
                {row.tranche_count}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function VadeTakvimi() {
  const { report, loading, error, load, loaded } = useDebtMaturityReport()

  if (!loaded && !loading && !error) {
    load()
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-2">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-7 rounded bg-[#f1f5f9] animate-pulse" />
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700 font-medium">
        {error}
      </div>
    )
  }

  if (!report) return null

  // Map new DebtMaturityReport shape to local display variables
  const total = report.total_outstanding_try
  const ladder = report.maturity_ladder
  const getBucket = (key: string) => ladder.find(b => b.bucket_key === key)
  const overdueTry  = getBucket('overdue')?.principal_try ?? 0
  const immTry      = getBucket('days_0_30')?.principal_try ?? 0
  const shortTry    = getBucket('days_31_90')?.principal_try ?? 0
  const medTry      = (getBucket('days_91_180')?.principal_try ?? 0) +
                      (getBucket('days_181_365')?.principal_try ?? 0)
  const longTry     = getBucket('over_1_year')?.principal_try ?? 0

  const buckets: BucketBarItem[] = [
    {
      label: 'Vadesi Geçmiş',
      amount: overdueTry,
      pct: total > 0 ? (overdueTry / total) * 100 : 0,
      color: 'bg-red-400',
      textColor: 'text-white',
    },
    {
      label: '0–30 gün',
      amount: immTry,
      pct: total > 0 ? (immTry / total) * 100 : 0,
      color: 'bg-orange-400',
      textColor: 'text-white',
    },
    {
      label: '31–90 gün',
      amount: shortTry,
      pct: total > 0 ? (shortTry / total) * 100 : 0,
      color: 'bg-amber-400',
      textColor: 'text-white',
    },
    {
      label: '91–365 gün',
      amount: medTry,
      pct: total > 0 ? (medTry / total) * 100 : 0,
      color: 'bg-yellow-300',
      textColor: 'text-yellow-900',
    },
    {
      label: '1 yıl+',
      amount: longTry,
      pct: total > 0 ? (longTry / total) * 100 : 0,
      color: 'bg-emerald-400',
      textColor: 'text-white',
    },
  ]

  // Derive a 0-100 score from refinancing_risk for the chip
  const riskScoreMap: Record<string, number> = {
    no_debt: 100,
    low: 80,
    moderate: 50,
    high: 25,
    critical: 5,
  }
  const refinancingScore = riskScoreMap[report.refinancing_risk] ?? 50

  // Compute next-12m pct from ladder buckets
  const near12m = overdueTry + immTry + shortTry + medTry
  const next12mPct = total > 0 ? (near12m / total) * 100 : 0

  // Build a schedule-like array from maturity cliffs for concentration warnings
  const scheduleForWarnings = report.maturity_cliffs.map(c => ({
    month: c.date.substring(0, 7),
    label: c.date,
    maturing_try: c.amount_try,
    tranche_count: 1,
    partner_ids: [],
  }))

  // Concentration partner from highest concentration entry
  const topPartner = report.concentration_by_partner.find(p => p.pct_of_total > 50)

  return (
    <div className="flex flex-col gap-4">
      {/* Bucket bar chart */}
      <MaturityBucketBar items={buckets} total={total} />

      {/* Score + next 12m pct */}
      <div className="flex items-center gap-3 flex-wrap">
        <RefinancingScoreChip score={refinancingScore} />
        {total > 0 && (
          <span className="text-[0.7rem] text-[#64748b]">
            12 aylık vade oranı:{' '}
            <strong className="text-[#334155]">%{next12mPct.toFixed(1)}</strong>
          </span>
        )}
      </div>

      {/* Concentration warnings */}
      <ConcentrationWarnings
        concentrationMonth={report.maturity_cliffs[0]?.date.substring(0, 7)}
        concentrationPartner={topPartner?.partner_name}
        schedule={scheduleForWarnings}
      />

      {/* Maturity cliffs summary (replaces 36-month schedule) */}
      <div>
        <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-2">
          Vade Dağılımı
        </div>
        <MaturityScheduleTable schedule={scheduleForWarnings} />
      </div>
    </div>
  )
}

// ── Full Amortization Schedule — per-tranche expandable schedule ──────────────

function ScheduleDetailTable({
  rows,
  alreadyPaid,
}: {
  rows: LoanAmortizationSchedule['rows']
  alreadyPaid: number
}) {
  if (rows.length === 0) {
    return (
      <p className="text-xs text-[#94a3b8] py-3 text-center">
        Amortisman takvimi hesaplanamadı.
      </p>
    )
  }

  return (
    <div className="overflow-x-auto mt-3">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="border-b border-[#e2e8f0]">
            <th className="py-1.5 px-2 text-left font-semibold text-[#64748b] whitespace-nowrap">#</th>
            <th className="py-1.5 px-2 text-left font-semibold text-[#64748b] whitespace-nowrap">Dönem</th>
            <th className="py-1.5 px-2 text-right font-semibold text-[#64748b] whitespace-nowrap">Açılış</th>
            <th className="py-1.5 px-2 text-right font-semibold text-[#64748b] whitespace-nowrap">Ödeme</th>
            <th className="py-1.5 px-2 text-right font-semibold text-[#64748b] whitespace-nowrap">Anapara</th>
            <th className="py-1.5 px-2 text-right font-semibold text-[#64748b] whitespace-nowrap">Faiz</th>
            <th className="py-1.5 px-2 text-right font-semibold text-[#64748b] whitespace-nowrap">Kapanış</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const isPast = row.period_number <= alreadyPaid
            const isCurrent = row.period_number === alreadyPaid + 1
            const rowCls = isPast
              ? 'bg-[#f1f5f9] text-[#94a3b8]'
              : isCurrent
              ? 'bg-blue-50 font-semibold text-[#0f172a]'
              : 'bg-white text-[#334155]'

            return (
              <tr key={row.period_number} className={`border-b border-[#f1f5f9] ${rowCls}`}>
                <td className="py-1 px-2 tabular-nums">{row.period_number}</td>
                <td className="py-1 px-2 whitespace-nowrap">
                  {fmtDate(row.period_date)}
                  {isCurrent && (
                    <span className="ml-1.5 text-[0.55rem] font-black uppercase tracking-widest text-blue-500">
                      Şimdi
                    </span>
                  )}
                </td>
                <td className="py-1 px-2 text-right tabular-nums">{fmtTRY(row.opening_balance_try)}</td>
                <td className="py-1 px-2 text-right tabular-nums font-semibold">{fmtTRY(row.monthly_payment_try)}</td>
                <td className="py-1 px-2 text-right tabular-nums">{fmtTRY(row.principal_try)}</td>
                <td className="py-1 px-2 text-right tabular-nums text-amber-600">{fmtTRY(row.interest_try)}</td>
                <td className="py-1 px-2 text-right tabular-nums">{fmtTRY(row.closing_balance_try)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function ScheduleCard({ schedule }: { schedule: LoanAmortizationSchedule }) {
  const rateFmt = schedule.annual_rate_pct > 0
    ? `%${schedule.annual_rate_pct.toFixed(1)} / yıl`
    : 'Faizsiz'

  return (
    <details className="rounded border border-[#e2e8f0] overflow-hidden group">
      <summary className="list-none cursor-pointer bg-white hover:bg-[#f8fafc] transition-colors px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="text-[#94a3b8] text-xs transition-transform group-open:rotate-90" aria-hidden>
            ▶
          </span>
          <div className="flex-1 grid grid-cols-2 gap-x-4 gap-y-0.5 sm:grid-cols-5">
            <div>
              <div className="text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8]">Ortak</div>
              <div className="text-xs font-semibold text-[#0f172a] truncate">{schedule.partner_name}</div>
            </div>
            <div>
              <div className="text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8]">Anapara</div>
              <div className="text-xs font-semibold text-[#0f172a] tabular-nums">{fmtTRY(schedule.principal_try)}</div>
            </div>
            <div>
              <div className="text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8]">Faiz Oranı</div>
              <div className="text-xs font-semibold text-[#0f172a]">{rateFmt}</div>
            </div>
            <div>
              <div className="text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8]">Aylık Ödeme</div>
              <div className="text-xs font-semibold text-[#0f172a] tabular-nums">{fmtTRY(schedule.monthly_payment_try)}</div>
            </div>
            <div>
              <div className="text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8]">Toplam Maliyet</div>
              <div className="text-xs font-semibold text-amber-600 tabular-nums">{fmtTRY(schedule.total_cost_try)}</div>
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8]">Kalan Bakiye</div>
            <div className="text-xs font-semibold text-[#0f172a] tabular-nums">{fmtTRY(schedule.remaining_balance_try)}</div>
          </div>
        </div>
      </summary>

      <div className="border-t border-[#e2e8f0] px-4 pb-4 bg-[#f8fafc]">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 pb-1 text-xs">
          <div>
            <div className="text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8]">Toplam Ay</div>
            <div className="font-semibold text-[#0f172a]">{schedule.total_months} ay</div>
          </div>
          <div>
            <div className="text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8]">Geçen Ay</div>
            <div className="font-semibold text-[#0f172a]">{schedule.already_paid_months} ay</div>
          </div>
          <div>
            <div className="text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8]">Toplam Faiz</div>
            <div className="font-semibold text-amber-600 tabular-nums">{fmtTRY(schedule.total_interest_try)}</div>
          </div>
          <div>
            <div className="text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8]">Başlangıç</div>
            <div className="font-semibold text-[#0f172a]">{fmtDate(schedule.start_date)}</div>
          </div>
        </div>
        <ScheduleDetailTable rows={schedule.rows} alreadyPaid={schedule.already_paid_months} />
      </div>
    </details>
  )
}

function FullAmortizationSchedule() {
  // companyId not available in this component, pass empty string — hook uses the API which resolves it
  const { data: report, isLoading, isError, error } = useAmortizationScheduleReport('')

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-12 rounded bg-[#f1f5f9] animate-pulse" />
        ))}
      </div>
    )
  }

  if (isError) {
    return (
      <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700 font-medium">
        {error instanceof Error ? error.message : 'Amortisman takvimi yüklenemedi'}
      </div>
    )
  }

  if (!report || report.schedules.length === 0) {
    return (
      <p className="text-xs text-[#94a3b8] py-3 text-center">
        Tam amortisman takvimi için aktif borç dilimi bulunamadı.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Per-tranche expandable cards */}
      {report.schedules.map(s => (
        <ScheduleCard key={s.tranche_id} schedule={s} />
      ))}

      {/* Total debt service strip */}
      <div className="grid grid-cols-3 gap-3 pt-1">
        <div className="rounded border border-[#e2e8f0] bg-[#f8fafc] px-4 py-3">
          <div className="text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8] mb-1">
            Aylık Toplam Servis
          </div>
          <div className="text-base font-black text-[#0f172a] tabular-nums">
            {fmtTRY(report.total_monthly_debt_service_try)}
          </div>
        </div>
        <div className="rounded border border-[#e2e8f0] bg-[#f8fafc] px-4 py-3">
          <div className="text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8] mb-1">
            Toplam Kalan Bakiye
          </div>
          <div className="text-base font-black text-[#0f172a] tabular-nums">
            {fmtTRY(report.total_remaining_balance_try)}
          </div>
        </div>
        <div className="rounded border border-[#e2e8f0] bg-[#f8fafc] px-4 py-3">
          <div className="text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8] mb-1">
            Kalan Toplam Faiz
          </div>
          <div className="text-base font-black text-amber-600 tabular-nums">
            {fmtTRY(report.total_interest_remaining_try)}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main tab component ────────────────────────────────────────────────────────

export function AmortizationTab() {
  const { report, loading, error, load, loaded } = useAmortizationReport()

  // Auto-load on first render
  if (!loaded && !loading && !error) {
    load()
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-3 mt-2">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-14 rounded border border-[#e2e8f0] bg-[#f8fafc] animate-pulse" />
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700 font-medium mt-2">
        {error}
      </div>
    )
  }

  if (!report) return null

  if (report.tranches.length === 0) {
    return (
      <div className="rounded border border-[#e2e8f0] bg-[#f8fafc] px-6 py-8 text-center mt-2">
        <div className="text-sm font-semibold text-[#334155]">Aktif tranche bulunamadı</div>
        <div className="text-xs text-[#94a3b8] mt-1">
          Amortisman takvimi için aktif veya kısmen ödenmiş borç dilimi gereklidir.
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 mt-2">
      <SummaryStrip report={report} />

      <div className="flex flex-col gap-2">
        <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">
          Tranche Takvimleri ({report.tranches.length})
        </div>
        {report.tranches.map(tranche => (
          <TrancheCard key={tranche.tranche_id} tranche={tranche} />
        ))}
      </div>

      {(report.earliest_payoff_month || report.latest_payoff_month) && (
        <div className="text-xs text-[#94a3b8] text-right">
          {report.earliest_payoff_month && (
            <span>
              En erken kapanış: <strong className="text-[#64748b]">{report.earliest_payoff_month}</strong>
            </span>
          )}
          {report.earliest_payoff_month && report.latest_payoff_month && report.earliest_payoff_month !== report.latest_payoff_month && (
            <span className="mx-2">·</span>
          )}
          {report.latest_payoff_month && report.earliest_payoff_month !== report.latest_payoff_month && (
            <span>
              En geç kapanış: <strong className="text-[#64748b]">{report.latest_payoff_month}</strong>
            </span>
          )}
        </div>
      )}

      {/* ── Faiz Tahakkuku ───────────────────────────────────────────────── */}
      <div className="border-t border-[#e2e8f0] pt-4">
        <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-3">
          Faiz Tahakkuku
        </div>
        <FaizTahakkuku />
      </div>

      {/* ── Vade Takvimi ─────────────────────────────────────────────────── */}
      <div className="border-t border-[#e2e8f0] pt-4">
        <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-3">
          Vade Takvimi
        </div>
        <VadeTakvimi />
      </div>

      {/* ── Tam Amortisman Takvimi ────────────────────────────────────────── */}
      <div className="border-t border-[#e2e8f0] pt-4">
        <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-3">
          Tam Amortisman Takvimi
        </div>
        <FullAmortizationSchedule />
      </div>
    </div>
  )
}
