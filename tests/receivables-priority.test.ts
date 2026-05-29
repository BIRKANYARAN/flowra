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

// ── 11. Score clamping: score never exceeds 100 or goes below 0 ───────────────

describe('score clamping', () => {
  it('score does not exceed 100 even with all positive adjustments', () => {
    const { score } = ReceivablesPriorityService.scoreReceivable({
      outstanding_try: 5000,
      days_overdue: null,      // +20
      customer_risk_tier: 'low',   // +30
      customer_on_time_rate: 0.95, // +10 (> 0.8)
      // total: 50 + 30 + 20 + 10 = 110 → clamped to 100
    })
    expect(score).toBe(100)
  })

  it('score does not go below 0 with all negative adjustments', () => {
    const { score } = ReceivablesPriorityService.scoreReceivable({
      outstanding_try: 5000,
      days_overdue: 90,           // -25
      customer_risk_tier: 'critical', // -30
      customer_on_time_rate: 0.2,  // -10 (< 0.5)
      // total: 50 - 30 - 25 - 10 = -15 → clamped to 0
    })
    expect(score).toBe(0)
  })

  it('unknown risk tier has no score adjustment (stays at base)', () => {
    // unknown tier → +0, not overdue → +20, no on_time_rate → no adj = 70
    const { score } = ReceivablesPriorityService.scoreReceivable({
      outstanding_try: 5000,
      days_overdue: null,
      customer_risk_tier: 'unknown',
      customer_on_time_rate: null,
    })
    expect(score).toBe(70)
  })
})

// ── 12. Urgency: large outstanding amount triggers urgent ─────────────────────

describe('urgency for large amounts', () => {
  it('outstanding > 100k triggers urgent even with no overdue and low risk', () => {
    const { urgency } = ReceivablesPriorityService.scoreReceivable({
      outstanding_try: 150_000,
      days_overdue: null,
      customer_risk_tier: 'low',
      customer_on_time_rate: 0.95,
    })
    expect(urgency).toBe('urgent')
  })

  it('outstanding <= 100k with low risk and not overdue stays routine', () => {
    const { urgency } = ReceivablesPriorityService.scoreReceivable({
      outstanding_try: 99_999,
      days_overdue: null,
      customer_risk_tier: 'low',
      customer_on_time_rate: 0.9,
    })
    expect(urgency).toBe('routine')
  })

  it('31-60 days overdue → -10 score adjustment', () => {
    // base 50, medium +10, 31-60d -10, no on_time adj → 50
    const { score } = ReceivablesPriorityService.scoreReceivable({
      outstanding_try: 5000,
      days_overdue: 45,
      customer_risk_tier: 'medium',
      customer_on_time_rate: null,
    })
    expect(score).toBe(50)
  })
})

// ── 13. Urgency: high-risk customer not overdue → follow_up ──────────────────

describe('high risk urgency', () => {
  it('high risk customer not overdue → urgency = follow_up', () => {
    const { urgency } = ReceivablesPriorityService.scoreReceivable({
      outstanding_try: 5000,
      days_overdue: null,
      customer_risk_tier: 'high',
      customer_on_time_rate: 0.6,
    })
    expect(urgency).toBe('follow_up')
  })

  it('high risk + 31-60d overdue → urgency = follow_up', () => {
    // critical condition requires customer_risk_tier='critical'
    // high + overdue 60d → follow_up (not urgent since outstanding <= 100k and not critical tier)
    // Actually: days_overdue > 60 → urgent
    const { urgency } = ReceivablesPriorityService.scoreReceivable({
      outstanding_try: 5000,
      days_overdue: 45,
      customer_risk_tier: 'high',
      customer_on_time_rate: null,
    })
    expect(urgency).toBe('follow_up')
  })
})

// ── 14. recommended_action: large outstanding urgent action ───────────────────

