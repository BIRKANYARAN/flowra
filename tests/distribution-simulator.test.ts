/**
 * distribution-simulator.test.ts — Partner Distribution Simulator unit tests
 *
 * Tests cover:
 *   - computeLegalReserveRequired
 *   - computeMaxDistributable
 *   - checkTtk509
 *   - checkTtk519
 *   - computeWithholdingTax
 *   - computeNetDistribution
 *   - distributeToPartners
 *   - simulateDistribution
 *   - generateStandardScenarios
 *   - findOptimalDistribution
 *   - computeDistributionYield
 *   - Integration: ₺1M profit, ₺500K capital, ₺50K reserves, 2 partners (60/40)
 *
 * Run: npx vitest run tests/distribution-simulator.test.ts
 */

import { describe, it, expect } from 'vitest'
import {
  computeLegalReserveRequired,
  computeMaxDistributable,
  checkTtk509,
  checkTtk519,
  computeWithholdingTax,
  computeNetDistribution,
  distributeToPartners,
  simulateDistribution,
  generateStandardScenarios,
  findOptimalDistribution,
  computeDistributionYield,
  type DistributionInput,
} from '../lib/services/pcle/distribution-simulator.service'

// ── computeLegalReserveRequired ───────────────────────────────────────────────

describe('computeLegalReserveRequired', () => {
  it('allocates 5% of net profit when reserve is empty', () => {
    // 5% of 1_000_000 = 50_000; cap = 500_000 * 0.20 = 100_000; gap = 100_000 - 0 = 100_000
    // min(50_000, 100_000) = 50_000
    expect(computeLegalReserveRequired(1_000_000, 500_000, 0)).toBe(50_000)
  })

  it('is capped by the remaining gap to 20% of paid capital', () => {
    // gap = 500_000 * 0.20 - 90_000 = 100_000 - 90_000 = 10_000
    // proposed = 1_000_000 * 0.05 = 50_000
    // result = min(50_000, 10_000) = 10_000
    expect(computeLegalReserveRequired(1_000_000, 500_000, 90_000)).toBe(10_000)
  })

  it('returns 0 when reserve is already at cap (20% of capital)', () => {
    // gap = 500_000 * 0.20 - 100_000 = 0
    expect(computeLegalReserveRequired(1_000_000, 500_000, 100_000)).toBe(0)
  })

  it('returns 0 when reserve exceeds cap', () => {
    expect(computeLegalReserveRequired(1_000_000, 500_000, 200_000)).toBe(0)
  })

  it('returns 0 when net profit is zero', () => {
    expect(computeLegalReserveRequired(0, 500_000, 0)).toBe(0)
  })

  it('returns 0 when net profit is negative', () => {
    expect(computeLegalReserveRequired(-100_000, 500_000, 0)).toBe(0)
  })

  it('handles small profit correctly', () => {
    // 5% of 10_000 = 500; cap = 200_000; gap = 200_000 - 0 = 200_000; result = 500
    expect(computeLegalReserveRequired(10_000, 1_000_000, 0)).toBe(500)
  })

  it('handles exact cap boundary', () => {
    // paid_capital = 1_000; 20% = 200; existing = 200 => gap = 0 => 0
    expect(computeLegalReserveRequired(500, 1_000, 200)).toBe(0)
  })

  it('handles zero paid capital (edge case)', () => {
    // cap = 0; gap = max(0, 0 - 0) = 0 => 0
    expect(computeLegalReserveRequired(100_000, 0, 0)).toBe(0)
  })
})

// ── computeMaxDistributable ───────────────────────────────────────────────────

describe('computeMaxDistributable', () => {
  it('returns net profit minus legal reserve when no retained earnings', () => {
    // 1_000_000 + 0 - 50_000 = 950_000
    expect(computeMaxDistributable(1_000_000, 0, 50_000)).toBe(950_000)
  })

  it('includes retained earnings in max distributable', () => {
    // 1_000_000 + 100_000 - 50_000 = 1_050_000
    expect(computeMaxDistributable(1_000_000, 100_000, 50_000)).toBe(1_050_000)
  })

  it('clamps at 0 for loss scenario', () => {
    // -500_000 + 0 - 0 = -500_000 => clamped to 0
    expect(computeMaxDistributable(-500_000, 0, 0)).toBe(0)
  })

  it('clamps at 0 when legal reserve exceeds combined profit and retained', () => {
    // 100_000 + 0 - 200_000 = -100_000 => 0
    expect(computeMaxDistributable(100_000, 0, 200_000)).toBe(0)
  })

  it('works with zero legal reserve', () => {
    // 800_000 + 200_000 - 0 = 1_000_000
    expect(computeMaxDistributable(800_000, 200_000, 0)).toBe(1_000_000)
  })

  it('handles zero profit with positive retained earnings', () => {
    // 0 + 50_000 - 0 = 50_000
    expect(computeMaxDistributable(0, 50_000, 0)).toBe(50_000)
  })
})

