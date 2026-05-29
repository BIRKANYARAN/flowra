// tests/partner.test.ts
//
// Pure-math tests for the equalization kernel.
// No DB, no mocking — only computeEqualization().
//
// ── Formula ──────────────────────────────────────────────────────────────────
//   per_unit_i  = total_contributed_try_i / share_ratio_i
//   baseline    = MAX(per_unit_i)   ← highest per-unit contributor sets the target
//   eq_needed_i = max(0, baseline × share_ratio_i − total_contributed_try_i)
//              = max(0, (baseline − per_unit_i) × share_ratio_i)
//
//   Distribution from `distributable`:
//     Case A — distributable ≥ Σ eq_needed:
//       Pay full equalization to all under-funded partners.
//       Remaining = distributable − Σ eq_needed → split pro-rata by share_ratio.
//     Case B — distributable < Σ eq_needed:
//       Pay equalization proportionally (by eq_needed share).
//       No pro-rata split; remaining = 0.
//
//   Invariant: Σ total_payout_i = distributable  (penny-perfect)
//
// ── Spec Example ─────────────────────────────────────────────────────────────
//   A: contributed 100k, share=0.5 → per_unit = 200k
//   B: contributed 400k, share=0.5 → per_unit = 800k
//   baseline = MAX = 800k
//   eq_A = (800k − 200k) × 0.5 = 300k  ← A is under-funded; receives equalization
//   eq_B = (800k − 800k) × 0.5 = 0     ← B is at baseline; gets only pro-rata
//   With 300k distributable: A gets 300k, B gets 0.

import { describe, it, expect } from 'vitest'
import { computeEqualization } from '@/lib/services/partner.service'

// ── Test helper ───────────────────────────────────────────────────────────────
const p = (
  partner_id: string,
  partner_name: string,
  share_ratio: number,
  total_contributed_try: number,
) => ({ partner_id, partner_name, share_ratio, total_contributed_try })

// ── 1. Edge: empty partner list ───────────────────────────────────────────────

describe('computeEqualization — empty partners', () => {
  it('returns zero baseline and empty entries', () => {
    const r = computeEqualization({ partners: [] })
    expect(r.baseline_per_unit).toBe(0)
    expect(r.total_equalization).toBe(0)
    expect(r.remaining_after_eq).toBe(0)
    expect(r.entries).toHaveLength(0)
  })

  it('passes distributable through as remaining when no partners', () => {
    const r = computeEqualization({ partners: [], distributable: 50_000 })
    expect(r.distributable).toBe(50_000)
    expect(r.remaining_after_eq).toBe(50_000)
  })
})

// ── 2. Single partner ─────────────────────────────────────────────────────────

describe('computeEqualization — single partner', () => {
  it('baseline = per_unit; equalization_amount = 0 (already at baseline)', () => {
    const r = computeEqualization({
      partners: [p('a', 'Alice', 1.0, 500_000)],
    })
    expect(r.baseline_per_unit).toBe(500_000)
    expect(r.total_equalization).toBe(0)
    expect(r.entries[0].equalization_amount).toBe(0)
    expect(r.entries[0].per_unit_contribution).toBe(500_000)
  })

  it('full distributable goes to pro-rata when single partner (no equalization needed)', () => {
    const r = computeEqualization({
      partners: [p('a', 'Alice', 1.0, 500_000)],
      distributable: 100_000,
    })
    expect(r.entries[0].equalization_amount).toBe(0)
    expect(r.entries[0].pro_rata_share).toBe(100_000)
    expect(r.entries[0].total_payout).toBe(100_000)
  })
})

// ── 3. Equal shares, unequal contributions — spec example ────────────────────

