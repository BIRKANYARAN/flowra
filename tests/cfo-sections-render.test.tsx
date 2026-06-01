// @vitest-environment jsdom
// Characterization tests for the presentational sections extracted from CFOTab.tsx
// (CeyreklikAnalitik quarterly card + GlToolsAndReports link grid). Both are
// prop-only / static, so these are direct golden render checks guarding the split.
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { CeyreklikAnalitik } from '@/app/dashboard/finance/_tabs/_cfo/CeyreklikAnalitik'
import { GlToolsAndReports } from '@/app/dashboard/finance/_tabs/_cfo/GlToolsAndReports'

afterEach(() => cleanup())

const q = (over = {}) => ({
  label: 'Q1', revenue: 100, gross_profit: 40, net_profit: 20, gross_margin: 0.4,
  matrah: 30, gecici_vergi: 0, gecici_due_date: null, is_past_quarter: true,
  period: { from: '2026-01-01', to: '2026-03-31' }, ...over,
})

describe('CFOTab extracted sections — characterization', () => {
  it('CeyreklikAnalitik renders nothing when the report is null', () => {
    const { container } = render(<CeyreklikAnalitik quarterlyReport={null} today="2026-06-01" />)
    expect(container).toBeEmptyDOMElement()
  })

  it('CeyreklikAnalitik renders nothing when there are zero quarters', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rpt = { quarters: [], ytd: {}, year: 2026 } as any
    const { container } = render(<CeyreklikAnalitik quarterlyReport={rpt} today="2026-06-01" />)
    expect(container).toBeEmptyDOMElement()
  })

  it('CeyreklikAnalitik renders the quarterly table + a geçici-vergi schedule row', () => {
    const rpt = {
      year: 2026,
      quarters: [q(), q({ label: 'Q2', gecici_vergi: 500, gecici_due_date: '2026-08-17' })],
      ytd: { revenue: 200, gross_profit: 80, net_profit: 40, net_after_tax: 35, matrah: 60, total_gecici: 500 },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any
    render(<CeyreklikAnalitik quarterlyReport={rpt} today="2026-06-01" />)
    expect(screen.getByText('Çeyreklik Analitik — 2026')).toBeInTheDocument()
    expect(screen.getByText('YTD Toplam')).toBeInTheDocument()
    expect(screen.getByText('Q2 Geçici Vergi')).toBeInTheDocument()   // schedule row appears
  })

  it('GlToolsAndReports renders the GL + report navigation links', () => {
    render(<GlToolsAndReports />)
    expect(screen.getByText('GL Araçları')).toBeInTheDocument()
    expect(screen.getByText('Finansal Raporlar')).toBeInTheDocument()
    expect(screen.getByText('Mizan')).toBeInTheDocument()
    expect(screen.getByText('Yönetici Özeti')).toBeInTheDocument()
  })
})
