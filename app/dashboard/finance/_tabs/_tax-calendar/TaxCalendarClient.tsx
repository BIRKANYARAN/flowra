'use client'
// ─────────────────────────────────────────────────────────────────────────────
// TaxCalendarClient — Vergi Takvimi
//
// Displays the forward-looking Turkish tax obligation calendar.
//
// Layout:
//   - 3 KPI cells: overdue count+amount / due_soon count+amount / compliance score
//   - Timeline list (next 6 months), obligations grouped by month
//     Each row: tax type label, amount estimate, due date, status badge
//
// Uses: Panel, PanelHeader, KpiStrip, KpiCell, EmptySlate, Skeleton from DS
// ─────────────────────────────────────────────────────────────────────────────

import { useQuery }    from '@tanstack/react-query'
import { fmtTRY }      from '@/lib/format'
import type { TaxCalendarReport, TaxObligation, TaxType } from '@/lib/services/finance/tax-calendar.service'
import {
  Panel,
  PanelHeader,
  KpiStrip,
  KpiCell,
  EmptySlate,
  Skeleton,
} from '@/components/ds'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Props {
  companyId: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function statusBadgeCls(status: TaxObligation['status']): string {
  switch (status) {
    case 'overdue':  return 'bg-[#fee2e2] text-[#991b1b] border-[#fca5a5]'
    case 'due_soon': return 'bg-[#ffedd5] text-[#9a3412] border-[#fdba74]'
    case 'paid':     return 'bg-[#dcfce7] text-[#166534] border-[#86efac]'
    default:         return 'bg-[#f1f5f9] text-[#64748b] border-[#e8eaef]'
  }
}

function statusBadgeLabel(status: TaxObligation['status'], daysUntilDue: number): string {
  switch (status) {
    case 'overdue':  return `${Math.abs(daysUntilDue)} gün gecikti`
    case 'due_soon': return `${daysUntilDue} gün kaldı`
    case 'paid':     return 'Ödendi'
    default:         return `${daysUntilDue} gün`
  }
}

function taxTypeLabel(taxType: TaxType): string {
  switch (taxType) {
    case 'kdv':               return 'KDV'
    case 'muhtasar':          return 'Muhtasar (Stopaj)'
    case 'gecici_vergi':      return 'Geçici Vergi'
    case 'kurumlar_vergisi':  return 'Kurumlar Vergisi'
    case 'sgk':               return 'SGK Primleri'
    case 'bag_kur':           return 'Bağ-Kur'
  }
}

function taxTypeIcon(taxType: TaxType): string {
  switch (taxType) {
    case 'kdv':               return '🏷'
    case 'muhtasar':          return '📋'
    case 'gecici_vergi':      return '📊'
    case 'kurumlar_vergisi':  return '🏢'
    case 'sgk':               return '👥'
    case 'bag_kur':           return '🔑'
  }
}

function complianceScoreColor(score: number): string {
  if (score >= 80) return 'text-[#16a34a]'
  if (score >= 60) return 'text-[#d97706]'
  return 'text-[#dc2626]'
}

/** Group obligations by YYYY-MM of due date, show next 6 months only */
function groupByMonth(obligations: TaxObligation[]): Map<string, TaxObligation[]> {
  const map = new Map<string, TaxObligation[]>()
  for (const ob of obligations) {
    const ym = ob.due_date.slice(0, 7)
    const arr = map.get(ym) ?? []
    arr.push(ob)
    map.set(ym, arr)
  }
  return map
}

const TR_MONTHS = [
  'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
]

function formatYM(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  return `${TR_MONTHS[(m ?? 1) - 1] ?? ym} ${y}`
}

function formatDueDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-')
  return `${d}.${m}.${y}`
}

// ── Component ──────────────────────────────────────────────────────────────────

