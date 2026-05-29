// ─────────────────────────────────────────────────────────────────────────────
// tests/margin-trend.test.ts
//
// Unit tests for pure functions in lib/services/finance/margin-trend.service.ts
// Target: 95+ tests covering all exported pure functions
// ─────────────────────────────────────────────────────────────────────────────

import { describe, test, expect } from 'vitest'
import {
  // Pure functions
  computeGrossMarginPct,
  computeOperatingMarginPct,
  computeNetMarginPct,
  computeMarginChange,
  computeRollingAvgMargin,
  computeStddev,
  detectMarginAnomaly,
  classifyMarginTrend,
  computeMarginBenchmarkGap,
  classifyMarginHealth,
  findBestMarginMonth,
  findWorstMarginMonth,
  computeAverageMargin,
  generateMarginNarrative,
  // Benchmarks
  TURKISH_SME_GROSS_MARGIN_BENCHMARK,
  TURKISH_SME_NET_MARGIN_BENCHMARK,
  TURKISH_SME_OPERATING_MARGIN_BENCHMARK,
  // Type
  type MonthlyMarginPoint,
} from '../lib/services/finance/margin-trend.service'

// ── Helpers ───────────────────────────────────────────────────────────────────

function makePoint(
  year_month: string,
  revenue: number,
  cogs: number,
  opex: number,
  overrides: Partial<MonthlyMarginPoint> = {},
): MonthlyMarginPoint {
  const net_income = revenue - cogs - opex
  return {
    year_month,
    revenue,
    cogs,
    operating_expenses: opex,
    net_income,
    gross_margin_pct:     revenue > 0 ? ((revenue - cogs) / revenue) * 100 : null,
    operating_margin_pct: revenue > 0 ? ((revenue - cogs - opex) / revenue) * 100 : null,
    net_margin_pct:       revenue > 0 ? (net_income / revenue) * 100 : null,
    ...overrides,
  }
}

// ── Benchmarks ────────────────────────────────────────────────────────────────

describe('BENCHMARKS', () => {
  test('TURKISH_SME_GROSS_MARGIN_BENCHMARK is 28', () => {
    expect(TURKISH_SME_GROSS_MARGIN_BENCHMARK).toBe(28.0)
  })

  test('TURKISH_SME_NET_MARGIN_BENCHMARK is 8', () => {
    expect(TURKISH_SME_NET_MARGIN_BENCHMARK).toBe(8.0)
  })

  test('TURKISH_SME_OPERATING_MARGIN_BENCHMARK is 12', () => {
    expect(TURKISH_SME_OPERATING_MARGIN_BENCHMARK).toBe(12.0)
  })

  test('all benchmarks are positive numbers', () => {
    expect(TURKISH_SME_GROSS_MARGIN_BENCHMARK).toBeGreaterThan(0)
    expect(TURKISH_SME_NET_MARGIN_BENCHMARK).toBeGreaterThan(0)
    expect(TURKISH_SME_OPERATING_MARGIN_BENCHMARK).toBeGreaterThan(0)
  })
})

// ── computeGrossMarginPct ─────────────────────────────────────────────────────

describe('computeGrossMarginPct', () => {
  test('basic: revenue=1000 cogs=700 → 30%', () => {
    expect(computeGrossMarginPct(1000, 700)).toBeCloseTo(30)
  })

  test('zero cogs: 1000/1000 → 100%', () => {
    expect(computeGrossMarginPct(1000, 0)).toBeCloseTo(100)
  })

  test('cogs equals revenue → 0%', () => {
    expect(computeGrossMarginPct(1000, 1000)).toBeCloseTo(0)
  })

  test('cogs exceeds revenue → negative margin', () => {
    expect(computeGrossMarginPct(1000, 1200)).toBeCloseTo(-20)
  })

  test('zero revenue → null', () => {
    expect(computeGrossMarginPct(0, 500)).toBeNull()
  })

  test('zero revenue and zero cogs → null', () => {
    expect(computeGrossMarginPct(0, 0)).toBeNull()
  })

  test('fractional: 1/3 → ~33.33%', () => {
    expect(computeGrossMarginPct(3, 2)).toBeCloseTo(33.333, 2)
  })

  test('large values: 1_000_000 revenue, 280_000 cogs → 72%', () => {
    expect(computeGrossMarginPct(1_000_000, 280_000)).toBeCloseTo(72)
  })
})

