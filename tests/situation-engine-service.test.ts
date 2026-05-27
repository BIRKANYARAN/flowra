/**
 * Tests for lib/services/intelligence/situation-engine.service.ts
 *
 * Covers all pure score functions, classification, situation line builder,
 * composite score, and the full assembler.
 *
 * Run with: npx vitest run tests/situation-engine-service.test.ts
 */
import { describe, it, expect } from 'vitest'
import {
  computeCashScore,
  computeProfitScore,
  computeDebtScore,
  computeReceivablesScore,
  computePartnerScore,
  computeCompositeScore,
  classifySituation,
  buildSituationLine,
  assembleSituationReport,
  type SituationComponent,
} from '../lib/services/intelligence/situation-engine.service'

// ─────────────────────────────────────────────────────────────────────────────
// computeCashScore
// ─────────────────────────────────────────────────────────────────────────────

describe('computeCashScore', () => {
  it('10 months runway → 100 (perfect)', () => {
    expect(computeCashScore(10)).toBe(100)
  })

  it('5 months runway → 50', () => {
    expect(computeCashScore(5)).toBe(50)
  })

  it('15 months runway → 100 (clamped at ceiling)', () => {
    expect(computeCashScore(15)).toBe(100)
  })

  it('0 months runway → 0', () => {
    expect(computeCashScore(0)).toBe(0)
  })

  it('negative runway → 0 (clamped at floor)', () => {
    expect(computeCashScore(-5)).toBe(0)
  })

  it('null runway → 50 (neutral when no data)', () => {
    expect(computeCashScore(null)).toBe(50)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// computeProfitScore
// ─────────────────────────────────────────────────────────────────────────────

describe('computeProfitScore', () => {
  it('25% margin → 100 (25 × 2 + 50 = 100)', () => {
    expect(computeProfitScore(25)).toBe(100)
  })

  it('0% margin → 50', () => {
    expect(computeProfitScore(0)).toBe(50)
  })

  it('-10% margin → 30 (max(0, -10×2+50) = 30)', () => {
    expect(computeProfitScore(-10)).toBe(30)
  })

  it('-25% margin → 0 (clamped at floor)', () => {
    expect(computeProfitScore(-25)).toBe(0)
  })

  it('50% margin → 100 (clamped at ceiling)', () => {
    expect(computeProfitScore(50)).toBe(100)
  })

  it('null margin → 50 (neutral when no data)', () => {
    expect(computeProfitScore(null)).toBe(50)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// computeDebtScore
// ─────────────────────────────────────────────────────────────────────────────

describe('computeDebtScore', () => {
  it('DSR 0 → 100 (no debt = perfect)', () => {
    expect(computeDebtScore(0)).toBe(100)
  })

  it('DSR 1 → 0 (fully debt-burdened)', () => {
    expect(computeDebtScore(1)).toBe(0)
  })

  it('DSR 0.5 → 50 (half-weighted)', () => {
    expect(computeDebtScore(0.5)).toBe(50)
  })

  it('DSR > 1 → 0 (clamped at floor)', () => {
    expect(computeDebtScore(1.5)).toBe(0)
  })

  it('null DSR → 100 (no debt = healthy)', () => {
    expect(computeDebtScore(null)).toBe(100)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// computeReceivablesScore
// ─────────────────────────────────────────────────────────────────────────────

describe('computeReceivablesScore', () => {
  it('0% overdue → 100 (all current)', () => {
    expect(computeReceivablesScore(0)).toBe(100)
  })

  it('1.0 (100% overdue) → 0', () => {
    expect(computeReceivablesScore(1.0)).toBe(0)
  })

  it('0.5 (50% overdue) → 50', () => {
    expect(computeReceivablesScore(0.5)).toBe(50)
  })

  it('null overdue_ratio → 50 (neutral when no data)', () => {
    expect(computeReceivablesScore(null)).toBe(50)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// computePartnerScore
// ─────────────────────────────────────────────────────────────────────────────

describe('computePartnerScore', () => {
  it('burden 0 → 100 (perfect balance)', () => {
    expect(computePartnerScore(0)).toBe(100)
  })

  it('burden 0.5 → 0 (max imbalance, clamped)', () => {
    expect(computePartnerScore(0.5)).toBe(0)
  })

  it('burden 0.25 → 50 (mid imbalance)', () => {
    expect(computePartnerScore(0.25)).toBe(50)
  })

  it('negative burden → same as positive (absolute value applied)', () => {
    expect(computePartnerScore(-0.25)).toBe(50)
  })

  it('burden > 0.5 → 0 (clamped at floor)', () => {
    expect(computePartnerScore(1.0)).toBe(0)
  })

  it('null burden → 50 (neutral when no data)', () => {
    expect(computePartnerScore(null)).toBe(50)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// classifySituation
// ─────────────────────────────────────────────────────────────────────────────

describe('classifySituation', () => {
  it('score 85 → healthy', () => {
    expect(classifySituation(85)).toBe('healthy')
  })

  it('score 80 → healthy (boundary inclusive)', () => {
    expect(classifySituation(80)).toBe('healthy')
  })

  it('score 65 → caution', () => {
    expect(classifySituation(65)).toBe('caution')
  })

  it('score 60 → caution (boundary inclusive)', () => {
    expect(classifySituation(60)).toBe('caution')
  })

  it('score 45 → at_risk', () => {
    expect(classifySituation(45)).toBe('at_risk')
  })

  it('score 40 → at_risk (boundary inclusive)', () => {
    expect(classifySituation(40)).toBe('at_risk')
  })

  it('score 30 → critical', () => {
    expect(classifySituation(30)).toBe('critical')
  })

  it('score 0 → critical', () => {
    expect(classifySituation(0)).toBe('critical')
  })

  it('score 79 → caution (just below healthy threshold)', () => {
    expect(classifySituation(79)).toBe('caution')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// buildSituationLine
// ─────────────────────────────────────────────────────────────────────────────

describe('buildSituationLine', () => {
  const makeComponent = (
    key: SituationComponent['key'],
    score: number,
    inputValue: number | null = null,
  ): SituationComponent => ({
    key,
    label:          key,
    score,
    weight:         0.20,
    weighted_score: score * 0.20,
    input_value:    inputValue,
    input_label:    String(inputValue ?? 'Veri yok'),
  })

  it('returns non-empty Turkish string for healthy status', () => {
    const line = buildSituationLine('healthy', makeComponent('cash', 80, 8))
    expect(typeof line).toBe('string')
    expect(line.length).toBeGreaterThan(0)
    expect(line).toContain('sağlıklı')
  })

  it('contains status word for caution', () => {
    const line = buildSituationLine('caution', makeComponent('profit', 50, 5))
    expect(line).toContain('dikkat gerektiriyor')
  })

  it('contains status word for at_risk', () => {
    const line = buildSituationLine('at_risk', makeComponent('debt', 30))
    expect(line).toContain('risk altında')
  })

  it('contains status word for critical', () => {
    const line = buildSituationLine('critical', makeComponent('cash', 10, 1))
    expect(line).toContain('kritik durumda')
  })

  it('cash concern includes runway months', () => {
    const line = buildSituationLine('caution', makeComponent('cash', 30, 3))
    expect(line).toContain('3')
    expect(line).toContain('runway')
  })

  it('profit concern includes margin percentage', () => {
    const line = buildSituationLine('caution', makeComponent('profit', 40, 5))
    expect(line).toContain('5')
    expect(line).toContain('marj')
  })

  it('debt concern has fixed Turkish phrase', () => {
    const line = buildSituationLine('at_risk', makeComponent('debt', 20))
    expect(line).toContain('borç servisi yükümlülüğü')
  })

  it('receivables concern includes overdue percentage', () => {
    const line = buildSituationLine('at_risk', makeComponent('receivables', 30, 0.7))
    expect(line).toContain('vadesi geçmiş')
  })

  it('partner concern has fixed Turkish phrase', () => {
    const line = buildSituationLine('caution', makeComponent('partner', 40))
    expect(line).toContain('ortak finansman dengesizliği')
  })

  it('starts with "Şirket"', () => {
    const line = buildSituationLine('healthy', makeComponent('cash', 100, 12))
    expect(line).toMatch(/^Şirket/)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// computeCompositeScore
// ─────────────────────────────────────────────────────────────────────────────

describe('computeCompositeScore', () => {
  it('all 100 scores with correct weights → 100', () => {
    const components: SituationComponent[] = [
      { key: 'cash',        label: '', score: 100, weight: 0.30, weighted_score: 30, input_value: null, input_label: '' },
      { key: 'profit',      label: '', score: 100, weight: 0.25, weighted_score: 25, input_value: null, input_label: '' },
      { key: 'debt',        label: '', score: 100, weight: 0.20, weighted_score: 20, input_value: null, input_label: '' },
      { key: 'receivables', label: '', score: 100, weight: 0.15, weighted_score: 15, input_value: null, input_label: '' },
      { key: 'partner',     label: '', score: 100, weight: 0.10, weighted_score: 10, input_value: null, input_label: '' },
    ]
    expect(computeCompositeScore(components)).toBe(100)
  })

  it('all 0 scores → 0', () => {
    const components: SituationComponent[] = [
      { key: 'cash',        label: '', score: 0, weight: 0.30, weighted_score: 0, input_value: null, input_label: '' },
      { key: 'profit',      label: '', score: 0, weight: 0.25, weighted_score: 0, input_value: null, input_label: '' },
      { key: 'debt',        label: '', score: 0, weight: 0.20, weighted_score: 0, input_value: null, input_label: '' },
      { key: 'receivables', label: '', score: 0, weight: 0.15, weighted_score: 0, input_value: null, input_label: '' },
      { key: 'partner',     label: '', score: 0, weight: 0.10, weighted_score: 0, input_value: null, input_label: '' },
    ]
    expect(computeCompositeScore(components)).toBe(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// assembleSituationReport — integration
// ─────────────────────────────────────────────────────────────────────────────

describe('assembleSituationReport', () => {
  it('perfect inputs → composite_score 100 and status healthy', () => {
    const report = assembleSituationReport('company-1', {
      cash_runway_months: 10,
      net_margin_pct:     25,
      dsr:                0,
      overdue_ratio:      0,
      max_burden_score:   0,
    })
    expect(report.composite_score).toBe(100)
    expect(report.status).toBe('healthy')
    expect(report.status_color).toBe('green')
  })

  it('all nulls → all neutral scores → composite between 40 and 80', () => {
    const report = assembleSituationReport('company-2', {
      cash_runway_months: null,
      net_margin_pct:     null,
      dsr:                null,
      overdue_ratio:      null,
      max_burden_score:   null,
    })
    // With nulls: cash=50, profit=50, debt=100, receivables=50, partner=50
    // composite = 50*0.30 + 50*0.25 + 100*0.20 + 50*0.15 + 50*0.10
    // = 15 + 12.5 + 20 + 7.5 + 5 = 60 → caution
    expect(report.composite_score).toBe(60)
    expect(report.status).toBe('caution')
  })

  it('critical inputs → status critical', () => {
    const report = assembleSituationReport('company-3', {
      cash_runway_months: 0,
      net_margin_pct:     -25,
      dsr:                1,
      overdue_ratio:      1,
      max_burden_score:   1,
    })
    expect(report.status).toBe('critical')
    expect(report.composite_score).toBe(0)
  })

  it('report has all required fields', () => {
    const report = assembleSituationReport('company-4', {
      cash_runway_months: 5,
      net_margin_pct:     10,
      dsr:                0.3,
      overdue_ratio:      0.2,
      max_burden_score:   0.1,
    })
    expect(report.company_id).toBe('company-4')
    expect(typeof report.composite_score).toBe('number')
    expect(report.status).toBeDefined()
    expect(report.status_label).toBeDefined()
    expect(report.status_color).toBeDefined()
    expect(typeof report.situation_line).toBe('string')
    expect(report.components).toHaveLength(5)
    expect(report.top_concern).toBeDefined()
    expect(typeof report.computed_at).toBe('string')
  })

  it('top_concern is the component with lowest weighted_score', () => {
    // Cash at 0 runway should have lowest weighted_score (0 * 0.30 = 0)
    const report = assembleSituationReport('company-5', {
      cash_runway_months: 0,   // cashScore = 0, weighted = 0
      net_margin_pct:     10,  // profitScore = 70, weighted = 17.5
      dsr:                0,   // debtScore = 100, weighted = 20
      overdue_ratio:      0,   // receivablesScore = 100, weighted = 15
      max_burden_score:   0,   // partnerScore = 100, weighted = 10
    })
    expect(report.top_concern.key).toBe('cash')
  })

  it('situation_line is a non-empty Turkish string', () => {
    const report = assembleSituationReport('company-6', {
      cash_runway_months: 6,
      net_margin_pct:     8,
      dsr:                0.2,
      overdue_ratio:      0.1,
      max_burden_score:   0,
    })
    expect(report.situation_line).toBeTruthy()
    expect(report.situation_line.length).toBeGreaterThan(10)
  })

  it('all component scores are in range [0, 100]', () => {
    const report = assembleSituationReport('company-7', {
      cash_runway_months: 3,
      net_margin_pct:     -5,
      dsr:                0.8,
      overdue_ratio:      0.6,
      max_burden_score:   0.3,
    })
    for (const c of report.components) {
      expect(c.score, `${c.key} score out of range`).toBeGreaterThanOrEqual(0)
      expect(c.score, `${c.key} score out of range`).toBeLessThanOrEqual(100)
    }
  })
})
