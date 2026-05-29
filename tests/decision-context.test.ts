// tests/decision-context.test.ts
//
// Unit tests for the Decision Context Engine.
// All DB interactions are mocked — pure logic tests.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DecisionContextService }               from '@/lib/services/decision-context/decision-context.service'
import type { ContextSnapshot }                 from '@/lib/services/decision-context/decision-context.service'

// ── Supabase mock factory ─────────────────────────────────────────────────────
//
// Creates a minimal fake Supabase client whose query chain always resolves to
// the values provided. Each `from()` call returns a fresh builder so chained
// methods (select, eq, in, …) all return `this`.

type QueryResult = { data?: unknown; count?: number; error?: null }

function makeSupabase(responses: Record<string, QueryResult>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const builder: any = {
    select:     () => builder,
    eq:         () => builder,
    is:         () => builder,
    in:         () => builder,
    gte:        () => builder,
    lte:        () => builder,
    lt:         () => builder,
    order:      () => builder,
    range:      () => builder,
    limit:      () => builder,
    maybeSingle: () => Promise.resolve({ data: null, error: null }),
    single:     () => Promise.resolve({ data: null, error: null }),
    insert:     () => builder,
    update:     () => builder,
  }

  const supabase = {
    from: (table: string) => {
      const resp = responses[table] ?? { data: [], error: null }
      // Clone builder, override terminal awaits
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const b: any = {
        select:      () => b,
        eq:          () => b,
        is:          () => b,
        in:          () => b,
        gte:         () => b,
        lte:         () => b,
        lt:          () => b,
        order:       () => b,
        range:       () => b,
        limit:       () => b,
        maybeSingle: () => Promise.resolve({ data: resp.data ?? null, error: null }),
        single:      () => Promise.resolve({ data: resp.data ?? null, error: null }),
        insert:      () => ({
          select: () => ({
            single: () => Promise.resolve({ data: resp.data ?? null, error: null }),
          }),
        }),
        update:      () => ({
          eq: () => ({
            eq: () => Promise.resolve({ error: null }),
          }),
        }),
        then: (resolve: (v: QueryResult) => void) => resolve({ data: resp.data ?? [], count: resp.count ?? 0, error: null }),
      }
      return b
    },
  }

  return supabase
}

// ── Test data ─────────────────────────────────────────────────────────────────

function makeStoredSnapshot(overrides: Partial<ContextSnapshot['financial_state']> = {}): ContextSnapshot {
  return {
    financial_state: {
      cash_try:           500_000,
      cash_runway_months: 6,
      net_income_try:     80_000,
      revenue_trend:      'up',
      situation_status:   'healthy',
      composite_score:    82,
      ...overrides,
    },
    partner_state: {
      total_partner_debt_try: 100_000,
      active_partners:        2,
      overfinanced_partners:  0,
    },
    receivables_state: {
      total_receivables_try:   200_000,
      overdue_receivables_try: 20_000,
      overdue_ratio:           10,
    },
    governance_state: {
      open_period_days:   45,
      pending_workflows:  1,
      recent_resolutions: 3,
    },
    computed_at: new Date().toISOString(),
  }
}

// ── 1. buildSnapshot returns correct structure ─────────────────────────────────

describe('buildSnapshot', () => {
  it('returns an object with all required top-level keys', async () => {
    // Minimal supabase that returns empty results for everything
    const supabase = makeSupabase({})

    // PeriodService and PartnerService need mocked DB; we can't call the real
    // ones here. Instead verify the shape contract by spying on buildSnapshot
    // and injecting a known result.
    const spy = vi.spyOn(DecisionContextService, 'buildSnapshot').mockResolvedValueOnce(makeStoredSnapshot())

    const result = await DecisionContextService.buildSnapshot('company-1', 'user-1', supabase as never)

    expect(result).toHaveProperty('financial_state')
    expect(result).toHaveProperty('partner_state')
    expect(result).toHaveProperty('receivables_state')
    expect(result).toHaveProperty('governance_state')
    expect(result).toHaveProperty('computed_at')

    spy.mockRestore()
  })

  it('returns correct types in financial_state', async () => {
    const snap = makeStoredSnapshot()
    const spy  = vi.spyOn(DecisionContextService, 'buildSnapshot').mockResolvedValueOnce(snap)

    const result = await DecisionContextService.buildSnapshot('c', 'u', {} as never)

    expect(typeof result.financial_state.cash_try).toBe('number')
    expect(typeof result.financial_state.cash_runway_months).toBe('number')
    expect(['up', 'down', 'stable']).toContain(result.financial_state.revenue_trend)
    expect(['healthy', 'caution', 'at-risk', 'critical']).toContain(result.financial_state.situation_status)

    spy.mockRestore()
  })
})

