// Node-env tests for the pure working-capital ratio functions in
// working-capital.service.ts (DIO/DSO/DPO on a 30-day month basis + CCC trend
// classification). Previously untested.
import { describe, it, expect } from 'vitest'
import { computeDIO, computeDSO, computeDPO, classifyCCCTrend } from '@/lib/services/finance/working-capital.service'

describe('working-capital ratios (30-day month basis)', () => {
  it('computeDIO = avgInventory / cogs × 30', () => {
    expect(computeDIO(1000, 6000)).toBe(5)   // (1000/6000)*30
    expect(computeDIO(0, 6000)).toBe(0)
  })
  it('computeDSO = avgReceivables / revenue × 30', () => {
    expect(computeDSO(2000, 6000)).toBe(10)  // (2000/6000)*30
  })
  it('computeDPO = avgPayables / cogs × 30', () => {
    expect(computeDPO(1500, 6000)).toBe(7.5)
  })
  it('returns null for DIO/DSO when the denominator is zero, but DPO returns 0', () => {
    expect(computeDIO(100, 0)).toBeNull()
    expect(computeDSO(100, 0)).toBeNull()
    expect(computeDPO(100, 0)).toBe(0)   // documented asymmetry: no COGS → DPO 0
  })
})

describe('classifyCCCTrend', () => {
  const series = (vals: Array<number | null>) => vals.map(v => ({ ccc_days: v }))
  it('returns "insufficient" with fewer than 6 valid months', () => {
    expect(classifyCCCTrend(series([10, 10, 10, 10, 10]))).toBe('insufficient')
    expect(classifyCCCTrend(series([10, null, 10, null, 10, null, 10]))).toBe('insufficient')
  })
  it('"improving" when recent CCC dropped >3 days vs the prior 3 months', () => {
    // months[0] = most recent; recent avg 20, prior avg 30 → diff −10
    expect(classifyCCCTrend(series([20, 20, 20, 30, 30, 30]))).toBe('improving')
  })
  it('"deteriorating" when recent CCC rose >3 days', () => {
    expect(classifyCCCTrend(series([30, 30, 30, 20, 20, 20]))).toBe('deteriorating')
  })
  it('"stable" when the swing is within ±3 days', () => {
    expect(classifyCCCTrend(series([21, 20, 19, 20, 20, 20]))).toBe('stable')
  })
})
