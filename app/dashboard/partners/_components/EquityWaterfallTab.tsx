'use client'

// ─────────────────────────────────────────────────────────────────────────────
// EquityWaterfallTab — Sermaye Getiri Projeksiyonu
//
// Displays per-partner capital return projection:
//   • Company summary strip: Total Capital at Risk / Total Returned / Weighted Return Ratio
//   • Per-partner cards: Sermaye Riski / Getiri / Getiri Oranı / MOIC / Başa Baş Ay / Health
//   • Projection table: months 6/12/18/24 cumulative return % for first partner
// ─────────────────────────────────────────────────────────────────────────────

import { useQuery } from '@tanstack/react-query'
import {
  Panel, PanelHeader, KpiStrip, KpiCell, EmptySlate, Skeleton,
  NarrativeFooter,
} from '@/components/ds'
import { fmtTRY, fmtPct } from '@/lib/format'
import type {
  classifyCapitalReturnHealth,
  projectFutureReturns,
} from '@/lib/services/pcle/equity-waterfall.service'

// ── Types ─────────────────────────────────────────────────────────────────────

type HealthStatus = ReturnType<typeof classifyCapitalReturnHealth>
type Projection   = ReturnType<typeof projectFutureReturns>

interface PartnerWaterfallResult {
  partner_id: string
  partner_name: string
  share_pct: number
  capital_at_risk: number
  total_returned: number
  return_ratio_pct: number | null
  multiple: number | null
  break_even_months: number | null
  health: HealthStatus
  projection: Projection
}

interface CompanySummary {
  total_capital_at_risk: number
  total_returned: number
  weighted_return_ratio_pct: number | null
  avg_break_even_months: number | null
}

interface WaterfallReport {
  partners: PartnerWaterfallResult[]
  company_summary: CompanySummary
}

interface ApiResponse {
  report: WaterfallReport
}

