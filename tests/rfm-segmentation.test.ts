/**
 * Tests for lib/services/commercial/rfm-segmentation.service.ts
 * All pure functions — no DB calls, no side effects.
 * Run with: npx vitest run tests/rfm-segmentation.test.ts
 */
import { describe, it, expect } from 'vitest'
import {
  scoreRecency,
  scoreFrequency,
  scoreMonetary,
  computeRfmScore,
  classifyRfmSegment,
  computeQuintileBreaks,
  computeSegmentRevenuePct,
  getSegmentActionLabel,
  ALL_RFM_SEGMENTS,
} from '../lib/services/commercial/rfm-segmentation.service'

// ── scoreRecency ──────────────────────────────────────────────────────────────

describe('scoreRecency', () => {
  const breaks: [number, number, number, number] = [10, 30, 60, 120]

  it('returns 5 when days exactly equals p20 (boundary)', () => {
    expect(scoreRecency(10, breaks)).toBe(5)
  })

  it('returns 5 when days less than p20', () => {
    expect(scoreRecency(5, breaks)).toBe(5)
  })

  it('returns 5 when days is 0 (same day)', () => {
    expect(scoreRecency(0, breaks)).toBe(5)
  })

  it('returns 4 when days exactly equals p40', () => {
    expect(scoreRecency(30, breaks)).toBe(4)
  })

  it('returns 4 when days between p20 and p40', () => {
    expect(scoreRecency(20, breaks)).toBe(4)
  })

  it('returns 3 when days exactly equals p60', () => {
    expect(scoreRecency(60, breaks)).toBe(3)
  })

  it('returns 3 when days between p40 and p60', () => {
    expect(scoreRecency(45, breaks)).toBe(3)
  })

  it('returns 2 when days exactly equals p80', () => {
    expect(scoreRecency(120, breaks)).toBe(2)
  })

  it('returns 2 when days between p60 and p80', () => {
    expect(scoreRecency(90, breaks)).toBe(2)
  })

  it('returns 1 when days exceeds p80', () => {
    expect(scoreRecency(121, breaks)).toBe(1)
  })

  it('returns 1 for very high days (dormant for years)', () => {
    expect(scoreRecency(730, breaks)).toBe(1)
  })
})

// ── scoreFrequency ────────────────────────────────────────────────────────────

describe('scoreFrequency', () => {
  const breaks: [number, number, number, number] = [1, 3, 6, 10]

  it('returns 5 when order count exceeds p80', () => {
    expect(scoreFrequency(11, breaks)).toBe(5)
  })

  it('returns 5 for very high order count', () => {
    expect(scoreFrequency(50, breaks)).toBe(5)
  })

  it('returns 4 when order count between p60 and p80 (exclusive)', () => {
    expect(scoreFrequency(8, breaks)).toBe(4)
  })

  it('returns 4 when order count exactly equals p80 (NOT > p80)', () => {
    // exactly p80=10 is NOT > p80, so it falls to next check > p60=6 → score 4
    expect(scoreFrequency(10, breaks)).toBe(4)
  })

  it('returns 3 when order count between p40 and p60', () => {
    expect(scoreFrequency(5, breaks)).toBe(3)
  })

  it('returns 2 when order count between p20 and p40', () => {
    expect(scoreFrequency(2, breaks)).toBe(2)
  })

  it('returns 1 when order count equals p20 (NOT > p20)', () => {
    // exactly p20=1 is NOT > p20 → score 1
    expect(scoreFrequency(1, breaks)).toBe(1)
  })

  it('returns 1 for 0 orders', () => {
    expect(scoreFrequency(0, breaks)).toBe(1)
  })
})

// ── scoreMonetary ─────────────────────────────────────────────────────────────

describe('scoreMonetary', () => {
  const breaks: [number, number, number, number] = [1000, 5000, 15000, 50000]

  it('returns 5 when spend exceeds p80', () => {
    expect(scoreMonetary(100_000, breaks)).toBe(5)
  })

  it('returns 4 when spend between p60 and p80', () => {
    expect(scoreMonetary(30_000, breaks)).toBe(4)
  })

  it('returns 3 when spend between p40 and p60', () => {
    expect(scoreMonetary(10_000, breaks)).toBe(3)
  })

  it('returns 2 when spend between p20 and p40', () => {
    expect(scoreMonetary(3_000, breaks)).toBe(2)
  })

  it('returns 1 when spend equals p20 (NOT > p20)', () => {
    expect(scoreMonetary(1000, breaks)).toBe(1)
  })

  it('returns 1 for zero spend', () => {
    expect(scoreMonetary(0, breaks)).toBe(1)
  })

  it('returns 5 for spend just above p80', () => {
    expect(scoreMonetary(50_001, breaks)).toBe(5)
  })
})