describe('computeEqualization — 50/50 spec example (A=100k, B=400k)', () => {
  // per_unit_A = 100k/0.5 = 200k
  // per_unit_B = 400k/0.5 = 800k
  // baseline = MAX = 800k
  // eq_A = (800k − 200k) × 0.5 = 300k
  // eq_B = (800k − 800k) × 0.5 = 0

  it('baseline = MAX per-unit = 800k', () => {
    const r = computeEqualization({
      partners: [p('a', 'Alice', 0.5, 100_000), p('b', 'Bob', 0.5, 400_000)],
    })
    expect(r.baseline_per_unit).toBe(800_000)
  })

  it('Alice (under-funded) has eq_needed = 300k', () => {
    const r = computeEqualization({
      partners: [p('a', 'Alice', 0.5, 100_000), p('b', 'Bob', 0.5, 400_000)],
    })
    expect(r.total_equalization).toBe(300_000)
    expect(r.entries.find(e => e.partner_id === 'a')!.per_unit_contribution).toBe(200_000)
  })

  it('Bob (at baseline) has equalization = 0', () => {
    const r = computeEqualization({
      partners: [p('a', 'Alice', 0.5, 100_000), p('b', 'Bob', 0.5, 400_000)],
    })
    const bob = r.entries.find(e => e.partner_id === 'b')!
    expect(bob.per_unit_contribution).toBe(800_000)
    expect(bob.equalization_amount).toBe(0)
  })

  it('with exactly 300k distributable: Alice gets 300k, Bob gets 0', () => {
    const r = computeEqualization({
      partners: [p('a', 'Alice', 0.5, 100_000), p('b', 'Bob', 0.5, 400_000)],
      distributable: 300_000,
    })
    const alice = r.entries.find(e => e.partner_id === 'a')!
    const bob   = r.entries.find(e => e.partner_id === 'b')!

    expect(r.remaining_after_eq).toBe(0)
    expect(alice.equalization_amount).toBe(300_000)
    expect(alice.pro_rata_share).toBe(0)
    expect(alice.total_payout).toBe(300_000)
    expect(bob.equalization_amount).toBe(0)
    expect(bob.pro_rata_share).toBe(0)
    expect(bob.total_payout).toBe(0)

    // After: Alice total = 100k + 300k = 400k → per_unit = 800k = baseline ✓
    expect((100_000 + alice.total_payout) / 0.5).toBe(800_000)
  })

  it('with 400k distributable: Alice gets 300k eq + 50k pro-rata; Bob gets 50k pro-rata', () => {
    const r = computeEqualization({
      partners: [p('a', 'Alice', 0.5, 100_000), p('b', 'Bob', 0.5, 400_000)],
      distributable: 400_000,
    })
    const alice = r.entries.find(e => e.partner_id === 'a')!
    const bob   = r.entries.find(e => e.partner_id === 'b')!

    expect(r.remaining_after_eq).toBe(100_000)
    expect(alice.equalization_amount).toBe(300_000)
    expect(alice.pro_rata_share).toBe(50_000)
    expect(alice.total_payout).toBe(350_000)
    expect(bob.equalization_amount).toBe(0)
    expect(bob.pro_rata_share).toBe(50_000)
    expect(bob.total_payout).toBe(50_000)

    // Invariant: payouts sum to distributable
    expect(alice.total_payout + bob.total_payout).toBe(400_000)
  })

  it('with 0 distributable: equalization amounts shown, all payouts = 0', () => {
    const r = computeEqualization({
      partners: [p('a', 'Alice', 0.5, 100_000), p('b', 'Bob', 0.5, 400_000)],
      distributable: 0,
    })
    expect(r.total_equalization).toBe(300_000)   // need shown for info
    expect(r.remaining_after_eq).toBe(0)
    for (const e of r.entries) {
      expect(e.equalization_amount).toBe(0)
      expect(e.pro_rata_share).toBe(0)
      expect(e.total_payout).toBe(0)
    }
  })
})

// ── 4. Unequal shares — 66 / 34 ──────────────────────────────────────────────

describe('computeEqualization — unequal shares (66/34)', () => {
  // A: share=0.66, contributed 330k → per_unit = 330k/0.66 = 500k
  // B: share=0.34, contributed 340k → per_unit = 340k/0.34 = 1000k
  // baseline = MAX = 1000k
  // eq_A = (1000k − 500k) × 0.66 = 330k
  // eq_B = (1000k − 1000k) × 0.34 = 0
  // total_equalization = 330k

  it('baseline = 1000k; eq_A = 330k; eq_B = 0', () => {
    const r = computeEqualization({
      partners: [p('a', 'Alpha', 0.66, 330_000), p('b', 'Beta', 0.34, 340_000)],
    })
    expect(r.baseline_per_unit).toBeCloseTo(1_000_000, 0)
    expect(r.total_equalization).toBeCloseTo(330_000, 0)
    expect(r.entries.find(e => e.partner_id === 'b')!.equalization_amount).toBe(0)
  })

  it('with 330k distributable: Alpha gets full equalization, Beta gets 0', () => {
    const r = computeEqualization({
      partners: [p('a', 'Alpha', 0.66, 330_000), p('b', 'Beta', 0.34, 340_000)],
      distributable: 330_000,
    })
    const alpha = r.entries.find(e => e.partner_id === 'a')!
    const beta  = r.entries.find(e => e.partner_id === 'b')!

    expect(r.remaining_after_eq).toBeCloseTo(0, 1)
    expect(alpha.equalization_amount).toBeCloseTo(330_000, 0)
    expect(beta.equalization_amount).toBe(0)
    expect(alpha.total_payout + beta.total_payout).toBeCloseTo(330_000, 1)
  })

  it('with 430k distributable: equalization first, then 66/34 pro-rata of remainder', () => {
    const r = computeEqualization({
      partners: [p('a', 'Alpha', 0.66, 330_000), p('b', 'Beta', 0.34, 340_000)],
      distributable: 430_000,
    })
    const remaining = 430_000 - 330_000  // = 100k
    const alpha = r.entries.find(e => e.partner_id === 'a')!
    const beta  = r.entries.find(e => e.partner_id === 'b')!

    expect(r.remaining_after_eq).toBeCloseTo(remaining, 0)
    expect(alpha.equalization_amount).toBeCloseTo(330_000, 0)
    expect(alpha.pro_rata_share).toBeCloseTo(remaining * 0.66, 0)
    expect(beta.pro_rata_share).toBeCloseTo(remaining * 0.34, 0)
    // Total payout invariant
    expect(alpha.total_payout + beta.total_payout).toBeCloseTo(430_000, 1)
  })
})

