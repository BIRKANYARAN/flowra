// ── /dashboard/planning — Planlama Merkezi ────────────────────────────────────
//
// Server component. Auth + companyId + userId resolved once.
// Active tab read from ?tab= searchParam → renders real content server-side.

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Planlama' }

import { Suspense } from 'react'
import { createClient } from '@/lib/supabase-server'
import { resolveCompanyId } from '@/lib/resolve-company'
import { HubTabNav } from '@/app/dashboard/_shared/HubTabNav'
import { DetailSection } from '@/components/dashboard/DetailSection'
import { PLANNING_TABS } from '@/lib/nav-config'
import { PlanningContextBar } from './_shared/PlanningContextBar'
import { SimulationContent }  from './_tabs/SimulationContent'
import { TasksContent }       from './_tabs/TasksContent'
import { CashProjectionTab }  from './_tabs/CashProjectionTab'
import { WhatIfTab }          from './_tabs/WhatIfTab'
import { ScenariosContent }   from './_tabs/ScenariosContent'
import { DebtPressureTab }    from './_tabs/DebtPressureTab'
import { PartnerImpactTab }   from './_tabs/PartnerImpactTab'
import { VarianceTab }        from './_tabs/VarianceTab'
import { BreakEvenTab }       from './_tabs/BreakEvenTab'
import { BudgetTab }          from './_tabs/BudgetTab'
import { CalendarContent }    from './_tabs/CalendarContent'

function TabSkeleton() {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => <div key={i} className="fl-shimmer rounded-lg h-16" />)}
      </div>
      <div className="fl-shimmer rounded-lg h-48" />
      <div className="fl-shimmer rounded-lg h-32" />
    </div>
  )
}

const VALID_TABS = PLANNING_TABS.map(t => t.key) as string[]
const TABS       = PLANNING_TABS.map(t => ({ key: t.key, label: t.label }))

// Single flat tab row (TABS above) — 2-level grouping dropped for a consistent,
// predictable "one row of views" model across every hub.

interface PageProps {
  searchParams: Promise<{ tab?: string }>
}