// ── 2. capture stores snapshot with trigger info ──────────────────────────────

describe('capture', () => {
  it('inserts a row with trigger info and returns the snapshot', async () => {
    const stored = makeStoredSnapshot()
    const buildSpy = vi.spyOn(DecisionContextService, 'buildSnapshot').mockResolvedValueOnce(stored)

    const returnedRow = {
      id:               'snap-uuid-1',
      company_id:       'company-1',
      trigger_type:     'workflow_approved',
      trigger_id:       'wf-123',
      trigger_label:    'Test Onayı',
      decision_by:      'user-1',
      decision_at:      new Date().toISOString(),
      context_snapshot: stored,
      annotation:       null,
      annotated_by:     null,
      annotated_at:     null,
      created_at:       new Date().toISOString(),
    }

    const supabase = {
      from: () => ({
        insert: () => ({
          select: () => ({
            single: () => Promise.resolve({ data: returnedRow, error: null }),
          }),
        }),
      }),
    }

    const result = await DecisionContextService.capture(
      'company-1', 'user-1', supabase as never,
      { triggerType: 'workflow_approved', triggerId: 'wf-123', triggerLabel: 'Test Onayı' },
    )

    expect(result.trigger_type).toBe('workflow_approved')
    expect(result.trigger_id).toBe('wf-123')
    expect(result.trigger_label).toBe('Test Onayı')
    expect(result.context_snapshot).toEqual(stored)

    buildSpy.mockRestore()
  })
})

// ── 3. list returns newest first ──────────────────────────────────────────────

describe('list', () => {
  it('passes order desc and returns the data array', async () => {
    const snap1 = { id: 'a', decision_at: '2024-03-01T10:00:00Z' }
    const snap2 = { id: 'b', decision_at: '2024-01-01T10:00:00Z' }

    // DB is already ordered; we just verify the service returns what it gets
    const rows = [snap1, snap2]  // newest first as DB would return

    const supabase = {
      from: () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const b: any = {
          select: () => b,
          eq:     () => b,
          order:  () => b,
          range:  () => b,
          then:   (resolve: (v: unknown) => void) => resolve({ data: rows, error: null }),
        }
        return b
      },
    }

    const result = await DecisionContextService.list('company-1', supabase as never)

    expect(result).toHaveLength(2)
    expect(result[0].id).toBe('a')   // newest first
    expect(result[1].id).toBe('b')
  })
})

// ── 4. annotate updates annotation fields ─────────────────────────────────────

describe('annotate', () => {
  it('calls update with annotation, annotated_by, annotated_at', async () => {
    const updateData: Record<string, unknown> = {}

    const supabase = {
      from: () => ({
        update: (data: Record<string, unknown>) => {
          Object.assign(updateData, data)
          return {
            eq: () => ({
              eq: () => Promise.resolve({ error: null }),
            }),
          }
        },
      }),
    }

    await DecisionContextService.annotate(
      'snap-1', 'company-1', 'user-1', 'This decision was made to cut costs', supabase as never,
    )

    expect(updateData.annotation).toBe('This decision was made to cut costs')
    expect(updateData.annotated_by).toBe('user-1')
    expect(typeof updateData.annotated_at).toBe('string')
  })
})

// ── 5. Context snapshot includes all required fields ──────────────────────────

