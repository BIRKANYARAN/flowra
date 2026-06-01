// ── api-schema-resilience.test.ts ─────────────────────────────────────────────
// VERIFICATION INFRASTRUCTURE — route-handler + service tests for the schema-drift
// resilience added in the production-hardening batch. These are the kind of tests
// that were MISSING when two routes returned 500 in production:
//   • /api/partners/compensation        (missing partner_compensation_payments table)
//   • /api/commercial/supplier-analytics (missing expenses.supplier_name column)
//
// They assert the contract: a SCHEMA GAP degrades gracefully (empty/partial, 200),
// a GENUINE error still surfaces (throw / 500) — never silently swallowed.

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mock auth so the route handler runs without a real Supabase session ───────
vi.mock('@/lib/api-auth', () => ({
  resolveApiAuth: vi.fn(async () => ({
    ok: true, uid: 'u1', companyId: 'c1', supabase: {}, ctx: { requestId: 'test-req' },
  })),
}))

// ── Mock the compensation service (we drive its behavior per-test) ────────────
vi.mock('@/lib/services/pcle/compensation.service', () => ({
  CompensationService: { listSchedules: vi.fn(), getDuePayments: vi.fn() },
}))

import { GET as compensationGET } from '@/app/api/partners/compensation/route'
import { CompensationService } from '@/lib/services/pcle/compensation.service'
import { SupplierAnalyticsService } from '@/lib/services/commercial/supplier-analytics.service'

const compReq = () =>
  new Request('http://localhost/api/partners/compensation?months=3') as unknown as Parameters<typeof compensationGET>[0]

// ─────────────────────────────────────────────────────────────────────────────
describe('GET /api/partners/compensation — schema-gap resilience', () => {
  beforeEach(() => vi.clearAllMocks())

  it('200 with schedules + payments on success (degraded=false)', async () => {
    ;(CompensationService.listSchedules as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: 's1' }])
    ;(CompensationService.getDuePayments as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: 'p1' }])
    const res = await compensationGET(compReq())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.schedules).toHaveLength(1)
    expect(body.due_payments).toHaveLength(1)
    expect(body.degraded).toBe(false)
  })

  it('200 + degraded when partner_compensation_payments is missing (the original 500 bug)', async () => {
    ;(CompensationService.listSchedules as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: 's1' }])
    ;(CompensationService.getDuePayments as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('getDuePayments/payments: relation "partner_compensation_payments" does not exist'))
    const res = await compensationGET(compReq())
    expect(res.status).toBe(200)                  // NOT 500
    const body = await res.json()
    expect(body.degraded).toBe(true)
    expect(body.due_payments).toEqual([])
    expect(body.schedules).toHaveLength(1)         // working part preserved
  })

  it('500 on a genuine (non-schema) error — not silently swallowed', async () => {
    ;(CompensationService.listSchedules as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('permission denied for table partner_compensation_schedules'))
    ;(CompensationService.getDuePayments as ReturnType<typeof vi.fn>).mockResolvedValue([])
    const res = await compensationGET(compReq())
    expect(res.status).toBe(500)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Chainable Supabase query-builder mock whose awaited value is `result`.
function mockSupabaseReturning(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {}
  for (const m of ['from', 'select', 'eq', 'is', 'gte', 'lte', 'order', 'in']) {
    chain[m] = vi.fn(() => chain)
  }
  // make the chain awaitable → resolves to { data, error }
  ;(chain as { then: unknown }).then = (resolve: (v: unknown) => unknown) => resolve(result)
  return chain
}

describe('SupplierAnalyticsService.getReport — schema-gap resilience', () => {
  it('returns an empty report (not throw) when expenses.supplier_name is missing', async () => {
    const supa = mockSupabaseReturning({
      data: null,
      error: { code: '42703', message: 'column "supplier_name" does not exist' },
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const report = await SupplierAnalyticsService.getReport('c1', supa as any)
    expect(report).toBeDefined()
    expect(report.suppliers).toEqual([])
    expect(report.total_payables_try).toBe(0)
  })

  it('throws on a genuine (non-schema) query error', async () => {
    const supa = mockSupabaseReturning({
      data: null,
      error: { code: '42501', message: 'permission denied for table expenses' },
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(SupplierAnalyticsService.getReport('c1', supa as any)).rejects.toThrow()
  })

  it('builds a real report from rows when the schema is intact', async () => {
    const supa = mockSupabaseReturning({
      data: [
        { supplier_name: 'Acme', amount_try: 1000, expense_type: 'general', expense_date: '2026-01-10', payment_status: 'paid', paid_at: '2026-01-20', updated_at: '2026-01-20' },
      ],
      error: null,
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const report = await SupplierAnalyticsService.getReport('c1', supa as any)
    expect(report.suppliers.length).toBeGreaterThan(0)
    expect(report.suppliers[0].supplier_name).toBe('Acme')
  })
})
