/**
 * lib/services/finance/tax-calendar.service — unit tests
 *
 * Covers all pure exported functions.
 * Run: npx vitest run tests/finance-tax-calendar.test.ts
 */

import { describe, it, expect } from 'vitest'
import {
  computeKdvDueDate,
  computeMuhtasarDueDate,
  computeGeciciVergiDueDate,
  computeKurumlarVergiDueDate,
  computeSgkDueDate,
  classifyObligationStatus,
  computeDaysUntilDue,
  estimateKdvPayable,
  estimateGeciciVergi,
  estimateSgkMonthly,
  generateObligationCalendar,
  filterObligationsByStatus,
  computeUpcomingTaxLiability,
  getNextDueObligation,
} from '../lib/services/finance/tax-calendar.service'

// ─────────────────────────────────────────────────────────────────────────────
// 1. computeKdvDueDate
// ─────────────────────────────────────────────────────────────────────────────

describe('computeKdvDueDate()', () => {
  it('December wraps to January of next year', () => {
    expect(computeKdvDueDate('2025-12')).toBe('2026-01-26')
  })

  it('January → February 26', () => {
    expect(computeKdvDueDate('2025-01')).toBe('2025-02-26')
  })

  it('November → December 26', () => {
    expect(computeKdvDueDate('2025-11')).toBe('2025-12-26')
  })

  it('June → July 26', () => {
    expect(computeKdvDueDate('2025-06')).toBe('2025-07-26')
  })

  it('March → April 26', () => {
    expect(computeKdvDueDate('2026-03')).toBe('2026-04-26')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 2. computeMuhtasarDueDate
// ─────────────────────────────────────────────────────────────────────────────

describe('computeMuhtasarDueDate()', () => {
  it('same rule as KDV: 26th of following month', () => {
    expect(computeMuhtasarDueDate('2025-12')).toBe('2026-01-26')
  })

  it('January → February 26', () => {
    expect(computeMuhtasarDueDate('2025-01')).toBe('2025-02-26')
  })

  it('June → July 26', () => {
    expect(computeMuhtasarDueDate('2026-06')).toBe('2026-07-26')
  })

  it('returns same value as computeKdvDueDate', () => {
    const months = ['2025-03', '2025-07', '2025-12', '2026-02']
    for (const m of months) {
      expect(computeMuhtasarDueDate(m)).toBe(computeKdvDueDate(m))
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 3. computeGeciciVergiDueDate
// ─────────────────────────────────────────────────────────────────────────────

describe('computeGeciciVergiDueDate()', () => {
  it('Q1 2025 → 2025-05-17', () => {
    expect(computeGeciciVergiDueDate(2025, 1)).toBe('2025-05-17')
  })

  it('Q2 2025 → 2025-08-17', () => {
    expect(computeGeciciVergiDueDate(2025, 2)).toBe('2025-08-17')
  })

  it('Q3 2025 → 2025-11-17', () => {
    expect(computeGeciciVergiDueDate(2025, 3)).toBe('2025-11-17')
  })

  it('Q4 2025 wraps to next year → 2026-02-17', () => {
    expect(computeGeciciVergiDueDate(2025, 4)).toBe('2026-02-17')
  })

  it('Q1 2026 → 2026-05-17', () => {
    expect(computeGeciciVergiDueDate(2026, 1)).toBe('2026-05-17')
  })

  it('Q4 2026 → 2027-02-17', () => {
    expect(computeGeciciVergiDueDate(2026, 4)).toBe('2027-02-17')
  })

  it('Q2 2030 → 2030-08-17', () => {
    expect(computeGeciciVergiDueDate(2030, 2)).toBe('2030-08-17')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 4. computeKurumlarVergiDueDate
// ─────────────────────────────────────────────────────────────────────────────

describe('computeKurumlarVergiDueDate()', () => {
  it('tax year 2024 → 2025-04-30', () => {
    expect(computeKurumlarVergiDueDate(2024)).toBe('2025-04-30')
  })

  it('tax year 2025 → 2026-04-30', () => {
    expect(computeKurumlarVergiDueDate(2025)).toBe('2026-04-30')
  })

  it('tax year 2026 → 2027-04-30', () => {
    expect(computeKurumlarVergiDueDate(2026)).toBe('2027-04-30')
  })

  it('always returns April 30 of year+1', () => {
    for (let y = 2020; y <= 2030; y++) {
      expect(computeKurumlarVergiDueDate(y)).toBe(`${y + 1}-04-30`)
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 5. computeSgkDueDate
// ─────────────────────────────────────────────────────────────────────────────

describe('computeSgkDueDate()', () => {
  it('November 2025 → December 31 (last day of Dec)', () => {
    expect(computeSgkDueDate('2025-11')).toBe('2025-12-31')
  })

  it('February 2025 → March 31 (last day of March)', () => {
    expect(computeSgkDueDate('2025-02')).toBe('2025-03-31')
  })

  it('December wraps to January 31 of next year', () => {
    expect(computeSgkDueDate('2025-12')).toBe('2026-01-31')
  })

  it('January → February 28 (non-leap year)', () => {
    expect(computeSgkDueDate('2025-01')).toBe('2025-02-28')
  })

  it('January → February 29 (leap year 2024)', () => {
    expect(computeSgkDueDate('2024-01')).toBe('2024-02-29')
  })

  it('April → May 31', () => {
    expect(computeSgkDueDate('2025-04')).toBe('2025-05-31')
  })

  it('June → July 31', () => {
    expect(computeSgkDueDate('2025-06')).toBe('2025-07-31')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 6. classifyObligationStatus
// ─────────────────────────────────────────────────────────────────────────────

describe('classifyObligationStatus()', () => {
  it('returns paid when isPaid=true regardless of dates', () => {
    expect(classifyObligationStatus('2025-01-01', '2026-01-01', true)).toBe('paid')
  })

  it('returns overdue when today is past due date', () => {
    expect(classifyObligationStatus('2025-05-26', '2025-06-01', false)).toBe('overdue')
  })

  it('returns due_soon when 0 days away (today)', () => {
    expect(classifyObligationStatus('2025-06-01', '2025-06-01', false)).toBe('due_soon')
  })

  it('returns due_soon when 1 day away', () => {
    expect(classifyObligationStatus('2025-06-02', '2025-06-01', false)).toBe('due_soon')
  })

  it('returns due_soon when exactly 14 days away', () => {
    expect(classifyObligationStatus('2025-06-15', '2025-06-01', false)).toBe('due_soon')
  })

  it('returns upcoming when 15 days away', () => {
    expect(classifyObligationStatus('2025-06-16', '2025-06-01', false)).toBe('upcoming')
  })

  it('returns upcoming when 60 days away', () => {
    expect(classifyObligationStatus('2025-07-31', '2025-06-01', false)).toBe('upcoming')
  })

  it('overdue takes precedence over paid=false', () => {
    expect(classifyObligationStatus('2020-01-01', '2025-01-01', false)).toBe('overdue')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 7. computeDaysUntilDue
// ─────────────────────────────────────────────────────────────────────────────

describe('computeDaysUntilDue()', () => {
  it('positive when due date is in the future', () => {
    expect(computeDaysUntilDue('2025-06-10', '2025-06-01')).toBe(9)
  })

  it('negative when due date is in the past', () => {
    expect(computeDaysUntilDue('2025-05-20', '2025-06-01')).toBe(-12)
  })

  it('zero when due date is today', () => {
    expect(computeDaysUntilDue('2025-06-01', '2025-06-01')).toBe(0)
  })

  it('correctly computes cross-month boundary', () => {
    expect(computeDaysUntilDue('2025-07-01', '2025-06-26')).toBe(5)
  })

  it('correctly computes cross-year boundary', () => {
    expect(computeDaysUntilDue('2026-01-26', '2025-12-26')).toBe(31)
  })

  it('handles leap year February correctly', () => {
    // 2024 is a leap year: Feb has 29 days
    expect(computeDaysUntilDue('2024-03-01', '2024-02-01')).toBe(29)
  })

  it('exactly 14 days = 14', () => {
    expect(computeDaysUntilDue('2025-06-15', '2025-06-01')).toBe(14)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 8. estimateKdvPayable
// ─────────────────────────────────────────────────────────────────────────────

describe('estimateKdvPayable()', () => {
  it('output - input when positive', () => {
    // sales=100k, expenses=50k, both at 20%
    // output=20k, input=10k → 10k
    expect(estimateKdvPayable(100_000, 50_000)).toBe(10_000)
  })

  it('clamped at 0 when input > output', () => {
    // sales=30k, expenses=100k
    // output=6k, input=20k → negative → 0
    expect(estimateKdvPayable(30_000, 100_000)).toBe(0)
  })

  it('zero when sales = expenses', () => {
    expect(estimateKdvPayable(50_000, 50_000)).toBe(0)
  })

  it('custom KDV rates', () => {
    // output = 100k × 0.18 = 18k, input = 50k × 0.10 = 5k → 13k
    expect(estimateKdvPayable(100_000, 50_000, 0.18, 0.10)).toBe(13_000)
  })

  it('default rates are 0.20', () => {
    const result = estimateKdvPayable(200_000, 0)
    expect(result).toBe(40_000) // 200k × 0.20
  })

  it('handles zero sales', () => {
    expect(estimateKdvPayable(0, 50_000)).toBe(0)
  })

  it('handles both zero', () => {
    expect(estimateKdvPayable(0, 0)).toBe(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 9. estimateGeciciVergi
// ─────────────────────────────────────────────────────────────────────────────

describe('estimateGeciciVergi()', () => {
  it('Q1: ytdNetIncome × 25%', () => {
    // 100k × 25% = 25k
    expect(estimateGeciciVergi(100_000, 1)).toBe(25_000)
  })

  it('Q2 cumulative: same ytd×25% - 0 = ytd×25%', () => {
    expect(estimateGeciciVergi(200_000, 2)).toBe(50_000)
  })

  it('subtracts previously paid geçici vergi', () => {
    // ytd=200k, q2 elapsed, paid 25k in Q1 → 50k - 25k = 25k
    expect(estimateGeciciVergi(200_000, 2, 25_000)).toBe(25_000)
  })

  it('clamped at 0 when previouslyPaid exceeds gross', () => {
    expect(estimateGeciciVergi(100_000, 1, 50_000)).toBe(0)
  })

  it('returns 0 for negative net income', () => {
    expect(estimateGeciciVergi(-50_000, 2)).toBe(0)
  })

  it('default previouslyPaid is 0', () => {
    const withDefault = estimateGeciciVergi(100_000, 1)
    const withZero    = estimateGeciciVergi(100_000, 1, 0)
    expect(withDefault).toBe(withZero)
  })

  it('Q4 full year: ytdNetIncome × 25% - previouslyPaid', () => {
    // Full year: 400k net, paid 75k in Q1+Q2+Q3 → 100k - 75k = 25k
    expect(estimateGeciciVergi(400_000, 4, 75_000)).toBe(25_000)
  })

  it('quartersElapsed=0 returns 0', () => {
    expect(estimateGeciciVergi(100_000, 0)).toBe(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 10. estimateSgkMonthly
// ─────────────────────────────────────────────────────────────────────────────

describe('estimateSgkMonthly()', () => {
  it('default rates: 20.25% employer + 14% employee = 34.25%', () => {
    expect(estimateSgkMonthly(100_000)).toBe(34_250)
  })

  it('custom rates', () => {
    // 25% + 15% = 40%
    expect(estimateSgkMonthly(100_000, 25, 15)).toBe(40_000)
  })

  it('zero payroll → zero SGK', () => {
    expect(estimateSgkMonthly(0)).toBe(0)
  })

  it('employer-only contribution', () => {
    expect(estimateSgkMonthly(100_000, 20.25, 0)).toBe(20_250)
  })

  it('rounds to 2 decimal places', () => {
    // 100k / 3 ≈ 33333.33, × 34.25% ≈ 11416.67
    const result = estimateSgkMonthly(100_000 / 3)
    expect(Number.isFinite(result)).toBe(true)
    expect(String(result).split('.')[1]?.length ?? 0).toBeLessThanOrEqual(2)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 11. generateObligationCalendar
// ─────────────────────────────────────────────────────────────────────────────

describe('generateObligationCalendar()', () => {
  const today = '2025-01-01'
  const estimates = {
    monthly_kdv_try:      10_000,
    monthly_muhtasar_try: 2_000,
    monthly_sgk_try:      15_000,
    quarterly_gecici_vergi_by_quarter: { 1: 25_000, 2: 25_000, 3: 25_000, 4: 25_000 } as Record<1|2|3|4, number>,
    annual_kurumlar_vergisi_try: 100_000,
  }

  it('generates KDV for each month', () => {
    const obs = generateObligationCalendar('2025-01', 3, today, estimates)
    const kdv = obs.filter(o => o.tax_type === 'kdv')
    expect(kdv.length).toBe(3)
  })

  it('generates Muhtasar for each month', () => {
    const obs = generateObligationCalendar('2025-01', 3, today, estimates)
    const muh = obs.filter(o => o.tax_type === 'muhtasar')
    expect(muh.length).toBe(3)
  })

  it('generates SGK for each month', () => {
    const obs = generateObligationCalendar('2025-01', 3, today, estimates)
    const sgk = obs.filter(o => o.tax_type === 'sgk')
    expect(sgk.length).toBe(3)
  })

  it('KDV for January 2025 has correct due date (Feb 26)', () => {
    const obs = generateObligationCalendar('2025-01', 1, today, estimates)
    const kdv = obs.find(o => o.tax_type === 'kdv' && o.filing_period === '2025-01')
    expect(kdv).toBeDefined()
    expect(kdv!.due_date).toBe('2025-02-26')
  })

  it('SGK for January 2025 has correct due date (Feb 28)', () => {
    const obs = generateObligationCalendar('2025-01', 1, today, estimates)
    const sgk = obs.find(o => o.tax_type === 'sgk' && o.filing_period === '2025-01')
    expect(sgk).toBeDefined()
    expect(sgk!.due_date).toBe('2025-02-28') // 2025 is not leap year
  })

  it('generates Q1 Geçici Vergi for March', () => {
    const obs = generateObligationCalendar('2025-03', 1, today, estimates)
    const gv = obs.find(o => o.tax_type === 'gecici_vergi')
    expect(gv).toBeDefined()
    expect(gv!.due_date).toBe('2025-05-17')
    expect(gv!.id).toBe('gecici_vergi_2025-Q1')
  })

  it('generates Q2 Geçici Vergi for June', () => {
    const obs = generateObligationCalendar('2025-06', 1, today, estimates)
    const gv = obs.find(o => o.tax_type === 'gecici_vergi')
    expect(gv).toBeDefined()
    expect(gv!.due_date).toBe('2025-08-17')
  })

  it('generates Q3 Geçici Vergi for September', () => {
    const obs = generateObligationCalendar('2025-09', 1, today, estimates)
    const gv = obs.find(o => o.tax_type === 'gecici_vergi')
    expect(gv).toBeDefined()
    expect(gv!.due_date).toBe('2025-11-17')
  })

  it('generates Q4 Geçici Vergi for December', () => {
    const obs = generateObligationCalendar('2025-12', 1, today, estimates)
    const gv = obs.find(o => o.tax_type === 'gecici_vergi')
    expect(gv).toBeDefined()
    expect(gv!.due_date).toBe('2026-02-17') // Q4 → Feb of next year
  })

  it('generates Kurumlar Vergisi for December', () => {
    const obs = generateObligationCalendar('2025-12', 1, today, estimates)
    const kv = obs.find(o => o.tax_type === 'kurumlar_vergisi')
    expect(kv).toBeDefined()
    expect(kv!.due_date).toBe('2026-04-30')
    expect(kv!.filing_period).toBe('2025')
  })

  it('does NOT generate Geçici Vergi for non-quarter months', () => {
    const months = ['2025-01', '2025-02', '2025-04', '2025-05', '2025-07', '2025-08', '2025-10', '2025-11']
    for (const m of months) {
      const obs = generateObligationCalendar(m, 1, today, estimates)
      const gv = obs.find(o => o.tax_type === 'gecici_vergi')
      expect(gv).toBeUndefined()
    }
  })

  it('does NOT generate Kurumlar Vergisi for non-December months', () => {
    const obs = generateObligationCalendar('2025-06', 1, today, estimates)
    const kv = obs.find(o => o.tax_type === 'kurumlar_vergisi')
    expect(kv).toBeUndefined()
  })

  it('results are sorted by due_date ascending', () => {
    const obs = generateObligationCalendar('2025-01', 6, today, estimates)
    for (let i = 1; i < obs.length; i++) {
      expect(obs[i]!.due_date >= obs[i - 1]!.due_date).toBe(true)
    }
  })

  it('IDs are unique', () => {
    const obs = generateObligationCalendar('2025-01', 12, today, estimates)
    const ids = obs.map(o => o.id)
    const unique = new Set(ids)
    expect(unique.size).toBe(ids.length)
  })

  it('amounts from estimates are applied', () => {
    const obs = generateObligationCalendar('2025-06', 1, today, estimates)
    const kdv = obs.find(o => o.tax_type === 'kdv')
    expect(kdv!.estimated_amount_try).toBe(10_000)
  })

  it('generates Bağ-Kur when monthly_bag_kur_try is provided', () => {
    const obs = generateObligationCalendar('2025-01', 1, today, {
      ...estimates,
      monthly_bag_kur_try: 5_000,
    })
    const bk = obs.find(o => o.tax_type === 'bag_kur')
    expect(bk).toBeDefined()
    expect(bk!.estimated_amount_try).toBe(5_000)
  })

  it('does NOT generate Bağ-Kur when monthly_bag_kur_try is 0', () => {
    const obs = generateObligationCalendar('2025-01', 1, today, {
      ...estimates,
      monthly_bag_kur_try: 0,
    })
    const bk = obs.find(o => o.tax_type === 'bag_kur')
    expect(bk).toBeUndefined()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 12. filterObligationsByStatus
// ─────────────────────────────────────────────────────────────────────────────

describe('filterObligationsByStatus()', () => {
  const today = '2025-06-01'
  const obs = generateObligationCalendar('2025-05', 3, today, {
    monthly_kdv_try: 5_000,
  })

  it('filters to overdue only', () => {
    const overdue = filterObligationsByStatus(obs, 'overdue')
    expect(overdue.every(o => o.status === 'overdue')).toBe(true)
  })

  it('filters to due_soon only', () => {
    const dueSoon = filterObligationsByStatus(obs, 'due_soon')
    expect(dueSoon.every(o => o.status === 'due_soon')).toBe(true)
  })

  it('filters to upcoming only', () => {
    const upcoming = filterObligationsByStatus(obs, 'upcoming')
    expect(upcoming.every(o => o.status === 'upcoming')).toBe(true)
  })

  it('returns empty array for paid when none are paid', () => {
    const paid = filterObligationsByStatus(obs, 'paid')
    expect(paid).toHaveLength(0)
  })

  it('filter results + other statuses = total count', () => {
    const overdue  = filterObligationsByStatus(obs, 'overdue').length
    const dueSoon  = filterObligationsByStatus(obs, 'due_soon').length
    const upcoming = filterObligationsByStatus(obs, 'upcoming').length
    const paid     = filterObligationsByStatus(obs, 'paid').length
    expect(overdue + dueSoon + upcoming + paid).toBe(obs.length)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 13. computeUpcomingTaxLiability
// ─────────────────────────────────────────────────────────────────────────────

describe('computeUpcomingTaxLiability()', () => {
  it('sums obligations due within N days', () => {
    const today = '2025-06-01'
    const obs = [
      {
        id: 'kdv_2025-06', tax_type: 'kdv' as const, label: '', filing_period: '2025-06',
        due_date: '2025-06-10', estimated_amount_try: 10_000, status: 'due_soon' as const,
        days_until_due: 9, description: '',
      },
      {
        id: 'kdv_2025-07', tax_type: 'kdv' as const, label: '', filing_period: '2025-07',
        due_date: '2025-07-26', estimated_amount_try: 10_000, status: 'upcoming' as const,
        days_until_due: 55, description: '',
      },
      {
        id: 'sgk_2025-05', tax_type: 'sgk' as const, label: '', filing_period: '2025-05',
        due_date: '2025-05-20', estimated_amount_try: 5_000, status: 'overdue' as const,
        days_until_due: -12, description: '',
      },
    ]
    // Within 30 days: only the June 10 obligation (due_date <= today+30)
    expect(computeUpcomingTaxLiability(obs, 30, today)).toBe(10_000)
  })

  it('includes all obligations within daysAhead', () => {
    const today = '2025-06-01'
    const obs = [
      {
        id: 'a', tax_type: 'kdv' as const, label: '', filing_period: '2025-06',
        due_date: '2025-06-10', estimated_amount_try: 10_000, status: 'due_soon' as const,
        days_until_due: 9, description: '',
      },
      {
        id: 'b', tax_type: 'sgk' as const, label: '', filing_period: '2025-06',
        due_date: '2025-06-30', estimated_amount_try: 15_000, status: 'upcoming' as const,
        days_until_due: 29, description: '',
      },
    ]
    expect(computeUpcomingTaxLiability(obs, 30, today)).toBe(25_000)
  })

  it('excludes overdue obligations', () => {
    const today = '2025-06-15'
    const obs = [
      {
        id: 'overdue', tax_type: 'kdv' as const, label: '', filing_period: '2025-05',
        due_date: '2025-05-26', estimated_amount_try: 20_000, status: 'overdue' as const,
        days_until_due: -20, description: '',
      },
    ]
    expect(computeUpcomingTaxLiability(obs, 30, today)).toBe(0)
  })

  it('returns 0 for empty array', () => {
    expect(computeUpcomingTaxLiability([], 30, '2025-06-01')).toBe(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 14. getNextDueObligation
// ─────────────────────────────────────────────────────────────────────────────

describe('getNextDueObligation()', () => {
  it('returns soonest upcoming obligation', () => {
    const today = '2025-06-01'
    const obs = generateObligationCalendar('2025-06', 3, today, {
      monthly_kdv_try: 5_000,
    })
    const next = getNextDueObligation(obs)
    expect(next).not.toBeNull()
    // next should have smallest non-negative days_until_due
    const nonOverdue = obs.filter(o => o.days_until_due >= 0)
    const minDays = Math.min(...nonOverdue.map(o => o.days_until_due))
    expect(next!.days_until_due).toBe(minDays)
  })

  it('returns null for empty array', () => {
    expect(getNextDueObligation([])).toBeNull()
  })

  it('returns null when all are paid', () => {
    const paidOb = {
      id: 'paid', tax_type: 'kdv' as const, label: '', filing_period: '2025-06',
      due_date: '2025-07-26', estimated_amount_try: 5_000, status: 'paid' as const,
      days_until_due: 30, description: '',
    }
    expect(getNextDueObligation([paidOb])).toBeNull()
  })

  it('prefers upcoming/due_soon over overdue', () => {
    const obs = [
      {
        id: 'overdue', tax_type: 'kdv' as const, label: '', filing_period: '2025-05',
        due_date: '2025-05-26', estimated_amount_try: 10_000, status: 'overdue' as const,
        days_until_due: -5, description: '',
      },
      {
        id: 'upcoming', tax_type: 'sgk' as const, label: '', filing_period: '2025-06',
        due_date: '2025-06-30', estimated_amount_try: 15_000, status: 'due_soon' as const,
        days_until_due: 3, description: '',
      },
    ]
    const next = getNextDueObligation(obs)
    expect(next!.id).toBe('upcoming')
  })

  it('when all are overdue, returns the least-overdue', () => {
    const obs = [
      {
        id: 'a', tax_type: 'kdv' as const, label: '', filing_period: '2025-04',
        due_date: '2025-04-26', estimated_amount_try: 5_000, status: 'overdue' as const,
        days_until_due: -30, description: '',
      },
      {
        id: 'b', tax_type: 'sgk' as const, label: '', filing_period: '2025-05',
        due_date: '2025-05-26', estimated_amount_try: 5_000, status: 'overdue' as const,
        days_until_due: -5, description: '',
      },
    ]
    const next = getNextDueObligation(obs)
    // Should return the one with days_until_due = -5 (less overdue)
    expect(next!.id).toBe('b')
  })
})
