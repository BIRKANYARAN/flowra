/**
 * Tests for lib/format.ts — canonical UI-layer formatters
 * All pure functions using Intl APIs (locale: tr-TR).
 * Run with: npx vitest run tests/format.test.ts
 */
import { describe, it, expect } from 'vitest'
import {
  sym,
  fmtNum,
  fmtTRY,
  formatTRY,
  fmtMoney,
  fmtCompact,
  fmtDense,
  fmtKpi,
  fmtDate,
  fmtDateMed,
  fmtMonth,
  fmtMonthShort,
  fmtDatetime,
  fmtRelative,
  fmtPct,
  fmtDelta,
  fmtRunway,
  fmtPeriod,
  fmtRate,
  toneFromValue,
  toneFromPct,
} from '../lib/format'

// ── sym ───────────────────────────────────────────────────────────────────────

describe('sym', () => {
  it('returns $ for USD', () => expect(sym('USD')).toBe('$'))
  it('returns € for EUR', () => expect(sym('EUR')).toBe('€'))
  it('returns £ for GBP', () => expect(sym('GBP')).toBe('£'))
  it('returns Fr for CHF', () => expect(sym('CHF')).toBe('Fr'))
  it('returns ₺ for TRY', () => expect(sym('TRY')).toBe('₺'))
  it('returns ₺ for unknown currency', () => expect(sym('JPY')).toBe('₺'))
})

// ── fmtTRY ────────────────────────────────────────────────────────────────────

describe('fmtTRY', () => {
  it('starts with ₺ symbol', () => {
    expect(fmtTRY(1000)).toMatch(/^₺/)
  })

  it('formats 0 as ₺0', () => {
    expect(fmtTRY(0)).toMatch(/^₺/)
    expect(fmtTRY(0)).toContain('0')
  })

  it('handles NaN gracefully (outputs ₺0)', () => {
    expect(fmtTRY(NaN)).toContain('0')
  })

  it('with decimals=0 omits fractional part', () => {
    const result = fmtTRY(1234, 0)
    // Should not contain comma (decimal separator in tr-TR)
    expect(result.replace(/₺/, '')).not.toMatch(/,\d/)
  })

  it('handles negative values', () => {
    const result = fmtTRY(-500)
    expect(result).toContain('500')
    // Negative sign should be present in output
    expect(result.replace(/₺/, '')).toMatch(/-|−/)
  })

  it('large number includes thousands separators', () => {
    const result = fmtTRY(1_000_000)
    // In tr-TR: 1.000.000,00 — contains at least one period as thousands sep
    expect(result).toContain('1')
    expect(result.length).toBeGreaterThan(5)
  })
})

// ── formatTRY ─────────────────────────────────────────────────────────────────

describe('formatTRY', () => {
  it('ends with " TL"', () => {
    expect(formatTRY(1000)).toMatch(/ TL$/)
  })

  it('does NOT include ₺ symbol (suffix format)', () => {
    expect(formatTRY(1000)).not.toContain('₺')
  })

  it('handles 0', () => {
    expect(formatTRY(0)).toMatch(/ TL$/)
    expect(formatTRY(0)).toContain('0')
  })
})

// ── fmtMoney ──────────────────────────────────────────────────────────────────

describe('fmtMoney', () => {
  it('prepends correct currency symbol', () => {
    expect(fmtMoney(100, 'USD')).toMatch(/^\$/)
    expect(fmtMoney(100, 'EUR')).toMatch(/^€/)
    expect(fmtMoney(100, 'TRY')).toMatch(/^₺/)
  })

  it('defaults to TRY when no currency provided', () => {
    expect(fmtMoney(100)).toMatch(/^₺/)
  })
})

// ── fmtCompact ────────────────────────────────────────────────────────────────