// ── 5. Three partners, mixed state ───────────────────────────────────────────

describe('computeEqualization — three partners', () => {
  // A: share=0.4, contributed 200k → per_unit = 500k
  // B: share=0.4, contributed 400k → per_unit = 1000k   ← baseline
  // C: share=0.2, contributed 100k → per_unit = 500k
  // baseline = MAX = 1000k
  // eq_A = (1000k − 500k) × 0.4 = 200k
  // eq_B = (1000k − 1000k) × 0.4 = 0
  // eq_C = (1000k − 500k) × 0.2 = 100k
  // total_equalization = 300k

  const partners3 = [
    p('a', 'A', 0.4, 200_000),
    p('b', 'B', 0.4, 400_000),
    p('c', 'C', 0.2, 100_000),
  ]

  it('baseline = 1000k; total_equalization_needed = 300k (200k for A + 100k for C)', () => {
    const r = computeEqualization({ partners: partners3 })
    expect(r.baseline_per_unit).toBe(1_000_000)
    expect(r.total_equalization).toBe(300_000)   // informational need
    // With no distributable, actual payouts are all 0
    for (const e of r.entries) {
      expect(e.equalization_amount).toBe(0)
      expect(e.total_payout).toBe(0)
    }
    // Per-unit contributions reflect the input
    expect(r.entries.find(e => e.partner_id === 'a')!.per_unit_contribution).toBe(500_000)
    expect(r.entries.find(e => e.partner_id === 'b')!.per_unit_contribution).toBe(1_000_000)
    expect(r.entries.find(e => e.partner_id === 'c')!.per_unit_contribution).toBe(500_000)
  })

  it('with 300k distributable: A=200k, B=0, C=100k; no remainder', () => {
    const r = computeEqualization({ partners: partners3, distributable: 300_000 })
    const a = r.entries.find(e => e.partner_id === 'a')!
    const b = r.entries.find(e => e.partner_id === 'b')!
    const c = r.entries.find(e => e.partner_id === 'c')!

    expect(r.remaining_after_eq).toBe(0)
    expect(a.equalization_amount).toBe(200_000)
    expect(b.equalization_amount).toBe(0)
    expect(c.equalization_amount).toBe(100_000)
    expect(a.total_payout + b.total_payout + c.total_payout).toBe(300_000)
  })

  it('with 600k distributable: equalization + 300k remainder split 40/40/20', () => {
    const r = computeEqualization({ partners: partners3, distributable: 600_000 })
    const a = r.entries.find(e => e.partner_id === 'a')!
    const b = r.entries.find(e => e.partner_id === 'b')!
    const c = r.entries.find(e => e.partner_id === 'c')!

    expect(r.remaining_after_eq).toBe(300_000)
    expect(a.equalization_amount).toBe(200_000)
    expect(a.pro_rata_share).toBeCloseTo(120_000, 0)   // 300k × 0.4
    expect(b.pro_rata_share).toBeCloseTo(120_000, 0)   // 300k × 0.4
    expect(c.pro_rata_share).toBeCloseTo(60_000, 0)    // 300k × 0.2
    expect(a.total_payout + b.total_payout + c.total_payout).toBe(600_000)
  })
})

// ── 6. Edge: zero contribution by one partner ─────────────────────────────────

