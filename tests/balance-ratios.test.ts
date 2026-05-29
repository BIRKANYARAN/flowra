/**
 * Balance Sheet Ratio Analysis — unit tests
 *
 * Tests all pure computation functions for the balance-ratios service:
 *   - Liquidity ratios (current, quick, cash) + health classifier
 *   - Solvency ratios (D/E, D/A, equity multiplier, interest coverage) + classifier
 *   - Efficiency ratios (asset turnover, receivables, payables, NPM, ROA, ROE)
 *   - Composite health score
 *
 * 44+ tests — no DB or network calls.
 */

import { describe, it, expect } from 'vitest'
import {
  computeCurrentRatio,
  computeQuickRatio,
  computeCashRatio,
  classifyLiquidityHealth,
  computeDebtToEquityRatio,
  computeDebtToAssetsRatio,
  computeEquityMultiplier,
  computeInterestCoverageRatio,
  classifySolvencyHealth,
  computeAssetTurnover,
  computeReceivablesTurnover,
  computePayablesTurnover,
  computeNetProfitMargin,
  computeReturnOnAssets,
  computeReturnOnEquity,
  computeBalanceSheetHealthScore,
} from '../lib/services/finance/balance-ratios.service'

// ── computeCurrentRatio ───────────────────────────────────────────────────────

describe('computeCurrentRatio', () => {

  it('1. normal inputs return correct ratio', () => {
    // 800 / 400 = 2.0
    expect(computeCurrentRatio(800, 400)).toBeCloseTo(2.0, 6)
  })

  it('2. zero current liabilities → null', () => {
    expect(computeCurrentRatio(800, 0)).toBeNull()
  })

  it('3. current assets = current liabilities → 1.0', () => {
    expect(computeCurrentRatio(500, 500)).toBeCloseTo(1.0, 6)
  })

  it('4. low ratio (underfunded) < 1', () => {
    expect(computeCurrentRatio(200, 500)).toBeCloseTo(0.4, 6)
  })

})

// ── computeQuickRatio ─────────────────────────────────────────────────────────

describe('computeQuickRatio', () => {

  it('5. normal case subtracts inventory correctly', () => {
    // (800 - 200) / 400 = 1.5
    expect(computeQuickRatio(800, 200, 400)).toBeCloseTo(1.5, 6)
  })

  it('6. zero current liabilities → null', () => {
    expect(computeQuickRatio(800, 200, 0)).toBeNull()
  })

  it('7. zero inventory → same as current ratio', () => {
    expect(computeQuickRatio(800, 0, 400)).toBeCloseTo(2.0, 6)
  })

  it('8. inventory equals current assets → quick ratio = 0', () => {
    expect(computeQuickRatio(500, 500, 400)).toBeCloseTo(0.0, 6)
  })

})

// ── computeCashRatio ──────────────────────────────────────────────────────────

describe('computeCashRatio', () => {

  it('9. normal case returns correct ratio', () => {
    // 200 / 400 = 0.5
    expect(computeCashRatio(200, 400)).toBeCloseTo(0.5, 6)
  })

  it('10. zero current liabilities → null', () => {
    expect(computeCashRatio(200, 0)).toBeNull()
  })

  it('11. zero cash → 0', () => {
    expect(computeCashRatio(0, 400)).toBe(0)
  })

})

// ── classifyLiquidityHealth ───────────────────────────────────────────────────

describe('classifyLiquidityHealth', () => {

  it('12. null → insufficient_data', () => {
    expect(classifyLiquidityHealth(null)).toBe('insufficient_data')
  })

  it('13. exactly 2.0 → strong (boundary)', () => {
    expect(classifyLiquidityHealth(2.0)).toBe('strong')
  })

  it('14. above 2.0 → strong', () => {
    expect(classifyLiquidityHealth(3.5)).toBe('strong')
  })

  it('15. exactly 1.5 → adequate (boundary)', () => {
    expect(classifyLiquidityHealth(1.5)).toBe('adequate')
  })

  it('16. between 1.5 and 2.0 → adequate', () => {
    expect(classifyLiquidityHealth(1.75)).toBe('adequate')
  })

  it('17. just below 2.0 → adequate', () => {
    expect(classifyLiquidityHealth(1.99)).toBe('adequate')
  })

  it('18. exactly 1.0 → tight (boundary)', () => {
    expect(classifyLiquidityHealth(1.0)).toBe('tight')
  })

  it('19. between 1.0 and 1.5 → tight', () => {
    expect(classifyLiquidityHealth(1.2)).toBe('tight')
  })

  it('20. below 1.0 → critical', () => {
    expect(classifyLiquidityHealth(0.8)).toBe('critical')
  })

  it('21. 0.0 → critical', () => {
    expect(classifyLiquidityHealth(0)).toBe('critical')
  })

})

// ── computeDebtToEquityRatio ──────────────────────────────────────────────────

