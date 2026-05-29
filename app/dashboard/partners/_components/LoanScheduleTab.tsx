'use client'

// ─────────────────────────────────────────────────────────────────────────────
// LoanScheduleTab — Kredi Geri Ödeme Takvimi
//
// Per-tranche accordion with amortization table preview (first 6 rows),
// risk badges, DSCR display, and upcoming payments summary.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fmtTRY, fmtDate } from '@/lib/format'
import {
  FlowraCard,
  FlowraKpiCard,
  FlowraStatusBadge,
  FlowraTable,
  FlowraAlert,
  cn,
} from '@/components/ds'
import type { FlowraColumn } from '@/components/ds'
import type {
  LoanRepaymentScheduleReport,
  TrancheSchedule,
  AmortizationRow,
} from '@/lib/services/pcle/loan-repayment-schedule.service'

// ── Types ─────────────────────────────────────────────────────────────────────

type RiskLevel = 'no_risk' | 'low' | 'moderate' | 'high' | 'critical'
type DscrHealth = 'strong' | 'adequate' | 'tight' | 'critical' | 'no_debt'

// ── API hook ──────────────────────────────────────────────────────────────────

function useLoanScheduleReport() {
  return useQuery<LoanRepaymentScheduleReport>({
    queryKey: ['partners', 'loan-schedule'],
    queryFn: async () => {
      const res = await fetch('/api/partners/loan-schedule')
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(body.error ?? `HTTP ${res.status}`)
      }
      const json = await res.json() as { report: LoanRepaymentScheduleReport }
      return json.report
    },
    staleTime: 5 * 60 * 1000,
  })
}

// ── Risk badge ────────────────────────────────────────────────────────────────

const RISK_LABEL: Record<RiskLevel, string> = {
  no_risk:  'Risk Yok',
  low:      'Düşük',
  moderate: 'Orta',
  high:     'Yüksek',
  critical: 'KRİTİK',
}

function RiskBadge({ risk }: { risk: RiskLevel }) {
  return <FlowraStatusBadge status={RISK_LABEL[risk]} />
}

// ── DSCR label ────────────────────────────────────────────────────────────────

const DSCR_LABEL: Record<DscrHealth, string> = {
  strong:   'DSCR: Güçlü',
  adequate: 'DSCR: Yeterli',
  tight:    'DSCR: Sınırda',
  critical: 'DSCR: Kritik',
  no_debt:  'DSCR: Borç Yok',
}

function DscrBadge({ health, dscr }: { health: DscrHealth; dscr: number | null }) {
  const label = DSCR_LABEL[health] + (dscr !== null ? ` (${dscr.toFixed(2)}x)` : '')
  return <FlowraStatusBadge status={label} />
}

// ── Amortization preview table ────────────────────────────────────────────────

const amortColumns: FlowraColumn<AmortizationRow>[] = [
  {
    key: 'period_number',
    header: '#',
    render: (row) => <span className="text-gray-500 font-mono">{row.period_number}</span>,
  },
  {
    key: 'payment_date',
    header: 'Tarih',
    render: (row) => (
      <span className={cn('text-xs', row.is_overdue && 'text-red-600 font-medium')}>
        {fmtDate(row.payment_date)}
      </span>
    ),
  },
  {
    key: 'beginning_balance',
    header: 'Başlangıç',
    align: 'right',
    render: (row) => <span className="font-mono text-xs">{fmtTRY(row.beginning_balance)}</span>,
  },
  {
    key: 'scheduled_payment',
    header: 'Ödeme',
    align: 'right',
    render: (row) => (
      <span className={cn('font-mono text-xs font-medium', row.is_overdue && 'text-red-600')}>
        {fmtTRY(row.scheduled_payment)}
      </span>
    ),
  },
  {
    key: 'interest_component',
    header: 'Faiz',
    align: 'right',
    render: (row) => <span className="font-mono text-xs text-amber-600">{fmtTRY(row.interest_component)}</span>,
  },
  {
    key: 'principal_component',
    header: 'Anapara',
    align: 'right',
    render: (row) => <span className="font-mono text-xs">{fmtTRY(row.principal_component)}</span>,
  },
  {
    key: 'ending_balance',
    header: 'Kalan',
    align: 'right',
    render: (row) => <span className="font-mono text-xs">{fmtTRY(row.ending_balance)}</span>,
  },
  {
    key: 'is_overdue',
    header: 'Durum',
    render: (row) => (
      <FlowraStatusBadge status={row.is_overdue ? 'Gecikmiş' : 'Bekliyor'} />
    ),
  },
]

