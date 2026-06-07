// ─────────────────────────────────────────────────────────────────────────────
// lib/services/pcle/compensation.service.ts
//
// TTK 394 Huzur Hakkı (Partner Compensation) Scheduler
//
// Handles:
//   - Monthly partner compensation schedules
//   - Due-payment computation (with overdue detection)
//   - Payment recording + linked expense creation
// ─────────────────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = any

import { round2 } from '@/lib/calc'

// ── Data shapes ───────────────────────────────────────────────────────────────

export interface CompensationSchedule {
  id:                 string
  partner_id:         string
  partner_name:       string
  monthly_gross_try:  number
  withholding_rate:   number
  sgk_rate:           number
  net_monthly_try:    number              // gross × (1 − withholding_rate)
  effective_from:     string
  effective_until:    string | null
  board_decision_ref: string | null
  is_active:          boolean
  notes:              string | null
}

export interface CompensationPaymentDue {
  schedule_id:              string
  partner_id:               string
  partner_name:             string
  payment_period:           string               // YYYY-MM-DD (dönemin ilk günü)
  period_label:             string               // "Mayıs 2026"
  gross_amount_try:         number
  withholding_try:          number
  net_amount_try:           number
  is_overdue:               boolean              // payment_period < bu ayın ilk günü
  existing_payment_id:      string | null        // daha önce kaydedildiyse
  existing_payment_status:  string | null
}

// ── Turkish month names ────────────────────────────────────────────────────────

const TR_MONTHS = [
  'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
]

