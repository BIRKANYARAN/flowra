// ─────────────────────────────────────────────────────────────────────────────
// Financial Calendar Service
//
// Builds a year-view calendar of every important financial date:
//   • Turkish tax deadlines (hardcoded from law)
//   • Accounting period close / lock / end dates (from DB)
//   • Partner loan maturities and capital payment dates (from DB)
//   • Workflow deadlines and governance events (from DB)
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'

// ── Types ─────────────────────────────────────────────────────────────────────

export type CalendarEventType =
  | 'tax_kdv' | 'tax_sgk' | 'tax_gecici' | 'tax_kv'
  | 'period_close' | 'period_lock' | 'period_end'
  | 'loan_maturity' | 'capital_payment'
  | 'workflow_deadline' | 'custom'

export type CalendarEventStatus = 'upcoming' | 'due_today' | 'overdue' | 'completed'

export interface CalendarEvent {
  id: string
  date: string              // 'YYYY-MM-DD'
  type: CalendarEventType
  category: 'tax' | 'accounting' | 'partner' | 'governance'
  title: string             // Turkish
  description: string       // Turkish
  amount_try?: number
  status: CalendarEventStatus
  days_until: number        // negative if overdue
  is_blocking: boolean      // must be completed before something else
  action_label?: string     // Turkish
  action_href?: string
}

export interface MonthCalendar {
  year: number
  month: number             // 1-12
  month_label: string       // Turkish: 'Mayıs 2026'
  events: CalendarEvent[]
  event_count: number
  tax_events: number
  accounting_events: number
  partner_events: number
  is_heavy_month: boolean   // total events > 5
}

export interface FinancialCalendarReport {
  company_id: string
  year: number
  months: MonthCalendar[]   // all 12 months
  all_events: CalendarEvent[]
  // Stats
  total_events: number
  overdue_events: number
  upcoming_30d: CalendarEvent[]   // next 30 days, sorted by date
  next_event?: CalendarEvent      // single most urgent upcoming
  heaviest_month: number          // month number with most events
  computed_at: string
}

// ── Turkish month names ───────────────────────────────────────────────────────

const TR_MONTHS = [
  'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
]

// ── Pure helper functions (exported) ─────────────────────────────────────────

/**
 * Positive = days in future; 0 = today; negative = overdue
 */
export function computeDaysUntil(eventDate: string, today: string): number {
  const e = new Date(eventDate + 'T00:00:00Z')
  const t = new Date(today   + 'T00:00:00Z')
  return Math.round((e.getTime() - t.getTime()) / 86400000)
}

/**
 * due_today if same day; overdue if past; upcoming if future
 * 'completed' only set externally for confirmed-closed accounting events
 */
export function assignEventStatus(eventDate: string, today: string): CalendarEventStatus {
  const days = computeDaysUntil(eventDate, today)
  if (days === 0) return 'due_today'
  if (days < 0)  return 'overdue'
  return 'upcoming'
}

/**
 * Sort events by date ASC; same date: tax before accounting before partner.
 */
export function sortEventsByDate(events: CalendarEvent[]): CalendarEvent[] {
  const catOrder: Record<string, number> = { tax: 0, accounting: 1, partner: 2, governance: 3 }
  return [...events].sort((a, b) => {
    const dateCmp = a.date.localeCompare(b.date)
    if (dateCmp !== 0) return dateCmp
    return (catOrder[a.category] ?? 9) - (catOrder[b.category] ?? 9)
  })
}

/**
 * Returns all 29 Turkish tax events for the given year.
 *
 * KDV (12):   Due 26th of NEXT month for each month of the year.
 *             e.g., January KDV → February 26; December KDV → January 26 of next year.
 * SGK (12):   Due 26th of NEXT month for each month of the year.
 * Geçici (4): Q1=May 17, Q2=Aug 17, Q3=Nov 17, Q4=Feb 17 of NEXT year.
 * KV (1):     April 30 of NEXT year.
 */