// ── checkTtk509 ───────────────────────────────────────────────────────────────

describe('checkTtk509', () => {
  it('passes when requested equals max distributable', () => {
    expect(checkTtk509(950_000, 950_000)).toBe(true)
  })

  it('passes when requested is less than max distributable', () => {
    expect(checkTtk509(500_000, 950_000)).toBe(true)
  })

  it('fails when requested exceeds max distributable', () => {
    expect(checkTtk509(1_000_000, 950_000)).toBe(false)
  })

  it('passes when requested is zero', () => {
    expect(checkTtk509(0, 0)).toBe(true)
  })

  it('fails when max is zero but requested is positive', () => {
    expect(checkTtk509(1, 0)).toBe(false)
  })
})

// ── checkTtk519 ───────────────────────────────────────────────────────────────

describe('checkTtk519', () => {
  it('passes when enough profit remains after reserve and distribution', () => {
    // 1_000_000 - 50_000 - 600_000 = 350_000 >= 0
    expect(checkTtk519(1_000_000, 50_000, 600_000)).toBe(true)
  })

  it('passes when remaining is exactly zero', () => {
    // 1_000_000 - 50_000 - 950_000 = 0
    expect(checkTtk519(1_000_000, 50_000, 950_000)).toBe(true)
  })

  it('fails when distribution exceeds profit minus reserve', () => {
    // 1_000_000 - 50_000 - 1_000_000 = -50_000 < 0
    expect(checkTtk519(1_000_000, 50_000, 1_000_000)).toBe(false)
  })

  it('passes with zero legal reserve', () => {
    // 500_000 - 0 - 500_000 = 0
    expect(checkTtk519(500_000, 0, 500_000)).toBe(true)
  })

  it('fails with loss (negative net profit)', () => {
    // -100_000 - 0 - 100 = -100_100 < 0
    expect(checkTtk519(-100_000, 0, 100)).toBe(false)
  })
})

// ── computeWithholdingTax ─────────────────────────────────────────────────────

describe('computeWithholdingTax', () => {
  it('applies default 10% withholding', () => {
    expect(computeWithholdingTax(100_000)).toBe(10_000)
  })

  it('applies custom withholding rate', () => {
    expect(computeWithholdingTax(100_000, 15)).toBe(15_000)
  })

  it('returns 0 for zero gross', () => {
    expect(computeWithholdingTax(0)).toBe(0)
  })

  it('returns 0 for negative gross', () => {
    expect(computeWithholdingTax(-100_000)).toBe(0)
  })

  it('rounds to 2 decimal places', () => {
    // 33_333 * 0.10 = 3_333.3
    expect(computeWithholdingTax(33_333)).toBe(3_333.3)
  })

  it('applies 0% rate (no withholding)', () => {
    expect(computeWithholdingTax(500_000, 0)).toBe(0)
  })
})

// ── computeNetDistribution ────────────────────────────────────────────────────

describe('computeNetDistribution', () => {
  it('returns gross minus 10% withholding by default', () => {
    expect(computeNetDistribution(100_000)).toBe(90_000)
  })

  it('applies custom withholding rate', () => {
    expect(computeNetDistribution(100_000, 15)).toBe(85_000)
  })

  it('returns 0 for zero gross', () => {
    expect(computeNetDistribution(0)).toBe(0)
  })

  it('returns 0 for negative gross', () => {
    expect(computeNetDistribution(-50_000)).toBe(0)
  })

  it('rounds to 2 decimal places', () => {
    // 975_000 * 0.90 = 877_500
    expect(computeNetDistribution(975_000)).toBe(877_500)
  })
})

// ── distributeToPartners ──────────────────────────────────────────────────────

