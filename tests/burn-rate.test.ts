/**
 * Cash Burn Rate Monitor — unit tests
 *
 * Tests pure computation logic of BurnRateService helper functions.
 * No DB or network calls — all pure function tests.
 */

import { describe, it, expect } from 'vitest'
import {
  computeBurnTrend,
  computeRunway,
  findPeakBurnMonth,
} from '../lib/services/finance/burn-rate.service'
import type { MonthlyBurnData } from '../lib/services/finance/burn-rate.service'

// ── computeBurnTrend ──────────────────────────────────────────────────────────

describe('computeBurnTrend — pure', () => {

  // Test 1: insufficient_data when monthCount < 3
  it('1. monthCount < 3 → insufficient_data', () => {
    expect(computeBurnTrend(10_000, 9_000, 2)).toBe('insufficient_data')
  })

  // Test 2: insufficient_data when monthCount = 0
  it('2. monthCount = 0 → insufficient_data', () => {
    expect(computeBurnTrend(0, 0, 0)).toBe('insufficient_data')
  })

  // Test 3: accelerating when current > avg by >10%
  it('3. current 20% above avg → accelerating', () => {
    // current = 12_000, avg = 10_000 → ratio = 1.2 > 1.1
    expect(computeBurnTrend(12_000, 10_000, 3)).toBe('accelerating')
  })

  // Test 4: accelerating edge: exactly 11% above
  it('4. current exactly 11% above avg → accelerating', () => {
    expect(computeBurnTrend(11_100, 10_000, 3)).toBe('accelerating')
  })

  // Test 5: decelerating when current < avg by >10%
  it('5. current 20% below avg → decelerating', () => {
    // current = 8_000, avg = 10_000 → ratio = 0.8 < 0.9
    expect(computeBurnTrend(8_000, 10_000, 3)).toBe('decelerating')
  })

  // Test 6: decelerating edge: exactly 11% below
  it('6. current exactly 11% below avg → decelerating', () => {
    expect(computeBurnTrend(8_900, 10_000, 3)).toBe('decelerating')
  })

  // Test 7: stable when within ±10%
  it('7. current exactly equal to avg → stable', () => {
    expect(computeBurnTrend(10_000, 10_000, 3)).toBe('stable')
  })

  // Test 8: stable when current = avg * 1.10 (boundary — NOT accelerating, borderline stable)
  it('8. current exactly 10% above avg → stable (boundary, not >10%)', () => {
    // ratio = 1.1 — NOT > 1.1, so stable
    expect(computeBurnTrend(11_000, 10_000, 3)).toBe('stable')
  })

  // Test 9: insufficient_data when avgBurn = 0 (even if monthCount >= 3)
  it('9. avgBurn = 0 → insufficient_data (avoid division by zero)', () => {
    expect(computeBurnTrend(5_000, 0, 3)).toBe('insufficient_data')
  })

  // Test 10: stable with monthCount = 6 (large enough)
  it('10. monthCount = 6, within ±10% → stable', () => {
    expect(computeBurnTrend(10_500, 10_000, 6)).toBe('stable')
  })
})

// ── computeRunway ─────────────────────────────────────────────────────────────

describe('computeRunway — pure', () => {

  // Test 11: null when cashBalance is null
  it('11. cashBalance = null → null', () => {
    expect(computeRunway(null, 5_000)).toBeNull()
  })

  // Test 12: null when cashBalance = 0
  it('12. cashBalance = 0 → null', () => {
    expect(computeRunway(0, 5_000)).toBeNull()
  })

  // Test 13: null when avgNetBurn ≤ 0 (company is cash-flow positive)
  it('13. avgNetBurn = 0 → null (company not burning)', () => {
    expect(computeRunway(100_000, 0)).toBeNull()
  })

  // Test 14: null when avgNetBurn < 0 (company generating cash)
  it('14. avgNetBurn = -5000 → null (company generating cash)', () => {
    expect(computeRunway(100_000, -5_000)).toBeNull()
  })

  // Test 15: positive result: 100_000 cash / 10_000 burn = 10 months
  it('15. cashBalance=100_000, avgNetBurn=10_000 → 10 months', () => {
    expect(computeRunway(100_000, 10_000)).toBeCloseTo(10, 2)
  })

  // Test 16: fractional months: 150_000 / 40_000 = 3.75
  it('16. cashBalance=150_000, avgNetBurn=40_000 → 3.75 months', () => {
    expect(computeRunway(150_000, 40_000)).toBeCloseTo(3.75, 2)
  })
})

// ── findPeakBurnMonth ─────────────────────────────────────────────────────────

describe('findPeakBurnMonth — pure', () => {

  // Test 17: empty array → { month: null, try: null }
  it('17. empty array → { month: null, try: null }', () => {
    const result = findPeakBurnMonth([])
    expect(result.month).toBeNull()
    expect(result.try).toBeNull()
  })

  // Test 18: single month → that month is the peak
  it('18. single month → that month is peak', () => {
    const months: MonthlyBurnData[] = [
      { month: '2026-01', label: 'Ocak 2026', gross_burn_try: 15_000, revenue_try: 10_000, net_burn_try: 5_000, cash_balance_try: null },
    ]
    const result = findPeakBurnMonth(months)
    expect(result.month).toBe('Ocak 2026')
    expect(result.try).toBe(15_000)
  })

  // Test 19: array with clear peak in the middle
  it('19. peak in the middle of array', () => {
    const months: MonthlyBurnData[] = [
      { month: '2026-01', label: 'Ocak 2026',    gross_burn_try: 10_000, revenue_try: 8_000, net_burn_try: 2_000, cash_balance_try: null },
      { month: '2025-12', label: 'Aralık 2025',  gross_burn_try: 25_000, revenue_try: 8_000, net_burn_try: 17_000, cash_balance_try: null },
      { month: '2025-11', label: 'Kasım 2025',   gross_burn_try: 12_000, revenue_try: 8_000, net_burn_try: 4_000, cash_balance_try: null },
    ]
    const result = findPeakBurnMonth(months)
    expect(result.month).toBe('Aralık 2025')
    expect(result.try).toBe(25_000)
  })

  // Test 20: array with all equal burns → first element is returned
  it('20. all equal burns → first month returned (first wins in stable)', () => {
    const months: MonthlyBurnData[] = [
      { month: '2026-01', label: 'Ocak 2026',    gross_burn_try: 10_000, revenue_try: 5_000, net_burn_try: 5_000, cash_balance_try: null },
      { month: '2025-12', label: 'Aralık 2025',  gross_burn_try: 10_000, revenue_try: 5_000, net_burn_try: 5_000, cash_balance_try: null },
    ]
    const result = findPeakBurnMonth(months)
    // When equal, first element stays as peak
    expect(result.month).toBe('Ocak 2026')
    expect(result.try).toBe(10_000)
  })

  // Test 21: peak is the last element
  it('21. peak at end of array', () => {
    const months: MonthlyBurnData[] = [
      { month: '2026-01', label: 'Ocak 2026',   gross_burn_try: 5_000, revenue_try: 3_000, net_burn_try: 2_000, cash_balance_try: null },
      { month: '2025-12', label: 'Aralık 2025', gross_burn_try: 8_000, revenue_try: 3_000, net_burn_try: 5_000, cash_balance_try: null },
      { month: '2025-11', label: 'Kasım 2025',  gross_burn_try: 50_000, revenue_try: 3_000, net_burn_try: 47_000, cash_balance_try: null },
    ]
    const result = findPeakBurnMonth(months)
    expect(result.month).toBe('Kasım 2025')
    expect(result.try).toBe(50_000)
  })
})
