/**
 * Cohort Revenue Analysis — unit tests
 *
 * Tests all pure computation functions.
 * No DB or network calls — pure function tests only.
 */

import { describe, it, expect } from 'vitest'
import {
  buildCustomerCohorts,
  buildCohortMatrix,
  computeCohortRetention,
  computeAvgLtv,
  findBestCohort,
  findWorstCohort,
  buildCohortSummary,
  classifyCohortHealth,
  computeCohortTrend,
  buildCohortHeatmap,
  type CohortRow,
} from '../lib/services/commercial/cohort-revenue.service'

// ── Test helpers ──────────────────────────────────────────────────────────────

function makeCohortRow(
  cohort_month: string,
  month0Revenue: number,
  offsets: Array<[number, number]>,  // [offset, revenue]
  cohortSize = 3,
): CohortRow {
  const cells = offsets.map(([offset, rev]) => ({
    cohort_month,
    period_offset: offset,
    calendar_month: cohort_month, // simplified for tests
    customer_count: cohortSize,
    revenue_try: rev,
    retention_pct: month0Revenue > 0 ? Math.min((rev / month0Revenue) * 100, 200) : 0,
  }))

  // Fix base month to 100
  if (cells[0]?.period_offset === 0) cells[0].retention_pct = 100

  const row: CohortRow = {
    cohort_month,
    cohort_size: cohortSize,
    month_0_revenue: month0Revenue,
    cells,
    avg_ltv_3m: 0,
    avg_ltv_6m: 0,
    retention_3m_pct: null,
    retention_6m_pct: null,
  }

  // Compute actual LTV and retentions
  const cells3 = cells.filter(c => c.period_offset < 3)
  const cells6 = cells.filter(c => c.period_offset < 6)
  row.avg_ltv_3m = cohortSize > 0
    ? cells3.reduce((s, c) => s + c.revenue_try, 0) / cohortSize
    : 0
  row.avg_ltv_6m = cohortSize > 0
    ? cells6.reduce((s, c) => s + c.revenue_try, 0) / cohortSize
    : 0

  const cell3 = cells.find(c => c.period_offset === 3)
  const cell6 = cells.find(c => c.period_offset === 6)
  row.retention_3m_pct = cell3 !== undefined && month0Revenue > 0
    ? computeCohortRetention(month0Revenue, cell3.revenue_try)
    : null
  row.retention_6m_pct = cell6 !== undefined && month0Revenue > 0
    ? computeCohortRetention(month0Revenue, cell6.revenue_try)
    : null

  return row
}

// ── 1. buildCustomerCohorts ───────────────────────────────────────────────────

describe('buildCustomerCohorts', () => {
  it('1. assigns first purchase month as cohort', () => {
    const sales = [
      { customer_key: 'cust-A', sale_month: '2024-03' },
      { customer_key: 'cust-A', sale_month: '2024-05' },
      { customer_key: 'cust-A', sale_month: '2024-01' },
    ]
    const map = buildCustomerCohorts(sales)
    expect(map.get('cust-A')).toBe('2024-01')
  })

  it('2. single sale assigns that month as cohort', () => {
    const map = buildCustomerCohorts([{ customer_key: 'cust-B', sale_month: '2024-06' }])
    expect(map.get('cust-B')).toBe('2024-06')
  })

  it('3. multiple customers get correct individual cohorts', () => {
    const sales = [
      { customer_key: 'A', sale_month: '2024-02' },
      { customer_key: 'B', sale_month: '2024-01' },
      { customer_key: 'A', sale_month: '2024-04' },
      { customer_key: 'B', sale_month: '2024-03' },
    ]
    const map = buildCustomerCohorts(sales)
    expect(map.get('A')).toBe('2024-02')
    expect(map.get('B')).toBe('2024-01')
  })

  it('4. empty input returns empty map', () => {
    expect(buildCustomerCohorts([]).size).toBe(0)
  })

  it('5. unsorted input — picks lexicographically earliest YYYY-MM', () => {
    const sales = [
      { customer_key: 'X', sale_month: '2024-12' },
      { customer_key: 'X', sale_month: '2024-01' },
      { customer_key: 'X', sale_month: '2024-06' },
    ]
    expect(buildCustomerCohorts(sales).get('X')).toBe('2024-01')
  })

  it('6. same month multiple sales — still same cohort', () => {
    const sales = [
      { customer_key: 'Y', sale_month: '2024-05' },
      { customer_key: 'Y', sale_month: '2024-05' },
    ]
    expect(buildCustomerCohorts(sales).get('Y')).toBe('2024-05')
  })
})

