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
import { SimulationContent } from './_tabs/SimulationContent'
import { TasksContent }      from './_tabs/TasksContent'

function TabSkeleton() {
  return (
    <div className="space-y-3 animate-pulse">
      <div className="grid grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => <div key={i} className="bg-gray-100 rounded-xl h-16" />)}
      </div>
      <div className="bg-gray-100 rounded-xl h-48" />
      <div className="bg-gray-100 rounded-xl h-32" />
    </div>
  )
}

const VALID_TABS = PLANNING_TABS.map(t => t.key) as string[]
const TABS       = PLANNING_TABS.map(t => ({ key: t.key, label: t.label }))
const SIM_TABS   = ['unit-profit', 'cash-projection', 'scenarios', 'debt-pressure', 'partner-impact']

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
      <div className="text-3xl">⚠️</div>
      <p className="text-sm text-gray-500">Oturum bilgisi alınamadı. Lütfen sayfayı yenileyin.</p>
      <a href="/dashboard/planning" className="text-sm text-violet-600 font-semibold hover:underline">Yeniden Dene</a>
    </div>
  )

  let companyId: string | null = null
  try { companyId = await resolveCompanyId(userId, supabase) } catch { /* non-fatal */ }
  if (!companyId) return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-center px-4">
      <div className="text-3xl">⚠️</div>
      <p className="text-sm text-gray-500">Şirket bilgisi yüklenemedi. Lütfen sayfayı yenileyin.</p>
      <a href="/dashboard/planning" className="text-sm text-violet-600 font-semibold hover:underline">Yeniden Dene</a>
    </div>
  )

  const params    = await searchParams
  const rawTab    = params.tab ?? 'unit-profit'
  const activeTab = VALID_TABS.includes(rawTab) ? rawTab : 'unit-profit'

  return (
    <div className="flex flex-col gap-4 max-w-5xl">
      {/* Sticky tab nav */}
      <div className="sticky top-0 z-20 bg-white/95 backdrop-blur-sm -mx-5 px-5 pt-1 border-b border-gray-100">
        <HubTabNav tabs={TABS} activeTab={activeTab} basePath="/dashboard/planning" />
      </div>

      {/* Tab header */}
      <div>
        <h1 className="text-lg font-black text-gray-900 tracking-tight">Planlama Merkezi</h1>
        <p className="text-xs text-gray-400 mt-0.5">
          {activeTab === 'unit-profit'     && 'Birim karlılık · Marj analizi · Fiyat optimizasyonu'}
          {activeTab === 'cash-projection' && 'Nakit projeksiyonu · 12 ay görünümü · Senaryo bazlı'}
          {activeTab === 'scenarios'       && 'Senaryo planlama · Duyarlılık analizi · Stres testleri'}
          {activeTab === 'debt-pressure'   && 'Borç baskısı · Servis oranı · Tranche takvimi'}
          {activeTab === 'partner-impact'  && 'Ortak etkisi · Eşitleme hesabı · Dağıtım analizi'}
          {activeTab === 'tasks'           && 'Görev takibi · Vadesi yaklaşan · Öncelik sırası'}
        </p>
      </div>

      <Suspense fallback={<TabSkeleton />}>
        {SIM_TABS.includes(activeTab) && (
          <SimulationContent companyId={companyId} userId={userId} activeTab={activeTab as 'unit-profit' | 'cash-projection' | 'scenarios' | 'debt-pressure' | 'partner-impact'} />
        )}
        {activeTab === 'tasks' && <TasksContent companyId={companyId} />}
      </Suspense>
    </div>
  )
}
