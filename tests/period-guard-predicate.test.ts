// ── period-guard-predicate.test.ts ───────────────────────────────────────────
// GUARD for the canonical period write-block predicate (lib/middleware/period-guard.ts).
//
// checkPeriodGuard is the application-level first line of defense that stops
// financial writes into a locked/closed accounting period (the DB trigger is the
// second). Its lock/close/open/adjustment logic was previously only indirectly
// exercised (assertNotLocked). This test pins the predicate directly so a future
// edit that, say, stops blocking 'locked' or silently allows closed-period writes
// becomes a red build.

import { describe, it, expect } from 'vitest'
import {
  checkPeriodGuard,
  getPeriodForDate,
  strictPeriodGuard,
  assertNotLocked,
} from '../lib/middleware/period-guard'

type Row = { id: string; status: string } | null

// Minimal chainable Supabase stub: every builder method returns `this`; the
// terminal maybeSingle() resolves to { data, error }.
function fakeSupabase(periodRow: Row, opts?: { error?: boolean }) {
  const result = { data: periodRow, error: opts?.error ? { message: 'table missing' } : null }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: any = {}
  for (const m of ['from', 'select', 'eq', 'lte', 'gte', 'limit', 'order']) chain[m] = () => chain
  chain.maybeSingle = async () => result
  return chain
}

const DATE = '2026-03-15'

describe('checkPeriodGuard — canonical write-block predicate', () => {
  it('locked period → BLOCKED with period_status locked', async () => {
    const g = await checkPeriodGuard('c1', DATE, fakeSupabase({ id: 'p1', status: 'locked' }))
    expect(g.blocked).toBe(true)
    expect(g.period_status).toBe('locked')
    expect(g.period_id).toBe('p1')
    expect(g.reason).toBeTruthy()
  })

  it('closed period without allowAdjustment → BLOCKED', async () => {
    const g = await checkPeriodGuard('c1', DATE, fakeSupabase({ id: 'p2', status: 'closed' }))
    expect(g.blocked).toBe(true)
    expect(g.period_status).toBe('closed')
  })

  it('closed period WITH allowAdjustment → allowed (adjustment entry)', async () => {
    const g = await checkPeriodGuard('c1', DATE, fakeSupabase({ id: 'p2', status: 'closed' }), { allowAdjustment: true })
    expect(g.blocked).toBe(false)
    expect(g.period_status).toBe('closed')
  })

  it('open period → allowed', async () => {
    const g = await checkPeriodGuard('c1', DATE, fakeSupabase({ id: 'p3', status: 'open' }))
    expect(g.blocked).toBe(false)
    expect(g.period_status).toBe('open')
  })

  it('pre_close period → allowed (not yet closed)', async () => {
    const g = await checkPeriodGuard('c1', DATE, fakeSupabase({ id: 'p4', status: 'pre_close' }))
    expect(g.blocked).toBe(false)
  })

  it('no period covering the date → allowed (fail-open by design)', async () => {
    const g = await checkPeriodGuard('c1', DATE, fakeSupabase(null))
    expect(g.blocked).toBe(false)
    expect(g.period_status).toBeUndefined()
  })

  it('period table error → getPeriodForDate returns null → not blocked (defensive)', async () => {
    const period = await getPeriodForDate('c1', DATE, fakeSupabase({ id: 'p1', status: 'locked' }, { error: true }))
    expect(period).toBeNull()
    const g = await checkPeriodGuard('c1', DATE, fakeSupabase({ id: 'p1', status: 'locked' }, { error: true }))
    expect(g.blocked).toBe(false)
  })
})

describe('strictPeriodGuard / assertNotLocked — throwing variants', () => {
  it('strictPeriodGuard throws PERIOD_LOCKED on a locked period', async () => {
    await expect(
      strictPeriodGuard('c1', DATE, fakeSupabase({ id: 'p1', status: 'locked' })),
    ).rejects.toMatchObject({ code: 'PERIOD_LOCKED' })
  })

  it('strictPeriodGuard resolves on an open period', async () => {
    await expect(
      strictPeriodGuard('c1', DATE, fakeSupabase({ id: 'p3', status: 'open' })),
    ).resolves.toBeUndefined()
  })

  it('assertNotLocked throws on a blocked result and is silent otherwise', () => {
    expect(() => assertNotLocked({ blocked: true, period_status: 'locked' })).toThrow()
    expect(() => assertNotLocked({ blocked: false })).not.toThrow()
  })
})
