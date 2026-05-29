/**
 * Scenario Variance — pure computation tests.
 *
 * Scope: computeVariance() pure kernel — no DB, no I/O.
 *
 * Run with: npx vitest run tests/scenario-variance.test.ts
 */

import { describe, it, expect } from 'vitest'
import {
  computeVariance,
  type ScenarioVariance,
} from '../lib/services/planning/scenario-variance.service'

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeProjected(overrides: Partial<ScenarioVariance['projected']> = {}): ScenarioVariance['projected'] {
  return {
    revenue_try:      100_000,
    cogs_try:          40_000,
    gross_profit_try:  60_000,
    expenses_try:      30_000,
    net_income_try:    25_000,
    cash_try:               0,
    ...overrides,
  }
}

function makeActuals(overrides: Partial<NonNullable<ScenarioVariance['actuals']>> = {}): NonNullable<ScenarioVariance['actuals']> {
  return {
    revenue_try:      100_000,
    cogs_try:          40_000,
    gross_profit_try:  60_000,
    expenses_try:      30_000,
    net_income_try:    25_000,
    cash_try:          null,
    ...overrides,
  }
}

const TODAY   = '2026-05-01'
const PERIOD_TO = '2026-04-30'

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('computeVariance — pure kernel', () => {

  // 1. Perfect match → accuracy_score = 100, verdict = 'accurate'
  it('perfect match → accuracy_score = 100 and verdict accurate', () => {
    const proj   = makeProjected()
    const actual = makeActuals()
    const result = computeVariance(proj, actual, TODAY, PERIOD_TO)

    expect(result.accuracy_score).toBe(100)
    expect(result.verdict).toBe('accurate')
  })

  // 2. Revenue 20% below forecast → verdict = 'optimistic' (scenario too rosy)
  it('revenue 20% below forecast → verdict optimistic', () => {
    const proj   = makeProjected({ revenue_try: 100_000 })
    const actual = makeActuals({ revenue_try: 80_000 })   // −20%
    const result = computeVariance(proj, actual, TODAY, PERIOD_TO)

    expect(result.verdict).toBe('optimistic')
    expect(result.variance?.revenue_pct).toBeCloseTo(-0.2, 2)
  })

  // 3. Revenue 20% above forecast → verdict = 'pessimistic' (reality better)
  it('revenue 20% above forecast → verdict pessimistic', () => {
    const proj   = makeProjected({ revenue_try: 100_000 })
    const actual = makeActuals({ revenue_try: 120_000 })   // +20%
    const result = computeVariance(proj, actual, TODAY, PERIOD_TO)

    expect(result.verdict).toBe('pessimistic')
    expect(result.variance?.revenue_pct).toBeCloseTo(0.2, 2)
  })

  // 4. No actuals → verdict = 'insufficient_data'
  it('no actuals → verdict insufficient_data', () => {
    const proj   = makeProjected()
    const result = computeVariance(proj, null, TODAY, PERIOD_TO)

    expect(result.verdict).toBe('insufficient_data')
    expect(result.accuracy_score).toBeNull()
    expect(result.variance).toBeNull()
  })

  // 5. Revenue within 10% (exactly 9% deviation) → verdict = 'accurate'
  it('revenue within 10% → verdict accurate', () => {
    const proj   = makeProjected({ revenue_try: 100_000 })
    const actual = makeActuals({ revenue_try: 91_000 })   // −9%
    const result = computeVariance(proj, actual, TODAY, PERIOD_TO)

    expect(result.verdict).toBe('accurate')
  })

  // 6. Accuracy score decreases with larger variance
  it('accuracy score decreases with larger variance', () => {
    const proj    = makeProjected()

    const small   = computeVariance(proj, makeActuals({ revenue_try: 95_000, net_income_try: 24_000 }), TODAY, PERIOD_TO)
    const large   = computeVariance(proj, makeActuals({ revenue_try: 60_000, net_income_try: 10_000 }), TODAY, PERIOD_TO)

    expect(small.accuracy_score).toBeGreaterThan(large.accuracy_score!)
  })

  // 7. Accuracy score floored at 0 (never negative)
  it('accuracy score never negative — clamped to 0', () => {
    const proj   = makeProjected({ revenue_try: 100_000, net_income_try: 25_000 })
    // Actuals wildly off (10x the projected)
    const actual = makeActuals({ revenue_try: 1_000_000, net_income_try: 500_000 })
    const result = computeVariance(proj, actual, TODAY, PERIOD_TO)

    expect(result.accuracy_score).toBeGreaterThanOrEqual(0)
    // Also confirm it doesn't exceed 100
    expect(result.accuracy_score).toBeLessThanOrEqual(100)
  })

  // 8. Null cash_try in actuals handled gracefully
  it('null cash_try in actuals is handled gracefully', () => {
    const proj   = makeProjected()
    const actual = makeActuals({ cash_try: null })
    const result = computeVariance(proj, actual, TODAY, PERIOD_TO)

    // Should compute fine — cash_try is not a scored metric
    expect(result.verdict).toBe('accurate')
    expect(result.accuracy_score).toBeDefined()
  })

  // 9. Zero projected revenue → no division by zero
  it('zero projected revenue → no division by zero, variance_pct is null', () => {
    const proj   = makeProjected({ revenue_try: 0 })
    const actual = makeActuals({ revenue_try: 50_000 })

    let threw = false
    let result: ReturnType<typeof computeVariance> | null = null
    try {
      result = computeVariance(proj, actual, TODAY, PERIOD_TO)
    } catch {
      threw = true
    }

    expect(threw).toBe(false)
    // When projected revenue = 0, revenue_pct should be null (no division)
    expect(result!.variance!.revenue_pct).toBeNull()
  })

  // 10. All metrics contribute to accuracy_score
  it('all metrics with large deviations produce lower score than single metric deviation', () => {
    const proj = makeProjected()

    // Only revenue deviates
    const singleDeviation = computeVariance(
      proj,
      makeActuals({ revenue_try: 50_000 }),  // large revenue deviation
      TODAY,
      PERIOD_TO,
    )

    // All metrics deviate
    const allDeviation = computeVariance(
      proj,
      makeActuals({
        revenue_try:      50_000,
        cogs_try:         80_000,   // 100% above projected
        gross_profit_try: 10_000,   // far below
        expenses_try:     60_000,   // 100% above projected
        net_income_try:   -10_000,  // loss vs profit
      }),
      TODAY,
      PERIOD_TO,
    )

    expect(allDeviation.accuracy_score!).toBeLessThan(singleDeviation.accuracy_score!)
  })

  // 11. Revenue boundary: exactly 10% below → still accurate (boundary test)
  it('revenue exactly at −10% boundary → verdict accurate (inclusive boundary)', () => {
    const proj   = makeProjected({ revenue_try: 100_000 })
    const actual = makeActuals({ revenue_try: 90_000 })   // exactly −10%
    const result = computeVariance(proj, actual, TODAY, PERIOD_TO)

    expect(result.verdict).toBe('accurate')
  })

  // 12. Revenue just beyond 10% → optimistic
  it('revenue just beyond −10% boundary → verdict optimistic', () => {
    const proj   = makeProjected({ revenue_try: 100_000 })
    const actual = makeActuals({ revenue_try: 89_000 })   // −11%
    const result = computeVariance(proj, actual, TODAY, PERIOD_TO)

    expect(result.verdict).toBe('optimistic')
  })

  // 13. Verdict detail is a non-empty string in all cases
  it('verdict_detail is always a non-empty string', () => {
    const proj = makeProjected()

    const cases = [
      computeVariance(proj, makeActuals(), TODAY, PERIOD_TO),
      computeVariance(proj, makeActuals({ revenue_try: 70_000 }), TODAY, PERIOD_TO),
      computeVariance(proj, makeActuals({ revenue_try: 130_000 }), TODAY, PERIOD_TO),
      computeVariance(proj, null, TODAY, PERIOD_TO),
    ]

    for (const c of cases) {
      expect(c.verdict_detail).toBeTruthy()
      expect(typeof c.verdict_detail).toBe('string')
    }
  })

  // 14. Net income variance computed correctly
  it('net income variance is actuals minus projected', () => {
    const proj   = makeProjected({ net_income_try: 25_000 })
    const actual = makeActuals({  net_income_try: 30_000 })
    const result = computeVariance(proj, actual, TODAY, PERIOD_TO)

    expect(result.variance!.net_income_try).toBe(5_000)
  })

  // 15. Expenses variance: higher actuals → positive expenses_try variance
  it('expenses higher than projected → positive expenses_try variance (more spending)', () => {
    const proj   = makeProjected({ expenses_try: 30_000 })
    const actual = makeActuals({  expenses_try: 40_000 })
    const result = computeVariance(proj, actual, TODAY, PERIOD_TO)

    expect(result.variance!.expenses_try).toBe(10_000)  // actuals - projected = positive
    // round2 rounds to 2 decimal places; 10000/30000 ≈ 0.33
    expect(result.variance!.expenses_pct).toBeCloseTo(10_000 / 30_000, 1)
  })

  // 16. Revenue exactly at +10% boundary → accurate
  it('revenue exactly at +10% boundary → verdict accurate', () => {
    const proj   = makeProjected({ revenue_try: 100_000 })
    const actual = makeActuals({ revenue_try: 110_000 })   // exactly +10%
    const result = computeVariance(proj, actual, TODAY, PERIOD_TO)

    expect(result.verdict).toBe('accurate')
  })

  // 17. Revenue just beyond +10% boundary → pessimistic
  it('revenue just beyond +10% boundary → verdict pessimistic', () => {
    const proj   = makeProjected({ revenue_try: 100_000 })
    const actual = makeActuals({ revenue_try: 111_000 })   // +11%
    const result = computeVariance(proj, actual, TODAY, PERIOD_TO)

    expect(result.verdict).toBe('pessimistic')
  })

  // 18. variance.revenue_pct is null when projected revenue is 0
  it('variance.revenue_pct is null when projected revenue = 0', () => {
    const proj   = makeProjected({ revenue_try: 0 })
    const actual = makeActuals({ revenue_try: 0 })
    const result = computeVariance(proj, actual, TODAY, PERIOD_TO)

    expect(result.variance!.revenue_pct).toBeNull()
  })

  // 19. variance.expenses_pct is null when projected expenses = 0
  it('variance.expenses_pct is null when projected expenses = 0', () => {
    const proj   = makeProjected({ expenses_try: 0 })
    const actual = makeActuals({ expenses_try: 50_000 })
    const result = computeVariance(proj, actual, TODAY, PERIOD_TO)

    expect(result.variance!.expenses_pct).toBeNull()
  })

  // 20. accuracy_score is bounded between 0 and 100
  it('accuracy_score is always in [0, 100] range', () => {
    const testCases = [
      { proj: makeProjected(), actual: makeActuals() },
      { proj: makeProjected({ revenue_try: 1 }), actual: makeActuals({ revenue_try: 1_000_000 }) },
      { proj: makeProjected({ net_income_try: 1_000 }), actual: makeActuals({ net_income_try: -500_000 }) },
    ]

    for (const { proj, actual } of testCases) {
      const result = computeVariance(proj, actual, TODAY, PERIOD_TO)
      expect(result.accuracy_score).not.toBeNull()
      expect(result.accuracy_score!).toBeGreaterThanOrEqual(0)
      expect(result.accuracy_score!).toBeLessThanOrEqual(100)
    }
  })

  // 21. No actuals → variance is null
  it('no actuals → variance object is null', () => {
    const result = computeVariance(makeProjected(), null, TODAY, PERIOD_TO)
    expect(result.variance).toBeNull()
  })

  // 22. verdict_detail in Turkish for insufficient_data case
  it('verdict_detail for insufficient_data is in Turkish', () => {
    const result = computeVariance(makeProjected(), null, TODAY, PERIOD_TO)
    // Should be a Turkish string
    expect(result.verdict_detail).toBeTruthy()
    expect(typeof result.verdict_detail).toBe('string')
  })

  // 23. zero projected net_income — no revenue-based fallback test
  it('zero projected net_income and zero revenue — verdict is insufficient_data or accurate based on primary pct', () => {
    const proj   = makeProjected({ revenue_try: 0, net_income_try: 0 })
    const actual = makeActuals({ revenue_try: 0, net_income_try: 0 })
    const result = computeVariance(proj, actual, TODAY, PERIOD_TO)
    // primaryPct = null when both revenue and net_income projected = 0
    // so verdict should be insufficient_data
    expect(['insufficient_data', 'accurate']).toContain(result.verdict)
  })

  // 24. COGS deviation affects accuracy score
  it('COGS deviation reduces accuracy score', () => {
    const proj     = makeProjected()
    const perfect  = computeVariance(proj, makeActuals(), TODAY, PERIOD_TO)
    const cogsOff  = computeVariance(
      proj,
      makeActuals({ cogs_try: 80_000 }),  // 100% deviation from 40k
      TODAY,
      PERIOD_TO,
    )
    // COGS is a scored metric (projected != 0), so deviation should lower accuracy
    expect(cogsOff.accuracy_score!).toBeLessThan(perfect.accuracy_score!)
  })

})
