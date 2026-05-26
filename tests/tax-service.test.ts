/**
 * TaxService pure-function unit tests.
 *
 * Tests cover:
 *   • computeKDVFromRows()   — pure VAT computation from row arrays
 *   • computeFilingDueDate() — Turkish KDV filing due-date rule
 *
 * Run with: npx vitest run tests/tax-service.test.ts
 */

import { describe, it, expect } from 'vitest'
import {
  computeKDVFromRows,
  computeFilingDueDate,
} from '../lib/services/tax.service'

// ─────────────────────────────────────────────────────────────────────────────
// computeKDVFromRows()
// ─────────────────────────────────────────────────────────────────────────────

describe('computeKDVFromRows()', () => {
  it('empty inputs → all zeros, vat_payable false', () => {
    const r = computeKDVFromRows([], [])
    expect(r.output_vat_try).toBe(0)
    expect(r.input_vat_try).toBe(0)
    expect(r.net_vat_try).toBe(0)
    expect(r.vat_payable).toBe(false)
  })

  it('sales only → output = sum(kdv_amount_try), input = 0', () => {
    const r = computeKDVFromRows(
      [
        { kdv_amount_try: 1800, tax_rate: 18 },
        { kdv_amount_try: 400,  tax_rate: 8  },
      ],
      [],
    )
    expect(r.output_vat_try).toBe(2200)
    expect(r.input_vat_try).toBe(0)
    expect(r.net_vat_try).toBe(2200)
    expect(r.vat_payable).toBe(true)
  })

  it('expenses only → output = 0, input = sum(kdv_deductible_try)', () => {
    const r = computeKDVFromRows(
      [],
      [
        { kdv_deductible_try: 500 },
        { kdv_deductible_try: 300 },
      ],
    )
    expect(r.output_vat_try).toBe(0)
    expect(r.input_vat_try).toBe(800)
    expect(r.net_vat_try).toBe(-800)
    expect(r.vat_payable).toBe(false)
  })

  it('net positive → vat_payable true', () => {
    const r = computeKDVFromRows(
      [{ kdv_amount_try: 5000 }],
      [{ kdv_deductible_try: 2000 }],
    )
    expect(r.net_vat_try).toBe(3000)
    expect(r.vat_payable).toBe(true)
  })

  it('net negative → vat_payable false (refund / carry forward)', () => {
    const r = computeKDVFromRows(
      [{ kdv_amount_try: 1000 }],
      [{ kdv_deductible_try: 3000 }],
    )
    expect(r.net_vat_try).toBe(-2000)
    expect(r.vat_payable).toBe(false)
  })

  it('mixed rates → correct output total regardless of rate', () => {
    // 8% on 50000 base = 4000; 18% on 100000 base = 18000 → total output = 22000
    const r = computeKDVFromRows(
      [
        { kdv_amount_try: 4000,  tax_rate: 8  },
        { kdv_amount_try: 18000, tax_rate: 18 },
      ],
      [{ kdv_deductible_try: 5000 }],
    )
    expect(r.output_vat_try).toBe(22000)
    expect(r.input_vat_try).toBe(5000)
    expect(r.net_vat_try).toBe(17000)
    expect(r.vat_payable).toBe(true)
  })

  it('zero net → vat_payable false (exactly equal output and input)', () => {
    const r = computeKDVFromRows(
      [{ kdv_amount_try: 1500 }],
      [{ kdv_deductible_try: 1500 }],
    )
    expect(r.net_vat_try).toBe(0)
    expect(r.vat_payable).toBe(false)
  })

  it('rounding to 2 decimal places', () => {
    // 0.1 + 0.2 = 0.30000000000000004 in IEEE 754; round2 should normalise to 0.30
    const r = computeKDVFromRows(
      [{ kdv_amount_try: 0.1 }, { kdv_amount_try: 0.2 }],
      [{ kdv_deductible_try: 0.005 }],
    )
    // output = 0.30 (round2 of 0.30000000000000004)
    // input  = 0.01 (round2 of 0.005 rounds to 0.01)
    // net    = 0.29
    expect(r.output_vat_try).toBe(0.3)
    expect(r.input_vat_try).toBe(0.01)
    expect(r.net_vat_try).toBe(0.29)
    expect(String(r.output_vat_try).split('.')[1]?.length ?? 0).toBeLessThanOrEqual(2)
    expect(String(r.input_vat_try).split('.')[1]?.length ?? 0).toBeLessThanOrEqual(2)
    expect(String(r.net_vat_try).split('.')[1]?.length ?? 0).toBeLessThanOrEqual(2)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// computeFilingDueDate()
// ─────────────────────────────────────────────────────────────────────────────

describe('computeFilingDueDate()', () => {
  it('end of May → 26th of June in same year', () => {
    expect(computeFilingDueDate('2026-05-31')).toBe('2026-06-26')
  })

  it('end of December → 26th of January next year', () => {
    expect(computeFilingDueDate('2026-12-31')).toBe('2027-01-26')
  })

  it('end of January → 26th of February', () => {
    expect(computeFilingDueDate('2026-01-31')).toBe('2026-02-26')
  })

  it('end of November → 26th of December same year', () => {
    expect(computeFilingDueDate('2025-11-30')).toBe('2025-12-26')
  })
})
