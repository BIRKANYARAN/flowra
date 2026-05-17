/**
 * Tests for lib/alerts/derive.ts — pure alert derivation function
 * deriveAlerts() takes pre-fetched data, returns AlertSpec[] with no DB calls.
 * Run with: npx vitest run tests/derive-alerts.test.ts
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  deriveAlerts,
  CASHFLOW_ALERT_THRESHOLD_TRY,
  AGED60_ALERT_THRESHOLD_TRY,
  PROJECTED_COLLECTION_RATE,
  COMPANY_SENTINEL_ID,
  type AlertDeriveInput,
} from '../lib/alerts/derive'

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Return an ISO date-string N days ago */
function daysAgo(n: number): string {
  const d = new Date(Date.now() - n * 86_400_000)
  return d.toISOString().slice(0, 10) // YYYY-MM-DD
}

/** Minimal valid AlertDeriveInput — nothing fires by default */
function emptyInput(overrides: Partial<AlertDeriveInput> = {}): AlertDeriveInput {
  return {
    overdueSales:         [],
    stockProducts:        [],
    recurringMonthlyTry:  0,
    outstandingTotal:     0,
    nextYM:               '2025-04',
    aged60PlusTry:        0,
    aged60PlusCount:      0,
    ...overrides,
  }
}

// ── Alert 1: Overdue payment per sale ────────────────────────────────────────

describe('deriveAlerts — overdue payment (Alert 1)', () => {
  it('returns no alert for a sale exactly 30 days old', () => {
    const input = emptyInput({
      overdueSales: [{
        id: 'sale-1', customer_name: 'Acme', total_try: 5000,
        payment_status: 'unpaid', sale_date: daysAgo(30),
      }],
    })
    const specs = deriveAlerts(input)
    expect(specs.filter(s => s.entity_type === 'sale' && s.entity_id === 'sale-1')).toHaveLength(0)
  })

  it('fires warning for a sale 31 days old', () => {
    const input = emptyInput({
      overdueSales: [{
        id: 'sale-2', customer_name: 'Beta Ltd', total_try: 8000,
        payment_status: 'unpaid', sale_date: daysAgo(31),
      }],
    })
    const specs = deriveAlerts(input)
    const hit = specs.find(s => s.entity_id === 'sale-2')
    expect(hit).toBeDefined()
    expect(hit!.severity).toBe('warning')
    expect(hit!.entity_type).toBe('sale')
  })

  it('fires critical for a sale 61 days old', () => {
    const input = emptyInput({
      overdueSales: [{
        id: 'sale-3', customer_name: 'Gamma', total_try: 12_000,
        payment_status: 'overdue', sale_date: daysAgo(61),
      }],
    })
    const specs = deriveAlerts(input)
    const hit = specs.find(s => s.entity_id === 'sale-3')
    expect(hit!.severity).toBe('critical')
  })

  it('uses outstanding (total - amount_paid) for partial payments', () => {
    const input = emptyInput({
      overdueSales: [{
        id: 'sale-4', customer_name: 'Delta', total_try: 10_000,
        amount_paid: 4_000, payment_status: 'partial', sale_date: daysAgo(45),
      }],
    })
    const specs = deriveAlerts(input)
    const hit = specs.find(s => s.entity_id === 'sale-4')
    expect(hit!.message).toContain('6.000')   // 10000 - 4000 = 6000
  })

  it('shows full total_try when amount_paid is null', () => {
    const input = emptyInput({
      overdueSales: [{
        id: 'sale-5', customer_name: 'Epsilon', total_try: 7_500,
        amount_paid: null, payment_status: 'unpaid', sale_date: daysAgo(40),
      }],
    })
    const specs = deriveAlerts(input)
    const hit = specs.find(s => s.entity_id === 'sale-5')
    expect(hit!.message).toContain('7.500')
  })

  it('generates one spec per sale (not one per company)', () => {
    const sales = ['s-a', 's-b', 's-c'].map(id => ({
      id, customer_name: 'Customer', total_try: 1000,
      payment_status: 'unpaid', sale_date: daysAgo(35),
    }))
    const specs = deriveAlerts(emptyInput({ overdueSales: sales }))
    const overdueSpecs = specs.filter(s => s.entity_type === 'sale' && s.entity_id !== COMPANY_SENTINEL_ID)
    expect(overdueSpecs).toHaveLength(3)
    expect(new Set(overdueSpecs.map(s => s.entity_id)).size).toBe(3)
  })

  it('includes customer name and days in message', () => {
    const input = emptyInput({
      overdueSales: [{
        id: 'sale-6', customer_name: 'Zeta Holding', total_try: 2000,
        payment_status: 'unpaid', sale_date: daysAgo(50),
      }],
    })
    const specs = deriveAlerts(input)
    const msg = specs.find(s => s.entity_id === 'sale-6')!.message
    expect(msg).toContain('Zeta Holding')
    expect(msg).toContain('50')
  })
})

