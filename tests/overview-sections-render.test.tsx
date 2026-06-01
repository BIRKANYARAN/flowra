// @vitest-environment jsdom
// Characterization tests for the pure presentational sections extracted from
// OverviewTab.tsx (SeasonalitySection, PeriodComparisonSection). They take props
// only (no hooks/fetch), so the render test is a direct golden check.

import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { SeasonalitySection } from '@/app/dashboard/finance/_tabs/_overview/SeasonalitySection'
import { PeriodComparisonSection } from '@/app/dashboard/finance/_tabs/_overview/PeriodComparisonSection'

afterEach(() => cleanup())

const seasonalityReport = {
  monthly_data: [],
  peak_month_number: 6,
  peak_month_name: 'Haziran',
  trough_month_number: 1,
  trough_month_name: 'Ocak',
  seasonality_strength: 'moderate' as const,
  recommendation: 'Sezonsal öneri metni',
  years_analyzed: 2,
}

describe('OverviewTab extracted sections — characterization', () => {
  it('SeasonalitySection renders from a report prop (extraction preserved render)', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    render(<SeasonalitySection report={seasonalityReport as any} />)
    expect(screen.getByText('Sezonsal öneri metni')).toBeInTheDocument()
  })

  it('PeriodComparisonSection renders without crashing when there is no comparison data', () => {
    expect(() => render(
      <PeriodComparisonSection yoy={null} mom={null} currentYear={2026} currentMonth={1} />,
    )).not.toThrow()
  })
})
