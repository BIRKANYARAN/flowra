// ── /dashboard/commercial — Ticari Akış Merkezi ───────────────────────────────
//
// Server component. Auth + companyId resolved once.
// Active tab read from ?tab= searchParam → renders real content server-side.

export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { createClient } from '@/lib/supabase-server'
import { resolveCompanyId } from '@/lib/resolve-company'
import { HubTabNav } from '@/app/dashboard/_shared/HubTabNav'
import { COMMERCIAL_TABS } from '@/lib/nav-config'
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
  const supabase = createClient()
  let userId: string
  try {
    const { data, error } = await supabase.auth.getUser()
    if (error || !data?.user) redirect('/auth')
    userId = data.user.id
  } catch (e) {
    if (e && typeof e === 'object' && 'digest' in e) throw e
    redirect('/auth')
  }

  let companyId: string
  try { companyId = await resolveCompanyId(userId, supabase) }
  catch { redirect('/auth') }

  const params    = await searchParams
  const rawTab    = params.tab ?? 'pipeline'
  const activeTab = VALID_TABS.includes(rawTab) ? rawTab : 'pipeline'

  return (
    <div className="max-w-5xl space-y-4">
      <HubTabNav tabs={TABS} activeTab={activeTab} basePath="/dashboard/commercial" />

      <Suspense fallback={<div className="p-8 text-sm text-gray-400">Yükleniyor…</div>}>
        {activeTab === 'pipeline'    && <PipelineContent    companyId={companyId} />}
        {activeTab === 'proformas'   && <ProformasContent   companyId={companyId} />}
        {activeTab === 'sales'       && <SalesContent       companyId={companyId} />}
        {activeTab === 'collections' && <CollectionsContent companyId={companyId} />}
        {activeTab === 'customers'   && <CustomersContent   companyId={companyId} />}
      </Suspense>
    </div>
  )
}
