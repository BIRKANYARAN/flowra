// ═══════════════════════════════════════════════════════════════════════════════
// Phase 4 — Finance Rules
//
// Single source of truth for:
//   • per-category deductibility (corporate tax base inclusion)
//   • per-category expense classification (operational / capital / financial / ...)
//   • Turkey-specific tax constants
//   • recurring-expense occurrence materialization
//
// All helpers here are PURE (no DB, no I/O) so they can be reused unchanged
// by the simulation engine. Keep it that way — anything that needs Supabase
// belongs in finance.service.ts or tax.service.ts.
// ═══════════════════════════════════════════════════════════════════════════════

import type { ExpenseCategory, ExpenseType, Period, RecurrenceFrequency } from '@/types'

// ── Deductibility (corporate tax) ────────────────────────────────────────────
//
// `true`  → reduces matrah (taxable base)
// `false` → does NOT reduce matrah (and is therefore NOT a P&L deduction
//           for tax purposes; some are real costs paid in cash but tagged
//           as non-deductible because the tax code says so).
//
// Override per row via `expenses.is_deductible` / `recurring_expenses.is_deductible`
// (nullable columns — null means "use this map").
export const DEDUCTIBILITY_MAP: Record<ExpenseCategory, boolean> = {
  general:      true,
  rent:         true,
  salary:       true,    // includes partner salary — paid for work
  utilities:    true,
  marketing:    true,
  logistics:    true,
  software:     true,
  equipment:    true,    // simplified — proper depreciation deferred
  tax:          false,   // corporate tax itself is not deductible from itself
  interest:     true,    // loan interest deductible
  board_fee:    true,    // service/board compensation
  principal:    false,   // loan principal repayment is balance-sheet only
  dividend:     false,   // distribution of after-tax profit
  partner_loan: false,   // @deprecated — partner financing belongs in partner_transactions, not expenses
  other:        true,
}

// ── Type classification (informational; used by API responses + UI grouping) ──
export const EXPENSE_TYPE_MAP: Record<ExpenseCategory, ExpenseType> = {
  general:      'operational',
  rent:         'operational',
  salary:       'operational',
  utilities:    'operational',
  marketing:    'operational',
  logistics:    'operational',
  software:     'operational',
  equipment:    'capital',
  tax:          'tax',
  interest:     'financial',
  board_fee:    'operational',
  principal:    'loan_repayment',
  dividend:     'dividend',
  partner_loan: 'partner_financing',     // @deprecated — use partner_transactions instead
  other:        'operational',
}

/**
 * Expense *types* that are non-deductible regardless of category.
 * These represent balance-sheet movements or distribution flows, not P&L costs:
 *   internal_transfer — internal cash movement (no P&L effect)
 *   partner_financing — partner capital/loan inflow (balance-sheet only)
 *   loan_repayment    — principal repayment (balance-sheet only)
 *   dividend          — after-tax profit distribution
 *
 * This mirrors the exclusion logic in /api/cfo-metrics (expense_type filter).
 * Used by finance.service.ts to align deductibility with the tax matrah calculation.
 */
export const NON_DEDUCTIBLE_EXPENSE_TYPES = new Set<ExpenseType>([
  'internal_transfer',
  'partner_financing',
  'loan_repayment',
  'dividend',
])

/**
 * Resolve the effective deductibility for a row.
 *   - explicit `true` / `false` from DB row wins
 *   - `null` / `undefined` → fall back to the category map
 *   - unknown category → assume deductible (defensive — operator can flip via UI)
 */
export function resolveDeductibility(category: string, override?: boolean | null): boolean {
  if (override === true)  return true
  if (override === false) return false
  return DEDUCTIBILITY_MAP[category as ExpenseCategory] ?? true
}

export function resolveExpenseType(category: string): ExpenseType {
  return EXPENSE_TYPE_MAP[category as ExpenseCategory] ?? 'operational'
}

// ── Tax constants (Turkey) ───────────────────────────────────────────────────
//
// These are the *defaults*. Every tax-computing function accepts an explicit
// rate so that:
//   • banks / financial institutions (special 30% bracket) can override
//   • simulation can sweep across rate scenarios
//   • year-over-year rate changes don't require a code change to the kernel

/** Corporate income tax (Kurumlar Vergisi) — 25% as of 2024-2025. */
export const CORPORATE_TAX_RATE_TR = 25

/**
 * Standard VAT (KDV) rate in Turkey — 20% (2023+).
 * Reduced rates (1%, 10%) live per-line, not as a global default.
 */
