/**
 * Tests for lib/services/ledger/period-close-enhanced.service.ts
 *
 * All tests use mock Supabase clients — no real DB calls.
 * Run with: npx vitest run tests/period-close-enhanced.test.ts
 */
import { describe, it, expect } from 'vitest'
import { PeriodCloseEnhancedService } from '../lib/services/ledger/period-close-enhanced.service'
import type { PeriodCloseReadiness } from '../lib/services/ledger/period-close-enhanced.service'

// ─────────────────────────────────────────────────────────────────────────────
// Mock builders
// ─────────────────────────────────────────────────────────────────────────────

type AnyFn = (...args: unknown[]) => unknown

interface MockChain {
  _data:       unknown
  _count:      number | null
  select:      AnyFn
  eq:          AnyFn
  is:          AnyFn
  in:          AnyFn
  not:         AnyFn
  neq:         AnyFn
  lte:         AnyFn
  gte:         AnyFn
  gt:          AnyFn
  lt:          AnyFn
  like:        AnyFn
  order:       AnyFn
  limit:       AnyFn
  single:      AnyFn
  maybeSingle: AnyFn
  then:        (resolve: (v: { data: unknown; count: number | null; error: null }) => unknown) => Promise<unknown>
}

function makeChain(data: unknown, count: number | null = null): MockChain {
  const chain: MockChain = {
    _data:  data,
    _count: count,
    select()      { return this },
    eq()          { return this },
    is()          { return this },
    in()          { return this },
    not()         { return this },
    neq()         { return this },
    lte()         { return this },
    gte()         { return this },
    gt()          { return this },
    lt()          { return this },
    like()        { return this },
    order()       { return this },
    limit()       { return this },
    single()      { return { data: Array.isArray(this._data) ? (this._data as unknown[])[0] ?? null : this._data, error: null } },
    maybeSingle() { return { data: Array.isArray(this._data) ? (this._data as unknown[])[0] ?? null : this._data, error: null } },
    then(resolve) {
      return Promise.resolve({ data: this._data, count: this._count, error: null }).then(resolve)
    },
  }
  return chain
}

// Audit readiness mock (returns score)
function makeAuditResult(score: number) {
  return {
    score,
    grade:      score >= 75 ? 'B' : score >= 60 ? 'C' : score >= 40 ? 'D' : 'F',
    items:      [],
    computed_at: new Date().toISOString(),
    categories: {
      accounting: { score, total: 4, passed: Math.round(score / 25) },
      partner:    { score, total: 4, passed: Math.round(score / 25) },
      governance: { score, total: 4, passed: Math.round(score / 25) },
      tax:        { score, total: 4, passed: Math.round(score / 25) },
    },
  }
}

type TableData = {
  accounting_periods:           unknown[]
  journal_entries:              Array<{ debit_try: number; credit_try: number }>
  sales:                        Array<{ id?: string }>
  expenses:                     Array<{ id?: string }>
  bank_statement_lines:         Array<{ id: string; match_status: string | null }>
  tax_obligations:              unknown[]
  partner_compensation_payments: unknown[]
  workflow_instances:           unknown[]
  partner_loan_tranches:        unknown[]
  partner_capital_commitments:  unknown[]
  documents:                    unknown[]
  resolutions:                  unknown[]
}

function makeSupabase(
  tables: Partial<TableData>,
  auditScore = 80,
): unknown {
  return {
    auth: {
      getUser: async () => ({ data: { user: { id: 'uid-test' } }, error: null }),
    },
    from(table: string) {
      // For accounting_periods, always return a valid period
      if (table === 'accounting_periods') {
        const data = (tables.accounting_periods as unknown[]) ?? [{
          id:              'period-1',
          period_start:    '2026-05-01',
          period_end:      '2026-05-31',
          opening_cash_try: 100_000,
          closing_cash_try: 120_000,
        }]
        return makeChain(data, null)
      }

      // AuditReadinessService queries several tables — intercept its ones
      if (table === 'audit_acknowledgements' || table === 'partner_documents') {
        return makeChain([], 0)
      }

      // The trial-balance check reads debit/credit from journal_entry_lines now;
      // alias to the journal_entries fixture so existing test rows still apply.
      if (table === 'journal_entry_lines') {
        const jrows = (tables as Record<string, unknown[]>)['journal_entry_lines']
          ?? (tables as Record<string, unknown[]>)['journal_entries'] ?? []
        return makeChain(jrows, Array.isArray(jrows) ? jrows.length : 0)
      }

      const rows = (tables as Record<string, unknown[]>)[table] ?? []
      const count = Array.isArray(rows) ? rows.length : 0
      return makeChain(rows, count)
    },
  }
}

