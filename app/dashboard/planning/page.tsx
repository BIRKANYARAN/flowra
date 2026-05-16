// ── /dashboard/planning — Planlama Merkezi ────────────────────────────────────
//
// Server component. Auth + companyId + userId resolved once.
// Active tab read from ?tab= searchParam → renders real content server-side.

export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { createClient } from '@/lib/supabase-server'
import { resolveCompanyId } from '@/lib/resolve-company'
import { HubTabNav } from '@/app/dashboard/_shared/HubTabNav'
import { PLANNING_TABS } from '@/lib/nav-config'
import { SimulationContent } from './_tabs/SimulationContent'
import { TasksContent }      from './_tabs/TasksContent'

const VALID_TABS = PLANNING_TABS.map(t => t.key) as string[]
const TABS       = PLANNING_TABS.map(t => ({ key: t.key, label: t.label }))
const SIM_TABS   = ['unit-profit', 'cash-projection', 'scenarios', 'debt-pressure', 'partner-impact']

interface PageProps {
  searchParams: Promise<{ tab?: string }>
}

export default async function PlanningPage({ searchParams }: PageProps) {
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
  const rawTab    = params.tab ?? 'unit-profit'
  const activeTab = VALID_TABS.includes(rawTab) ? rawTab : 'unit-profit'

  return (
    <div className="max-w-5xl space-y-4">
      <HubTabNav tabs={TABS} activeTab={activeTab} basePath="/dashboard/planning" />

      <Suspense fallback={<div className="p-8 text-sm text-gray-400">Yükleniyor…</div>}>
        {SIM_TABS.includes(activeTab) && (
          <SimulationContent companyId={companyId} userId={userId} activeTab={activeTab as 'unit-profit' | 'cash-projection' | 'scenarios' | 'debt-pressure' | 'partner-impact'} />
        )}
        {activeTab === 'tasks' && <TasksContent companyId={companyId} />}
      </Suspense>
    </div>
  )
}
