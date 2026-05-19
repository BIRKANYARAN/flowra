// ── /dashboard/operations — Operasyon Merkezi ─────────────────────────────────
//
// Server component. Auth + companyId + userId resolved once.
// Active tab read from ?tab= searchParam → renders real content server-side.

export const dynamic = 'force-dynamic'

import { Suspense } from 'react'
import { createClient } from '@/lib/supabase-server'
import { resolveCompanyId } from '@/lib/resolve-company'
import { HubTabNav } from '@/app/dashboard/_shared/HubTabNav'
import { OPERATIONS_TABS } from '@/lib/nav-config'
import { OperationsContextBar } from './_shared/OperationsContextBar'
import { ExpensesContent } from './_tabs/ExpensesContent'
import { CatalogContent }  from './_tabs/CatalogContent'
import { StockContent }    from './_tabs/StockContent'
import { OrdersContent }   from './_tabs/OrdersContent'

function TabSkeleton() {
  return (
    <div className="space-y-3 animate-pulse">
      <div className="grid grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => <div key={i} className="bg-gray-100 rounded h-16" />)}
      </div>
      <div className="bg-gray-100 rounded h-48" />
      <div className="bg-gray-100 rounded h-32" />
    </div>
  )
}

const VALID_TABS = OPERATIONS_TABS.map(t => t.key) as string[]
const TABS       = OPERATIONS_TABS.map(t => ({ key: t.key, label: t.label }))

interface PageProps {
  searchParams: Promise<{ tab?: string }>
}

export default async function OperationsPage({ searchParams }: PageProps) {
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
      <a href="/dashboard/operations" className="text-sm text-primary-600 font-semibold hover:underline">Yeniden Dene</a>
    </div>
  )

  let companyId: string | null = null
  try { companyId = await resolveCompanyId(userId, supabase) } catch { /* non-fatal */ }
  if (!companyId) return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-center px-4">
      <div className="text-3xl">⚠️</div>
      <p className="text-sm text-gray-500">Şirket bilgisi yüklenemedi. Lütfen sayfayı yenileyin.</p>
      <a href="/dashboard/operations" className="text-sm text-primary-600 font-semibold hover:underline">Yeniden Dene</a>
    </div>
  )

  const params    = await searchParams
  const rawTab    = params.tab ?? 'expenses'
  const activeTab = VALID_TABS.includes(rawTab) ? rawTab : 'expenses'

  const opTitles: Record<string, string> = {
    expenses: 'Giderler', catalog: 'Katalog', stock: 'Stok', orders: 'Siparişler',
  }
  const opSubs: Record<string, string> = {
    expenses: 'Gider yönetimi · Ödenmiş/bekleyen · Kategori analizi',
    catalog:  'Ürün kataloğu · Fiyat yönetimi · Stok seviyeleri',
    stock:    'Stok durumu · FIFO değerleme · Kritik seviyeler',
    orders:   'Sipariş takibi · Tedarikçi süreçleri · Teslimat durumu',
  }

  return (
    <div className="flex flex-col gap-5 max-w-5xl">

      {/* PAGE HERO */}
      <div>
        <div className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1">Operasyon Merkezi</div>
        <h1 className="text-2xl font-black tracking-tight text-gray-900 leading-tight">
          {opTitles[activeTab] ?? 'Operasyon'}
        </h1>
        <p className="text-sm text-gray-400 mt-1">{opSubs[activeTab] ?? ''}</p>
      </div>

      {/* Sticky tab nav + context bar */}
      <div className="sticky top-0 z-20 bg-white/95 backdrop-blur-sm -mx-4">
        <div className="px-5 pt-1 border-b border-gray-100">
          <HubTabNav tabs={TABS} activeTab={activeTab} basePath="/dashboard/operations" />
        </div>
        <OperationsContextBar companyId={companyId} />
      </div>

      <Suspense fallback={<TabSkeleton />}>
        {activeTab === 'expenses' && <ExpensesContent companyId={companyId} />}
        {activeTab === 'catalog'  && <CatalogContent companyId={companyId} userId={userId} />}
        {activeTab === 'stock'    && <StockContent   companyId={companyId} userId={userId} />}
        {activeTab === 'orders'   && <OrdersContent  companyId={companyId} />}
      </Suspense>
    </div>
  )
}