describe('computeEqualization — zero contribution', () => {
  // A: share=0.5, contributed 0     → per_unit = 0
  // B: share=0.5, contributed 400k  → per_unit = 800k
  // baseline = 800k
  // eq_A = (800k − 0) × 0.5 = 400k
  // eq_B = 0

  it('partner with zero contribution has maximum equalization need', () => {
    const r = computeEqualization({
      partners: [p('a', 'Alice', 0.5, 0), p('b', 'Bob', 0.5, 400_000)],
    })
    expect(r.baseline_per_unit).toBe(800_000)
    expect(r.total_equalization).toBe(400_000)
  })

  it('with 400k distributable: zero-contribution partner gets everything', () => {
    const r = computeEqualization({
      partners: [p('a', 'Alice', 0.5, 0), p('b', 'Bob', 0.5, 400_000)],
      distributable: 400_000,
    })
    const alice = r.entries.find(e => e.partner_id === 'a')!
    const bob   = r.entries.find(e => e.partner_id === 'b')!

    expect(alice.total_payout).toBe(400_000)
    expect(bob.total_payout).toBe(0)
    expect(r.remaining_after_eq).toBe(0)
  })

  it('all partners contributed zero → baseline = 0; all eq = 0; full pro-rata', () => {
    const r = computeEqualization({
      partners: [p('a', 'A', 0.5, 0), p('b', 'B', 0.5, 0)],
      distributable: 100_000,
    })
    expect(r.baseline_per_unit).toBe(0)
    expect(r.total_equalization).toBe(0)
    expect(r.remaining_after_eq).toBe(100_000)
    const a = r.entries[0], b = r.entries[1]
    expect(a.equalization_amount).toBe(0)
    expect(b.equalization_amount).toBe(0)
    expect(a.total_payout + b.total_payout).toBe(100_000)
  })
})

// ── 7. Edge: fully balanced partners ─────────────────────────────────────────

describe('computeEqualization — fully balanced', () => {
  it('equal per-unit contribution → total_equalization = 0; full pro-rata', () => {
    // A: 250k / 0.5 = 500k per unit
    // B: 250k / 0.5 = 500k per unit
    const r = computeEqualization({
      partners: [p('a', 'A', 0.5, 250_000), p('b', 'B', 0.5, 250_000)],
      distributable: 100_000,
    })
    expect(r.total_equalization).toBe(0)
    expect(r.remaining_after_eq).toBe(100_000)
    const a = r.entries[0], b = r.entries[1]
    expect(a.equalization_amount).toBe(0)
    expect(b.equalization_amount).toBe(0)
    expect(a.pro_rata_share).toBe(50_000)
    expect(b.pro_rata_share).toBe(50_000)
  })

  it('balanced with unequal shares (40/60) → pro-rata split by share_ratio', () => {
    // A: 200k / 0.4 = 500k per unit
    // B: 300k / 0.6 = 500k per unit  → already balanced
    const r = computeEqualization({
      partners: [p('a', 'A', 0.4, 200_000), p('b', 'B', 0.6, 300_000)],
      distributable: 100_000,
    })
    expect(r.total_equalization).toBe(0)
    const a = r.entries.find(e => e.partner_id === 'a')!
    const b = r.entries.find(e => e.partner_id === 'b')!
    expect(a.pro_rata_share).toBe(40_000)    // 100k × 0.4
    expect(b.pro_rata_share).toBe(60_000)    // 100k × 0.6
  })
})

// ── 8. Partial distributable (distributable < total_equalization) ─────────────

describe('computeEqualization — partial distributable', () => {
  // A: 100k, share=0.5 → eq_needed = 300k
  // B: 400k, share=0.5 → eq_needed = 0
  // total_eq_needed = 300k

  it('when distributable < total_equalization, distributable goes entirely to equalization', () => {
    const r = computeEqualization({
      partners: [p('a', 'A', 0.5, 100_000), p('b', 'B', 0.5, 400_000)],
      distributable: 150_000,   // < 300k needed
    })
    expect(r.remaining_after_eq).toBe(0)
    const a = r.entries.find(e => e.partner_id === 'a')!
    const b = r.entries.find(e => e.partner_id === 'b')!

    // All 150k goes to A (only under-funded partner)
    expect(a.equalization_amount).toBe(150_000)
    expect(b.equalization_amount).toBe(0)
    expect(a.pro_rata_share).toBe(0)
    expect(b.pro_rata_share).toBe(0)
    expect(a.total_payout + b.total_payout).toBe(150_000)
  })

  it('with multiple under-funded partners, partial distributable is split proportionally', () => {
    // A: share=0.4, contributed 200k → per_unit=500k; baseline=1000k → eq_needed=200k
    // B: share=0.4, contributed 400k → per_unit=1000k; baseline=1000k → eq_needed=0
    // C: share=0.2, contributed 100k → per_unit=500k; baseline=1000k → eq_needed=100k
    // total_eq_needed = 300k; distributable = 120k (< 300k)
    // A share of eq: 200k/300k × 120k = 80k
    // C share of eq: 100k/300k × 120k = 40k

    const r = computeEqualization({
      partners: [
        p('a', 'A', 0.4, 200_000),
        p('b', 'B', 0.4, 400_000),
        p('c', 'C', 0.2, 100_000),
      ],
      distributable: 120_000,
    })
    const a = r.entries.find(e => e.partner_id === 'a')!
    const b = r.entries.find(e => e.partner_id === 'b')!
    const c = r.entries.find(e => e.partner_id === 'c')!

    expect(r.remaining_after_eq).toBe(0)
    expect(a.equalization_amount).toBeCloseTo(80_000, 0)
    expect(b.equalization_amount).toBe(0)
    expect(c.equalization_amount).toBeCloseTo(40_000, 0)
    expect(a.total_payout + b.total_payout + c.total_payout).toBe(120_000)
  })
})