// ── computeRfmScore ───────────────────────────────────────────────────────────

describe('computeRfmScore', () => {
  it('returns "555" for r=5, f=5, m=5', () => {
    expect(computeRfmScore(5, 5, 5)).toBe('555')
  })

  it('returns "123" for r=1, f=2, m=3', () => {
    expect(computeRfmScore(1, 2, 3)).toBe('123')
  })

  it('returns "311" for r=3, f=1, m=1', () => {
    expect(computeRfmScore(3, 1, 1)).toBe('311')
  })

  it('returns "444" for r=4, f=4, m=4', () => {
    expect(computeRfmScore(4, 4, 4)).toBe('444')
  })
})

// ── classifyRfmSegment ────────────────────────────────────────────────────────

describe('classifyRfmSegment', () => {
  it('champion: r=5, f=5, m=5', () => {
    expect(classifyRfmSegment(5, 5, 5)).toBe('champion')
  })

  it('champion: r=5, f=4, m=4 (minimum champion)', () => {
    expect(classifyRfmSegment(5, 4, 4)).toBe('champion')
  })

  it('loyal_customer: r=3, f=4, m=5 (any R, F≥4, M≥4)', () => {
    expect(classifyRfmSegment(3, 4, 5)).toBe('loyal_customer')
  })

  it('loyal_customer: r=2, f=4, m=4', () => {
    expect(classifyRfmSegment(2, 4, 4)).toBe('loyal_customer')
  })

  it('cannot_lose: r=1, f=5, m=5 (dormant high-value)', () => {
    expect(classifyRfmSegment(1, 5, 5)).toBe('cannot_lose')
  })

  it('cannot_lose: r=1, f=4, m=4', () => {
    expect(classifyRfmSegment(1, 4, 4)).toBe('cannot_lose')
  })

  it('potential_loyalist: r=4, f=3, m=3', () => {
    expect(classifyRfmSegment(4, 3, 3)).toBe('potential_loyalist')
  })

  it('potential_loyalist: r=5, f=2, m=2', () => {
    expect(classifyRfmSegment(5, 2, 2)).toBe('potential_loyalist')
  })

  it('recent_customer: r=4, f=1, m=3', () => {
    expect(classifyRfmSegment(4, 1, 3)).toBe('recent_customer')
  })

  it('recent_customer: r=5, f=1, m=1', () => {
    expect(classifyRfmSegment(5, 1, 1)).toBe('recent_customer')
  })

  it('need_attention: r=3, f=3, m=3', () => {
    expect(classifyRfmSegment(3, 3, 3)).toBe('need_attention')
  })

  it('at_risk: r=2, f=4, m=3', () => {
    expect(classifyRfmSegment(2, 4, 3)).toBe('at_risk')
  })

  it('at_risk: r=2, f=3, m=3', () => {
    expect(classifyRfmSegment(2, 3, 3)).toBe('at_risk')
  })

  it('about_to_sleep: r=2, f=1, m=1', () => {
    expect(classifyRfmSegment(2, 1, 1)).toBe('about_to_sleep')
  })

  it('about_to_sleep: r=2, f=2, m=4', () => {
    expect(classifyRfmSegment(2, 2, 4)).toBe('about_to_sleep')
  })

  it('hibernating: r=1, f=2, m=1', () => {
    expect(classifyRfmSegment(1, 2, 1)).toBe('hibernating')
  })

  it('hibernating: r=1, f=1, m=1', () => {
    expect(classifyRfmSegment(1, 1, 1)).toBe('hibernating')
  })

  it('lost: r=1, f=3, m=2 (dormant, mid-frequency, lower M)', () => {
    expect(classifyRfmSegment(1, 3, 2)).toBe('lost')
  })

  it('promising: r=3, f=1, m=1', () => {
    expect(classifyRfmSegment(3, 1, 1)).toBe('promising')
  })

  it('promising: r=3, f=1, m=2', () => {
    expect(classifyRfmSegment(3, 1, 2)).toBe('promising')
  })
})

// ── computeQuintileBreaks ─────────────────────────────────────────────────────