describe('distributeToPartners', () => {
  const partners = [
    { partner_id: 'A', share_pct: 60 },
    { partner_id: 'B', share_pct: 40 },
  ]

  it('correctly splits gross amount by share percentage', () => {
    const result = distributeToPartners(100_000, partners)
    expect(result[0].gross_try).toBe(60_000)
    expect(result[1].gross_try).toBe(40_000)
  })

  it('applies default 10% withholding per partner', () => {
    const result = distributeToPartners(100_000, partners)
    expect(result[0].withholding_try).toBe(6_000)
    expect(result[1].withholding_try).toBe(4_000)
  })

  it('computes net correctly per partner', () => {
    const result = distributeToPartners(100_000, partners)
    expect(result[0].net_try).toBe(54_000)
    expect(result[1].net_try).toBe(36_000)
  })

  it('preserves partner_id and share_pct', () => {
    const result = distributeToPartners(100_000, partners)
    expect(result[0].partner_id).toBe('A')
    expect(result[0].share_pct).toBe(60)
  })

  it('returns zero amounts when gross is zero', () => {
    const result = distributeToPartners(0, partners)
    expect(result[0].gross_try).toBe(0)
    expect(result[0].net_try).toBe(0)
    expect(result[1].gross_try).toBe(0)
  })

  it('returns zero amounts when gross is negative', () => {
    const result = distributeToPartners(-100, partners)
    expect(result[0].gross_try).toBe(0)
  })

  it('applies custom withholding rate', () => {
    const result = distributeToPartners(100_000, partners, 15)
    expect(result[0].withholding_try).toBe(9_000) // 60_000 * 0.15
    expect(result[0].net_try).toBe(51_000)
  })

  it('handles single partner with 100%', () => {
    const result = distributeToPartners(200_000, [{ partner_id: 'X', share_pct: 100 }])
    expect(result[0].gross_try).toBe(200_000)
    expect(result[0].withholding_try).toBe(20_000)
    expect(result[0].net_try).toBe(180_000)
  })

  it('handles empty partner list', () => {
    expect(distributeToPartners(100_000, [])).toEqual([])
  })
})

// ── simulateDistribution ──────────────────────────────────────────────────────

describe('simulateDistribution', () => {
  const baseInput: DistributionInput = {
    net_profit_try: 1_000_000,
    paid_in_capital_try: 500_000,
    existing_legal_reserves_try: 50_000,
    existing_retained_earnings_try: 0,
    requested_distribution_try: 900_000,
    compensation_ytd_try: 0,
    outstanding_loans_try: 0,
  }

  const partners = [
    { partner_id: 'A', share_pct: 60 },
    { partner_id: 'B', share_pct: 40 },
  ]

  it('returns a scenario with correct name and description', () => {
    const s = simulateDistribution(baseInput, 500_000, 'Test', 'Test desc', partners)
    expect(s.name).toBe('Test')
    expect(s.description).toBe('Test desc')
  })

  it('computes legal reserve required', () => {
    const s = simulateDistribution(baseInput, 500_000, 'T', 'D', partners)
    // gap = 500_000*0.20 - 50_000 = 50_000; proposed = 1_000_000*0.05 = 50_000; min = 50_000
    expect(s.legal_reserve_required_try).toBe(50_000)
  })

  it('is compliant when amount is within max distributable', () => {
    // maxDistributable = 1_000_000 + 0 - 50_000 = 950_000; 500_000 <= 950_000
    const s = simulateDistribution(baseInput, 500_000, 'T', 'D', partners)
    expect(s.is_legally_compliant).toBe(true)
    expect(s.blocking_reason).toBeNull()
  })

  it('is non-compliant when amount exceeds max distributable (TTK 509)', () => {
    const s = simulateDistribution(baseInput, 1_000_000, 'T', 'D', partners)
    expect(s.is_legally_compliant).toBe(false)
    expect(s.blocking_reason).not.toBeNull()
    expect(s.ttk_509_check).toBe(false)
  })

  it('computes gross, withholding, and net distribution correctly', () => {
    const s = simulateDistribution(baseInput, 975_000, 'T', 'D', partners)
    expect(s.gross_distribution_try).toBe(975_000)
    expect(s.withholding_tax_try).toBe(97_500)
    expect(s.net_distribution_try).toBe(877_500)
  })

  it('populates per_partner_distributions', () => {
    const s = simulateDistribution(baseInput, 975_000, 'T', 'D', partners)
    expect(s.per_partner_distributions).toHaveLength(2)
    expect(s.per_partner_distributions[0].partner_id).toBe('A')
  })

  it('computes retained_earnings_after', () => {
    // net_profit + retained - legal_reserve - gross = 1_000_000 + 0 - 50_000 - 500_000 = 450_000
    const s = simulateDistribution(baseInput, 500_000, 'T', 'D', partners)
    expect(s.retained_earnings_after).toBe(450_000)
  })

  it('clamps negative requested amount to zero', () => {
    const s = simulateDistribution(baseInput, -100, 'T', 'D', partners)
    expect(s.gross_distribution_try).toBe(0)
    expect(s.is_legally_compliant).toBe(true)
  })

  it('sets ttk_519_check correctly', () => {
    const s = simulateDistribution(baseInput, 975_000, 'T', 'D', partners)
    // 1_000_000 - 50_000 - 975_000 = -25_000 < 0 ... wait, 975_000 = max => remaining = 0
    // Actually: 1_000_000 - 50_000 - 975_000 = -25_000 => false? No: max = 950_000, not 975_000
    // maxDistributable = 1_000_000 - 50_000 = 950_000
    // ttk519: 1_000_000 - 50_000 - 975_000 = -25_000 => false
    expect(s.ttk_519_check).toBe(false)
    expect(s.is_legally_compliant).toBe(false)
  })

  it('passes ttk_519 for amount within net_profit minus reserve', () => {
    // ttk519: 1_000_000 - 50_000 - 900_000 = 50_000 >= 0 => true
    const s = simulateDistribution(baseInput, 900_000, 'T', 'D', partners)
    expect(s.ttk_519_check).toBe(true)
  })
})

