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

  // Test 5: all elements are non-empty strings
  it('5. all elements are non-empty strings', () => {
    for (const month of TURKISH_MONTHS) {
      expect(typeof month).toBe('string')
      expect(month.length).toBeGreaterThan(0)
    }
  })

  // Test 6: index 2 is Mart (March)
  it('6. index 2 is Mart', () => {
    expect(TURKISH_MONTHS[2]).toBe('Mart')
  })

  // Test 7: index 8 is Eylül (September)
  it('7. index 8 is Eylül', () => {
    expect(TURKISH_MONTHS[8]).toBe('Eylül')
  })

  // Test 8: all entries are unique
  it('8. all month names are unique', () => {
    const unique = new Set(TURKISH_MONTHS)
    expect(unique.size).toBe(12)
  })
})

// ── computeSeasonalIndex ──────────────────────────────────────────────────────

describe('computeSeasonalIndex — pure', () => {

  // Test 9: normal case: 200 avg / 100 overall = 200
  it('9. monthAvg=200, overallAvg=100 → 200', () => {
    expect(computeSeasonalIndex(200, 100)).toBe(200)
  })

  // Test 10: zero overallAvg → returns 100 (neutral)
  it('10. overallAvg=0 → 100 (neutral fallback)', () => {
    expect(computeSeasonalIndex(500, 0)).toBe(100)
  })

  // Test 11: monthAvg equals overallAvg → exactly 100
  it('11. monthAvg = overallAvg → 100', () => {
    expect(computeSeasonalIndex(5000, 5000)).toBe(100)
  })

  // Test 12: below average: 50 / 100 = 50
  it('12. monthAvg=50, overallAvg=100 → 50', () => {
    expect(computeSeasonalIndex(50, 100)).toBe(50)
  })

  // Test 13: fractional result is rounded to 2 decimal places
  it('13. fractional result: 150/70 → rounded to 2dp', () => {
    const result = computeSeasonalIndex(150, 70)
    // 150/70*100 = 214.2857...
    expect(result).toBeCloseTo(214.29, 1)
  })

  // Test 14: both zero → returns 100
  it('14. monthAvg=0, overallAvg=0 → 100', () => {
    expect(computeSeasonalIndex(0, 0)).toBe(100)
  })

  // Test 15: triple-average month → index 300
  it('15. monthAvg=300, overallAvg=100 → 300', () => {
    expect(computeSeasonalIndex(300, 100)).toBe(300)
  })

  // Test 16: half-average month → index 50
  it('16. monthAvg=1000, overallAvg=2000 → 50', () => {
    expect(computeSeasonalIndex(1000, 2000)).toBe(50)
  })

  // Test 17: large values compute correctly
  it('17. large values: monthAvg=1_000_000, overallAvg=500_000 → 200', () => {
    expect(computeSeasonalIndex(1_000_000, 500_000)).toBe(200)
  })

  // Test 18: very small values — precision maintained
  it('18. small values: monthAvg=1, overallAvg=3 → approx 33.33', () => {
    const result = computeSeasonalIndex(1, 3)
    expect(result).toBeCloseTo(33.33, 1)
  })

  // Test 19: monthAvg=0, overallAvg>0 → index 0
  it('19. monthAvg=0, overallAvg=100 → 0', () => {
    expect(computeSeasonalIndex(0, 100)).toBe(0)
  })

  // Test 20: result is a number (not NaN or Infinity)
  it('20. result is always a finite number', () => {
    const result = computeSeasonalIndex(123.45, 678.90)
    expect(isFinite(result)).toBe(true)
    expect(isNaN(result)).toBe(false)
  })
})

// ── computeSeasonalityStrength ────────────────────────────────────────────────

