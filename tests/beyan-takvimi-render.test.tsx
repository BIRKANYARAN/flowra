// @vitest-environment jsdom
// Characterization test for BeyanTakvimi (Zone 3b of TaxTab) — the Turkish tax
// compliance calendar, extracted as a prop-only presentational component. Guards
// the extraction: empty/null states + an obligation row with overdue badge.
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { BeyanTakvimi } from '@/app/dashboard/finance/_tabs/_tax/BeyanTakvimi'

afterEach(() => cleanup())

describe('BeyanTakvimi (TaxTab Zone 3b) — characterization', () => {
  it('renders the load-failure message when taxCalendar is null', () => {
    render(<BeyanTakvimi taxCalendar={null} />)
    expect(screen.getByText('Beyan takvimi yüklenemedi')).toBeInTheDocument()
  })

  it('renders the empty-state when there are no obligations', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cal = { overdue_count: 0, due_soon_count: 0, total_estimated_tax_try: 0, obligations: [] } as any
    render(<BeyanTakvimi taxCalendar={cal} />)
    expect(screen.getByText('Yaklaşan yükümlülük bulunamadı')).toBeInTheDocument()
  })

  it('renders an obligation row with its label and an overdue badge', () => {
    const cal = {
      overdue_count: 1, due_soon_count: 0, total_estimated_tax_try: 1000,
      obligations: [{
        id: 'o1', label: 'KDV Beyannamesi', filing_period: '2026-05', due_date: '2026-06-26',
        status: 'overdue', days_remaining: -3, estimated_amount_try: 5000, notes: null,
      }],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any
    render(<BeyanTakvimi taxCalendar={cal} />)
    expect(screen.getByText('KDV Beyannamesi')).toBeInTheDocument()
    expect(screen.getByText('3 gün gecikti')).toBeInTheDocument()
    expect(screen.getByText('1 vadesi geçmiş')).toBeInTheDocument()
  })
})