// ── Alert 2: Low stock per product ───────────────────────────────────────────

describe('deriveAlerts — low stock (Alert 2)', () => {
  it('fires warning when stock_qty ≤ stock_alert_qty (and alert_qty > 0)', () => {
    const input = emptyInput({
      stockProducts: [{ id: 'p-1', name: 'Widget A', stock_qty: 3, stock_alert_qty: 5 }],
    })
    const specs = deriveAlerts(input)
    const hit = specs.find(s => s.entity_id === 'p-1')
    expect(hit).toBeDefined()
    expect(hit!.severity).toBe('warning')
    expect(hit!.entity_type).toBe('stock_movement')
  })

  it('fires critical when stock_qty == 0', () => {
    const input = emptyInput({
      stockProducts: [{ id: 'p-2', name: 'Widget B', stock_qty: 0, stock_alert_qty: 10 }],
    })
    const specs = deriveAlerts(input)
    expect(specs.find(s => s.entity_id === 'p-2')!.severity).toBe('critical')
  })

  it('does not fire when stock_qty > stock_alert_qty', () => {
    const input = emptyInput({
      stockProducts: [{ id: 'p-3', name: 'Widget C', stock_qty: 100, stock_alert_qty: 5 }],
    })
    expect(deriveAlerts(input)).toHaveLength(0)
  })

  it('does not fire when stock_alert_qty is 0 (alert disabled)', () => {
    const input = emptyInput({
      stockProducts: [{ id: 'p-4', name: 'Widget D', stock_qty: 2, stock_alert_qty: 0 }],
    })
    expect(deriveAlerts(input)).toHaveLength(0)
  })

  it('includes product name in message', () => {
    const input = emptyInput({
      stockProducts: [{ id: 'p-5', name: 'Flowra Pro Pack', stock_qty: 1, stock_alert_qty: 5 }],
    })
    const msg = deriveAlerts(input).find(s => s.entity_id === 'p-5')!.message
    expect(msg).toContain('Flowra Pro Pack')
  })

  it('fires at exactly the threshold boundary (stock_qty == stock_alert_qty)', () => {
    const input = emptyInput({
      stockProducts: [{ id: 'p-6', name: 'Boundary Product', stock_qty: 5, stock_alert_qty: 5 }],
    })
    expect(deriveAlerts(input).find(s => s.entity_id === 'p-6')).toBeDefined()
  })
})

// ── Alert 3: Negative cashflow projection (Alert 3) ──────────────────────────

