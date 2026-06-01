// Node-env tests for lib/db/guards.ts — the financial-integrity assertions that
// enforce the system's core accounting invariants (double-entry balance, TTK 509
// dividend rules, TTK 519 legal reserve, FIFO cost immutability, period locks,
// payment-within-balance). These are the last line of defense before critical
// mutations and had ZERO test coverage. Each test asserts both the pass path and
// the throw path (including the stable GuardCode + the 0.01/0.001 tolerances).
import { describe, it, expect } from 'vitest'
import {
  FinancialIntegrityError,
  assertPositiveAmount,
  assertNonNegativeAmount,
  assertPaymentWithinBalance,
  assertPeriodOpen,
  assertPeriodNotLocked,
  assertBalancedEntry,
  assertTrialBalanceBalanced,
  assertFifoCostImmutable,
  assertDistributablePositive,
  assertDividendWithinProfit,
  assertLegalReserveAllocated,
  safeGuard,
} from '@/lib/db/guards'

// Helper: assert a guard throws a FinancialIntegrityError carrying `code`.
function expectGuardCode(fn: () => void, code: string) {
  try {
    fn()
    throw new Error('expected guard to throw, but it passed')
  } catch (e) {
    expect(e).toBeInstanceOf(FinancialIntegrityError)
    expect((e as FinancialIntegrityError).code).toBe(code)
  }
}

describe('assertPositiveAmount', () => {
  it('passes for strictly positive amounts', () => {
    expect(() => assertPositiveAmount(0.01)).not.toThrow()
    expect(() => assertPositiveAmount(1000)).not.toThrow()
  })
  it('throws for zero, negative, NaN and Infinity', () => {
    for (const bad of [0, -1, NaN, Infinity, -Infinity]) expectGuardCode(() => assertPositiveAmount(bad), 'AMOUNT_MUST_BE_POSITIVE')
  })
  it('includes the field name + amount in the error context', () => {
    try { assertPositiveAmount(-5, 'Satış Tutarı') } catch (e) {
      expect((e as FinancialIntegrityError).context).toMatchObject({ fieldName: 'Satış Tutarı', amount: -5 })
    }
  })
})

describe('assertNonNegativeAmount', () => {
  it('passes for zero and positive (zero is allowed, unlike positive guard)', () => {
    expect(() => assertNonNegativeAmount(0)).not.toThrow()
    expect(() => assertNonNegativeAmount(10)).not.toThrow()
  })
  it('throws for negative and NaN', () => {
    for (const bad of [-0.01, -100, NaN]) expectGuardCode(() => assertNonNegativeAmount(bad), 'AMOUNT_MUST_BE_NON_NEGATIVE')
  })
})

describe('assertPaymentWithinBalance', () => {
  it('passes when payment equals the outstanding balance', () => {
    expect(() => assertPaymentWithinBalance({ payment: 400, totalTry: 1000, amountPaid: 600 })).not.toThrow()
  })
  it('allows a 0.01 floating-point tolerance', () => {
    expect(() => assertPaymentWithinBalance({ payment: 400.01, totalTry: 1000, amountPaid: 600 })).not.toThrow()
  })
  it('throws when payment exceeds outstanding beyond tolerance', () => {
    expectGuardCode(() => assertPaymentWithinBalance({ payment: 400.5, totalTry: 1000, amountPaid: 600 }), 'PAYMENT_EXCEEDS_OUTSTANDING')
  })
  it('treats an over-paid sale as zero outstanding (no negative balance)', () => {
    expectGuardCode(() => assertPaymentWithinBalance({ payment: 1, totalTry: 1000, amountPaid: 1000 }), 'PAYMENT_EXCEEDS_OUTSTANDING')
  })
})

describe('assertPeriodOpen / assertPeriodNotLocked', () => {
  it('open and adjustment periods accept writes', () => {
    expect(() => assertPeriodOpen('open')).not.toThrow()
    expect(() => assertPeriodOpen('adjustment')).not.toThrow()
  })
  it('pre_close / closed / locked reject writes', () => {
    for (const st of ['pre_close', 'closed', 'locked'] as const) expectGuardCode(() => assertPeriodOpen(st), 'PERIOD_NOT_OPEN')
  })
  it('assertPeriodNotLocked throws only for locked', () => {
    for (const st of ['open', 'pre_close', 'closed', 'adjustment'] as const) expect(() => assertPeriodNotLocked(st)).not.toThrow()
    expectGuardCode(() => assertPeriodNotLocked('locked'), 'PERIOD_ALREADY_LOCKED')
  })
})