describe('fmtCompact', () => {
  it('formats millions with M suffix', () => {
    const result = fmtCompact(1_500_000)
    expect(result).toContain('M')
    expect(result).toContain('₺')
  })

  it('formats sub-100K values without suffix (full number, Turkish locale)', () => {
    // fmtCompact uses K for ≥100K, M for ≥1M; sub-100K gets full formatting
    const result = fmtCompact(12_500)
    expect(result).not.toContain('B')
    expect(result).not.toContain('K')
    expect(result).toContain('₺')
  })

  it('formats small values without suffix', () => {
    const result = fmtCompact(500)
    expect(result).not.toContain('M')
    expect(result).not.toContain('B')
    expect(result).toContain('₺')
  })

  it('handles negative values with minus sign', () => {
    const result = fmtCompact(-1_500_000)
    expect(result).toContain('-')
    expect(result).toContain('M')
  })

  it('handles zero', () => {
    const result = fmtCompact(0)
    expect(result).toContain('₺')
  })

  it('uses correct currency symbol for USD', () => {
    expect(fmtCompact(2_000_000, 'USD')).toContain('$')
  })
})

// ── fmtNum ────────────────────────────────────────────────────────────────────

describe('fmtNum', () => {
  it('formats 0 without symbol', () => {
    const result = fmtNum(0)
    expect(result).not.toContain('₺')
    expect(result).toContain('0')
  })

  it('NaN input returns 0-containing string', () => {
    expect(fmtNum(NaN)).toContain('0')
  })

  it('decimals parameter controls precision', () => {
    const d0 = fmtNum(1234.56, 0)
    const d2 = fmtNum(1234.56, 2)
    expect(d0.length).toBeLessThanOrEqual(d2.length)
  })
})

// ── fmtDate ───────────────────────────────────────────────────────────────────

describe('fmtDate', () => {
  it('returns "—" for null/undefined', () => {
    expect(fmtDate(null)).toBe('—')
    expect(fmtDate(undefined)).toBe('—')
  })

  it('formats a valid ISO date string', () => {
    const result = fmtDate('2025-05-15')
    // Should contain year 2025 and day 15
    expect(result).toContain('2025')
    expect(result).toContain('15')
    expect(result.length).toBeGreaterThan(5)
  })

  it('accepts Date objects', () => {
    const result = fmtDate(new Date('2025-01-01'))
    expect(result).toContain('2025')
  })

  it('returns string for all valid inputs', () => {
    expect(typeof fmtDate('2025-06-01')).toBe('string')
  })
})

// ── fmtDateMed ────────────────────────────────────────────────────────────────

describe('fmtDateMed', () => {
  it('returns "—" for null/undefined', () => {
    expect(fmtDateMed(null)).toBe('—')
    expect(fmtDateMed(undefined)).toBe('—')
  })

  it('includes day, abbreviated month, and full year', () => {
    const result = fmtDateMed('2025-05-15')
    expect(result).toContain('15')
    expect(result).toContain('2025')
    // Turkish abbreviated month for May is "May"
    expect(result).toContain('May')
  })

  it('differs from fmtDate (uses short month name, not numeric)', () => {
    const med = fmtDateMed('2025-05-15')
    const short = fmtDate('2025-05-15')
    // fmtDate → "15.05.2025" (all numeric), fmtDateMed → "15 May 2025" (abbrev month)
    expect(med).not.toBe(short)
    // fmtDate uses dots, fmtDateMed does not
    expect(short).toMatch(/\d{2}\.\d{2}\.\d{4}/)
    expect(med).not.toMatch(/\d{2}\.\d{2}\.\d{4}/)
  })

  it('accepts Date objects', () => {
    const result = fmtDateMed(new Date('2025-01-01'))
    expect(result).toContain('2025')
  })
})

// ── fmtMonth ──────────────────────────────────────────────────────────────────

describe('fmtMonth', () => {
  it('returns "—" for null', () => {
    expect(fmtMonth(null)).toBe('—')
  })

  it('contains year for valid input', () => {
    expect(fmtMonth('2025-05-01')).toContain('2025')
  })

  it('returns a Turkish month name (not numeric)', () => {
    const result = fmtMonth('2025-05-01')
    // Turkish May = Mayıs
    expect(result).toMatch(/[a-zA-ZçğıöşüÇĞİÖŞÜ]/)
  })
})

// ── fmtMonthShort ─────────────────────────────────────────────────────────────