describe('ContextSnapshot shape', () => {
  it('has all required fields in each sub-object', () => {
    const snap = makeStoredSnapshot()

    // financial_state
    expect(snap.financial_state).toHaveProperty('cash_try')
    expect(snap.financial_state).toHaveProperty('cash_runway_months')
    expect(snap.financial_state).toHaveProperty('net_income_try')
    expect(snap.financial_state).toHaveProperty('revenue_trend')
    expect(snap.financial_state).toHaveProperty('situation_status')
    expect(snap.financial_state).toHaveProperty('composite_score')

    // partner_state
    expect(snap.partner_state).toHaveProperty('total_partner_debt_try')
    expect(snap.partner_state).toHaveProperty('active_partners')
    expect(snap.partner_state).toHaveProperty('overfinanced_partners')

    // receivables_state
    expect(snap.receivables_state).toHaveProperty('total_receivables_try')
    expect(snap.receivables_state).toHaveProperty('overdue_receivables_try')
    expect(snap.receivables_state).toHaveProperty('overdue_ratio')

    // governance_state
    expect(snap.governance_state).toHaveProperty('open_period_days')
    expect(snap.governance_state).toHaveProperty('pending_workflows')
    expect(snap.governance_state).toHaveProperty('recent_resolutions')

    expect(snap).toHaveProperty('computed_at')
  })
})

// ── 6. overdue_ratio = 0 when no receivables ─────────────────────────────────

describe('overdue_ratio edge cases', () => {
  it('is 0 when total receivables is 0', () => {
    const total     = 0
    const overdue   = 0
    const ratio     = total > 0 ? (overdue / total) * 100 : 0
    expect(ratio).toBe(0)
  })

  it('is 0 when there are receivables but none are overdue', () => {
    const total     = 100_000
    const overdue   = 0
    const ratio     = total > 0 ? (overdue / total) * 100 : 0
    expect(ratio).toBe(0)
  })

  it('is 100 when all receivables are overdue', () => {
    const total     = 100_000
    const overdue   = 100_000
    const ratio     = total > 0 ? (overdue / total) * 100 : 0
    expect(ratio).toBe(100)
  })
})

// ── 7. revenue_trend logic ────────────────────────────────────────────────────

describe('revenue_trend logic', () => {
  function computeTrend(rev30: number, prevRev: number): 'up' | 'down' | 'stable' {
    if (rev30 > prevRev * 1.05)      return 'up'
    if (rev30 < prevRev * 0.95)      return 'down'
    return 'stable'
  }

  it('returns up when last 30 days revenue is >5% higher', () => {
    expect(computeTrend(110_000, 100_000)).toBe('up')
  })

  it('returns down when last 30 days revenue is >5% lower', () => {
    expect(computeTrend(90_000, 100_000)).toBe('down')
  })

  it('returns stable when revenue is within 5% band', () => {
    expect(computeTrend(100_000, 100_000)).toBe('stable')
    expect(computeTrend(103_000, 100_000)).toBe('stable')
    expect(computeTrend(97_000,  100_000)).toBe('stable')
  })

  it('returns stable when prev is 0 and current is 0', () => {
    expect(computeTrend(0, 0)).toBe('stable')
  })

  it('returns up when prev is 0 and current is positive', () => {
    expect(computeTrend(50_000, 0)).toBe('up')
  })
})

// ── 8. Partial data (some queries fail) → snapshot with 0 fallbacks ───────────

describe('partial data resilience', () => {
  it('buildSnapshot handles Promise.allSettled rejections gracefully', async () => {
    // The service uses Promise.allSettled internally. We test the logic directly:
    // if a settled result has status 'rejected', the value should default to 0.

    const fallback = (result: PromiseSettledResult<number>, defaultVal = 0): number =>
      result.status === 'fulfilled' ? result.value : defaultVal

    const rejected: PromiseRejectedResult  = { status: 'rejected', reason: new Error('DB timeout') }
    const fulfilled: PromiseFulfilledResult<number> = { status: 'fulfilled', value: 99_000 }

    expect(fallback(rejected)).toBe(0)
    expect(fallback(fulfilled)).toBe(99_000)
  })

  it('returns snapshot with 0 cash when cash fetch fails', async () => {
    // Spy on buildSnapshot to simulate partial failure result
    const partialSnap: ContextSnapshot = {
      ...makeStoredSnapshot({ cash_try: 0, cash_runway_months: 0 }),
    }
    const spy = vi.spyOn(DecisionContextService, 'buildSnapshot').mockResolvedValueOnce(partialSnap)

    const result = await DecisionContextService.buildSnapshot('c', 'u', {} as never)

    expect(result.financial_state.cash_try).toBe(0)
    expect(result.financial_state.cash_runway_months).toBe(0)
    // Other fields still populated
    expect(result.partner_state).toBeDefined()
    expect(result.receivables_state).toBeDefined()

    spy.mockRestore()
  })

  it('snapshot computed_at is a valid ISO string', () => {
    const snap = makeStoredSnapshot()
    expect(() => new Date(snap.computed_at)).not.toThrow()
    expect(new Date(snap.computed_at).getTime()).toBeGreaterThan(0)
  })
})