// ── 9. Rounding invariants ────────────────────────────────────────────────────

describe('computeEqualization — rounding invariants', () => {
  it('Σ total_payout = distributable exactly (last-partner absorbs penny residual)', () => {
    // 3 equal partners, 100 TRY distributable — doesn't divide evenly by 3
    const r = computeEqualization({
      partners: [
        p('a', 'A', 1 / 3, 100_000),
        p('b', 'B', 1 / 3, 100_000),
        p('c', 'C', 1 / 3, 100_000),
      ],
      distributable: 100,
    })
    const total = r.entries.reduce((s, e) => s + e.total_payout, 0)
    // Must sum to exactly 100 (within floating-point epsilon)
    expect(Math.abs(total - 100)).toBeLessThanOrEqual(0.01)
  })

  it('Σ total_payout = distributable for partial equalization case', () => {
    // Partial distributable with three partners
    const r = computeEqualization({
      partners: [
        p('a', 'A', 0.4, 200_000),
        p('b', 'B', 0.4, 400_000),
        p('c', 'C', 0.2, 100_000),
      ],
      distributable: 77_777,  // arbitrary non-round number
    })
    const total = r.entries.reduce((s, e) => s + e.total_payout, 0)
    expect(Math.abs(total - 77_777)).toBeLessThanOrEqual(0.01)
  })

  it('equalization_amount + pro_rata_share = total_payout for every entry', () => {
    const r = computeEqualization({
      partners: [p('a', 'A', 0.5, 100_000), p('b', 'B', 0.5, 400_000)],
      distributable: 500_000,
    })
    for (const e of r.entries) {
      expect(Math.abs(e.equalization_amount + e.pro_rata_share - e.total_payout)).toBeLessThanOrEqual(0.01)
    }
  })
})

// ── 10. total_contributed_try field consistency ───────────────────────────────

describe('computeEqualization — entry field consistency', () => {
  it('total_contributed_try matches input', () => {
    const r = computeEqualization({
      partners: [p('a', 'Alice', 0.5, 123_456), p('b', 'Bob', 0.5, 789_012)],
    })
    const alice = r.entries.find(e => e.partner_id === 'a')!
    const bob   = r.entries.find(e => e.partner_id === 'b')!
    expect(alice.total_contributed_try).toBe(123_456)
    expect(bob.total_contributed_try).toBe(789_012)
  })

  it('per_unit_contribution = total_contributed_try / share_ratio', () => {
    const r = computeEqualization({
      partners: [p('a', 'A', 0.3, 90_000), p('b', 'B', 0.7, 700_000)],
    })
    for (const e of r.entries) {
      const expected = Math.round((e.total_contributed_try / e.share_ratio) * 100) / 100
      expect(e.per_unit_contribution).toBeCloseTo(expected, 1)
    }
  })
})

// ── 11. Case A — remainder split pro-rata by share_ratio ─────────────────────

