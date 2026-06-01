// Node-env test for computeCreditPortfolioSummaryWithOutstanding — folds each
// customer's outstanding receivable into the credit portfolio so risk is weighted
// by money at stake (concentration of receivables in low-grade customers). Untested.
import { describe, it, expect } from 'vitest'
import { computeCreditPortfolioSummaryWithOutstanding } from '@/lib/services/commercial/customer-credit-risk.service'

// Full CustomerCreditScore factory — only key/score/grade vary per test.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const score = (over: Record<string, unknown>): any => ({
  customer_key: 'c1', customer_name: 'C1', credit_score: 70, credit_grade: 'A',
  payment_history_score: 70, exposure_score: 70, relationship_score: 70, concentration_score: 70,
  recommended_credit_limit_try: 0, recommended_payment_terms: '30 gün net',
  risk_flags: [], is_improving: false, ...over,
})

describe('computeCreditPortfolioSummaryWithOutstanding', () => {
  const scores = [
    score({ customer_key: 'c1', credit_score: 80, credit_grade: 'A' }),  // healthy
    score({ customer_key: 'c2', credit_score: 40, credit_grade: 'B' }),  // high-risk grade
  ]
  const outstanding = new Map<string, number>([['c1', 100_000], ['c2', 300_000]])

  it('sums total outstanding and isolates the high-risk (BB/B/CCC/D) portion', () => {
    const out = computeCreditPortfolioSummaryWithOutstanding(scores, outstanding)
    expect(out.total_outstanding_try).toBe(400_000)
    expect(out.high_risk_outstanding_try).toBe(300_000) // only c2 (grade B)
  })

  it('weights the average credit score by outstanding amount', () => {
    const out = computeCreditPortfolioSummaryWithOutstanding(scores, outstanding)
    // (80×100k + 40×300k) / 400k = 20M / 400k = 50
    expect(out.weighted_avg_score).toBe(50)
  })

  it('falls back to the unweighted base score when there is no outstanding', () => {
    const out = computeCreditPortfolioSummaryWithOutstanding(scores, new Map())
    expect(out.total_outstanding_try).toBe(0)
    expect(out.high_risk_outstanding_try).toBe(0)
    // with zero outstanding the weighting is skipped → base (simple) average of 80 & 40 = 60
    expect(out.weighted_avg_score).toBe(60)
  })
})