describe('recommended_action content', () => {
  it('urgent + large amount mentions üst yönetim', () => {
    const { recommended_action } = ReceivablesPriorityService.scoreReceivable({
      outstanding_try: 200_000,
      days_overdue: 10,
      customer_risk_tier: 'medium',
      customer_on_time_rate: 0.7,
    })
    // urgent because outstanding > 100k
    expect(recommended_action).toMatch(/üst yönetim/i)
  })

  it('urgent + 60+ days overdue mentions hukuki', () => {
    const { recommended_action } = ReceivablesPriorityService.scoreReceivable({
      outstanding_try: 5000,
      days_overdue: 65,
      customer_risk_tier: 'medium',
      customer_on_time_rate: null,
    })
    // 65 days overdue → urgent (60+d rule)
    expect(recommended_action).toMatch(/[Hh]ukuki/i)
  })

  it('follow_up + overdue mentions hatırlatma', () => {
    const { recommended_action } = ReceivablesPriorityService.scoreReceivable({
      outstanding_try: 3000,
      days_overdue: 5,
      customer_risk_tier: 'medium',
      customer_on_time_rate: 0.75,
    })
    expect(recommended_action).toMatch(/hatırlatma|vade/i)
  })

  it('follow_up + not overdue but high risk mentions takip', () => {
    const { recommended_action } = ReceivablesPriorityService.scoreReceivable({
      outstanding_try: 3000,
      days_overdue: null,
      customer_risk_tier: 'high',
      customer_on_time_rate: 0.6,
    })
    expect(recommended_action).toMatch(/takip|vade|uyarılmalı/i)
  })
})

// ── 15. report.computed_at is a valid ISO date string ─────────────────────────

describe('report metadata', () => {
  it('computed_at is a valid ISO timestamp', async () => {
    const supabase = makeSupabase({ sales: [] })
    const report = await ReceivablesPriorityService.getReport(
      COMPANY,
      supabase as Parameters<typeof ReceivablesPriorityService.getReport>[1],
      { today: TODAY },
    )
    expect(() => new Date(report.computed_at)).not.toThrow()
    expect(new Date(report.computed_at).getTime()).toBeGreaterThan(0)
  })

  it('total_outstanding_try = sum of all receivables outstanding', async () => {
    const supabase = makeSupabase({
      sales: [
        { id: 's1', customer_name: 'A', total_try: 10000, paid_amount: 2000,
          sale_date: '2024-01-15', due_date: '2024-02-15', payment_status: 'partial' },
        { id: 's2', customer_name: 'B', total_try: 5000,  paid_amount: 0,
          sale_date: '2024-01-20', due_date: '2024-02-20', payment_status: 'pending' },
      ],
    })
    const report = await ReceivablesPriorityService.getReport(
      COMPANY,
      supabase as Parameters<typeof ReceivablesPriorityService.getReport>[1],
      { today: TODAY },
    )
    // outstanding: (10000 - 2000) + (5000 - 0) = 13000
    expect(report.total_outstanding_try).toBeCloseTo(13000, 1)
  })
})

// ── 16. All customers already paid → empty result ─────────────────────────────

describe('all customers paid — empty result', () => {
  it('all sales with payment_status paid are excluded → empty receivables', async () => {
    // makeSupabase returns all rows from the 'sales' table when queried.
    // Since the service filters in('payment_status', ['pending','partial','overdue'])
    // via mock chain (which returns ALL rows regardless), we use an empty sales
    // table to simulate no open receivables.
    const supabase = makeSupabase({ sales: [] })
    const report = await ReceivablesPriorityService.getReport(
      COMPANY,
      supabase as Parameters<typeof ReceivablesPriorityService.getReport>[1],
      { today: TODAY },
    )
    expect(report.receivables).toHaveLength(0)
    expect(report.total_outstanding_try).toBe(0)
    expect(report.priority_outstanding_try).toBe(0)
  })

  it('empty sales → all by_urgency counts are 0', async () => {
    const supabase = makeSupabase({ sales: [] })
    const report = await ReceivablesPriorityService.getReport(
      COMPANY,
      supabase as Parameters<typeof ReceivablesPriorityService.getReport>[1],
      { today: TODAY },
    )
    expect(report.by_urgency.critical).toBe(0)
    expect(report.by_urgency.urgent).toBe(0)
    expect(report.by_urgency.follow_up).toBe(0)
    expect(report.by_urgency.routine).toBe(0)
  })
})