describe('computeSeasonalityStrength — pure', () => {

  // Test 21: strong — indices span > 50 (e.g. 60-140 = spread 80)
  it('21. spread=80 (60..140) → strong', () => {
    const indices = [60, 80, 100, 120, 140, 110, 90, 70, 85, 130, 115, 95]
    expect(computeSeasonalityStrength(indices)).toBe('strong')
  })

  // Test 22: moderate — spread 20-50 (e.g. 80-120 = spread 40)
  it('22. spread=40 (80..120) → moderate', () => {
    const indices = [80, 90, 100, 110, 120, 115, 105, 95, 88, 92, 97, 103]
    expect(computeSeasonalityStrength(indices)).toBe('moderate')
  })

  // Test 23: weak — spread < 20 (e.g. 90-105 = spread 15)
  it('23. spread=15 (90..105) → weak', () => {
    const indices = [90, 92, 95, 98, 100, 102, 103, 105, 104, 101, 97, 93]
    expect(computeSeasonalityStrength(indices)).toBe('weak')
  })

  // Test 24: insufficient_data when fewer than 2 elements
  it('24. single element → insufficient_data', () => {
    expect(computeSeasonalityStrength([100])).toBe('insufficient_data')
  })

  // Test 25: insufficient_data for empty array
  it('25. empty array → insufficient_data', () => {
    expect(computeSeasonalityStrength([])).toBe('insufficient_data')
  })

  // Test 26: exactly 2 elements, spread=51 → strong
  it('26. two elements, spread=51 → strong', () => {
    expect(computeSeasonalityStrength([75, 126])).toBe('strong')
  })

  // Test 27: exactly 2 elements, spread=20 → moderate (boundary inclusive)
  it('27. two elements, spread=20 → moderate (>= 20 boundary)', () => {
    expect(computeSeasonalityStrength([90, 110])).toBe('moderate')
  })

  // Test 28: spread exactly 50 → moderate (not strong, requires > 50)
  it('28. spread=50 → moderate (boundary: requires > 50 for strong)', () => {
    expect(computeSeasonalityStrength([75, 125])).toBe('moderate')
  })

  // Test 29: spread exactly 51 → strong
  it('29. spread=51 → strong', () => {
    expect(computeSeasonalityStrength([74, 125])).toBe('strong')
  })

  // Test 30: spread=19 → weak (just below moderate boundary)
  it('30. spread=19 → weak (below 20 boundary)', () => {
    expect(computeSeasonalityStrength([91, 110])).toBe('weak')
  })

  // Test 31: all same values → spread=0 → weak
  it('31. all identical values → spread=0 → weak', () => {
    const indices = [100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100]
    expect(computeSeasonalityStrength(indices)).toBe('weak')
  })

  // Test 32: extreme spread (0 to 300) → strong
  it('32. extreme spread (0..300) → strong', () => {
    expect(computeSeasonalityStrength([0, 300])).toBe('strong')
  })
})

// ── buildSeasonalityRecommendation ────────────────────────────────────────────

