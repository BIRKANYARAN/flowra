/**
 * Alert Settings Service — pure function unit tests
 *
 * Tests mergeWithDefaults, validateThreshold, and countActiveRules.
 * No DB or network calls — pure functions only.
 *
 * 25 tests total.
 */

import { describe, it, expect } from 'vitest'
import {
  DEFAULT_THRESHOLDS,
  mergeWithDefaults,
  validateThreshold,
  countActiveRules,
} from '../lib/services/settings/alert-settings.service'
import type { AlertThreshold } from '../lib/services/settings/alert-settings.service'

// ── helpers ────────────────────────────────────────────────────────────────────

function makeThreshold(overrides: Partial<AlertThreshold>): AlertThreshold {
  return {
    rule_type:       overrides.rule_type       ?? 'TEST_RULE',
    threshold_value: overrides.threshold_value ?? 30,
    is_active:       overrides.is_active       ?? true,
    label:           overrides.label           ?? 'Test Kuralı',
    description:     overrides.description     ?? 'Test açıklaması',
  }
}

// ── DEFAULT_THRESHOLDS ─────────────────────────────────────────────────────────

describe('DEFAULT_THRESHOLDS catalogue', () => {
  it('1. has exactly 7 default thresholds', () => {
    expect(DEFAULT_THRESHOLDS).toHaveLength(7)
  })

  it('2. all defaults have required fields', () => {
    for (const t of DEFAULT_THRESHOLDS) {
      expect(t.rule_type).toBeTruthy()
      expect(typeof t.threshold_value).toBe('number')
      expect(typeof t.is_active).toBe('boolean')
      expect(t.label).toBeTruthy()
      expect(t.description).toBeTruthy()
    }
  })

  it('3. all default thresholds are active', () => {
    expect(DEFAULT_THRESHOLDS.every(t => t.is_active)).toBe(true)
  })

  it('4. rule_types are unique', () => {
    const types = DEFAULT_THRESHOLDS.map(t => t.rule_type)
    expect(new Set(types).size).toBe(types.length)
  })

  it('5. RECEIVABLE_30 has threshold_value 30', () => {
    const t = DEFAULT_THRESHOLDS.find(t => t.rule_type === 'RECEIVABLE_30')
    expect(t).toBeDefined()
    expect(t!.threshold_value).toBe(30)
  })

  it('6. DSR_HIGH has threshold_value 70', () => {
    const t = DEFAULT_THRESHOLDS.find(t => t.rule_type === 'DSR_HIGH')
    expect(t).toBeDefined()
    expect(t!.threshold_value).toBe(70)
  })

  it('7. all threshold_values are > 0', () => {
    expect(DEFAULT_THRESHOLDS.every(t => t.threshold_value > 0)).toBe(true)
  })
})

// ── mergeWithDefaults ──────────────────────────────────────────────────────────

describe('mergeWithDefaults', () => {
  it('8. empty stored returns all defaults', () => {
    const result = mergeWithDefaults([], DEFAULT_THRESHOLDS)
    expect(result).toHaveLength(DEFAULT_THRESHOLDS.length)
    expect(result).toEqual(DEFAULT_THRESHOLDS)
  })

  it('9. stored value overrides default threshold_value when rule_type matches', () => {
    const stored: Partial<AlertThreshold>[] = [
      { rule_type: 'RECEIVABLE_30', threshold_value: 45 },
    ]
    const result = mergeWithDefaults(stored, DEFAULT_THRESHOLDS)
    const r30 = result.find(r => r.rule_type === 'RECEIVABLE_30')!
    expect(r30.threshold_value).toBe(45)
  })

  it('10. non-matching stored entries do not affect other defaults', () => {
    const stored: Partial<AlertThreshold>[] = [
      { rule_type: 'RECEIVABLE_30', threshold_value: 45 },
    ]
    const result = mergeWithDefaults(stored, DEFAULT_THRESHOLDS)
    const r60 = result.find(r => r.rule_type === 'RECEIVABLE_60')!
    expect(r60.threshold_value).toBe(60) // unchanged
  })

  it('11. stored is_active false overrides default true', () => {
    const stored: Partial<AlertThreshold>[] = [
      { rule_type: 'DSR_HIGH', is_active: false },
    ]
    const result = mergeWithDefaults(stored, DEFAULT_THRESHOLDS)
    const dsr = result.find(r => r.rule_type === 'DSR_HIGH')!
    expect(dsr.is_active).toBe(false)
  })

  it('12. result length always equals defaults length', () => {
    const stored: Partial<AlertThreshold>[] = [
      { rule_type: 'UNKNOWN_RULE', threshold_value: 999 }, // not in defaults
    ]
    const result = mergeWithDefaults(stored, DEFAULT_THRESHOLDS)
    expect(result).toHaveLength(DEFAULT_THRESHOLDS.length)
  })

  it('13. stored entry with unknown rule_type is silently ignored', () => {
    const stored: Partial<AlertThreshold>[] = [
      { rule_type: 'NONEXISTENT', threshold_value: 500 },
    ]
    const result = mergeWithDefaults(stored, DEFAULT_THRESHOLDS)
    expect(result.find(r => r.rule_type === 'NONEXISTENT')).toBeUndefined()
  })

  it('14. multiple stored entries override multiple defaults', () => {
    const stored: Partial<AlertThreshold>[] = [
      { rule_type: 'RECEIVABLE_30', threshold_value: 35 },
      { rule_type: 'CASH_RUNWAY_90', threshold_value: 120 },
      { rule_type: 'PARTNER_BURDEN', threshold_value: 25 },
    ]
    const result = mergeWithDefaults(stored, DEFAULT_THRESHOLDS)
    expect(result.find(r => r.rule_type === 'RECEIVABLE_30')!.threshold_value).toBe(35)
    expect(result.find(r => r.rule_type === 'CASH_RUNWAY_90')!.threshold_value).toBe(120)
    expect(result.find(r => r.rule_type === 'PARTNER_BURDEN')!.threshold_value).toBe(25)
  })

  it('15. stored label overrides default label', () => {
    const stored: Partial<AlertThreshold>[] = [
      { rule_type: 'PERIOD_LATE', label: 'Özelleştirilmiş Etiket' },
    ]
    const result = mergeWithDefaults(stored, DEFAULT_THRESHOLDS)
    const period = result.find(r => r.rule_type === 'PERIOD_LATE')!
    expect(period.label).toBe('Özelleştirilmiş Etiket')
  })

  it('16. unset stored fields fall back to defaults', () => {
    // stored only sets threshold_value; label/description should come from default
    const stored: Partial<AlertThreshold>[] = [
      { rule_type: 'RECEIVABLE_60', threshold_value: 75 },
    ]
    const result = mergeWithDefaults(stored, DEFAULT_THRESHOLDS)
    const r60 = result.find(r => r.rule_type === 'RECEIVABLE_60')!
    const def  = DEFAULT_THRESHOLDS.find(t => t.rule_type === 'RECEIVABLE_60')!
    expect(r60.label).toBe(def.label)
    expect(r60.description).toBe(def.description)
    expect(r60.threshold_value).toBe(75)
  })

  it('17. works with custom defaults array (not the exported constant)', () => {
    const customDefaults: AlertThreshold[] = [
      makeThreshold({ rule_type: 'CUSTOM_A', threshold_value: 10 }),
      makeThreshold({ rule_type: 'CUSTOM_B', threshold_value: 20 }),
    ]
    const stored: Partial<AlertThreshold>[] = [
      { rule_type: 'CUSTOM_A', threshold_value: 15 },
    ]
    const result = mergeWithDefaults(stored, customDefaults)
    expect(result[0].threshold_value).toBe(15)
    expect(result[1].threshold_value).toBe(20)
  })
})

