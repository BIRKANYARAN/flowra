// ── /dashboard/planning — Planlama Merkezi ────────────────────────────────────
//
// Server component. Auth + companyId + userId resolved once.
// Active tab read from ?tab= searchParam → renders real content server-side.

export const dynamic = 'force-dynamic'

import { Suspense } from 'react'
import { createClient } from '@/lib/supabase-server'
import { resolveCompanyId } from '@/lib/resolve-company'
import { HubTabNav } from '@/app/dashboard/_shared/HubTabNav'
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
    <div className="space-y-3 animate-pulse">
      <div className="grid grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => <div key={i} className="bg-[#f1f5f9] rounded h-16" />)}
      </div>
      <div className="bg-[#f1f5f9] rounded h-48" />
      <div className="bg-[#f1f5f9] rounded h-32" />
    </div>
  )
}

const VALID_TABS = PLANNING_TABS.map(t => t.key) as string[]
const TABS       = PLANNING_TABS.map(t => ({ key: t.key, label: t.label }))

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
  const activeTab = VALID_TABS.includes(rawTab) ? rawTab : 'unit-profit'

  const planTitles: Record<string, string> = {
    'unit-profit':     'Birim Karlılık',
    'cash-projection': 'Nakit Projeksiyonu',
    'scenarios':       'Senaryo Analizi',
    'variance':        'Gerçek vs Plan',
    'debt-pressure':   'Borç Baskısı',
    'partner-impact':  'Ortak Etkisi',
    'breakeven':       'Başabaş Analizi',
    'tasks':           'Görevler',
    'budget':          'Bütçe vs Gerçekleşen',
    'calendar':        'Finansal Takvim',
  }
  const planSubs: Record<string, string> = {
    'unit-profit':     'Birim karlılık · Marj analizi · Fiyat optimizasyonu',
    'cash-projection': 'Nakit projeksiyonu · 12 ay görünümü · Senaryo bazlı',
    'scenarios':       'Senaryo planlama · Duyarlılık analizi · Stres testleri',
    'variance':        'Senaryo doğruluğu · Plan vs gerçekleşen · Tahmin sapması',
    'debt-pressure':   'Borç baskısı · Servis oranı · Tranche takvimi',
    'partner-impact':  'Ortak etkisi · Eşitleme hesabı · Dağıtım analizi',
    'breakeven':       'Başabaş noktası · Katkı payı · Güvenlik marjı · Hedef kâr senaryosu',
    'tasks':           'Görev takibi · Vadesi yaklaşan · Öncelik sırası',
    'budget':          'Aylık bütçe hedefleri · Gelir/gider varyansı · YTD özet',
    'calendar':        'Vergi takvimleri · Dönem kapanışları · Ortak yükümlülükleri · Yönetişim',
  }

  return (
    <div className="flex flex-col gap-5 max-w-5xl">

      {/* PAGE HERO */}
      <div>
        <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-1">Planlama Merkezi</div>
        <h1 className="text-2xl font-black tracking-tight text-[#0f172a] leading-tight">
          {planTitles[activeTab] ?? 'Planlama'}
        </h1>
        <p className="text-xs text-[#94a3b8] mt-0.5">{planSubs[activeTab] ?? ''}</p>
      </div>

      {/* Sticky tab nav + context bar */}
      <div className="sticky top-0 z-20 bg-white/95 backdrop-blur-sm -mx-4">
        <div className="px-4 pt-1 border-b border-[#e2e8f0]">
          <HubTabNav tabs={TABS} activeTab={activeTab} basePath="/dashboard/planning" />
        </div>
        <PlanningContextBar companyId={companyId} />
      </div>

      <Suspense fallback={<TabSkeleton />}>
        {/* unit-profit: product simulation engine */}
        {activeTab === 'unit-profit' && (
          <SimulationContent companyId={companyId} userId={userId} activeTab="unit-profit" />
        )}
        {/* partner-impact: distribution planning + loan status */}
        {activeTab === 'partner-impact' && (
          <PartnerImpactTab companyId={companyId} userId={userId} />
        )}
        {/* cash-projection: 12-month trailing-based cash forecast */}
        {activeTab === 'cash-projection' && (
          <CashProjectionTab companyId={companyId} />
        )}
        {/* scenarios: what-if slider engine + scenario comparison matrix */}
        {activeTab === 'scenarios' && (
          <ScenariosContent companyId={companyId} userId={userId} />
        )}
        {/* variance: scenario vs actuals bridge */}
        {activeTab === 'variance' && <VarianceTab />}
        {/* debt-pressure: tranche ladder + DSR + concentration */}
        {activeTab === 'debt-pressure' && (
          <DebtPressureTab companyId={companyId} userId={userId} />
        )}
        {/* breakeven: başabaş analizi */}
        {activeTab === 'breakeven' && (
          <BreakEvenTab companyId={companyId} userId={userId} />
        )}
        {activeTab === 'tasks' && <TasksContent companyId={companyId} />}
        {/* budget: monthly budget targets vs actuals */}
        {activeTab === 'budget' && <BudgetTab companyId={companyId} />}
        {/* calendar: annual financial calendar */}
        {activeTab === 'calendar' && <CalendarContent companyId={companyId} />}
      </Suspense>
    </div>
  )
}