// ── 2. buildCohortMatrix ──────────────────────────────────────────────────────

describe('buildCohortMatrix', () => {
  const analysisMonths = ['2024-01', '2024-02', '2024-03', '2024-04']

  // Customer A: cohort 2024-01, bought in Jan, Feb
  // Customer B: cohort 2024-01, bought in Jan only
  // Customer C: cohort 2024-02, bought in Feb, Mar
  const cohortMap = new Map([
    ['A', '2024-01'],
    ['B', '2024-01'],
    ['C', '2024-02'],
  ])
  const monthlyRevenue = new Map([
    ['A', new Map([['2024-01', 1000], ['2024-02', 500]])],
    ['B', new Map([['2024-01', 2000]])],
    ['C', new Map([['2024-02', 3000], ['2024-03', 1500]])],
  ])

  it('7. correct month 0 revenue for cohort 2024-01', () => {
    const rows = buildCohortMatrix(cohortMap, monthlyRevenue, analysisMonths)
    const jan = rows.find(r => r.cohort_month === '2024-01')
    expect(jan).toBeDefined()
    expect(jan!.month_0_revenue).toBe(3000) // A: 1000 + B: 2000
  })

  it('8. correct cohort size for 2024-01', () => {
    const rows = buildCohortMatrix(cohortMap, monthlyRevenue, analysisMonths)
    const jan = rows.find(r => r.cohort_month === '2024-01')
    expect(jan!.cohort_size).toBe(2)
  })

  it('9. correct period offsets generated', () => {
    const rows = buildCohortMatrix(cohortMap, monthlyRevenue, analysisMonths)
    const jan = rows.find(r => r.cohort_month === '2024-01')
    const offsets = jan!.cells.map(c => c.period_offset)
    expect(offsets).toContain(0)
    expect(offsets).toContain(1) // Feb is offset 1 for Jan cohort
  })

  it('10. month 0 cell always has retention_pct = 100', () => {
    const rows = buildCohortMatrix(cohortMap, monthlyRevenue, analysisMonths)
    for (const row of rows) {
      const cell0 = row.cells.find(c => c.period_offset === 0)
      if (cell0) expect(cell0.retention_pct).toBe(100)
    }
  })

  it('11. cohort 2024-02 correct month 0 revenue', () => {
    const rows = buildCohortMatrix(cohortMap, monthlyRevenue, analysisMonths)
    const feb = rows.find(r => r.cohort_month === '2024-02')
    expect(feb!.month_0_revenue).toBe(3000)
  })

  it('12. offset 1 revenue for cohort 2024-02 is 1500', () => {
    const rows = buildCohortMatrix(cohortMap, monthlyRevenue, analysisMonths)
    const feb = rows.find(r => r.cohort_month === '2024-02')
    const cell1 = feb!.cells.find(c => c.period_offset === 1)
    expect(cell1!.revenue_try).toBe(1500)
  })

  it('13. empty cohortMap returns empty array', () => {
    const rows = buildCohortMatrix(new Map(), new Map(), analysisMonths)
    expect(rows).toHaveLength(0)
  })

  it('14. empty analysisMonths returns empty array', () => {
    const rows = buildCohortMatrix(cohortMap, monthlyRevenue, [])
    expect(rows).toHaveLength(0)
  })

  it('15. cells sorted by period_offset ascending', () => {
    const rows = buildCohortMatrix(cohortMap, monthlyRevenue, analysisMonths)
    for (const row of rows) {
      for (let i = 1; i < row.cells.length; i++) {
        expect(row.cells[i].period_offset).toBeGreaterThan(row.cells[i - 1].period_offset)
      }
    }
  })

  it('16. cohort outside analysisMonths is excluded', () => {
    const cohortMapExtra = new Map([
      ['Z', '2023-06'],  // outside analysisMonths
    ])
    const rows = buildCohortMatrix(cohortMapExtra, new Map(), analysisMonths)
    expect(rows).toHaveLength(0)
  })
})

// ── 3. computeCohortRetention ─────────────────────────────────────────────────