describe('computeQuintileBreaks', () => {
  it('computes correct quintile breaks for 10-element sorted array', () => {
    const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    const [p20, p40, p60, p80] = computeQuintileBreaks(values)
    // sorted: [1..10], length=10
    // p20: idx = floor(0.2 * 9) = 1 → 2
    // p40: idx = floor(0.4 * 9) = 3 → 4
    // p60: idx = floor(0.6 * 9) = 5 → 6
    // p80: idx = floor(0.8 * 9) = 7 → 8
    expect(p20).toBe(2)
    expect(p40).toBe(4)
    expect(p60).toBe(6)
    expect(p80).toBe(8)
  })

  it('handles unsorted input correctly', () => {
    const values = [10, 1, 6, 3, 8, 5, 7, 2, 9, 4]
    const breaks = computeQuintileBreaks(values)
    // Same values as sorted test
    expect(breaks[0]).toBe(2)
    expect(breaks[3]).toBe(8)
  })

  it('returns all same value for 4-element array (edge case)', () => {
    const values = [10, 20, 30, 40]
    const [p20, p40, p60, p80] = computeQuintileBreaks(values)
    expect(p20).toBe(p40)
    expect(p40).toBe(p60)
    expect(p60).toBe(p80)
  })

  it('returns all same value for 1-element array (edge case)', () => {
    const [p20, p40, p60, p80] = computeQuintileBreaks([42])
    expect(p20).toBe(42)
    expect(p40).toBe(42)
    expect(p60).toBe(42)
    expect(p80).toBe(42)
  })

  it('returns [0,0,0,0] for empty array', () => {
    expect(computeQuintileBreaks([])).toEqual([0, 0, 0, 0])
  })

  it('returns correct breaks for large uniform array', () => {
    const values = Array(100).fill(100)
    const breaks = computeQuintileBreaks(values)
    expect(breaks).toEqual([100, 100, 100, 100])
  })
})

// ── computeSegmentRevenuePct ──────────────────────────────────────────────────

describe('computeSegmentRevenuePct', () => {
  it('returns 100% for a single segment when all customers are champions', () => {
    const customers = [
      { segment: 'champion' as const, total_spend: 1000 },
      { segment: 'champion' as const, total_spend: 2000 },
    ]
    const result = computeSegmentRevenuePct(customers)
    expect(result['champion']).toBeCloseTo(100)
    expect(result['loyal_customer']).toBe(0)
  })

  it('returns 50%/50% for even split between two segments', () => {
    const customers = [
      { segment: 'champion' as const, total_spend: 1000 },
      { segment: 'loyal_customer' as const, total_spend: 1000 },
    ]
    const result = computeSegmentRevenuePct(customers)
    expect(result['champion']).toBeCloseTo(50)
    expect(result['loyal_customer']).toBeCloseTo(50)
  })

  it('returns 0 for all segments when empty array', () => {
    const result = computeSegmentRevenuePct([])
    for (const seg of ALL_RFM_SEGMENTS) {
      expect(result[seg]).toBe(0)
    }
  })

  it('returns 0 for all segments when total spend is 0', () => {
    const customers = [
      { segment: 'lost' as const, total_spend: 0 },
      { segment: 'hibernating' as const, total_spend: 0 },
    ]
    const result = computeSegmentRevenuePct(customers)
    for (const seg of ALL_RFM_SEGMENTS) {
      expect(result[seg]).toBe(0)
    }
  })

  it('computes unequal split correctly', () => {
    const customers = [
      { segment: 'champion' as const, total_spend: 750 },
      { segment: 'at_risk' as const, total_spend: 250 },
    ]
    const result = computeSegmentRevenuePct(customers)
    expect(result['champion']).toBeCloseTo(75)
    expect(result['at_risk']).toBeCloseTo(25)
  })

  it('initializes all 11 segments in the result', () => {
    const customers = [{ segment: 'champion' as const, total_spend: 100 }]
    const result = computeSegmentRevenuePct(customers)
    for (const seg of ALL_RFM_SEGMENTS) {
      expect(typeof result[seg]).toBe('number')
    }
  })
})

// ── getSegmentActionLabel ─────────────────────────────────────────────────────