describe('computeEqualization — Case A: remainder split pro-rata by share_ratio', () => {
  // A: share=0.5, contributed 100k → per_unit=200k; eq_needed=300k
  // B: share=0.5, contributed 400k → per_unit=800k; eq_needed=0
  // distributable=400k > 300k (eq_needed) → Case A
  // remaining = 400k - 300k = 100k → split 50/50

  it('remaining after equalization split exactly by share_ratio (50/50)', () => {
    const r = computeEqualization({
      partners: [p('a', 'Alice', 0.5, 100_000), p('b', 'Bob', 0.5, 400_000)],
      distributable: 400_000,
    })
    const alice = r.entries.find(e => e.partner_id === 'a')!
    const bob   = r.entries.find(e => e.partner_id === 'b')!

    expect(r.remaining_after_eq).toBe(100_000)
    // Remainder 100k split 50/50 by share_ratio
    expect(alice.pro_rata_share).toBeCloseTo(50_000, 0)
    expect(bob.pro_rata_share).toBeCloseTo(50_000, 0)
  })

  it('remainder split 60/40 when share_ratios differ', () => {
    // A: share=0.6, contributed=300k → per_unit=500k
    // B: share=0.4, contributed=400k → per_unit=1000k ← baseline
    // eq_A = (1000k-500k)*0.6 = 300k; eq_B=0
    // distributable=500k → remaining=200k split 60/40
    const r = computeEqualization({
      partners: [p('a', 'A', 0.6, 300_000), p('b', 'B', 0.4, 400_000)],
      distributable: 500_000,
    })
    const a = r.entries.find(e => e.partner_id === 'a')!
    const b = r.entries.find(e => e.partner_id === 'b')!

    expect(r.remaining_after_eq).toBeCloseTo(200_000, 0)
    expect(a.pro_rata_share).toBeCloseTo(120_000, 0)   // 200k * 0.6
    expect(b.pro_rata_share).toBeCloseTo(80_000, 0)    // 200k * 0.4
    expect(a.total_payout + b.total_payout).toBeCloseTo(500_000, 1)
  })

  it('large distributable — eq paid first then big remainder split pro-rata', () => {
    // 3 partners; total eq needed = 300k; distributable=1_300_000
    // remaining = 1_000k; split 40/40/20
    const r = computeEqualization({
      partners: [
        p('a', 'A', 0.4, 200_000),
        p('b', 'B', 0.4, 400_000),
        p('c', 'C', 0.2, 100_000),
      ],
      distributable: 1_300_000,
    })
    const a = r.entries.find(e => e.partner_id === 'a')!
    const b = r.entries.find(e => e.partner_id === 'b')!
    const c = r.entries.find(e => e.partner_id === 'c')!

    expect(r.remaining_after_eq).toBeCloseTo(1_000_000, 0)
    expect(a.pro_rata_share).toBeCloseTo(400_000, 0)
    expect(b.pro_rata_share).toBeCloseTo(400_000, 0)
    expect(c.pro_rata_share).toBeCloseTo(200_000, 0)
    expect(a.total_payout + b.total_payout + c.total_payout).toBeCloseTo(1_300_000, 1)
  })
})

// ── 12. Case B — distributable < Σ eq_needed: proportional payout ────────────

describe('computeEqualization — Case B: proportional payment when distributable < Σ eq_needed', () => {
  // 50/50: Alice eq_needed=300k; Bob eq_needed=0; Σ eq_needed=300k
  // distributable=100k < 300k → all goes proportionally to under-funded partners

  it('single under-funded partner gets 100% when distributable < eq_needed', () => {
    const r = computeEqualization({
      partners: [p('a', 'Alice', 0.5, 100_000), p('b', 'Bob', 0.5, 400_000)],
      distributable: 100_000,
    })
    const alice = r.entries.find(e => e.partner_id === 'a')!
    const bob   = r.entries.find(e => e.partner_id === 'b')!

    expect(r.remaining_after_eq).toBe(0)
    expect(alice.equalization_amount).toBe(100_000)
    expect(alice.pro_rata_share).toBe(0)
    expect(bob.equalization_amount).toBe(0)
    expect(bob.pro_rata_share).toBe(0)
  })

  it('two under-funded partners split partial distributable by eq_needed proportion', () => {
    // A: eq_needed=200k; C: eq_needed=100k; Σ=300k; distributable=60k
    // A gets 60k*(200/300)=40k; C gets 60k*(100/300)=20k
    const r = computeEqualization({
      partners: [
        p('a', 'A', 0.4, 200_000),
        p('b', 'B', 0.4, 400_000),
        p('c', 'C', 0.2, 100_000),
      ],
      distributable: 60_000,
    })
    const a = r.entries.find(e => e.partner_id === 'a')!
    const b = r.entries.find(e => e.partner_id === 'b')!
    const c = r.entries.find(e => e.partner_id === 'c')!

    expect(r.remaining_after_eq).toBe(0)
    expect(a.equalization_amount).toBeCloseTo(40_000, 0)
    expect(b.equalization_amount).toBe(0)
    expect(c.equalization_amount).toBeCloseTo(20_000, 0)
    expect(a.total_payout + b.total_payout + c.total_payout).toBeCloseTo(60_000, 1)
  })

  it('no pro_rata_share in Case B — all distributable is equalization', () => {
    const r = computeEqualization({
      partners: [p('a', 'A', 0.5, 0), p('b', 'B', 0.5, 400_000)],
      distributable: 100_000,
    })
    for (const e of r.entries) {
      expect(e.pro_rata_share).toBe(0)
    }
  })
})

// ── 13. 3-partner scenario with exact numbers ─────────────────────────────────

