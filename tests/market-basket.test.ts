// ─────────────────────────────────────────────────────────────────────────────
// tests/market-basket.test.ts
//
// Unit tests for pure helper functions in market-basket.service.ts
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest'
import {
  computeSupport,
  computeConfidence,
  computeLift,
  classifyAssociationStrength,
  computeItemsetPairs,
  buildAssociationRules,
  findTopCrossSellOpportunities,
} from '../lib/services/commercial/market-basket.service'

// ── computeSupport ────────────────────────────────────────────────────────────

describe('computeSupport', () => {
  it('computes correct support percentage', () => {
    // 3 / 10 × 100 = 30%
    expect(computeSupport(3, 10)).toBeCloseTo(30, 5)
  })

  it('returns 100% when all transactions contain itemset', () => {
    expect(computeSupport(50, 50)).toBeCloseTo(100, 5)
  })

  it('returns null when totalTransactions is zero', () => {
    expect(computeSupport(0, 0)).toBeNull()
  })

  it('returns null when totalTransactions is zero and itemset count is nonzero', () => {
    expect(computeSupport(5, 0)).toBeNull()
  })

  it('returns 0% when itemset count is 0', () => {
    expect(computeSupport(0, 100)).toBeCloseTo(0, 5)
  })

  it('handles fractional support correctly', () => {
    // 1 / 3 × 100 ≈ 33.33%
    const result = computeSupport(1, 3)
    expect(result).not.toBeNull()
    expect(result!).toBeCloseTo(33.333, 2)
  })
})

// ── computeConfidence ─────────────────────────────────────────────────────────

describe('computeConfidence', () => {
  it('computes correct confidence percentage', () => {
    // 4 / 10 × 100 = 40%
    expect(computeConfidence(10, 4)).toBeCloseTo(40, 5)
  })

  it('returns 100% when itemset always contains antecedent', () => {
    expect(computeConfidence(5, 5)).toBeCloseTo(100, 5)
  })

  it('returns null when antecedentTransactions is zero', () => {
    expect(computeConfidence(0, 0)).toBeNull()
  })

  it('returns null when antecedent is zero but itemset is nonzero', () => {
    expect(computeConfidence(0, 3)).toBeNull()
  })

  it('handles small fractional confidence', () => {
    // 1 / 20 × 100 = 5%
    expect(computeConfidence(20, 1)).toBeCloseTo(5, 5)
  })
})

// ── computeLift ───────────────────────────────────────────────────────────────

describe('computeLift', () => {
  it('returns lift > 1 for positive association', () => {
    // confidence = 60%, consequentSupport = 20% → lift = 60/20 = 3.0
    const result = computeLift(60, 20)
    expect(result).not.toBeNull()
    expect(result!).toBeCloseTo(3.0, 5)
  })

  it('returns lift = 1 for independent items', () => {
    // confidence = 30%, consequentSupport = 30% → lift = 30/30 = 1.0
    const result = computeLift(30, 30)
    expect(result).not.toBeNull()
    expect(result!).toBeCloseTo(1.0, 5)
  })

  it('returns lift < 1 for negative association', () => {
    // confidence = 10%, consequentSupport = 50% → lift = 10/50 = 0.2
    const result = computeLift(10, 50)
    expect(result).not.toBeNull()
    expect(result!).toBeCloseTo(0.2, 5)
  })

  it('returns null when confidence is null', () => {
    expect(computeLift(null, 30)).toBeNull()
  })

  it('returns null when consequentSupport is null', () => {
    expect(computeLift(60, null)).toBeNull()
  })

  it('returns null when both arguments are null', () => {
    expect(computeLift(null, null)).toBeNull()
  })

  it('returns null when consequentSupport is zero (div by zero)', () => {
    expect(computeLift(60, 0)).toBeNull()
  })
})

// ── classifyAssociationStrength ───────────────────────────────────────────────