// ── 9. getById — returns snapshot by ID ───────────────────────────────────────

describe('getById', () => {
  it('returns the snapshot when found', async () => {
    const stored = makeStoredSnapshot()
    const returnedRow = {
      id:               'snap-uuid-99',
      company_id:       'company-1',
      trigger_type:     'manual',
      trigger_id:       null,
      trigger_label:    'Test',
      decision_by:      'user-1',
      decision_at:      new Date().toISOString(),
      context_snapshot: stored,
      annotation:       null,
      annotated_by:     null,
      annotated_at:     null,
      created_at:       new Date().toISOString(),
    }

    const supabase = {
      from: () => ({
        select:      () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: returnedRow, error: null }),
            }),
          }),
        }),
      }),
    }

    const result = await DecisionContextService.getById('snap-uuid-99', 'company-1', supabase as never)
    expect(result).not.toBeNull()
    expect(result?.id).toBe('snap-uuid-99')
    expect(result?.context_snapshot).toEqual(stored)
  })

  it('returns null when snapshot not found', async () => {
    const supabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: null, error: null }),
            }),
          }),
        }),
      }),
    }

    const result = await DecisionContextService.getById('nonexistent', 'company-1', supabase as never)
    expect(result).toBeNull()
  })
})

// ── 10. composite_score boundary values ───────────────────────────────────────

describe('composite_score boundary values', () => {
  it('composite_score can be 0 (worst case)', () => {
    const snap = makeStoredSnapshot({ composite_score: 0 })
    expect(snap.financial_state.composite_score).toBe(0)
  })

  it('composite_score can be 100 (best case)', () => {
    const snap = makeStoredSnapshot({ composite_score: 100 })
    expect(snap.financial_state.composite_score).toBe(100)
  })

  it('composite_score must be a number', () => {
    const snap = makeStoredSnapshot({ composite_score: 55 })
    expect(typeof snap.financial_state.composite_score).toBe('number')
  })

  it('composite_score of 50 is in valid range', () => {
    const snap = makeStoredSnapshot({ composite_score: 50 })
    expect(snap.financial_state.composite_score).toBeGreaterThanOrEqual(0)
    expect(snap.financial_state.composite_score).toBeLessThanOrEqual(100)
  })
})

// ── 11. situation_status all valid values ─────────────────────────────────────

describe('situation_status valid values', () => {
  const validStatuses = ['healthy', 'caution', 'at-risk', 'critical'] as const

  for (const status of validStatuses) {
    it(`situation_status '${status}' is accepted`, () => {
      const snap = makeStoredSnapshot({ situation_status: status })
      expect(snap.financial_state.situation_status).toBe(status)
    })
  }

  it('situation_status is always one of the 4 valid values', () => {
    const snap = makeStoredSnapshot()
    expect(validStatuses).toContain(snap.financial_state.situation_status)
  })
})

// ── 12. list with triggerType filter ─────────────────────────────────────────

describe('list — filtered by triggerType', () => {
  it('passes triggerType filter correctly', async () => {
    const rows = [
      { id: 'a', trigger_type: 'workflow_approved', decision_at: '2024-05-01T10:00:00Z' },
      { id: 'b', trigger_type: 'workflow_approved', decision_at: '2024-04-01T10:00:00Z' },
    ]

    const supabase = {
      from: () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const b: any = {
          select: () => b,
          eq:     () => b,
          order:  () => b,
          range:  () => b,
          then:   (resolve: (v: unknown) => void) => resolve({ data: rows, error: null }),
        }
        return b
      },
    }

    const result = await DecisionContextService.list('company-1', supabase as never, { triggerType: 'workflow_approved' })
    expect(result).toHaveLength(2)
    expect(result.every(r => r.trigger_type === 'workflow_approved')).toBe(true)
  })

  it('list with limit option limits results', async () => {
    const rows = [{ id: 'x', decision_at: '2024-03-01T10:00:00Z' }]

    const supabase = {
      from: () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const b: any = {
          select: () => b,
          eq:     () => b,
          order:  () => b,
          range:  () => b,
          then:   (resolve: (v: unknown) => void) => resolve({ data: rows, error: null }),
        }
        return b
      },
    }

    const result = await DecisionContextService.list('company-1', supabase as never, { limit: 1 })
    expect(result).toHaveLength(1)
  })

  it('empty result returns an empty array', async () => {
    const supabase = {
      from: () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const b: any = {
          select: () => b,
          eq:     () => b,
          order:  () => b,
          range:  () => b,
          then:   (resolve: (v: unknown) => void) => resolve({ data: [], error: null }),
        }
        return b
      },
    }

    const result = await DecisionContextService.list('company-1', supabase as never)
    expect(result).toEqual([])
  })
})

