/**
 * Smart Receivables Prioritization — unit tests
 *
 * Tests the pure scoring logic of ReceivablesPriorityService.
 * Async tests use a mocked supabase client.
 *
 * Run with: npx vitest run tests/receivables-priority.test.ts
 */

import { describe, it, expect } from 'vitest'
import { ReceivablesPriorityService } from '../lib/services/commercial/receivables-priority.service'

// ── Helpers ───────────────────────────────────────────────────────────────────

type Row = Record<string, unknown>
type Tables = Record<string, Row[]>

function makeSupabase(tables: Tables) {
  function buildChain(rows: Row[]): unknown {
    const chain: Record<string, unknown> = {
      data:  rows,
      error: null,
      then:  (resolve: (v: { data: Row[]; error: null }) => unknown) =>
               Promise.resolve(resolve({ data: rows, error: null })),
    }
    for (const m of ['eq', 'neq', 'is', 'in', 'gte', 'lte', 'lt', 'gt', 'select', 'order', 'limit', 'single']) {
      chain[m] = () => chain
    }
    return chain
  }
  return { from: (table: string) => buildChain(tables[table] ?? []) }
}

const COMPANY = 'test-company'
const TODAY   = '2024-02-15'

// ── 1. scoreReceivable — low risk, not overdue → high score (> 70) ───────────

describe('scoreReceivable', () => {
  it('low risk + not overdue → score > 70', () => {
    const { score } = ReceivablesPriorityService.scoreReceivable({
      outstanding_try: 10000,
      days_overdue: null,
      customer_risk_tier: 'low',
      customer_on_time_rate: 0.9,
    })
    // Base 50 + low +30 + not overdue +20 + on_time > 0.8 +10 = 110 → clamped 100
    expect(score).toBeGreaterThan(70)
  })

  it('critical risk + 60+ days overdue → score < 30', () => {
    const { score } = ReceivablesPriorityService.scoreReceivable({
      outstanding_try: 5000,
      days_overdue: 90,
      customer_risk_tier: 'critical',
      customer_on_time_rate: 0.3,
    })
    // Base 50 - critical 30 - 60+d 25 - on_time<0.5 10 = -15 → clamped 0
    expect(score).toBeLessThan(30)
  })

  it('medium risk + 15 days overdue → score around 50', () => {
    const { score } = ReceivablesPriorityService.scoreReceivable({
      outstanding_try: 8000,
      days_overdue: 15,
      customer_risk_tier: 'medium',
      customer_on_time_rate: 0.65,
    })
    // Base 50 + medium +10 + 1-30d 0 = 60
    expect(score).toBeGreaterThanOrEqual(40)
    expect(score).toBeLessThanOrEqual(80)
  })
})

// ── 3. Urgency: critical risk + overdue → 'critical' ─────────────────────────

describe('urgency classification', () => {
  it('critical risk + overdue → urgency = critical', () => {
    const { urgency } = ReceivablesPriorityService.scoreReceivable({
      outstanding_try: 5000,
      days_overdue: 5,
      customer_risk_tier: 'critical',
      customer_on_time_rate: null,
    })
    expect(urgency).toBe('critical')
  })

  it('low risk + not overdue → urgency = routine', () => {
    const { urgency } = ReceivablesPriorityService.scoreReceivable({
      outstanding_try: 5000,
      days_overdue: null,
      customer_risk_tier: 'low',
      customer_on_time_rate: 0.95,
    })
    expect(urgency).toBe('routine')
  })

  it('medium risk + 1-30d overdue → urgency = follow_up', () => {
    const { urgency } = ReceivablesPriorityService.scoreReceivable({
      outstanding_try: 5000,
      days_overdue: 20,
      customer_risk_tier: 'medium',
      customer_on_time_rate: 0.75,
    })
    expect(urgency).toBe('follow_up')
  })
})

// ── 6. Recommended action is in Turkish ───────────────────────────────────────

describe('recommended_action is Turkish', () => {
  it('contains Turkish text for routine urgency', () => {
    const { recommended_action } = ReceivablesPriorityService.scoreReceivable({
      outstanding_try: 2000,
      days_overdue: null,
      customer_risk_tier: 'low',
      customer_on_time_rate: 0.9,
    })
    // Should contain Turkish characters / words
    expect(recommended_action.length).toBeGreaterThan(5)
    // Check it contains Turkish common words
    expect(recommended_action).toMatch(/tahsilat|takip|aranmalı|Acil|hukuki|Müşteri|Rutin/i)
  })

  it('critical urgency produces urgent Turkish action', () => {
    const { recommended_action } = ReceivablesPriorityService.scoreReceivable({
      outstanding_try: 50000,
      days_overdue: 75,
      customer_risk_tier: 'critical',
      customer_on_time_rate: 0.2,
    })
    expect(recommended_action).toMatch(/[Hh]ukuki|[Aa]cil|kritik/i)
  })
})

