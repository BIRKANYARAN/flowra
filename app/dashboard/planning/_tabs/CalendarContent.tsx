'use client'
// ── CalendarContent — Yıllık Finansal Takvim ─────────────────────────────────
//
// CFO's master calendar: tax deadlines, accounting period close dates,
// partner obligations, and governance events — all in one year view.
//
// Layout:
//   • Year selector (current year / next year)
//   • Summary strip: total events, overdue (red), upcoming 30d
//   • 12-month grid (4 cols): each card shows event count + colored dots
//     - red  = tax events
//     - blue = accounting events
//     - orange = partner events
//     - is_heavy_month → yellow border
//     - click → expand event list below card
//   • "Acil Takvim" section: next 30 days sorted list

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type {
  FinancialCalendarReport,
  MonthCalendar,
  CalendarEvent,
} from '@/lib/services/intelligence/financial-calendar.service'

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtTRY(n: number): string {
  return new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency: 'TRY',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n)
}

function statusColor(s: CalendarEvent['status']): string {
  switch (s) {
    case 'overdue':   return 'text-red-600'
    case 'due_today': return 'text-amber-600'
    case 'completed': return 'text-green-600'
    default:          return 'text-[#64748b]'
  }
}

function statusBadge(s: CalendarEvent['status']): string {
  switch (s) {
    case 'overdue':   return 'bg-red-100 text-red-700'
    case 'due_today': return 'bg-amber-100 text-amber-700'
    case 'completed': return 'bg-green-100 text-green-700'
    default:          return 'bg-[#f1f5f9] text-[#64748b]'
  }
}

function statusLabel(s: CalendarEvent['status']): string {
  switch (s) {
    case 'overdue':   return 'Gecikmiş'
    case 'due_today': return 'Bugün'
    case 'completed': return 'Tamamlandı'
    default:          return 'Yaklaşan'
  }
}

function categoryDotColor(cat: CalendarEvent['category']): string {
  switch (cat) {
    case 'tax':        return 'bg-red-500'
    case 'accounting': return 'bg-blue-500'
    case 'partner':    return 'bg-orange-500'
    default:           return 'bg-[#94a3b8]'
  }
}

function daysLabel(days: number): string {
  if (days === 0) return 'Bugün'
  if (days > 0)   return `${days} gün kaldı`
  return `${Math.abs(days)} gün geçti`
}

// ── Sub-components ────────────────────────────────────────────────────────────

function EventRow({ event }: { event: CalendarEvent }) {
  return (
    <div className="flex items-start gap-2 py-2 border-b border-[#f1f5f9] last:border-0">
      <div className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${categoryDotColor(event.category)}`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-semibold text-[#0f172a] truncate">{event.title}</span>
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${statusBadge(event.status)}`}>
            {statusLabel(event.status)}
          </span>
          {event.is_blocking && (
            <span className="text-[10px] text-[#94a3b8]">engelleyici</span>
          )}
        </div>
        <div className="flex items-center gap-3 mt-0.5">
          <span className="text-[11px] text-[#64748b]">{event.date}</span>
          <span className={`text-[11px] font-medium ${statusColor(event.status)}`}>
            {daysLabel(event.days_until)}
          </span>
          {event.amount_try != null && (
            <span className="text-[11px] text-[#0f172a] font-medium">{fmtTRY(event.amount_try)}</span>
          )}
        </div>
        {event.description && (
          <p className="text-[11px] text-[#94a3b8] mt-0.5 leading-tight">{event.description}</p>
        )}
      </div>
      {event.action_href && event.action_label && (
        <a
          href={event.action_href}
          className="text-[10px] text-brand-light font-semibold hover:underline flex-shrink-0 mt-0.5"
        >
          {event.action_label}
        </a>
      )}
    </div>
  )
}