// ── computeOperatingMarginPct ─────────────────────────────────────────────────

describe('computeOperatingMarginPct', () => {
  test('basic: revenue=1000 cogs=600 opex=200 → 20%', () => {
    expect(computeOperatingMarginPct(1000, 600, 200)).toBeCloseTo(20)
  })

  test('zero opex: (1000-600)/1000 → 40%', () => {
    expect(computeOperatingMarginPct(1000, 600, 0)).toBeCloseTo(40)
  })

  test('cogs + opex equals revenue → 0%', () => {
    expect(computeOperatingMarginPct(1000, 700, 300)).toBeCloseTo(0)
  })

  test('cogs + opex exceeds revenue → negative', () => {
    expect(computeOperatingMarginPct(1000, 700, 400)).toBeCloseTo(-10)
  })

  test('zero revenue → null', () => {
    expect(computeOperatingMarginPct(0, 0, 0)).toBeNull()
  })

  test('zero revenue with non-zero cogs → null', () => {
    expect(computeOperatingMarginPct(0, 500, 200)).toBeNull()
  })

  test('all zeros except revenue → 100%', () => {
    expect(computeOperatingMarginPct(1000, 0, 0)).toBeCloseTo(100)
  })
})

// ── computeNetMarginPct ───────────────────────────────────────────────────────

describe('computeNetMarginPct', () => {
  test('basic: netIncome=150 revenue=1000 → 15%', () => {
    expect(computeNetMarginPct(1000, 150)).toBeCloseTo(15)
  })

  test('zero net income → 0%', () => {
    expect(computeNetMarginPct(1000, 0)).toBeCloseTo(0)
  })

  test('negative net income → negative margin', () => {
    expect(computeNetMarginPct(1000, -100)).toBeCloseTo(-10)
  })

  test('zero revenue → null', () => {
    expect(computeNetMarginPct(0, 0)).toBeNull()
  })

  test('zero revenue with positive income → null', () => {
    expect(computeNetMarginPct(0, 500)).toBeNull()
  })

  test('net income equals revenue → 100%', () => {
    expect(computeNetMarginPct(1000, 1000)).toBeCloseTo(100)
  })

  test('fractional: 1/7 → ~14.29%', () => {
    expect(computeNetMarginPct(700, 100)).toBeCloseTo(14.2857, 3)
  })
})

// ── computeMarginChange ───────────────────────────────────────────────────────

describe('computeMarginChange', () => {
  test('positive change: 30 - 20 = 10', () => {
    expect(computeMarginChange(30, 20)).toBeCloseTo(10)
  })

  test('negative change: 15 - 25 = -10', () => {
    expect(computeMarginChange(15, 25)).toBeCloseTo(-10)
  })

  test('zero change: 20 - 20 = 0', () => {
    expect(computeMarginChange(20, 20)).toBeCloseTo(0)
  })

  test('null current → null', () => {
    expect(computeMarginChange(null, 20)).toBeNull()
  })

  test('null prior → null', () => {
    expect(computeMarginChange(20, null)).toBeNull()
  })

  test('both null → null', () => {
    expect(computeMarginChange(null, null)).toBeNull()
  })

  test('negative margins: -5 - (-15) = 10', () => {
    expect(computeMarginChange(-5, -15)).toBeCloseTo(10)
  })

  test('crossing zero: 5 - (-5) = 10', () => {
    expect(computeMarginChange(5, -5)).toBeCloseTo(10)
  })
})

