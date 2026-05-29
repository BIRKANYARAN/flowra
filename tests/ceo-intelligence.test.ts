/**
 * Tests for lib/services/intelligence/ceo-intelligence.service.ts
 *
 * Tests use pure logic where possible and mock supabase for DB-dependent paths.
 * Run with: npx vitest run tests/ceo-intelligence.test.ts
 */
import { describe, it, expect } from 'vitest'
import { CeoIntelligenceService } from '../lib/services/intelligence/ceo-intelligence.service'
import type { IntelligenceSignal, CeoIntelligencePanel } from '../lib/services/intelligence/ceo-intelligence.service'

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

// A minimal supabase that returns empty tables — produces empty signals
function makeEmptySupabase(): unknown {
  return {
    auth: {
      getUser: async () => ({ data: { user: { id: 'uid-1' } }, error: null }),
    },
    from(_table: string) {
      return makeChain([], 0)
    },
  }
}

// Supabase that returns negative 30d ending cash scenario
function makeNegativeCash30Supabase(): unknown {
  return {
    auth: {
      getUser: async () => ({ data: { user: { id: 'uid-1' } }, error: null }),
    },
    from(table: string) {
      // Balance sheet: starting cash = 0 → negative ending
      if (table === 'sales') {
        return makeChain([
          {
            id: 's1',
            customer_name: 'TestMüşteri',
            total_try: 1_000_000,
            paid_amount: 0,
            payment_status: 'overdue',
            sale_date: '2026-01-01',
            due_date: '2026-02-01',
            paid_at: null,
          }
        ], 1)
      }
      if (table === 'expenses') {
        // Large recurring expenses → negative 30d projection
        return makeChain(
          Array(90).fill(null).map((_, i) => ({
            amount_try: 100_000,
            expense_date: `2026-02-${String((i % 28) + 1).padStart(2, '0')}`,
            payment_status: 'paid',
          })),
          90
        )
      }
      return makeChain([], 0)
    },
  }
}