describe('classifyAssociationStrength', () => {
  it('returns insufficient_data when both lift and confidence are null', () => {
    expect(classifyAssociationStrength(null, null)).toBe('insufficient_data')
  })

  it('returns insufficient_data when lift is null (even with confidence value)', () => {
    expect(classifyAssociationStrength(null, 60)).toBe('insufficient_data')
  })

  it('returns strong when lift >= 2 and confidence >= 50', () => {
    expect(classifyAssociationStrength(2.5, 60)).toBe('strong')
  })

  it('returns strong at exact boundaries (lift=2, confidence=50)', () => {
    expect(classifyAssociationStrength(2, 50)).toBe('strong')
  })

  it('returns moderate when lift >= 1.5 and confidence >= 30', () => {
    expect(classifyAssociationStrength(1.8, 35)).toBe('moderate')
  })

  it('returns moderate at exact boundary (lift=1.5, confidence=30)', () => {
    expect(classifyAssociationStrength(1.5, 30)).toBe('moderate')
  })

  it('returns weak when lift > 1 but does not meet moderate thresholds', () => {
    expect(classifyAssociationStrength(1.2, 10)).toBe('weak')
  })

  it('returns none when lift = 1', () => {
    expect(classifyAssociationStrength(1.0, 30)).toBe('none')
  })

  it('returns none when lift < 1 (negative association)', () => {
    expect(classifyAssociationStrength(0.5, 40)).toBe('none')
  })

  it('returns none when lift is zero', () => {
    expect(classifyAssociationStrength(0, 50)).toBe('none')
  })

  it('strong requires both conditions: high lift but low confidence → moderate or weak', () => {
    // lift >= 2 but confidence < 50 → not strong
    expect(classifyAssociationStrength(3.0, 25)).toBe('weak')
  })

  it('strong requires both conditions: high confidence but low lift → not strong', () => {
    // confidence >= 50 but lift < 2 → check moderate or weak
    expect(classifyAssociationStrength(1.6, 55)).toBe('moderate')
  })
})

// ── computeItemsetPairs ───────────────────────────────────────────────────────

describe('computeItemsetPairs', () => {
  it('produces one pair from a 2-item transaction', () => {
    const txns = [{ transaction_id: 'T1', product_ids: ['A', 'B'] }]
    const pairs = computeItemsetPairs(txns)
    expect(pairs.size).toBe(1)
    expect(pairs.get('A|B')).toBe(1)
  })

  it('produces three pairs from a 3-item transaction', () => {
    const txns = [{ transaction_id: 'T1', product_ids: ['A', 'B', 'C'] }]
    const pairs = computeItemsetPairs(txns)
    expect(pairs.size).toBe(3)
    expect(pairs.get('A|B')).toBe(1)
    expect(pairs.get('A|C')).toBe(1)
    expect(pairs.get('B|C')).toBe(1)
  })

  it('increments count when same pair appears in multiple transactions', () => {
    const txns = [
      { transaction_id: 'T1', product_ids: ['A', 'B'] },
      { transaction_id: 'T2', product_ids: ['A', 'B', 'C'] },
    ]
    const pairs = computeItemsetPairs(txns)
    expect(pairs.get('A|B')).toBe(2)
    expect(pairs.get('A|C')).toBe(1)
    expect(pairs.get('B|C')).toBe(1)
  })

  it('sorts pair key alphabetically (smaller ID first)', () => {
    // B < A alphabetically? No — A < B.
    // Test with IDs where second is alphabetically smaller
    const txns = [{ transaction_id: 'T1', product_ids: ['Z', 'A'] }]
    const pairs = computeItemsetPairs(txns)
    // A < Z, so key should be 'A|Z'
    expect(pairs.has('A|Z')).toBe(true)
    expect(pairs.has('Z|A')).toBe(false)
  })

  it('produces no pairs from a single-item transaction', () => {
    const txns = [{ transaction_id: 'T1', product_ids: ['A'] }]
    const pairs = computeItemsetPairs(txns)
    expect(pairs.size).toBe(0)
  })

  it('produces no pairs from an empty transaction list', () => {
    const pairs = computeItemsetPairs([])
    expect(pairs.size).toBe(0)
  })

  it('deduplicates duplicate product IDs within a single transaction', () => {
    // Same product listed twice should be treated as one unique item
    const txns = [{ transaction_id: 'T1', product_ids: ['A', 'A', 'B'] }]
    const pairs = computeItemsetPairs(txns)
    expect(pairs.size).toBe(1)
    expect(pairs.get('A|B')).toBe(1)
  })
})