// ── computeRollingAvgMargin ───────────────────────────────────────────────────

describe('computeRollingAvgMargin', () => {
  test('returns same-length array as input', () => {
    const input = [10, 20, 30, 40, 50]
    expect(computeRollingAvgMargin(input, 3)).toHaveLength(5)
  })

  test('window=3: first element = itself', () => {
    const result = computeRollingAvgMargin([10, 20, 30], 3)
    expect(result[0]).toBeCloseTo(10)
  })

  test('window=3: second element = avg of first two', () => {
    const result = computeRollingAvgMargin([10, 20, 30], 3)
    expect(result[1]).toBeCloseTo(15)
  })

  test('window=3: third element = avg of first three', () => {
    const result = computeRollingAvgMargin([10, 20, 30], 3)
    expect(result[2]).toBeCloseTo(20)
  })

  test('full 5-element window=3', () => {
    const result = computeRollingAvgMargin([10, 20, 30, 40, 50], 3)
    expect(result[3]).toBeCloseTo(30)
    expect(result[4]).toBeCloseTo(40)
  })

  test('null in window: skip nulls in average', () => {
    const result = computeRollingAvgMargin([10, null, 30], 3)
    // index 2: window=[10,null,30] → avg(10,30)=20
    expect(result[2]).toBeCloseTo(20)
  })

  test('all null in window → null', () => {
    const result = computeRollingAvgMargin([null, null, null], 3)
    expect(result[2]).toBeNull()
  })

  test('null at start: index 0 uses only itself', () => {
    const result = computeRollingAvgMargin([null, 20, 30], 3)
    expect(result[0]).toBeNull()
    expect(result[1]).toBeCloseTo(20)
  })

  test('window=1: each element equals itself', () => {
    const result = computeRollingAvgMargin([10, 20, 30], 1)
    expect(result[0]).toBeCloseTo(10)
    expect(result[1]).toBeCloseTo(20)
    expect(result[2]).toBeCloseTo(30)
  })

  test('empty input returns empty array', () => {
    expect(computeRollingAvgMargin([], 3)).toEqual([])
  })

  test('window larger than array: uses all available non-null', () => {
    const result = computeRollingAvgMargin([10, 20], 5)
    expect(result[0]).toBeCloseTo(10)
    expect(result[1]).toBeCloseTo(15)
  })

  test('mixed null and values: correct average', () => {
    const result = computeRollingAvgMargin([null, 10, null, 20, null], 3)
    // index 2: window=[null,10,null] → avg(10)=10
    expect(result[2]).toBeCloseTo(10)
    // index 3: window=[10,null,20] → avg(10,20)=15
    expect(result[3]).toBeCloseTo(15)
  })
})

// ── computeStddev ─────────────────────────────────────────────────────────────