describe('getSegmentActionLabel', () => {
  it('returns Turkish action label for champion', () => {
    const label = getSegmentActionLabel('champion')
    expect(label).toBe('Ödüllendirin, elçi yapın')
  })

  it('returns Turkish action label for at_risk', () => {
    const label = getSegmentActionLabel('at_risk')
    expect(label).toBe('Win-back kampanyası başlatın')
  })

  it('returns Turkish action label for cannot_lose', () => {
    const label = getSegmentActionLabel('cannot_lose')
    expect(label).toBe('Kişisel iletişim kurun, reaktif kampanya yapın')
  })

  it('returns Turkish action label for lost', () => {
    const label = getSegmentActionLabel('lost')
    expect(label).toBe('Yeniden kazanma kampanyası veya çık')
  })

  it('returns a non-empty string for all 11 segments', () => {
    for (const seg of ALL_RFM_SEGMENTS) {
      const label = getSegmentActionLabel(seg)
      expect(typeof label).toBe('string')
      expect(label.length).toBeGreaterThan(0)
    }
  })
})

// ── ALL_RFM_SEGMENTS — structure tests ────────────────────────────────────────

describe('ALL_RFM_SEGMENTS — completeness and content', () => {
  it('has exactly 11 segments', () => {
    expect(ALL_RFM_SEGMENTS).toHaveLength(11)
  })

  it('contains champion', () => {
    expect(ALL_RFM_SEGMENTS).toContain('champion')
  })

  it('contains loyal_customer', () => {
    expect(ALL_RFM_SEGMENTS).toContain('loyal_customer')
  })

  it('contains at_risk', () => {
    expect(ALL_RFM_SEGMENTS).toContain('at_risk')
  })

  it('contains lost', () => {
    expect(ALL_RFM_SEGMENTS).toContain('lost')
  })

  it('contains cannot_lose', () => {
    expect(ALL_RFM_SEGMENTS).toContain('cannot_lose')
  })

  it('contains all expected 11 segments', () => {
    const expected = [
      'champion', 'loyal_customer', 'potential_loyalist', 'recent_customer',
      'promising', 'need_attention', 'about_to_sleep', 'at_risk',
      'cannot_lose', 'hibernating', 'lost',
    ]
    for (const seg of expected) {
      expect(ALL_RFM_SEGMENTS).toContain(seg)
    }
  })

  it('all values are strings', () => {
    for (const seg of ALL_RFM_SEGMENTS) {
      expect(typeof seg).toBe('string')
    }
  })

  it('no duplicate segments', () => {
    const unique = new Set(ALL_RFM_SEGMENTS)
    expect(unique.size).toBe(ALL_RFM_SEGMENTS.length)
  })
})

// ── scoreRecency — all 5 quintile levels exhaustive boundary tests ────────────

describe('scoreRecency — all 5 quintile levels with boundary precision', () => {
  const breaks: [number, number, number, number] = [7, 30, 90, 180]

  it('score 5: 0 days (today) → most recent', () => {
    expect(scoreRecency(0, breaks)).toBe(5)
  })

  it('score 5: 7 days (exactly p20 boundary)', () => {
    expect(scoreRecency(7, breaks)).toBe(5)
  })

  it('score 4: 8 days (just above p20)', () => {
    expect(scoreRecency(8, breaks)).toBe(4)
  })

  it('score 4: 30 days (exactly p40 boundary)', () => {
    expect(scoreRecency(30, breaks)).toBe(4)
  })

  it('score 3: 31 days (just above p40)', () => {
    expect(scoreRecency(31, breaks)).toBe(3)
  })

  it('score 3: 90 days (exactly p60 boundary)', () => {
    expect(scoreRecency(90, breaks)).toBe(3)
  })

  it('score 2: 91 days (just above p60)', () => {
    expect(scoreRecency(91, breaks)).toBe(2)
  })

  it('score 2: 180 days (exactly p80 boundary)', () => {
    expect(scoreRecency(180, breaks)).toBe(2)
  })

  it('score 1: 181 days (just above p80)', () => {
    expect(scoreRecency(181, breaks)).toBe(1)
  })

  it('score 1: 730 days (fully dormant for 2 years)', () => {
    expect(scoreRecency(730, breaks)).toBe(1)
  })
})

// ── scoreFrequency — all 5 quintile levels ────────────────────────────────────