export default async function PlanningPage({ searchParams }: PageProps) {
  // Auth gate is layout.tsx — no redirect here to prevent /auth ↔ /dashboard loop.
  const supabase = createClient()
  let userId: string | null = null
  try {
    const { data, error } = await supabase.auth.getUser()
    if (!error && data?.user) userId = data.user.id
  } catch (e) {
    if (e && typeof e === 'object' && 'digest' in e) throw e
  }
  if (!userId) return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-center px-4">
      <p className="text-xs text-[#64748b]">Oturum bilgisi alınamadı. Lütfen sayfayı yenileyin.</p>
      <a href="/dashboard/planning" className="text-xs text-brand-light font-semibold hover:underline">Yeniden Dene</a>
    </div>
  )

  let companyId: string | null = null
  try { companyId = await resolveCompanyId(userId, supabase) } catch { /* non-fatal */ }
  if (!companyId) return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-center px-4">
      <p className="text-xs text-[#64748b]">Şirket bilgisi yüklenemedi. Lütfen sayfayı yenileyin.</p>
      <a href="/dashboard/planning" className="text-xs text-brand-light font-semibold hover:underline">Yeniden Dene</a>
    </div>
  )

  const params    = await searchParams
  const rawTab    = params.tab ?? 'unit-profit'
  // Folded tabs resolve to their host (deep links preserved):
  const PLAN_ALIAS: Record<string, string> = {
    variance:         'scenarios',     // Gerçek vs Plan → Senaryolar (Detaylı)
    'partner-impact': 'debt-pressure', // Ortak Etkisi → Borç & Ortak (Detaylı)
    calendar:         'budget',        // Takvim → Bütçe (Detaylı)
  }
  const resolved  = PLAN_ALIAS[rawTab] ?? rawTab
  const activeTab = VALID_TABS.includes(resolved) ? resolved : 'unit-profit'

  const planTitles: Record<string, string> = {
    'unit-profit':     'Karlılık',
    'cash-projection': 'Nakit Projeksiyonu',
    'scenarios':       'Senaryo Analizi',
    'variance':        'Gerçek vs Plan',
    'debt-pressure':   'Borç Baskısı',
    'partner-impact':  'Ortak Etkisi',
    'breakeven':       'Başabaş Analizi',
    'tasks':           'Görevler',
    'budget':          'Bütçe vs Gerçekleşen',
    'calendar':           'Finansal Takvim',
  }
  const planSubs: Record<string, string> = {
    'unit-profit':     'Birim kâr · Marj · Başabaş noktası · Katkı payı',
    'cash-projection': 'Nakit projeksiyonu · 12 ay görünümü · Senaryo bazlı',
    'scenarios':       'Senaryo planlama · Duyarlılık analizi · Stres testleri',
    'variance':        'Senaryo doğruluğu · Plan vs gerçekleşen · Tahmin sapması',
    'debt-pressure':   'Borç baskısı · Servis oranı · Tranche takvimi',
    'partner-impact':  'Ortak etkisi · Eşitleme hesabı · Dağıtım analizi',
    'breakeven':       'Başabaş noktası · Katkı payı · Güvenlik marjı · Hedef kâr senaryosu',
    'tasks':           'Görev takibi · Vadesi yaklaşan · Öncelik sırası',
    'budget':          'Aylık bütçe hedefleri · Gelir/gider varyansı · YTD özet',
    'calendar':           'Vergi takvimleri · Dönem kapanışları · Ortak yükümlülükleri · Yönetişim',
  }

  return (
    <div className="flex flex-col gap-5 max-w-5xl">

      {/* PAGE HERO */}
      <div>
        <div className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8] mb-1">Planlama Merkezi</div>
        <h1 className="text-2xl font-bold tracking-tight text-[#0f172a] leading-tight">
          {planTitles[activeTab] ?? 'Planlama'}
        </h1>
        <p className="text-xs text-[#94a3b8] mt-0.5">{planSubs[activeTab] ?? ''}</p>
      </div>

      {/* Sticky tab nav + context bar */}
      <div className="sticky top-0 z-20 bg-white/95 backdrop-blur-sm -mx-4">
        <div className="px-4 pt-1 border-b border-[#e8eaef]">
          <HubTabNav tabs={TABS} activeTab={activeTab} basePath="/dashboard/planning" />
        </div>
        <PlanningContextBar companyId={companyId} />
      </div>

      <Suspense fallback={<TabSkeleton />}>
        {/* unit-profit: product simulation engine */}
        {/* Karlılık: birim kâr + başabaş analizi co-located */}
        {activeTab === 'unit-profit' && (
          <div className="space-y-4">
            <SimulationContent companyId={companyId} userId={userId} activeTab="unit-profit" />
            <DetailSection title="Başabaş Analizi" subtitle="Başabaş noktası · katkı payı · güvenlik marjı · hedef kâr">
              <BreakEvenTab companyId={companyId} userId={userId} />
            </DetailSection>
          </div>
        )}
        {/* cash-projection: 12-month trailing-based cash forecast */}
        {activeTab === 'cash-projection' && (
          <CashProjectionTab companyId={companyId} />
        )}
        {/* scenarios: what-if slider engine + scenario comparison matrix
            (Gerçek vs Plan folded in as a "Detaylı" panel) */}
        {activeTab === 'scenarios' && (
          <div className="space-y-5">
            <ScenariosContent companyId={companyId} userId={userId} />
            <DetailSection title="Gerçek vs Plan" subtitle="Senaryo–gerçekleşme köprüsü · sapma analizi">
              <VarianceTab />
            </DetailSection>
          </div>
        )}
        {/* debt-pressure: tranche ladder + DSR + concentration
            (Ortak Etkisi folded in as a "Detaylı" panel) */}
        {activeTab === 'debt-pressure' && (
          <div className="space-y-5">
            <DebtPressureTab companyId={companyId} userId={userId} />
            <DetailSection title="Ortak Etkisi" subtitle="Dağıtım planı · ortak kredi durumu">
              <PartnerImpactTab companyId={companyId} userId={userId} />
            </DetailSection>
          </div>
        )}
        {activeTab === 'tasks' && <TasksContent companyId={companyId} />}
        {/* budget: monthly budget targets vs actuals (Takvim folded in as a panel) */}
        {activeTab === 'budget' && (
          <div className="space-y-5">
            <BudgetTab companyId={companyId} />
            <DetailSection title="Finansal Takvim" subtitle="Yıllık yükümlülük & ödeme takvimi">
              <CalendarContent companyId={companyId} />
            </DetailSection>
          </div>
        )}
      </Suspense>
    </div>
  )
}