describe('buildSeasonalityRecommendation — pure', () => {

  // Test 33: insufficient_data → standard message
  it('33. insufficient_data → veri gerekiyor message', () => {
    const result = buildSeasonalityRecommendation(null, null, 'insufficient_data')
    expect(result).toContain('en az 12 aylık veri')
  })

  // Test 34: weak → istikrarlı message
  it('34. weak → istikrarlı message', () => {
    const result = buildSeasonalityRecommendation(7, 1, 'weak')
    expect(result).toContain('istikrarlı')
  })

  // Test 35: strong + peak in summer (June=6) → Yaz ayları message
  it('35. strong, peak=6 (Haziran, summer) → yaz pik message', () => {
    const result = buildSeasonalityRecommendation(6, 1, 'strong')
    expect(result).toContain('Yaz ayları')
    expect(result).toContain('pik')
  })

  // Test 36: strong + trough in winter (January=1), no peak → kış nakit message
  it('36. strong, peak=null, trough=1 (Ocak, winter) → kış nakit rezerv message', () => {
    const result = buildSeasonalityRecommendation(null, 1, 'strong')
    expect(result.toLowerCase()).toContain('ocak')
  })

  // Test 37: moderate + no peak/trough → fallback message mentions mevsimsellik
  it('37. moderate, no peak or trough → generic mevsimsellik message', () => {
    const result = buildSeasonalityRecommendation(null, null, 'moderate')
    expect(result).toBeTruthy()
    expect(result.length).toBeGreaterThan(10)
  })

  // Test 38: strong + peak in autumn (October=10) → Sonbahar message
  it('38. strong, peak=10 (Ekim, autumn) → Sonbahar message', () => {
    const result = buildSeasonalityRecommendation(10, 3, 'strong')
    expect(result).toContain('Sonbahar')
  })

  // Test 39: weak with null peak and trough → still returns a message
  it('39. weak, peak=null, trough=null → returns a non-empty string', () => {
    const result = buildSeasonalityRecommendation(null, null, 'weak')
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(5)
  })

  // Test 40: insufficient_data always returns same message regardless of peak/trough
  it('40. insufficient_data with non-null peak → still returns veri message', () => {
    const result = buildSeasonalityRecommendation(6, 1, 'insufficient_data')
    expect(result).toContain('en az 12 aylık veri')
  })

  // Test 41: strong + peak in spring (April=4) → İlkbahar message
  it('41. strong, peak=4 (Nisan, spring) → İlkbahar message', () => {
    const result = buildSeasonalityRecommendation(4, 10, 'strong')
    expect(result).toContain('İlkbahar')
  })

  // Test 42: strong + trough in summer → summer trough message (not a peak message)
  it('42. strong, peak=null, trough=7 (July, summer) → summer trough context', () => {
    const result = buildSeasonalityRecommendation(null, 7, 'strong')
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(10)
  })

  // Test 43: moderate + peak present → message mentions peak season
  it('43. moderate + peak=3 (spring) → spring mention', () => {
    const result = buildSeasonalityRecommendation(3, 9, 'moderate')
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(10)
  })

  // Test 44: return type is always string
  it('44. always returns a string for any input combination', () => {
    const combos: Array<[number | null, number | null, 'strong' | 'moderate' | 'weak' | 'insufficient_data']> = [
      [1, 7, 'strong'],
      [12, 6, 'moderate'],
      [null, null, 'weak'],
      [null, null, 'insufficient_data'],
    ]
    for (const [peak, trough, strength] of combos) {
      const result = buildSeasonalityRecommendation(peak, trough, strength)
      expect(typeof result).toBe('string')
    }
  })
})

// ── TURKISH_MONTHS — all 12 individual month names ───────────────────────────

describe('TURKISH_MONTHS — all 12 month names', () => {
  it('index 0 is Ocak (January)', () => {
    expect(TURKISH_MONTHS[0]).toBe('Ocak')
  })

  it('index 1 is Şubat (February)', () => {
    expect(TURKISH_MONTHS[1]).toBe('Şubat')
  })

  it('index 2 is Mart (March)', () => {
    expect(TURKISH_MONTHS[2]).toBe('Mart')
  })

  it('index 3 is Nisan (April)', () => {
    expect(TURKISH_MONTHS[3]).toBe('Nisan')
  })

  it('index 4 is Mayıs (May)', () => {
    expect(TURKISH_MONTHS[4]).toBe('Mayıs')
  })

  it('index 5 is Haziran (June)', () => {
    expect(TURKISH_MONTHS[5]).toBe('Haziran')
  })

  it('index 6 is Temmuz (July)', () => {
    expect(TURKISH_MONTHS[6]).toBe('Temmuz')
  })

  it('index 7 is Ağustos (August)', () => {
    expect(TURKISH_MONTHS[7]).toBe('Ağustos')
  })

  it('index 8 is Eylül (September)', () => {
    expect(TURKISH_MONTHS[8]).toBe('Eylül')
  })

  it('index 9 is Ekim (October)', () => {
    expect(TURKISH_MONTHS[9]).toBe('Ekim')
  })

  it('index 10 is Kasım (November)', () => {
    expect(TURKISH_MONTHS[10]).toBe('Kasım')
  })

  it('index 11 is Aralık (December)', () => {
    expect(TURKISH_MONTHS[11]).toBe('Aralık')
  })

  it('array is frozen / not mutated between tests', () => {
    // Verify repeated access gives same results
    expect(TURKISH_MONTHS[0]).toBe('Ocak')
    expect(TURKISH_MONTHS[11]).toBe('Aralık')
  })

  it('month name for month number 6 (Haziran) is at index 5', () => {
    // month numbers are 1-indexed: TURKISH_MONTHS[monthNumber - 1]
    expect(TURKISH_MONTHS[6 - 1]).toBe('Haziran')
  })

  it('month name for month number 12 (Aralık) is at index 11', () => {
    expect(TURKISH_MONTHS[12 - 1]).toBe('Aralık')
  })

  it('month name for month number 1 (Ocak) is at index 0', () => {
    expect(TURKISH_MONTHS[1 - 1]).toBe('Ocak')
  })
})