// ── buildAssociationRules ─────────────────────────────────────────────────────

describe('buildAssociationRules', () => {
  it('returns rules above threshold', () => {
    // A and B appear together in 3 of 5 transactions
    // A appears 4 times, B appears 3 times
    // support = 3/5 × 100 = 60% ≥ 5% ✓
    // A→B confidence = 3/4 × 100 = 75% ≥ 20% ✓
    // B→A confidence = 3/3 × 100 = 100% ≥ 20% ✓
    const transactions = [
      { transaction_id: 'T1', product_ids: ['A', 'B'] },
      { transaction_id: 'T2', product_ids: ['A', 'B'] },
      { transaction_id: 'T3', product_ids: ['A', 'B'] },
      { transaction_id: 'T4', product_ids: ['A'] },
      { transaction_id: 'T5', product_ids: ['C'] },
    ]
    const freq = new Map([['A', 4], ['B', 3], ['C', 1]])
    const rules = buildAssociationRules(transactions, freq, 5, 5, 20)
    expect(rules.length).toBeGreaterThan(0)
    const abRule = rules.find(r => r.antecedent === 'A' && r.consequent === 'B')
    expect(abRule).toBeDefined()
    expect(abRule!.support_pct).toBeCloseTo(60, 2)
    expect(abRule!.confidence_pct).toBeCloseTo(75, 2)
  })

  it('filters out rules below minSupport', () => {
    // Only 1 co-occurrence out of 100 transactions → 1% support < 5% default
    const transactions = [
      { transaction_id: 'T1', product_ids: ['A', 'B'] },
    ]
    // Fill remaining 99 transactions with single items to get totalTransactions=100
    for (let i = 2; i <= 100; i++) {
      transactions.push({ transaction_id: `T${i}`, product_ids: ['A'] })
    }
    const freq = new Map([['A', 100], ['B', 1]])
    const rules = buildAssociationRules(transactions, freq, 100, 5, 20)
    // support = 1/100 = 1% < 5% → filtered
    const abRule = rules.find(r => r.antecedent === 'A' && r.consequent === 'B')
    expect(abRule).toBeUndefined()
  })

  it('filters out rules below minConfidence', () => {
    // A appears 20 times, together with B only 2 times out of 10 total transactions
    // support = 2/10 = 20% ≥ 5% ✓
    // A→B confidence = 2/20 × 100 = 10% < 20% minConfidence → filtered
    // Use a higher minConfidence = 25 to ensure 10% is below threshold
    const transactions: Array<{ transaction_id: string; product_ids: string[] }> = []
    // 2 joint transactions
    for (let i = 0; i < 2; i++) {
      transactions.push({ transaction_id: `AB${i}`, product_ids: ['A', 'B'] })
    }
    // 8 A-only transactions
    for (let i = 0; i < 8; i++) {
      transactions.push({ transaction_id: `A${i}`, product_ids: ['A'] })
    }
    // freq: A appears in all 10 transactions but we pass a freq map indicating
    // A appears 20 times (simulating the service seeing A more broadly)
    const freq = new Map([['A', 20], ['B', 2]])
    // minSupport=5, minConfidence=25 → A→B conf=10% < 25% → filtered
    const rules = buildAssociationRules(transactions, freq, 10, 5, 25)
    const abRule = rules.find(r => r.antecedent === 'A' && r.consequent === 'B')
    expect(abRule).toBeUndefined()
  })

  it('generates both directions (A→B and B→A)', () => {
    const transactions = [
      { transaction_id: 'T1', product_ids: ['A', 'B'] },
      { transaction_id: 'T2', product_ids: ['A', 'B'] },
      { transaction_id: 'T3', product_ids: ['A', 'B'] },
    ]
    const freq = new Map([['A', 3], ['B', 3]])
    const rules = buildAssociationRules(transactions, freq, 3, 5, 20)
    const abRule = rules.find(r => r.antecedent === 'A' && r.consequent === 'B')
    const baRule = rules.find(r => r.antecedent === 'B' && r.consequent === 'A')
    expect(abRule).toBeDefined()
    expect(baRule).toBeDefined()
  })

  it('sorts rules by lift descending', () => {
    // Create scenario where A→B has higher lift than C→D
    // We need different frequencies to produce different lifts
    const transactions = [
      { transaction_id: 'T1', product_ids: ['A', 'B'] },
      { transaction_id: 'T2', product_ids: ['A', 'B'] },
      { transaction_id: 'T3', product_ids: ['A', 'B'] },
      { transaction_id: 'T4', product_ids: ['C', 'D'] },
      { transaction_id: 'T5', product_ids: ['C', 'D'] },
      // More standalone C and D to lower their freq-based support
      { transaction_id: 'T6', product_ids: ['C'] },
      { transaction_id: 'T7', product_ids: ['C'] },
      { transaction_id: 'T8', product_ids: ['D'] },
      { transaction_id: 'T9', product_ids: ['D'] },
      { transaction_id: 'T10', product_ids: ['A'] },
    ]
    // A: 4, B: 3, C: 4, D: 4
    const freq = new Map([['A', 4], ['B', 3], ['C', 4], ['D', 4]])
    const rules = buildAssociationRules(transactions, freq, 10, 5, 20)
    // Verify sorted by lift desc
    for (let i = 1; i < rules.length; i++) {
      const prev = rules[i - 1].lift ?? -Infinity
      const curr = rules[i].lift ?? -Infinity
      expect(prev).toBeGreaterThanOrEqual(curr)
    }
  })

  it('returns empty array when totalTransactions is zero', () => {
    const rules = buildAssociationRules([], new Map(), 0)
    expect(rules).toEqual([])
  })
})

