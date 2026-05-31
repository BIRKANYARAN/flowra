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

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: 'calendar',    label: 'Takvim',              icon: '📅' },
  { id: 'actions',     label: 'Kurumsal Aksiyonlar', icon: '🏛️' },
  { id: 'resolutions', label: 'Kararlar',            icon: '⚖️' },
  { id: 'audit',       label: 'Denetim Hazırlığı',  icon: '✅' },
  { id: 'exports',     label: 'Veri Dışa Aktarma',  icon: '📦' },
  { id: 'commitments', label: 'Taahhütler',          icon: '📋' },
  { id: 'decisions',    label: 'Karar Geçmişi',       icon: '🧠' },
  { id: 'audit-trail', label: 'Denetim İzi',          icon: '🔍' },
  { id: 'capital',     label: 'Sermaye Hesapları',    icon: '💰' },
]

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function GovernancePage() {
  const searchParams = useSearchParams()
  const router       = useRouter()
  const activeTab    = (searchParams.get('tab') ?? 'calendar') as TabId

  function setTab(id: TabId) {
    router.replace(`/dashboard/governance?tab=${id}`, { scroll: false })
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-xl font-bold text-gray-900">Yönetişim Merkezi</h1>
        <p className="text-sm text-gray-500 mt-1">
          Kurumsal takvim, aksiyon kaydı ve karar defteri
        </p>
      </div>

      {/* Tab nav */}
      <div className="flex gap-1 border-b border-gray-200">
        {TABS.map(t => (
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
        {activeTab === 'audit'       && <AuditReadinessTab />}
        {activeTab === 'exports'     && <ExportsTab />}
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