export function TaxCalendarClient({ companyId }: Props) {
  const { data, isLoading, isError } = useQuery<{ report: TaxCalendarReport }>({
    queryKey: ['tax-calendar', companyId],
    queryFn:  async () => {
      const res = await fetch('/api/finance/tax-calendar')
      if (!res.ok) throw new Error('Vergi takvimi yüklenemedi')
      return res.json()
    },
    staleTime: 1000 * 60 * 60, // 1 hour
  })

  // ── Loading state ────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <Panel>
        <PanelHeader label="Vergi Takvimi" sub="Önümüzdeki 12 ay · KDV · Muhtasar · Geçici Vergi · SGK" />
        <div className="p-4 space-y-3">
          <Skeleton className="h-16 w-full rounded" />
          <Skeleton className="h-40 w-full rounded" />
        </div>
      </Panel>
    )
  }

  // ── Error state ──────────────────────────────────────────────────────────
  if (isError || !data?.report) {
    return (
      <Panel>
        <PanelHeader label="Vergi Takvimi" sub="Önümüzdeki 12 ay · KDV · Muhtasar · Geçici Vergi · SGK" />
        <EmptySlate
          icon="⚠"
          title="Vergi takvimi yüklenemedi"
          sub="Lütfen daha sonra tekrar deneyin."
        />
      </Panel>
    )
  }

  const report = data.report

  // Filter to next 6 months for timeline display
  const today = new Date().toISOString().slice(0, 10)
  const sixMonthsLater = new Date()
  sixMonthsLater.setMonth(sixMonthsLater.getMonth() + 6)
  const sixMonthsLaterStr = sixMonthsLater.toISOString().slice(0, 10)

  const timelineObligations = report.obligations.filter(o => o.due_date <= sixMonthsLaterStr)
  const grouped = groupByMonth(timelineObligations)
  const sortedMonths = [...grouped.keys()].sort()

  return (
    <Panel>
      <PanelHeader
        label="Vergi Takvimi"
        sub="Önümüzdeki 12 ay · KDV · Muhtasar · Geçici Vergi · SGK · Kurumlar Vergisi"
      />

      {/* KPI Strip */}
      <KpiStrip>
        <KpiCell
          label="Vadesi Geçmiş"
          value={
            <span className="text-[#dc2626] font-black">
              {report.overdue_count > 0
                ? `${report.overdue_count} yükümlülük · ${fmtTRY(report.total_overdue_try)}`
                : 'Yok'
              }
            </span>
          }
          sub={report.overdue_count > 0 ? 'Acil ödeme gerekiyor' : 'Tüm yükümlülükler zamanında'}
        />
        <KpiCell
          label="Yaklaşan (14 Gün)"
          value={
            <span className="text-[#d97706] font-black">
              {report.due_soon_count > 0
                ? `${report.due_soon_count} yükümlülük · ${fmtTRY(report.total_due_soon_try)}`
                : 'Yok'
              }
            </span>
          }
          sub={report.due_soon_count > 0 ? '14 gün içinde ödeme' : '14 günde yaklaşan yok'}
        />
        <KpiCell
          label="Uyum Skoru"
          value={
            <span className={`font-black ${complianceScoreColor(report.compliance_score)}`}>
              {report.compliance_score}/100
            </span>
          }
          sub={`30g: ${fmtTRY(report.upcoming_30d_try)} · 90g: ${fmtTRY(report.upcoming_90d_try)}`}
        />
      </KpiStrip>

      {/* Next due obligation highlight */}
      {report.next_obligation && (
        <div className="mx-4 mb-4 px-3 py-2 rounded border bg-[#f8fafc] border-[#e8eaef] flex items-center gap-2 text-xs">
          <span className="text-[#94a3b8] font-semibold">Bir sonraki:</span>
          <span className="font-bold text-[#1e293b]">
            {taxTypeIcon(report.next_obligation.tax_type)}{' '}
            {taxTypeLabel(report.next_obligation.tax_type)}
          </span>
          <span className="text-[#64748b]">—</span>
          <span className="text-[#64748b]">{formatDueDate(report.next_obligation.due_date)}</span>
          {report.next_obligation.estimated_amount_try > 0 && (
            <>
              <span className="text-[#94a3b8]">·</span>
              <span className="font-mono tabular-nums text-[#1e293b]">
                {fmtTRY(report.next_obligation.estimated_amount_try)}
              </span>
            </>
          )}
          <span
            className={`ml-auto text-[9px] font-bold px-1.5 py-0.5 rounded border ${statusBadgeCls(report.next_obligation.status)}`}
          >
            {statusBadgeLabel(report.next_obligation.status, report.next_obligation.days_until_due)}
          </span>
        </div>
      )}

      {/* Timeline */}
      {timelineObligations.length === 0 ? (
        <EmptySlate
          icon="📅"
          title="Yaklaşan vergi yükümlülüğü bulunamadı"
          sub="Önümüzdeki 6 ayda herhangi bir yükümlülük hesaplanamadı."
        />
      ) : (
        <div className="px-4 pb-4 space-y-5">
          {sortedMonths.map(ym => {
            const monthObs = grouped.get(ym) ?? []
            return (
              <div key={ym}>
                {/* Month header */}
                <div className="text-[0.6rem] font-bold uppercase tracking-wider text-[#94a3b8] mb-2 flex items-center gap-2">
                  <span>{formatYM(ym)}</span>
                  <div className="flex-1 h-px bg-[#f1f5f9]" />
                </div>

                {/* Obligation rows */}
                <div className="space-y-1">
                  {monthObs.map(ob => {
                    const isOverdue  = ob.status === 'overdue'
                    const isDueSoon  = ob.status === 'due_soon'
                    const rowBg      = isOverdue ? 'bg-[#fee2e2]/20' : isDueSoon ? 'bg-[#ffedd5]/20' : ''
                    const dateCls    = isOverdue ? 'text-[#991b1b] font-black' : isDueSoon ? 'text-[#9a3412] font-bold' : 'text-[#64748b]'

                    return (
                      <div
                        key={ob.id}
                        className={`flex items-center gap-3 px-3 py-2 rounded border border-[#f1f5f9] text-xs ${rowBg}`}
                      >
                        {/* Icon + label */}
                        <span className="text-sm leading-none">{taxTypeIcon(ob.tax_type)}</span>
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-[#1e293b] truncate">
                            {taxTypeLabel(ob.tax_type)}
                          </div>
                          <div className="text-[10px] text-[#94a3b8] truncate">{ob.description}</div>
                        </div>

                        {/* Due date */}
                        <span className={`text-[11px] tabular-nums ${dateCls}`}>
                          {formatDueDate(ob.due_date)}
                        </span>

                        {/* Amount */}
                        <span className="text-[11px] font-mono tabular-nums text-[#1e293b] w-24 text-right">
                          {ob.estimated_amount_try > 0
                            ? fmtTRY(ob.estimated_amount_try)
                            : <span className="text-[#cbd5e1] italic">Tahminsiz</span>
                          }
                        </span>

                        {/* Status badge */}
                        <span
                          className={`text-[9px] font-bold px-1.5 py-0.5 rounded border shrink-0 ${statusBadgeCls(ob.status)}`}
                        >
                          {statusBadgeLabel(ob.status, ob.days_until_due)}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </Panel>
  )
}
