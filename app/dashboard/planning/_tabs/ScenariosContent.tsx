// ── ScenariosContent — Senaryo Analizi + Karşılaştırma Motoru ─────────────────
//
// Server component wrapper. Renders:
//   1. WhatIfTab (server component — loads baseline financials from DB)
//   2. ScenarioComparisonClient (client island — fetches comparison via TanStack Query)

import { WhatIfTab }              from './WhatIfTab'
import { ScenarioComparisonClient } from './_scenario-comparison/ScenarioComparisonClient'

interface Props {
  companyId: string
  userId:    string
}

export async function ScenariosContent({ companyId, userId }: Props) {
  return (
    <div className="space-y-6 max-w-5xl">

      {/* Existing what-if slider engine */}
      <WhatIfTab companyId={companyId} userId={userId} />

      {/* Divider */}
      <div className="flex items-center gap-3">
        <div className="flex-1 border-t border-dashed border-[#e2e8f0]" />
        <span className="text-[9px] font-black uppercase tracking-widest text-[#cbd5e1]">
          Senaryo Karşılaştırması
        </span>
        <div className="flex-1 border-t border-dashed border-[#e2e8f0]" />
      </div>

      {/* Comparison section header */}
      <div className="px-4 py-3 bg-brand-subtle border border-brand/10 rounded">
        <div className="text-xs font-black text-brand">Senaryo Karşılaştırma Motoru</div>
        <div className="text-[10px] text-brand-light mt-0.5">
          Kayıtlı senaryoları yan yana karşılaştırın · Metrik bazlı en iyi senaryo vurgulanır · Baz senaryoya göre delta gösterilir
        </div>
      </div>

      {/* Client island: TanStack Query-powered comparison UI */}
      <ScenarioComparisonClient />

    </div>
  )
}
