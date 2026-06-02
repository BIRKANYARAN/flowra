'use client'

import { useSearchParams, useRouter } from 'next/navigation'
import { cn } from '@/components/ui'
import AuditReadinessTab     from './_components/AuditReadinessTab'
import ExportsTab            from './_components/ExportsTab'
import CommitmentsTab        from './_components/CommitmentsTab'
import DecisionContextTab    from './_components/DecisionContextTab'
import AuditTrailTab         from './_components/AuditTrailTab'
import AuditHashChainPanel   from './_components/AuditHashChainPanel'
import GovernanceClockTab    from './_components/GovernanceClockTab'
import StakeholderCapitalTab from './_components/StakeholderCapitalTab'
import CorporateActionsTab   from './_components/CorporateActionsTab'
import ResolutionsTab        from './_components/ResolutionsTab'

// ── Types ──────────────────────────────────────────────────────────────────────
type TabId = 'calendar' | 'actions' | 'resolutions' | 'audit' | 'exports' | 'commitments' | 'decisions' | 'audit-trail' | 'capital'

// 8 tabs in 3 groups (exports folded into Denetim Hazırlığı).
const TAB_GROUPS: { label: string; tabs: { id: TabId; label: string; icon: string }[] }[] = [
  { label: 'Kararlar', tabs: [
    { id: 'calendar',    label: 'Takvim',              icon: '📅' },
    { id: 'actions',     label: 'Kurumsal Aksiyonlar', icon: '🏛️' },
    { id: 'resolutions', label: 'Kararlar',            icon: '⚖️' },
    { id: 'decisions',   label: 'Karar Geçmişi',       icon: '🧠' },
  ] },
  { label: 'Sermaye & Taahhüt', tabs: [
    { id: 'commitments', label: 'Taahhütler',          icon: '📋' },
    { id: 'capital',     label: 'Sermaye Hesapları',    icon: '💰' },
  ] },
  { label: 'Denetim', tabs: [
    { id: 'audit',       label: 'Denetim Hazırlığı',  icon: '✅' },
    { id: 'audit-trail', label: 'Denetim İzi',          icon: '🔍' },
  ] },
]

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function GovernancePage() {
  const searchParams = useSearchParams()
  const router       = useRouter()
  const activeTab    = ((searchParams.get('tab') === 'exports' ? 'audit' : (searchParams.get('tab') ?? 'calendar'))) as TabId

  function setTab(id: TabId) {
    router.replace(`/dashboard/governance?tab=${id}`, { scroll: false })
  }

  const activeGroupIdx = Math.max(0, TAB_GROUPS.findIndex(g => g.tabs.some(t => t.id === activeTab)))
  const activeGroup    = TAB_GROUPS[activeGroupIdx]

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-xl font-bold text-gray-900">Yönetişim Merkezi</h1>
        <p className="text-sm text-gray-500 mt-1">
          Kurumsal takvim, aksiyon kaydı ve karar defteri
        </p>
      </div>

      {/* Tab nav — Level 1: section groups */}
      <div className="flex gap-1.5 flex-wrap">
        {TAB_GROUPS.map((g, i) => (
          <button
            key={g.label}
            onClick={() => setTab(g.tabs[0].id)}
            className={cn(
              'px-3.5 py-1.5 text-xs rounded transition-colors',
              i === activeGroupIdx
                ? 'bg-violet-100 text-violet-800 font-black'
                : 'text-gray-500 hover:text-gray-700 font-semibold',
            )}
          >
            {g.label}
          </button>
        ))}
      </div>
      {/* Level 2: sub-tabs of the active group */}
      <div className="flex gap-1 border-b border-gray-200 -mt-3">
        {activeGroup.tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              'px-4 py-2 text-sm font-medium transition-colors -mb-px border-b-2',
              activeTab === t.id
                ? 'border-violet-600 text-violet-700'
                : 'border-transparent text-gray-500 hover:text-gray-700',
            )}
          >
            <span className="mr-1.5">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div>
        {activeTab === 'calendar'    && <GovernanceClockTab />}
        {activeTab === 'actions'     && <CorporateActionsTab />}
        {activeTab === 'resolutions' && <ResolutionsTab />}
        {activeTab === 'audit'       && (
          <div className="space-y-6">
            <AuditReadinessTab />
            {/* Sertifikalı dışa aktarma — low-frequency audit action, co-located with readiness */}
            <ExportsTab />
          </div>
        )}
        {activeTab === 'commitments' && <CommitmentsTab />}
        {activeTab === 'decisions'   && <DecisionContextTab />}
        {activeTab === 'audit-trail' && (
          <div className="space-y-6">
            <AuditHashChainPanel />
            <AuditTrailTab />
          </div>
        )}
        {activeTab === 'capital' && <StakeholderCapitalTab />}
      </div>
    </div>
  )
}