// ── validateThreshold ──────────────────────────────────────────────────────────

describe('validateThreshold', () => {
  it('18. rejects value of 0', () => {
    const result = validateThreshold('RECEIVABLE_30', 0)
    expect(result.valid).toBe(false)
    expect(result.error).toBeTruthy()
  })

  it('19. rejects negative values', () => {
    const result = validateThreshold('CASH_RUNWAY_30', -1)
    expect(result.valid).toBe(false)
    expect(result.error).toBeTruthy()
  })

  it('20. rejects value greater than 365', () => {
    const result = validateThreshold('RECEIVABLE_60', 366)
    expect(result.valid).toBe(false)
    expect(result.error).toBeTruthy()
  })

  it('21. accepts value of 1 (minimum valid)', () => {
    const result = validateThreshold('DSR_HIGH', 1)
    expect(result.valid).toBe(true)
    expect(result.error).toBeUndefined()
  })

  it('22. accepts value of 365 (maximum valid)', () => {
    const result = validateThreshold('CASH_RUNWAY_90', 365)
    expect(result.valid).toBe(true)
    expect(result.error).toBeUndefined()
  })

  it('23. accepts typical mid-range values', () => {
    expect(validateThreshold('RECEIVABLE_30', 30).valid).toBe(true)
    expect(validateThreshold('CASH_RUNWAY_90', 90).valid).toBe(true)
    expect(validateThreshold('DSR_HIGH', 70).valid).toBe(true)
    expect(validateThreshold('PERIOD_LATE', 10).valid).toBe(true)
  })

  it('24. error message mentions the rule_type', () => {
    const result = validateThreshold('MY_RULE', 0)
    expect(result.error).toContain('MY_RULE')
  })

  it('25. rejects NaN', () => {
    const result = validateThreshold('RECEIVABLE_30', NaN)
    expect(result.valid).toBe(false)
  })
})

// ── countActiveRules ───────────────────────────────────────────────────────────

describe('countActiveRules', () => {
  it('26. returns 0 for empty array', () => {
    expect(countActiveRules([])).toBe(0)
  })

  it('27. counts all active when all are active', () => {
    expect(countActiveRules(DEFAULT_THRESHOLDS)).toBe(7)
  })

  it('28. returns 0 when all are inactive', () => {
    const inactive = DEFAULT_THRESHOLDS.map(t => ({ ...t, is_active: false }))
    expect(countActiveRules(inactive)).toBe(0)
  })

  it('29. correctly counts a mixed set', () => {
    const mixed: AlertThreshold[] = [
      makeThreshold({ rule_type: 'A', is_active: true  }),
      makeThreshold({ rule_type: 'B', is_active: false }),
      makeThreshold({ rule_type: 'C', is_active: true  }),
      makeThreshold({ rule_type: 'D', is_active: false }),
      makeThreshold({ rule_type: 'E', is_active: true  }),
    ]
    expect(countActiveRules(mixed)).toBe(3)
  })

  it('30. returns 1 for a single active rule', () => {
    const single = [makeThreshold({ rule_type: 'SOLO', is_active: true })]
    expect(countActiveRules(single)).toBe(1)
  })
})
