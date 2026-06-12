// ── /dashboard/commercial — Ticari Akış Merkezi ───────────────────────────────
//
// Server component. Auth + companyId resolved once.
// Active tab read from ?tab= searchParam → renders real content server-side.

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Satış' }

import { Suspense } from 'react'
import { createClient } from '@/lib/supabase-server'
import { resolveCompanyId } from '@/lib/resolve-company'
import { HubTabNav } from '@/app/dashboard/_shared/HubTabNav'
import { COMMERCIAL_TABS } from '@/lib/nav-config'
import { CommercialContextBar } from './_shared/CommercialContextBar'
import { HubHeroAction, type HeroAction } from '@/components/dashboard/HubHeroAction'

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

  const params  = await searchParams
  // Legacy deep-links: ?tab=pipeline → ozet, ?tab=proformas → teklifler.
  const aliases: Record<string, string> = { pipeline: 'ozet', proformas: 'teklifler' }
  const rawTab    = aliases[params.tab ?? ''] ?? params.tab ?? 'ozet'
  const activeTab = VALID_TABS.includes(rawTab) ? rawTab : 'ozet'

  const tabSubtitles: Record<string, string> = {
    ozet:        'Satış hattı sağlığı · Açık teklifler · Kapanmaya yakın fırsatlar',
    teklifler:   'Proforma teklifler · Bekleyen onaylar · Dönüşüm oranları',
    sales:       'Satış kayıtları · Fatura özeti · Ödeme durumu',
    collections: 'Tahsilat takibi · Vadesi gelen ödemeler · Yaşlandırma',
    customers:   'Müşteri portföyü · İlişki geçmişi · Alacak durumu',
  }
  const tabTitles: Record<string, string> = {
    ozet: 'Satış Özeti', teklifler: 'Teklifler', sales: 'Satışlar',
    collections: 'Tahsilatlar', customers: 'Müşteriler',
  }
  // Per-tab primary action surfaced in the hero (top), not buried in the table.
  const tabActions: Record<string, HeroAction | null> = {
    ozet:        { label: '+ Yeni Teklif',   href: '/dashboard/proformas/new' },
    teklifler:   { label: '+ Yeni Proforma', href: '/dashboard/proformas/new' },
    sales:       { label: '+ Yeni Satış',    href: '/dashboard/commercial?tab=sales&new=1' },
    collections: null,
    customers:   { label: '+ Yeni Müşteri',  href: '/dashboard/commercial?tab=customers&new=1' },
  }

  return (
    <div className="flex flex-col gap-5 max-w-5xl">

      {/* PAGE HERO */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-1">Ticari Akış Merkezi</div>
          <h1 className="text-2xl font-black tracking-tight text-[#0f172a] leading-tight">
            {tabTitles[activeTab] ?? 'Ticari Akış'}
          </h1>
          <p className="text-xs text-[#94a3b8] mt-0.5">{tabSubtitles[activeTab] ?? ''}</p>
        </div>
        <HubHeroAction action={tabActions[activeTab]} />
      </div>

      {/* Sticky tab nav + context bar */}
      <div className="sticky top-0 z-20 bg-white/95 backdrop-blur-sm -mx-4">
        <div className="px-4 pt-1 border-b border-[#e8eaef]">
          <HubTabNav tabs={TABS} activeTab={activeTab} basePath="/dashboard/commercial" />
        </div>
        <CommercialContextBar companyId={companyId} />
      </div>

      <Suspense fallback={<TabSkeleton />}>
        {activeTab === 'ozet'        && <PipelineContent    companyId={companyId} />}
        {activeTab === 'teklifler'   && <ProformasContent   companyId={companyId} />}
        {activeTab === 'sales'       && <SalesContent       companyId={companyId} />}
        {activeTab === 'collections' && <CollectionsContent companyId={companyId} />}
        {activeTab === 'customers'   && <CustomersContent   companyId={companyId} />}
      </Suspense>
    </div>
  )
}