describe('deriveAlerts — negative cashflow projection (Alert 3)', () => {
  it('fires when projected net < CASHFLOW_ALERT_THRESHOLD_TRY', () => {
    // projected_net = outstandingTotal × 0.3 − recurringMonthlyTry
    // = 0 × 0.3 − 5000 = −5000  → below −1000 threshold
    const input = emptyInput({ outstandingTotal: 0, recurringMonthlyTry: 5_000 })
    const specs = deriveAlerts(input)
    const hit = specs.find(s => s.entity_type === 'expense' && s.entity_id === COMPANY_SENTINEL_ID)
    expect(hit).toBeDefined()
  })

  it('does not fire when projected net is above threshold', () => {
    // = 100_000 × 0.3 − 5000 = 25_000 → above −1000
    const input = emptyInput({ outstandingTotal: 100_000, recurringMonthlyTry: 5_000 })
    const specs = deriveAlerts(input)
    expect(specs.find(s => s.entity_type === 'expense')).toBeUndefined()
  })

  it('does not fire at exactly threshold (−1000)', () => {
    // projected_net must be < −1000 (strictly less)
    // outstandingTotal × 0.3 − recurringMonthlyTry = −1000 exactly
    // 0 × 0.3 − 1000 = −1000 → NOT fired (threshold is strict <)
    const input = emptyInput({
      outstandingTotal: 0,
      recurringMonthlyTry: Math.abs(CASHFLOW_ALERT_THRESHOLD_TRY),
    })
    // −1000 is NOT strictly < −1000, so should not fire
    expect(deriveAlerts(input).find(s => s.entity_type === 'expense')).toBeUndefined()
  })

  it('fires warning for modest deficit (−1001 to −10000)', () => {
    // −3000 → warning
    const input = emptyInput({ outstandingTotal: 0, recurringMonthlyTry: 3_000 })
    const hit = deriveAlerts(input).find(s => s.entity_type === 'expense')!
    expect(hit.severity).toBe('warning')
  })

  it('fires critical for large deficit (< −10000)', () => {
    const input = emptyInput({ outstandingTotal: 0, recurringMonthlyTry: 15_000 })
    const hit = deriveAlerts(input).find(s => s.entity_type === 'expense')!
    expect(hit.severity).toBe('critical')
  })

  it('uses PROJECTED_COLLECTION_RATE (30%) of outstanding in projection', () => {
    // outstanding = 100_000 → expected collections = 30_000
    // recurring = 35_000 → net = 30_000 − 35_000 = −5_000 → fires
    const input = emptyInput({
      outstandingTotal:    100_000,
      recurringMonthlyTry: 35_000,
    })
    const hit = deriveAlerts(input).find(s => s.entity_type === 'expense')
    expect(hit).toBeDefined()
  })

  it('outstanding = 0 + recurring = 500 → projected_net = −500 → no alert (above threshold)', () => {
    const input = emptyInput({ outstandingTotal: 0, recurringMonthlyTry: 500 })
    expect(deriveAlerts(input).find(s => s.entity_type === 'expense')).toBeUndefined()
  })

  it('uses COMPANY_SENTINEL_ID as entity_id', () => {
    const input = emptyInput({ outstandingTotal: 0, recurringMonthlyTry: 5_000 })
    const hit = deriveAlerts(input).find(s => s.entity_type === 'expense')!
    expect(hit.entity_id).toBe(COMPANY_SENTINEL_ID)
  })

  it('includes month year in message', () => {
    const input = emptyInput({ outstandingTotal: 0, recurringMonthlyTry: 5_000, nextYM: '2025-08' })
    const msg = deriveAlerts(input).find(s => s.entity_type === 'expense')!.message
    expect(msg).toContain('2025-08')
  })
})

// ── Alert 4: Aged 60+ receivables aggregate (Alert 4) ─────────────────────────

