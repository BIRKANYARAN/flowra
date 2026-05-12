/**
 * FAZ 10 — Vergi Merkezi: business-logic unit tests
 *
 * Tests the pure analytics functions in tax/page.tsx:
 *   1. kdvPositionLabel()     — classify net KDV as ödenecek/devredilen/sıfır
 *   2. geciciStatus()         — classify a gecici due date vs today
 *   3. yearEndKvRemaining()   — year-end KV after subtracting paid gecici
 *   4. annualizeMatrah()      — project full-year matrah from YTD
 *   5. nextGeciciDue()        — find nearest upcoming gecici installment
 *
 * All functions are pure (no DB, no side effects).
 * Run with: npx vitest run tests/tax-center.test.ts
 */

import { describe, it, expect } from 'vitest'

// ─────────────────────────────────────────────────────────────────────────────
// Mirror of pure functions from tax/page.tsx
// ─────────────────────────────────────────────────────────────────────────────

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

function kdvPositionLabel(netVat: number): { label: string; color: string; bg: string } {
  if (netVat > 0)  return { label: '⬆ Ödenecek', color: 'text-orange-700', bg: 'bg-orange-50 border-orange-200' }
  if (netVat < 0)  return { label: '⬇ Devredilen', color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200' }
  return { label: 'Sıfır', color: 'text-gray-500', bg: 'bg-gray-50 border-gray-200' }
}

function geciciStatus(dueDate: string, today: string): 'overdue' | 'urgent' | 'upcoming' | 'future' | 'none' {
  if (!dueDate) return 'none'
  if (dueDate < today)                       return 'overdue'
  if (dueDate <= addDays(today, 14))         return 'urgent'
  if (dueDate <= addDays(today, 45))         return 'upcoming'
  return 'future'
}

function yearEndKvRemaining(ytdCorporateTax: number, totalGeciciPaid: number): number {
  return Math.max(0, ytdCorporateTax - totalGeciciPaid)
}

function annualizeMatrah(ytdMatrah: number, monthsElapsed: number): number {
  if (monthsElapsed <= 0) return 0
  return (ytdMatrah / monthsElapsed) * 12
}

type QuarterStub = {
  label: string
  gecici_due_date: string
  gecici_vergi: number
}
function nextGeciciDue(quarters: QuarterStub[], today: string): { label: string; date: string; amount: number } | null {
  const upcoming = quarters
    .filter(q => q.gecici_due_date && q.gecici_due_date >= today && q.gecici_vergi > 0)
    .sort((a, b) => a.gecici_due_date.localeCompare(b.gecici_due_date))
  if (!upcoming.length) return null
  const q = upcoming[0]
  return { label: q.label, date: q.gecici_due_date, amount: q.gecici_vergi }
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. kdvPositionLabel
// ─────────────────────────────────────────────────────────────────────────────

describe('kdvPositionLabel()', () => {
  it('positive net_vat → ödenecek (orange)', () => {
    const result = kdvPositionLabel(5000)
    expect(result.label).toContain('Ödenecek')
    expect(result.color).toContain('orange')
  })

  it('negative net_vat → devredilen (emerald)', () => {
    const result = kdvPositionLabel(-2000)
    expect(result.label).toContain('Devredilen')
    expect(result.color).toContain('emerald')
  })

  it('zero net_vat → Sıfır (gray)', () => {
    const result = kdvPositionLabel(0)
    expect(result.label).toBe('Sıfır')
    expect(result.color).toContain('gray')
  })

  it('small positive (e.g. ₺1) → still ödenecek', () => {
    expect(kdvPositionLabel(1).label).toContain('Ödenecek')
  })

  it('small negative (e.g. -₺1) → still devredilen', () => {
    expect(kdvPositionLabel(-1).label).toContain('Devredilen')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 2. geciciStatus
// ─────────────────────────────────────────────────────────────────────────────

describe('geciciStatus()', () => {
  const TODAY = '2024-05-10'

  it('past due date → overdue', () => {
    expect(geciciStatus('2024-04-30', TODAY)).toBe('overdue')
  })

  it('due yesterday → overdue', () => {
    expect(geciciStatus('2024-05-09', TODAY)).toBe('overdue')
  })

  it('due today → urgent (today is still upcoming boundary)', () => {
    // today <= addDays(today, 14), so today is urgent
    expect(geciciStatus(TODAY, TODAY)).toBe('urgent')
  })

  it('due in 14 days → urgent', () => {
    expect(geciciStatus(addDays(TODAY, 14), TODAY)).toBe('urgent')
  })

  it('due in 15 days → upcoming', () => {
    expect(geciciStatus(addDays(TODAY, 15), TODAY)).toBe('upcoming')
  })

  it('due in 45 days → upcoming boundary', () => {
    expect(geciciStatus(addDays(TODAY, 45), TODAY)).toBe('upcoming')
  })

  it('due in 46 days → future', () => {
    expect(geciciStatus(addDays(TODAY, 46), TODAY)).toBe('future')
  })

  it('empty string → none', () => {
    expect(geciciStatus('', TODAY)).toBe('none')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 3. yearEndKvRemaining
// ─────────────────────────────────────────────────────────────────────────────

describe('yearEndKvRemaining()', () => {
  it('gecici fully covers KV → 0 remaining', () => {
    expect(yearEndKvRemaining(50000, 50000)).toBe(0)
  })

  it('gecici overpaid (refund territory) → 0 (not negative)', () => {
    expect(yearEndKvRemaining(30000, 40000)).toBe(0)
  })

  it('partial gecici paid → remaining is difference', () => {
    expect(yearEndKvRemaining(100000, 60000)).toBe(40000)
  })

  it('nothing paid → remaining equals full KV', () => {
    expect(yearEndKvRemaining(75000, 0)).toBe(75000)
  })

  it('zero KV → 0 remaining regardless of gecici', () => {
    expect(yearEndKvRemaining(0, 5000)).toBe(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 4. annualizeMatrah
// ─────────────────────────────────────────────────────────────────────────────

describe('annualizeMatrah()', () => {
  it('6 months elapsed → doubles the YTD matrah', () => {
    expect(annualizeMatrah(500_000, 6)).toBeCloseTo(1_000_000, 0)
  })

  it('12 months elapsed → returns as-is', () => {
    expect(annualizeMatrah(1_200_000, 12)).toBeCloseTo(1_200_000, 0)
  })

  it('1 month elapsed → multiplies by 12', () => {
    expect(annualizeMatrah(100_000, 1)).toBeCloseTo(1_200_000, 0)
  })

  it('0 months elapsed → returns 0 (guards divide-by-zero)', () => {
    expect(annualizeMatrah(100_000, 0)).toBe(0)
  })

  it('negative months → returns 0', () => {
    expect(annualizeMatrah(100_000, -1)).toBe(0)
  })

  it('zero matrah → returns 0 regardless of months', () => {
    expect(annualizeMatrah(0, 9)).toBe(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 5. nextGeciciDue
// ─────────────────────────────────────────────────────────────────────────────

describe('nextGeciciDue()', () => {
  it('returns null for empty quarters', () => {
    expect(nextGeciciDue([], '2024-05-01')).toBeNull()
  })

  it('picks the earliest upcoming quarter', () => {
    const quarters = [
      { label: 'Q1 2024', gecici_due_date: '2024-05-17', gecici_vergi: 10000 },
      { label: 'Q2 2024', gecici_due_date: '2024-08-17', gecici_vergi: 12000 },
      { label: 'Q3 2024', gecici_due_date: '2024-11-17', gecici_vergi: 11000 },
    ]
    const result = nextGeciciDue(quarters, '2024-05-10')
    expect(result?.label).toBe('Q1 2024')
    expect(result?.date).toBe('2024-05-17')
    expect(result?.amount).toBe(10000)
  })

  it('skips overdue quarters (before today)', () => {
    const quarters = [
      { label: 'Q1 2024', gecici_due_date: '2024-05-17', gecici_vergi: 10000 },
      { label: 'Q2 2024', gecici_due_date: '2024-08-17', gecici_vergi: 12000 },
    ]
    const result = nextGeciciDue(quarters, '2024-06-01')
    expect(result?.label).toBe('Q2 2024')
  })

  it('skips quarters with gecici_vergi = 0 (no data yet)', () => {
    const quarters = [
      { label: 'Q2 2024', gecici_due_date: '2024-08-17', gecici_vergi: 0 },
      { label: 'Q3 2024', gecici_due_date: '2024-11-17', gecici_vergi: 15000 },
    ]
    const result = nextGeciciDue(quarters, '2024-07-01')
    expect(result?.label).toBe('Q3 2024')
  })

  it('returns null when all quarters are past', () => {
    const quarters = [
      { label: 'Q1 2024', gecici_due_date: '2024-05-17', gecici_vergi: 10000 },
    ]
    expect(nextGeciciDue(quarters, '2024-12-01')).toBeNull()
  })

  it('includes same-day due date (today is still upcoming)', () => {
    const quarters = [
      { label: 'Q1 2024', gecici_due_date: '2024-05-17', gecici_vergi: 8000 },
    ]
    const result = nextGeciciDue(quarters, '2024-05-17')
    expect(result?.label).toBe('Q1 2024')
  })
})
