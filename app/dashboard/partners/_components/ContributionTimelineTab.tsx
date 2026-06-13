'use client'

// ─────────────────────────────────────────────────────────────────────────────
// ContributionTimelineTab — Partner Contribution Timeline & Commitment Fulfillment
//
// Displays:
//   • Summary strip: Total Committed / Total Paid / Gap / Overall Fulfillment %
//   • TTK 588 risk banner (if any partners at risk)
//   • Partner commitment cards with progress bar + contribution history
//   • Empty state
// ─────────────────────────────────────────────────────────────────────────────

import { useQuery } from '@tanstack/react-query'
import {
  Panel, PanelHeader, KpiStrip, KpiCell, EmptySlate, Skeleton,
  NarrativeFooter,
} from '@/components/ds'
import { fmtTRY, fmtPct } from '@/lib/format'
import type {
  ContributionTimelineReport,
  PartnerContributionPosition,
} from '@/lib/services/pcle/contribution-timeline.service'

// ── Types ─────────────────────────────────────────────────────────────────────

interface ApiResponse {
  report: ContributionTimelineReport
}

interface Props {
  companyId: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function fetchReport(_companyId: string): Promise<ContributionTimelineReport> {
  const res  = await fetch('/api/partners/contribution-timeline')
  const data = await res.json()
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`)
  return (data as ApiResponse).report
}

const STATUS_LABELS: Record<PartnerContributionPosition['status'], string> = {
  fulfilled: 'Tamamlandı',
  on_track:  'Yolunda',
  partial:   'Kısmi',
  overdue:   'Gecikmiş',
  pending:   'Beklemede',
}

const STATUS_COLORS: Record<PartnerContributionPosition['status'], string> = {
  fulfilled: 'bg-pos-light text-pos-text border-pos-text/20',
  on_track:  'bg-[#ecfdf5] text-[#065f46] border-[#6ee7b7]/30',
  partial:   'bg-[#fffbeb] text-[#92400e] border-[#fde68a]/30',
  overdue:   'bg-neg-light text-neg-text border-neg-text/20',
  pending:   'bg-[#f1f5f9] text-[#64748b] border-[#cbd5e1]/30',
}

function fulfillmentBarColor(pct: number): string {
  if (pct >= 100) return 'bg-pos-text'
  if (pct >= 75)  return 'bg-[#10b981]'
  if (pct >= 25)  return 'bg-[#d97706]'
  return 'bg-neg-text'
}

function fmtDateStr(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' })
  } catch {
    return dateStr
  }
}

function fulfillmentTone(pct: number): 'ok' | 'warn' | 'critical' | 'neutral' {
  if (pct >= 75) return 'ok'
  if (pct >= 25) return 'warn'
  return 'critical'
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: PartnerContributionPosition['status'] }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[0.65rem] font-semibold ${STATUS_COLORS[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  )
}

function FulfillmentBar({ pct }: { pct: number }) {
  const clamped = Math.min(100, Math.max(0, pct))
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-[#e2e8f0] overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${fulfillmentBarColor(clamped)}`}
          style={{ width: `${clamped}%` }}
        />
      </div>
      <span className={`text-xs font-bold min-w-[40px] text-right ${
        clamped >= 100 ? 'text-pos-text' :
        clamped >= 75  ? 'text-[#059669]' :
        clamped >= 25  ? 'text-[#d97706]' : 'text-neg-text'
      }`}>
        {fmtPct(clamped, 1)}
      </span>
    </div>
  )
}

function ContributionHistory({
  contributions,
}: {
  contributions: PartnerContributionPosition['contributions']
}) {
  if (contributions.length === 0) {
    return <p className="text-xs text-[#94a3b8] italic">Henüz ödeme yapılmamış</p>
  }
  return (
    <div className="space-y-1">
      {contributions.map(c => (
        <div key={c.event_id} className="flex items-center justify-between gap-2 text-xs">
          <span className="text-[#64748b]">{fmtDateStr(c.event_date)}</span>
          <span className="font-semibold text-[#0f172a]">{fmtTRY(c.amount_try, 0)}</span>
          {c.note && <span className="text-[#94a3b8] truncate max-w-[140px]">{c.note}</span>}
        </div>
      ))}
    </div>
  )
}