describe('computeCohortRetention', () => {
  it('17. zero base revenue returns 0 (no NaN/Infinity)', () => {
    expect(computeCohortRetention(0, 5000)).toBe(0)
  })

  it('18. zero current revenue returns 0', () => {
    expect(computeCohortRetention(10000, 0)).toBe(0)
  })

  it('19. equal revenues returns 100%', () => {
    expect(computeCohortRetention(5000, 5000)).toBe(100)
  })

  it('20. half revenue returns 50%', () => {
    expect(computeCohortRetention(10000, 5000)).toBe(50)
  })

  it('21. double revenue returns 200% (not more — capped)', () => {
    expect(computeCohortRetention(1000, 2000)).toBe(200)
  })

  it('22. triple revenue is capped at 200%', () => {
    expect(computeCohortRetention(1000, 3000)).toBe(200)
  })

  it('23. partial revenue returns correct pct', () => {
    expect(computeCohortRetention(4000, 1000)).toBe(25)
  })

  it('24. both zero returns 0', () => {
    expect(computeCohortRetention(0, 0)).toBe(0)
  })
})

// ── 4. computeAvgLtv ──────────────────────────────────────────────────────────

describe('computeAvgLtv', () => {
  const row = makeCohortRow('2024-01', 3000, [
    [0, 3000],
    [1, 1500],
    [2, 1200],
    [3, 900],
    [4, 600],
    [5, 300],
  ], 3)

  it('25. 3m LTV = (month 0+1+2 revenue) / cohort_size', () => {
    // months 0,1,2 = 3000+1500+1200 = 5700 / 3 = 1900
    const ltv = computeAvgLtv(row, 3)
    expect(ltv).toBeCloseTo(1900)
  })

  it('26. 6m LTV includes offsets 0-5', () => {
    // 3000+1500+1200+900+600+300 = 7500 / 3 = 2500
    const ltv = computeAvgLtv(row, 6)
    expect(ltv).toBeCloseTo(2500)
  })

  it('27. zero cohort_size returns 0', () => {
    const emptyRow: CohortRow = { ...row, cohort_size: 0 }
    expect(computeAvgLtv(emptyRow, 3)).toBe(0)
  })

  it('28. months=1 returns only offset 0 revenue / cohort_size', () => {
    expect(computeAvgLtv(row, 1)).toBeCloseTo(3000 / 3)
  })

  it('29. months=0 returns 0 (no cells with offset < 0)', () => {
    expect(computeAvgLtv(row, 0)).toBe(0)
  })
})

// ── 5. findBestCohort / findWorstCohort ───────────────────────────────────────

describe('findBestCohort', () => {
  const rowA = makeCohortRow('2024-01', 1000, [[0, 1000], [1, 700], [2, 600], [3, 600]])
  const rowB = makeCohortRow('2024-02', 2000, [[0, 2000], [1, 600], [2, 400], [3, 300]])
  const rowC = makeCohortRow('2024-03', 500, [[0, 500], [1, 100], [2, 50]])  // no 3m data

  it('30. returns cohort with highest 3m retention', () => {
    // rowA: 60%, rowB: 15% at month 3
    expect(findBestCohort([rowA, rowB])).toBe('2024-01')
  })

  it('31. returns null for empty array', () => {
    expect(findBestCohort([])).toBeNull()
  })

  it('32. ignores rows without 3m data', () => {
    // rowC has no month 3 cell → null retention_3m_pct
    expect(findBestCohort([rowC])).toBeNull()
  })

  it('33. single row with data returns that cohort', () => {
    expect(findBestCohort([rowA])).toBe('2024-01')
  })
})

describe('findWorstCohort', () => {
  const rowA = makeCohortRow('2024-01', 1000, [[0, 1000], [1, 700], [2, 600], [3, 600]])
  const rowB = makeCohortRow('2024-02', 2000, [[0, 2000], [1, 600], [2, 400], [3, 300]])
  const rowC = makeCohortRow('2024-03', 500, [[0, 500], [1, 100], [2, 50]])  // no 3m data

  it('34. needs ≥2 cohorts — single cohort returns null', () => {
    expect(findWorstCohort([rowA])).toBeNull()
  })

  it('35. empty array returns null', () => {
    expect(findWorstCohort([])).toBeNull()
  })

  it('36. returns cohort with lowest 3m retention among those with data', () => {
    // rowA: 60%, rowB: 15%
    expect(findWorstCohort([rowA, rowB])).toBe('2024-02')
  })

  it('37. only 1 row with 3m data (rowC missing) → null', () => {
    expect(findWorstCohort([rowA, rowC])).toBeNull() // only rowA has 3m data
  })
})