function periodLabel(isoDate: string): string {
  const d = new Date(isoDate + 'T00:00:00Z')
  return `${TR_MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}

/** Returns YYYY-MM-01 for the given date string or today */
function monthStart(isoDate: string): string {
  return isoDate.slice(0, 7) + '-01'
}

/** Add N months to a YYYY-MM-01 string, returns YYYY-MM-01 */
function addMonths(ymd: string, n: number): string {
  const d = new Date(ymd + 'T00:00:00Z')
  d.setUTCMonth(d.getUTCMonth() + n)
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  return `${y}-${m}-01`
}

// ── Schedule rate defaults ──────────────────────────────────────────────────
// partner_compensation_schedules stores only the gross monthly amount
// (monthly_amount_try) plus start_date/end_date. The stoppage (stopaj) and SGK
// rates are NOT per-schedule columns, so standard defaults are applied here.
// (15% withholding mirrors the prior createSchedule default; SGK 0 by default.)
const DEFAULT_WITHHOLDING_RATE = 0.15
const DEFAULT_SGK_RATE         = 0

// ── Service ───────────────────────────────────────────────────────────────────

export class CompensationService {

  // ── Pure computation ───────────────────────────────────────────────────────

  static computeNet(grossTry: number, withholdingRate: number): {
    withholding_try: number
    net_try:         number
  } {
    const withholding_try = round2(grossTry * withholdingRate)
    const net_try         = round2(grossTry - withholding_try)
    return { withholding_try, net_try }
  }

  // ── listSchedules ──────────────────────────────────────────────────────────

  static async listSchedules(
    companyId: string,
    supabase:  SupabaseClient,
  ): Promise<CompensationSchedule[]> {
    const { data, error } = await supabase
      .from('partner_compensation_schedules')
      // real columns: monthly_amount_try, start_date, end_date (no per-schedule rate columns)
      .select(`
        id, partner_id, monthly_amount_try,
        start_date, end_date, board_decision_ref, is_active, notes,
        partners!inner(name)
      `)
      .eq('company_id', companyId)
      .order('start_date', { ascending: false })

    if (error) throw new Error(`listSchedules: ${error.message}`)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data ?? []).map((row: any) => {
      const gross    = Number(row.monthly_amount_try)
      const rate     = DEFAULT_WITHHOLDING_RATE
      const { net_try } = CompensationService.computeNet(gross, rate)
      return {
        id:                 row.id,
        partner_id:         row.partner_id,
        partner_name:       row.partners?.name ?? 'Bilinmeyen',
        monthly_gross_try:  gross,
        withholding_rate:   rate,
        sgk_rate:           DEFAULT_SGK_RATE,
        net_monthly_try:    net_try,
        effective_from:     row.start_date,
        effective_until:    row.end_date ?? null,
        board_decision_ref: row.board_decision_ref ?? null,
        is_active:          row.is_active,
        notes:              row.notes ?? null,
      }
    })
  }

  // ── createSchedule ─────────────────────────────────────────────────────────

  static async createSchedule(
    companyId: string,
    userId:    string,
    supabase:  SupabaseClient,
    params: {
      partner_id:         string
      monthly_gross_try:  number
      withholding_rate?:  number
      sgk_rate?:          number
      effective_from:     string
      effective_until?:   string | null
      board_decision_ref?: string
      notes?:             string
    },
  ): Promise<CompensationSchedule> {
    // real columns only: monthly_amount_try, start_date, end_date.
    // withholding_rate / sgk_rate are not persisted (applied as defaults on read).
    const insert = {
      company_id:         companyId,
      partner_id:         params.partner_id,
      monthly_amount_try: params.monthly_gross_try,
      start_date:         params.effective_from,
      end_date:           params.effective_until    ?? null,
      board_decision_ref: params.board_decision_ref ?? null,
      notes:              params.notes              ?? null,
      is_active:          true,
      created_by:         userId,
    }

    const { data, error } = await supabase
      .from('partner_compensation_schedules')
      .insert(insert)
      .select(`id, partner_id, monthly_amount_try,
               start_date, end_date, board_decision_ref, is_active, notes,
               partners!inner(name)`)
      .single()

    if (error) throw new Error(`createSchedule: ${error.message}`)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row: any = data
    const gross    = Number(row.monthly_amount_try)
    const rate     = params.withholding_rate ?? DEFAULT_WITHHOLDING_RATE
    const { net_try } = CompensationService.computeNet(gross, rate)

    return {
      id:                 row.id,
      partner_id:         row.partner_id,
      partner_name:       row.partners?.name ?? 'Bilinmeyen',
      monthly_gross_try:  gross,
      withholding_rate:   rate,
      sgk_rate:           params.sgk_rate ?? DEFAULT_SGK_RATE,
      net_monthly_try:    net_try,
      effective_from:     row.start_date,
      effective_until:    row.end_date ?? null,
      board_decision_ref: row.board_decision_ref ?? null,
      is_active:          row.is_active,
      notes:              row.notes ?? null,
    }
  }

  // ── getDuePayments ─────────────────────────────────────────────────────────
  //
  // For every active schedule, produce one payment entry per month from
  // effective_from..min(effective_until, today), up to `months` months back.
  // Matches existing payment records so the caller knows what's already paid.

  static async getDuePayments(
    companyId: string,
    supabase:  SupabaseClient,
    opts?: { today?: string; months?: number },
  ): Promise<CompensationPaymentDue[]> {
    const today      = opts?.today ?? new Date().toISOString().slice(0, 10)
    const lookback   = opts?.months ?? 3
    const thisMonth  = monthStart(today)

    // Load active schedules
    const { data: scheduleRows, error: se } = await supabase
      .from('partner_compensation_schedules')
      // real columns: monthly_amount_try, start_date, end_date (no per-schedule rate columns)
      .select(`
        id, partner_id, monthly_amount_try,
        start_date, end_date, is_active,
        partners!inner(name)
      `)
      .eq('company_id', companyId)
      .eq('is_active', true)

    if (se) throw new Error(`getDuePayments/schedules: ${se.message}`)

    // Load existing payments for context window
    const windowStart = addMonths(thisMonth, -(lookback - 1))

    const { data: paymentRows, error: pe } = await supabase
      .from('partner_compensation_payments')
      .select('id, schedule_id, payment_period, payment_status')
      .eq('company_id', companyId)
      .gte('payment_period', windowStart)

    if (pe) throw new Error(`getDuePayments/payments: ${pe.message}`)

    // Build payment lookup: "scheduleId|YYYY-MM-01" → { id, status }
    const paymentMap = new Map<string, { id: string; status: string }>()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const p of (paymentRows ?? []) as any[]) {
      const key = `${p.schedule_id}|${monthStart(p.payment_period)}`
      paymentMap.set(key, { id: p.id, status: p.payment_status })
    }

    const due: CompensationPaymentDue[] = []

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const sched of (scheduleRows ?? []) as any[]) {
      const gross = Number(sched.monthly_amount_try)
      const rate  = DEFAULT_WITHHOLDING_RATE
      const { withholding_try, net_try } = CompensationService.computeNet(gross, rate)

      // Window: from max(start_date, windowStart) to min(end_date or today, today)
      const schedStart  = monthStart(sched.start_date)
      const schedEnd    = sched.end_date ? monthStart(sched.end_date) : thisMonth
      const rangeStart  = schedStart > windowStart ? schedStart : windowStart
      const rangeEnd    = schedEnd < thisMonth ? schedEnd : thisMonth

      let period = rangeStart
      while (period <= rangeEnd) {
        const key     = `${sched.id}|${period}`
        const existing = paymentMap.get(key) ?? null

        due.push({
          schedule_id:             sched.id,
          partner_id:              sched.partner_id,
          partner_name:            sched.partners?.name ?? 'Bilinmeyen',
          payment_period:          period,
          period_label:            periodLabel(period),
          gross_amount_try:        gross,
          withholding_try,
          net_amount_try:          net_try,
          is_overdue:              period < thisMonth && (!existing || existing.status === 'pending'),
          existing_payment_id:     existing?.id    ?? null,
          existing_payment_status: existing?.status ?? null,
        })

        period = addMonths(period, 1)
      }
    }

    return due
  }

  // ── recordPayment ──────────────────────────────────────────────────────────
  //
  // Creates a compensation_payment record + an expense record (G&A category).

  static async recordPayment(
    companyId:     string,
    userId:        string,
    supabase:      SupabaseClient,
    scheduleId:    string,
    paymentPeriod: string,   // YYYY-MM-DD
  ): Promise<{ payment_id: string; expense_id: string }> {
    // Load schedule
    const { data: sched, error: se } = await supabase
      .from('partner_compensation_schedules')
      // real column: monthly_amount_try (no per-schedule rate columns)
      .select('partner_id, monthly_amount_try, partners!inner(name)')
      .eq('id', scheduleId)
      .eq('company_id', companyId)
      .single()

    if (se || !sched) throw new Error('Takvim bulunamadı')

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const s: any = sched
    const gross  = Number(s.monthly_amount_try)
    const rate   = DEFAULT_WITHHOLDING_RATE
    const sgkRate = DEFAULT_SGK_RATE
    const { withholding_try, net_try } = CompensationService.computeNet(gross, rate)
    const sgk_try = round2(gross * sgkRate)
    const partnerName = s.partners?.name ?? 'Ortak'
    const period  = monthStart(paymentPeriod)

    // Create expense record (board_fee category, G&A)
    const expenseDesc = `Huzur Hakkı — ${partnerName} (${periodLabel(period)})`
    const { data: expRow, error: ee } = await supabase
      .from('expenses')
      .insert({
        company_id:     companyId,
        user_id:        userId,
        amount:         gross,
        currency:       'TRY',
        amount_try:     gross,
        fx_rate:        1,
        fx_source:      'fixed',
        description:    expenseDesc,
        category:       'board_fee',
        expense_type:   'operational',
        payment_status: 'paid',
        expense_date:   period,
      })
      .select('id')
      .single()

    if (ee || !expRow) throw new Error(`Gider kaydı oluşturulamadı: ${ee?.message}`)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const expenseId = (expRow as any).id as string

    // Create payment record
    const { data: payRow, error: pe } = await supabase
      .from('partner_compensation_payments')
      .insert({
        company_id:    companyId,
        schedule_id:   scheduleId,
        partner_id:    s.partner_id,
        payment_period: period,
        gross_amount_try: gross,
        withholding_try,
        sgk_try,
        net_amount_try:  net_try,
        payment_status:  'paid',
        paid_at:         new Date().toISOString(),
        expense_id:      expenseId,
        created_by:      userId,
      })
      .select('id')
      .single()

    if (pe || !payRow) throw new Error(`Ödeme kaydı oluşturulamadı: ${pe?.message}`)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return { payment_id: (payRow as any).id, expense_id: expenseId }
  }
}
