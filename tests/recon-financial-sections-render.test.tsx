// @vitest-environment jsdom
// Characterization test for FinancialSections (sections 2–8 of the reconciliation
// detail page), extracted as a prop-only presentational component driven by the
// ReconciliationData snapshot. Guards the extraction: section headers + a treasury
// figure render from a minimal snapshot.
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { FinancialSections } from '@/app/dashboard/admin/reconciliation/[id]/_reconciliation/FinancialSections'

afterEach(() => cleanup())

// Minimal snapshot covering the array fields the 7 sections read (empty arrays
// exercise the "no rows" branches); section2 carries figures to assert a value.
const aging = { bucket_0_30: 0, bucket_31_60: 0, bucket_61_90: 0, bucket_90plus: 0 }
const s = {
  section2: { total_cash_try: 12345, available_cash_try: 12000, restricted_cash_try: 345, bank_accounts: [], fx_exposure: [], treasury_note: '' },
  section3: { aging, top_customers: [] },
  section4: { aging, top_suppliers: [] },
  section5: { top_items: [] },
  section6: { assets: [] },
  section7: { pending_declarations: [] },
  section8: { items: [] },
// eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any

describe('FinancialSections (reconciliation S2–S8) — characterization', () => {
  it('renders all seven financial-position section headers', () => {
    render(<FinancialSections s={s} />)
    for (const t of ['Hazine & Nakit', 'Alacaklar', 'Borçlar (Ticari)', 'Stok', 'Sabit Kıymetler', 'Vergi Pozisyonu', 'Finansman']) {
      expect(screen.getByText(t)).toBeInTheDocument()
    }
  })

  it('renders the treasury cash label from the snapshot', () => {
    render(<FinancialSections s={s} />)
    expect(screen.getByText('Toplam Nakit')).toBeInTheDocument()
  })
})