export const KDV_STANDARD_TR = 20

// ── Recurring expense materializer ───────────────────────────────────────────
//
// Given a recurring template + a reporting period, return the list of
// occurrence dates that fall within both the template's active window
// [start_date, end_date] and the report window [period.from, period.to].
//
// Day-of-month behaviour:
//   We anchor on `start_date.getDay()`. For months that don't have that day
//   (e.g. anchor=31, target=Feb), we clamp to the LAST day of the target
//   month — never spill into the next month. This keeps "monthly on the 31st"
//   reading as Jan 31, Feb 28/29, Mar 31, Apr 30, … which is what every
//   accountant expects.
//
// We materialize without persisting — editing the template instantly reshapes
// past + future reports. If you want a real `expenses` row at occurrence time
// (e.g. for invoice tracking), spawn one explicitly via the expenses API.

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function parseDate(s: string): Date {
  if (!DATE_RE.test(s)) throw new Error(`Invalid date: ${s}`)
  return new Date(s + 'T00:00:00Z')
}
function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function lastDayOfMonth(year: number, month0: number): number {
  // Day 0 of next month = last day of this month, in UTC
  return new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate()
}

function addPeriod(year: number, month0: number, freq: RecurrenceFrequency): { year: number; month0: number } {
  if (freq === 'monthly')   return normalize(year, month0 + 1)
  if (freq === 'quarterly') return normalize(year, month0 + 3)
  return { year: year + 1, month0 }
}

function normalize(year: number, month0: number): { year: number; month0: number } {
  const y = year + Math.floor(month0 / 12)
  const m = ((month0 % 12) + 12) % 12
  return { year: y, month0: m }
}

export function materializeRecurring(
  rec: {
    frequency:  RecurrenceFrequency
    start_date: string
    end_date:   string | null
  },
  period: Period,
): string[] {
  if (!DATE_RE.test(period.from) || !DATE_RE.test(period.to)) {
    throw new Error('Period dates must be YYYY-MM-DD')
  }
  if (period.from > period.to) return []

  const start = parseDate(rec.start_date)
  const anchorDay = start.getUTCDate()
  const periodFrom = period.from
  const periodTo   = period.to
  const recEnd     = rec.end_date ?? null

  const out: string[] = []
  let { year, month0 } = { year: start.getUTCFullYear(), month0: start.getUTCMonth() }

  // Hard upper bound on iterations to defend against pathological inputs
  // (e.g. a template starting in the year 1500 against a 2025 report).
  // With monthly frequency that's still bounded — but we cap at 12000 just
  // in case (1000 years of monthly).
  const HARD_CAP = 12000
  for (let i = 0; i < HARD_CAP; i++) {
    const day = Math.min(anchorDay, lastDayOfMonth(year, month0))
    const occ = formatDate(new Date(Date.UTC(year, month0, day)))
    if (occ > periodTo) break
    if (recEnd && occ > recEnd) break
    if (occ >= periodFrom && (!recEnd || occ <= recEnd)) out.push(occ)
    const next = addPeriod(year, month0, rec.frequency)
    year = next.year
    month0 = next.month0
  }
  return out
}

// ── Period helpers ───────────────────────────────────────────────────────────

export function validatePeriod(p: Period): Period {
  if (!DATE_RE.test(p.from) || !DATE_RE.test(p.to)) {
    throw new Error('Period dates must be YYYY-MM-DD')
  }
  if (p.from > p.to) throw new Error('period.from must be <= period.to')
  return p
}

/** Convenience: convert a month string "YYYY-MM" to a full-month period. */
export function periodForMonth(yyyymm: string): Period {
  if (!/^\d{4}-\d{2}$/.test(yyyymm)) throw new Error('Expected YYYY-MM')
  const [y, m] = yyyymm.split('-').map(Number)
  const last = lastDayOfMonth(y, m - 1)
  return { from: `${yyyymm}-01`, to: `${yyyymm}-${String(last).padStart(2, '0')}` }
}

// ── Rounding (kept colocated to avoid drift across services) ─────────────────
// @deprecated: prefer importing round2 from '@/lib/calc' directly.
//   This copy is kept for backward compatibility; implementations are identical.

export function round2(v: number): number {
  return Math.round((v + Number.EPSILON) * 100) / 100
}
export function round4(v: number): number {
  return Math.round((v + Number.EPSILON) * 10000) / 10000
}
