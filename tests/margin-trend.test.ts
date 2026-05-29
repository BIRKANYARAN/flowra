// ─────────────────────────────────────────────────────────────────────────────
// tests/margin-trend.test.ts
//
// Unit tests for pure functions in margin-trend.service.ts
// ─────────────────────────────────────────────────────────────────────────────

import {
  computeEbitdaMargin,
  computeMarginDelta,
  classifyMarginTrend,
  computeCogsRatio,
  computeOpexRatio,
} from '../lib/services/finance/margin-trend.service'

// ── computeEbitdaMargin ───────────────────────────────────────────────────────

describe('computeEbitdaMargin', () => {
  test('normal: 200 / 1000 = 20%', () => {
    expect(computeEbitdaMargin(200, 1000)).toBeCloseTo(20)
  })

  test('zero revenue returns null', () => {
    expect(computeEbitdaMargin(200, 0)).toBeNull()
  })

  test('negative EBITDA: -100 / 500 = -20%', () => {
    expect(computeEbitdaMargin(-100, 500)).toBeCloseTo(-20)
  })

  test('EBITDA equals revenue: 1000 / 1000 = 100%', () => {
    expect(computeEbitdaMargin(1000, 1000)).toBeCloseTo(100)
  })

  test('small fractional values', () => {
    expect(computeEbitdaMargin(1, 3)).toBeCloseTo(33.333)
  })
})

// ── computeMarginDelta ────────────────────────────────────────────────────────

describe('computeMarginDelta', () => {
  test('positive delta: current 30, prior 20 → 10', () => {
    expect(computeMarginDelta(30, 20)).toBeCloseTo(10)
  })

  test('negative delta: current 15, prior 25 → -10', () => {
    expect(computeMarginDelta(15, 25)).toBeCloseTo(-10)
  })

  test('zero delta: current 20, prior 20 → 0', () => {
    expect(computeMarginDelta(20, 20)).toBeCloseTo(0)
  })

  test('null current → null', () => {
    expect(computeMarginDelta(null, 20)).toBeNull()
  })

  test('null prior → null', () => {
    expect(computeMarginDelta(20, null)).toBeNull()
  })

  test('both null → null', () => {
    expect(computeMarginDelta(null, null)).toBeNull()
  })

  test('negative margins: current -5, prior -15 → 10', () => {
    expect(computeMarginDelta(-5, -15)).toBeCloseTo(10)
  })
})

// ── classifyMarginTrend ───────────────────────────────────────────────────────

describe('classifyMarginTrend', () => {
  test('null → insufficient_data', () => {
    expect(classifyMarginTrend(null)).toBe('insufficient_data')
  })

  test('delta > 1 → expanding (e.g. 5)', () => {
    expect(classifyMarginTrend(5)).toBe('expanding')
  })

  test('delta < -1 → contracting (e.g. -3)', () => {
    expect(classifyMarginTrend(-3)).toBe('contracting')
  })

  test('delta = 0 → stable', () => {
    expect(classifyMarginTrend(0)).toBe('stable')
  })

  test('delta = 0.5 → stable (within ±1%)', () => {
    expect(classifyMarginTrend(0.5)).toBe('stable')
  })

  test('delta = -0.9 → stable (within ±1%)', () => {
    expect(classifyMarginTrend(-0.9)).toBe('stable')
  })

  // Boundary: exactly +1 is NOT > 1, so stable
  test('delta = 1.0 → stable (boundary: not > 1)', () => {
    expect(classifyMarginTrend(1.0)).toBe('stable')
  })

  // Boundary: exactly -1 is NOT < -1, so stable
  test('delta = -1.0 → stable (boundary: not < -1)', () => {
    expect(classifyMarginTrend(-1.0)).toBe('stable')
  })

  test('delta = 1.01 → expanding (just above boundary)', () => {
    expect(classifyMarginTrend(1.01)).toBe('expanding')
  })

  test('delta = -1.01 → contracting (just below boundary)', () => {
    expect(classifyMarginTrend(-1.01)).toBe('contracting')
  })

  test('very large positive → expanding', () => {
    expect(classifyMarginTrend(50)).toBe('expanding')
  })

  test('very large negative → contracting', () => {
    expect(classifyMarginTrend(-50)).toBe('contracting')
  })
})

// ── computeCogsRatio ──────────────────────────────────────────────────────────

describe('computeCogsRatio', () => {
  test('normal: 600 / 1000 = 60%', () => {
    expect(computeCogsRatio(600, 1000)).toBeCloseTo(60)
  })

  test('zero revenue → null', () => {
    expect(computeCogsRatio(500, 0)).toBeNull()
  })

  test('zero COGS → 0%', () => {
    expect(computeCogsRatio(0, 1000)).toBeCloseTo(0)
  })

  test('COGS equals revenue → 100%', () => {
    expect(computeCogsRatio(1000, 1000)).toBeCloseTo(100)
  })

  test('COGS exceeds revenue (loss): 1200 / 1000 = 120%', () => {
    expect(computeCogsRatio(1200, 1000)).toBeCloseTo(120)
  })
})

// ── computeOpexRatio ──────────────────────────────────────────────────────────

describe('computeOpexRatio', () => {
  test('normal: 200 / 1000 = 20%', () => {
    expect(computeOpexRatio(200, 1000)).toBeCloseTo(20)
  })

  test('zero revenue → null', () => {
    expect(computeOpexRatio(100, 0)).toBeNull()
  })

  test('zero opex → 0%', () => {
    expect(computeOpexRatio(0, 1000)).toBeCloseTo(0)
  })

  test('opex equals revenue → 100%', () => {
    expect(computeOpexRatio(1000, 1000)).toBeCloseTo(100)
  })

  test('fractional: 333 / 999 ≈ 33.33%', () => {
    expect(computeOpexRatio(333, 999)).toBeCloseTo(33.333)
  })
})