// ── findTopCrossSellOpportunities ─────────────────────────────────────────────

describe('findTopCrossSellOpportunities', () => {
  const sampleRules = [
    { antecedent: 'p1', consequent: 'p2', confidence_pct: 80, lift: 3.0 },
    { antecedent: 'p2', consequent: 'p3', confidence_pct: 60, lift: 2.5 },
    { antecedent: 'p3', consequent: 'p1', confidence_pct: 40, lift: 2.0 },
    { antecedent: 'p4', consequent: 'p5', confidence_pct: 30, lift: 1.5 },
    { antecedent: 'p5', consequent: 'p4', confidence_pct: 25, lift: 1.2 },
  ]

  const productNames = new Map([
    ['p1', 'Ürün A'],
    ['p2', 'Ürün B'],
    ['p3', 'Ürün C'],
    // p4 and p5 intentionally missing to test fallback
  ])

  it('maps product IDs to names correctly', () => {
    const result = findTopCrossSellOpportunities(sampleRules, productNames, 10)
    expect(result[0].if_buying).toBe('Ürün A')
    expect(result[0].also_buy).toBe('Ürün B')
  })

  it('falls back to product_id when name not found in productNames', () => {
    const result = findTopCrossSellOpportunities(sampleRules, productNames, 10)
    const p4Rule = result.find(r => r.if_buying === 'p4')
    expect(p4Rule).toBeDefined()
    expect(p4Rule!.also_buy).toBe('p5')
  })

  it('limits results to topN', () => {
    const result = findTopCrossSellOpportunities(sampleRules, productNames, 3)
    expect(result.length).toBe(3)
  })

  it('returns all rules when topN exceeds rule count', () => {
    const result = findTopCrossSellOpportunities(sampleRules, productNames, 100)
    expect(result.length).toBe(sampleRules.length)
  })

  it('returns empty array for empty rules', () => {
    const result = findTopCrossSellOpportunities([], productNames, 10)
    expect(result).toEqual([])
  })

  it('includes confidence_pct and lift in results', () => {
    const result = findTopCrossSellOpportunities(sampleRules, productNames, 1)
    expect(result[0].confidence_pct).toBe(80)
    expect(result[0].lift).toBe(3.0)
  })

  it('computes strength correctly for each rule', () => {
    const result = findTopCrossSellOpportunities(sampleRules, productNames, 10)
    // First rule: lift=3, conf=80 → strong
    expect(result[0].strength).toBe('strong')
  })

  it('handles null lift in rules', () => {
    const rulesWithNull = [{ antecedent: 'x', consequent: 'y', confidence_pct: 50, lift: null }]
    const result = findTopCrossSellOpportunities(rulesWithNull, new Map([['x', 'X'], ['y', 'Y']]), 5)
    expect(result[0].lift).toBeNull()
    expect(result[0].strength).toBe('insufficient_data')
  })

  it('uses default topN of 10 when not specified', () => {
    const manyRules = Array.from({ length: 15 }, (_, i) => ({
      antecedent: `a${i}`,
      consequent: `b${i}`,
      confidence_pct: 50,
      lift: 2.0,
    }))
    const result = findTopCrossSellOpportunities(manyRules, new Map())
    expect(result.length).toBe(10)
  })
})