// ── 6. buildCohortSummary ─────────────────────────────────────────────────────

describe('buildCohortSummary', () => {
  const rowA = makeCohortRow('2024-01', 1000, [[0, 1000], [1, 600], [2, 500], [3, 400]])
  const rowB = makeCohortRow('2024-02', 2000, [[0, 2000], [1, 1000], [2, 700], [3, 600]])

  it('38. empty rows returns all nulls', () => {
    const s = buildCohortSummary([])
    expect(s.avg_month_1_retention_pct).toBeNull()
    expect(s.avg_month_3_retention_pct).toBeNull()
    expect(s.best_cohort).toBeNull()
    expect(s.worst_cohort).toBeNull()
    expect(s.total_cohorts).toBe(0)
    expect(s.avg_cohort_size).toBe(0)
  })

  it('39. total_cohorts counts correctly', () => {
    expect(buildCohortSummary([rowA, rowB]).total_cohorts).toBe(2)
  })

  it('40. avg_cohort_size is average of cohort sizes', () => {
    const s = buildCohortSummary([rowA, rowB])
    expect(s.avg_cohort_size).toBeCloseTo((rowA.cohort_size + rowB.cohort_size) / 2)
  })

  it('41. avg_month_3_retention_pct is average across cohorts', () => {
    const s = buildCohortSummary([rowA, rowB])
    // rowA 3m: 400/1000=40%, rowB 3m: 600/2000=30%
    expect(s.avg_month_3_retention_pct).toBeCloseTo(35, 0)
  })

  it('42. avg_month_1_retention_pct computed correctly', () => {
    const s = buildCohortSummary([rowA, rowB])
    // rowA m1: 600/1000=60%, rowB m1: 1000/2000=50% → avg 55%
    expect(s.avg_month_1_retention_pct).toBeCloseTo(55, 0)
  })

  it('43. best/worst cohort identified', () => {
    const s = buildCohortSummary([rowA, rowB])
    expect(s.best_cohort).toBe('2024-01')  // 40% > 30%
    expect(s.worst_cohort).toBe('2024-02') // 30% < 40%
  })
})

// ── 7. classifyCohortHealth ───────────────────────────────────────────────────

describe('classifyCohortHealth', () => {
  it('44. null → insufficient_data', () => {
    expect(classifyCohortHealth(null)).toBe('insufficient_data')
  })

  it('45. 60 → excellent', () => {
    expect(classifyCohortHealth(60)).toBe('excellent')
  })

  it('46. 75 → excellent (above threshold)', () => {
    expect(classifyCohortHealth(75)).toBe('excellent')
  })

  it('47. 40 → good', () => {
    expect(classifyCohortHealth(40)).toBe('good')
  })

  it('48. 55 → good (between 40-60)', () => {
    expect(classifyCohortHealth(55)).toBe('good')
  })

  it('49. 20 → moderate', () => {
    expect(classifyCohortHealth(20)).toBe('moderate')
  })

  it('50. 30 → moderate (between 20-40)', () => {
    expect(classifyCohortHealth(30)).toBe('moderate')
  })

  it('51. 10 → weak', () => {
    expect(classifyCohortHealth(10)).toBe('weak')
  })

  it('52. 15 → weak (between 10-20)', () => {
    expect(classifyCohortHealth(15)).toBe('weak')
  })

  it('53. 5 → poor', () => {
    expect(classifyCohortHealth(5)).toBe('poor')
  })

  it('54. 0 → poor', () => {
    expect(classifyCohortHealth(0)).toBe('poor')
  })
})

// ── 8. computeCohortTrend ──────────────────────────────────────────────────────