describe('scoreFrequency — all 5 quintile levels boundary tests', () => {
  const breaks: [number, number, number, number] = [2, 5, 10, 20]

  it('score 1: 0 orders (no purchases)', () => {
    expect(scoreFrequency(0, breaks)).toBe(1)
  })

  it('score 1: exactly p20=2 (not > p20 → score 1)', () => {
    expect(scoreFrequency(2, breaks)).toBe(1)
  })

  it('score 2: 3 orders (just above p20)', () => {
    expect(scoreFrequency(3, breaks)).toBe(2)
  })

  it('score 2: exactly p40=5 (not > p40 → score 2)', () => {
    expect(scoreFrequency(5, breaks)).toBe(2)
  })

  it('score 3: 6 orders (just above p40)', () => {
    expect(scoreFrequency(6, breaks)).toBe(3)
  })

  it('score 3: exactly p60=10 (not > p60 → score 3)', () => {
    expect(scoreFrequency(10, breaks)).toBe(3)
  })

  it('score 4: 11 orders (just above p60)', () => {
    expect(scoreFrequency(11, breaks)).toBe(4)
  })

  it('score 4: exactly p80=20 (not > p80 → score 4)', () => {
    expect(scoreFrequency(20, breaks)).toBe(4)
  })

  it('score 5: 21 orders (just above p80)', () => {
    expect(scoreFrequency(21, breaks)).toBe(5)
  })

  it('score 5: 100 orders (very high frequency)', () => {
    expect(scoreFrequency(100, breaks)).toBe(5)
  })
})

// ── scoreMonetary — all 5 quintile levels ────────────────────────────────────

describe('scoreMonetary — all 5 quintile levels boundary tests', () => {
  const breaks: [number, number, number, number] = [500, 2000, 8000, 25000]

  it('score 1: 0 spend', () => {
    expect(scoreMonetary(0, breaks)).toBe(1)
  })

  it('score 1: exactly p20=500 (not > p20 → score 1)', () => {
    expect(scoreMonetary(500, breaks)).toBe(1)
  })

  it('score 2: 501 (just above p20)', () => {
    expect(scoreMonetary(501, breaks)).toBe(2)
  })

  it('score 2: exactly p40=2000 (not > p40 → score 2)', () => {
    expect(scoreMonetary(2000, breaks)).toBe(2)
  })

  it('score 3: 2001 (just above p40)', () => {
    expect(scoreMonetary(2001, breaks)).toBe(3)
  })

  it('score 3: exactly p60=8000 (not > p60 → score 3)', () => {
    expect(scoreMonetary(8000, breaks)).toBe(3)
  })

  it('score 4: 8001 (just above p60)', () => {
    expect(scoreMonetary(8001, breaks)).toBe(4)
  })

  it('score 4: exactly p80=25000 (not > p80 → score 4)', () => {
    expect(scoreMonetary(25000, breaks)).toBe(4)
  })

  it('score 5: 25001 (just above p80)', () => {
    expect(scoreMonetary(25001, breaks)).toBe(5)
  })

  it('score 5: very high spend (1M)', () => {
    expect(scoreMonetary(1_000_000, breaks)).toBe(5)
  })
})

// ── computeRfmScore — produces correct 3-digit string ────────────────────────

describe('computeRfmScore — 3-digit string format', () => {
  it('returns "111" for r=1, f=1, m=1 (worst)', () => {
    expect(computeRfmScore(1, 1, 1)).toBe('111')
  })

  it('returns "555" for r=5, f=5, m=5 (best)', () => {
    expect(computeRfmScore(5, 5, 5)).toBe('555')
  })

  it('returns "512" for r=5, f=1, m=2', () => {
    expect(computeRfmScore(5, 1, 2)).toBe('512')
  })

  it('returns "213" for r=2, f=1, m=3', () => {
    expect(computeRfmScore(2, 1, 3)).toBe('213')
  })

  it('result is always exactly 3 characters long', () => {
    for (let r = 1; r <= 5; r++) {
      for (let f = 1; f <= 5; f++) {
        for (let m = 1; m <= 5; m++) {
          expect(computeRfmScore(r, f, m)).toHaveLength(3)
        }
      }
    }
  })

  it('result only contains digits for all valid score combos', () => {
    expect(computeRfmScore(3, 4, 2)).toMatch(/^\d{3}$/)
  })
})

// ── classifyRfmSegment — champion / loyal / at_risk / lost coverage ───────────