function MonthCard({
  month,
  isExpanded,
  onToggle,
}: {
  month: MonthCalendar
  isExpanded: boolean
  onToggle: () => void
}) {
  const hasOverdue = month.events.some(e => e.status === 'overdue')
  const hasDueToday = month.events.some(e => e.status === 'due_today')

  return (
    <div
      className={[
        'rounded-lg border bg-white cursor-pointer transition-all',
        isExpanded ? 'shadow-md' : 'hover:shadow-sm',
        month.is_heavy_month ? 'border-amber-300' : 'border-[#e8eaef]',
        hasOverdue ? 'ring-1 ring-red-200' : '',
      ].join(' ')}
      onClick={onToggle}
    >
      <div className="p-3">
        <div className="flex items-start justify-between gap-1">
          <div>
            <div className="text-xs font-black text-[#0f172a]">{month.month_label}</div>
            {month.event_count === 0 ? (
              <div className="text-[10px] text-[#cbd5e1] mt-0.5">Etkinlik yok</div>
            ) : (
              <div className="text-[10px] text-[#64748b] mt-0.5">
                {month.event_count} etkinlik
              </div>
            )}
          </div>
          <div className="flex flex-col items-end gap-0.5">
            {hasOverdue && <span className="text-[9px] font-bold text-red-600 bg-red-50 px-1.5 py-0.5 rounded">GECİKMİŞ</span>}
            {hasDueToday && !hasOverdue && <span className="text-[9px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">BUGÜN</span>}
          </div>
        </div>

        {/* Category dots */}
        {month.event_count > 0 && (
          <div className="flex items-center gap-1.5 mt-2 flex-wrap">
            {month.tax_events > 0 && (
              <div className="flex items-center gap-0.5">
                <div className="w-1.5 h-1.5 rounded-full bg-red-500" />
                <span className="text-[10px] text-[#64748b]">{month.tax_events}</span>
              </div>
            )}
            {month.accounting_events > 0 && (
              <div className="flex items-center gap-0.5">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                <span className="text-[10px] text-[#64748b]">{month.accounting_events}</span>
              </div>
            )}
            {month.partner_events > 0 && (
              <div className="flex items-center gap-0.5">
                <div className="w-1.5 h-1.5 rounded-full bg-orange-500" />
                <span className="text-[10px] text-[#64748b]">{month.partner_events}</span>
              </div>
            )}
            {month.is_heavy_month && (
              <span className="text-[9px] text-amber-600 font-semibold ml-auto">yoğun</span>
            )}
          </div>
        )}
      </div>

      {/* Expanded event list */}
      {isExpanded && month.events.length > 0 && (
        <div className="px-3 pb-3 border-t border-[#f1f5f9] mt-1 pt-2">
          {month.events.map(e => <EventRow key={e.id} event={e} />)}
        </div>
      )}
    </div>
  )
}

// ── Legend ────────────────────────────────────────────────────────────────────

