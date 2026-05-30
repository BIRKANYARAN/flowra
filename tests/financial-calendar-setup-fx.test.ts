// ─────────────────────────────────────────────────────────────────────────────
// tests/financial-calendar-setup-fx.test.ts
//
// Pure-function tests for:
//   A. Financial Calendar helpers: daysUntilFinancialEvent, classifyEventUrgency, buildEventSummary
//   B. Setup Checklist helpers:    computeSetupProgress, isSetupSufficient, buildNextStepPrompt
//   C. FX Exposure helpers:        classifyFxRisk, formatCurrencyExposure, classifyHedgeRecommendation
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest'

// ── A: Financial Calendar ─────────────────────────────────────────────────────
import {
  daysUntilFinancialEvent,
  classifyEventUrgency,
  buildEventSummary,
} from '../lib/services/intelligence/financial-calendar.service'

// ── B: Setup Checklist ────────────────────────────────────────────────────────
import {
  computeSetupProgress,
  isSetupSufficient,
  buildNextStepPrompt,
} from '../lib/services/intelligence/setup-checklist.service'

// ── C: FX Exposure ────────────────────────────────────────────────────────────
import {
  classifyFxRisk,
  formatCurrencyExposure,
  classifyHedgeRecommendation,
} from '../lib/services/finance/fx-exposure.service'

// =============================================================================
// A. Financial Calendar helpers
// =============================================================================

describe('daysUntilFinancialEvent', () => {
  it('returns 0 when event is today', () => {
    expect(daysUntilFinancialEvent('2026-06-01', '2026-06-01')).toBe(0)
  })

  it('returns positive when event is in the future', () => {
    expect(daysUntilFinancialEvent('2026-06-10', '2026-06-01')).toBe(9)
  })

  it('returns negative when event is overdue', () => {
    expect(daysUntilFinancialEvent('2026-05-25', '2026-06-01')).toBe(-7)
  })

  it('handles exactly 30 days ahead', () => {
    expect(daysUntilFinancialEvent('2026-07-01', '2026-06-01')).toBe(30)
  })

  it('handles cross-month boundaries correctly', () => {
    const days = daysUntilFinancialEvent('2026-03-01', '2026-02-28')
    expect(days).toBe(1)
  })

  it('handles year boundary (Jan 1 next year)', () => {
    const days = daysUntilFinancialEvent('2027-01-01', '2026-12-31')
    expect(days).toBe(1)
  })
})

describe('classifyEventUrgency', () => {
  it('classifies negative days as overdue', () => {
    expect(classifyEventUrgency(-1)).toBe('overdue')
    expect(classifyEventUrgency(-30)).toBe('overdue')
  })

  it('classifies 0 days as critical', () => {
    expect(classifyEventUrgency(0)).toBe('critical')
  })

  it('classifies 1–7 days as critical', () => {
    expect(classifyEventUrgency(1)).toBe('critical')
    expect(classifyEventUrgency(7)).toBe('critical')
  })

  it('classifies 8–14 days as warning', () => {
    expect(classifyEventUrgency(8)).toBe('warning')
    expect(classifyEventUrgency(14)).toBe('warning')
  })

  it('classifies 15+ days as upcoming', () => {
    expect(classifyEventUrgency(15)).toBe('upcoming')
    expect(classifyEventUrgency(60)).toBe('upcoming')
    expect(classifyEventUrgency(365)).toBe('upcoming')
  })
})

describe('buildEventSummary', () => {
  it('returns "0 etkinlik" for empty list', () => {
    expect(buildEventSummary([])).toBe('0 etkinlik')
  })

  it('includes total count and urgency breakdown', () => {
    const events = [
      { title: 'KDV', daysUntil: -2 },  // overdue
      { title: 'SGK', daysUntil: 3 },   // critical
      { title: 'KV',  daysUntil: 20 },  // upcoming
    ]
    const result = buildEventSummary(events)
    expect(result).toContain('3 etkinlik')
    expect(result).toContain('gecikmiş')
    expect(result).toContain('kritik')
    expect(result).toContain('yaklaşan')
  })

  it('shows only relevant urgency buckets', () => {
    const events = [
      { title: 'A', daysUntil: 20 },
      { title: 'B', daysUntil: 25 },
    ]
    const result = buildEventSummary(events)
    expect(result).toContain('2 etkinlik')
    expect(result).toContain('yaklaşan')
    expect(result).not.toContain('kritik')
    expect(result).not.toContain('gecikmiş')
  })

  it('handles single critical event', () => {
    const result = buildEventSummary([{ title: 'KDV', daysUntil: 0 }])
    expect(result).toContain('1 etkinlik')
    expect(result).toContain('1 kritik')
  })

  it('handles warning events', () => {
    const events = [
      { title: 'A', daysUntil: 10 },
      { title: 'B', daysUntil: 12 },
    ]
    const result = buildEventSummary(events)
    expect(result).toContain('2 uyarı')
  })
})