// ── generateStandardScenarios ─────────────────────────────────────────────────

describe('generateStandardScenarios', () => {
  const input: DistributionInput = {
    net_profit_try: 1_000_000,
    paid_in_capital_try: 500_000,
    existing_legal_reserves_try: 50_000,
    existing_retained_earnings_try: 0,
    requested_distribution_try: 600_000,
    compensation_ytd_try: 0,
    outstanding_loans_try: 0,
  }

  const partners = [
    { partner_id: 'A', share_pct: 60 },
    { partner_id: 'B', share_pct: 40 },
  ]

  it('returns exactly 4 scenarios', () => {
    const scenarios = generateStandardScenarios(input, partners)
    expect(scenarios).toHaveLength(4)
  })

  it('first scenario is "Tam Dağıtım" (full distribution)', () => {
    const scenarios = generateStandardScenarios(input, partners)
    expect(scenarios[0].name).toBe('Tam Dağıtım')
  })

  it('second scenario is "Muhafazakar (%50)"', () => {
    const scenarios = generateStandardScenarios(input, partners)
    expect(scenarios[1].name).toBe('Muhafazakar (%50)')
  })

  it('third scenario is "Talep Edilen"', () => {
    const scenarios = generateStandardScenarios(input, partners)
    expect(scenarios[2].name).toBe('Talep Edilen')
  })

  it('fourth scenario is "Borç Önce"', () => {
    const scenarios = generateStandardScenarios(input, partners)
    expect(scenarios[3].name).toBe('Borç Önce')
  })

  it('full distribution gross equals max distributable', () => {
    // maxDistributable = 1_000_000 + 0 - 50_000 = 950_000
    const scenarios = generateStandardScenarios(input, partners)
    expect(scenarios[0].gross_distribution_try).toBe(950_000)
  })

  it('conservative scenario is 50% of max distributable', () => {
    // 950_000 * 0.5 = 475_000
    const scenarios = generateStandardScenarios(input, partners)
    expect(scenarios[1].gross_distribution_try).toBe(475_000)
  })

  it('requested scenario uses input.requested_distribution_try', () => {
    const scenarios = generateStandardScenarios(input, partners)
    expect(scenarios[2].gross_distribution_try).toBe(600_000)
  })

  it('debt-first scenario equals max distributable when no loans outstanding', () => {
    const scenarios = generateStandardScenarios(input, partners)
    expect(scenarios[3].gross_distribution_try).toBe(950_000)
  })

  it('debt-first scenario reduces distribution when loans exist', () => {
    const inputWithLoans: DistributionInput = {
      ...input,
      outstanding_loans_try: 300_000,
    }
    const scenarios = generateStandardScenarios(inputWithLoans, partners)
    // repaymentSuggestion = min(300_000, 950_000) = 300_000
    // debtFirstAmount = max(0, 950_000 - 300_000) = 650_000
    expect(scenarios[3].gross_distribution_try).toBe(650_000)
  })

  it('all scenarios have per_partner_distributions', () => {
    const scenarios = generateStandardScenarios(input, partners)
    for (const s of scenarios) {
      expect(s.per_partner_distributions).toHaveLength(2)
    }
  })
})