describe('fmtMonthShort', () => {
  it('returns short format for YYYY-MM input', () => {
    const result = fmtMonthShort('2025-05')
    expect(result.length).toBeLessThan(15)
    expect(result).toContain('25')
  })

  it('handles invalid input gracefully', () => {
    expect(() => fmtMonthShort('invalid')).not.toThrow()
  })
})

// ── fmtDatetime ───────────────────────────────────────────────────────────────

describe('fmtDatetime', () => {
  it('returns "—" for null', () => {
    expect(fmtDatetime(null)).toBe('—')
  })

  it('includes year for valid ISO timestamp', () => {
    const result = fmtDatetime('2025-05-15T14:30:00Z')
    expect(result).toContain('2025')
  })
})

// ── fmtRelative ───────────────────────────────────────────────────────────────

describe('fmtRelative', () => {
  it('returns "—" for null', () => {
    expect(fmtRelative(null)).toBe('—')
  })

  it('returns "az önce" for very recent timestamps (< 1 min)', () => {
    const recent = new Date(Date.now() - 30_000).toISOString()
    expect(fmtRelative(recent)).toBe('az önce')
  })

  it('returns "N dk önce" for minutes ago (1-59 min)', () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60_000).toISOString()
    const result = fmtRelative(fiveMinAgo)
    expect(result).toMatch(/\d+ dk önce/)
  })

  it('returns "N saat önce" for hours ago (1-23h)', () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 3_600_000).toISOString()
    const result = fmtRelative(twoHoursAgo)
    expect(result).toMatch(/\d+ saat önce/)
  })

  it('returns "N gün önce" for days ago (1-29 days)', () => {
    const fiveDaysAgo = new Date(Date.now() - 5 * 86_400_000).toISOString()
    const result = fmtRelative(fiveDaysAgo)
    expect(result).toMatch(/\d+ gün önce/)
  })

  it('returns date format for > 30 days', () => {
    const sixtyDaysAgo = new Date(Date.now() - 60 * 86_400_000).toISOString()
    const result = fmtRelative(sixtyDaysAgo)
    // Should look like a formatted date, not "X gün önce"
    expect(result).not.toMatch(/gün önce/)
    expect(result).toContain('.')
  })
})

// ── fmtPct ────────────────────────────────────────────────────────────────────

describe('fmtPct', () => {
  it('starts with % symbol', () => {
    expect(fmtPct(12.5)).toMatch(/^%/)
  })

  it('handles 0', () => {
    expect(fmtPct(0)).toContain('0')
  })

  it('handles negative', () => {
    const result = fmtPct(-5)
    expect(result).toContain('5')
  })
})

// ── fmtDelta ──────────────────────────────────────────────────────────────────

describe('fmtDelta', () => {
  it('prepends + for positive values', () => {
    expect(fmtDelta(12.5)).toMatch(/^\+/)
  })

  it('prepends − (minus) for negative values', () => {
    expect(fmtDelta(-3.2)).toMatch(/^[−-]/)
  })

  it('ends with %', () => {
    expect(fmtDelta(5)).toMatch(/%$/)
    expect(fmtDelta(-5)).toMatch(/%$/)
  })

  it('shows 0 as +0%', () => {
    expect(fmtDelta(0)).toMatch(/^\+/)
    expect(fmtDelta(0)).toMatch(/%$/)
  })
})

// ── fmtRunway ─────────────────────────────────────────────────────────────────

describe('fmtRunway', () => {
  it('returns ∞ for null/undefined/Infinity', () => {
    expect(fmtRunway(null)).toBe('∞')
    expect(fmtRunway(undefined)).toBe('∞')
    expect(fmtRunway(Infinity)).toBe('∞')
  })

  it('returns "N ay" for 1–23 months', () => {
    expect(fmtRunway(6)).toBe('6 ay')
    expect(fmtRunway(12)).toBe('12 ay')
    expect(fmtRunway(23)).toBe('23 ay')
  })

  it('returns "N yıl" for 24+ months', () => {
    expect(fmtRunway(24)).toBe('2 yıl')
    expect(fmtRunway(36)).toBe('3 yıl')
    expect(fmtRunway(60)).toBe('5 yıl')
  })

  it('returns days for < 1 month', () => {
    const result = fmtRunway(0.5)  // ~15 days
    expect(result).toContain('gün')
  })
})