export function buildTaxEventsForYear(year: number, today: string): CalendarEvent[] {
  const events: CalendarEvent[] = []

  // Helper: format YYYY-MM-DD with zero-padding
  function pad(n: number): string { return String(n).padStart(2, '0') }

  // ── KDV & SGK: for each calendar month, due on the 26th of next month ─────
  for (let month = 1; month <= 12; month++) {
    // Next month (could spill into next year)
    const dueMonth = month === 12 ? 1 : month + 1
    const dueYear  = month === 12 ? year + 1 : year
    const dueDate  = `${dueYear}-${pad(dueMonth)}-26`
    const periodLabel = `${TR_MONTHS[month - 1]} ${year}`

    // KDV
    events.push({
      id: `kdv-${year}-${pad(month)}`,
      date: dueDate,
      type: 'tax_kdv',
      category: 'tax',
      title: `KDV Beyannamesi — ${periodLabel}`,
      description: `${periodLabel} dönemi KDV beyannamesi ve ödemesi`,
      status: assignEventStatus(dueDate, today),
      days_until: computeDaysUntil(dueDate, today),
      is_blocking: true,
      action_label: 'Vergi Takvimi',
      action_href: '/dashboard/finance?tab=tax',
    })

    // SGK
    events.push({
      id: `sgk-${year}-${pad(month)}`,
      date: dueDate,
      type: 'tax_sgk',
      category: 'tax',
      title: `SGK Primi — ${periodLabel}`,
      description: `${periodLabel} dönemi SGK prim bildirimi ve ödemesi`,
      status: assignEventStatus(dueDate, today),
      days_until: computeDaysUntil(dueDate, today),
      is_blocking: true,
      action_label: 'Vergi Takvimi',
      action_href: '/dashboard/finance?tab=tax',
    })
  }

  // ── Geçici Vergi (4 quarters) ─────────────────────────────────────────────
  const geciciDates: Array<{ q: string; date: string }> = [
    { q: 'Q1', date: `${year}-05-17` },
    { q: 'Q2', date: `${year}-08-17` },
    { q: 'Q3', date: `${year}-11-17` },
    { q: 'Q4', date: `${year + 1}-02-17` },
  ]
  for (const { q, date } of geciciDates) {
    events.push({
      id: `gecici-${year}-${q}`,
      date,
      type: 'tax_gecici',
      category: 'tax',
      title: `Geçici Vergi — ${year} ${q}`,
      description: `${year} yılı ${q} dönemi geçici vergi beyannamesi`,
      status: assignEventStatus(date, today),
      days_until: computeDaysUntil(date, today),
      is_blocking: true,
      action_label: 'Vergi Takvimi',
      action_href: '/dashboard/finance?tab=tax',
    })
  }

  // ── Kurumlar Vergisi ──────────────────────────────────────────────────────
  const kvDate = `${year + 1}-04-30`
  events.push({
    id: `kv-${year}`,
    date: kvDate,
    type: 'tax_kv',
    category: 'tax',
    title: `Kurumlar Vergisi — ${year}`,
    description: `${year} yılı kurumlar vergisi beyannamesi ve ödemesi`,
    status: assignEventStatus(kvDate, today),
    days_until: computeDaysUntil(kvDate, today),
    is_blocking: true,
    action_label: 'Vergi Takvimi',
    action_href: '/dashboard/finance?tab=tax',
  })

  return events
}

/**
 * Builds the MonthCalendar for a given year/month from a flat events list.
 */
export function buildMonthCalendar(year: number, month: number, events: CalendarEvent[]): MonthCalendar {
  const pad = (n: number) => String(n).padStart(2, '0')
  const prefix = `${year}-${pad(month)}`
  const monthEvents = sortEventsByDate(events.filter(e => e.date.startsWith(prefix)))

  return {
    year,
    month,
    month_label: `${TR_MONTHS[month - 1]} ${year}`,
    events: monthEvents,
    event_count: monthEvents.length,
    tax_events: monthEvents.filter(e => e.category === 'tax').length,
    accounting_events: monthEvents.filter(e => e.category === 'accounting').length,
    partner_events: monthEvents.filter(e => e.category === 'partner').length,
    is_heavy_month: monthEvents.length > 5,
  }
}

// ── Additional pure helpers ───────────────────────────────────────────────────

/**
 * Compute days until a financial event.
 * Positive = future, 0 = today, negative = overdue.
 */
export function daysUntilFinancialEvent(eventDateStr: string, todayStr: string): number {
  return computeDaysUntil(eventDateStr, todayStr)
}

/**
 * Classify the urgency of a financial event based on days until.
 * overdue:  < 0
 * critical: 0–7
 * warning:  8–14
 * upcoming: > 14
 */
export function classifyEventUrgency(
  daysUntil: number,
): 'overdue' | 'critical' | 'warning' | 'upcoming' {
  if (daysUntil < 0)   return 'overdue'
  if (daysUntil <= 7)  return 'critical'
  if (daysUntil <= 14) return 'warning'
  return 'upcoming'
}

