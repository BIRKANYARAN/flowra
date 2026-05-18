// ─────────────────────────────────────────────────────────────────────────────
// lib/db/guards.ts
//
// CONTRACT INTEGRITY — Financial invariant assertions.
//
// Guards are runtime checks that enforce critical accounting invariants.
// They should be called:
//   - Before critical mutations (period close, dividend declaration)
//   - After computation to verify output correctness
//   - In test suites to verify calculation engines
//
// All guards throw a FinancialIntegrityError (extends Error) with a
// structured payload — never return boolean — so violations are never
// silently swallowed.
//
// Design:
//   - Guards are pure (no DB calls, no side effects)
//   - Guards throw, never return false — callers must handle
//   - Error messages are in Turkish (user-facing) + English (log)
//   - Each guard has a stable code (GUARD_CODE) for programmatic matching
// ─────────────────────────────────────────────────────────────────────────────

export type GuardCode =
  | 'AMOUNT_MUST_BE_POSITIVE'
  | 'AMOUNT_MUST_BE_NON_NEGATIVE'
  | 'AMOUNT_EXCEEDS_LIMIT'
  | 'PERIOD_NOT_OPEN'
  | 'PERIOD_ALREADY_LOCKED'
  | 'JOURNAL_ENTRY_UNBALANCED'
  | 'TRIAL_BALANCE_UNBALANCED'
  | 'FIFO_COST_IMMUTABLE'
  | 'DISTRIBUTABLE_NEGATIVE'
  | 'DIVIDEND_EXCEEDS_PROFIT'
  | 'LEGAL_RESERVE_INSUFFICIENT'
  | 'PAYMENT_EXCEEDS_OUTSTANDING'
  | 'OUTSTANDING_MUST_BE_NON_NEGATIVE'

/** All financial integrity errors carry this code for programmatic matching. */
export class FinancialIntegrityError extends Error {
  public readonly code: GuardCode
  public readonly context: Record<string, unknown>

  constructor(code: GuardCode, message: string, context: Record<string, unknown> = {}) {
    super(message)
    this.name  = 'FinancialIntegrityError'
    this.code  = code
    this.context = context
    // Maintain proper stack trace in V8
    if (Error.captureStackTrace) Error.captureStackTrace(this, FinancialIntegrityError)
  }
}

// ─── Amount guards ────────────────────────────────────────────────────────────

/**
 * Assert that `amount` is strictly positive (> 0).
 * Use for: sale totals, expense amounts, loan disbursements.
 */
export function assertPositiveAmount(
  amount: number,
  fieldName = 'amount',
): void {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new FinancialIntegrityError(
      'AMOUNT_MUST_BE_POSITIVE',
      `${fieldName} pozitif bir değer olmalıdır (≥ 0.01). Alınan: ${amount}`,
      { fieldName, amount },
    )
  }
}

/**
 * Assert that `amount` is non-negative (≥ 0).
 * Use for: paid amounts, outstanding balances.
 */
export function assertNonNegativeAmount(
  amount: number,
  fieldName = 'amount',
): void {
  if (!Number.isFinite(amount) || amount < 0) {
    throw new FinancialIntegrityError(
      'AMOUNT_MUST_BE_NON_NEGATIVE',
      `${fieldName} negatif olamaz. Alınan: ${amount}`,
      { fieldName, amount },
    )
  }
}

/**
 * Assert that payment does not exceed the outstanding balance.
 * Prevents overpayment bugs that corrupt financial statements.
 */
export function assertPaymentWithinBalance(opts: {
  payment:     number
  totalTry:    number
  amountPaid:  number
  saleId?:     string
}): void {
  const { payment, totalTry, amountPaid, saleId } = opts
  const outstanding = Math.max(0, totalTry - amountPaid)

  if (payment > outstanding + 0.01) {  // 0.01 tolerance for floating-point
    throw new FinancialIntegrityError(
      'PAYMENT_EXCEEDS_OUTSTANDING',
      `Ödeme tutarı (${payment.toFixed(2)}) kalan bakiyeyi (${outstanding.toFixed(2)}) aşıyor.`,
      { payment, totalTry, amountPaid, outstanding, saleId },
    )
  }
}

