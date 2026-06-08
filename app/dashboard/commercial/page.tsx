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
import { CommercialContextBar } from './_shared/CommercialContextBar'

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
import { PipelineContent }    from './_tabs/PipelineContent'
import { ProformasContent }   from './_tabs/ProformasContent'
import { DetailSection }      from '@/components/dashboard/DetailSection'
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
      
      <p className="text-xs text-[#64748b]">Oturum bilgisi alınamadı. Lütfen sayfayı yenileyin.</p>
      <a href="/dashboard/commercial" className="text-xs text-brand-light font-semibold hover:underline">Yeniden Dene</a>
    </div>
  )

  let companyId: string | null = null
  try { companyId = await resolveCompanyId(userId, supabase) } catch { /* non-fatal */ }
  if (!companyId) return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-center px-4">
      
      <p className="text-xs text-[#64748b]">Şirket bilgisi yüklenemedi. Lütfen sayfayı yenileyin.</p>
      <a href="/dashboard/commercial" className="text-xs text-brand-light font-semibold hover:underline">Yeniden Dene</a>
    </div>
  )

  const params    = await searchParams
  const rawTab    = params.tab ?? 'pipeline'
  const activeTab = VALID_TABS.includes(rawTab) ? rawTab : 'pipeline'

  const tabSubtitles: Record<string, string> = {
    pipeline:    'Satış hattı · Açık teklifler · Kapanmaya yakın fırsatlar',
    proformas:   'Proforma teklifler · Bekleyen onaylar · Dönüşüm oranları',
    sales:       'Satış kayıtları · Fatura özeti · Ödeme durumu',
    collections: 'Tahsilat takibi · Vadesi gelen ödemeler · Yaşlandırma',
    customers:   'Müşteri portföyü · İlişki geçmişi · Alacak durumu',
  }
  const tabTitles: Record<string, string> = {
    pipeline: 'Satış Hattı', proformas: 'Proformalar', sales: 'Satışlar',
    collections: 'Tahsilatlar', customers: 'Müşteriler',
  }

  return (
    <div className="flex flex-col gap-5 max-w-5xl">

      {/* PAGE HERO */}
      <div>
        <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-1">Ticari Akış Merkezi</div>
        <h1 className="text-2xl font-black tracking-tight text-[#0f172a] leading-tight">
          {tabTitles[activeTab] ?? 'Ticari Akış'}
        </h1>
        <p className="text-xs text-[#94a3b8] mt-0.5">{tabSubtitles[activeTab] ?? ''}</p>
      </div>

      {/* Sticky tab nav + context bar */}
      <div className="sticky top-0 z-20 bg-white/95 backdrop-blur-sm -mx-4">
        <div className="px-4 pt-1 border-b border-[#e8eaef]">
          <HubTabNav tabs={TABS} activeTab={activeTab} basePath="/dashboard/commercial" />
        </div>
        <CommercialContextBar companyId={companyId} />
      </div>

      <Suspense fallback={<TabSkeleton />}>
        {activeTab === 'pipeline'    && (
          <div className="space-y-4">
            <PipelineContent  companyId={companyId} />
            {/* Proformalar — co-located in the sales pipeline (teklif → satış lifecycle),
                folded so the tab opens on the pipeline view; expands on demand. */}
            <DetailSection title="Teklifler (Proformalar)" subtitle="Tüm teklifler · dönüşüm analizi · son 90 gün">
              <ProformasContent companyId={companyId} />
            </DetailSection>
          </div>
        )}
        {activeTab === 'sales'       && <SalesContent       companyId={companyId} />}
        {activeTab === 'collections' && <CollectionsContent companyId={companyId} />}
        {activeTab === 'customers'   && <CustomersContent   companyId={companyId} />}
      </Suspense>
    </div>
  )
}
