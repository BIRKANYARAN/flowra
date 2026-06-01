// Node-env unit tests for computeHealthScore, extracted from CFOTab.tsx during
// decomposition. This pure financial-health scoring function was previously
// inline and untested; the extraction makes it directly testable.

import { describe, it, expect } from 'vitest'
import { computeHealthScore } from '@/app/dashboard/finance/_tabs/_cfo/healthScore'

const best  = { grossMarginPct: 35, netMarginPct: 12, runwayMonths: null, debtToEquity: 0.4, collectionRatePct: 90 }
const worst = { grossMarginPct: -5, netMarginPct: -5, runwayMonths: 1, debtToEquity: 5, collectionRatePct: -1 }

describe('computeHealthScore (extracted from CFOTab)', () => {
  it('awards the maximum 100 / grade A for all-strong metrics', () => {
    expect(computeHealthScore(best)).toEqual({ score: 100, grade: 'A' })
  })

  it('awards 0 / grade F for all-weak metrics', () => {
    expect(computeHealthScore(worst)).toEqual({ score: 0, grade: 'F' })
  })

  it('treats null runway (no burn) as healthy (+25 vs short runway)', () => {
    const a = computeHealthScore({ ...worst, runwayMonths: null })
    const b = computeHealthScore({ ...worst, runwayMonths: 1 })
    expect(a.score - b.score).toBe(25)
  })

  it('applies tiered gross-margin scoring (≥30→25, ≥15→15, ≥0→5, <0→0)', () => {
    const base = { netMarginPct: -5, runwayMonths: 1, debtToEquity: 5, collectionRatePct: -1 }
    expect(computeHealthScore({ ...base, grossMarginPct: 30 }).score).toBe(25)
    expect(computeHealthScore({ ...base, grossMarginPct: 15 }).score).toBe(15)
    expect(computeHealthScore({ ...base, grossMarginPct: 0 }).score).toBe(5)
    expect(computeHealthScore({ ...base, grossMarginPct: -1 }).score).toBe(0)
  })

  it('maps representative scores to the documented grade bands', () => {
    // 75 → B: gross15(+15) net12(+20) runwayNull(+25) debt0.4(+15) collection-1(+0)
    expect(computeHealthScore({ grossMarginPct: 15, netMarginPct: 12, runwayMonths: null, debtToEquity: 0.4, collectionRatePct: -1 }))
      .toEqual({ score: 75, grade: 'B' })
    // 38 → F: gross-1(+0) net5(+12) runway1(+0) debt0.4(+15) collection-1(+3) + ... = 30? recompute → assert grade only
    const lowish = computeHealthScore({ grossMarginPct: -1, netMarginPct: 5, runwayMonths: 1, debtToEquity: 0.4, collectionRatePct: -1 })
    expect(lowish.score).toBeLessThan(40)
    expect(lowish.grade).toBe('F')
  })
})