// ── computeSupport — formula: count / total × 100 ────────────────────────────

describe('computeSupport — formula verification', () => {
  it('1 / 4 = 25%', () => {
    const r = computeSupport(1, 4)
    expect(r).not.toBeNull()
    expect(r!).toBeCloseTo(25, 5)
  })

  it('10 / 10 = 100%', () => {
    expect(computeSupport(10, 10)).toBeCloseTo(100, 5)
  })

  it('0 / 100 = 0%', () => {
    expect(computeSupport(0, 100)).toBeCloseTo(0, 5)
  })

  it('3 / 10 = 30%', () => {
    expect(computeSupport(3, 10)).toBeCloseTo(30, 5)
  })

  it('5 / 20 = 25%', () => {
    expect(computeSupport(5, 20)).toBeCloseTo(25, 5)
  })

  it('returns null when totalTransactions = 0', () => {
    expect(computeSupport(3, 0)).toBeNull()
  })

  it('returns null when both zero', () => {
    expect(computeSupport(0, 0)).toBeNull()
  })
})

// ── computeConfidence — formula: itemset / antecedent × 100 ──────────────────

describe('computeConfidence — formula verification', () => {
  it('2 / 5 = 40%', () => {
    expect(computeConfidence(5, 2)).toBeCloseTo(40, 5)
  })

  it('5 / 5 = 100%', () => {
    expect(computeConfidence(5, 5)).toBeCloseTo(100, 5)
  })

  it('1 / 10 = 10%', () => {
    expect(computeConfidence(10, 1)).toBeCloseTo(10, 5)
  })

  it('returns null when antecedentTransactions = 0', () => {
    expect(computeConfidence(0, 5)).toBeNull()
  })

  it('returns null when both are 0', () => {
    expect(computeConfidence(0, 0)).toBeNull()
  })

  it('0 itemset / nonzero antecedent = 0%', () => {
    expect(computeConfidence(10, 0)).toBeCloseTo(0, 5)
  })
})

// ── computeLift — formula: confidence / consequentSupport ────────────────────

