// ── /dashboard/operations — Operasyon Merkezi ─────────────────────────────────
//
// Server component. Auth + companyId + userId resolved once.
// Active tab read from ?tab= searchParam → renders real content server-side.

export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { createClient } from '@/lib/supabase-server'
import { resolveCompanyId } from '@/lib/resolve-company'
import { HubTabNav } from '@/app/dashboard/_shared/HubTabNav'
import { OPERATIONS_TABS } from '@/lib/nav-config'
import { ExpensesContent } from './_tabs/ExpensesContent'
import { CatalogContent }  from './_tabs/CatalogContent'
import { StockContent }    from './_tabs/StockContent'

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

const VALID_TABS = OPERATIONS_TABS.map(t => t.key) as string[]
const TABS       = OPERATIONS_TABS.map(t => ({ key: t.key, label: t.label }))

interface PageProps {
  searchParams: Promise<{ tab?: string }>
}

export default async function OperationsPage({ searchParams }: PageProps) {
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
  const rawTab    = params.tab ?? 'expenses'
  const activeTab = VALID_TABS.includes(rawTab) ? rawTab : 'expenses'

  return (
    <div className="max-w-5xl space-y-4">
      <HubTabNav tabs={TABS} activeTab={activeTab} basePath="/dashboard/operations" />

      <Suspense fallback={<TabSkeleton />}>
        {activeTab === 'expenses' && <ExpensesContent companyId={companyId} />}
        {activeTab === 'catalog' && <CatalogContent companyId={companyId} userId={userId} />}
        {activeTab === 'stock'   && <StockContent   companyId={companyId} />}
      </Suspense>
    </div>
  )
}