describe('computeEqualization — 3-partner scenarios', () => {
  // Partners: 1/3 each; A=100k, B=300k, C=200k
  // per_unit_A=300k, per_unit_B=900k, per_unit_C=600k
  // baseline=900k
  // eq_A=(900k-300k)*1/3=200k, eq_B=0, eq_C=(900k-600k)*1/3=100k
  // total_eq_needed=300k

  it('3 equal-share partners: baseline set by highest per-unit', () => {
    const r = computeEqualization({
      partners: [
        p('a', 'A', 1/3, 100_000),
        p('b', 'B', 1/3, 300_000),
        p('c', 'C', 1/3, 200_000),
      ],
    })
    expect(r.baseline_per_unit).toBeCloseTo(900_000, 0)
    expect(r.total_equalization).toBeCloseTo(300_000, 0)
  })

  it('3-partner: payouts sum to distributable (invariant check)', () => {
    const dist = 300_000
    const r = computeEqualization({
      partners: [
        p('a', 'A', 1/3, 100_000),
        p('b', 'B', 1/3, 300_000),
        p('c', 'C', 1/3, 200_000),
      ],
      distributable: dist,
    })
    const total = r.entries.reduce((s, e) => s + e.total_payout, 0)
    expect(Math.abs(total - dist)).toBeLessThanOrEqual(0.01)
  })

  it('3-partner Case A: excess beyond eq goes to all 3 pro-rata (1/3 each)', () => {
    const r = computeEqualization({
      partners: [
        p('a', 'A', 1/3, 100_000),
        p('b', 'B', 1/3, 300_000),
        p('c', 'C', 1/3, 200_000),
      ],
      distributable: 600_000,
    })
    const a = r.entries.find(e => e.partner_id === 'a')!
    const b = r.entries.find(e => e.partner_id === 'b')!
    const c = r.entries.find(e => e.partner_id === 'c')!

    // Remaining = 600k - 300k = 300k; split 1/3 each = 100k each
    expect(a.pro_rata_share).toBeCloseTo(100_000, 0)
    expect(b.pro_rata_share).toBeCloseTo(100_000, 0)
    expect(c.pro_rata_share).toBeCloseTo(100_000, 0)
  })
})

// ── 14. Single partner edge case ──────────────────────────────────────────────

describe('computeEqualization — single partner edge cases', () => {
  it('single partner: all distributable becomes pro_rata_share (no equalization)', () => {
    const r = computeEqualization({
      partners: [p('a', 'Solo', 1.0, 250_000)],
      distributable: 80_000,
    })
    const solo = r.entries[0]
    expect(solo.equalization_amount).toBe(0)
    expect(solo.pro_rata_share).toBe(80_000)
    expect(solo.total_payout).toBe(80_000)
  })

  it('single partner: eq_needed is always 0 (only contributor = baseline)', () => {
    const amounts = [0, 1_000, 100_000, 999_999]
    for (const amt of amounts) {
      const r = computeEqualization({ partners: [p('x', 'X', 1.0, amt)] })
      expect(r.entries[0].equalization_amount).toBe(0)
      expect(r.total_equalization).toBe(0)
    }
  })

  it('single partner with share_ratio < 1: distributable still fully assigned', () => {
    // A single partner with 0.6 share — totalRatio = 0.6 but still sole partner
    const r = computeEqualization({
      partners: [p('a', 'Sole', 0.6, 300_000)],
      distributable: 50_000,
    })
    const total = r.entries.reduce((s, e) => s + e.total_payout, 0)
    // total_payout must equal distributable
    expect(Math.abs(total - 50_000)).toBeLessThanOrEqual(0.01)
  })
})

// ── 15. Equal contributions — no equalization needed ─────────────────────────

describe('computeEqualization — equal contributions (no equalization needed)', () => {
  it('4 equal partners, equal contributions: total_equalization=0', () => {
    const r = computeEqualization({
      partners: [
        p('a', 'A', 0.25, 100_000),
        p('b', 'B', 0.25, 100_000),
        p('c', 'C', 0.25, 100_000),
        p('d', 'D', 0.25, 100_000),
      ],
      distributable: 40_000,
    })
    expect(r.total_equalization).toBe(0)
    expect(r.remaining_after_eq).toBe(40_000)
    for (const e of r.entries) {
      expect(e.equalization_amount).toBe(0)
      expect(e.pro_rata_share).toBeCloseTo(10_000, 0)
    }
  })

  it('unequal shares but equal per-unit contribution: total_equalization=0', () => {
    // A: 0.3, 150k → per_unit=500k; B: 0.7, 350k → per_unit=500k
    const r = computeEqualization({
      partners: [p('a', 'A', 0.3, 150_000), p('b', 'B', 0.7, 350_000)],
      distributable: 100_000,
    })
    expect(r.total_equalization).toBe(0)
    const a = r.entries.find(e => e.partner_id === 'a')!
    const b = r.entries.find(e => e.partner_id === 'b')!
    expect(a.equalization_amount).toBe(0)
    expect(b.equalization_amount).toBe(0)
    expect(a.pro_rata_share).toBeCloseTo(30_000, 0)  // 100k * 0.3
    expect(b.pro_rata_share).toBeCloseTo(70_000, 0)  // 100k * 0.7
  })
})

