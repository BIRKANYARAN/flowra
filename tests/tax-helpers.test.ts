// Node-env unit tests for the pure tax helpers extracted from TaxTab.tsx.
// Previously inline + untested: date math, KDV position, Geçici Vergi status/next.
import { describe, it, expect } from 'vitest'
import { lastNMonths, kdvPositionLabel, geciciStatus, nextGeciciDue } from '@/app/dashboard/finance/_tabs/_tax/helpers'

describe('tax helpers (extracted from TaxTab)', () => {
  // addDays does local→UTC date math (timezone-sensitive); it is exercised
  // deterministically through geciciStatus's relative comparisons below.
  it('lastNMonths returns N trailing YYYY-MM, oldest first', () => {
    const r = lastNMonths(3, new Date('2026-03-15T00:00:00'))
    expect(r).toEqual(['2026-01', '2026-02', '2026-03'])
  })
  it('kdvPositionLabel classifies payable / carried-forward / zero', () => {
    expect(kdvPositionLabel(100).label).toContain('Ödenecek')
    expect(kdvPositionLabel(-100).label).toContain('Devredilen')
    expect(kdvPositionLabel(0).label).toBe('Sıfır')
  })
  it('geciciStatus buckets by due date vs today', () => {
    const today = '2026-06-01'
    expect(geciciStatus('', today)).toBe('none')
    expect(geciciStatus('2026-05-01', today)).toBe('overdue')
    expect(geciciStatus('2026-06-10', today)).toBe('urgent')   // within 14d
    expect(geciciStatus('2026-07-10', today)).toBe('upcoming') // within 45d
    expect(geciciStatus('2026-12-01', today)).toBe('future')
  })
  it('nextGeciciDue picks the earliest upcoming unpaid quarter, else null', () => {
    const today = '2026-06-01'
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const q = (date: string, amt: number, label: string): any => ({ gecici_due_date: date, gecici_vergi: amt, label })
    expect(nextGeciciDue([], today)).toBeNull()
    expect(nextGeciciDue([q('2026-05-01', 100, 'Q1')], today)).toBeNull() // past
    const next = nextGeciciDue([q('2026-11-17', 500, 'Q3'), q('2026-08-17', 300, 'Q2')], today)
    expect(next).toEqual({ label: 'Q2', date: '2026-08-17', amount: 300 })
  })
})
