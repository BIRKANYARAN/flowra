/**
 * Expense Anomaly Detection — pure function unit tests
 *
 * Tests all exported pure helpers from:
 *   lib/services/finance/expense-anomaly.service.ts
 *
 * Run with: npx vitest run tests/expense-anomaly.test.ts
 */

import { describe, it, expect } from 'vitest'
import {
  computeZScore,
  computeDeviationPct,
  classifyAnomaly,
  buildAnomalyDescription,
  computePopulationStdDev,
} from '../lib/services/finance/expense-anomaly.service'

// ── computeZScore ─────────────────────────────────────────────────────────────

describe('computeZScore', () => {
  it('1. normal z-score: (150 - 100) / 25 = 2', () => {
    expect(computeZScore(150, 100, 25)).toBeCloseTo(2, 5)
  })

  it('2. stddev = 0 → null', () => {
    expect(computeZScore(100, 100, 0)).toBeNull()
  })

  it('3. negative z-score: (50 - 100) / 25 = -2', () => {
    expect(computeZScore(50, 100, 25)).toBeCloseTo(-2, 5)
  })

  it('4. value equals mean → z-score = 0', () => {
    expect(computeZScore(100, 100, 10)).toBeCloseTo(0, 5)
  })

  it('5. large deviation: (1000 - 100) / 100 = 9', () => {
    expect(computeZScore(1000, 100, 100)).toBeCloseTo(9, 5)
  })
})

// ── computeDeviationPct ───────────────────────────────────────────────────────

describe('computeDeviationPct', () => {
  it('6. normal: (150 - 100) / 100 × 100 = 50%', () => {
    expect(computeDeviationPct(150, 100)).toBeCloseTo(50, 5)
  })

  it('7. zero baseline → 0', () => {
    expect(computeDeviationPct(999, 0)).toBe(0)
  })

  it('8. negative deviation: (50 - 100) / 100 × 100 = -50%', () => {
    expect(computeDeviationPct(50, 100)).toBeCloseTo(-50, 5)
  })

  it('9. value equals baseline → 0%', () => {
    expect(computeDeviationPct(200, 200)).toBeCloseTo(0, 5)
  })

  it('10. more than double → 100%', () => {
    expect(computeDeviationPct(200, 100)).toBeCloseTo(100, 5)
  })
})

// ── classifyAnomaly ───────────────────────────────────────────────────────────

describe('classifyAnomaly', () => {
  it('11. high: |zscore| > 2 → high', () => {
    expect(classifyAnomaly(2.5, 30)).toBe('high')
  })

  it('12. high: deviation > 100% → high (even with null zscore)', () => {
    expect(classifyAnomaly(null, 150)).toBe('high')
  })

  it('13. medium: |zscore| > 1.5 but ≤ 2 → medium', () => {
    expect(classifyAnomaly(1.8, 30)).toBe('medium')
  })

  it('14. medium: deviation > 50% but ≤ 100% with null zscore → medium', () => {
    expect(classifyAnomaly(null, 75)).toBe('medium')
  })

  it('15. low: deviation > 25% but ≤ 50% with null zscore → low', () => {
    expect(classifyAnomaly(null, 30)).toBe('low')
  })

  it('16. null: below threshold — deviation < 25% and zscore < 1.5 → null', () => {
    expect(classifyAnomaly(1.0, 10)).toBeNull()
  })

  it('17. null: zscore null and deviation < 25% → null', () => {
    expect(classifyAnomaly(null, 20)).toBeNull()
  })

  it('18. high: negative zscore with |value| > 2 → high', () => {
    expect(classifyAnomaly(-2.5, 30)).toBe('high')
  })

  it('19. medium: negative zscore with |value| > 1.5 → medium', () => {
    expect(classifyAnomaly(-1.8, 30)).toBe('medium')
  })
})

// ── buildAnomalyDescription ───────────────────────────────────────────────────

describe('buildAnomalyDescription', () => {
  it('20. spike with positive deviation contains expense type label', () => {
    const desc = buildAnomalyDescription('software', 150, 'spike')
    // 'software' maps to 'Yazılım'
    expect(desc).toContain('Yazılım')
    expect(desc).toContain('üzerinde')
  })

  it('21. new_vendor message mentions yeni tedarikçi', () => {
    const desc = buildAnomalyDescription('marketing', 0, 'new_vendor')
    expect(desc.toLowerCase()).toContain('tedarikçi')
  })

  it('22. unusual_category message mentions category label', () => {
    const desc = buildAnomalyDescription('rent', 0, 'unusual_category')
    expect(desc).toContain('Kira')
    expect(desc).toContain('görülmemişti')
  })

  it('23. duplicate_suspect message mentions kopya', () => {
    const desc = buildAnomalyDescription('salary', 0, 'duplicate_suspect')
    expect(desc.toLowerCase()).toContain('kopya')
  })

  it('24. spike with unknown expense type uses type key in message', () => {
    const desc = buildAnomalyDescription('custom_type_xyz', 60, 'spike')
    expect(desc).toContain('custom_type_xyz')
  })
})

// ── computePopulationStdDev ───────────────────────────────────────────────────

describe('computePopulationStdDev', () => {
  it('25. single value → null', () => {
    expect(computePopulationStdDev([100])).toBeNull()
  })

  it('26. empty array → null', () => {
    expect(computePopulationStdDev([])).toBeNull()
  })

  it('27. two identical values → 0', () => {
    expect(computePopulationStdDev([100, 100])).toBe(0)
  })

  it('28. known stddev: [2, 4, 4, 4, 5, 5, 7, 9] → 2', () => {
    // population stddev = 2
    const result = computePopulationStdDev([2, 4, 4, 4, 5, 5, 7, 9])
    expect(result).toBeCloseTo(2, 5)
  })

  it('29. two values [0, 10] → stddev = 5', () => {
    // mean = 5, variance = (25 + 25) / 2 = 25, stddev = 5
    const result = computePopulationStdDev([0, 10])
    expect(result).toBeCloseTo(5, 5)
  })

  it('30. three values [1, 2, 3] → stddev ≈ 0.816', () => {
    // mean = 2, variance = (1 + 0 + 1) / 3 ≈ 0.6667, stddev ≈ 0.8165
    const result = computePopulationStdDev([1, 2, 3])
    expect(result).toBeCloseTo(0.8165, 3)
  })
})