// ── findOptimalDistribution ───────────────────────────────────────────────────

describe('findOptimalDistribution', () => {
  it('returns the compliant scenario with highest gross distribution', () => {
    const scenarios = [
      {
        name: 'Low', is_legally_compliant: true, gross_distribution_try: 100_000,
        description: '', net_distribution_try: 90_000, withholding_tax_try: 10_000,
        legal_reserve_required_try: 5_000, legal_reserve_fulfilled: true,
        blocking_reason: null, ttk_509_check: true, ttk_519_check: true,
        retained_earnings_after: 50_000, per_partner_distributions: [],
      },
      {
        name: 'High', is_legally_compliant: true, gross_distribution_try: 500_000,
        description: '', net_distribution_try: 450_000, withholding_tax_try: 50_000,
        legal_reserve_required_try: 5_000, legal_reserve_fulfilled: true,
        blocking_reason: null, ttk_509_check: true, ttk_519_check: true,
        retained_earnings_after: 0, per_partner_distributions: [],
      },
      {
        name: 'NonCompliant', is_legally_compliant: false, gross_distribution_try: 1_000_000,
        description: '', net_distribution_try: 900_000, withholding_tax_try: 100_000,
        legal_reserve_required_try: 5_000, legal_reserve_fulfilled: true,
        blocking_reason: 'TTK 509: ...', ttk_509_check: false, ttk_519_check: false,
        retained_earnings_after: -50_000, per_partner_distributions: [],
      },
    ]
    const optimal = findOptimalDistribution(scenarios)
    expect(optimal).not.toBeNull()
    expect(optimal!.name).toBe('High')
  })

  it('returns null when no scenario is compliant', () => {
    const scenarios = [
      {
        name: 'A', is_legally_compliant: false, gross_distribution_try: 100_000,
        description: '', net_distribution_try: 90_000, withholding_tax_try: 10_000,
        legal_reserve_required_try: 0, legal_reserve_fulfilled: true,
        blocking_reason: 'TTK 509', ttk_509_check: false, ttk_519_check: false,
        retained_earnings_after: 0, per_partner_distributions: [],
      },
    ]
    expect(findOptimalDistribution(scenarios)).toBeNull()
  })

  it('returns null for empty array', () => {
    expect(findOptimalDistribution([])).toBeNull()
  })

  it('returns single compliant scenario', () => {
    const scenarios = [
      {
        name: 'Only', is_legally_compliant: true, gross_distribution_try: 200_000,
        description: '', net_distribution_try: 180_000, withholding_tax_try: 20_000,
        legal_reserve_required_try: 10_000, legal_reserve_fulfilled: true,
        blocking_reason: null, ttk_509_check: true, ttk_519_check: true,
        retained_earnings_after: 50_000, per_partner_distributions: [],
      },
    ]
    const optimal = findOptimalDistribution(scenarios)
    expect(optimal!.name).toBe('Only')
  })
})

// ── computeDistributionYield ──────────────────────────────────────────────────

describe('computeDistributionYield', () => {
  it('returns null when net profit is zero', () => {
    expect(computeDistributionYield(100_000, 0)).toBeNull()
  })

  it('computes yield correctly', () => {
    // 500_000 / 1_000_000 = 0.5
    expect(computeDistributionYield(500_000, 1_000_000)).toBe(0.5)
  })

  it('returns 1.0 for full distribution equal to net profit', () => {
    expect(computeDistributionYield(1_000_000, 1_000_000)).toBe(1)
  })

  it('handles fractional yield rounded to 2 decimals', () => {
    // 333_333 / 1_000_000 = 0.333333 => 0.33
    expect(computeDistributionYield(333_333, 1_000_000)).toBe(0.33)
  })

  it('handles zero distribution', () => {
    expect(computeDistributionYield(0, 1_000_000)).toBe(0)
  })
})

// ── Integration: ₺1M profit, ₺500K capital, ₺50K reserves, 2 partners (60/40) ──