// =============================================================================
// B. Setup Checklist helpers
// =============================================================================

describe('computeSetupProgress', () => {
  it('returns 100% for all groups when items list is empty', () => {
    const result = computeSetupProgress([])
    expect(result).toEqual({ required_pct: 100, optional_pct: 100, total_pct: 100 })
  })

  it('computes 0% when nothing is completed', () => {
    const items = [
      { completed: false, required: true },
      { completed: false, required: true },
      { completed: false, required: false },
    ]
    const result = computeSetupProgress(items)
    expect(result.required_pct).toBe(0)
    expect(result.optional_pct).toBe(0)
    expect(result.total_pct).toBe(0)
  })

  it('computes 100% when all items are completed', () => {
    const items = [
      { completed: true, required: true },
      { completed: true, required: true },
      { completed: true, required: false },
    ]
    const result = computeSetupProgress(items)
    expect(result.required_pct).toBe(100)
    expect(result.optional_pct).toBe(100)
    expect(result.total_pct).toBe(100)
  })

  it('handles partial completion correctly', () => {
    const items = [
      { completed: true,  required: true },
      { completed: false, required: true },
      { completed: true,  required: false },
      { completed: false, required: false },
    ]
    const result = computeSetupProgress(items)
    expect(result.required_pct).toBe(50)
    expect(result.optional_pct).toBe(50)
    expect(result.total_pct).toBe(50)
  })

  it('returns 100% for optional_pct when there are no optional items', () => {
    const items = [
      { completed: true,  required: true },
      { completed: false, required: true },
    ]
    const result = computeSetupProgress(items)
    expect(result.optional_pct).toBe(100)
    expect(result.required_pct).toBe(50)
  })

  it('rounds percentages correctly', () => {
    const items = [
      { completed: true,  required: true },
      { completed: false, required: true },
      { completed: false, required: true },
    ]
    const result = computeSetupProgress(items)
    expect(result.required_pct).toBe(33)
  })
})

describe('isSetupSufficient', () => {
  it('returns true when there are no required items', () => {
    const items = [
      { completed: false, required: false },
    ]
    expect(isSetupSufficient(items)).toBe(true)
  })

  it('returns true when all required items are completed', () => {
    const items = [
      { completed: true,  required: true },
      { completed: true,  required: true },
      { completed: false, required: false },
    ]
    expect(isSetupSufficient(items)).toBe(true)
  })

  it('returns false when any required item is not completed', () => {
    const items = [
      { completed: true,  required: true },
      { completed: false, required: true },
      { completed: true,  required: false },
    ]
    expect(isSetupSufficient(items)).toBe(false)
  })

  it('returns false when no items are completed', () => {
    const items = [
      { completed: false, required: true },
      { completed: false, required: true },
    ]
    expect(isSetupSufficient(items)).toBe(false)
  })

  it('returns true for empty list', () => {
    expect(isSetupSufficient([])).toBe(true)
  })
})

describe('buildNextStepPrompt', () => {
  it('returns null when all required items are complete', () => {
    const items = [
      { label: 'Firma Profili',  completed: true,  required: true },
      { label: 'Ortaklar',       completed: true,  required: true },
      { label: 'Bütçe',          completed: false, required: false },
    ]
    expect(buildNextStepPrompt(items)).toBeNull()
  })

  it('returns the first uncompleted required item label', () => {
    const items = [
      { label: 'Firma Profili',  completed: false, required: true },
      { label: 'Ortaklar',       completed: false, required: true },
    ]
    expect(buildNextStepPrompt(items)).toBe('Şimdi yapın: Firma Profili')
  })

  it('skips completed required items', () => {
    const items = [
      { label: 'Firma Profili',  completed: true,  required: true },
      { label: 'Ortaklar',       completed: false, required: true },
      { label: 'Ürünler',        completed: false, required: true },
    ]
    expect(buildNextStepPrompt(items)).toBe('Şimdi yapın: Ortaklar')
  })

  it('ignores optional items when looking for next required', () => {
    const items = [
      { label: 'Bütçe',          completed: false, required: false },
      { label: 'Firma Profili',  completed: false, required: true },
    ]
    expect(buildNextStepPrompt(items)).toBe('Şimdi yapın: Firma Profili')
  })

  it('returns null for empty list', () => {
    expect(buildNextStepPrompt([])).toBeNull()
  })

  it('returns null when only optional items exist (all uncompleted)', () => {
    const items = [
      { label: 'Bütçe',    completed: false, required: false },
      { label: 'KPI',      completed: false, required: false },
    ]
    expect(buildNextStepPrompt(items)).toBeNull()
  })
})

