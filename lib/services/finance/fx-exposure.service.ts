// ─────────────────────────────────────────────────────────────────────────────
// lib/services/finance/fx-exposure.service.ts
//
// FX exposure report — multi-currency position + unrealized gain/loss.
//
// Rules:
//   • Only non-TRY currency sales/expenses are considered exposures.
//   • Receivables: outstanding (pending/partial/overdue) sales with currency ≠ TRY
//     that have fx_rate_try recorded (booking rate).
//   • Payables: outstanding expenses with currency ≠ TRY.
//   • Gain/loss = (current_rate − booking_rate) × foreign_amount
//       receivable: gain when current_rate > booking_rate (TRY weakened → receivable worth more)
//       payable:    loss when current_rate > booking_rate (TRY weakened → payable costs more)
//   • If no multi-currency data exists, returns { exposures: [], note }.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>

// ── Output interfaces ─────────────────────────────────────────────────────────

export interface CurrencyExposure {
  currency: string

  // Receivables in this currency
  receivables_foreign:          number   // outstanding in foreign currency
  receivables_try_at_booking:   number   // at historical booking rate
  receivables_try_at_current:   number   // at current rate
  receivables_fx_gain_loss_try: number   // current − booking (positive = gain)

  // Payables in this currency
  payables_foreign:          number
  payables_try_at_booking:   number
  payables_try_at_current:   number
  payables_fx_gain_loss_try: number

  // Net position
  net_foreign:          number   // receivables - payables (positive = long)
  net_fx_gain_loss_try: number   // net unrealized gain/loss at current rates
  current_rate_try:     number   // current TRY rate used
}

export interface FxExposureReport {
  as_of_date:                  string
  exposures:                   CurrencyExposure[]
  total_fx_gain_loss_try:      number
  highest_exposure_currency:   string | null
  computed_at:                 string
  /** Populated when no multi-currency data exists */
  note?: string
}

// ── Service ───────────────────────────────────────────────────────────────────

export class FxExposureService {

  static async getReport(
    companyId: string,
    supabase:  AnyClient,
    opts?:     { today?: string },
  ): Promise<FxExposureReport> {
    const today      = opts?.today ?? new Date().toISOString().slice(0, 10)
    const computedAt = new Date().toISOString()

    // Parallel: outstanding sales + outstanding expenses + latest FX rates
    const [salesRes, expensesRes, fxRes] = await Promise.allSettled([
      // Outstanding non-TRY sales (receivables)
      supabase
        .from('sales')
        .select('total, currency, fx_rate_try')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .neq('currency', 'TRY')
        .in('payment_status', ['pending', 'partial', 'overdue']),
      // Outstanding non-TRY expenses (payables)
      supabase
        .from('expenses')
        .select('amount, currency, fx_rate')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .neq('currency', 'TRY')
        .eq('payment_status', 'pending'),
      // Latest FX rates from DB (any date — we only need approximate current rate)
      supabase
        .from('fx_rates')
        .select('currency, buying, rate_date')
        .in('currency', ['USD', 'EUR', 'GBP', 'CHF'])
        .order('rate_date', { ascending: false })
        .limit(20),
    ])

    const sales    = salesRes.status    === 'fulfilled' ? (salesRes.value.data    ?? []) : []
    const expenses = expensesRes.status === 'fulfilled' ? (expensesRes.value.data ?? []) : []
    const fxRows   = fxRes.status       === 'fulfilled' ? (fxRes.value.data       ?? []) : []

    // Check for multi-currency data
    const hasForeignSales    = (sales    as Array<{ currency: string }>).some(s => s.currency !== 'TRY')
    const hasForeignExpenses = (expenses as Array<{ currency: string }>).some(e => e.currency !== 'TRY')

    if (!hasForeignSales && !hasForeignExpenses) {
      return {
        as_of_date:                 today,
        exposures:                  [],
        total_fx_gain_loss_try:     0,
        highest_exposure_currency:  null,
        computed_at:                computedAt,
        note: 'Çok para birimli veri bulunamadı',
      }
    }

    // Build current rate map: currency → latest buying rate
    const currentRates = new Map<string, number>()
    for (const row of (fxRows as Array<{ currency: string; buying: number; rate_date: string }>)) {
      if (!currentRates.has(row.currency)) {
        currentRates.set(row.currency, Number(row.buying))
      }
    }

    // Aggregate by currency
    type CurrencyData = {
      rec_foreign: number; rec_booking_try: number
      pay_foreign: number; pay_booking_try: number
    }
    const byCurrency = new Map<string, CurrencyData>()

    function ensureCurrency(ccy: string) {
      if (!byCurrency.has(ccy)) {
        byCurrency.set(ccy, { rec_foreign: 0, rec_booking_try: 0, pay_foreign: 0, pay_booking_try: 0 })
      }
      return byCurrency.get(ccy)!
    }

    for (const sale of (sales as Array<{ total: number; currency: string; fx_rate_try: number | null }>)) {
      if (!sale.currency || sale.currency === 'TRY') continue
      const bookingRate = Number(sale.fx_rate_try ?? 1)
      const foreign     = bookingRate > 0 ? Number(sale.total) / bookingRate : 0
      const d = ensureCurrency(sale.currency)
      d.rec_foreign      += foreign
      d.rec_booking_try  += Number(sale.total)
    }

    for (const exp of (expenses as Array<{ amount: number; currency: string; fx_rate: number | null }>)) {
      if (!exp.currency || exp.currency === 'TRY') continue
      const bookingRate = Number(exp.fx_rate ?? 1)
      const d = ensureCurrency(exp.currency)
      d.pay_foreign     += Number(exp.amount)
      d.pay_booking_try += Number(exp.amount) * bookingRate
    }

    // Build exposure rows
    const exposures: CurrencyExposure[] = []

    for (const [currency, d] of byCurrency) {
      const currentRate = currentRates.get(currency) ?? 0

      const recAtCurrent  = d.rec_foreign * currentRate
      const recGainLoss   = recAtCurrent - d.rec_booking_try

      const payAtCurrent  = d.pay_foreign * currentRate
      const payGainLoss   = d.pay_booking_try - payAtCurrent   // loss when pay goes up

      const netForeign    = d.rec_foreign - d.pay_foreign
      const netGainLoss   = recGainLoss + payGainLoss

      exposures.push({
        currency,
        receivables_foreign:          d.rec_foreign,
        receivables_try_at_booking:   d.rec_booking_try,
        receivables_try_at_current:   recAtCurrent,
        receivables_fx_gain_loss_try: recGainLoss,
        payables_foreign:             d.pay_foreign,
        payables_try_at_booking:      d.pay_booking_try,
        payables_try_at_current:      payAtCurrent,
        payables_fx_gain_loss_try:    payGainLoss,
        net_foreign:                  netForeign,
        net_fx_gain_loss_try:         netGainLoss,
        current_rate_try:             currentRate,
      })
    }

    // Sort: largest absolute net position first
    exposures.sort((a, b) => Math.abs(b.net_foreign) - Math.abs(a.net_foreign))

    const totalGainLoss          = exposures.reduce((s, e) => s + e.net_fx_gain_loss_try, 0)
    const highestExposureCurrency = exposures.length > 0 ? exposures[0].currency : null

    return {
      as_of_date:                 today,
      exposures,
      total_fx_gain_loss_try:     totalGainLoss,
      highest_exposure_currency:  highestExposureCurrency,
      computed_at:                computedAt,
    }
  }
}
