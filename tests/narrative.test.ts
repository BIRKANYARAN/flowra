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

})
