// ── /dashboard/commercial — Ticari Akış Merkezi ───────────────────────────────
//
// Server component. Auth + companyId resolved once.
// Active tab read from ?tab= searchParam → renders real content server-side.

export const dynamic = 'force-dynamic'

import { Suspense } from 'react'
import { createClient } from '@/lib/supabase-server'
import { resolveCompanyId } from '@/lib/resolve-company'
import { HubTabNav } from '@/app/dashboard/_shared/HubTabNav'
import { COMMERCIAL_TABS } from '@/lib/nav-config'

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
import { PipelineContent }    from './_tabs/PipelineContent'
import { ProformasContent }   from './_tabs/ProformasContent'
import { SalesContent }       from './_tabs/SalesContent'
import { CollectionsContent } from './_tabs/CollectionsContent'
import { CustomersContent }   from './_tabs/CustomersContent'

const VALID_TABS = COMMERCIAL_TABS.map(t => t.key) as string[]
const TABS       = COMMERCIAL_TABS.map(t => ({ key: t.key, label: t.label }))

interface PageProps {
  searchParams: Promise<{ tab?: string }>
}

export default async function CommercialPage({ searchParams }: PageProps) {
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
      <a href="/dashboard/commercial" className="text-sm text-violet-600 font-semibold hover:underline">Yeniden Dene</a>
    </div>
  )

  let companyId: string | null = null
  try { companyId = await resolveCompanyId(userId, supabase) } catch { /* non-fatal */ }
  if (!companyId) return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-center px-4">
      <div className="text-3xl">⚠️</div>
      <p className="text-sm text-gray-500">Şirket bilgisi yüklenemedi. Lütfen sayfayı yenileyin.</p>
      <a href="/dashboard/commercial" className="text-sm text-violet-600 font-semibold hover:underline">Yeniden Dene</a>
    </div>
  )

  const params    = await searchParams
  const rawTab    = params.tab ?? 'pipeline'
  const activeTab = VALID_TABS.includes(rawTab) ? rawTab : 'pipeline'

  return (
    <div className="max-w-5xl space-y-4">
      <HubTabNav tabs={TABS} activeTab={activeTab} basePath="/dashboard/commercial" />

      <Suspense fallback={<TabSkeleton />}>
        {activeTab === 'pipeline'    && <PipelineContent    companyId={companyId} />}
        {activeTab === 'proformas'   && <ProformasContent   companyId={companyId} />}
        {activeTab === 'sales'       && <SalesContent       companyId={companyId} />}
        {activeTab === 'collections' && <CollectionsContent companyId={companyId} />}
        {activeTab === 'customers'   && <CustomersContent   companyId={companyId} />}
      </Suspense>
    </div>
  )
}
