// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/pressure/timeline?days=90
//
// Returns all time-pressured financial events for the next N days,
// plus a day-by-day projected cash trajectory.
//
// Data sources:
//   1. sales (overdue + due within N days)          → collection_due events
//   2. partner_loan_tranches (active, due_date)     → tranche_due events
//   3. accounting_periods (open, period_end)        → period_close events
//   4. recurring_expenses (projected fire dates)    → expense_commitment events
//   5. partner_capital_commitments (gap > 0)        → equity_call events
//
// Auth: resolveApiAuth
// ═══════════════════════════════════════════════════════════════════════════════

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth }            from '@/lib/api-auth'

// ── Types ──────────────────────────────────────────────────────────────────────

export type PressureEventType =
  | 'collection_due'
  | 'tranche_due'
  | 'period_close'
  | 'expense_commitment'
  | 'tax_due'
  | 'equity_call'

export type PressureSeverity = 'normal' | 'warning' | 'critical'

export interface PressureEvent {
  date:        string            // YYYY-MM-DD
  type:        PressureEventType
  label:       string            // e.g. "Mehmet A.Ş. — ₺340.000"
  amount_try:  number
  severity:    PressureSeverity
  entity_id?:  string
  action_href: string
}

export interface CashTrajectoryPoint {
  date:           string   // YYYY-MM-DD
  projected_cash: number
}