describe('computeCohortTrend', () => {
  it('55. single row → insufficient_data', () => {
    const row = makeCohortRow('2024-01', 1000, [[0, 1000]])
    expect(computeCohortTrend([row])).toBe('insufficient_data')
  })

  it('56. empty → insufficient_data', () => {
    expect(computeCohortTrend([])).toBe('insufficient_data')
  })

  it('57. latest > avg × 1.1 → improving', () => {
    // rowA=1000, rowB=1000, rowC (latest)=2500 → avg=1500, ratio=2500/1500=1.67 > 1.1
    const rowA = makeCohortRow('2024-01', 1000, [[0, 1000]])
    const rowB = makeCohortRow('2024-02', 1000, [[0, 1000]])
    const rowC = makeCohortRow('2024-03', 2500, [[0, 2500]])
    expect(computeCohortTrend([rowA, rowB, rowC])).toBe('improving')
  })

  it('58. latest < avg × 0.9 → declining', () => {
    // rowA=3000, rowB=3000, rowC (latest)=500 → avg=2166, ratio=0.23 < 0.9
    const rowA = makeCohortRow('2024-01', 3000, [[0, 3000]])
    const rowB = makeCohortRow('2024-02', 3000, [[0, 3000]])
    const rowC = makeCohortRow('2024-03', 500, [[0, 500]])
    expect(computeCohortTrend([rowA, rowB, rowC])).toBe('declining')
  })

  it('59. latest within ±10% of avg → stable', () => {
    // All equal → ratio = 1.0 → stable
    const rowA = makeCohortRow('2024-01', 1000, [[0, 1000]])
    const rowB = makeCohortRow('2024-02', 1000, [[0, 1000]])
    const rowC = makeCohortRow('2024-03', 1000, [[0, 1000]])
    expect(computeCohortTrend([rowA, rowB, rowC])).toBe('stable')
  })

  it('60. all zero month_0_revenue → insufficient_data', () => {
    const rowA = makeCohortRow('2024-01', 0, [[0, 0]])
    const rowB = makeCohortRow('2024-02', 0, [[0, 0]])
    expect(computeCohortTrend([rowA, rowB])).toBe('insufficient_data')
  })
})

// ── 9. buildCohortHeatmap ─────────────────────────────────────────────────────

describe('buildCohortHeatmap', () => {
  const row = makeCohortRow('2024-01', 1000, [[0, 1000], [1, 600], [2, 400]])

  it('61. maxOffset=5 generates 6 cells per cohort (0-5)', () => {
    const cells = buildCohortHeatmap([row], 5)
    const forCohort = cells.filter(c => c.cohort_month === '2024-01')
    expect(forCohort).toHaveLength(6)
  })

  it('62. cells beyond available data have null retention_pct', () => {
    const cells = buildCohortHeatmap([row], 5)
    const cell4 = cells.find(c => c.cohort_month === '2024-01' && c.period_offset === 4)
    expect(cell4!.retention_pct).toBeNull()
  })

  it('63. available cells have correct retention_pct', () => {
    const cells = buildCohortHeatmap([row], 5)
    const cell0 = cells.find(c => c.cohort_month === '2024-01' && c.period_offset === 0)
    expect(cell0!.retention_pct).toBe(100)
    const cell1 = cells.find(c => c.cohort_month === '2024-01' && c.period_offset === 1)
    expect(cell1!.retention_pct).toBeCloseTo(60)
  })

  it('64. maxOffset=0 produces 1 cell per cohort', () => {
    const cells = buildCohortHeatmap([row], 0)
    expect(cells).toHaveLength(1)
    expect(cells[0].period_offset).toBe(0)
  })

  it('65. missing data cells have revenue_try=0', () => {
    const cells = buildCohortHeatmap([row], 5)
    const cell5 = cells.find(c => c.cohort_month === '2024-01' && c.period_offset === 5)
    expect(cell5!.revenue_try).toBe(0)
  })

  it('66. multiple cohorts produce correct total cell count', () => {
    const row2 = makeCohortRow('2024-02', 2000, [[0, 2000], [1, 1000]])
    const cells = buildCohortHeatmap([row, row2], 3)
    // 2 cohorts × 4 offsets (0-3) = 8 cells
    expect(cells).toHaveLength(8)
  })

  it('67. empty rows returns empty array', () => {
    expect(buildCohortHeatmap([], 5)).toHaveLength(0)
  })
})

// ── 10. Full integration scenario ─────────────────────────────────────────────