interface Props {
  companyId?: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function fetchReport(): Promise<WaterfallReport> {
  const res  = await fetch('/api/partners/equity-waterfall')
  const data = await res.json()
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`)
  return (data as ApiResponse).report
}

const HEALTH_LABELS: Record<HealthStatus, string> = {
  strong:            'Güçlü',
  healthy:           'Sağlıklı',
  recovering:        'Toparlanıyor',
  at_risk:           'Riskli',
  insufficient_data: 'Yetersiz Veri',
}

const HEALTH_COLORS: Record<HealthStatus, string> = {
  strong:            'bg-pos-light text-pos-text border-pos-text/20',
  healthy:           'bg-[#ecfdf5] text-[#065f46] border-[#6ee7b7]/30',
  recovering:        'bg-[#fffbeb] text-[#92400e] border-[#fde68a]/30',
  at_risk:           'bg-neg-light text-neg-text border-neg-text/20',
  insufficient_data: 'bg-[#f1f5f9] text-[#64748b] border-[#cbd5e1]/30',
}

function fmtMultiple(v: number | null): string {
  if (v === null) return '—'
  return `${v.toFixed(2)}x`
}

function fmtMonths(v: number | null): string {
  if (v === null) return '—'
  if (v > 120) return '10+ yıl'
  if (v > 24) return `${Math.round(v / 12 * 10) / 10} yıl`
  return `${v} ay`
}

function fmtRatio(v: number | null): string {
  if (v === null) return '—'
  return fmtPct(v)
}

// ── Projection milestone months ───────────────────────────────────────────────

const MILESTONE_MONTHS = [6, 12, 18, 24]

function getProjectionAtMonth(projection: Projection, month: number) {
  return projection.find(p => p.month === month) ?? null
}

// ── Sub-components ────────────────────────────────────────────────────────────

function HealthBadge({ health }: { health: HealthStatus }) {
  return (
    <span className={[
      'inline-flex items-center px-2 py-0.5 rounded text-[0.65rem] font-semibold border',
      HEALTH_COLORS[health],
    ].join(' ')}>
      {HEALTH_LABELS[health]}
    </span>
  )
}

function PartnerCard({ partner }: { partner: PartnerWaterfallResult }) {
  return (
    <div className="border border-[#e8eaef] rounded-lg p-4 space-y-3 bg-white">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-[#0f172a]">{partner.partner_name}</p>
          <p className="text-xs text-[#94a3b8] mt-0.5">
            Pay: %{(partner.share_pct * 100).toFixed(1)}
          </p>
        </div>
        <HealthBadge health={partner.health} />
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-2">
        <div>
          <p className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8]">
            Sermaye Riski
          </p>
          <p className="text-sm font-bold text-[#0f172a]">{fmtTRY(partner.capital_at_risk)}</p>
        </div>
        <div>
          <p className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8]">
            Toplam Getiri
          </p>
          <p className="text-sm font-bold text-[#0f172a]">{fmtTRY(partner.total_returned)}</p>
        </div>
        <div>
          <p className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8]">
            Getiri Oranı
          </p>
          <p className="text-sm font-semibold text-[#334155]">{fmtRatio(partner.return_ratio_pct)}</p>
        </div>
        <div>
          <p className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8]">
            MOIC
          </p>
          <p className="text-sm font-semibold text-[#334155]">{fmtMultiple(partner.multiple)}</p>
        </div>
        <div>
          <p className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8]">
            Başa Baş Süre
          </p>
          <p className="text-sm font-semibold text-[#334155]">{fmtMonths(partner.break_even_months)}</p>
        </div>
      </div>
    </div>
  )
}

function ProjectionTable({ partner }: { partner: PartnerWaterfallResult }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="border-b border-[#e8eaef]">
            <th className="py-2 px-3 text-left font-semibold text-[#64748b]">Ay</th>
            <th className="py-2 px-3 text-right font-semibold text-[#64748b]">Kümülatif Getiri</th>
            <th className="py-2 px-3 text-right font-semibold text-[#64748b]">Kalan Sermaye</th>
            <th className="py-2 px-3 text-right font-semibold text-[#64748b]">Geri Dönüş %</th>
          </tr>
        </thead>
        <tbody>
          {MILESTONE_MONTHS.map(month => {
            const point = getProjectionAtMonth(partner.projection, month)
            if (!point) return null
            return (
              <tr key={month} className="border-b border-[#f1f5f9] hover:bg-[#f8fafc]">
                <td className="py-2 px-3 font-medium text-[#334155]">{month}. ay</td>
                <td className="py-2 px-3 text-right text-[#0f172a]">
                  {fmtTRY(point.cumulative_returned)}
                </td>
                <td className="py-2 px-3 text-right text-[#64748b]">
                  {fmtTRY(point.remaining_at_risk)}
                </td>
                <td className="py-2 px-3 text-right">
                  <span className={[
                    'font-semibold',
                    point.return_pct >= 100 ? 'text-pos-text' :
                    point.return_pct >= 50  ? 'text-[#065f46]' :
                    point.return_pct >= 25  ? 'text-[#92400e]' :
                    'text-[#64748b]',
                  ].join(' ')}>
                    {fmtPct(point.return_pct)}
                  </span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function EquityWaterfallTab({ companyId: _companyId = '' }: Props) {
  const { data: report, isLoading, error } = useQuery<WaterfallReport>({
    queryKey:  ['equity-waterfall', _companyId],
    queryFn:   () => fetchReport(),
    staleTime: 5 * 60 * 1000,
  })

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      </div>
    )
  }

  if (error || !report) {
    return (
      <EmptySlate
        title="Veri yüklenemedi"
        sub={error instanceof Error ? error.message : 'Sermaye getiri verisi alınamadı.'}
      />
    )
  }

  const { partners, company_summary } = report
  const firstPartner = partners[0] ?? null

  return (
    <div className="space-y-5">

      {/* Summary KPI strip */}
      <Panel>
        <PanelHeader label="Sermaye Getiri Özeti" />
        <KpiStrip>
          <KpiCell
            label="Toplam Sermaye Riski"
            value={fmtTRY(company_summary.total_capital_at_risk)}
          />
          <KpiCell
            label="Toplam Getiri"
            value={fmtTRY(company_summary.total_returned)}
          />
          <KpiCell
            label="Ağırlıklı Getiri Oranı"
            value={company_summary.weighted_return_ratio_pct !== null
              ? fmtPct(company_summary.weighted_return_ratio_pct)
              : '—'}
          />
          <KpiCell
            label="Ort. Başa Baş Süre"
            value={fmtMonths(company_summary.avg_break_even_months)}
          />
        </KpiStrip>
      </Panel>

      {/* Per-partner cards */}
      {partners.length === 0 ? (
        <EmptySlate
          title="Ortak bulunamadı"
          sub="Bu şirkete ait aktif ortak kaydı yok."
        />
      ) : (
        <Panel>
          <PanelHeader label="Ortak Bazlı Sermaye Getirisi" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-1">
            {partners.map(p => (
              <PartnerCard key={p.partner_id} partner={p} />
            ))}
          </div>
        </Panel>
      )}

      {/* 24-month projection table for first partner */}
      {firstPartner && (
        <Panel>
          <PanelHeader
            label={`Sermaye Geri Dönüş Projeksiyonu — ${firstPartner.partner_name}`}
          />
          <p className="text-xs text-[#94a3b8] mt-0.5 mb-3 px-1">
            Mevcut aylık ortalama getiri baz alınarak 6/12/18/24 aylık kümülatif tahmin
          </p>
          <ProjectionTable partner={firstPartner} />
        </Panel>
      )}

      <NarrativeFooter
        narrative="Sermaye riski = ödenen sermaye + net kredi bakiyesi. Getiri = temettü + kredi geri ödemeleri. Başa baş süresi: kalan sermayenin aylık ortalama getiriyle karşılanması için gereken süre."
        links={[]}
      />

    </div>
  )
}