// ─── Period guards ───────────────────────────────────────────────────────────

type PeriodStatus = 'open' | 'pre_close' | 'closed' | 'locked' | 'adjustment'

/**
 * Assert that the period is open (allows all writes).
 * Use before any financial insert/update that belongs to a period.
 */
export function assertPeriodOpen(periodStatus: PeriodStatus, periodId?: string): void {
  if (periodStatus !== 'open' && periodStatus !== 'adjustment') {
    throw new FinancialIntegrityError(
      'PERIOD_NOT_OPEN',
      `Dönem yazma işlemine kapalı. Durum: ${periodStatus}. Lütfen yöneticinize başvurun.`,
      { periodStatus, periodId },
    )
  }
}

/**
 * Assert that the period is NOT locked (allows pre-close adjustments).
 */
export function assertPeriodNotLocked(periodStatus: PeriodStatus, periodId?: string): void {
  if (periodStatus === 'locked') {
    throw new FinancialIntegrityError(
      'PERIOD_ALREADY_LOCKED',
      `Dönem kilitlenmiş ve artık değiştirilemez. Dönem ID: ${periodId ?? '?'}`,
      { periodStatus, periodId },
    )
  }
}

// ─── Journal entry (double-entry) guards ─────────────────────────────────────

/**
 * Assert that journal entry lines are balanced: Σ debits = Σ credits.
 * Tolerance: 0.01 TRY (rounding only).
 */
export function assertBalancedEntry(opts: {
  lines: Array<{ debit_try: number; credit_try: number }>
  entryRef?: string
}): void {
  const { lines, entryRef } = opts

  let totalDebits  = 0
  let totalCredits = 0
  for (const line of lines) {
    totalDebits  += line.debit_try  ?? 0
    totalCredits += line.credit_try ?? 0
  }

  const imbalance = Math.abs(totalDebits - totalCredits)
  if (imbalance > 0.01) {
    throw new FinancialIntegrityError(
      'JOURNAL_ENTRY_UNBALANCED',
      `Muhasebe kaydı dengesiz. Borç: ${totalDebits.toFixed(2)}, Alacak: ${totalCredits.toFixed(2)}, Fark: ${imbalance.toFixed(4)}`,
      { totalDebits, totalCredits, imbalance, entryRef },
    )
  }
}

/**
 * Assert that the trial balance is balanced: Σ all debits = Σ all credits.
 * Tolerance: 0.01 TRY.
 */
export function assertTrialBalanceBalanced(opts: {
  totalDebits:  number
  totalCredits: number
  periodId?:    string
}): void {
  const { totalDebits, totalCredits, periodId } = opts
  const imbalance = Math.abs(totalDebits - totalCredits)

  if (imbalance > 0.01) {
    throw new FinancialIntegrityError(
      'TRIAL_BALANCE_UNBALANCED',
      `Mizan dengesiz. Toplam Borç: ${totalDebits.toFixed(2)}, Toplam Alacak: ${totalCredits.toFixed(2)}, Fark: ${imbalance.toFixed(4)}`,
      { totalDebits, totalCredits, imbalance, periodId },
    )
  }
}

// ─── FIFO cost immutability guard ─────────────────────────────────────────────

/**
 * Assert that FIFO cost is not being changed after lot creation.
 * Call before any stock_lot UPDATE that touches cost fields.
 *
 * @param currentCost  — current cost_price_try in DB
 * @param newCost      — proposed new cost_price_try
 */