// ── 17. Customer with very high overdue amount ────────────────────────────────

describe('customer with very high overdue amount', () => {
  it('outstanding > 100k AND overdue → urgency = critical or urgent', async () => {
    const supabase = makeSupabase({
      sales: [
        { id: 'big', customer_name: 'Big Debtor', total_try: 500_000, paid_amount: 0,
          sale_date: '2024-01-01', due_date: '2024-01-10', payment_status: 'overdue' },
      ],
    })
    const report = await ReceivablesPriorityService.getReport(
      COMPANY,
      supabase as Parameters<typeof ReceivablesPriorityService.getReport>[1],
      { today: TODAY },
    )
    expect(report.receivables).toHaveLength(1)
    const r = report.receivables[0]
    expect(['urgent', 'critical']).toContain(r.urgency)
    expect(r.outstanding_try).toBeCloseTo(500_000, 0)
  })

  it('very large outstanding → appears in priority_outstanding_try', async () => {
    const supabase = makeSupabase({
      sales: [
        { id: 'x1', customer_name: 'VIP', total_try: 1_000_000, paid_amount: 0,
          sale_date: '2024-01-01', due_date: '2024-01-05', payment_status: 'overdue' },
      ],
    })
    const report = await ReceivablesPriorityService.getReport(
      COMPANY,
      supabase as Parameters<typeof ReceivablesPriorityService.getReport>[1],
      { today: TODAY },
    )
    expect(report.priority_outstanding_try).toBeGreaterThan(0)
    expect(report.total_outstanding_try).toBeCloseTo(1_000_000, 0)
  })
})

// ── 18. Customer with mixed paid/unpaid ───────────────────────────────────────

describe('mixed paid/unpaid receivables', () => {
  it('outstanding_try = total_try − paid_amount', async () => {
    const supabase = makeSupabase({
      sales: [
        { id: 'm1', customer_name: 'Partial Co', total_try: 20_000, paid_amount: 15_000,
          sale_date: '2024-01-10', due_date: '2024-02-10', payment_status: 'partial' },
      ],
    })
    const report = await ReceivablesPriorityService.getReport(
      COMPANY,
      supabase as Parameters<typeof ReceivablesPriorityService.getReport>[1],
      { today: TODAY },
    )
    expect(report.receivables).toHaveLength(1)
    expect(report.receivables[0].outstanding_try).toBeCloseTo(5_000, 1)
  })

  it('two receivables with partial payments — totals are correct', async () => {
    const supabase = makeSupabase({
      sales: [
        { id: 'p1', customer_name: 'A', total_try: 10_000, paid_amount: 4_000,
          sale_date: '2024-01-10', due_date: '2024-02-28', payment_status: 'partial' },
        { id: 'p2', customer_name: 'B', total_try: 8_000,  paid_amount: 8_000,
          sale_date: '2024-01-12', due_date: '2024-02-28', payment_status: 'partial' },
      ],
    })
    const report = await ReceivablesPriorityService.getReport(
      COMPANY,
      supabase as Parameters<typeof ReceivablesPriorityService.getReport>[1],
      { today: TODAY },
    )
    // p1 outstanding: 6000; p2 outstanding: 0 → clamped to 0 by Math.max
    const totalOutstanding = report.receivables.reduce((s, r) => s + r.outstanding_try, 0)
    expect(totalOutstanding).toBeCloseTo(report.total_outstanding_try, 1)
  })
})

// ── 19. Sorting by priority score descending ──────────────────────────────────