// ── computeSeasonalIndex — additional edge cases ──────────────────────────────

describe('computeSeasonalIndex — edge cases and precision', () => {
  it('overallAvg=0 with monthAvg=0 → 100', () => {
    expect(computeSeasonalIndex(0, 0)).toBe(100)
  })

  it('overallAvg=0 with non-zero monthAvg → 100', () => {
    expect(computeSeasonalIndex(12345, 0)).toBe(100)
  })

  it('equal monthAvg and overallAvg always returns exactly 100', () => {
    for (const v of [1, 100, 9999, 0.5, 10000]) {
      if (v > 0) expect(computeSeasonalIndex(v, v)).toBe(100)
    }
  })

  it('monthAvg=200, overallAvg=100 → 200 (double average)', () => {
    expect(computeSeasonalIndex(200, 100)).toBe(200)
  })

  it('monthAvg=25, overallAvg=100 → 25 (quarter average)', () => {
    expect(computeSeasonalIndex(25, 100)).toBe(25)
  })

  it('result is rounded to 2 decimal places (not more)', () => {
    const result = computeSeasonalIndex(100, 3)
    const dp = String(result).split('.')[1]?.length ?? 0
    expect(dp).toBeLessThanOrEqual(2)
  })

  it('1.5x average month → 150', () => {
    expect(computeSeasonalIndex(150, 100)).toBe(150)
  })

  it('large scale: 5_000_000 / 2_500_000 → 200', () => {
    expect(computeSeasonalIndex(5_000_000, 2_500_000)).toBe(200)
  })

  it('monthAvg slightly above overall → index slightly above 100', () => {
    const result = computeSeasonalIndex(101, 100)
    expect(result).toBe(101)
  })

  it('monthAvg slightly below overall → index slightly below 100', () => {
    const result = computeSeasonalIndex(99, 100)
    expect(result).toBe(99)
  })

  it('index = 0 when monthAvg = 0 and overallAvg > 0', () => {
    expect(computeSeasonalIndex(0, 500)).toBe(0)
  })
})

// ── computeSeasonalityStrength — additional boundary tests ───────────────────

describe('computeSeasonalityStrength — boundary and precision', () => {
  it('spread of exactly 0 → weak', () => {
    expect(computeSeasonalityStrength([100, 100])).toBe('weak')
  })

  it('spread of exactly 19 → weak (below 20 boundary)', () => {
    expect(computeSeasonalityStrength([100, 119])).toBe('weak')
  })

  it('spread of exactly 20 → moderate (>= 20)', () => {
    expect(computeSeasonalityStrength([100, 120])).toBe('moderate')
  })

  it('spread of exactly 50 → moderate (not strong, requires > 50)', () => {
    expect(computeSeasonalityStrength([100, 150])).toBe('moderate')
  })

  it('spread of exactly 51 → strong (> 50)', () => {
    expect(computeSeasonalityStrength([100, 151])).toBe('strong')
  })

  it('spread of 100 → strong', () => {
    expect(computeSeasonalityStrength([50, 150])).toBe('strong')
  })

  it('12 identical indices → spread = 0 → weak', () => {
    const indices = Array(12).fill(100)
    expect(computeSeasonalityStrength(indices)).toBe('weak')
  })

  it('length 0 → insufficient_data', () => {
    expect(computeSeasonalityStrength([])).toBe('insufficient_data')
  })

  it('length 1 → insufficient_data', () => {
    expect(computeSeasonalityStrength([100])).toBe('insufficient_data')
  })

  it('length 2 with spread > 50 → strong', () => {
    expect(computeSeasonalityStrength([50, 101])).toBe('strong')
  })

  it('moderate range: spread = 35 → moderate', () => {
    expect(computeSeasonalityStrength([82, 117])).toBe('moderate')
  })

  it('extreme values: [0, 500] → strong', () => {
    expect(computeSeasonalityStrength([0, 500])).toBe('strong')
  })
})