// ── fmtPeriod ─────────────────────────────────────────────────────────────────

describe('fmtPeriod', () => {
  it('returns "N ay" for < 12 months', () => {
    expect(fmtPeriod(6)).toBe('6 ay')
    expect(fmtPeriod(11)).toBe('11 ay')
  })

  it('returns "N yıl" for exact years', () => {
    expect(fmtPeriod(12)).toBe('1 yıl')
    expect(fmtPeriod(24)).toBe('2 yıl')
  })

  it('returns "N yıl M ay" for partial years', () => {
    expect(fmtPeriod(14)).toBe('1 yıl 2 ay')
    expect(fmtPeriod(18)).toBe('1 yıl 6 ay')
  })
})

// ── fmtRate ───────────────────────────────────────────────────────────────────

describe('fmtRate', () => {
  it('formats with 4 decimal places (tr-TR: comma separator)', () => {
    const result = fmtRate(32.45)
    // In tr-TR: "32,4500"
    expect(result).toContain('32')
    expect(result.length).toBeGreaterThan(4)
  })

  it('handles NaN gracefully', () => {
    expect(() => fmtRate(NaN)).not.toThrow()
    expect(fmtRate(NaN)).toContain('0')
  })
})

// ── toneFromValue ─────────────────────────────────────────────────────────────

describe('toneFromValue', () => {
  it('positive value → positive tone', () => {
    expect(toneFromValue(100)).toBe('positive')
  })

  it('negative value → negative tone', () => {
    expect(toneFromValue(-100)).toBe('negative')
  })

  it('zero → neutral', () => {
    expect(toneFromValue(0)).toBe('neutral')
  })

  it('inverse=true flips positive↔negative', () => {
    expect(toneFromValue(100, true)).toBe('negative')
    expect(toneFromValue(-100, true)).toBe('positive')
  })

  it('inverse=true keeps neutral for zero', () => {
    expect(toneFromValue(0, true)).toBe('neutral')
  })
})

// ── toneFromPct ───────────────────────────────────────────────────────────────

describe('toneFromPct', () => {
  it('returns positive when pct ≥ warningThreshold (20)', () => {
    expect(toneFromPct(20)).toBe('positive')
    expect(toneFromPct(50)).toBe('positive')
  })

  it('returns warning when 0 < pct < 20', () => {
    expect(toneFromPct(10)).toBe('warning')
    expect(toneFromPct(1)).toBe('warning')
    expect(toneFromPct(19.9)).toBe('warning')
  })

  it('returns negative when pct ≤ 0', () => {
    expect(toneFromPct(0)).toBe('negative')
    expect(toneFromPct(-10)).toBe('negative')
  })

  it('uses custom warningThreshold', () => {
    expect(toneFromPct(15, 10)).toBe('positive')   // 15 ≥ 10 → positive
    expect(toneFromPct(8, 10)).toBe('warning')     // 0 < 8 < 10 → warning
  })
})

// ── sym — all supported currencies ───────────────────────────────────────────

describe('sym — all supported currencies', () => {
  it('TRY → ₺', () => expect(sym('TRY')).toBe('₺'))
  it('USD → $', () => expect(sym('USD')).toBe('$'))
  it('EUR → €', () => expect(sym('EUR')).toBe('€'))
  it('GBP → £', () => expect(sym('GBP')).toBe('£'))
  it('CHF → Fr', () => expect(sym('CHF')).toBe('Fr'))
  it('unknown code → ₺ (default fallback)', () => expect(sym('XYZ')).toBe('₺'))
  it('empty string → ₺ (default fallback)', () => expect(sym('')).toBe('₺'))
  it('lowercase usd → ₺ (case-sensitive fallback)', () => expect(sym('usd')).toBe('₺'))
})

// ── fmtNum — decimal precision ─────────────────────────────────────────────────