// ── 7. priority_rank 1 = most urgent ─────────────────────────────────────────

describe('priority_rank', () => {
  it('priority_rank 1 = most urgent receivable', async () => {
    const supabase = makeSupabase({
      sales: [
        { id: 's1', customer_name: 'Critical Corp', total_try: 50000, paid_amount: 0,
          sale_date: '2024-01-01', due_date: '2024-01-10', payment_status: 'overdue' },
        { id: 's2', customer_name: 'Good Customer',  total_try: 10000, paid_amount: 0,
          sale_date: '2024-02-01', due_date: '2024-03-01', payment_status: 'pending' },
      ],
    })

    const report = await ReceivablesPriorityService.getReport(
      COMPANY,
      supabase as Parameters<typeof ReceivablesPriorityService.getReport>[1],
      { today: TODAY },
    )

    expect(report.receivables.length).toBeGreaterThan(0)
    expect(report.receivables[0].priority_rank).toBe(1)
  })
})

// ── 8. Critical urgency items appear before routine ───────────────────────────

describe('ordering', () => {
  it('critical urgency items appear before routine items in sorted list', async () => {
    const supabase = makeSupabase({
      sales: [
        // Routine: not overdue, low amount — appears second in list
        { id: 'sr', customer_name: 'Routine Co',  total_try: 1000,  paid_amount: 0,
          sale_date: '2024-02-10', due_date: '2024-03-01', payment_status: 'pending' },
        // This sale is overdue — should get higher urgency
        { id: 'sc', customer_name: 'Overdue Co',  total_try: 50000, paid_amount: 0,
          sale_date: '2024-01-01', due_date: '2024-01-10', payment_status: 'overdue' },
      ],
    })

    const report = await ReceivablesPriorityService.getReport(
      COMPANY,
      supabase as Parameters<typeof ReceivablesPriorityService.getReport>[1],
      { today: TODAY },
    )

    const receivableOrder = report.receivables.map(r => r.sale_id)
    // The overdue sale should appear before the routine one
    expect(receivableOrder.indexOf('sc')).toBeLessThan(receivableOrder.indexOf('sr'))
  })
})

// ── 9. priority_outstanding_try = sum of urgent + critical amounts ─────────────

describe('priority_outstanding_try', () => {
  it('equals sum of urgent and critical receivables', async () => {
    const supabase = makeSupabase({
      sales: [
        { id: 's1', customer_name: 'A', total_try: 50000, paid_amount: 0,
          sale_date: '2024-01-01', due_date: '2024-01-10', payment_status: 'overdue' },
        { id: 's2', customer_name: 'B', total_try: 5000,  paid_amount: 0,
          sale_date: '2024-02-10', due_date: '2024-03-01', payment_status: 'pending' },
      ],
    })

    const report = await ReceivablesPriorityService.getReport(
      COMPANY,
      supabase as Parameters<typeof ReceivablesPriorityService.getReport>[1],
      { today: TODAY },
    )

    const urgentAndCritical = report.receivables
      .filter(r => r.urgency === 'urgent' || r.urgency === 'critical')
      .reduce((s, r) => s + r.outstanding_try, 0)

    expect(report.priority_outstanding_try).toBeCloseTo(urgentAndCritical, 1)
  })
})

// ── 10. No outstanding receivables → empty report, no crash ──────────────────

describe('empty receivables', () => {
  it('returns empty report without crashing when no open receivables exist', async () => {
    const supabase = makeSupabase({ sales: [] })

    const report = await ReceivablesPriorityService.getReport(
      COMPANY,
      supabase as Parameters<typeof ReceivablesPriorityService.getReport>[1],
      { today: TODAY },
    )

    expect(report.receivables).toHaveLength(0)
    expect(report.total_outstanding_try).toBe(0)
    expect(report.priority_outstanding_try).toBe(0)
    expect(report.by_urgency.critical).toBe(0)
    expect(report.by_urgency.urgent).toBe(0)
    expect(report.by_urgency.follow_up).toBe(0)
    expect(report.by_urgency.routine).toBe(0)
  })
})