/**
 * Build a Turkish-language event summary string.
 * e.g. "3 etkinlik: 1 kritik, 2 yaklaşan"
 *
 * Counts by urgency (excluding overdue for brevity):
 *   critical  → "kritik"
 *   warning   → "uyarı"
 *   upcoming  → "yaklaşan"
 *   overdue   → "gecikmiş"
 */
export function buildEventSummary(
  events: Array<{ title: string; daysUntil: number }>,
): string {
  const total    = events.length
  if (total === 0) return '0 etkinlik'

  const counts: Record<string, number> = { overdue: 0, critical: 0, warning: 0, upcoming: 0 }
  for (const e of events) {
    counts[classifyEventUrgency(e.daysUntil)] = (counts[classifyEventUrgency(e.daysUntil)] ?? 0) + 1
  }

  const parts: string[] = []
  if (counts.overdue  > 0) parts.push(`${counts.overdue} gecikmiş`)
  if (counts.critical > 0) parts.push(`${counts.critical} kritik`)
  if (counts.warning  > 0) parts.push(`${counts.warning} uyarı`)
  if (counts.upcoming > 0) parts.push(`${counts.upcoming} yaklaşan`)

  return `${total} etkinlik: ${parts.join(', ')}`
}

// ── Main service ──────────────────────────────────────────────────────────────

export class FinancialCalendarService {