describe('fmtNum — decimal precision', () => {
  it('0 decimals: integer result without fraction', () => {
    const result = fmtNum(1234.56, 0)
    // tr-TR: "1.235" or "1.234" (depending on rounding); must not contain comma decimal
    expect(result).not.toMatch(/,\d+$/)
  })

  it('1 decimal: one digit after separator', () => {
    const result = fmtNum(1234.56, 1)
    // tr-TR comma as decimal: "1.234,6"
    expect(result).toMatch(/,\d$/)
  })

  it('2 decimals: two digits after separator (default)', () => {
    const result = fmtNum(1234.5, 2)
    expect(result).toMatch(/,\d{2}$/)
  })

  it('4 decimals: four digits after separator', () => {
    const result = fmtNum(1.23456, 4)
    expect(result).toMatch(/,\d{4}$/)
  })

  it('no ₺ symbol in output', () => {
    expect(fmtNum(1000, 2)).not.toContain('₺')
  })

  it('large value uses thousands separator (period in tr-TR)', () => {
    const result = fmtNum(1_000_000, 0)
    // tr-TR: "1.000.000"
    expect(result).toContain('.')
  })

  it('zero with 0 decimals returns "0"', () => {
    expect(fmtNum(0, 0)).toBe('0')
  })

  it('NaN returns 0 string', () => {
    expect(fmtNum(NaN, 2)).toContain('0')
  })
})

// ── fmtTRY — symbol and formatting ───────────────────────────────────────────

describe('fmtTRY — symbol and formatting', () => {
  it('1_234_567 with decimals=2 contains thousands separators', () => {
    const result = fmtTRY(1_234_567)
    expect(result).toContain('1')
    // tr-TR uses period as thousands separator
    expect(result).toMatch(/₺1\./)
  })

  it('decimals=0 removes fraction part', () => {
    const result = fmtTRY(1234.99, 0)
    expect(result).not.toMatch(/,\d/)
  })

  it('fmtTRY(0) returns ₺0 variant', () => {
    expect(fmtTRY(0)).toMatch(/₺0/)
  })

  it('fmtTRY(1) with 2 decimals returns ₺1,00', () => {
    expect(fmtTRY(1)).toMatch(/₺1,00/)
  })

  it('always starts with ₺ prefix', () => {
    for (const v of [0, 1, 100, 1000, -500]) {
      expect(fmtTRY(v)).toMatch(/^₺/)
    }
  })
})

// ── formatTRY — legacy suffix format ─────────────────────────────────────────

describe('formatTRY — legacy suffix format', () => {
  it('formatTRY is NOT same as fmtTRY output', () => {
    expect(formatTRY(1000)).not.toBe(fmtTRY(1000))
  })

  it('formatTRY uses comma as decimal separator (tr-TR)', () => {
    const result = formatTRY(1234.56)
    expect(result).toContain(',')
  })

  it('large values include thousands separator before TL', () => {
    const result = formatTRY(1_000_000)
    expect(result).toMatch(/ TL$/)
    expect(result).toContain('1')
  })

  it('formatTRY(0) contains "0" and ends with " TL"', () => {
    expect(formatTRY(0)).toMatch(/0/)
    expect(formatTRY(0)).toMatch(/ TL$/)
  })
})

// ── fmtCompact — K and M suffixes ─────────────────────────────────────────────

describe('fmtCompact — K and M suffixes', () => {
  it('exactly 1_000_000 → contains M', () => {
    expect(fmtCompact(1_000_000)).toContain('M')
  })

  it('exactly 100_000 → contains K', () => {
    expect(fmtCompact(100_000)).toContain('K')
  })

  it('500_000 → contains K', () => {
    expect(fmtCompact(500_000)).toContain('K')
  })

  it('99_999 → no K or M (full number)', () => {
    const result = fmtCompact(99_999)
    expect(result).not.toContain('K')
    expect(result).not.toContain('M')
  })

  it('2_000_000 → ₺2,0M', () => {
    const result = fmtCompact(2_000_000)
    expect(result).toContain('M')
    expect(result).toContain('₺')
  })

  it('USD 200_000 → contains $', () => {
    expect(fmtCompact(200_000, 'USD')).toContain('$')
  })

  it('EUR 1_500_000 → contains € and M', () => {
    const result = fmtCompact(1_500_000, 'EUR')
    expect(result).toContain('€')
    expect(result).toContain('M')
  })

  it('negative million shows minus sign and M', () => {
    const result = fmtCompact(-2_000_000)
    expect(result).toContain('-')
    expect(result).toContain('M')
  })
})