describe('deriveAlerts — aged 60+ receivables (Alert 4)', () => {
  it('fires when aged60PlusTry > AGED60_ALERT_THRESHOLD_TRY (5000)', () => {
    const input = emptyInput({ aged60PlusTry: 6_000, aged60PlusCount: 3 })
    const hit = deriveAlerts(input).find(
      s => s.entity_type === 'sale' && s.entity_id === COMPANY_SENTINEL_ID
    )
    expect(hit).toBeDefined()
  })

  it('does not fire at exactly 5000 (threshold is strict >)', () => {
    const input = emptyInput({ aged60PlusTry: AGED60_ALERT_THRESHOLD_TRY, aged60PlusCount: 1 })
    expect(
      deriveAlerts(input).find(s => s.entity_id === COMPANY_SENTINEL_ID && s.entity_type === 'sale')
    ).toBeUndefined()
  })

  it('does not fire when aged60PlusTry = 0', () => {
    const input = emptyInput({ aged60PlusTry: 0, aged60PlusCount: 0 })
    expect(
      deriveAlerts(input).find(s => s.entity_id === COMPANY_SENTINEL_ID)
    ).toBeUndefined()
  })

  it('fires warning when aged60PlusTry ≤ 50000', () => {
    const input = emptyInput({ aged60PlusTry: 20_000, aged60PlusCount: 5 })
    const hit = deriveAlerts(input).find(
      s => s.entity_type === 'sale' && s.entity_id === COMPANY_SENTINEL_ID
    )!
    expect(hit.severity).toBe('warning')
  })

  it('fires critical when aged60PlusTry > 50000', () => {
    const input = emptyInput({ aged60PlusTry: 55_000, aged60PlusCount: 12 })
    const hit = deriveAlerts(input).find(
      s => s.entity_type === 'sale' && s.entity_id === COMPANY_SENTINEL_ID
    )!
    expect(hit.severity).toBe('critical')
  })

  it('includes count and amount in message', () => {
    const input = emptyInput({ aged60PlusTry: 30_000, aged60PlusCount: 7 })
    const msg = deriveAlerts(input).find(
      s => s.entity_id === COMPANY_SENTINEL_ID && s.entity_type === 'sale'
    )!.message
    expect(msg).toContain('7')
    expect(msg).toContain('30.000')
  })

  it('defaults aged60PlusTry to 0 when not provided', () => {
    const input: AlertDeriveInput = {
      overdueSales:        [],
      stockProducts:       [],
      recurringMonthlyTry: 0,
      outstandingTotal:    0,
      nextYM:              '2025-04',
      // aged60PlusTry intentionally omitted
    }
    expect(
      deriveAlerts(input).find(s => s.entity_id === COMPANY_SENTINEL_ID)
    ).toBeUndefined()
  })
})

// ── Combined / boundary scenarios ────────────────────────────────────────────

describe('deriveAlerts — combined scenarios', () => {
  it('can fire multiple alert types simultaneously', () => {
    const input: AlertDeriveInput = {
      overdueSales: [{
        id: 'sale-x', customer_name: 'Multi', total_try: 5000,
        payment_status: 'unpaid', sale_date: daysAgo(35),
      }],
      stockProducts: [{ id: 'p-x', name: 'Product X', stock_qty: 0, stock_alert_qty: 5 }],
      recurringMonthlyTry: 20_000,
      outstandingTotal:    0,
      nextYM:              '2025-06',
      aged60PlusTry:       60_000,
      aged60PlusCount:     8,
    }
    const specs = deriveAlerts(input)
    // overdue sale + low stock + cashflow + aged60
    expect(specs.length).toBeGreaterThanOrEqual(4)
  })

  it('returns empty array when nothing fires', () => {
    const input = emptyInput({ outstandingTotal: 500_000, recurringMonthlyTry: 5_000 })
    expect(deriveAlerts(input)).toHaveLength(0)
  })

  it('does not duplicate the company-sentinel ID across cashflow and aged60', () => {
    const input = emptyInput({
      outstandingTotal: 0, recurringMonthlyTry: 20_000,
      aged60PlusTry: 100_000, aged60PlusCount: 20,
    })
    const specs = deriveAlerts(input)
    // Both alerts have entity_id = COMPANY_SENTINEL_ID but different entity_type
    const cashflow = specs.filter(s => s.entity_type === 'expense')
    const aged60   = specs.filter(s => s.entity_type === 'sale' && s.entity_id === COMPANY_SENTINEL_ID)
    expect(cashflow).toHaveLength(1)
    expect(aged60).toHaveLength(1)
  })

  it('PROJECTED_COLLECTION_RATE constant is 0.3', () => {
    expect(PROJECTED_COLLECTION_RATE).toBeCloseTo(0.3)
  })

  it('CASHFLOW_ALERT_THRESHOLD_TRY is negative', () => {
    expect(CASHFLOW_ALERT_THRESHOLD_TRY).toBeLessThan(0)
  })

  it('AGED60_ALERT_THRESHOLD_TRY is positive', () => {
    expect(AGED60_ALERT_THRESHOLD_TRY).toBeGreaterThan(0)
  })
})