  static async getReport(
    companyId: string,
    supabase: SupabaseClient,
    year: number,
  ): Promise<FinancialCalendarReport> {
    const today = new Date().toISOString().slice(0, 10)

    // ── Tax events (hardcoded) ───────────────────────────────────────────────
    const taxEvents = buildTaxEventsForYear(year, today)

    // ── Accounting period events ─────────────────────────────────────────────
    const accountingEvents: CalendarEvent[] = []
    try {
      const { data: periods } = await supabase
        .from('accounting_periods')
        .select('id, period_start, period_end, status, closed_at')
        .eq('company_id', companyId)
        .gte('period_end', `${year}-01-01`)
        .lte('period_start', `${year}-12-31`)
        .order('period_start', { ascending: true })

      for (const p of periods ?? []) {
        const isClosed = p.status === 'closed'
        const endDate  = p.period_end as string
        const closedAt = p.closed_at ? (p.closed_at as string).slice(0, 10) : null
        const monthLabel = endDate ? endDate.slice(0, 7) : ''

        // Period end (reporting due)
        if (endDate && endDate.startsWith(String(year))) {
          accountingEvents.push({
            id: `period-end-${p.id}`,
            date: endDate,
            type: 'period_end',
            category: 'accounting',
            title: `Dönem Kapanış Hazırlığı — ${monthLabel}`,
            description: `${monthLabel} muhasebe dönemi raporlama son tarihi`,
            status: isClosed ? 'completed' : assignEventStatus(endDate, today),
            days_until: computeDaysUntil(endDate, today),
            is_blocking: true,
            action_label: 'Dönem Kapat',
            action_href: '/dashboard/finance?tab=overview',
          })
        }

        // Period close (when it was closed)
        if (closedAt && closedAt.startsWith(String(year))) {
          accountingEvents.push({
            id: `period-close-${p.id}`,
            date: closedAt,
            type: 'period_close',
            category: 'accounting',
            title: `Dönem Kapatıldı — ${monthLabel}`,
            description: `${monthLabel} muhasebe dönemi kapatma tarihi`,
            status: 'completed',
            days_until: computeDaysUntil(closedAt, today),
            is_blocking: false,
            action_label: 'Dönem Detayı',
            action_href: '/dashboard/finance?tab=overview',
          })
        }
      }
    } catch {
      // Non-fatal: DB may not have periods yet
    }

    // ── Partner events ────────────────────────────────────────────────────────
    const partnerEvents: CalendarEvent[] = []
    try {
      // Loan tranches — real maturity column is expected_repayment_date;
      // outstanding is computed (no outstanding_try column): principal_try − total_repaid_try
      const { data: tranches } = await supabase
        .from('partner_loan_tranches')
        .select('id, expected_repayment_date, principal_try, total_repaid_try, status, notes')
        .eq('company_id', companyId)
        .not('expected_repayment_date', 'is', null)
        .neq('status', 'repaid')
        .gte('expected_repayment_date', `${year}-01-01`)
        .lte('expected_repayment_date', `${year}-12-31`)
        .order('expected_repayment_date', { ascending: true })

      for (const t of tranches ?? []) {
        const dueDate = t.expected_repayment_date as string
        const outstanding = Math.max(0, Number(t.principal_try ?? 0) - Number(t.total_repaid_try ?? 0))
        partnerEvents.push({
          id: `loan-${t.id}`,
          date: dueDate,
          type: 'loan_maturity',
          category: 'partner',
          title: `Kredi Vadesi — ${dueDate.slice(0, 7)}`,
          description: `Ortak kredisi geri ödeme vadesi${t.notes ? ': ' + t.notes : ''}`,
          amount_try: outstanding || undefined,
          status: assignEventStatus(dueDate, today),
          days_until: computeDaysUntil(dueDate, today),
          is_blocking: true,
          action_label: 'Ortak Finansmanı',
          action_href: '/dashboard/partners',
        })
      }

      // Capital commitments with a due date. NB: real columns are due_date /
      // committed_try / paid_try (the old call_date / committed_amount_try /
      // paid_amount_try / payment_status don't exist → query error → no capital
      // events). "Not fully paid" is enforced below via remaining > 0; cancelled
      // commitments are soft-deleted (deleted_at).
      const { data: commitments } = await supabase
        .from('partner_capital_commitments')
        .select('id, due_date, committed_try, paid_try')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .not('due_date', 'is', null)
        .gte('due_date', `${year}-01-01`)
        .lte('due_date', `${year}-12-31`)
        .order('due_date', { ascending: true })

      for (const c of commitments ?? []) {
        const callDate = c.due_date as string
        const remaining = ((c.committed_try ?? 0) - (c.paid_try ?? 0))
        partnerEvents.push({
          id: `capital-${c.id}`,
          date: callDate,
          type: 'capital_payment',
          category: 'partner',
          title: `Sermaye Taahhüdü — ${callDate.slice(0, 7)}`,
          description: `Ortak sermaye taahhüdü ödeme tarihi`,
          amount_try: remaining > 0 ? remaining : undefined,
          status: assignEventStatus(callDate, today),
          days_until: computeDaysUntil(callDate, today),
          is_blocking: true,
          action_label: 'Ortak Finansmanı',
          action_href: '/dashboard/partners',
        })
      }
    } catch {
      // Non-fatal
    }

    // ── Workflow deadline events ───────────────────────────────────────────────
    const governanceEvents: CalendarEvent[] = []
    try {
      const { data: workflows } = await supabase
        .from('workflow_instances')
        .select('id, workflow_type, due_date, status, initiated_at')
        .eq('company_id', companyId)
        .not('due_date', 'is', null)
        .in('status', ['pending', 'in_review'])
        .gte('due_date', `${year}-01-01`)
        .lte('due_date', `${year}-12-31`)
        .order('due_date', { ascending: true })

      for (const w of workflows ?? []) {
        const dueDate = (w.due_date as string).slice(0, 10)
        governanceEvents.push({
          id: `workflow-${w.id}`,
          date: dueDate,
          type: 'workflow_deadline',
          category: 'governance',
          title: `İş Akışı Vadesi — ${w.workflow_type ?? 'Onay'}`,
          description: `Bekleyen iş akışı onay son tarihi`,
          status: assignEventStatus(dueDate, today),
          days_until: computeDaysUntil(dueDate, today),
          is_blocking: false,
          action_label: 'İş Akışları',
          action_href: '/dashboard/admin/workflows',
        })
      }
    } catch {
      // Non-fatal: workflow_instances table may not exist
    }

    // ── Assemble ──────────────────────────────────────────────────────────────
    const allEvents = sortEventsByDate([
      ...taxEvents,
      ...accountingEvents,
      ...partnerEvents,
      ...governanceEvents,
    ])

    // Build 12 month calendars
    const months: MonthCalendar[] = []
    for (let m = 1; m <= 12; m++) {
      months.push(buildMonthCalendar(year, m, allEvents))
    }

    const overdue = allEvents.filter(e => e.status === 'overdue')
    const cutoff  = new Date(today)
    cutoff.setDate(cutoff.getDate() + 30)
    const cutoffStr = cutoff.toISOString().slice(0, 10)

    const upcoming30d = sortEventsByDate(
      allEvents.filter(e =>
        (e.status === 'upcoming' || e.status === 'due_today') &&
        e.date <= cutoffStr,
      ),
    )

    const heaviest = months.reduce((best, m) =>
      m.event_count > best.event_count ? m : best, months[0])

    return {
      company_id: companyId,
      year,
      months,
      all_events: allEvents,
      total_events: allEvents.length,
      overdue_events: overdue.length,
      upcoming_30d: upcoming30d,
      next_event: upcoming30d[0],
      heaviest_month: heaviest.month,
      computed_at: new Date().toISOString(),
    }
  }
}