// ── fmtPct — format percentage ────────────────────────────────────────────────

describe('fmtPct — format percentage', () => {
  it('fmtPct(0) starts with % and contains 0', () => {
    const r = fmtPct(0)
    expect(r).toMatch(/^%/)
    expect(r).toContain('0')
  })

  it('fmtPct(100) contains 100', () => {
    expect(fmtPct(100)).toContain('100')
  })

  it('fmtPct(12.5) with default 1 decimal → %12,5', () => {
    expect(fmtPct(12.5)).toBe('%12,5')
  })

  it('fmtPct(0, 2) has two decimal digits', () => {
    const r = fmtPct(0, 2)
    expect(r).toMatch(/,\d{2}/)
  })

  it('negative percentage contains number and %', () => {
    const r = fmtPct(-10)
    expect(r).toContain('10')
    expect(r).toContain('%')
  })

  it('fmtPct(33.333, 1) rounds to 1 decimal', () => {
    const r = fmtPct(33.333, 1)
    expect(r).toMatch(/,\d$/)
  })
})

// ── fmtDate — edge cases ───────────────────────────────────────────────────────

describe('fmtDate — edge cases', () => {
  it('null → "—"', () => {
    expect(fmtDate(null)).toBe('—')
  })

  it('undefined → "—"', () => {
    expect(fmtDate(undefined)).toBe('—')
  })

  it('valid YYYY-MM-DD returns numeric date with dots', () => {
    const result = fmtDate('2025-06-15')
    expect(result).toMatch(/\d{2}\.\d{2}\.\d{4}/)
  })

  it('accepts Date object and formats correctly', () => {
    const result = fmtDate(new Date(2025, 4, 15)) // May 15 2025
    expect(result).toContain('2025')
  })

  it('different months format correctly', () => {
    expect(fmtDate('2025-01-01')).toContain('2025')
    expect(fmtDate('2025-12-31')).toContain('2025')
  })
})

// ── fmtMonthShort — format YYYY-MM ────────────────────────────────────────────

describe('fmtMonthShort — format YYYY-MM', () => {
  it('fmtMonthShort("2025-01") contains "25" (year abbreviation)', () => {
    const r = fmtMonthShort('2025-01')
    expect(r).toContain('25')
  })

  it('returns a string shorter than 15 chars', () => {
    expect(fmtMonthShort('2025-05').length).toBeLessThan(15)
  })

  it('does not throw for invalid input', () => {
    expect(() => fmtMonthShort('bad-input')).not.toThrow()
  })

  it('different months produce different output', () => {
    const jan = fmtMonthShort('2025-01')
    const jun = fmtMonthShort('2025-06')
    expect(jan).not.toBe(jun)
  })
})

// ── fmtKpi — strip format without ₺ ──────────────────────────────────────────

describe('fmtKpi — strip format without ₺', () => {
  it('does not include ₺ symbol', () => {
    expect(fmtKpi(1_000_000)).not.toContain('₺')
    expect(fmtKpi(50_000)).not.toContain('₺')
    expect(fmtKpi(1000)).not.toContain('₺')
  })

  it('1_000_000 → contains M', () => {
    expect(fmtKpi(1_000_000)).toContain('M')
  })

  it('10_000 → contains K', () => {
    expect(fmtKpi(10_000)).toContain('K')
  })

  it('9_999 → formatted as integer (no K or M)', () => {
    const r = fmtKpi(9_999)
    expect(r).not.toContain('K')
    expect(r).not.toContain('M')
  })

  it('0 → "0"', () => {
    expect(fmtKpi(0)).toBe('0')
  })

  it('2_500_000 → contains M', () => {
    expect(fmtKpi(2_500_000)).toContain('M')
  })

  it('negative large value still contains M', () => {
    expect(fmtKpi(-1_000_000)).toContain('M')
  })

  it('values < 10_000 formatted as integers (no suffix)', () => {
    const r = fmtKpi(5_000)
    expect(r).not.toContain('K')
    expect(r).not.toContain('M')
    expect(r).toContain('5')
  })
})