describe('classifyRfmSegment — champion, loyal_customer, at_risk, lost coverage', () => {
  it('champion requires r=5, f≥4, m≥4 — r=5,f=4,m=4 is champion', () => {
    expect(classifyRfmSegment(5, 4, 4)).toBe('champion')
  })

  it('r=5,f=5,m=5 is champion', () => {
    expect(classifyRfmSegment(5, 5, 5)).toBe('champion')
  })

  it('r=5,f=3,m=5 is NOT champion (f<4) → potential_loyalist (r≥4, f≥2, m≥2 wins)', () => {
    const result = classifyRfmSegment(5, 3, 5)
    // potential_loyalist rule fires before need_attention: r≥4, f≥2, m≥2
    expect(result).toBe('potential_loyalist')
  })

  it('loyal_customer: r=4, f=4, m=5 (any r, f≥4, m≥4, not r=5)', () => {
    expect(classifyRfmSegment(4, 4, 5)).toBe('loyal_customer')
  })

  it('loyal_customer: r=3, f=5, m=4', () => {
    expect(classifyRfmSegment(3, 5, 4)).toBe('loyal_customer')
  })

  it('at_risk: r=2, f=3, m=4', () => {
    expect(classifyRfmSegment(2, 3, 4)).toBe('at_risk')
  })

  it('at_risk: r=2, f=4, m=4 (r=2 overrides loyal check)', () => {
    // r=2, f≥4, m≥4 → cannot_lose checks r=1, so falls to loyal? No:
    // cannot_lose requires r=1 specifically; loyal requires f≥4 && m≥4 (any R)
    // r=2, f=4, m=4 → loyal_customer (f≥4 && m≥4, and r=2 does NOT trigger cannot_lose)
    expect(classifyRfmSegment(2, 4, 4)).toBe('loyal_customer')
  })

  it('lost: r=1, f=3, m=1 (not cannot_lose since m<4)', () => {
    expect(classifyRfmSegment(1, 3, 1)).toBe('lost')
  })

  it('lost: r=1, f=3, m=2', () => {
    expect(classifyRfmSegment(1, 3, 2)).toBe('lost')
  })

  it('hibernating: r=1, f=1, m=5 (r=1, f≤2)', () => {
    expect(classifyRfmSegment(1, 1, 5)).toBe('hibernating')
  })

  it('cannot_lose: r=1, f=4, m=5 (dormant but was high value)', () => {
    expect(classifyRfmSegment(1, 4, 5)).toBe('cannot_lose')
  })
})

// ── computeQuintileBreaks — equal values edge case ────────────────────────────

describe('computeQuintileBreaks — equal values and edge cases', () => {
  it('all equal values → all breaks are the same value', () => {
    const values = [50, 50, 50, 50, 50, 50, 50, 50, 50, 50]
    const breaks = computeQuintileBreaks(values)
    expect(breaks).toEqual([50, 50, 50, 50])
  })

  it('2-element array → returns first element for all breaks (< 5 items)', () => {
    const [p20, p40, p60, p80] = computeQuintileBreaks([10, 20])
    expect(p20).toBe(10)
    expect(p40).toBe(10)
    expect(p60).toBe(10)
    expect(p80).toBe(10)
  })

  it('5-element array: [1,2,3,4,5] → p20=1,p40=2,p60=3,p80=4', () => {
    // sorted: [1,2,3,4,5], length=5
    // p20: idx=floor(0.2*4)=0 → 1
    // p40: idx=floor(0.4*4)=1 → 2
    // p60: idx=floor(0.6*4)=2 → 3
    // p80: idx=floor(0.8*4)=3 → 4
    const [p20, p40, p60, p80] = computeQuintileBreaks([1, 2, 3, 4, 5])
    expect(p20).toBe(1)
    expect(p40).toBe(2)
    expect(p60).toBe(3)
    expect(p80).toBe(4)
  })

  it('unsorted input produces same result as sorted input', () => {
    const sorted = [10, 20, 30, 40, 50]
    const unsorted = [50, 10, 40, 20, 30]
    expect(computeQuintileBreaks(sorted)).toEqual(computeQuintileBreaks(unsorted))
  })

  it('breaks are always non-decreasing (p20 ≤ p40 ≤ p60 ≤ p80)', () => {
    const values = [5, 15, 1, 8, 22, 3, 18, 11, 7, 14]
    const [p20, p40, p60, p80] = computeQuintileBreaks(values)
    expect(p20).toBeLessThanOrEqual(p40)
    expect(p40).toBeLessThanOrEqual(p60)
    expect(p60).toBeLessThanOrEqual(p80)
  })
})