function Legend() {
  return (
    <div className="flex items-center gap-4 flex-wrap">
      {[
        { color: 'bg-red-500', label: 'Vergi' },
        { color: 'bg-blue-500', label: 'Muhasebe' },
        { color: 'bg-orange-500', label: 'Ortak' },
        { color: 'bg-[#94a3b8]', label: 'Yönetişim' },
      ].map(({ color, label }) => (
        <div key={label} className="flex items-center gap-1">
          <div className={`w-2 h-2 rounded-full ${color}`} />
          <span className="text-[11px] text-[#64748b]">{label}</span>
        </div>
      ))}
      <div className="flex items-center gap-1 ml-2">
        <div className="w-4 h-3 border-2 border-amber-300 rounded" />
        <span className="text-[11px] text-[#64748b]">Yoğun ay (&gt;5 etkinlik)</span>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  companyId: string
}

export function CalendarContent({ companyId }: Props) {
  const currentYear = new Date().getFullYear()
  const [year, setYear] = useState(currentYear)
  const [expandedMonth, setExpandedMonth] = useState<number | null>(null)

  const { data, isLoading, error } = useQuery<{ report: FinancialCalendarReport }>({
    queryKey: ['financial-calendar', companyId, year],
    queryFn: async () => {
      const res = await fetch(`/api/intelligence/financial-calendar?year=${year}`)
      if (!res.ok) throw new Error('Takvim yüklenemedi')
      return res.json()
    },
    staleTime: 60 * 60 * 1000, // 1 hour
  })

  const report = data?.report

  function toggleMonth(month: number) {
    setExpandedMonth(prev => prev === month ? null : month)
  }

  if (isLoading) {
    return (
      <div className="space-y-3 animate-pulse">
        <div className="grid grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => <div key={i} className="bg-[#f1f5f9] rounded h-20" />)}
        </div>
        <div className="bg-[#f1f5f9] rounded h-48" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-sm text-red-500">Takvim yüklenirken hata oluştu.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">

      {/* Header + Year Selector */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-sm font-black text-[#0f172a]">Yıllık Finansal Takvim</h2>
          <p className="text-xs text-[#94a3b8] mt-0.5">Tüm vergi, muhasebe ve ortak yükümlülükleri</p>
        </div>
        <div className="flex items-center gap-2">
          {[currentYear, currentYear + 1].map(y => (
            <button
              key={y}
              onClick={() => { setYear(y); setExpandedMonth(null) }}
              className={[
                'px-3 py-1.5 rounded-md text-xs font-bold transition-colors',
                year === y
                  ? 'bg-[#0f172a] text-white'
                  : 'bg-[#f1f5f9] text-[#64748b] hover:bg-[#e2e8f0]',
              ].join(' ')}
            >
              {y}
            </button>
          ))}
        </div>
      </div>

      {/* Summary strip */}
      {report && (
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-[#f8fafc] rounded-lg p-3 border border-[#e8eaef]">
            <div className="text-[10px] font-bold uppercase tracking-wider text-[#94a3b8]">Toplam Etkinlik</div>
            <div className="text-2xl font-bold text-[#0f172a] mt-1">{report.total_events}</div>
          </div>
          <div className={[
            'rounded-lg p-3 border',
            report.overdue_events > 0
              ? 'bg-red-50 border-red-200'
              : 'bg-[#f8fafc] border-[#e8eaef]',
          ].join(' ')}>
            <div className={[
              'text-[10px] font-bold uppercase tracking-wider',
              report.overdue_events > 0 ? 'text-red-400' : 'text-[#94a3b8]',
            ].join(' ')}>Gecikmiş</div>
            <div className={[
              'text-2xl font-bold mt-1',
              report.overdue_events > 0 ? 'text-red-600' : 'text-[#0f172a]',
            ].join(' ')}>{report.overdue_events}</div>
          </div>
          <div className="bg-[#f8fafc] rounded-lg p-3 border border-[#e8eaef]">
            <div className="text-[10px] font-bold uppercase tracking-wider text-[#94a3b8]">30 Günde Yaklaşan</div>
            <div className="text-2xl font-bold text-[#0f172a] mt-1">{report.upcoming_30d.length}</div>
          </div>
        </div>
      )}

      {/* Legend */}
      <Legend />

      {/* 12-month grid */}
      {report && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {report.months.map(month => (
            <MonthCard
              key={month.month}
              month={month}
              isExpanded={expandedMonth === month.month}
              onToggle={() => toggleMonth(month.month)}
            />
          ))}
        </div>
      )}

      {/* Acil Takvim — next 30 days */}
      {report && report.upcoming_30d.length > 0 && (
        <div>
          <div className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8] mb-3">
            Acil Takvim — Sonraki 30 Gün
          </div>
          <div className="bg-white rounded-lg border border-[#e8eaef] divide-y divide-[#f1f5f9]">
            {report.upcoming_30d.map(event => (
              <div key={event.id} className="px-4 py-3">
                <EventRow event={event} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Overdue section */}
      {report && report.overdue_events > 0 && (
        <div>
          <div className="text-[0.65rem] font-bold uppercase tracking-wider text-red-400 mb-3">
            Gecikmiş Etkinlikler ({report.overdue_events})
          </div>
          <div className="bg-red-50 rounded-lg border border-red-200 divide-y divide-red-100">
            {report.all_events
              .filter(e => e.status === 'overdue')
              .map(event => (
                <div key={event.id} className="px-4 py-3">
                  <EventRow event={event} />
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {report && report.total_events === 0 && (
        <div className="text-center py-16">
          <p className="text-sm text-[#64748b]">{year} yılı için etkinlik bulunamadı.</p>
        </div>
      )}
    </div>
  )
}