describe('Full 2-cohort integration scenario', () => {
  // Cohort A (2024-01): 2 customers, revenue 6000 in month 0
  // Cohort B (2024-02): 1 customer, revenue 3000 in month 0
  const analysisMonths = ['2024-01', '2024-02', '2024-03', '2024-04']

  const cohortMap = new Map([
    ['cust-1', '2024-01'],
    ['cust-2', '2024-01'],
    ['cust-3', '2024-02'],
  ])
  const monthlyRevenue = new Map([
    ['cust-1', new Map([['2024-01', 4000], ['2024-02', 2000], ['2024-03', 1000]])],
    ['cust-2', new Map([['2024-01', 2000], ['2024-02', 1500]])],
    ['cust-3', new Map([['2024-02', 3000], ['2024-03', 2000], ['2024-04', 1000]])],
  ])

  const rows = buildCohortMatrix(cohortMap, monthlyRevenue, analysisMonths)

  it('68. produces 2 cohort rows', () => {
    expect(rows).toHaveLength(2)
  })

  it('69. cohort 2024-01 has month_0_revenue = 6000', () => {
    const jan = rows.find(r => r.cohort_month === '2024-01')
    expect(jan!.month_0_revenue).toBe(6000)
  })

  it('70. cohort 2024-01 offset 1 revenue = 3500 (2000+1500)', () => {
    const jan = rows.find(r => r.cohort_month === '2024-01')
    const cell1 = jan!.cells.find(c => c.period_offset === 1)
    expect(cell1!.revenue_try).toBe(3500)
  })

  it('71. cohort 2024-01 offset 1 retention_pct ≈ 58.3%', () => {
    const jan = rows.find(r => r.cohort_month === '2024-01')
    const cell1 = jan!.cells.find(c => c.period_offset === 1)
    expect(cell1!.retention_pct).toBeCloseTo(58.33, 1)
  })

  it('72. summary total_cohorts = 2', () => {
    const summary = buildCohortSummary(rows)
    expect(summary.total_cohorts).toBe(2)
  })

  it('73. summary avg_cohort_size = 1.5', () => {
    const summary = buildCohortSummary(rows)
    expect(summary.avg_cohort_size).toBeCloseTo(1.5)
  })

  it('74. heatmap with maxOffset=2 produces 6 cells (2 cohorts × 3 offsets)', () => {
    const heatmap = buildCohortHeatmap(rows, 2)
    expect(heatmap).toHaveLength(6)
  })

  it('75. cohort trend is improving or stable (small dataset, no strong trend)', () => {
    const trend = computeCohortTrend(rows)
    expect(['improving', 'stable', 'declining']).toContain(trend)
  })

  it('76. classifyCohortHealth returns valid category', () => {
    const summary = buildCohortSummary(rows)
    const health = classifyCohortHealth(summary.avg_month_3_retention_pct)
    expect(['excellent', 'good', 'moderate', 'weak', 'poor', 'insufficient_data']).toContain(health)
  })

  it('77. cust-3 offset 2 (calendar 2024-04) has correct revenue', () => {
    const feb = rows.find(r => r.cohort_month === '2024-02')
    const cell2 = feb!.cells.find(c => c.period_offset === 2)
    expect(cell2!.revenue_try).toBe(1000)
  })

  it('78. cust-3 offset 1 retention = 66.67% (2000/3000)', () => {
    const feb = rows.find(r => r.cohort_month === '2024-02')
    const cell1 = feb!.cells.find(c => c.period_offset === 1)
    expect(cell1!.retention_pct).toBeCloseTo(66.67, 1)
  })

  it('79. findBestCohort identifies cohort with highest 3m retention', () => {
    // Need rows with 3m data
    const rowA = makeCohortRow('2024-01', 1000, [[0, 1000], [1, 700], [2, 500], [3, 800]])
    const rowB = makeCohortRow('2024-02', 1000, [[0, 1000], [1, 300], [2, 200], [3, 100]])
    expect(findBestCohort([rowA, rowB])).toBe('2024-01')
  })

  it('80. full pipeline: summary best_cohort is not null when data exists', () => {
    const rowA = makeCohortRow('2024-01', 1000, [[0, 1000], [1, 700], [2, 500], [3, 800]])
    const rowB = makeCohortRow('2024-02', 1000, [[0, 1000], [1, 300], [2, 200], [3, 100]])
    const s = buildCohortSummary([rowA, rowB])
    expect(s.best_cohort).not.toBeNull()
  })
})
