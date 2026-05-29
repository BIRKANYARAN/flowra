// ─────────────────────────────────────────────────────────────────────────────
// tests/narrative.test.ts
//
// Pure function tests for the Financial Narrative Engine.
// No DB required — all tests use generateFromData() directly.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest'
import {
  generateFromData,
  type NarrativeInputData,
} from '@/lib/services/intelligence/narrative.service'

// ── Base fixture (healthy, normal state) ──────────────────────────────────────

function makeInput(overrides: Partial<NarrativeInputData> = {}): NarrativeInputData {
  return {
    period:                  { from: '2026-05-01', to: '2026-05-31' },
    revenue_try:             500_000,
    cost_try:                200_000,
    gross_profit_try:        300_000,
    expenses_total_try:      150_000,
    net_income_try:          100_000,
    prior_revenue_try:       480_000,
    prior_net_income_try:    90_000,
    cash_try:                800_000,
    ccc_days:                25,
    dso_days:                18,
    total_receivables_try:   120_000,
    overdue_receivables_try: 0,
    overdue_count:           0,
    partner_loan_count:      0,
    partner_loan_total:      0,
    situation_status:        'healthy',
    situation_line:          'Şirket sağlıklı seyrediyor — tüm metrikler sağlıklı',
    runway_months:           8,
    monthly_burn:            100_000,
    ...overrides,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Headline tests
// ─────────────────────────────────────────────────────────────────────────────

describe('Headline generation', () => {

  it('1. Revenue growth > 20% → headline mentions "güçlü büyüme"', () => {
    const input = makeInput({
      revenue_try:       650_000,
      prior_revenue_try: 500_000,   // +30% growth
    })
    const narrative = generateFromData(input)
    expect(narrative.headline.toLowerCase()).toContain('güçlü büyüme')
  })

  it('2. Revenue decline > 20% → headline mentions "geriledi"', () => {
    const input = makeInput({
      revenue_try:       350_000,
      prior_revenue_try: 500_000,   // -30% decline
    })
    const narrative = generateFromData(input)
    expect(narrative.headline.toLowerCase()).toContain('geriledi')
  })

  it('3. Net loss → headline mentions "zarar"', () => {
    const input = makeInput({
      net_income_try:      -50_000,
      runway_months:       10,        // not runway critical
    })
    const narrative = generateFromData(input)
    expect(narrative.headline.toLowerCase()).toContain('zarar')
  })

  it('4. Critical runway < 3 months → headline mentions "nakit baskısı"', () => {
    const input = makeInput({
      runway_months:   1.5,
      cash_try:        150_000,
      net_income_try:  -30_000,   // burning cash
    })
    const narrative = generateFromData(input)
    expect(narrative.headline.toLowerCase()).toContain('nakit baskısı')
  })

  it('5. Healthy state → headline contains period label and "sağlıklı"', () => {
    const input = makeInput({
      prior_revenue_try: 490_000,   // < 20% change
      net_income_try:    100_000,
      runway_months:     10,
    })
    const narrative = generateFromData(input)
    // Default healthy headline includes period label and status
    expect(narrative.headline).toContain('Mayıs')
    expect(narrative.headline.toLowerCase()).toContain('sağlıklı')
  })

  it('6. Headline is a non-empty string', () => {
    const narrative = generateFromData(makeInput())
    expect(typeof narrative.headline).toBe('string')
    expect(narrative.headline.length).toBeGreaterThan(0)
  })

  it('7. Runway = 2 (critical) takes priority over revenue growth > 20%', () => {
    const input = makeInput({
      runway_months:     2,
      cash_try:          200_000,
      revenue_try:       700_000,
      prior_revenue_try: 500_000,   // +40% growth
    })
    const narrative = generateFromData(input)
    // Priority 1 = critical runway → nakit baskısı beats güçlü büyüme
    expect(narrative.headline.toLowerCase()).toContain('nakit baskısı')
  })

  it('8. Exactly 20% revenue growth → does NOT trigger "güçlü büyüme" (threshold is >20)', () => {
    const input = makeInput({
      revenue_try:       600_000,
      prior_revenue_try: 500_000,   // exactly +20%
      net_income_try:    50_000,
      runway_months:     10,
    })
    const narrative = generateFromData(input)
    expect(narrative.headline.toLowerCase()).not.toContain('güçlü büyüme')
  })

  it('9. Net loss takes priority over modest revenue decline', () => {
    const input = makeInput({
      revenue_try:       450_000,
      prior_revenue_try: 500_000,   // -10% decline (not >20%)
      net_income_try:    -20_000,
      runway_months:     10,
    })
    const narrative = generateFromData(input)
    expect(narrative.headline.toLowerCase()).toContain('zarar')
  })

  it('10. Null prior_revenue → no growth-based headline even if change is big', () => {
    const input = makeInput({
      revenue_try:       1_000_000,
      prior_revenue_try: null,
      net_income_try:    50_000,
      runway_months:     10,
    })
    const narrative = generateFromData(input)
    expect(narrative.headline.toLowerCase()).not.toContain('güçlü büyüme')
    expect(narrative.headline.toLowerCase()).not.toContain('geriledi')
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// Performance paragraph tests
// ─────────────────────────────────────────────────────────────────────────────

describe('Performance paragraph', () => {

  it('6. Performance paragraph includes revenue amount', () => {
    const input = makeInput({ revenue_try: 500_000 })
    const narrative = generateFromData(input)
    // fmtTRY(500000, 0) → "₺500.000"
    expect(narrative.sections.performance).toContain('500')
  })

  it('Performance paragraph mentions "artış" when revenue grew', () => {
    const input = makeInput({
      revenue_try:       600_000,
      prior_revenue_try: 500_000,
    })
    const narrative = generateFromData(input)
    expect(narrative.sections.performance.toLowerCase()).toContain('artış')
  })

  it('Performance paragraph mentions "düşüş" when revenue declined', () => {
    const input = makeInput({
      revenue_try:       400_000,
      prior_revenue_try: 500_000,
    })
    const narrative = generateFromData(input)
    expect(narrative.sections.performance.toLowerCase()).toContain('düşüş')
  })

  it('Performance paragraph mentions zarar when net_income is negative', () => {
    const input = makeInput({ net_income_try: -30_000 })
    const narrative = generateFromData(input)
    expect(narrative.sections.performance.toLowerCase()).toContain('zarar')
  })

  it('Performance paragraph mentions kâr when net_income is positive', () => {
    const input = makeInput({ net_income_try: 100_000 })
    const narrative = generateFromData(input)
    expect(narrative.sections.performance.toLowerCase()).toContain('kâr')
  })

  it('Performance paragraph is a non-empty string', () => {
    const narrative = generateFromData(makeInput())
    expect(narrative.sections.performance.length).toBeGreaterThan(0)
  })

  it('Performance paragraph includes gross margin reference', () => {
    const input = makeInput({
      revenue_try:      400_000,
      gross_profit_try: 200_000,
    })
    const narrative = generateFromData(input)
    // Should reference brüt kâr marjı
    expect(narrative.sections.performance.toLowerCase()).toContain('brüt')
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// Liquidity paragraph tests
// ─────────────────────────────────────────────────────────────────────────────

describe('Liquidity paragraph', () => {

  it('7. Runway 6 months → liquidity mentions "6 aylık nakit"', () => {
    const input = makeInput({ runway_months: 6 })
    const narrative = generateFromData(input)
    expect(narrative.sections.liquidity).toContain('6 aylık nakit')
  })

  it('8. No runway data (null) → liquidity contains "hesaplanamadı"', () => {
    const input = makeInput({
      runway_months: null,
      monthly_burn:  0,
    })
    const narrative = generateFromData(input)
    expect(narrative.sections.liquidity.toLowerCase()).toContain('hesaplanamadı')
  })

  it('9. Critical runway < 3 months → liquidity contains "Kritik"', () => {
    const input = makeInput({
      runway_months: 2,
      monthly_burn:  80_000,
    })
    const narrative = generateFromData(input)
    expect(narrative.sections.liquidity).toContain('Kritik')
  })

  it('Runway > 12 months → liquidity mentions 1 yılın üzerinde', () => {
    const input = makeInput({ runway_months: 18 })
    const narrative = generateFromData(input)
    expect(narrative.sections.liquidity.toLowerCase()).toContain('1 yılın üzerinde')
  })

  it('Runway between 3 and 6 → liquidity mentions "Dikkat"', () => {
    const input = makeInput({ runway_months: 4 })
    const narrative = generateFromData(input)
    expect(narrative.sections.liquidity).toContain('Dikkat')
  })

  it('Cash amount appears in liquidity section', () => {
    const input = makeInput({ cash_try: 500_000 })
    const narrative = generateFromData(input)
    expect(narrative.sections.liquidity).toContain('500')
  })

  it('Monthly burn appears in liquidity when > 0', () => {
    const input = makeInput({ monthly_burn: 75_000 })
    const narrative = generateFromData(input)
    expect(narrative.sections.liquidity).toContain('75')
  })

  it('Liquidity paragraph is a non-empty string', () => {
    const narrative = generateFromData(makeInput())
    expect(narrative.sections.liquidity.length).toBeGreaterThan(0)
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// Risk paragraph tests
// ─────────────────────────────────────────────────────────────────────────────

describe('Risk paragraph', () => {

  it('10. No overdue receivables → risk contains "Tüm alacaklar güncel"', () => {
    const input = makeInput({
      overdue_receivables_try: 0,
      total_receivables_try:   120_000,
      overdue_count:           0,
    })
    const narrative = generateFromData(input)
    expect(narrative.sections.risk).toContain('Tüm alacaklar güncel')
  })

  it('11. Overdue > 50% of total → risk contains "zayıflıyor"', () => {
    const input = makeInput({
      total_receivables_try:   100_000,
      overdue_receivables_try: 65_000,   // 65% overdue
      overdue_count:           5,
    })
    const narrative = generateFromData(input)
    expect(narrative.sections.risk.toLowerCase()).toContain('zayıflıyor')
  })

  it('Overdue < 20% → risk mentions amount but not zayıflıyor', () => {
    const input = makeInput({
      total_receivables_try:   100_000,
      overdue_receivables_try: 15_000,   // 15% overdue
      overdue_count:           2,
    })
    const narrative = generateFromData(input)
    expect(narrative.sections.risk.toLowerCase()).not.toContain('zayıflıyor')
    // Should still mention the amount
    expect(narrative.sections.risk).toContain('15')
  })

  it('Partner loans present → risk mentions partner debt', () => {
    const input = makeInput({
      partner_loan_count: 2,
      partner_loan_total: 300_000,
    })
    const narrative = generateFromData(input)
    // Should mention partner count or amount
    expect(narrative.sections.risk).toContain('300')
  })

  it('No partner loans → risk mentions no partner debt', () => {
    const input = makeInput({
      partner_loan_count: 0,
      partner_loan_total: 0,
    })
    const narrative = generateFromData(input)
    expect(narrative.sections.risk.toLowerCase()).toContain('ortak borçlanması bulunmuyor')
  })

  it('Risk paragraph is a non-empty string', () => {
    const narrative = generateFromData(makeInput())
    expect(narrative.sections.risk.length).toBeGreaterThan(0)
  })

  it('Situation line is embedded in risk paragraph', () => {
    const situationLine = 'Şirket sağlıklı seyrediyor — tüm metrikler sağlıklı'
    const input = makeInput({ situation_line: situationLine })
    const narrative = generateFromData(input)
    expect(narrative.sections.risk).toContain(situationLine)
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// Outlook paragraph tests
// ─────────────────────────────────────────────────────────────────────────────

describe('Outlook paragraph', () => {

  it('12. Negative CCC → outlook mentions "negatif"', () => {
    const input = makeInput({ ccc_days: -5 })
    const narrative = generateFromData(input)
    expect(narrative.sections.outlook.toLowerCase()).toContain('negatif')
  })

  it('13. CCC > 60 days → outlook mentions "yüksek"', () => {
    const input = makeInput({ ccc_days: 75 })
    const narrative = generateFromData(input)
    expect(narrative.sections.outlook.toLowerCase()).toContain('yüksek')
  })

  it('14. Null CCC → outlook contains "hesaplanamadı"', () => {
    const input = makeInput({ ccc_days: null, dso_days: null })
    const narrative = generateFromData(input)
    expect(narrative.sections.outlook.toLowerCase()).toContain('hesaplanamadı')
  })

  it('CCC 0-30 days → outlook mentions "sektör ortalamasında"', () => {
    const input = makeInput({ ccc_days: 20 })
    const narrative = generateFromData(input)
    expect(narrative.sections.outlook.toLowerCase()).toContain('sektör ortalamasında')
  })

  it('CCC 31-60 days → outlook mentions "dso"', () => {
    const input = makeInput({ ccc_days: 45 })
    const narrative = generateFromData(input)
    expect(narrative.sections.outlook.toLowerCase()).toContain('dso')
  })

  it('Outlook paragraph is a non-empty string', () => {
    const narrative = generateFromData(makeInput())
    expect(narrative.sections.outlook.length).toBeGreaterThan(0)
  })

  it('Healthy company with good runway → outlook mentions sağlıklı', () => {
    const input = makeInput({
      runway_months:  10,
      net_income_try: 100_000,
      ccc_days:       20,
    })
    const narrative = generateFromData(input)
    expect(narrative.sections.outlook.toLowerCase()).toContain('sağlıklı')
  })

  it('Poor company → outlook mentions likidite', () => {
    const input = makeInput({
      runway_months:  1,
      net_income_try: -30_000,
      ccc_days:       20,
    })
    const narrative = generateFromData(input)
    expect(narrative.sections.outlook.toLowerCase()).toContain('likidite')
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// key_numbers tests
// ─────────────────────────────────────────────────────────────────────────────

describe('key_numbers', () => {

  it('15. key_numbers contains correct revenue', () => {
    const input = makeInput({ revenue_try: 750_000 })
    const narrative = generateFromData(input)
    expect(narrative.key_numbers.revenue_try).toBe(750_000)
  })

  it('16. key_numbers.revenue_change_pct is computed correctly', () => {
    const input = makeInput({
      revenue_try:       600_000,
      prior_revenue_try: 500_000,  // +20%
    })
    const narrative = generateFromData(input)
    expect(narrative.key_numbers.revenue_change_pct).toBe(20)
  })

  it('17. key_numbers.revenue_change_pct is null when no prior data', () => {
    const input = makeInput({ prior_revenue_try: null })
    const narrative = generateFromData(input)
    expect(narrative.key_numbers.revenue_change_pct).toBeNull()
  })

  it('18. key_numbers.dso_days propagated correctly', () => {
    const input = makeInput({ dso_days: 22 })
    const narrative = generateFromData(input)
    expect(narrative.key_numbers.dso_days).toBe(22)
  })

  it('key_numbers.net_income_try propagated correctly', () => {
    const input = makeInput({ net_income_try: -50_000 })
    const narrative = generateFromData(input)
    expect(narrative.key_numbers.net_income_try).toBe(-50_000)
  })

  it('key_numbers.cash_try propagated correctly', () => {
    const input = makeInput({ cash_try: 1_200_000 })
    const narrative = generateFromData(input)
    expect(narrative.key_numbers.cash_try).toBe(1_200_000)
  })

  it('key_numbers.runway_months propagated correctly', () => {
    const input = makeInput({ runway_months: 7 })
    const narrative = generateFromData(input)
    expect(narrative.key_numbers.runway_months).toBe(7)
  })

  it('key_numbers.runway_months is null when not provided', () => {
    const input = makeInput({ runway_months: null })
    const narrative = generateFromData(input)
    expect(narrative.key_numbers.runway_months).toBeNull()
  })

  it('key_numbers.revenue_change_pct is null when prior is 0', () => {
    const input = makeInput({ prior_revenue_try: 0 })
    const narrative = generateFromData(input)
    // 0 prior → division by zero guard → null
    expect(narrative.key_numbers.revenue_change_pct).toBeNull()
  })

  it('key_numbers.revenue_change_pct is negative when revenue declined', () => {
    const input = makeInput({
      revenue_try:       400_000,
      prior_revenue_try: 500_000,   // -20%
    })
    const narrative = generateFromData(input)
    expect(narrative.key_numbers.revenue_change_pct).toBeCloseTo(-20)
  })

  it('key_numbers has exactly 6 fields', () => {
    const narrative = generateFromData(makeInput())
    const keys = Object.keys(narrative.key_numbers)
    expect(keys).toHaveLength(6)
    expect(keys).toEqual(expect.arrayContaining([
      'revenue_try', 'revenue_change_pct', 'net_income_try',
      'cash_try', 'runway_months', 'dso_days',
    ]))
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// situation_status propagation
// ─────────────────────────────────────────────────────────────────────────────

describe('situation_status propagation', () => {

  it('19. situation_status: healthy → propagated to narrative', () => {
    const input = makeInput({ situation_status: 'healthy' })
    const narrative = generateFromData(input)
    expect(narrative.situation_status).toBe('healthy')
  })

  it('20. situation_status: critical → propagated to narrative', () => {
    const input = makeInput({ situation_status: 'critical' })
    const narrative = generateFromData(input)
    expect(narrative.situation_status).toBe('critical')
  })

  it('21. situation_status: at-risk → propagated to narrative', () => {
    const input = makeInput({ situation_status: 'at-risk' })
    const narrative = generateFromData(input)
    expect(narrative.situation_status).toBe('at-risk')
  })

  it('situation_status: caution → propagated to narrative', () => {
    const input = makeInput({ situation_status: 'caution' })
    const narrative = generateFromData(input)
    expect(narrative.situation_status).toBe('caution')
  })

  it('situation_status is one of the 4 valid values', () => {
    const validStatuses = ['healthy', 'caution', 'at-risk', 'critical']
    const narrative = generateFromData(makeInput())
    expect(validStatuses).toContain(narrative.situation_status)
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// Structural integrity tests
// ─────────────────────────────────────────────────────────────────────────────

describe('Narrative structure', () => {

  it('22. All 4 sections are non-empty strings', () => {
    const narrative = generateFromData(makeInput())
    expect(narrative.sections.performance.length).toBeGreaterThan(0)
    expect(narrative.sections.liquidity.length).toBeGreaterThan(0)
    expect(narrative.sections.risk.length).toBeGreaterThan(0)
    expect(narrative.sections.outlook.length).toBeGreaterThan(0)
  })

  it('23. generated_at is a valid ISO string', () => {
    const narrative = generateFromData(makeInput())
    expect(() => new Date(narrative.generated_at).toISOString()).not.toThrow()
  })

  it('24. period_label is derived from period.from', () => {
    const input = makeInput({ period: { from: '2026-05-01', to: '2026-05-31' } })
    const narrative = generateFromData(input)
    // fmtMonth('2026-05-01') → "Mayıs 2026"
    expect(narrative.period_label).toContain('2026')
  })

  it('narrative has exactly: generated_at, period_label, headline, sections, key_numbers, situation_status', () => {
    const narrative = generateFromData(makeInput())
    expect(narrative).toHaveProperty('generated_at')
    expect(narrative).toHaveProperty('period_label')
    expect(narrative).toHaveProperty('headline')
    expect(narrative).toHaveProperty('sections')
    expect(narrative).toHaveProperty('key_numbers')
    expect(narrative).toHaveProperty('situation_status')
  })

  it('sections has exactly 4 keys', () => {
    const narrative = generateFromData(makeInput())
    const sectionKeys = Object.keys(narrative.sections)
    expect(sectionKeys).toHaveLength(4)
    expect(sectionKeys).toEqual(expect.arrayContaining(['performance', 'liquidity', 'risk', 'outlook']))
  })

  it('generated_at timestamp is close to now', () => {
    const before = Date.now()
    const narrative = generateFromData(makeInput())
    const after = Date.now()
    const ts = new Date(narrative.generated_at).getTime()
    expect(ts).toBeGreaterThanOrEqual(before)
    expect(ts).toBeLessThanOrEqual(after + 100) // 100ms buffer
  })

  it('period_label contains month name for different months', () => {
    const jan = makeInput({ period: { from: '2026-01-01', to: '2026-01-31' } })
    const dec = makeInput({ period: { from: '2026-12-01', to: '2026-12-31' } })
    const janLabel = generateFromData(jan).period_label
    const decLabel = generateFromData(dec).period_label
    expect(janLabel).not.toBe(decLabel)
  })

  it('all sections are plain text strings (no HTML or JSON)', () => {
    const narrative = generateFromData(makeInput())
    for (const [key, text] of Object.entries(narrative.sections)) {
      expect(typeof text, `section ${key} should be string`).toBe('string')
      expect(text, `section ${key} should not contain HTML`).not.toContain('<')
    }
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// Boundary/edge case tests
// ─────────────────────────────────────────────────────────────────────────────

describe('Narrative — edge cases and boundaries', () => {

  it('zero revenue → no crash, returns valid narrative', () => {
    const input = makeInput({
      revenue_try:      0,
      gross_profit_try: 0,
      net_income_try:   0,
      prior_revenue_try: 0,
    })
    expect(() => generateFromData(input)).not.toThrow()
    const narrative = generateFromData(input)
    expect(narrative.sections.performance.length).toBeGreaterThan(0)
  })

  it('zero cash → liquidity section still generated', () => {
    const input = makeInput({ cash_try: 0 })
    const narrative = generateFromData(input)
    expect(narrative.sections.liquidity.length).toBeGreaterThan(0)
  })

  it('runway = 0 months → critical liquidity signal', () => {
    const input = makeInput({
      runway_months: 0,
      monthly_burn:  100_000,
      cash_try:      0,
    })
    const narrative = generateFromData(input)
    expect(narrative.sections.liquidity.toLowerCase()).toContain('kritik')
  })

  it('very large revenue value → numeric formatting works', () => {
    const input = makeInput({ revenue_try: 100_000_000 })
    const narrative = generateFromData(input)
    expect(narrative.sections.performance.length).toBeGreaterThan(0)
    expect(narrative.key_numbers.revenue_try).toBe(100_000_000)
  })

  it('all null optional fields → no crash', () => {
    const input = makeInput({
      prior_revenue_try:    null,
      prior_net_income_try: null,
      ccc_days:             null,
      dso_days:             null,
      runway_months:        null,
    })
    expect(() => generateFromData(input)).not.toThrow()
    const narrative = generateFromData(input)
    expect(narrative.headline.length).toBeGreaterThan(0)
  })

  it('overdue equals total → 100% overdue triggers risk warning', () => {
    const input = makeInput({
      total_receivables_try:   100_000,
      overdue_receivables_try: 100_000,
      overdue_count:           10,
    })
    const narrative = generateFromData(input)
    expect(narrative.sections.risk.toLowerCase()).toContain('zayıflıyor')
  })

  it('expenses exactly equal revenue → performance mentions gider oranı or dengeli', () => {
    const input = makeInput({
      revenue_try:        200_000,
      expenses_total_try: 200_000,
      net_income_try:     0,
    })
    const narrative = generateFromData(input)
    // net income = 0 → başabaş
    expect(narrative.sections.performance.toLowerCase()).toContain('başabaş')
  })

})
