// tests/cashflow-working-capital-pure.test.ts
// Pure-function tests for cashflow prediction and working capital helpers.

import { describe, it, expect } from 'vitest'

import {
  projectEndOfMonthCash,
  classifyCashFlowRisk,
  computeWeeksOfCashRunway,
  buildCashForecastLine,
} from '../lib/services/cashflow/cashflow-prediction.service'

import {
  computeCCC,
  classifyWCEfficiency,
  computeReorderTiming,
} from '../lib/services/finance/working-capital-optimizer.service'

// ─── projectEndOfMonthCash ────────────────────────────────────────────────────

describe('projectEndOfMonthCash', () => {
  it('basic arithmetic — positive result', () => {
    expect(projectEndOfMonthCash(100_000, 50_000, 30_000, 5_000)).toBe(115_000)
  })

  it('returns negative when outflows exceed opening + revenue', () => {
    expect(projectEndOfMonthCash(10_000, 20_000, 40_000, 0)).toBe(-10_000)
  })

  it('returns opening cash when all other values are zero', () => {
    expect(projectEndOfMonthCash(75_000, 0, 0, 0)).toBe(75_000)
  })

  it('scheduled repayments are fully subtracted', () => {
    expect(projectEndOfMonthCash(200_000, 100_000, 80_000, 50_000)).toBe(170_000)
  })

  it('zero opening cash and zero revenue gives negative result', () => {
    expect(projectEndOfMonthCash(0, 0, 5_000, 1_000)).toBe(-6_000)
  })
})

// ─── classifyCashFlowRisk ─────────────────────────────────────────────────────

describe('classifyCashFlowRisk', () => {
  it('safe — more than 3 months of expenses', () => {
    expect(classifyCashFlowRisk(400_000, 100_000)).toBe('safe') // 4 months
  })

  it('safe boundary — exactly more than 3 months', () => {
    expect(classifyCashFlowRisk(300_001, 100_000)).toBe('safe')
  })

  it('watch — exactly at 3 months is NOT safe', () => {
    expect(classifyCashFlowRisk(300_000, 100_000)).toBe('watch') // 3 months = watch
  })

  it('watch — between 1.5 and 3 months', () => {
    expect(classifyCashFlowRisk(200_000, 100_000)).toBe('watch') // 2 months
  })

  it('warning — between 0.5 and 1.5 months', () => {
    expect(classifyCashFlowRisk(100_000, 100_000)).toBe('warning') // 1 month
  })

  it('warning — just above 0.5 months', () => {
    expect(classifyCashFlowRisk(51_000, 100_000)).toBe('warning')
  })

  it('critical — exactly 0.5 months', () => {
    expect(classifyCashFlowRisk(50_000, 100_000)).toBe('critical')
  })

  it('critical — negative cash', () => {
    expect(classifyCashFlowRisk(-1_000, 100_000)).toBe('critical')
  })

  it('critical — zero cash', () => {
    expect(classifyCashFlowRisk(0, 100_000)).toBe('critical')
  })

  it('safe — when monthlyExpenses is zero (no burn)', () => {
    expect(classifyCashFlowRisk(0, 0)).toBe('safe')
  })
})

// ─── computeWeeksOfCashRunway ─────────────────────────────────────────────────

describe('computeWeeksOfCashRunway', () => {
  it('returns null when weekly burn rate is zero', () => {
    expect(computeWeeksOfCashRunway(100_000, 0)).toBeNull()
  })

  it('returns null when weekly burn rate is negative', () => {
    expect(computeWeeksOfCashRunway(100_000, -500)).toBeNull()
  })

  it('returns 0 when cash balance is zero', () => {
    expect(computeWeeksOfCashRunway(0, 10_000)).toBe(0)
  })

  it('returns 0 when cash balance is negative', () => {
    expect(computeWeeksOfCashRunway(-5_000, 10_000)).toBe(0)
  })

  it('correct weeks calculation', () => {
    expect(computeWeeksOfCashRunway(100_000, 10_000)).toBe(10)
  })

  it('fractional weeks are returned as-is', () => {
    expect(computeWeeksOfCashRunway(15_000, 10_000)).toBe(1.5)
  })

  it('large values compute correctly', () => {
    expect(computeWeeksOfCashRunway(5_200_000, 100_000)).toBe(52)
  })
})

// ─── buildCashForecastLine ────────────────────────────────────────────────────