// =============================================================================
// C. FX Exposure helpers
// =============================================================================

describe('classifyFxRisk', () => {
  it('returns insufficient_data for null', () => {
    expect(classifyFxRisk(null)).toBe('insufficient_data')
  })

  it('returns minimal for ratio < 5%', () => {
    expect(classifyFxRisk(0)).toBe('minimal')
    expect(classifyFxRisk(4.9)).toBe('minimal')
  })

  it('returns low for ratio 5–14.9%', () => {
    expect(classifyFxRisk(5)).toBe('low')
    expect(classifyFxRisk(14.9)).toBe('low')
  })

  it('returns moderate for ratio 15–29.9%', () => {
    expect(classifyFxRisk(15)).toBe('moderate')
    expect(classifyFxRisk(29.9)).toBe('moderate')
  })

  it('returns significant for ratio 30–49.9%', () => {
    expect(classifyFxRisk(30)).toBe('significant')
    expect(classifyFxRisk(49.9)).toBe('significant')
  })

  it('returns critical for ratio >= 50%', () => {
    expect(classifyFxRisk(50)).toBe('critical')
    expect(classifyFxRisk(100)).toBe('critical')
    expect(classifyFxRisk(200)).toBe('critical')
  })
})

describe('formatCurrencyExposure', () => {
  it('formats USD asset exposure', () => {
    const result = formatCurrencyExposure(45000, 'USD', 'asset')
    expect(result).toContain('USD')
    expect(result).toContain('+')
    expect(result).toContain('$')
    expect(result).toContain('45,000')
    expect(result).toContain('Varlık')
  })

  it('formats EUR liability exposure', () => {
    const result = formatCurrencyExposure(12000, 'EUR', 'liability')
    expect(result).toContain('EUR')
    expect(result).toContain('-')
    expect(result).toContain('€')
    expect(result).toContain('12,000')
    expect(result).toContain('Yükümlülük')
  })

  it('formats GBP asset exposure', () => {
    const result = formatCurrencyExposure(5000, 'GBP', 'asset')
    expect(result).toContain('GBP')
    expect(result).toContain('£')
    expect(result).toContain('Varlık')
  })

  it('formats TRY exposure', () => {
    const result = formatCurrencyExposure(100000, 'TRY', 'asset')
    expect(result).toContain('TRY')
    expect(result).toContain('₺')
    expect(result).toContain('Varlık')
  })

  it('formats unknown currency with currency code as prefix', () => {
    const result = formatCurrencyExposure(8000, 'CHF', 'liability')
    expect(result).toContain('CHF')
    expect(result).toContain('Yükümlülük')
  })

  it('always uses absolute value for amount display', () => {
    // Even if someone passes a negative number, display is absolute
    const result = formatCurrencyExposure(-5000, 'USD', 'liability')
    expect(result).toContain('5,000')
    expect(result).not.toContain('-5,000')
  })

  it('handles zero amount', () => {
    const result = formatCurrencyExposure(0, 'USD', 'asset')
    expect(result).toContain('USD')
    expect(result).toContain('+')
    expect(result).toContain('Varlık')
  })
})

describe('classifyHedgeRecommendation', () => {
  it('returns no_action for null ratio', () => {
    expect(classifyHedgeRecommendation(null, 0)).toBe('no_action')
  })

  it('returns no_action for ratio < 5%', () => {
    expect(classifyHedgeRecommendation(0, 1000)).toBe('no_action')
    expect(classifyHedgeRecommendation(4.9, 1000)).toBe('no_action')
  })

  it('returns natural_hedge when net exposure is near zero (< 1 TRY absolute)', () => {
    expect(classifyHedgeRecommendation(20, 0.5)).toBe('natural_hedge')
    expect(classifyHedgeRecommendation(20, -0.5)).toBe('natural_hedge')
    expect(classifyHedgeRecommendation(20, 0)).toBe('natural_hedge')
  })

  it('returns monitor for ratio 5–14.9% with real exposure', () => {
    expect(classifyHedgeRecommendation(5,    10000)).toBe('monitor')
    expect(classifyHedgeRecommendation(14.9, 10000)).toBe('monitor')
  })

  it('returns forward_contract for ratio 15–49.9% with real exposure', () => {
    expect(classifyHedgeRecommendation(15, 50000)).toBe('forward_contract')
    expect(classifyHedgeRecommendation(30, 50000)).toBe('forward_contract')
    expect(classifyHedgeRecommendation(49.9, 50000)).toBe('forward_contract')
  })

  it('returns urgent_hedge for ratio >= 50%', () => {
    expect(classifyHedgeRecommendation(50,  100000)).toBe('urgent_hedge')
    expect(classifyHedgeRecommendation(100, 100000)).toBe('urgent_hedge')
  })
})