describe('assertBalancedEntry (double-entry)', () => {
  it('passes when Σdebits = Σcredits', () => {
    expect(() => assertBalancedEntry({ lines: [
      { debit_try: 100, credit_try: 0 }, { debit_try: 0, credit_try: 100 },
    ] })).not.toThrow()
  })
  it('tolerates a ≤0.01 rounding imbalance', () => {
    expect(() => assertBalancedEntry({ lines: [
      { debit_try: 100.005, credit_try: 0 }, { debit_try: 0, credit_try: 100 },
    ] })).not.toThrow()
  })
  it('throws when debits and credits diverge beyond tolerance', () => {
    expectGuardCode(() => assertBalancedEntry({ lines: [
      { debit_try: 100, credit_try: 0 }, { debit_try: 0, credit_try: 90 },
    ] }), 'JOURNAL_ENTRY_UNBALANCED')
  })
})

describe('assertTrialBalanceBalanced', () => {
  it('passes within tolerance and throws beyond it', () => {
    expect(() => assertTrialBalanceBalanced({ totalDebits: 5000, totalCredits: 5000 })).not.toThrow()
    expectGuardCode(() => assertTrialBalanceBalanced({ totalDebits: 5000, totalCredits: 4999 }), 'TRIAL_BALANCE_UNBALANCED')
  })
})

describe('assertFifoCostImmutable', () => {
  it('passes when cost is unchanged (within 0.001)', () => {
    expect(() => assertFifoCostImmutable({ currentCostTry: 12.5, newCostTry: 12.5 })).not.toThrow()
    expect(() => assertFifoCostImmutable({ currentCostTry: 12.5, newCostTry: 12.5005 })).not.toThrow()
  })
  it('throws when cost changes beyond 0.001', () => {
    expectGuardCode(() => assertFifoCostImmutable({ currentCostTry: 12.5, newCostTry: 12.6 }), 'FIFO_COST_IMMUTABLE')
  })
})

describe('assertDistributablePositive / assertDividendWithinProfit (TTK 509)', () => {
  it('distributable: passes at zero, throws when negative', () => {
    expect(() => assertDistributablePositive({ distributableNet: 0 })).not.toThrow()
    expectGuardCode(() => assertDistributablePositive({ distributableNet: -0.5 }), 'DISTRIBUTABLE_NEGATIVE')
  })
  it('dividend: passes at the cap (+tolerance), throws above it', () => {
    expect(() => assertDividendWithinProfit({ declaredGross: 1000, distributableNet: 1000 })).not.toThrow()
    expectGuardCode(() => assertDividendWithinProfit({ declaredGross: 1000.5, distributableNet: 1000 }), 'DIVIDEND_EXCEEDS_PROFIT')
  })
})

describe('assertLegalReserveAllocated (TTK 519 — 5% of profit, capped at 20% of capital)', () => {
  it('requires 5% of profit when reserves are well below the cap', () => {
    // capital 1M → cap 200k; existing 0 → gap 200k; required = min(100k×5%, 200k) = 5k
    expect(() => assertLegalReserveAllocated({ periodProfitTry: 100_000, legalReserveAllocatedTry: 5_000, existingReservesTry: 0, paidInCapitalTry: 1_000_000 })).not.toThrow()
    expectGuardCode(() => assertLegalReserveAllocated({ periodProfitTry: 100_000, legalReserveAllocatedTry: 4_000, existingReservesTry: 0, paidInCapitalTry: 1_000_000 }), 'LEGAL_RESERVE_INSUFFICIENT')
  })
  it('caps the requirement at the remaining gap to 20% of paid-in capital', () => {
    // cap 200k; existing 199k → gap 1k; required = min(100k×5%=5k, 1k) = 1k, not 5k
    expect(() => assertLegalReserveAllocated({ periodProfitTry: 100_000, legalReserveAllocatedTry: 1_000, existingReservesTry: 199_000, paidInCapitalTry: 1_000_000 })).not.toThrow()
  })
  it('requires nothing once reserves already meet the cap', () => {
    // existing 200k ≥ cap 200k → gap 0 → required 0; allocating 0 is fine
    expect(() => assertLegalReserveAllocated({ periodProfitTry: 100_000, legalReserveAllocatedTry: 0, existingReservesTry: 200_000, paidInCapitalTry: 1_000_000 })).not.toThrow()
  })
})

describe('safeGuard', () => {
  it('returns null when the guard passes', () => {
    expect(safeGuard(() => assertPositiveAmount(5))).toBeNull()
  })
  it('returns the FinancialIntegrityError when the guard fails', () => {
    const err = safeGuard(() => assertPositiveAmount(-1, 'Tutar'))
    expect(err).toBeInstanceOf(FinancialIntegrityError)
    expect(err?.code).toBe('AMOUNT_MUST_BE_POSITIVE')
  })
  it('re-throws non-guard (unexpected) errors instead of swallowing them', () => {
    expect(() => safeGuard(() => { throw new TypeError('boom') })).toThrow(TypeError)
  })
})