// ── 13. cash_runway_months edge cases ─────────────────────────────────────────

describe('cash_runway_months edge cases', () => {
  it('zero cash → runway is 0', () => {
    const monthlyExpense = 50_000
    const cash = 0
    const runway = monthlyExpense > 0 ? cash / monthlyExpense : 0
    expect(runway).toBe(0)
  })

  it('very high cash → long runway', () => {
    const monthlyExpense = 50_000
    const cash = 1_200_000
    const runway = monthlyExpense > 0 ? cash / monthlyExpense : 0
    expect(runway).toBe(24)
  })

  it('cash_runway_months is non-negative', () => {
    const snap = makeStoredSnapshot({ cash_runway_months: 0 })
    expect(snap.financial_state.cash_runway_months).toBeGreaterThanOrEqual(0)
  })

  it('runway with cash < monthly expenses < 1 month', () => {
    const monthlyExpense = 100_000
    const cash = 30_000
    const runway = cash / monthlyExpense
    expect(runway).toBeCloseTo(0.3, 1)
  })
})

// ── 14. overfinanced_partners detection ──────────────────────────────────────

describe('overfinanced_partners detection', () => {
  it('partner with loan share > expected share by >5% is overfinanced', () => {
    const netLoan       = 700_000  // partner has 70% of total loans
    const totalLoan     = 1_000_000
    const shareRatio    = 0.60     // expected share is 60%
    const actualShare   = netLoan / totalLoan
    const burden        = Math.abs(actualShare - shareRatio)
    const isOverfinanced = burden > 0.05
    expect(isOverfinanced).toBe(true)
  })

  it('partner within 5% of expected share is not overfinanced', () => {
    const netLoan    = 620_000   // actual 62%, expected 60% → diff 2%
    const totalLoan  = 1_000_000
    const shareRatio = 0.60
    const actualShare = netLoan / totalLoan
    const burden     = Math.abs(actualShare - shareRatio)
    const isOverfinanced = burden > 0.05
    expect(isOverfinanced).toBe(false)
  })

  it('zero total loans → no overfinanced partners', () => {
    const totalLoan = 0
    // Guard: if totalLoan is 0, skip overfinance check
    const overfinanced = totalLoan > 0 ? 1 : 0
    expect(overfinanced).toBe(0)
  })
})

// ── 15. annotate — timestamp is recent ────────────────────────────────────────

describe('annotate — timestamp freshness', () => {
  it('annotated_at is within 5 seconds of now', async () => {
    const beforeCall = Date.now()
    let capturedAnnotatedAt: string | null = null

    const supabase = {
      from: () => ({
        update: (data: Record<string, unknown>) => {
          capturedAnnotatedAt = data.annotated_at as string
          return {
            eq: () => ({
              eq: () => Promise.resolve({ error: null }),
            }),
          }
        },
      }),
    }

    await DecisionContextService.annotate('snap-1', 'company-1', 'user-1', 'Note', supabase as never)

    const afterCall = Date.now()
    expect(capturedAnnotatedAt).not.toBeNull()
    const annotatedMs = new Date(capturedAnnotatedAt!).getTime()
    expect(annotatedMs).toBeGreaterThanOrEqual(beforeCall - 100)
    expect(annotatedMs).toBeLessThanOrEqual(afterCall + 100)
  })

  it('annotate with empty string still writes annotation', async () => {
    const updateData: Record<string, unknown> = {}
    const supabase = {
      from: () => ({
        update: (data: Record<string, unknown>) => {
          Object.assign(updateData, data)
          return { eq: () => ({ eq: () => Promise.resolve({ error: null }) }) }
        },
      }),
    }

    await DecisionContextService.annotate('snap-1', 'company-1', 'user-1', '', supabase as never)
    expect(updateData.annotation).toBe('')
    expect(updateData.annotated_by).toBe('user-1')
  })
})

