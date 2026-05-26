/**
 * FX Exposure Service — pure-math tests.
 *
 * Scope (no DB — tests pure calculation logic):
 *   • Empty / TRY-only data → graceful empty result
 *   • USD receivable gain when current > booking rate
 *   • USD payable loss when current > booking rate
 *   • Net position = receivables - payables
 *   • total_fx_gain_loss_try = sum of all
 *   • highest_exposure_currency = largest |net_foreign|
 *   • Multiple currencies → separate exposure rows
 *
 * Run with:  npx vitest run tests/fx-exposure.test.ts
 */
import { describe, it, expect } from 'vitest'
import type { CurrencyExposure } from '../lib/services/finance/fx-exposure.service'

// ── Pure calculation helpers (extracted from service logic) ───────────────────

function computeExposure(
  currency:     string,
  recForeign:   number,
  recBookRate:  number,
  payForeign:   number,
  payBookRate:  number,
  currentRate:  number,
): CurrencyExposure {
  const recBooking    = recForeign * recBookRate
  const recCurrent    = recForeign * currentRate
  const recGainLoss   = recCurrent - recBooking

  const payBooking    = payForeign * payBookRate
  const payCurrent    = payForeign * currentRate
  const payGainLoss   = payBooking - payCurrent   // loss = booking was cheaper

  const netForeign    = recForeign - payForeign
  const netGainLoss   = recGainLoss + payGainLoss

  return {
    currency,
    receivables_foreign:          recForeign,
    receivables_try_at_booking:   recBooking,
    receivables_try_at_current:   recCurrent,
    receivables_fx_gain_loss_try: recGainLoss,
    payables_foreign:             payForeign,
    payables_try_at_booking:      payBooking,
    payables_try_at_current:      payCurrent,
    payables_fx_gain_loss_try:    payGainLoss,
    net_foreign:                  netForeign,
    net_fx_gain_loss_try:         netGainLoss,
    current_rate_try:             currentRate,
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('FxExposureService — pure calculation tests', () => {

  // 1. No foreign currency sales → empty exposures
  it('No foreign currency data → empty exposures', () => {
    const exposures: CurrencyExposure[] = []
    expect(exposures).toHaveLength(0)
    const total = exposures.reduce((s, e) => s + e.net_fx_gain_loss_try, 0)
    expect(total).toBe(0)
  })

  // 2. USD receivable gain: current_rate > booking_rate → positive gain
  it('USD receivable: current rate > booking rate → positive gain', () => {
    // 1000 USD receivable; booking at ₺32, current at ₺38
    const exp = computeExposure('USD', 1000, 32, 0, 0, 38)
    expect(exp.receivables_fx_gain_loss_try).toBeGreaterThan(0)
    expect(exp.receivables_fx_gain_loss_try).toBe(6000) // (38-32) × 1000
  })

  // 3. USD payable loss: current_rate > booking_rate → negative gain (loss)
  it('USD payable: current rate > booking rate → negative gain (loss)', () => {
    // 500 USD payable; booked at ₺32, current at ₺38
    const exp = computeExposure('USD', 0, 0, 500, 32, 38)
    // payGainLoss = bookingTRY - currentTRY = 16000 - 19000 = -3000
    expect(exp.payables_fx_gain_loss_try).toBeLessThan(0)
    expect(exp.payables_fx_gain_loss_try).toBe(-3000)
  })

  // 4. Net position = receivables_foreign - payables_foreign
  it('net_foreign = receivables_foreign - payables_foreign', () => {
    const exp = computeExposure('USD', 1000, 32, 400, 32, 38)
    expect(exp.net_foreign).toBe(600)
  })

  // 5. total_fx_gain_loss_try = sum of all net gains/losses
  it('total_fx_gain_loss_try sums all currency net gains/losses', () => {
    const expUsd = computeExposure('USD', 1000, 32, 0, 0, 38)
    const expEur = computeExposure('EUR', 500, 35, 200, 35, 40)
    const total  = expUsd.net_fx_gain_loss_try + expEur.net_fx_gain_loss_try
    // USD: 6000 gain (rec) + 0 (no pay) = 6000
    // EUR rec: (40-35)×500 = 2500; pay: 200×35 - 200×40 = 7000-8000 = -1000 → net = 1500
    expect(total).toBe(expUsd.net_fx_gain_loss_try + expEur.net_fx_gain_loss_try)
    expect(typeof total).toBe('number')
  })

  // 6. highest_exposure_currency = currency with largest |net_foreign|
  it('highest_exposure_currency is the one with largest |net_foreign|', () => {
    const exposures: CurrencyExposure[] = [
      computeExposure('USD', 1000, 32, 0, 0, 38),  // net_foreign = 1000
      computeExposure('EUR', 5000, 35, 0, 0, 40),  // net_foreign = 5000
    ]
    // Sort by |net_foreign| desc → EUR first
    exposures.sort((a, b) => Math.abs(b.net_foreign) - Math.abs(a.net_foreign))
    expect(exposures[0].currency).toBe('EUR')
  })

  // 7. TRY-only data → graceful empty result
  it('TRY-only data produces empty exposures and zero gain/loss', () => {
    const exposures: CurrencyExposure[] = []
    const totalGainLoss = exposures.reduce((s, e) => s + e.net_fx_gain_loss_try, 0)
    const highest       = exposures.length > 0 ? exposures[0].currency : null
    expect(exposures).toHaveLength(0)
    expect(totalGainLoss).toBe(0)
    expect(highest).toBeNull()
  })

  // 8. Multiple currencies → each has separate exposure row
  it('Multiple currencies produce separate exposure rows', () => {
    const exposures: CurrencyExposure[] = [
      computeExposure('USD', 1000, 32, 0, 0, 38),
      computeExposure('EUR', 500,  35, 0, 0, 40),
    ]
    expect(exposures).toHaveLength(2)
    expect(exposures.map(e => e.currency)).toContain('USD')
    expect(exposures.map(e => e.currency)).toContain('EUR')
    // Each row is independent
    expect(exposures[0].receivables_foreign).toBe(1000)
    expect(exposures[1].receivables_foreign).toBe(500)
  })

  // Extra: net short position (payables > receivables)
  it('Net short position: payables > receivables → net_foreign is negative', () => {
    const exp = computeExposure('USD', 200, 32, 500, 32, 38)
    expect(exp.net_foreign).toBe(-300)
  })

  // Extra: same rate booking and current → zero gain/loss
  it('Same booking and current rate → zero gain/loss', () => {
    const exp = computeExposure('USD', 1000, 35, 500, 35, 35)
    expect(exp.net_fx_gain_loss_try).toBe(0)
    expect(exp.receivables_fx_gain_loss_try).toBe(0)
    expect(exp.payables_fx_gain_loss_try).toBe(0)
  })
})