describe('buildCashForecastLine', () => {
  it('actual — contains Turkish month name', () => {
    const line = buildCashForecastLine('2025-04', 1_250_000, false)
    expect(line).toContain('Nisan 2025')
  })

  it('actual — does NOT include ~ prefix', () => {
    const line = buildCashForecastLine('2025-04', 1_250_000, false)
    expect(line).not.toContain('~')
  })

  it('actual — contains Gerçekleşen label', () => {
    const line = buildCashForecastLine('2025-04', 1_250_000, false)
    expect(line).toContain('(Gerçekleşen)')
  })

  it('projected — contains ~ prefix before amount', () => {
    const line = buildCashForecastLine('2025-05', 1_180_000, true)
    expect(line).toContain('~₺')
  })

  it('projected — contains Tahmin label', () => {
    const line = buildCashForecastLine('2025-05', 1_180_000, true)
    expect(line).toContain('(Tahmin)')
  })

  it('projected — contains month name Mayıs', () => {
    const line = buildCashForecastLine('2025-05', 1_180_000, true)
    expect(line).toContain('Mayıs 2025')
  })

  it('Ocak maps correctly for January', () => {
    const line = buildCashForecastLine('2024-01', 500_000, false)
    expect(line).toContain('Ocak 2024')
  })

  it('Aralık maps correctly for December', () => {
    const line = buildCashForecastLine('2024-12', 500_000, false)
    expect(line).toContain('Aralık 2024')
  })

  it('amount is formatted with Turkish locale (period/comma)', () => {
    const line = buildCashForecastLine('2025-03', 1_000_000, false)
    // Turkish Intl formats 1000000 as "1.000.000"
    expect(line).toMatch(/1[., ]?000[., ]?000/)
  })
})

// ─── computeCCC ──────────────────────────────────────────────────────────────

describe('computeCCC', () => {
  it('standard positive CCC', () => {
    expect(computeCCC(45, 30, 20)).toBe(35)  // 45 - 30 + 20
  })

  it('negative CCC (excellent case)', () => {
    expect(computeCCC(10, 60, 5)).toBe(-45) // 10 - 60 + 5
  })

  it('zero CCC when balanced', () => {
    expect(computeCCC(30, 45, 15)).toBe(0) // 30 - 45 + 15
  })

  it('CCC with no inventory (DIO=0)', () => {
    expect(computeCCC(40, 30, 0)).toBe(10)
  })

  it('all zeros gives zero CCC', () => {
    expect(computeCCC(0, 0, 0)).toBe(0)
  })
})

// ─── classifyWCEfficiency ─────────────────────────────────────────────────────

describe('classifyWCEfficiency', () => {
  it('excellent — negative CCC', () => {
    expect(classifyWCEfficiency(-10)).toBe('excellent')
  })

  it('excellent — CCC = -1', () => {
    expect(classifyWCEfficiency(-1)).toBe('excellent')
  })

  it('good — CCC = 0', () => {
    expect(classifyWCEfficiency(0)).toBe('good')
  })

  it('good — CCC = 30', () => {
    expect(classifyWCEfficiency(30)).toBe('good')
  })

  it('fair — CCC = 31', () => {
    expect(classifyWCEfficiency(31)).toBe('fair')
  })

  it('fair — CCC = 60', () => {
    expect(classifyWCEfficiency(60)).toBe('fair')
  })

  it('poor — CCC = 61', () => {
    expect(classifyWCEfficiency(61)).toBe('poor')
  })

  it('poor — very high CCC', () => {
    expect(classifyWCEfficiency(120)).toBe('poor')
  })
})

// ─── computeReorderTiming ────────────────────────────────────────────────────

describe('computeReorderTiming', () => {
  it('correct reorder point calculation', () => {
    // reorderPoint = (100 * 5) + (100 * 3) = 800
    const result = computeReorderTiming(1000, 100, 5, 3)
    expect(result.reorderPoint).toBe(800)
  })

  it('orderNow = false when currentQty > reorderPoint', () => {
    const result = computeReorderTiming(1000, 100, 5, 3)
    expect(result.orderNow).toBe(false)
  })

  it('orderNow = true when currentQty equals reorderPoint', () => {
    const result = computeReorderTiming(800, 100, 5, 3)
    expect(result.orderNow).toBe(true)
  })

  it('orderNow = true when currentQty is below reorderPoint', () => {
    const result = computeReorderTiming(500, 100, 5, 3)
    expect(result.orderNow).toBe(true)
  })

  it('zero daily usage gives zero reorder point', () => {
    const result = computeReorderTiming(100, 0, 10, 5)
    expect(result.reorderPoint).toBe(0)
    expect(result.orderNow).toBe(false) // 100 > 0
  })

  it('zero current qty always triggers orderNow', () => {
    const result = computeReorderTiming(0, 50, 3, 2)
    expect(result.orderNow).toBe(true)
  })

  it('fractional daily usage is handled correctly', () => {
    // reorderPoint = (2.5 * 4) + (2.5 * 2) = 10 + 5 = 15
    const result = computeReorderTiming(20, 2.5, 4, 2)
    expect(result.reorderPoint).toBe(15)
    expect(result.orderNow).toBe(false)
  })
})