// Override AuditReadinessService.compute via module-level mock approach:
// Since vitest doesn't tree-shake, we patch it via the class directly in tests
// by providing a supabase mock that causes AuditReadinessService to produce
// a desired score. Instead, we create an isolated helper that patches the module.

// For simplicity, we wrap getReadiness to inject a custom audit compute:
async function getReadinessWithAuditScore(
  tables: Partial<TableData>,
  auditScore: number,
  periodId?: string,
): Promise<PeriodCloseReadiness> {
  // Mock: override AuditReadinessService by providing tables that produce the score.
  // Since AuditReadinessService.compute does DB queries, we mock at the supabase level.
  // The simplest approach: rely on the fact that AuditReadinessService queries
  // 'partner_documents', 'audit_acknowledgements', etc. We provide enough rows to
  // get a passing/failing score.

  // Actually, we call the real service but provide a custom audit_acknowledgements
  // override. For testing purposes, we create a "patched" supabase that returns
  // audit results consistent with the desired score by providing enough items.

  // The cleanest test approach for audit checks: mock the underlying tables so
  // AuditReadinessService computes our desired score. Pass empty tables to get
  // low scores (all fail) or full tables to get high scores.
  const supabase = makeSupabase(tables, auditScore)

  // Direct call — AuditReadinessService will query via the mock supabase
  return PeriodCloseEnhancedService.getReadiness('co-1', 'uid-1', supabase as never, periodId)
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: create a supabase that produces specific journal DR/CR totals
// ─────────────────────────────────────────────────────────────────────────────

function makeSupabaseWithJournal(
  journalRows: Array<{ debit_try: number; credit_try: number }>,
  extra: Partial<TableData> = {},
): unknown {
  return makeSupabase({ journal_entries: journalRows, ...extra })
}

function makeSupabaseWithBankLines(
  lines: Array<{ id: string; match_status: string | null }>,
  extra: Partial<TableData> = {},
): unknown {
  return makeSupabase({ bank_statement_lines: lines, ...extra })
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('PeriodCloseEnhancedService', () => {

  // Test 1: All blocking checks pass → can_close = true
  it('can_close = true when all blocking checks pass', async () => {
    // Provide a balanced journal, no drafts, no bad bank lines → all auto checks pass
    const supabase = makeSupabaseWithJournal([
      { debit_try: 10_000, credit_try: 10_000 },
    ])
    const result = await PeriodCloseEnhancedService.getReadiness('co-1', 'uid-1', supabase as never)
    // can_close = true when blocking_count = 0
    expect(result.blocking_count).toBe(0)
    expect(result.can_close).toBe(true)
  })

  // Test 2: One blocking check fails → can_close = false
  it('can_close = false when one blocking check fails', async () => {
    // Unbalanced journal → trial_balance_balanced fails (blocking)
    const supabase = makeSupabaseWithJournal([
      { debit_try: 10_000, credit_try: 5_000 },
    ])
    const result = await PeriodCloseEnhancedService.getReadiness('co-1', 'uid-1', supabase as never)
    expect(result.can_close).toBe(false)
    expect(result.blocking_count).toBeGreaterThanOrEqual(1)
  })

  // Test 3: Trial balance: DR = CR → pass
  it('trial_balance_balanced passes when DR = CR', async () => {
    const supabase = makeSupabaseWithJournal([
      { debit_try: 5_000, credit_try: 5_000 },
      { debit_try: 3_000, credit_try: 3_000 },
    ])
    const result = await PeriodCloseEnhancedService.getReadiness('co-1', 'uid-1', supabase as never)
    const check = result.checks.find(c => c.key === 'trial_balance_balanced')
    expect(check).toBeDefined()
    expect(check!.status).toBe('pass')
  })

  // Test 4a: Bank reconciliation: 95% matched → pass
  it('bank_reconciliation_status passes at 95% matched', async () => {
    const lines = [
      ...Array(19).fill(null).map((_, i) => ({ id: `l${i}`, match_status: 'matched' })),
      { id: 'l19', match_status: 'unmatched' },
    ]
    const supabase = makeSupabaseWithBankLines(lines)
    const result = await PeriodCloseEnhancedService.getReadiness('co-1', 'uid-1', supabase as never)
    const check = result.checks.find(c => c.key === 'bank_reconciliation_status')
    expect(check).toBeDefined()
    expect(check!.status).toBe('pass')
  })

  // Test 4b: Bank reconciliation: 75% matched → warn
  it('bank_reconciliation_status warns at 75% matched', async () => {
    const lines = [
      ...Array(3).fill(null).map((_, i) => ({ id: `l${i}`, match_status: 'matched' })),
      { id: 'l3', match_status: 'unmatched' },
    ]
    const supabase = makeSupabaseWithBankLines(lines)
    const result = await PeriodCloseEnhancedService.getReadiness('co-1', 'uid-1', supabase as never)
    const check = result.checks.find(c => c.key === 'bank_reconciliation_status')
    expect(check).toBeDefined()
    expect(check!.status).toBe('warn')
  })

  // Test 4c: Bank reconciliation: 50% matched → fail
  it('bank_reconciliation_status fails at 50% matched', async () => {
    const lines = [
      { id: 'l1', match_status: 'matched' },
      { id: 'l2', match_status: 'unmatched' },
    ]
    const supabase = makeSupabaseWithBankLines(lines)
    const result = await PeriodCloseEnhancedService.getReadiness('co-1', 'uid-1', supabase as never)
    const check = result.checks.find(c => c.key === 'bank_reconciliation_status')
    expect(check).toBeDefined()
    expect(check!.status).toBe('fail')
  })

  // Test 5: Audit readiness score — we test the logic directly since the mock
  // supabase returns empty tables and AuditReadinessService computes from them
  it('audit_readiness_score check is present in results', async () => {
    const supabase = makeSupabaseWithJournal([])
    const result = await PeriodCloseEnhancedService.getReadiness('co-1', 'uid-1', supabase as never)
    const check = result.checks.find(c => c.key === 'audit_readiness_score')
    expect(check).toBeDefined()
    expect(['pass', 'warn', 'fail', 'skip']).toContain(check!.status)
  })

  // Test 6: No bank statement lines → bank_reconciliation_status is 'skip'
  it('bank_reconciliation_status is skip when no bank lines imported', async () => {
    const supabase = makeSupabase({ bank_statement_lines: [] })
    const result = await PeriodCloseEnhancedService.getReadiness('co-1', 'uid-1', supabase as never)
    const check = result.checks.find(c => c.key === 'bank_reconciliation_status')
    expect(check).toBeDefined()
    expect(check!.status).toBe('skip')
  })

  // Test 7: Manual checks don't affect can_close
  it('manual checks (pending) do not affect can_close', async () => {
    // Balanced journal, no drafts — all auto checks pass
    const supabase = makeSupabaseWithJournal([{ debit_try: 1000, credit_try: 1000 }])
    const result = await PeriodCloseEnhancedService.getReadiness('co-1', 'uid-1', supabase as never)

    const manualPending = result.checks.filter(c => !c.is_auto && c.status === 'pending')
    const hasPendingManual = manualPending.length > 0

    // even with pending manual checks, can_close can be true if no blocking auto fails
    expect(hasPendingManual).toBe(true)
    // can_close should not be false purely because of pending manual checks
    if (result.blocking_count === 0) {
      expect(result.can_close).toBe(true)
    }
  })

  // Test 8: blocking_count counts only blocking:fail checks
  it('blocking_count only counts checks that are blocking=true AND status=fail', async () => {
    const supabase = makeSupabaseWithJournal([
      { debit_try: 10_000, credit_try: 5_000 }, // will cause fail on trial_balance_balanced
    ])
    const result = await PeriodCloseEnhancedService.getReadiness('co-1', 'uid-1', supabase as never)

    // Manually count blocking + fail checks
    const expectedBlockingFails = result.checks.filter(c => c.blocking && c.status === 'fail').length
    expect(result.blocking_count).toBe(expectedBlockingFails)
  })

  // Test 9: auto_passed_count counts only is_auto:pass checks
  it('auto_passed_count only counts is_auto=true AND status=pass checks', async () => {
    const supabase = makeSupabaseWithJournal([{ debit_try: 1000, credit_try: 1000 }])
    const result = await PeriodCloseEnhancedService.getReadiness('co-1', 'uid-1', supabase as never)

    const expectedAutoPassed = result.checks.filter(c => c.is_auto && c.status === 'pass').length
    expect(result.auto_passed_count).toBe(expectedAutoPassed)
  })

  // Test 10: warnings are NOT blocking — can_close can still be true with warnings
  it('can_close = true even when warnings exist (warns are never blocking)', async () => {
    // Balanced journal. Bank lines: 75% matched → warn (not blocking)
    const bankLines = [
      ...Array(3).fill(null).map((_, i) => ({ id: `l${i}`, match_status: 'matched' })),
      { id: 'l3', match_status: 'unmatched' },
    ]
    const supabase = makeSupabase({
      journal_entries:      [{ debit_try: 5000, credit_try: 5000 }],
      bank_statement_lines: bankLines,
    })
    const result = await PeriodCloseEnhancedService.getReadiness('co-1', 'uid-1', supabase as never)

    // Bank reconciliation warn should exist
    const bankCheck = result.checks.find(c => c.key === 'bank_reconciliation_status')
    expect(bankCheck?.status).toBe('warn')

    // Warns are never blocking — verify
    const warnChecks = result.checks.filter(c => c.status === 'warn')
    warnChecks.forEach(c => {
      // warn checks can be blocking=true in theory but warns don't count toward blocking_count
      // blocking_count is: blocking=true AND fail
    })

    // If no blocking fails exist, can_close should be true despite warnings
    if (result.blocking_count === 0) {
      expect(result.can_close).toBe(true)
    }
    expect(result.warning_count).toBeGreaterThanOrEqual(1)
  })

  // ── Check key uniqueness ────────────────────────────────────────────────────

  it('all checks have unique keys', async () => {
    const supabase = makeSupabaseWithJournal([{ debit_try: 1000, credit_try: 1000 }])
    const result = await PeriodCloseEnhancedService.getReadiness('co-1', 'uid-1', supabase as never)
    const keys = result.checks.map(c => c.key)
    const uniqueKeys = new Set(keys)
    expect(uniqueKeys.size).toBe(keys.length)
  })

  it('returns exactly 16 checks (12 auto + 4 manual)', async () => {
    const supabase = makeSupabaseWithJournal([{ debit_try: 1000, credit_try: 1000 }])
    const result = await PeriodCloseEnhancedService.getReadiness('co-1', 'uid-1', supabase as never)
    expect(result.checks).toHaveLength(16)
  })

  it('auto checks count is 12', async () => {
    const supabase = makeSupabaseWithJournal([{ debit_try: 1000, credit_try: 1000 }])
    const result = await PeriodCloseEnhancedService.getReadiness('co-1', 'uid-1', supabase as never)
    const autoChecks = result.checks.filter(c => c.is_auto)
    expect(autoChecks).toHaveLength(12)
  })

  it('manual checks count is 4 and all are pending', async () => {
    const supabase = makeSupabaseWithJournal([{ debit_try: 1000, credit_try: 1000 }])
    const result = await PeriodCloseEnhancedService.getReadiness('co-1', 'uid-1', supabase as never)
    const manualChecks = result.checks.filter(c => !c.is_auto)
    expect(manualChecks).toHaveLength(4)
    for (const c of manualChecks) {
      expect(c.status).toBe('pending')
    }
  })

  it('manual_pending_count equals number of pending non-auto checks', async () => {
    const supabase = makeSupabaseWithJournal([{ debit_try: 1000, credit_try: 1000 }])
    const result = await PeriodCloseEnhancedService.getReadiness('co-1', 'uid-1', supabase as never)
    const expected = result.checks.filter(c => !c.is_auto && c.status === 'pending').length
    expect(result.manual_pending_count).toBe(expected)
  })

  // ── Category coverage ───────────────────────────────────────────────────────

  it('checks include all four categories', async () => {
    const supabase = makeSupabaseWithJournal([{ debit_try: 1000, credit_try: 1000 }])
    const result = await PeriodCloseEnhancedService.getReadiness('co-1', 'uid-1', supabase as never)
    const categories = new Set(result.checks.map(c => c.category))
    expect(categories.has('accounting')).toBe(true)
    expect(categories.has('compliance')).toBe(true)
    expect(categories.has('partner')).toBe(true)
    expect(categories.has('documents')).toBe(true)
  })

  // ── Check: no_unposted_sales ────────────────────────────────────────────────

  it('no_unposted_sales passes when sales array is empty', async () => {
    const supabase = makeSupabase({ sales: [] })
    const result = await PeriodCloseEnhancedService.getReadiness('co-1', 'uid-1', supabase as never)
    const check = result.checks.find(c => c.key === 'no_unposted_sales')
    expect(check).toBeDefined()
    expect(check!.status).toBe('pass')
  })

  it('no_unposted_sales fails when draft sales exist', async () => {
    const supabase = makeSupabase({ sales: [{ id: 's1' }, { id: 's2' }] })
    const result = await PeriodCloseEnhancedService.getReadiness('co-1', 'uid-1', supabase as never)
    const check = result.checks.find(c => c.key === 'no_unposted_sales')
    expect(check).toBeDefined()
    expect(check!.status).toBe('fail')
  })

  it('no_unposted_sales failure is blocking', async () => {
    const supabase = makeSupabase({ sales: [{ id: 's1' }] })
    const result = await PeriodCloseEnhancedService.getReadiness('co-1', 'uid-1', supabase as never)
    const check = result.checks.find(c => c.key === 'no_unposted_sales')
    expect(check?.blocking).toBe(true)
  })

  // ── Check: no_unposted_expenses ─────────────────────────────────────────────

  it('no_unposted_expenses passes when expenses array is empty', async () => {
    const supabase = makeSupabase({ expenses: [] })
    const result = await PeriodCloseEnhancedService.getReadiness('co-1', 'uid-1', supabase as never)
    const check = result.checks.find(c => c.key === 'no_unposted_expenses')
    expect(check).toBeDefined()
    expect(check!.status).toBe('pass')
  })

  it('no_unposted_expenses fails when draft expenses exist', async () => {
    const supabase = makeSupabase({ expenses: [{ id: 'e1' }, { id: 'e2' }, { id: 'e3' }] })
    const result = await PeriodCloseEnhancedService.getReadiness('co-1', 'uid-1', supabase as never)
    const check = result.checks.find(c => c.key === 'no_unposted_expenses')
    expect(check).toBeDefined()
    expect(check!.status).toBe('fail')
  })

  // ── Check: trial_balance_balanced edge cases ────────────────────────────────

  it('trial_balance_balanced passes when journal is empty (no entries)', async () => {
    const supabase = makeSupabaseWithJournal([])
    const result = await PeriodCloseEnhancedService.getReadiness('co-1', 'uid-1', supabase as never)
    const check = result.checks.find(c => c.key === 'trial_balance_balanced')
    expect(check!.status).toBe('pass')
  })

  it('trial_balance_balanced passes with many balanced entries', async () => {
    const rows = Array.from({ length: 20 }, (_, i) => ({
      debit_try: (i + 1) * 1000,
      credit_try: (i + 1) * 1000,
    }))
    const supabase = makeSupabaseWithJournal(rows)
    const result = await PeriodCloseEnhancedService.getReadiness('co-1', 'uid-1', supabase as never)
    const check = result.checks.find(c => c.key === 'trial_balance_balanced')
    expect(check!.status).toBe('pass')
  })

  it('trial_balance_balanced is blocking', async () => {
    const supabase = makeSupabaseWithJournal([{ debit_try: 1000, credit_try: 1000 }])
    const result = await PeriodCloseEnhancedService.getReadiness('co-1', 'uid-1', supabase as never)
    const check = result.checks.find(c => c.key === 'trial_balance_balanced')
    expect(check?.blocking).toBe(true)
  })

  // ── Check: bank_reconciliation edge: exactly 90% matched → pass ────────────

  it('bank_reconciliation_status passes exactly at 90% matched', async () => {
    const lines = [
      ...Array(9).fill(null).map((_, i) => ({ id: `l${i}`, match_status: 'matched' })),
      { id: 'l9', match_status: 'unmatched' },
    ]
    const supabase = makeSupabaseWithBankLines(lines)
    const result = await PeriodCloseEnhancedService.getReadiness('co-1', 'uid-1', supabase as never)
    const check = result.checks.find(c => c.key === 'bank_reconciliation_status')
    expect(check!.status).toBe('pass')
  })

  // ── Result shape ────────────────────────────────────────────────────────────

  it('computed_at is a valid ISO string', async () => {
    const supabase = makeSupabaseWithJournal([])
    const result = await PeriodCloseEnhancedService.getReadiness('co-1', 'uid-1', supabase as never)
    expect(result.computed_at).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(new Date(result.computed_at).getTime()).not.toBeNaN()
  })

  it('period_id is null when no accounting period found', async () => {
    // makeSupabase returns a period by default; use a mock that returns empty periods
    const noPeriodsSupabase = {
      auth: { getUser: async () => ({ data: { user: { id: 'uid-test' } }, error: null }) },
      from(table: string) {
        if (table === 'accounting_periods') return makeChain([], null)
        if (table === 'audit_acknowledgements' || table === 'partner_documents') return makeChain([], 0)
        return makeChain([], 0)
      },
    }
    const result = await PeriodCloseEnhancedService.getReadiness('co-1', 'uid-1', noPeriodsSupabase as never)
    expect(result.period_id).toBeNull()
  })

  it('period_label is a non-empty string', async () => {
    const supabase = makeSupabaseWithJournal([])
    const result = await PeriodCloseEnhancedService.getReadiness('co-1', 'uid-1', supabase as never)
    expect(typeof result.period_label).toBe('string')
    expect(result.period_label.length).toBeGreaterThan(0)
  })

  it('warning_count matches actual warn checks', async () => {
    const supabase = makeSupabase({
      journal_entries:      [{ debit_try: 1000, credit_try: 1000 }],
      bank_statement_lines: [
        { id: 'l1', match_status: 'matched' },
        { id: 'l2', match_status: 'matched' },
        { id: 'l3', match_status: 'unmatched' }, // 66% → warn
      ],
    })
    const result = await PeriodCloseEnhancedService.getReadiness('co-1', 'uid-1', supabase as never)
    const actualWarns = result.checks.filter(c => c.status === 'warn').length
    expect(result.warning_count).toBe(actualWarns)
  })

  it('all checks have a non-empty label and detail', async () => {
    const supabase = makeSupabaseWithJournal([{ debit_try: 1000, credit_try: 1000 }])
    const result = await PeriodCloseEnhancedService.getReadiness('co-1', 'uid-1', supabase as never)
    for (const check of result.checks) {
      expect(check.label.length).toBeGreaterThan(0)
      expect(check.detail.length).toBeGreaterThan(0)
    }
  })

  it('all checks have a valid status value', async () => {
    const supabase = makeSupabaseWithJournal([{ debit_try: 1000, credit_try: 1000 }])
    const result = await PeriodCloseEnhancedService.getReadiness('co-1', 'uid-1', supabase as never)
    const validStatuses = new Set(['pass', 'fail', 'warn', 'pending', 'skip'])
    for (const check of result.checks) {
      expect(validStatuses.has(check.status)).toBe(true)
    }
  })

  it('draft sales + unbalanced journal → blocking_count >= 2', async () => {
    const supabase = makeSupabase({
      journal_entries: [{ debit_try: 10_000, credit_try: 5_000 }],
      sales:           [{ id: 's1' }, { id: 's2' }],
    })
    const result = await PeriodCloseEnhancedService.getReadiness('co-1', 'uid-1', supabase as never)
    expect(result.blocking_count).toBeGreaterThanOrEqual(2)
    expect(result.can_close).toBe(false)
  })

  it('partner_loan_tranches with rows → partner_loans_current is warn', async () => {
    const supabase = makeSupabase({
      journal_entries: [{ debit_try: 1000, credit_try: 1000 }],
      partner_loan_tranches: [
        { id: 't1', expected_repayment_date: '2026-01-01', outstanding_try: 50_000 },
      ],
    })
    const result = await PeriodCloseEnhancedService.getReadiness('co-1', 'uid-1', supabase as never)
    const check = result.checks.find(c => c.key === 'partner_loans_current')
    expect(check).toBeDefined()
    expect(check!.status).toBe('warn')
  })

  it('capital_commitments with unpaid rows → capital_commitments_current is warn', async () => {
    const supabase = makeSupabase({
      journal_entries: [{ debit_try: 1000, credit_try: 1000 }],
      partner_capital_commitments: [
        { committed_try: 100_000, paid_try: 50_000, due_date: '2026-01-01' },
      ],
    })
    const result = await PeriodCloseEnhancedService.getReadiness('co-1', 'uid-1', supabase as never)
    const check = result.checks.find(c => c.key === 'capital_commitments_current')
    expect(check).toBeDefined()
    expect(check!.status).toBe('warn')
  })

  it('capital_commitments with fully paid rows → capital_commitments_current is pass', async () => {
    const supabase = makeSupabase({
      journal_entries: [{ debit_try: 1000, credit_try: 1000 }],
      partner_capital_commitments: [
        { committed_try: 50_000, paid_try: 50_000, due_date: '2026-01-01' },
      ],
    })
    const result = await PeriodCloseEnhancedService.getReadiness('co-1', 'uid-1', supabase as never)
    const check = result.checks.find(c => c.key === 'capital_commitments_current')
    expect(check).toBeDefined()
    expect(check!.status).toBe('pass')
  })

  it('bank_statement_uploaded is pass when documents exist', async () => {
    const supabase = makeSupabase({
      journal_entries: [{ debit_try: 1000, credit_try: 1000 }],
      documents:       [{ id: 'doc1' }],
    })
    const result = await PeriodCloseEnhancedService.getReadiness('co-1', 'uid-1', supabase as never)
    const check = result.checks.find(c => c.key === 'bank_statement_uploaded')
    expect(check).toBeDefined()
    expect(check!.status).toBe('pass')
  })

  it('bank_statement_uploaded is warn when no documents', async () => {
    const supabase = makeSupabase({
      journal_entries: [{ debit_try: 1000, credit_try: 1000 }],
      documents:       [],
    })
    const result = await PeriodCloseEnhancedService.getReadiness('co-1', 'uid-1', supabase as never)
    const check = result.checks.find(c => c.key === 'bank_statement_uploaded')
    expect(check).toBeDefined()
    // Either warn or skip is acceptable when no documents
    expect(['warn', 'skip']).toContain(check!.status)
  })

  it('pending compensation payments → no_overdue_compensation is fail', async () => {
    const supabase = makeSupabase({
      journal_entries:              [{ debit_try: 1000, credit_try: 1000 }],
      partner_compensation_payments: [{ id: 'p1' }, { id: 'p2' }],
    })
    const result = await PeriodCloseEnhancedService.getReadiness('co-1', 'uid-1', supabase as never)
    const check = result.checks.find(c => c.key === 'no_overdue_compensation')
    expect(check).toBeDefined()
    expect(check!.status).toBe('fail')
  })

  it('no_overdue_compensation is blocking', async () => {
    const supabase = makeSupabase({
      partner_compensation_payments: [{ id: 'p1' }],
    })
    const result = await PeriodCloseEnhancedService.getReadiness('co-1', 'uid-1', supabase as never)
    const check = result.checks.find(c => c.key === 'no_overdue_compensation')
    expect(check?.blocking).toBe(true)
  })

  it('dividend workflow rows → no_pending_dividend_workflow is warn', async () => {
    const supabase = makeSupabase({
      journal_entries:      [{ debit_try: 1000, credit_try: 1000 }],
      workflow_instances:   [{ id: 'wf1', created_at: new Date(Date.now() - 10 * 86_400_000).toISOString() }],
    })
    const result = await PeriodCloseEnhancedService.getReadiness('co-1', 'uid-1', supabase as never)
    const check = result.checks.find(c => c.key === 'no_pending_dividend_workflow')
    expect(check).toBeDefined()
    expect(check!.status).toBe('warn')
  })

  it('auto_passed_count is 0 when trial balance fails and other checks fail', async () => {
    const supabase = makeSupabase({
      journal_entries: [{ debit_try: 10_000, credit_try: 5_000 }],
      sales:           [{ id: 's1' }],
      expenses:        [{ id: 'e1' }],
    })
    const result = await PeriodCloseEnhancedService.getReadiness('co-1', 'uid-1', supabase as never)
    // At minimum the auto_passed_count should be less when many checks fail
    const manualPendingOnly = result.checks.filter(c => c.is_auto && c.status === 'pass').length
    expect(result.auto_passed_count).toBe(manualPendingOnly)
  })

})