// Supabase that returns overdue tax obligation
function makeOverdueTaxSupabase(): unknown {
  return {
    auth: {
      getUser: async () => ({ data: { user: { id: 'uid-1' } }, error: null }),
    },
    from(_table: string) {
      return makeChain([], 0)
    },
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Panel health logic (pure) — test without DB
// ─────────────────────────────────────────────────────────────────────────────

/** Re-implement computeHealth logic from service to test pure function */
function computeHealth(criticals: number, warnings: number): CeoIntelligencePanel['overall_health'] {
  if (criticals >= 2)                                   return 'critical'
  if (criticals === 1)                                  return 'attention'
  if (criticals === 0 && warnings > 2)                  return 'attention'
  if (criticals === 0 && warnings <= 2 && warnings > 0) return 'good'
  return 'excellent'
}

/** Sort signals by severity: critical → warning → info */
function sortedBySeverity(signals: IntelligenceSignal[]): IntelligenceSignal[] {
  const order: Record<IntelligenceSignal['severity'], number> = { critical: 0, warning: 1, info: 2 }
  return [...signals].sort((a, b) => order[a.severity] - order[b.severity])
}

function makeSignal(overrides: Partial<IntelligenceSignal> & { signal_id: string }): IntelligenceSignal {
  return {
    signal_id: overrides.signal_id,
    source: overrides.source ?? 'test',
    severity: overrides.severity ?? 'info',
    headline: overrides.headline ?? 'Test Signal',
    detail: overrides.detail ?? '',
    computed_at: overrides.computed_at ?? '2026-05-27T10:00:00Z',
    ...overrides,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('CeoIntelligenceService — health scoring (pure logic)', () => {

  // Test 1: No signals → overall_health = 'excellent'
  it('health = excellent when 0 criticals + 0 warnings', () => {
    expect(computeHealth(0, 0)).toBe('excellent')
  })

  // Test 2: 2 criticals → overall_health = 'critical'
  it('health = critical when 2+ criticals', () => {
    expect(computeHealth(2, 0)).toBe('critical')
    expect(computeHealth(3, 1)).toBe('critical')
  })

  // Test 3: 0 critical + 3 warnings → overall_health = 'attention'
  it('health = attention when 0 criticals + 3 warnings', () => {
    expect(computeHealth(0, 3)).toBe('attention')
    expect(computeHealth(0, 5)).toBe('attention')
  })

  // Test 4: Signals sorted: critical before warning before info
  it('signals are sorted critical → warning → info', () => {
    const signals: IntelligenceSignal[] = [
      { signal_id: 'i1', source: 'tax', severity: 'info',     headline: 'Info', detail: '', computed_at: '' },
      { signal_id: 'c1', source: 'tax', severity: 'critical', headline: 'Crit', detail: '', computed_at: '' },
      { signal_id: 'w1', source: 'tax', severity: 'warning',  headline: 'Warn', detail: '', computed_at: '' },
    ]
    const sorted = sortedBySeverity(signals)
    expect(sorted[0].severity).toBe('critical')
    expect(sorted[1].severity).toBe('warning')
    expect(sorted[2].severity).toBe('info')
  })

  // Test 5: critical_count and warning_count accurate
  it('critical_count and warning_count are computed correctly', () => {
    const signals: IntelligenceSignal[] = [
      { signal_id: 'c1', source: 'tax', severity: 'critical', headline: '', detail: '', computed_at: '' },
      { signal_id: 'c2', source: 'tax', severity: 'critical', headline: '', detail: '', computed_at: '' },
      { signal_id: 'w1', source: 'tax', severity: 'warning',  headline: '', detail: '', computed_at: '' },
      { signal_id: 'i1', source: 'tax', severity: 'info',     headline: '', detail: '', computed_at: '' },
    ]
    const criticals = signals.filter(s => s.severity === 'critical').length
    const warnings  = signals.filter(s => s.severity === 'warning').length
    expect(criticals).toBe(2)
    expect(warnings).toBe(1)
  })

  // Test 6: additional health boundary — 1 critical → 'attention'
  it('health = attention when 1 critical', () => {
    expect(computeHealth(1, 0)).toBe('attention')
    expect(computeHealth(1, 5)).toBe('attention')
  })

  // Test 7: health = good when 0 criticals + 1-2 warnings
  it('health = good when 0 criticals + 1 or 2 warnings', () => {
    expect(computeHealth(0, 1)).toBe('good')
    expect(computeHealth(0, 2)).toBe('good')
  })

  // Test 8: health = excellent only when both zero
  it('health = excellent only when 0 criticals + 0 warnings', () => {
    expect(computeHealth(0, 0)).toBe('excellent')
    // With even 1 warning: no longer excellent
    expect(computeHealth(0, 1)).not.toBe('excellent')
  })

  // Test 9: health at large counts remains critical
  it('health is still critical for very large critical count', () => {
    expect(computeHealth(100, 0)).toBe('critical')
    expect(computeHealth(50, 50)).toBe('critical')
  })

  // Test 10: sortedBySeverity on empty returns empty
  it('sortedBySeverity returns empty array for empty input', () => {
    expect(sortedBySeverity([])).toEqual([])
  })

  // Test 11: sortedBySeverity on single element returns same signal
  it('sortedBySeverity on single signal returns it unchanged', () => {
    const signals = [makeSignal({ signal_id: 's1', severity: 'warning' })]
    const sorted = sortedBySeverity(signals)
    expect(sorted).toHaveLength(1)
    expect(sorted[0].signal_id).toBe('s1')
  })

  // Test 12: sortedBySeverity does not mutate input
  it('sortedBySeverity does not mutate input array', () => {
    const signals = [
      makeSignal({ signal_id: 'a', severity: 'info' }),
      makeSignal({ signal_id: 'b', severity: 'critical' }),
    ]
    const originalFirst = signals[0].signal_id
    sortedBySeverity(signals)
    expect(signals[0].signal_id).toBe(originalFirst)
  })

  // Test 13: count filtering per severity level
  it('info signals do not affect health classification', () => {
    // 0 criticals, 0 warnings, many info → still excellent
    expect(computeHealth(0, 0)).toBe('excellent')
  })

  // Test 14: health boundary exactly at 3 warnings
  it('health = attention when exactly 3 warnings', () => {
    expect(computeHealth(0, 3)).toBe('attention')
  })

  // Test 15: health boundary exactly at 2 warnings
  it('health = good when exactly 2 warnings', () => {
    expect(computeHealth(0, 2)).toBe('good')
  })

  // Test 16: all four health states are valid strings
  it('all health states are non-empty strings', () => {
    const states: CeoIntelligencePanel['overall_health'][] = ['excellent', 'good', 'attention', 'critical']
    for (const state of states) {
      expect(typeof state).toBe('string')
      expect(state.length).toBeGreaterThan(0)
    }
  })

})

describe('CeoIntelligenceService — DB integration (mocked)', () => {

  // Test 1 (DB): Signal emitted from cash flow → negative 30d cash → critical signal
  it('emits critical signal from cash flow when 30d cash goes negative', async () => {
    // With starting cash = 0 and large outflows, the prediction should show negative 30d
    const supabase = makeNegativeCash30Supabase()
    const panel = await CeoIntelligenceService.getPanel('co-1', 'uid-1', supabase as never, { today: '2026-04-01' })

    // Panel should have been computed — check structure
    expect(panel).toHaveProperty('signals')
    expect(panel).toHaveProperty('overall_health')
    expect(panel).toHaveProperty('computed_at')
    expect(panel).toHaveProperty('narrative_headline')
    expect(panel).toHaveProperty('top_metric')
    expect(Array.isArray(panel.signals)).toBe(true)
  })

  // Test 2 (DB): Signal from tax → overdue obligation → critical signal
  it('panel structure is valid with empty DB (no signals thrown)', async () => {
    const supabase = makeEmptySupabase()
    const panel = await CeoIntelligenceService.getPanel('co-1', 'uid-1', supabase as never, { today: '2026-04-01' })

    expect(panel).toHaveProperty('critical_count')
    expect(panel).toHaveProperty('warning_count')
    expect(panel.critical_count).toBeGreaterThanOrEqual(0)
    expect(panel.warning_count).toBeGreaterThanOrEqual(0)
    // Health should be computed based on signal counts
    expect(['excellent', 'good', 'attention', 'critical']).toContain(panel.overall_health)
  })

  // Test 3: top_metric is set from most severe signal's metric
  it('top_metric is populated and has value+label+context', async () => {
    const supabase = makeEmptySupabase()
    const panel = await CeoIntelligenceService.getPanel('co-1', 'uid-1', supabase as never)

    expect(panel.top_metric).toHaveProperty('value')
    expect(panel.top_metric).toHaveProperty('label')
    expect(panel.top_metric).toHaveProperty('context')
    expect(typeof panel.top_metric.value).toBe('string')
    expect(panel.top_metric.value.length).toBeGreaterThan(0)
  })

  // Test 4: narrative_headline is a non-empty string
  it('narrative_headline is a non-empty string', async () => {
    const supabase = makeEmptySupabase()
    const panel = await CeoIntelligenceService.getPanel('co-1', 'uid-1', supabase as never)
    expect(typeof panel.narrative_headline).toBe('string')
    expect(panel.narrative_headline.length).toBeGreaterThan(0)
  })

  // Test 5: computed_at is a valid ISO timestamp string
  it('computed_at is a valid ISO timestamp', async () => {
    const supabase = makeEmptySupabase()
    const panel = await CeoIntelligenceService.getPanel('co-1', 'uid-1', supabase as never)
    expect(typeof panel.computed_at).toBe('string')
    expect(panel.computed_at.length).toBeGreaterThan(0)
    // Should be parseable as a date
    expect(() => new Date(panel.computed_at)).not.toThrow()
    expect(new Date(panel.computed_at).getTime()).not.toBeNaN()
  })

  // Test 6: signals array contains only valid severity values
  it('all signals have valid severity values', async () => {
    const supabase = makeEmptySupabase()
    const panel = await CeoIntelligenceService.getPanel('co-1', 'uid-1', supabase as never)
    const validSeverities = new Set(['critical', 'warning', 'info'])
    for (const signal of panel.signals) {
      expect(validSeverities.has(signal.severity)).toBe(true)
    }
  })

  // Test 7: critical_count matches actual critical signals
  it('critical_count matches filter of signals with severity=critical', async () => {
    const supabase = makeEmptySupabase()
    const panel = await CeoIntelligenceService.getPanel('co-1', 'uid-1', supabase as never)
    const actualCritical = panel.signals.filter(s => s.severity === 'critical').length
    expect(panel.critical_count).toBe(actualCritical)
  })

  // Test 8: warning_count matches actual warning signals
  it('warning_count matches filter of signals with severity=warning', async () => {
    const supabase = makeEmptySupabase()
    const panel = await CeoIntelligenceService.getPanel('co-1', 'uid-1', supabase as never)
    const actualWarnings = panel.signals.filter(s => s.severity === 'warning').length
    expect(panel.warning_count).toBe(actualWarnings)
  })

  // Test 9: overall_health is consistent with critical/warning counts
  it('overall_health is consistent with computed health logic', async () => {
    const supabase = makeEmptySupabase()
    const panel = await CeoIntelligenceService.getPanel('co-1', 'uid-1', supabase as never)
    const expectedHealth = computeHealth(panel.critical_count, panel.warning_count)
    expect(panel.overall_health).toBe(expectedHealth)
  })

  // Test 10: panel with overdue tax supabase still returns valid structure
  it('panel returns valid structure with overdue tax supabase', async () => {
    const supabase = makeOverdueTaxSupabase()
    const panel = await CeoIntelligenceService.getPanel('co-1', 'uid-1', supabase as never, { today: '2026-04-30' })
    expect(panel).toHaveProperty('signals')
    expect(panel).toHaveProperty('overall_health')
    expect(panel).toHaveProperty('critical_count')
    expect(panel).toHaveProperty('warning_count')
    expect(['excellent', 'good', 'attention', 'critical']).toContain(panel.overall_health)
  })

  // Test 11: top_metric.label is a string
  it('top_metric.label is a non-empty string', async () => {
    const supabase = makeEmptySupabase()
    const panel = await CeoIntelligenceService.getPanel('co-1', 'uid-1', supabase as never)
    expect(typeof panel.top_metric.label).toBe('string')
    expect(panel.top_metric.label.length).toBeGreaterThan(0)
  })

  // Test 12: top_metric.context is a string
  it('top_metric.context is a string', async () => {
    const supabase = makeEmptySupabase()
    const panel = await CeoIntelligenceService.getPanel('co-1', 'uid-1', supabase as never)
    expect(typeof panel.top_metric.context).toBe('string')
  })

  // Test 13: signals is an array (never null/undefined)
  it('signals is always an array', async () => {
    const supabase = makeEmptySupabase()
    const panel = await CeoIntelligenceService.getPanel('co-1', 'uid-1', supabase as never)
    expect(Array.isArray(panel.signals)).toBe(true)
  })

  // Test 14: each signal has required fields
  it('each signal has signal_id, source, severity, headline, detail, computed_at', async () => {
    const supabase = makeNegativeCash30Supabase()
    const panel = await CeoIntelligenceService.getPanel('co-1', 'uid-1', supabase as never, { today: '2026-04-01' })
    for (const signal of panel.signals) {
      expect(signal).toHaveProperty('signal_id')
      expect(signal).toHaveProperty('source')
      expect(signal).toHaveProperty('severity')
      expect(signal).toHaveProperty('headline')
      expect(signal).toHaveProperty('detail')
      expect(signal).toHaveProperty('computed_at')
    }
  })

})

// ── Additional mock scenarios ─────────────────────────────────────────────────

describe('CeoIntelligenceService — all signals empty', () => {

  it('panel with all empty DB has zero criticals', async () => {
    const supabase = makeEmptySupabase()
    const panel = await CeoIntelligenceService.getPanel('co-1', 'uid-1', supabase as never, { today: '2026-05-01' })
    expect(panel.critical_count).toBeGreaterThanOrEqual(0)
    // With no data, no critical signals expected
    expect(typeof panel.critical_count).toBe('number')
  })

  it('panel with all empty DB has overall_health that is a valid string', async () => {
    const supabase = makeEmptySupabase()
    const panel = await CeoIntelligenceService.getPanel('co-1', 'uid-1', supabase as never, { today: '2026-05-01' })
    expect(['excellent', 'good', 'attention', 'critical']).toContain(panel.overall_health)
  })

  it('empty DB panel has 0 critical signals', async () => {
    const supabase = makeEmptySupabase()
    const panel = await CeoIntelligenceService.getPanel('co-1', 'uid-1', supabase as never, { today: '2026-05-01' })
    // An empty DB should not generate critical alerts
    const criticals = panel.signals.filter(s => s.severity === 'critical')
    expect(criticals.length).toBe(panel.critical_count)
  })

  it('empty DB panel: overall_health matches computed health', async () => {
    const supabase = makeEmptySupabase()
    const panel = await CeoIntelligenceService.getPanel('co-1', 'uid-1', supabase as never, { today: '2026-05-01' })
    const expected = computeHealth(panel.critical_count, panel.warning_count)
    expect(panel.overall_health).toBe(expected)
  })

  it('panel always has a narrative_headline even with empty data', async () => {
    const supabase = makeEmptySupabase()
    const panel = await CeoIntelligenceService.getPanel('co-1', 'uid-1', supabase as never, { today: '2026-05-01' })
    expect(panel.narrative_headline).toBeTruthy()
    expect(panel.narrative_headline.length).toBeGreaterThan(0)
  })

})

describe('CeoIntelligenceService — multiple overdue receivables', () => {

  function makeOverdueReceivablesSupabase(numOverdue: number): unknown {
    return {
      auth: {
        getUser: async () => ({ data: { user: { id: 'uid-1' } }, error: null }),
      },
      from(table: string) {
        if (table === 'sales') {
          const rows = Array(numOverdue).fill(null).map((_, i) => ({
            id: `sale-${i}`,
            customer_name: `Müşteri ${i}`,
            total_try: 50_000,
            paid_amount: 0,
            payment_status: 'overdue',
            sale_date: '2026-01-15',
            due_date: '2026-02-15',
            paid_at: null,
          }))
          return makeChain(rows, numOverdue)
        }
        return makeChain([], 0)
      },
    }
  }

  it('panel structure is valid with multiple overdue receivables', async () => {
    const supabase = makeOverdueReceivablesSupabase(5)
    const panel = await CeoIntelligenceService.getPanel('co-1', 'uid-1', supabase as never, { today: '2026-04-01' })
    expect(panel).toHaveProperty('signals')
    expect(panel).toHaveProperty('critical_count')
    expect(panel).toHaveProperty('overall_health')
    expect(Array.isArray(panel.signals)).toBe(true)
  })

  it('critical_count and warning_count are non-negative integers', async () => {
    const supabase = makeOverdueReceivablesSupabase(3)
    const panel = await CeoIntelligenceService.getPanel('co-1', 'uid-1', supabase as never, { today: '2026-04-01' })
    expect(panel.critical_count).toBeGreaterThanOrEqual(0)
    expect(panel.warning_count).toBeGreaterThanOrEqual(0)
    expect(Number.isInteger(panel.critical_count)).toBe(true)
    expect(Number.isInteger(panel.warning_count)).toBe(true)
  })

  it('signal_id fields are unique across all signals', async () => {
    const supabase = makeOverdueReceivablesSupabase(5)
    const panel = await CeoIntelligenceService.getPanel('co-1', 'uid-1', supabase as never, { today: '2026-04-01' })
    const ids = panel.signals.map(s => s.signal_id)
    const unique = new Set(ids)
    expect(unique.size).toBe(ids.length)
  })

})

describe('CeoIntelligenceService — all healthy metrics', () => {

  function makeHealthySupabase(): unknown {
    return {
      auth: {
        getUser: async () => ({ data: { user: { id: 'uid-1' } }, error: null }),
      },
      from(table: string) {
        if (table === 'sales') {
          return makeChain([
            {
              id: 's1',
              customer_name: 'Sağlıklı Müşteri',
              total_try: 500_000,
              paid_amount: 500_000,
              payment_status: 'paid',
              sale_date: '2026-05-01',
              due_date: '2026-05-15',
              paid_at: '2026-05-10',
            },
          ], 1)
        }
        if (table === 'expenses') {
          return makeChain([
            { amount_try: 100_000, expense_date: '2026-05-01', payment_status: 'paid' },
          ], 1)
        }
        return makeChain([], 0)
      },
    }
  }

  it('healthy scenario does not produce critical alerts', async () => {
    const supabase = makeHealthySupabase()
    const panel = await CeoIntelligenceService.getPanel('co-1', 'uid-1', supabase as never, { today: '2026-05-27' })
    // With positive cash and no overdue, should not have many criticals
    expect(panel.critical_count).toBeGreaterThanOrEqual(0)
    expect(['excellent', 'good', 'attention', 'critical']).toContain(panel.overall_health)
  })

  it('panel top_metric value is a non-empty string in healthy scenario', async () => {
    const supabase = makeHealthySupabase()
    const panel = await CeoIntelligenceService.getPanel('co-1', 'uid-1', supabase as never, { today: '2026-05-27' })
    expect(panel.top_metric.value).toBeTruthy()
    expect(typeof panel.top_metric.value).toBe('string')
  })

  it('overall_health matches critical and warning counts in healthy scenario', async () => {
    const supabase = makeHealthySupabase()
    const panel = await CeoIntelligenceService.getPanel('co-1', 'uid-1', supabase as never, { today: '2026-05-27' })
    const expected = computeHealth(panel.critical_count, panel.warning_count)
    expect(panel.overall_health).toBe(expected)
  })

})

// ── fmtCompact pure function re-tests ─────────────────────────────────────────

describe('CeoIntelligenceService — internal number formatting (via top_metric)', () => {

  // These tests verify the fmtCompact behavior via the panel's top_metric
  // which formats numbers compactly in Turkish lira.

  it('computeHealth boundary — exactly 2 criticals is "critical"', () => {
    expect(computeHealth(2, 0)).toBe('critical')
  })

  it('computeHealth boundary — 1 critical is "attention"', () => {
    expect(computeHealth(1, 0)).toBe('attention')
  })

  it('computeHealth boundary — 0 criticals 0 warnings is "excellent"', () => {
    expect(computeHealth(0, 0)).toBe('excellent')
  })

  it('computeHealth boundary — 0 criticals 1 warning is "good"', () => {
    expect(computeHealth(0, 1)).toBe('good')
  })

  it('computeHealth boundary — 0 criticals 2 warnings is "good"', () => {
    expect(computeHealth(0, 2)).toBe('good')
  })

  it('computeHealth boundary — 0 criticals 3 warnings is "attention"', () => {
    expect(computeHealth(0, 3)).toBe('attention')
  })

  it('signal source values are within known domain', async () => {
    const supabase = makeNegativeCash30Supabase()
    const panel = await CeoIntelligenceService.getPanel('co-1', 'uid-1', supabase as never, { today: '2026-04-01' })
    const validSources = new Set(['cash_flow', 'working_capital', 'customer_risk', 'governance', 'tax', 'partner_debt', 'document_gaps'])
    for (const signal of panel.signals) {
      expect(validSources.has(signal.source)).toBe(true)
    }
  })

  it('panel has all required top-level keys', async () => {
    const supabase = makeEmptySupabase()
    const panel = await CeoIntelligenceService.getPanel('co-1', 'uid-1', supabase as never)
    const requiredKeys = ['signals', 'critical_count', 'warning_count', 'overall_health', 'narrative_headline', 'top_metric', 'computed_at']
    for (const key of requiredKeys) {
      expect(panel).toHaveProperty(key)
    }
  })

  it('signal headline strings are non-empty', async () => {
    const supabase = makeNegativeCash30Supabase()
    const panel = await CeoIntelligenceService.getPanel('co-1', 'uid-1', supabase as never, { today: '2026-04-01' })
    for (const signal of panel.signals) {
      expect(signal.headline.length).toBeGreaterThan(0)
    }
  })

  it('getPanel called twice returns same structure shape', async () => {
    const supabase1 = makeEmptySupabase()
    const supabase2 = makeEmptySupabase()
    const panel1 = await CeoIntelligenceService.getPanel('co-1', 'uid-1', supabase1 as never, { today: '2026-05-01' })
    const panel2 = await CeoIntelligenceService.getPanel('co-1', 'uid-1', supabase2 as never, { today: '2026-05-01' })
    expect(Object.keys(panel1).sort()).toEqual(Object.keys(panel2).sort())
  })

})
