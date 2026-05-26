// ── VarianceTab — Gerçek vs Plan ───────────────────────────────────────────────
// Server wrapper. Renders client island for TanStack Query data fetching.
// Shows scenario forecasts vs actual financial results.

import { VarianceClient } from './_variance/VarianceClient'
import { NarrativeFooter } from '@/components/ds'

export function VarianceTab() {
  return (
    <div className="space-y-4">
      <VarianceClient />
      <NarrativeFooter
        narrative="Senaryo tahminlerinizi gerçekleşen finansallarla karşılaştırın — planlama sürecinizi geliştirin."
        links={[
          { label: 'Senaryolar',     href: '/dashboard/planning?tab=scenarios' },
          { label: 'Gerçek P&L',    href: '/dashboard/finance?tab=pnl' },
          { label: 'Nakit Projeksiyonu', href: '/dashboard/planning?tab=cash-projection' },
        ]}
      />
    </div>
  )
}