export interface PressureTimelineResponse {
  events:           PressureEvent[]
  cash_trajectory:  CashTrajectoryPoint[]
  summary: {
    total_obligations_try:         number
    total_expected_collections_try: number
    net_90_day_try:                number
    critical_events_count:         number
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function addDays(dateISO: string, days: number): string {
  const d = new Date(dateISO)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function daysBetween(fromISO: string, toISO: string): number {
  return Math.round((new Date(toISO).getTime() - new Date(fromISO).getTime()) / 86_400_000)
}

// Projects the first recurrence on/after `fromISO` for a template that began on
// `startISO` and repeats monthly/quarterly/yearly. Returns null if the template
// has already ended (endISO) before the next fire date.
function nextRecurringFireDate(
  startISO: string,
  frequency: string,
  fromISO: string,
  endISO: string | null,
): string | null {
  const stepMonths = frequency === 'yearly' ? 12 : frequency === 'quarterly' ? 3 : 1
  const start = new Date(startISO + 'T00:00:00Z')
  const from  = new Date(fromISO  + 'T00:00:00Z')
  const d = new Date(start)
  // Advance by whole periods until we reach or pass `from` (cap iterations defensively)
  let guard = 0
  while (d.getTime() < from.getTime() && guard < 1200) {
    d.setUTCMonth(d.getUTCMonth() + stepMonths)
    guard++
  }
  const fire = d.toISOString().slice(0, 10)
  if (endISO && fire > endISO) return null
  return fire
}

function eventSeverity(daysUntil: number, amount: number): PressureSeverity {
  if (daysUntil < 0)     return 'critical' // already overdue
  if (daysUntil <= 7)    return 'critical'
  if (daysUntil <= 21)   return 'warning'
  if (amount > 500_000)  return 'warning'  // large amount even if not imminent
  return 'normal'
}

function fmtAmountTRY(n: number): string {
  if (n >= 1_000_000) return `₺${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `₺${Math.round(n / 1_000)}K`
  return `₺${Math.round(n).toLocaleString('tr-TR')}`
}

// ── Route handler ──────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response
  const { companyId, supabase } = auth

  const daysParam = req.nextUrl.searchParams.get('days')
  const days      = Math.max(7, Math.min(365, Number(daysParam ?? 90) || 90))

  const todayISO  = new Date().toISOString().slice(0, 10)
  const endISO    = addDays(todayISO, days)

  // ── Parallel data fetch ──────────────────────────────────────────────────────
  const [
    salesRows,
    trancheRows,
    periodRows,
    recurringRows,
    equityRows,
  ] = await Promise.all([

    // 1. Uncollected sales with due_date
    supabase
      .from('sales')
      .select('id, customer_name, total_try:total, paid_amount, due_date, sale_date')
      .eq('company_id', companyId)
      .neq('payment_status', 'paid')
      .is('deleted_at', null)
      .not('due_date', 'is', null)
      .lte('due_date', endISO)
      .order('due_date', { ascending: true })
      .limit(200)
      .then(r => r.data ?? []),

    // 2. Active partner loan tranches with a repayment date
    // (no due_date/amount_try/outstanding_try columns — use expected_repayment_date; outstanding computed)
    supabase
      .from('partner_loan_tranches')
      .select('id, expected_repayment_date, principal_try, total_repaid_try')
      .eq('company_id', companyId)
      .eq('status', 'active')
      .not('expected_repayment_date', 'is', null)
      .lte('expected_repayment_date', endISO)
      .order('expected_repayment_date', { ascending: true })
      .then(r => r.data ?? []),

    // 3. Open accounting periods with period_end in window
    supabase
      .from('accounting_periods')
      .select('id, period_end, status')
      .eq('company_id', companyId)
      .in('status', ['open', 'pre_close'])
      .not('period_end', 'is', null)
      .lte('period_end', endISO)
      .order('period_end', { ascending: true })
      .limit(12)
      .then(r => r.data ?? []),

    // 4. Recurring expense templates — fire dates are projected in JS below
    // (no next_occurrence_date/amount_try columns; real cols: amount, fx_rate, start_date, end_date)
    supabase
      .from('recurring_expenses')
      .select('id, description, amount, fx_rate, frequency, start_date, end_date, category')
      .eq('company_id', companyId)
      .eq('is_active', true)
      .is('deleted_at', null)
      .limit(100)
      .then(r => r.data ?? []),

    // 5. Partner capital commitments with gap > 0
    supabase
      .from('partner_capital_commitments')
      .select('id, committed_try, paid_try, due_date')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .not('due_date', 'is', null)
      .lte('due_date', endISO)
      .then(r => r.data ?? []),
  ])

  // ── Build events list ────────────────────────────────────────────────────────
  const events: PressureEvent[] = []

  // 1. Collection due events
  for (const sale of salesRows as Array<{
    id: string; customer_name: string; total_try: number;
    paid_amount: number | null; due_date: string; sale_date: string
  }>) {
    const outstanding = Math.max(0, Number(sale.total_try ?? 0) - Number(sale.paid_amount ?? 0))
    if (outstanding <= 0) continue
    const daysUntil = daysBetween(todayISO, sale.due_date)
    events.push({
      date:        sale.due_date,
      type:        'collection_due',
      label:       `${sale.customer_name ?? 'Müşteri'} — ${fmtAmountTRY(outstanding)}`,
      amount_try:  outstanding,
      severity:    eventSeverity(daysUntil, outstanding),
      entity_id:   sale.id,
      action_href: '/dashboard/commercial?tab=collections',
    })
  }

  // 2. Tranche due events
  for (const t of trancheRows as Array<{
    id: string; expected_repayment_date: string; principal_try: number; total_repaid_try: number
  }>) {
    if (!t.expected_repayment_date) continue
    const amt       = Math.max(0, Number(t.principal_try ?? 0) - Number(t.total_repaid_try ?? 0))
    const daysUntil = daysBetween(todayISO, t.expected_repayment_date)
    events.push({
      date:        t.expected_repayment_date,
      type:        'tranche_due',
      label:       `Tranche ödemesi — ${fmtAmountTRY(amt)}`,
      amount_try:  amt,
      severity:    eventSeverity(daysUntil, amt),
      entity_id:   t.id,
      action_href: '/dashboard/partners?tab=tranches',
    })
  }

  // 3. Period close events
  for (const p of periodRows as Array<{ id: string; period_end: string; status: string }>) {
    if (!p.period_end) continue
    const daysUntil = daysBetween(todayISO, p.period_end)
    events.push({
      date:        p.period_end,
      type:        'period_close',
      label:       `Dönem kapanışı — ${p.period_end.slice(0, 7)}`,
      amount_try:  0,
      severity:    daysUntil <= 0 ? 'critical' : daysUntil <= 7 ? 'warning' : 'normal',
      entity_id:   p.id,
      action_href: '/dashboard/cfo/period-close',
    })
  }

  // 4. Recurring expense commitments — project the next fire date from start_date + frequency
  for (const r of recurringRows as Array<{
    id: string; description: string | null; amount: number; fx_rate: number | null;
    frequency: string; start_date: string | null; end_date: string | null; category: string | null
  }>) {
    if (!r.start_date) continue
    const fireDate = nextRecurringFireDate(r.start_date, r.frequency, todayISO, r.end_date ?? null)
    if (!fireDate || fireDate > endISO) continue
    const amt       = Number(r.amount ?? 0) * Number(r.fx_rate ?? 1)
    const daysUntil = daysBetween(todayISO, fireDate)
    events.push({
      date:        fireDate,
      type:        'expense_commitment',
      label:       `${r.description ?? r.category ?? 'Gider'} — ${fmtAmountTRY(amt)}`,
      amount_try:  amt,
      severity:    eventSeverity(daysUntil, amt),
      entity_id:   r.id,
      action_href: '/dashboard/operations?tab=expenses',
    })
  }

  // 5. Equity call events
  for (const c of equityRows as Array<{
    id: string; committed_try: number; paid_try: number; due_date: string | null
  }>) {
    if (!c.due_date) continue
    const gap = Math.max(0, Number(c.committed_try ?? 0) - Number(c.paid_try ?? 0))
    if (gap <= 0) continue
    const daysUntil = daysBetween(todayISO, c.due_date)
    events.push({
      date:        c.due_date,
      type:        'equity_call',
      label:       `Sermaye taahhüdü — ${fmtAmountTRY(gap)}`,
      amount_try:  gap,
      severity:    eventSeverity(daysUntil, gap),
      entity_id:   c.id,
      action_href: '/dashboard/partners',
    })
  }

  // Sort events by date ascending
  events.sort((a, b) => a.date.localeCompare(b.date))

  // ── Cash trajectory (simplified linear projection) ────────────────────────
  // Get latest cash position from cash-distributable computation (simplified here)
  // We use a day-by-day map: obligations reduce cash, collections increase it.
  const cashByDay = new Map<string, number>()

  // Seed with obligations (outflows) per day
  for (const ev of events) {
    if (ev.type === 'collection_due') {
      // collection = inflow
      cashByDay.set(ev.date, (cashByDay.get(ev.date) ?? 0) + ev.amount_try)
    } else if (ev.amount_try > 0) {
      // obligation = outflow (negative)
      cashByDay.set(ev.date, (cashByDay.get(ev.date) ?? 0) - ev.amount_try)
    }
  }

  // Build cumulative trajectory
  const trajectory: CashTrajectoryPoint[] = []
  let running = 0
  for (let i = 0; i <= days; i++) {
    const d = addDays(todayISO, i)
    running += cashByDay.get(d) ?? 0
    // Only emit dates that have events (or weekly samples) to keep payload small
    if (i % 7 === 0 || cashByDay.has(d)) {
      trajectory.push({ date: d, projected_cash: running })
    }
  }

  // ── Summary ─────────────────────────────────────────────────────────────────
  const obligationTypes: PressureEventType[] = ['tranche_due', 'expense_commitment', 'equity_call']
  const totalObligations = events
    .filter(e => obligationTypes.includes(e.type))
    .reduce((s, e) => s + e.amount_try, 0)
  const totalCollections = events
    .filter(e => e.type === 'collection_due')
    .reduce((s, e) => s + e.amount_try, 0)

  const response: PressureTimelineResponse = {
    events,
    cash_trajectory: trajectory,
    summary: {
      total_obligations_try:          totalObligations,
      total_expected_collections_try: totalCollections,
      net_90_day_try:                 totalCollections - totalObligations,
      critical_events_count:          events.filter(e => e.severity === 'critical').length,
    },
  }

  return NextResponse.json(response)
}