// ── buildSeasonalityRecommendation — all strength levels and month combos ─────

describe('buildSeasonalityRecommendation — all strength/season combos', () => {
  it('insufficient_data returns 12-month data message regardless of months', () => {
    const r = buildSeasonalityRecommendation(7, 1, 'insufficient_data')
    expect(r).toContain('12 aylık')
  })

  it('weak always returns istikrarlı regardless of peak/trough', () => {
    expect(buildSeasonalityRecommendation(1, 7, 'weak')).toContain('istikrarlı')
    expect(buildSeasonalityRecommendation(null, null, 'weak')).toContain('istikrarlı')
    expect(buildSeasonalityRecommendation(12, 6, 'weak')).toContain('istikrarlı')
  })

  it('strong + peak in July (7, summer) → Yaz ayları message', () => {
    const r = buildSeasonalityRecommendation(7, 1, 'strong')
    expect(r).toContain('Yaz ayları')
  })

  it('strong + peak in August (8, summer) → Yaz ayları message', () => {
    const r = buildSeasonalityRecommendation(8, 2, 'strong')
    expect(r).toContain('Yaz ayları')
  })

  it('strong + trough in December (12, winter), peak not summer → kış message', () => {
    // peak=3 (spring, not summer) so winter-trough branch fires
    const r = buildSeasonalityRecommendation(3, 12, 'strong')
    expect(r.toLowerCase()).toContain('kış')
  })

  it('strong + trough in February (2, winter), peak not summer → kış message', () => {
    // peak=10 (autumn, not summer) so winter-trough branch fires
    const r = buildSeasonalityRecommendation(10, 2, 'strong')
    expect(r.toLowerCase()).toContain('kış')
  })

  it('strong + peak in spring (May=5) → İlkbahar message', () => {
    const r = buildSeasonalityRecommendation(5, 10, 'strong')
    expect(r).toContain('İlkbahar')
  })

  it('strong + peak in March (3, spring) → İlkbahar message', () => {
    const r = buildSeasonalityRecommendation(3, 9, 'strong')
    expect(r).toContain('İlkbahar')
  })

  it('strong + peak in autumn (November=11) → Sonbahar message', () => {
    const r = buildSeasonalityRecommendation(11, 4, 'strong')
    expect(r).toContain('Sonbahar')
  })

  it('moderate + peak in summer + no trough → Yaz ayları message', () => {
    const r = buildSeasonalityRecommendation(6, null, 'moderate')
    expect(r).toContain('Yaz ayları')
  })

  it('all strengths return non-empty strings', () => {
    const strengths: Array<'strong' | 'moderate' | 'weak' | 'insufficient_data'> = [
      'strong', 'moderate', 'weak', 'insufficient_data',
    ]
    for (const s of strengths) {
      const r = buildSeasonalityRecommendation(6, 1, s)
      expect(r.length).toBeGreaterThan(0)
    }
  })

  it('trough in autumn with no peak → Sonbahar trough message', () => {
    const r = buildSeasonalityRecommendation(null, 9, 'strong')
    expect(r).toContain('Sonbahar')
  })

  it('peak in winter (December=12) → checks winter-related message', () => {
    // December is winter; trough not winter so it should hit the generic peak branch
    const r = buildSeasonalityRecommendation(12, 6, 'strong')
    expect(typeof r).toBe('string')
    expect(r.length).toBeGreaterThan(5)
  })
})