describe('computeLift — formula: confidence / consequentSupport', () => {
  it('lift = 1 when confidence equals consequentSupport (independent)', () => {
    expect(computeLift(40, 40)).toBeCloseTo(1.0, 5)
  })

  it('lift > 1 for positive association (confidence=60, support=20)', () => {
    const r = computeLift(60, 20)
    expect(r).not.toBeNull()
    expect(r!).toBeGreaterThan(1)
    expect(r!).toBeCloseTo(3.0, 5)
  })

  it('lift < 1 for negative association (confidence=10, support=50)', () => {
    const r = computeLift(10, 50)
    expect(r).not.toBeNull()
    expect(r!).toBeLessThan(1)
    expect(r!).toBeCloseTo(0.2, 5)
  })

  it('returns null if confidence is null', () => {
    expect(computeLift(null, 30)).toBeNull()
  })

  it('returns null if consequentSupport is null', () => {
    expect(computeLift(60, null)).toBeNull()
  })

  it('returns null if consequentSupport = 0 (division by zero)', () => {
    expect(computeLift(50, 0)).toBeNull()
  })

  it('lift = 2 when confidence = 2 × consequentSupport', () => {
    expect(computeLift(50, 25)).toBeCloseTo(2.0, 5)
  })
})

// ── classifyAssociationStrength — all 5 categories ───────────────────────────

describe('classifyAssociationStrength — all classification levels', () => {
  it('insufficient_data when both lift and confidence are null', () => {
    expect(classifyAssociationStrength(null, null)).toBe('insufficient_data')
  })

  it('insufficient_data when only lift is null', () => {
    expect(classifyAssociationStrength(null, 80)).toBe('insufficient_data')
  })

  it('strong: lift=3, confidence=70', () => {
    expect(classifyAssociationStrength(3, 70)).toBe('strong')
  })

  it('strong at exact boundary: lift=2, confidence=50', () => {
    expect(classifyAssociationStrength(2, 50)).toBe('strong')
  })

  it('not strong if lift=2 but confidence=49 → moderate', () => {
    expect(classifyAssociationStrength(2, 49)).toBe('moderate')
  })

  it('moderate: lift=1.8, confidence=40', () => {
    expect(classifyAssociationStrength(1.8, 40)).toBe('moderate')
  })

  it('moderate at boundary: lift=1.5, confidence=30', () => {
    expect(classifyAssociationStrength(1.5, 30)).toBe('moderate')
  })

  it('weak: lift=1.2, confidence=20', () => {
    expect(classifyAssociationStrength(1.2, 20)).toBe('weak')
  })

  it('weak: lift just above 1 (1.01)', () => {
    expect(classifyAssociationStrength(1.01, 5)).toBe('weak')
  })

  it('none: lift = 1.0 exactly', () => {
    expect(classifyAssociationStrength(1.0, 60)).toBe('none')
  })

  it('none: lift < 1 (negative association)', () => {
    expect(classifyAssociationStrength(0.7, 80)).toBe('none')
  })

  it('none: lift = 0', () => {
    expect(classifyAssociationStrength(0, 100)).toBe('none')
  })
})

// ── computeItemsetPairs — with single-item transactions ───────────────────────

describe('computeItemsetPairs — single-item and multi-item edge cases', () => {
  it('single-item transactions produce no pairs', () => {
    const txns = [
      { transaction_id: 'T1', product_ids: ['A'] },
      { transaction_id: 'T2', product_ids: ['B'] },
      { transaction_id: 'T3', product_ids: ['C'] },
    ]
    expect(computeItemsetPairs(txns).size).toBe(0)
  })

  it('empty transaction list → empty map', () => {
    expect(computeItemsetPairs([]).size).toBe(0)
  })

  it('pair keys are sorted alphabetically (smaller first)', () => {
    const txns = [{ transaction_id: 'T1', product_ids: ['Z', 'A', 'M'] }]
    const pairs = computeItemsetPairs(txns)
    expect(pairs.has('A|M')).toBe(true)
    expect(pairs.has('A|Z')).toBe(true)
    expect(pairs.has('M|Z')).toBe(true)
    // Check none have wrong order
    expect(pairs.has('M|A')).toBe(false)
    expect(pairs.has('Z|A')).toBe(false)
  })

  it('3-item transaction produces exactly 3 pairs', () => {
    const txns = [{ transaction_id: 'T1', product_ids: ['X', 'Y', 'Z'] }]
    expect(computeItemsetPairs(txns).size).toBe(3)
  })

  it('4-item transaction produces exactly 6 pairs', () => {
    const txns = [{ transaction_id: 'T1', product_ids: ['A', 'B', 'C', 'D'] }]
    expect(computeItemsetPairs(txns).size).toBe(6)
  })

  it('duplicate product IDs within a transaction are deduplicated', () => {
    const txns = [{ transaction_id: 'T1', product_ids: ['A', 'B', 'A'] }]
    const pairs = computeItemsetPairs(txns)
    expect(pairs.size).toBe(1)
    expect(pairs.get('A|B')).toBe(1)
  })

  it('pair count accumulates across transactions', () => {
    const txns = [
      { transaction_id: 'T1', product_ids: ['A', 'B'] },
      { transaction_id: 'T2', product_ids: ['A', 'B'] },
      { transaction_id: 'T3', product_ids: ['A', 'B'] },
    ]
    expect(computeItemsetPairs(txns).get('A|B')).toBe(3)
  })
})