function PartnerCard({ p }: { p: PartnerContributionPosition }) {
  return (
    <div className="border border-[#e8eaef] rounded-lg p-4 space-y-3 bg-white">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-bold text-[#0f172a]">{p.partner_name}</p>
          {p.commitment_date && (
            <p className="text-[0.65rem] text-[#94a3b8] mt-0.5">
              Taahhüt: {fmtDateStr(p.commitment_date)} · {p.days_since_commitment} gün
            </p>
          )}
        </div>
        <StatusBadge status={p.status} />
      </div>

      {/* Progress bar */}
      <div>
        <div className="flex items-center justify-between text-[0.65rem] text-[#94a3b8] mb-1">
          <span>Ödenen / Taahhüt</span>
          <span>{fmtTRY(p.paid_try, 0)} / {fmtTRY(p.committed_try, 0)}</span>
        </div>
        <FulfillmentBar pct={p.fulfillment_pct} />
      </div>

      {/* Key metrics */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <p className="text-[#94a3b8] text-[0.65rem] uppercase tracking-wide font-semibold">Açık</p>
          <p className={`font-bold mt-0.5 ${p.gap_try > 0 ? 'text-neg-text' : 'text-pos-text'}`}>
            {fmtTRY(p.gap_try, 0)}
          </p>
        </div>
        {p.statutory_interest_try > 0 && (
          <div>
            <p className="text-[#94a3b8] text-[0.65rem] uppercase tracking-wide font-semibold">TTK 588 Faiz</p>
            <p className="font-bold mt-0.5 text-neg-text">{fmtTRY(p.statutory_interest_try, 0)}</p>
          </div>
        )}
      </div>

      {/* Contribution history */}
      {p.contributions.length > 0 && (
        <div>
          <p className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8] mb-2">Ödeme Geçmişi</p>
          <ContributionHistory contributions={p.contributions} />
        </div>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function ContributionTimelineTab({ companyId }: Props) {
  const { data: report, isLoading, error } = useQuery<ContributionTimelineReport>({
    queryKey:  ['contribution-timeline', companyId],
    queryFn:   () => fetchReport(companyId),
    staleTime: 5 * 60 * 1000,
  })

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-20 rounded-lg" />
        <Skeleton className="h-40 rounded-lg" />
        <Skeleton className="h-40 rounded-lg" />
      </div>
    )
  }

  if (error) {
    return (
      <Panel>
        <div className="px-5 py-8 text-center text-sm text-neg-text">
          Taahhüt takvimi yüklenemedi — {error instanceof Error ? error.message : 'Bilinmeyen hata'}
        </div>
      </Panel>
    )
  }

  if (!report || report.partners.length === 0) {
    return (
      <Panel>
        <EmptySlate
          icon="📋"
          title="Ortak sermaye taahhüdü bulunamadı"
          sub="Henüz kayıtlı partner sermaye taahhüdü yok."
        />
      </Panel>
    )
  }

  const hasTtk588Risk = report.ttk588_risk_partners.length > 0

  return (
    <div className="space-y-5">

      {/* TTK 588 risk banner */}
      {hasTtk588Risk && (
        <div className="rounded-lg border border-neg-text/30 bg-neg-light px-4 py-3 space-y-1.5">
          <p className="text-xs font-bold text-neg-text uppercase tracking-wide">
            TTK 588 — Yasal Faiz Riski
          </p>
          <p className="text-xs text-neg-text">
            {report.ttk588_risk_partners.map(p => p.partner_name).join(', ')} ortaklarında
            {' '}90 günü aşan ödenmemiş sermaye taahhüdü bulunuyor.
            Toplam hesaplanan faiz:{' '}
            <span className="font-bold">{fmtTRY(report.total_statutory_interest_try, 0)}</span>
          </p>
        </div>
      )}

      {/* Summary strip */}
      <Panel>
        <PanelHeader label="Sermaye Taahhüt Özeti" />
        <KpiStrip>
          <KpiCell
            label="Toplam Taahhüt"
            value={fmtTRY(report.total_committed_try, 0)}
          />
          <KpiCell
            label="Toplam Ödenen"
            value={fmtTRY(report.total_paid_try, 0)}
            tone="ok"
          />
          <KpiCell
            label="Açık"
            value={fmtTRY(report.total_gap_try, 0)}
            tone={report.total_gap_try > 0 ? 'critical' : 'ok'}
          />
          <KpiCell
            label="Genel Doluluk"
            value={fmtPct(report.overall_fulfillment_pct, 1)}
            tone={fulfillmentTone(report.overall_fulfillment_pct)}
          />
        </KpiStrip>

        {/* Overall funding bar */}
        <div className="px-5 pb-4">
          <FulfillmentBar pct={report.overall_fulfillment_pct} />
        </div>
      </Panel>

      {/* Next expected contribution */}
      {report.next_expected_contribution && (
        <div className="rounded-lg border border-[#e8eaef] bg-[#f8fafc] px-4 py-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8]">Beklenen Sonraki Katkı</p>
            <p className="text-sm font-bold text-[#0f172a] mt-0.5">{report.next_expected_contribution.partner_name}</p>
          </div>
          <p className="text-sm font-bold text-[#0f172a]">
            {fmtTRY(report.next_expected_contribution.expected_amount_try, 0)}
          </p>
        </div>
      )}

      {/* Partner cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {report.partners.map(p => (
          <PartnerCard key={p.partner_id} p={p} />
        ))}
      </div>

      <NarrativeFooter
        narrative="TTK 588 — Taahhüt edilen sermayenin ödenmemesi halinde 90 günden sonra yasal faiz işler. Hesaplanan faiz oranı: %50 (Merkez Bankası referans faizi — muhafazakâr tahmin)."
        links={[]}
      />
    </div>
  )
}