// ── Tranche accordion card ────────────────────────────────────────────────────

function TrancheCard({ tranche }: { tranche: TrancheSchedule }) {
  const [expanded, setExpanded] = useState(false)
  const previewRows = tranche.amortization.slice(0, 6)
  const overdueCount = tranche.amortization.filter(r => r.is_overdue).length

  const risk: RiskLevel =
    tranche.outstanding_try === 0 ? 'no_risk'
    : overdueCount > 0 ? 'critical'
    : tranche.months_remaining !== null && tranche.months_remaining <= 3 ? 'high'
    : tranche.months_remaining !== null && tranche.months_remaining <= 12 ? 'moderate'
    : 'low'

  return (
    <div className="border border-[#e2e8f0] rounded-lg mb-3 bg-white">
      {/* Header row */}
      <div
        className="flex items-center justify-between cursor-pointer select-none px-4 py-3"
        onClick={() => setExpanded(v => !v)}
      >
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-[#0f172a]">{tranche.partner_name}</span>
          <RiskBadge risk={risk} />
          {tranche.is_bullet && (
            <FlowraStatusBadge status="Bullet" />
          )}
        </div>
        <div className="flex items-center gap-6 text-xs text-[#64748b]">
          <span>
            Anapara: <span className="font-mono font-medium text-[#0f172a]">{fmtTRY(tranche.principal_try)}</span>
          </span>
          <span>
            Kalan:{' '}
            <span className={cn('font-mono font-medium', tranche.outstanding_try > 0 ? 'text-red-600' : 'text-green-600')}>
              {fmtTRY(tranche.outstanding_try)}
            </span>
          </span>
          {tranche.months_remaining !== null && (
            <span>
              Vade: <span className="font-medium">{tranche.months_remaining} ay</span>
            </span>
          )}
          <span className="text-[#94a3b8]">{expanded ? '▲' : '▼'}</span>
        </div>
      </div>

      {expanded && (
        <div className="px-4 pb-4 border-t border-[#e2e8f0]">
          {/* Meta row */}
          <div className="flex flex-wrap gap-4 mt-3 mb-4 text-xs text-[#64748b]">
            <span>Kullandırım: <span className="font-medium">{fmtDate(tranche.disbursement_date)}</span></span>
            {tranche.expected_repayment_date && (
              <span>Son Ödeme: <span className="font-medium">{fmtDate(tranche.expected_repayment_date)}</span></span>
            )}
            <span>Faiz: <span className="font-mono font-medium">{tranche.annual_rate_pct}%</span></span>
            <span>Toplam Faiz: <span className="font-mono font-medium text-amber-600">{fmtTRY(tranche.total_interest_try)}</span></span>
            <span>Toplam Ödeme: <span className="font-mono font-medium">{fmtTRY(tranche.total_payments_try)}</span></span>
          </div>

          {/* Amortization preview */}
          {previewRows.length > 0 ? (
            <>
              <p className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-2">
                Ödeme Takvimi{tranche.amortization.length > 6 ? ` (ilk 6 / ${tranche.amortization.length} satır)` : ''}
              </p>
              <FlowraTable<AmortizationRow>
                columns={amortColumns}
                rows={previewRows}
                rowKey={(row) => String(row.period_number)}
              />
            </>
          ) : (
            <p className="text-xs text-[#94a3b8] italic">
              {tranche.is_bullet
                ? 'Geri ödeme tarihi belirlenmemiş — taksit takvimi oluşturulamadı.'
                : 'Taksit takvimi mevcut değil.'}
            </p>
          )}

          {/* Overdue alert */}
          {overdueCount > 0 && (
            <div className="mt-3">
              <FlowraAlert
                tone="danger"
                text={`Bu tranche için ${overdueCount} gecikmiş ödeme bulunuyor.`}
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function LoanScheduleTab() {
  const { data: report, isLoading, error } = useLoanScheduleReport()

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-[#94a3b8] text-sm">
        Kredi takvimi yükleniyor...
      </div>
    )
  }

  if (error || !report) {
    return (
      <FlowraAlert
        tone="danger"
        text={error instanceof Error ? error.message : 'Kredi takvimi yüklenemedi.'}
      />
    )
  }

  const { portfolio_summary: ps } = report

  return (
    <div className="space-y-4">
      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <FlowraKpiCard
          label="Toplam Bakiye"
          value={ps.total_outstanding_try}
          rawValue={fmtTRY(ps.total_outstanding_try)}
          sub={`${report.tranche_schedules.length} tranche`}
        />
        <FlowraKpiCard
          label="Aylık Borç Servisi"
          value={ps.total_monthly_service}
          rawValue={fmtTRY(ps.total_monthly_service)}
          sub="Sabit taksitli"
        />
        <FlowraKpiCard
          label="Vadeye Kalan Faiz"
          value={ps.total_interest_to_maturity_try}
          rawValue={fmtTRY(ps.total_interest_to_maturity_try)}
          sub="Toplam maliyet"
        />
        <FlowraKpiCard
          label="Vadeli Tranches"
          value={ps.tranches_with_repayment_date}
          sub={`${ps.tranches_without_date} tarihlenmemiş`}
        />
      </div>

      {/* DSCR + status row */}
      <div className="flex flex-wrap gap-3 items-center">
        <DscrBadge health={report.dscr_health} dscr={report.dscr} />
        {ps.overdue_tranches > 0 && (
          <FlowraStatusBadge status={`${ps.overdue_tranches} Gecikmiş Tranche`} />
        )}
        {ps.weighted_avg_months_remaining !== null && (
          <span className="text-xs text-[#64748b]">
            Ort. Vade: <span className="font-mono font-medium">{ps.weighted_avg_months_remaining} ay</span>
          </span>
        )}
      </div>

      {/* Upcoming payments summary */}
      <div className="border border-[#e2e8f0] rounded-lg bg-white p-4">
        <p className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-3">
          Yaklaşan Ödemeler
        </p>
        <div className="grid grid-cols-2 gap-6">
          <div>
            <p className="text-xs text-[#64748b] mb-1">Önümüzdeki 30 Gün</p>
            <p className="text-base font-black font-mono tabular-nums text-[#0f172a]">
              {fmtTRY(report.payments_next_30_days.total_try)}
            </p>
            <p className="text-[0.65rem] text-[#94a3b8]">{report.payments_next_30_days.count} ödeme</p>
          </div>
          <div>
            <p className="text-xs text-[#64748b] mb-1">Önümüzdeki 90 Gün</p>
            <p className="text-base font-black font-mono tabular-nums text-[#0f172a]">
              {fmtTRY(report.payments_next_90_days.total_try)}
            </p>
            <p className="text-[0.65rem] text-[#94a3b8]">{report.payments_next_90_days.count} ödeme</p>
          </div>
        </div>
      </div>

      {/* Critical alert */}
      {ps.overdue_tranches > 0 && (
        <FlowraAlert
          tone="danger"
          text={`${ps.overdue_tranches} tranche için vadesi geçmiş ödeme bulunuyor. Lütfen ilgili ortaklarla iletişime geçin.`}
        />
      )}

      {/* Per-tranche accordions */}
      {report.tranche_schedules.length === 0 ? (
        <FlowraAlert tone="info" text="Aktif partner kredisi bulunamadı." />
      ) : (
        <div>
          <p className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-3">
            Tranche Detayları ({report.tranche_schedules.length})
          </p>
          {report.tranche_schedules.map(tranche => (
            <TrancheCard key={tranche.tranche_id} tranche={tranche} />
          ))}
        </div>
      )}
    </div>
  )
}