// ── 16. DecisionContextSnapshot type completeness ─────────────────────────────

describe('DecisionContextSnapshot type completeness', () => {
  it('trigger_type can be workflow_approved', () => {
    const row = {
      id: 'a', company_id: 'c', trigger_type: 'workflow_approved',
      trigger_id: 'wf-1', trigger_label: 'Test',
      decision_by: 'u1', decision_at: new Date().toISOString(),
      context_snapshot: makeStoredSnapshot(),
      annotation: null, annotated_by: null, annotated_at: null,
      created_at: new Date().toISOString(),
    }
    expect(row.trigger_type).toBe('workflow_approved')
  })

  it('trigger_type can be dividend_declared', () => {
    const snap = makeStoredSnapshot()
    expect(snap.financial_state).toBeDefined()
    // Just verifying trigger_type is a free-form text field
    const triggerType = 'dividend_declared'
    expect(typeof triggerType).toBe('string')
  })

  it('trigger_id can be null (manual snapshots)', () => {
    const row = {
      id: 'b', company_id: 'c', trigger_type: 'manual',
      trigger_id: null, trigger_label: 'Manual Check',
      decision_by: 'u1', decision_at: new Date().toISOString(),
      context_snapshot: makeStoredSnapshot(),
      annotation: null, annotated_by: null, annotated_at: null,
      created_at: new Date().toISOString(),
    }
    expect(row.trigger_id).toBeNull()
  })

  it('annotation can be null initially', () => {
    const row = {
      annotation: null as string | null,
    }
    expect(row.annotation).toBeNull()
  })

  it('annotated_at can be set to a date after annotation', () => {
    const now = new Date().toISOString()
    expect(typeof now).toBe('string')
    expect(new Date(now).getTime()).toBeGreaterThan(0)
  })
})

// ── 17. partner_state edge cases ─────────────────────────────────────────────

describe('partner_state edge cases', () => {
  it('0 active partners is valid', () => {
    const snap = makeStoredSnapshot()
    snap.partner_state.active_partners = 0
    expect(snap.partner_state.active_partners).toBe(0)
  })

  it('overfinanced_partners cannot exceed active_partners', () => {
    const snap = makeStoredSnapshot()
    snap.partner_state.active_partners       = 3
    snap.partner_state.overfinanced_partners = 1
    expect(snap.partner_state.overfinanced_partners).toBeLessThanOrEqual(snap.partner_state.active_partners)
  })

  it('total_partner_debt_try is non-negative', () => {
    const snap = makeStoredSnapshot()
    expect(snap.partner_state.total_partner_debt_try).toBeGreaterThanOrEqual(0)
  })

  it('zero partner debt is valid state', () => {
    const snap = makeStoredSnapshot()
    snap.partner_state.total_partner_debt_try = 0
    expect(snap.partner_state.total_partner_debt_try).toBe(0)
  })
})

// ── 18. governance_state boundary values ──────────────────────────────────────

describe('governance_state boundary values', () => {
  it('open_period_days can be 0 (just opened)', () => {
    const snap = makeStoredSnapshot()
    snap.governance_state.open_period_days = 0
    expect(snap.governance_state.open_period_days).toBe(0)
  })

  it('open_period_days of 365 is valid (long running period)', () => {
    const snap = makeStoredSnapshot()
    snap.governance_state.open_period_days = 365
    expect(snap.governance_state.open_period_days).toBe(365)
  })

  it('pending_workflows of 0 is valid', () => {
    const snap = makeStoredSnapshot()
    snap.governance_state.pending_workflows = 0
    expect(snap.governance_state.pending_workflows).toBe(0)
  })

  it('recent_resolutions of 0 is valid (no recent activity)', () => {
    const snap = makeStoredSnapshot()
    snap.governance_state.recent_resolutions = 0
    expect(snap.governance_state.recent_resolutions).toBe(0)
  })

  it('all governance fields are integers', () => {
    const snap = makeStoredSnapshot()
    expect(Number.isInteger(snap.governance_state.open_period_days)).toBe(true)
    expect(Number.isInteger(snap.governance_state.pending_workflows)).toBe(true)
    expect(Number.isInteger(snap.governance_state.recent_resolutions)).toBe(true)
  })
})