// ── 16. Σ total_payout = distributable invariant ─────────────────────────────

describe('computeEqualization — Σ total_payout invariant across scenarios', () => {
  const scenarios: Array<{ label: string; partners: ReturnType<typeof p>[]; dist: number }> = [
    { label: 'Case A simple', partners: [p('a', 'A', 0.5, 100_000), p('b', 'B', 0.5, 400_000)], dist: 400_000 },
    { label: 'Case B partial', partners: [p('a', 'A', 0.5, 100_000), p('b', 'B', 0.5, 400_000)], dist: 150_000 },
    { label: 'Zero dist', partners: [p('a', 'A', 0.5, 100_000), p('b', 'B', 0.5, 400_000)], dist: 0 },
    { label: '3-partner Case A', partners: [p('a', 'A', 0.4, 200_000), p('b', 'B', 0.4, 400_000), p('c', 'C', 0.2, 100_000)], dist: 700_000 },
    { label: '3-partner Case B', partners: [p('a', 'A', 0.4, 200_000), p('b', 'B', 0.4, 400_000), p('c', 'C', 0.2, 100_000)], dist: 50_000 },
    { label: 'Equal partners', partners: [p('a', 'A', 0.5, 300_000), p('b', 'B', 0.5, 300_000)], dist: 100_000 },
  ]

  for (const { label, partners, dist } of scenarios) {
    it(`Σ total_payout = distributable: ${label}`, () => {
      const r = computeEqualization({ partners, distributable: dist })
      const total = r.entries.reduce((s, e) => s + e.total_payout, 0)
      expect(Math.abs(total - dist)).toBeLessThanOrEqual(0.01)
    })
  }
})

// ── 17. Fractional share ratios ───────────────────────────────────────────────

describe('computeEqualization — fractional share ratios', () => {
  it('share ratios as 1/3 each work correctly (floating point)', () => {
    const r = computeEqualization({
      partners: [
        p('a', 'A', 1/3, 100_000),
        p('b', 'B', 1/3, 100_000),
        p('c', 'C', 1/3, 100_000),
      ],
      distributable: 99_999,
    })
    const total = r.entries.reduce((s, e) => s + e.total_payout, 0)
    expect(Math.abs(total - 99_999)).toBeLessThanOrEqual(0.01)
  })

  it('very small share (0.01) partner receives proportional payout', () => {
    // A: 0.99, B: 0.01 — same per_unit (no equalization)
    const r = computeEqualization({
      partners: [p('a', 'Big', 0.99, 990_000), p('b', 'Small', 0.01, 10_000)],
      distributable: 100_000,
    })
    const big   = r.entries.find(e => e.partner_id === 'a')!
    const small = r.entries.find(e => e.partner_id === 'b')!

    // per_unit_A=1_000_000; per_unit_B=1_000_000 → balanced
    expect(r.total_equalization).toBe(0)
    expect(big.pro_rata_share).toBeCloseTo(99_000, 0)
    expect(small.pro_rata_share).toBeCloseTo(1_000, 0)
    expect(big.total_payout + small.total_payout).toBeCloseTo(100_000, 1)
  })
})

// ── 18. Near-zero distributable ───────────────────────────────────────────────

describe('computeEqualization — near-zero distributable', () => {
  it('distributable=1 TRY still allocates correctly', () => {
    const r = computeEqualization({
      partners: [p('a', 'A', 0.5, 100_000), p('b', 'B', 0.5, 400_000)],
      distributable: 1,
    })
    // eq_needed_A=300k; distributable=1 < 300k → Case B
    const a = r.entries.find(e => e.partner_id === 'a')!
    const total = r.entries.reduce((s, e) => s + e.total_payout, 0)
    expect(a.equalization_amount).toBeCloseTo(1, 1)
    expect(Math.abs(total - 1)).toBeLessThanOrEqual(0.01)
  })

  it('distributable=0.01 TRY (one kuruş): total payout = 0.01', () => {
    const r = computeEqualization({
      partners: [p('a', 'A', 0.5, 100_000), p('b', 'B', 0.5, 400_000)],
      distributable: 0.01,
    })
    const total = r.entries.reduce((s, e) => s + e.total_payout, 0)
    expect(Math.abs(total - 0.01)).toBeLessThanOrEqual(0.01)
  })

  it('negative distributable treated as zero: payouts all 0', () => {
    const r = computeEqualization({
      partners: [p('a', 'A', 0.5, 100_000), p('b', 'B', 0.5, 400_000)],
      distributable: -1_000,
    })
    for (const e of r.entries) {
      expect(e.total_payout).toBe(0)
    }
  })
})