// ── findTopCrossSellOpportunities — ranking by lift ───────────────────────────

describe('findTopCrossSellOpportunities — ranking and output shape', () => {
  const rules = [
    { antecedent: 'p1', consequent: 'p2', confidence_pct: 50, lift: 1.5 },
    { antecedent: 'p3', consequent: 'p4', confidence_pct: 80, lift: 4.0 },
    { antecedent: 'p5', consequent: 'p6', confidence_pct: 65, lift: 2.5 },
  ]
  const names = new Map([['p1', 'Product A'], ['p2', 'Product B'], ['p3', 'Product C'], ['p4', 'Product D'], ['p5', 'Product E'], ['p6', 'Product F']])

  it('results maintain the input order (rules already sorted by lift before passing)', () => {
    const sorted = [...rules].sort((a, b) => (b.lift ?? 0) - (a.lift ?? 0))
    const result = findTopCrossSellOpportunities(sorted, names, 10)
    expect(result[0].lift).toBe(4.0)
    expect(result[1].lift).toBe(2.5)
    expect(result[2].lift).toBe(1.5)
  })

  it('topN=1 returns only first rule', () => {
    const result = findTopCrossSellOpportunities(rules, names, 1)
    expect(result.length).toBe(1)
  })

  it('each result has if_buying, also_buy, confidence_pct, lift, strength', () => {
    const result = findTopCrossSellOpportunities(rules, names, 1)
    expect(result[0]).toHaveProperty('if_buying')
    expect(result[0]).toHaveProperty('also_buy')
    expect(result[0]).toHaveProperty('confidence_pct')
    expect(result[0]).toHaveProperty('lift')
    expect(result[0]).toHaveProperty('strength')
  })

  it('falls back to product_id string when name is not in map', () => {
    const result = findTopCrossSellOpportunities(
      [{ antecedent: 'unknown1', consequent: 'unknown2', confidence_pct: 60, lift: 2.0 }],
      new Map(),
      5,
    )
    expect(result[0].if_buying).toBe('unknown1')
    expect(result[0].also_buy).toBe('unknown2')
  })

  it('strength is computed correctly: lift=4, conf=80 → strong', () => {
    const result = findTopCrossSellOpportunities(
      [{ antecedent: 'x', consequent: 'y', confidence_pct: 80, lift: 4.0 }],
      new Map([['x', 'X'], ['y', 'Y']]),
      5,
    )
    expect(result[0].strength).toBe('strong')
  })

  it('strength is computed correctly: lift=1.6, conf=35 → moderate', () => {
    const result = findTopCrossSellOpportunities(
      [{ antecedent: 'x', consequent: 'y', confidence_pct: 35, lift: 1.6 }],
      new Map(),
      5,
    )
    expect(result[0].strength).toBe('moderate')
  })

  it('empty rules → empty result', () => {
    expect(findTopCrossSellOpportunities([], new Map(), 10)).toEqual([])
  })
})