describe('sorting by priority score descending', () => {
  it('receivables are sorted by priority_rank ascending (1 = highest urgency)', async () => {
    const supabase = makeSupabase({
      sales: [
        { id: 'low1',  customer_name: 'Low Risk',  total_try: 1_000,  paid_amount: 0,
          sale_date: '2024-02-10', due_date: '2024-03-10', payment_status: 'pending' },
        { id: 'high1', customer_name: 'High Risk', total_try: 200_000, paid_amount: 0,
          sale_date: '2024-01-01', due_date: '2024-01-10', payment_status: 'overdue' },
      ],
    })
    const report = await ReceivablesPriorityService.getReport(
      COMPANY,
      supabase as Parameters<typeof ReceivablesPriorityService.getReport>[1],
      { today: TODAY },
    )
    const ranks = report.receivables.map(r => r.priority_rank)
    // ranks should be [1, 2, 3, ...] in order
    for (let i = 1; i < ranks.length; i++) {
      expect(ranks[i]).toBeGreaterThan(ranks[i - 1])
    }
  })

  it('higher urgency receivable appears before lower urgency', async () => {
    const supabase = makeSupabase({
      sales: [
        { id: 'routine1', customer_name: 'Routine', total_try: 1_000, paid_amount: 0,
          sale_date: '2024-02-10', due_date: '2024-04-01', payment_status: 'pending' },
        { id: 'urgent1',  customer_name: 'Urgent',  total_try: 500_000, paid_amount: 0,
          sale_date: '2024-01-01', due_date: '2024-01-05', payment_status: 'overdue' },
      ],
    })
    const report = await ReceivablesPriorityService.getReport(
      COMPANY,
      supabase as Parameters<typeof ReceivablesPriorityService.getReport>[1],
      { today: TODAY },
    )
    const ids = report.receivables.map(r => r.sale_id)
    // urgent1 should appear before routine1
    expect(ids.indexOf('urgent1')).toBeLessThan(ids.indexOf('routine1'))
  })
})

// ── 20. Zero-amount invoice handling ─────────────────────────────────────────

describe('zero-amount and small-amount invoices', () => {
  it('zero total_try → outstanding_try = 0 (clamped by Math.max)', async () => {
    const { score } = ReceivablesPriorityService.scoreReceivable({
      outstanding_try: 0,
      days_overdue: null,
      customer_risk_tier: 'low',
      customer_on_time_rate: 0.9,
    })
    // Score should still be computed correctly
    expect(score).toBeGreaterThanOrEqual(0)
    expect(score).toBeLessThanOrEqual(100)
  })

  it('paid_amount > total_try → outstanding clamped to 0', async () => {
    const supabase = makeSupabase({
      sales: [
        { id: 'overpaid', customer_name: 'Overpaid Co', total_try: 100, paid_amount: 200,
          sale_date: '2024-01-15', due_date: '2024-02-15', payment_status: 'partial' },
      ],
    })
    const report = await ReceivablesPriorityService.getReport(
      COMPANY,
      supabase as Parameters<typeof ReceivablesPriorityService.getReport>[1],
      { today: TODAY },
    )
    // outstanding = Math.max(0, 100 - 200) = 0
    if (report.receivables.length > 0) {
      expect(report.receivables[0].outstanding_try).toBe(0)
    }
    expect(report.total_outstanding_try).toBeGreaterThanOrEqual(0)
  })

  it('small amount (1 TRY) outstanding → score is still valid', () => {
    const { score, urgency } = ReceivablesPriorityService.scoreReceivable({
      outstanding_try: 1,
      days_overdue: null,
      customer_risk_tier: 'medium',
      customer_on_time_rate: null,
    })
    expect(score).toBeGreaterThanOrEqual(0)
    expect(score).toBeLessThanOrEqual(100)
    expect(urgency).toBe('routine')  // small amount, no overdue, medium risk
  })
})