export function assertFifoCostImmutable(opts: {
  currentCostTry: number
  newCostTry:     number
  lotId?:         string
}): void {
  const { currentCostTry, newCostTry, lotId } = opts

  if (Math.abs(currentCostTry - newCostTry) > 0.001) {
    throw new FinancialIntegrityError(
      'FIFO_COST_IMMUTABLE',
      `FIFO stok maliyeti değiştirilemez. Mevcut: ${currentCostTry}, Yeni: ${newCostTry}. Lot ID: ${lotId ?? '?'}`,
      { currentCostTry, newCostTry, lotId },
    )
  }
}

// ─── Distribution guards ─────────────────────────────────────────────────────

/**
 * Assert that net distributable profit is positive before declaring dividend.
 * Enforces Turkish Commercial Code (TTK 509): distributable_net ≥ 0.
 */
export function assertDistributablePositive(opts: {
  distributableNet: number
  periodId?:        string
}): void {
  const { distributableNet, periodId } = opts

  if (distributableNet < 0) {
    throw new FinancialIntegrityError(
      'DISTRIBUTABLE_NEGATIVE',
      `Dağıtılabilir kâr negatif (${distributableNet.toFixed(2)} TL). Kâr olmadan temettü beyan edilemez (TTK 509).`,
      { distributableNet, periodId },
    )
  }
}

/**
 * Assert that the declared dividend does not exceed distributable profit.
 */
export function assertDividendWithinProfit(opts: {
  declaredGross:    number
  distributableNet: number
  periodId?:        string
}): void {
  const { declaredGross, distributableNet, periodId } = opts

  if (declaredGross > distributableNet + 0.01) {
    throw new FinancialIntegrityError(
      'DIVIDEND_EXCEEDS_PROFIT',
      `Temettü beyanı (${declaredGross.toFixed(2)} TL) dağıtılabilir kârı (${distributableNet.toFixed(2)} TL) aşıyor (TTK 509).`,
      { declaredGross, distributableNet, periodId },
    )
  }
}

/**
 * Assert that legal reserve (TTK 519) has been properly allocated before period close.
 *
 * Turkish Commercial Code Art. 519:
 *   5% of period profit → legal reserves, until reserves reach 20% of paid-in capital.
 */
export function assertLegalReserveAllocated(opts: {
  periodProfitTry:    number
  legalReserveAllocatedTry: number
  existingReservesTry:number
  paidInCapitalTry:   number
  periodId?:          string
}): void {
  const { periodProfitTry, legalReserveAllocatedTry, existingReservesTry, paidInCapitalTry, periodId } = opts

  const reserveCap     = paidInCapitalTry * 0.20
  const reserveGap     = Math.max(0, reserveCap - existingReservesTry)
  const requiredReserve = Math.min(periodProfitTry * 0.05, reserveGap)

  if (legalReserveAllocatedTry < requiredReserve - 0.01) {
    throw new FinancialIntegrityError(
      'LEGAL_RESERVE_INSUFFICIENT',
      `Yasal yedek yetersiz. Gerekli: ${requiredReserve.toFixed(2)} TL, Ayrılan: ${legalReserveAllocatedTry.toFixed(2)} TL (TTK 519).`,
      { periodProfitTry, legalReserveAllocatedTry, requiredReserve, existingReservesTry, paidInCapitalTry, periodId },
    )
  }
}

// ─── Convenience: safe guard (returns error instead of throwing) ─────────────

/**
 * Run a guard function and return an error object if it fails, null if it passes.
 * Use when you want to surface a validation error to the UI without try/catch.
 *
 * @example
 *   const err = safeGuard(() => assertPositiveAmount(amount, 'Tutar'))
 *   if (err) return NextResponse.json({ error: err.message }, { status: 400 })
 */
export function safeGuard(fn: () => void): FinancialIntegrityError | null {
  try {
    fn()
    return null
  } catch (e) {
    if (e instanceof FinancialIntegrityError) return e
    // Re-throw non-guard errors (unexpected)
    throw e
  }
}
