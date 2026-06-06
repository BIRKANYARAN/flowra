// ── onboarding-service.test.ts ───────────────────────────────────────────────
// OnboardingService.getStatus — step completion, progress count, empty detection.

import { describe, it, expect } from 'vitest'
import { OnboardingService } from '../lib/services/onboarding.service'

// Minimal Supabase mock: per-table COUNT chains + a companies maybeSingle().
// counts: map of table -> row count; company: the companies row (or null).
function makeSupabase(opts: {
  counts: Record<string, number>
  company: Record<string, unknown> | null
}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return {
    from(table: string) {
      if (table === 'companies') {
        const chain: any = {
          select: () => chain,
          eq:     () => chain,
          maybeSingle: async () => ({ data: opts.company, error: null }),
        }
        return chain
      }
      // Count chain — thenable so `await chain` resolves { count, error }.
      const result = { count: opts.counts[table] ?? 0, error: null }
      const chain: any = {
        select: () => chain,
        eq:     () => chain,
        is:     () => chain,
        then: (resolve: (v: unknown) => unknown) => resolve(result),
      }
      return chain
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any
}

const FULL_COMPANY = { name: 'Acme A.Ş.', tax_number: '1234567890', address: 'İstanbul', phone: '0212' }

describe('OnboardingService.getStatus', () => {
  it('marks a brand-new company as empty with zero steps done', async () => {
    const supabase = makeSupabase({ counts: {}, company: null })
    const status = await OnboardingService.getStatus('c1', supabase)

    expect(status.is_empty).toBe(true)
    expect(status.completed_count).toBe(0)
    expect(status.total_count).toBe(6)
    expect(status.all_done).toBe(false)
  })

  it('company profile step needs name + tax number + contact', async () => {
    const partial = makeSupabase({ counts: {}, company: { name: 'Acme', tax_number: '', address: '' } })
    const s1 = await OnboardingService.getStatus('c1', partial)
    expect(s1.steps.find(s => s.key === 'company_profile')!.done).toBe(false)

    const full = makeSupabase({ counts: {}, company: FULL_COMPANY })
    const s2 = await OnboardingService.getStatus('c1', full)
    expect(s2.steps.find(s => s.key === 'company_profile')!.done).toBe(true)
  })

  it('partners step requires BOTH a partner and a capital commitment', async () => {
    const onlyPartner = makeSupabase({ counts: { partners: 2 }, company: null })
    const s1 = await OnboardingService.getStatus('c1', onlyPartner)
    expect(s1.steps.find(s => s.key === 'partners_capital')!.done).toBe(false)

    const both = makeSupabase({ counts: { partners: 2, partner_capital_commitments: 2 }, company: null })
    const s2 = await OnboardingService.getStatus('c1', both)
    expect(s2.steps.find(s => s.key === 'partners_capital')!.done).toBe(true)
  })

  it('is not empty once any operational data exists', async () => {
    const supabase = makeSupabase({ counts: { sales: 1 }, company: null })
    const status = await OnboardingService.getStatus('c1', supabase)
    expect(status.is_empty).toBe(false)
    expect(status.steps.find(s => s.key === 'first_sale')!.done).toBe(true)
  })

  it('reports all_done when every step is satisfied', async () => {
    const supabase = makeSupabase({
      counts: { partners: 1, partner_capital_commitments: 1, products: 1, customers: 1, sales: 1, expenses: 1 },
      company: FULL_COMPANY,
    })
    const status = await OnboardingService.getStatus('c1', supabase)
    expect(status.completed_count).toBe(6)
    expect(status.all_done).toBe(true)
  })

  it('every step has a working dashboard deep-link', async () => {
    const supabase = makeSupabase({ counts: {}, company: null })
    const status = await OnboardingService.getStatus('c1', supabase)
    for (const step of status.steps) {
      expect(step.href).toMatch(/^\/dashboard\//)
      expect(step.label.length).toBeGreaterThan(0)
    }
  })
})