describe('Integration: ₺1M profit, ₺500K capital, ₺50K reserves', () => {
  const input: DistributionInput = {
    net_profit_try: 1_000_000,
    paid_in_capital_try: 500_000,
    existing_legal_reserves_try: 50_000,
    existing_retained_earnings_try: 0,
    requested_distribution_try: 975_000, // will be non-compliant (ttk519 fails)
    compensation_ytd_try: 0,
    outstanding_loans_try: 0,
  }

  const partners = [
    { partner_id: 'partner-A', share_pct: 60 },
    { partner_id: 'partner-B', share_pct: 40 },
  ]

  it('legal reserve = ₺50_000 (5% of 1M, gap = 100K-50K = 50K)', () => {
    const lr = computeLegalReserveRequired(1_000_000, 500_000, 50_000)
    // gap = 100_000 - 50_000 = 50_000; proposed = 50_000; min = 50_000
    expect(lr).toBe(50_000)
  })

  it('max distributable = ₺950_000 (1M + 0 - 50K)', () => {
    const lr = computeLegalReserveRequired(1_000_000, 500_000, 50_000)
    const maxDist = computeMaxDistributable(1_000_000, 0, lr)
    expect(maxDist).toBe(950_000)
  })

  it('full distribution gross = ₺950_000', () => {
    const scenarios = generateStandardScenarios(input, partners)
    expect(scenarios[0].gross_distribution_try).toBe(950_000)
  })

  it('full distribution withholding = ₺95_000', () => {
    const scenarios = generateStandardScenarios(input, partners)
    expect(scenarios[0].withholding_tax_try).toBe(95_000)
  })

  it('full distribution net = ₺855_000', () => {
    const scenarios = generateStandardScenarios(input, partners)
    expect(scenarios[0].net_distribution_try).toBe(855_000)
  })

  it('Partner A (60%): gross = ₺570_000', () => {
    const scenarios = generateStandardScenarios(input, partners)
    const partnerA = scenarios[0].per_partner_distributions.find(p => p.partner_id === 'partner-A')
    expect(partnerA!.gross_try).toBe(570_000)
  })

  it('Partner A (60%): withholding = ₺57_000', () => {
    const scenarios = generateStandardScenarios(input, partners)
    const partnerA = scenarios[0].per_partner_distributions.find(p => p.partner_id === 'partner-A')
    expect(partnerA!.withholding_try).toBe(57_000)
  })

  it('Partner A (60%): net = ₺513_000', () => {
    const scenarios = generateStandardScenarios(input, partners)
    const partnerA = scenarios[0].per_partner_distributions.find(p => p.partner_id === 'partner-A')
    expect(partnerA!.net_try).toBe(513_000)
  })

  it('Partner B (40%): gross = ₺380_000', () => {
    const scenarios = generateStandardScenarios(input, partners)
    const partnerB = scenarios[0].per_partner_distributions.find(p => p.partner_id === 'partner-B')
    expect(partnerB!.gross_try).toBe(380_000)
  })

  it('Partner B (40%): net = ₺342_000', () => {
    const scenarios = generateStandardScenarios(input, partners)
    const partnerB = scenarios[0].per_partner_distributions.find(p => p.partner_id === 'partner-B')
    expect(partnerB!.net_try).toBe(342_000)
  })

  it('full distribution is legally compliant', () => {
    const scenarios = generateStandardScenarios(input, partners)
    expect(scenarios[0].is_legally_compliant).toBe(true)
  })

  it('optimal scenario is the full distribution', () => {
    const scenarios = generateStandardScenarios(input, partners)
    const optimal = findOptimalDistribution(scenarios)
    expect(optimal).not.toBeNull()
    expect(optimal!.gross_distribution_try).toBe(950_000)
  })

  it('distribution yield for full = 0.95', () => {
    const yld = computeDistributionYield(950_000, 1_000_000)
    expect(yld).toBe(0.95)
  })

  it('retained earnings after full distribution = ₺0', () => {
    // 1_000_000 + 0 - 50_000 - 950_000 = 0
    const scenarios = generateStandardScenarios(input, partners)
    expect(scenarios[0].retained_earnings_after).toBe(0)
  })

  it('conservative (50%) gross = ₺475_000', () => {
    const scenarios = generateStandardScenarios(input, partners)
    expect(scenarios[1].gross_distribution_try).toBe(475_000)
  })

  it('all 4 scenarios are generated', () => {
    const scenarios = generateStandardScenarios(input, partners)
    expect(scenarios).toHaveLength(4)
  })
})
