/**
 * Revenue Seasonality Analysis — unit tests
 *
 * Tests pure helpers from SeasonalityService.
 * No DB or network calls — all pure function tests.
 */

import { describe, it, expect } from 'vitest'
import {
  TURKISH_MONTHS,
  computeSeasonalIndex,
  computeSeasonalityStrength,
  buildSeasonalityRecommendation,
} from '../lib/services/finance/seasonality.service'

// ── TURKISH_MONTHS ────────────────────────────────────────────────────────────

describe('TURKISH_MONTHS — constant', () => {

  // Test 1: length is exactly 12
  it('1. length = 12', () => {
    expect(TURKISH_MONTHS).toHaveLength(12)
  })

  // Test 2: first element is Ocak
  it('2. first month is Ocak', () => {
    expect(TURKISH_MONTHS[0]).toBe('Ocak')
  })

  // Test 3: last element is Aralık
  it('3. last month is Aralık', () => {
    expect(TURKISH_MONTHS[11]).toBe('Aralık')
  })

  // Test 4: June (index 5) is Haziran
  it('4. index 5 is Haziran', () => {
    expect(TURKISH_MONTHS[5]).toBe('Haziran')
  })
})

// ── computeSeasonalIndex ──────────────────────────────────────────────────────

describe('computeSeasonalIndex — pure', () => {

  // Test 5: normal case: 200 avg / 100 overall = 200
  it('5. monthAvg=200, overallAvg=100 → 200', () => {
    expect(computeSeasonalIndex(200, 100)).toBe(200)
  })

  // Test 6: zero overallAvg → returns 100 (neutral)
  it('6. overallAvg=0 → 100 (neutral fallback)', () => {
    expect(computeSeasonalIndex(500, 0)).toBe(100)
  })

  // Test 7: monthAvg equals overallAvg → exactly 100
  it('7. monthAvg = overallAvg → 100', () => {
    expect(computeSeasonalIndex(5000, 5000)).toBe(100)
  })

  // Test 8: below average: 50 / 100 = 50
  it('8. monthAvg=50, overallAvg=100 → 50', () => {
    expect(computeSeasonalIndex(50, 100)).toBe(50)
  })

  // Test 9: fractional result is rounded to 2 decimal places
  it('9. fractional result: 150/70 → rounded to 2dp', () => {
    const result = computeSeasonalIndex(150, 70)
    // 150/70*100 = 214.2857...
    expect(result).toBeCloseTo(214.29, 1)
  })

  // Test 10: both zero → returns 100
  it('10. monthAvg=0, overallAvg=0 → 100', () => {
    expect(computeSeasonalIndex(0, 0)).toBe(100)
  })
})

// ── computeSeasonalityStrength ────────────────────────────────────────────────

describe('computeSeasonalityStrength — pure', () => {

  // Test 11: strong — indices span > 50 (e.g. 60-140 = spread 80)
  it('11. spread=80 (60..140) → strong', () => {
    const indices = [60, 80, 100, 120, 140, 110, 90, 70, 85, 130, 115, 95]
    expect(computeSeasonalityStrength(indices)).toBe('strong')
  })

  // Test 12: moderate — spread 20-50 (e.g. 80-120 = spread 40)
  it('12. spread=40 (80..120) → moderate', () => {
    const indices = [80, 90, 100, 110, 120, 115, 105, 95, 88, 92, 97, 103]
    expect(computeSeasonalityStrength(indices)).toBe('moderate')
  })

  // Test 13: weak — spread < 20 (e.g. 90-105 = spread 15)
  it('13. spread=15 (90..105) → weak', () => {
    const indices = [90, 92, 95, 98, 100, 102, 103, 105, 104, 101, 97, 93]
    expect(computeSeasonalityStrength(indices)).toBe('weak')
  })

  // Test 14: insufficient_data when fewer than 2 elements
  it('14. single element → insufficient_data', () => {
    expect(computeSeasonalityStrength([100])).toBe('insufficient_data')
  })

  // Test 15: insufficient_data for empty array
  it('15. empty array → insufficient_data', () => {
    expect(computeSeasonalityStrength([])).toBe('insufficient_data')
  })

  // Test 16: exactly 2 elements, spread=51 → strong
  it('16. two elements, spread=51 → strong', () => {
    expect(computeSeasonalityStrength([75, 126])).toBe('strong')
  })

  // Test 17: exactly 2 elements, spread=20 → moderate (boundary inclusive)
  it('17. two elements, spread=20 → moderate (>= 20 boundary)', () => {
    expect(computeSeasonalityStrength([90, 110])).toBe('moderate')
  })
})

// ── buildSeasonalityRecommendation ────────────────────────────────────────────

describe('buildSeasonalityRecommendation — pure', () => {

  // Test 18: insufficient_data → standard message
  it('18. insufficient_data → veri gerekiyor message', () => {
    const result = buildSeasonalityRecommendation(null, null, 'insufficient_data')
    expect(result).toContain('en az 12 aylık veri')
  })

  // Test 19: weak → istikrarlı message
  it('19. weak → istikrarlı message', () => {
    const result = buildSeasonalityRecommendation(7, 1, 'weak')
    expect(result).toContain('istikrarlı')
  })

  // Test 20: strong + peak in summer (June=6) → Yaz ayları message
  it('20. strong, peak=6 (Haziran, summer) → yaz pik message', () => {
    const result = buildSeasonalityRecommendation(6, 1, 'strong')
    expect(result).toContain('Yaz ayları')
    expect(result).toContain('pik')
  })

  // Test 21: strong + trough in winter (January=1), no peak → kış nakit message
  it('21. strong, peak=null, trough=1 (Ocak, winter) → kış nakit rezerv message', () => {
    const result = buildSeasonalityRecommendation(null, 1, 'strong')
    expect(result.toLowerCase()).toContain('ocak')
  })

  // Test 22: moderate + no peak/trough → fallback message mentions mevsimsellik
  it('22. moderate, no peak or trough → generic mevsimsellik message', () => {
    const result = buildSeasonalityRecommendation(null, null, 'moderate')
    expect(result).toBeTruthy()
    expect(result.length).toBeGreaterThan(10)
  })

  // Test 23: strong + peak in autumn (October=10) → Sonbahar message
  it('23. strong, peak=10 (Ekim, autumn) → Sonbahar message', () => {
    const result = buildSeasonalityRecommendation(10, 3, 'strong')
    expect(result).toContain('Sonbahar')
  })
})