describe('computeDebtToEquityRatio', () => {

  it('22. normal case', () => {
    // 500 / 1000 = 0.5
    expect(computeDebtToEquityRatio(500, 1000)).toBeCloseTo(0.5, 6)
  })

  it('23. zero equity → null', () => {
    expect(computeDebtToEquityRatio(500, 0)).toBeNull()
  })

  it('24. negative equity (distressed firm)', () => {
    // 500 / -200 = -2.5
    expect(computeDebtToEquityRatio(500, -200)).toBeCloseTo(-2.5, 6)
  })

  it('25. equal debt and equity → 1.0', () => {
    expect(computeDebtToEquityRatio(1000, 1000)).toBeCloseTo(1.0, 6)
  })

})

// ── computeDebtToAssetsRatio ──────────────────────────────────────────────────

describe('computeDebtToAssetsRatio', () => {

  it('26. normal case', () => {
    // 400 / 1000 = 0.4
    expect(computeDebtToAssetsRatio(400, 1000)).toBeCloseTo(0.4, 6)
  })

  it('27. zero total assets → null', () => {
    expect(computeDebtToAssetsRatio(400, 0)).toBeNull()
  })

  it('28. > 1 = insolvent (liabilities exceed assets)', () => {
    expect(computeDebtToAssetsRatio(1500, 1000)).toBeCloseTo(1.5, 6)
  })

})

// ── computeEquityMultiplier ───────────────────────────────────────────────────

describe('computeEquityMultiplier', () => {

  it('29. normal case', () => {
    // 1000 / 500 = 2.0
    expect(computeEquityMultiplier(1000, 500)).toBeCloseTo(2.0, 6)
  })

  it('30. zero equity → null', () => {
    expect(computeEquityMultiplier(1000, 0)).toBeNull()
  })

})

// ── computeInterestCoverageRatio ──────────────────────────────────────────────

describe('computeInterestCoverageRatio', () => {

  it('31. comfortable coverage (> 3)', () => {
    // 300 / 80 = 3.75
    expect(computeInterestCoverageRatio(300, 80)).toBeCloseTo(3.75, 6)
  })

  it('32. distressed (< 1)', () => {
    // 50 / 100 = 0.5
    expect(computeInterestCoverageRatio(50, 100)).toBeCloseTo(0.5, 6)
  })

  it('33. zero interest expense → null', () => {
    expect(computeInterestCoverageRatio(300, 0)).toBeNull()
  })

  it('34. negative EBIT (loss) → negative coverage', () => {
    // -100 / 50 = -2.0
    expect(computeInterestCoverageRatio(-100, 50)).toBeCloseTo(-2.0, 6)
  })

})

// ── classifySolvencyHealth ────────────────────────────────────────────────────

describe('classifySolvencyHealth', () => {

  it('35. both null → insufficient_data', () => {
    expect(classifySolvencyHealth(null, null)).toBe('insufficient_data')
  })

  it('36. debtToEquity only (no interest coverage) > 3 → distressed', () => {
    expect(classifySolvencyHealth(4.0, null)).toBe('distressed')
  })

  it('37. interestCoverage < 1 → distressed', () => {
    expect(classifySolvencyHealth(null, 0.5)).toBe('distressed')
  })

  it('38. debtToEquity > 1.5 (not > 3) → leveraged', () => {
    expect(classifySolvencyHealth(2.0, null)).toBe('leveraged')
  })

  it('39. interestCoverage between 1 and 2 → leveraged', () => {
    expect(classifySolvencyHealth(null, 1.5)).toBe('leveraged')
  })

  it('40. debtToEquity > 0.5 (not > 1.5) → adequate', () => {
    expect(classifySolvencyHealth(0.8, null)).toBe('adequate')
  })

  it('41. interestCoverage between 2 and 4 → adequate', () => {
    expect(classifySolvencyHealth(null, 3.0)).toBe('adequate')
  })

  it('42. low D/E and high coverage → strong', () => {
    // D/E = 0.3 (not > 0.5), coverage = 5.0 (not < 4) → strong
    expect(classifySolvencyHealth(0.3, 5.0)).toBe('strong')
  })

  it('43. null D/E + high coverage → not insufficient_data', () => {
    // one null is ok — coverage 5.0 → adequate (not < 4 triggers adequate, but 5 >= 4 → strong)
    expect(classifySolvencyHealth(null, 5.0)).toBe('strong')
  })

  it('44. boundary D/E = 3 → leveraged (not > 3)', () => {
    expect(classifySolvencyHealth(3.0, null)).toBe('leveraged')
  })

})

// ── computeAssetTurnover ──────────────────────────────────────────────────────

describe('computeAssetTurnover', () => {

  it('45. normal case', () => {
    // 2000 / 1000 = 2.0
    expect(computeAssetTurnover(2000, 1000)).toBeCloseTo(2.0, 6)
  })

  it('46. zero assets → null', () => {
    expect(computeAssetTurnover(2000, 0)).toBeNull()
  })

})

// ── computeReceivablesTurnover ────────────────────────────────────────────────

describe('computeReceivablesTurnover', () => {

  it('47. normal case', () => {
    // 1200 / 300 = 4.0
    expect(computeReceivablesTurnover(1200, 300)).toBeCloseTo(4.0, 6)
  })

  it('48. zero receivables → null', () => {
    expect(computeReceivablesTurnover(1200, 0)).toBeNull()
  })

})

