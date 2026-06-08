// ── VarianceTab — Gerçek vs Plan ───────────────────────────────────────────────
// Server wrapper. Renders client islands for TanStack Query data fetching.
// Shows scenario forecasts vs actual financial results, plus forecast accuracy.

import { createClient }           from '@/lib/supabase-server'
import { resolveCompanyId }       from '@/lib/resolve-company'
import { VarianceClient }         from './_variance/VarianceClient'
import { ForecastAccuracyClient } from './_forecast/ForecastAccuracyClient'
import { NarrativeFooter }        from '@/components/ds'

export async function VarianceTab() {
  const supabase = createClient()
  let companyId: string | null = null
  try {
    const { data } = await supabase.auth.getUser()
    if (data?.user) companyId = await resolveCompanyId(data.user.id, supabase)
  } catch { /* non-fatal */ }

  return (
    <div className="space-y-8">
      <VarianceClient />

      {/* Forecast accuracy analysis */}
      {companyId && (
        <div className="border-t border-[#e8eaef] pt-6">
          <ForecastAccuracyClient companyId={companyId} />
        </div>
      )}

      <NarrativeFooter
        narrative="Senaryo tahminlerinizi gerçekleşen finansallarla karşılaştırın — planlama sürecinizi geliştirin."
        links={[
          { label: 'Senaryolar',        href: '/dashboard/planning?tab=scenarios' },
          { label: 'Gerçek P&L',        href: '/dashboard/finance?tab=pnl' },
          { label: 'Nakit Projeksiyonu', href: '/dashboard/planning?tab=cash-projection' },
        ]}
      />
    </div>
  )
}