describe('computeStddev', () => {
  test('fewer than 2 non-null values → null', () => {
    expect(computeStddev([10])).toBeNull()
  })

  test('empty array → null', () => {
    expect(computeStddev([])).toBeNull()
  })

  test('all null → null', () => {
    expect(computeStddev([null, null])).toBeNull()
  })

  test('one null one value → null (fewer than 2 non-null)', () => {
    expect(computeStddev([10, null])).toBeNull()
  })

  test('identical values: stddev = 0', () => {
    expect(computeStddev([20, 20, 20])).toBeCloseTo(0)
  })

  test('population stddev: [2, 4, 4, 4, 5, 5, 7, 9] → 2', () => {
    // mean = 5, variance = (9+1+1+1+0+0+4+16)/8 = 32/8 = 4, stddev = 2
    expect(computeStddev([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2)
  })

  test('two values: [0, 10] → 5', () => {
    // mean = 5, variance = (25+25)/2 = 25, stddev = 5
    expect(computeStddev([0, 10])).toBeCloseTo(5)
  })

  test('skips null values: [10, null, 30] → stddev of [10,30]', () => {
    // mean=20, var=((100+100)/2)=100, stddev=10
    expect(computeStddev([10, null, 30])).toBeCloseTo(10)
  })

  test('negative values: [-10, 10] → 10', () => {
    expect(computeStddev([-10, 10])).toBeCloseTo(10)
  })
})

// ── detectMarginAnomaly ───────────────────────────────────────────────────────

describe('detectMarginAnomaly', () => {
  test('anomaly: deviation > 2σ returns true', () => {
    // |40 - 20| = 20 > 2 × 5 = 10 → true
    expect(detectMarginAnomaly(40, 20, 5, 2.0)).toBe(true)
  })

  test('no anomaly: deviation < 2σ returns false', () => {
    // |22 - 20| = 2 < 2 × 5 = 10 → false
    expect(detectMarginAnomaly(22, 20, 5, 2.0)).toBe(false)
  })

  test('exactly at threshold (equal) → false (not strictly greater)', () => {
    // |30 - 20| = 10 = 2 × 5 = 10 → false (not >)
    expect(detectMarginAnomaly(30, 20, 5, 2.0)).toBe(false)
  })

  test('just above threshold → true', () => {
    // |30.001 - 20| = 10.001 > 10 → true
    expect(detectMarginAnomaly(30.001, 20, 5, 2.0)).toBe(true)
  })

  test('null currentMargin → false', () => {
    expect(detectMarginAnomaly(null, 20, 5, 2.0)).toBe(false)
  })

  test('null rollingAvgMargin → false', () => {
    expect(detectMarginAnomaly(40, null, 5, 2.0)).toBe(false)
  })

  test('null stddev → false', () => {
    expect(detectMarginAnomaly(40, 20, null, 2.0)).toBe(false)
  })

  test('all null inputs → false', () => {
    expect(detectMarginAnomaly(null, null, null, 2.0)).toBe(false)
  })

  test('zero stddev → false', () => {
    expect(detectMarginAnomaly(40, 20, 0, 2.0)).toBe(false)
  })

  test('custom threshold 1.5', () => {
    // |23 - 20| = 3 > 1.5 × 1 = 1.5 → true
    expect(detectMarginAnomaly(23, 20, 1, 1.5)).toBe(true)
  })

  test('negative deviation still detected', () => {
    // |-5 - 20| = 25 > 2 × 5 = 10 → true
    expect(detectMarginAnomaly(-5, 20, 5, 2.0)).toBe(true)
  })

  test('default threshold 2.0 when not specified', () => {
    // |40 - 20| = 20 > 2 × 5 = 10 → true
    expect(detectMarginAnomaly(40, 20, 5)).toBe(true)
  })
})

// ── classifyMarginTrend ───────────────────────────────────────────────────────

describe('classifyMarginTrend', () => {
  test('empty array → insufficient_data', () => {
    expect(classifyMarginTrend([])).toBe('insufficient_data')
  })

  test('fewer than minPoints non-null → insufficient_data', () => {
    expect(classifyMarginTrend([10, 20], 3)).toBe('insufficient_data')
  })

  test('all null → insufficient_data', () => {
    expect(classifyMarginTrend([null, null, null, null])).toBe('insufficient_data')
  })

  test('exactly minPoints non-null → not insufficient_data', () => {
    const result = classifyMarginTrend([30, 30, 30])
    expect(result).not.toBe('insufficient_data')
  })

  test('volatile: high CV (stddev/mean > 0.3)', () => {
    // Large spread: 10, 60, 10, 60, 10 → mean=30, high stddev → volatile
    expect(classifyMarginTrend([10, 60, 10, 60, 10, 60])).toBe('volatile')
  })

  test('volatile takes precedence over expanding', () => {
    // Even with upward slope, volatile if CV > 0.3
    const result = classifyMarginTrend([1, 50, 2, 60, 3, 70])
    expect(result).toBe('volatile')
  })

  test('expanding: clear positive slope > 0.5pp/month', () => {
    // Strong upward: 20, 22, 24, 26, 28, 30 → slope = 2
    expect(classifyMarginTrend([20, 22, 24, 26, 28, 30])).toBe('expanding')
  })

  test('contracting: clear negative slope < -0.5pp/month', () => {
    // Strong downward: 30, 28, 26, 24, 22, 20 → slope = -2
    expect(classifyMarginTrend([30, 28, 26, 24, 22, 20])).toBe('contracting')
  })

  test('stable: near-zero slope', () => {
    // Flat: all 25
    expect(classifyMarginTrend([25, 25, 25, 25, 25])).toBe('stable')
  })

  test('stable: small slope within ±0.5', () => {
    // Very gentle slope: 25, 25.1, 25.2, 25.3, 25.4 → slope ≈ 0.1 → stable
    expect(classifyMarginTrend([25, 25.1, 25.2, 25.3, 25.4])).toBe('stable')
  })

  test('null points are skipped in trend calculation', () => {
    // Same as expanding but with nulls interspersed
    const result = classifyMarginTrend([20, null, 24, null, 28, null, 32])
    expect(result).toBe('expanding')
  })

  test('minPoints default is 3', () => {
    // 2 non-null points → insufficient_data with default minPoints=3
    expect(classifyMarginTrend([20, 25])).toBe('insufficient_data')
  })

  test('custom minPoints=2', () => {
    // 2 non-null → should classify with minPoints=2
    const result = classifyMarginTrend([20, 25], 2)
    expect(result).not.toBe('insufficient_data')
  })

  test('volatile: CV > 0.3 with negative mean excluded (zero mean edge case)', () => {
    // If mean = 0, volatile check is skipped (avoid division by zero)
    // [−5, −5, −5] → mean = −5, stddev=0, CV check but slope=0 → stable
    expect(classifyMarginTrend([-5, -5, -5])).toBe('stable')
  })
})

// ── computeMarginBenchmarkGap ─────────────────────────────────────────────────

describe('computeMarginBenchmarkGap', () => {
  test('above benchmark: 35 - 28 = 7', () => {
    expect(computeMarginBenchmarkGap(35, 28)).toBeCloseTo(7)
  })

  test('below benchmark: 20 - 28 = -8', () => {
    expect(computeMarginBenchmarkGap(20, 28)).toBeCloseTo(-8)
  })

  test('at benchmark: 28 - 28 = 0', () => {
    expect(computeMarginBenchmarkGap(28, 28)).toBeCloseTo(0)
  })

  test('null margin → null', () => {
    expect(computeMarginBenchmarkGap(null, 28)).toBeNull()
  })

  test('negative margin: -5 - 8 = -13', () => {
    expect(computeMarginBenchmarkGap(-5, 8)).toBeCloseTo(-13)
  })

  test('uses Turkish SME gross margin benchmark', () => {
    expect(computeMarginBenchmarkGap(30, TURKISH_SME_GROSS_MARGIN_BENCHMARK)).toBeCloseTo(2)
  })
})

// ── classifyMarginHealth ──────────────────────────────────────────────────────

describe('classifyMarginHealth', () => {
  test('both null → insufficient_data', () => {
    expect(classifyMarginHealth(null, null)).toBe('insufficient_data')
  })

  test('only grossMargin provided → not insufficient_data', () => {
    const result = classifyMarginHealth(40, null)
    expect(result).not.toBe('insufficient_data')
  })

  test('only netMargin provided → not insufficient_data', () => {
    const result = classifyMarginHealth(null, 10)
    expect(result).not.toBe('insufficient_data')
  })

  test('negative net margin → negative', () => {
    expect(classifyMarginHealth(30, -5)).toBe('negative')
  })

  test('negative net margin overrides positive gross → negative', () => {
    expect(classifyMarginHealth(60, -1)).toBe('negative')
  })

  test('excellent: grossMargin >= 50 AND netMargin >= 15', () => {
    expect(classifyMarginHealth(55, 20)).toBe('excellent')
  })

  test('excellent boundary: exactly 50 and 15', () => {
    expect(classifyMarginHealth(50, 15)).toBe('excellent')
  })

  test('not excellent if grossMargin just below 50', () => {
    const result = classifyMarginHealth(49.9, 15)
    expect(result).not.toBe('excellent')
  })

  test('not excellent if netMargin just below 15', () => {
    const result = classifyMarginHealth(50, 14.9)
    expect(result).not.toBe('excellent')
  })

  test('strong: grossMargin >= 35 AND netMargin >= 8', () => {
    expect(classifyMarginHealth(40, 10)).toBe('strong')
  })

  test('strong boundary: exactly 35 and 8', () => {
    expect(classifyMarginHealth(35, 8)).toBe('strong')
  })

  test('adequate: grossMargin >= 20 AND netMargin >= 3', () => {
    expect(classifyMarginHealth(25, 5)).toBe('adequate')
  })

  test('adequate boundary: exactly 20 and 3', () => {
    expect(classifyMarginHealth(20, 3)).toBe('adequate')
  })

  test('thin: grossMargin >= 10 OR netMargin >= 0', () => {
    expect(classifyMarginHealth(12, 1)).toBe('thin')
  })

  test('thin: grossMargin >= 10 with zero net margin', () => {
    // netMargin=0 is not negative, grossMargin=10 qualifies for thin
    expect(classifyMarginHealth(10, 0)).toBe('thin')
  })

  test('thin: netMargin = 0', () => {
    expect(classifyMarginHealth(5, 0)).toBe('thin')
  })

  test('negative when both grossMargin < 10 and netMargin < 0', () => {
    expect(classifyMarginHealth(5, -2)).toBe('negative')
  })

  test('priority: negative takes precedence over excellent', () => {
    // Net negative even if gross is great
    expect(classifyMarginHealth(80, -0.1)).toBe('negative')
  })

  test('null gross but positive net → uses net alone', () => {
    // gross=null treated as 0 → thin (netMargin=5 >= 0)
    expect(classifyMarginHealth(null, 5)).toBe('thin')
  })

  test('gross = 0 and net = 0 → thin (net=0 >= 0)', () => {
    expect(classifyMarginHealth(0, 0)).toBe('thin')
  })
})

// ── findBestMarginMonth ───────────────────────────────────────────────────────

describe('findBestMarginMonth', () => {
  test('empty array → null', () => {
    expect(findBestMarginMonth([])).toBeNull()
  })

  test('all null gross margins → null', () => {
    const pts = [
      makePoint('2024-01', 0, 0, 0, { gross_margin_pct: null }),
      makePoint('2024-02', 0, 0, 0, { gross_margin_pct: null }),
    ]
    expect(findBestMarginMonth(pts)).toBeNull()
  })

  test('single point with non-null margin → that point', () => {
    const p = makePoint('2024-01', 1000, 700, 100)
    expect(findBestMarginMonth([p])).toBe(p)
  })

  test('returns month with highest gross_margin_pct', () => {
    const pts = [
      makePoint('2024-01', 1000, 700, 100),  // 30%
      makePoint('2024-02', 1000, 600, 100),  // 40%
      makePoint('2024-03', 1000, 800, 100),  // 20%
    ]
    expect(findBestMarginMonth(pts)?.year_month).toBe('2024-02')
  })

  test('skips null gross_margin_pct entries', () => {
    const pts = [
      makePoint('2024-01', 1000, 700, 100),    // 30%
      makePoint('2024-02', 0, 0, 0, { gross_margin_pct: null }),
      makePoint('2024-03', 1000, 600, 100),    // 40%
    ]
    expect(findBestMarginMonth(pts)?.year_month).toBe('2024-03')
  })

  test('handles negative gross margins', () => {
    const pts = [
      makePoint('2024-01', 1000, 1100, 100, { gross_margin_pct: -10 }),
      makePoint('2024-02', 1000, 1050, 100, { gross_margin_pct: -5 }),
    ]
    expect(findBestMarginMonth(pts)?.year_month).toBe('2024-02')
  })
})

// ── findWorstMarginMonth ──────────────────────────────────────────────────────

describe('findWorstMarginMonth', () => {
  test('empty array → null', () => {
    expect(findWorstMarginMonth([])).toBeNull()
  })

  test('all null gross margins → null', () => {
    const pts = [
      makePoint('2024-01', 0, 0, 0, { gross_margin_pct: null }),
    ]
    expect(findWorstMarginMonth(pts)).toBeNull()
  })

  test('single non-null point → that point', () => {
    const p = makePoint('2024-01', 1000, 700, 100)
    expect(findWorstMarginMonth([p])).toBe(p)
  })

  test('returns month with lowest gross_margin_pct', () => {
    const pts = [
      makePoint('2024-01', 1000, 700, 100),  // 30%
      makePoint('2024-02', 1000, 600, 100),  // 40%
      makePoint('2024-03', 1000, 800, 100),  // 20%
    ]
    expect(findWorstMarginMonth(pts)?.year_month).toBe('2024-03')
  })

  test('skips null entries', () => {
    const pts = [
      makePoint('2024-01', 0, 0, 0, { gross_margin_pct: null }),
      makePoint('2024-02', 1000, 700, 100),  // 30%
      makePoint('2024-03', 1000, 600, 100),  // 40%
    ]
    expect(findWorstMarginMonth(pts)?.year_month).toBe('2024-02')
  })

  test('best and worst are different when all distinct', () => {
    const pts = [
      makePoint('2024-01', 1000, 500, 100),  // 50%
      makePoint('2024-02', 1000, 700, 100),  // 30%
      makePoint('2024-03', 1000, 900, 100),  // 10%
    ]
    const best  = findBestMarginMonth(pts)
    const worst = findWorstMarginMonth(pts)
    expect(best?.year_month).toBe('2024-01')
    expect(worst?.year_month).toBe('2024-03')
  })
})

// ── computeAverageMargin ──────────────────────────────────────────────────────

describe('computeAverageMargin', () => {
  test('empty array → null', () => {
    expect(computeAverageMargin([])).toBeNull()
  })

  test('all null → null', () => {
    expect(computeAverageMargin([null, null, null])).toBeNull()
  })

  test('single non-null value → that value', () => {
    expect(computeAverageMargin([30])).toBeCloseTo(30)
  })

  test('multiple values: avg of [10, 20, 30] = 20', () => {
    expect(computeAverageMargin([10, 20, 30])).toBeCloseTo(20)
  })

  test('skips null values: avg of [10, null, 30] = 20', () => {
    expect(computeAverageMargin([10, null, 30])).toBeCloseTo(20)
  })

  test('negative values: avg of [-10, 10] = 0', () => {
    expect(computeAverageMargin([-10, 10])).toBeCloseTo(0)
  })

  test('single null with values: avg of [null, 40] = 40', () => {
    expect(computeAverageMargin([null, 40])).toBeCloseTo(40)
  })

  test('large array with all same value', () => {
    const arr = Array(12).fill(25) as number[]
    expect(computeAverageMargin(arr)).toBeCloseTo(25)
  })
})

// ── generateMarginNarrative ───────────────────────────────────────────────────

describe('generateMarginNarrative', () => {
  const allNarrativeArgs = (
    health: Parameters<typeof generateMarginNarrative>[0],
    trend: Parameters<typeof generateMarginNarrative>[1],
  ) => generateMarginNarrative(health, trend, 30, 8, 2)

  test('returns a non-empty string', () => {
    const result = allNarrativeArgs('adequate', 'stable')
    expect(result).toBeTruthy()
    expect(result.length).toBeGreaterThan(5)
  })

  test('excellent + expanding: specific text', () => {
    const result = generateMarginNarrative('excellent', 'expanding', 55, 20, 27)
    expect(result).toContain('mükemmel')
    expect(result).toContain('genişliyor')
  })

  test('negative health: mentions negatif', () => {
    const result = generateMarginNarrative('negative', 'contracting', 5, -5, -23)
    expect(result.toLowerCase()).toContain('negatif')
  })

  test('negative health: urgent language', () => {
    const result = generateMarginNarrative('negative', 'stable', 5, -2, -23)
    expect(result).toBeTruthy()
    expect(result.length).toBeGreaterThan(10)
  })

  test('insufficient_data: mentions yeterli or veri', () => {
    const result = generateMarginNarrative('insufficient_data', 'insufficient_data', null, null, null)
    expect(result.toLowerCase()).toMatch(/yeterli|veri/)
  })

  test('thin + contracting: mentions incel or baskı', () => {
    const result = generateMarginNarrative('thin', 'contracting', 12, 1, -16)
    expect(result).toBeTruthy()
    expect(result.length).toBeGreaterThan(10)
  })

  test('adequate + stable: mentions yeterli and stabil', () => {
    const result = generateMarginNarrative('adequate', 'stable', 25, 5, -3)
    expect(result).toContain('yeterli')
    expect(result).toContain('stabil')
  })

  test('excellent + contracting: mentions mükemmel and daralma', () => {
    const result = generateMarginNarrative('excellent', 'contracting', 55, 18, 27)
    expect(result).toContain('mükemmel')
    expect(result.toLowerCase()).toMatch(/daral/)
  })

  test('benchmark gap positive: mentions puan üzerinde', () => {
    const result = generateMarginNarrative('strong', 'expanding', 40, 12, 12)
    expect(result).toContain('üzerinde')
  })

  test('benchmark gap negative: mentions puan altında', () => {
    const result = generateMarginNarrative('thin', 'stable', 15, 2, -13)
    expect(result).toContain('altında')
  })

  test('null benchmark gap: no gap text', () => {
    const result = generateMarginNarrative('adequate', 'stable', 25, 5, null)
    // Should not crash and should return Turkish text
    expect(result).toBeTruthy()
    expect(result).not.toContain('puan')
  })

  test('volatile trend: mentions dalgalı', () => {
    const result = generateMarginNarrative('adequate', 'volatile', 25, 4, -3)
    expect(result.toLowerCase()).toContain('dalgalı')
  })

  test('strong + stable: returns meaningful text', () => {
    const result = generateMarginNarrative('strong', 'stable', 38, 10, 10)
    expect(result).toBeTruthy()
    expect(result.length).toBeGreaterThan(10)
  })

  test('thin + volatile: mentions ince and dalgalı', () => {
    const result = generateMarginNarrative('thin', 'volatile', 12, 2, -16)
    expect(result.toLowerCase()).toMatch(/ince|dalgalı/)
  })

  test('all health levels produce non-empty strings', () => {
    const healths: Parameters<typeof generateMarginNarrative>[0][] = [
      'excellent', 'strong', 'adequate', 'thin', 'negative', 'insufficient_data',
    ]
    for (const h of healths) {
      const result = generateMarginNarrative(h, 'stable', 25, 5, -3)
      expect(result.length).toBeGreaterThan(5)
    }
  })

  test('all trend directions produce non-empty strings', () => {
    const trends: Parameters<typeof generateMarginNarrative>[1][] = [
      'expanding', 'contracting', 'volatile', 'stable', 'insufficient_data',
    ]
    for (const t of trends) {
      const result = generateMarginNarrative('adequate', t, 25, 5, -3)
      expect(result.length).toBeGreaterThan(5)
    }
  })
})