// ── computePayablesTurnover ───────────────────────────────────────────────────

describe('computePayablesTurnover', () => {

  it('49. normal case', () => {
    // 600 / 200 = 3.0
    expect(computePayablesTurnover(600, 200)).toBeCloseTo(3.0, 6)
  })

  it('50. zero payables → null', () => {
    expect(computePayablesTurnover(600, 0)).toBeNull()
  })

})

// ── computeNetProfitMargin ────────────────────────────────────────────────────

describe('computeNetProfitMargin', () => {

  it('51. normal case — 10% margin', () => {
    // 100 / 1000 × 100 = 10
    expect(computeNetProfitMargin(100, 1000)).toBeCloseTo(10, 6)
  })

  it('52. zero revenue → null', () => {
    expect(computeNetProfitMargin(100, 0)).toBeNull()
  })

  it('53. negative net profit → negative margin', () => {
    // -50 / 500 × 100 = -10
    expect(computeNetProfitMargin(-50, 500)).toBeCloseTo(-10, 6)
  })

})

// ── computeReturnOnAssets ─────────────────────────────────────────────────────

describe('computeReturnOnAssets', () => {

  it('54. normal case — 5% ROA', () => {
    // 50 / 1000 × 100 = 5
    expect(computeReturnOnAssets(50, 1000)).toBeCloseTo(5.0, 6)
  })

  it('55. zero assets → null', () => {
    expect(computeReturnOnAssets(50, 0)).toBeNull()
  })

})

// ── computeReturnOnEquity ─────────────────────────────────────────────────────

describe('computeReturnOnEquity', () => {

  it('56. normal case — 12.5% ROE', () => {
    // 100 / 800 × 100 = 12.5
    expect(computeReturnOnEquity(100, 800)).toBeCloseTo(12.5, 6)
  })

  it('57. zero equity → null', () => {
    expect(computeReturnOnEquity(100, 0)).toBeNull()
  })

})

// ── computeBalanceSheetHealthScore ────────────────────────────────────────────

describe('computeBalanceSheetHealthScore', () => {

  it('58. all nulls → 50 (neutral defaults)', () => {
    // liquidity: 50×0.35=17.5; leverage: 50×0.30=15; eff: 50×0.20=10; profit: 50×0.15=7.5 → 50
    expect(computeBalanceSheetHealthScore(null, null, null, null)).toBe(50)
  })

  it('59. known inputs verify weighted calculation', () => {
    // currentRatio=2.0: raw=min(100, 2/2×100)=100; component=100×0.35=35
    // debtToEquity=1.0: raw=max(0,100-1×20)=80; component=80×0.30=24
    // assetTurnover=1.0: raw=min(100,1×50)=50; component=50×0.20=10
    // margin=10: raw=clamp(10+50,0,100)=60; component=60×0.15=9
    // total = 35+24+10+9 = 78.0
    expect(computeBalanceSheetHealthScore(2.0, 1.0, 1.0, 10)).toBeCloseTo(78.0, 1)
  })

  it('60. high current ratio saturates at 100 × 0.35 = 35 for liquidity', () => {
    // currentRatio=4.0 → min(100, 4/2×100)=100 → 35 component
    // rest null → 50×0.30+50×0.20+50×0.15 = 15+10+7.5=32.5; total=67.5
    expect(computeBalanceSheetHealthScore(4.0, null, null, null)).toBeCloseTo(67.5, 1)
  })

  it('61. debtToEquity=5 → leverage raw clamped to 0', () => {
    // max(0, 100 - 5×20) = max(0, 0) = 0 → 0×0.30=0
    // rest null → 17.5+10+7.5=35; total=35
    expect(computeBalanceSheetHealthScore(null, 5, null, null)).toBeCloseTo(35, 1)
  })

  it('62. negative net profit margin reduces profitability below 50', () => {
    // margin=-60: clamp(-60+50,0,100)=clamp(-10,0,100)=0; component=0×0.15=0
    // rest null → 17.5+15+10=42.5; total=42.5
    expect(computeBalanceSheetHealthScore(null, null, null, -60)).toBeCloseTo(42.5, 1)
  })

  it('63. result is rounded to 1 decimal place', () => {
    const result = computeBalanceSheetHealthScore(1.5, 0.8, 0.7, 5)
    const str = result.toString()
    const decimalPlaces = str.includes('.') ? str.split('.')[1].length : 0
    expect(decimalPlaces).toBeLessThanOrEqual(1)
  })

  it('64. high margin (50%) saturates profitability component', () => {
    // margin=50: clamp(50+50,0,100)=100; component=100×0.15=15
    // rest null → 17.5+15+10=42.5; total=57.5
    expect(computeBalanceSheetHealthScore(null, null, null, 50)).toBeCloseTo(57.5, 1)
  })

  it('65. asset turnover > 2 saturates efficiency at 100', () => {
    // assetTurnover=3: min(100, 3×50)=100; component=100×0.20=20
    // rest null → 17.5+15+7.5=40; total=60
    expect(computeBalanceSheetHealthScore(null, null, 3.0, null)).toBeCloseTo(60, 1)
  })

})
