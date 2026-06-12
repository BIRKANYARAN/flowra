// ── /dashboard/operations — Operasyon Merkezi ─────────────────────────────────
//
// Server component. Auth + companyId + userId resolved once.
// Active tab read from ?tab= searchParam → renders real content server-side.

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Operasyon' }

import { Suspense } from 'react'
import { createClient } from '@/lib/supabase-server'
import { resolveCompanyId } from '@/lib/resolve-company'
import { HubTabNav } from '@/app/dashboard/_shared/HubTabNav'
import { OPERATIONS_TABS } from '@/lib/nav-config'
import { OperationsContextBar } from './_shared/OperationsContextBar'
import { HubHeroAction, type HeroAction } from '@/components/dashboard/HubHeroAction'
import { KomutaContent }  from './_tabs/KomutaContent'
import { ExpensesContent } from './_tabs/ExpensesContent'
import { CatalogContent }  from './_tabs/CatalogContent'
import { StockContent }    from './_tabs/StockContent'
import { OrdersContent }   from './_tabs/OrdersContent'
import {
  classifyOpsPulse,
  buildPulseSummary,
  type OpsPulseMetrics,
  type PulseColor,
} from '@/lib/services/ops/ops-pulse.service'
import { OpsCommandService, type DailyOpsMetrics } from '@/lib/services/intelligence/ops-command.service'

// ── OPS Komuta Paneli ─────────────────────────────────────────────────────────
// Maps the existing OpsCommandService.getDailyMetrics() output (DailyOpsMetrics)
// onto the OpsPulseMetrics shape consumed by the pulse banner. Field re-mapping
// only — no new metrics, queries, or calculations.
function toPulseMetrics(d: DailyOpsMetrics): OpsPulseMetrics {
  return {
    today_sales_count:    d.sales_today_count,
    today_sales_try:      d.sales_today_try,
    overdue_collections:  d.collections_overdue_count,
    overdue_try:          d.collections_overdue_try,
    critical_stock_items: d.stock_critical_count,
    pending_purchases:    d.pending_purchase_orders,
    open_tasks:           d.expenses_pending_approval,
    fill_rate_pct:        d.fill_rate_pct,
  }
}

const PULSE_BADGE: Record<PulseColor, { bg: string; text: string; dot: string; label: string }> = {
  green:  { bg: 'bg-[#dcfce7]', text: 'text-[#15803d]', dot: 'bg-[#22c55e]', label: 'YEŞİL' },
  yellow: { bg: 'bg-[#fef9c3]', text: 'text-[#854d0e]', dot: 'bg-[#eab308]', label: 'SARI'  },
  red:    { bg: 'bg-[#fee2e2]', text: 'text-[#b91c1c]', dot: 'bg-[#ef4444]', label: 'KIRMIZI' },
}

async function OpsCommandPanel({ companyId }: { companyId: string }) {
  const supabase = createClient()
  let m: OpsPulseMetrics
  try {
    const daily = await new OpsCommandService(supabase).getDailyMetrics(companyId)
    m = toPulseMetrics(daily)
  } catch {
    return null
  }
  const pulse   = classifyOpsPulse(m)
  const summary = buildPulseSummary(m)
  const badge   = PULSE_BADGE[pulse]

  return (
    <div className="border border-[#e8eaef] rounded-lg overflow-hidden shadow-sm">
      {/* Header row */}
      <div className="flex items-center justify-between gap-3 px-5 py-3 bg-[#0f172a]">
        <span className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">
          Operasyon Paneli
        </span>
        <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${badge.bg} ${badge.text}`}>
          <span className={`w-2 h-2 rounded-full ${badge.dot}`} />
          {badge.label}
        </span>
      </div>

      {/* Summary line */}
      <div className="px-5 py-2.5 bg-[#1e293b] border-b border-[#334155]">
        <p className="text-[0.8rem] text-[#94a3b8] leading-snug">{summary}</p>
      </div>

      {/* KPI cards row */}
      <div className="grid grid-cols-2 sm:grid-cols-5 divide-x divide-y sm:divide-y-0 divide-[#e8eaef] bg-white">
        {/* Bugün */}
        <div className="px-4 py-4">
          <div className="text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8] mb-1">Bugün</div>
          <div className="text-xl font-black text-[#0f172a]">
            ₺{(m.today_sales_try / 1000).toFixed(0)}K
          </div>
          <div className="text-xs text-[#64748b] mt-0.5">{m.today_sales_count} satış</div>
        </div>

        {/* Geciken */}
        <div className="px-4 py-4">
          <div className="text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8] mb-1">Geciken</div>
          <div className={`text-xl font-black ${m.overdue_try > 0 ? 'text-[#ef4444]' : 'text-[#22c55e]'}`}>
            ₺{(m.overdue_try / 1000).toFixed(0)}K
          </div>
          <div className="text-xs text-[#64748b] mt-0.5">{m.overdue_collections} müşteri</div>
        </div>

        {/* Kritik Stok */}
        <div className="px-4 py-4">
          <div className="text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8] mb-1">Kritik</div>
          <div className={`text-xl font-black ${m.critical_stock_items > 0 ? 'text-[#f97316]' : 'text-[#22c55e]'}`}>
            {m.critical_stock_items} Stok
          </div>
          <div className="text-xs text-[#64748b] mt-0.5">Ürün uyarı</div>
        </div>

        {/* Doluluk */}
        <div className="px-4 py-4">
          <div className="text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8] mb-1">Doluluk</div>
          <div className={`text-xl font-black ${m.fill_rate_pct >= 95 ? 'text-[#22c55e]' : m.fill_rate_pct >= 80 ? 'text-[#eab308]' : 'text-[#ef4444]'}`}>
            %{m.fill_rate_pct.toFixed(1)}
          </div>
          <div className="text-xs text-[#64748b] mt-0.5">Oranı</div>
        </div>

        {/* Açık Görev */}
        <div className="px-4 py-4 col-span-2 sm:col-span-1">
          <div className="text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8] mb-1">Açık</div>
          <div className={`text-xl font-black ${m.open_tasks > 0 ? 'text-[#6366f1]' : 'text-[#22c55e]'}`}>
            {m.open_tasks} Görev
          </div>
          <div className="text-xs text-[#64748b] mt-0.5">Bekliyor</div>
        </div>
      </div>
    </div>
  )
}

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
      <p className="text-sm text-[#64748b]">Oturum bilgisi alınamadı. Lütfen sayfayı yenileyin.</p>
      <a href="/dashboard/operations" className="text-sm text-brand-light font-semibold hover:underline">Yeniden Dene</a>
    </div>
  )

  let companyId: string | null = null
  try { companyId = await resolveCompanyId(userId, supabase) } catch { /* non-fatal */ }
  if (!companyId) return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-center px-4">
      <div className="text-3xl">⚠️</div>
      <p className="text-sm text-[#64748b]">Şirket bilgisi yüklenemedi. Lütfen sayfayı yenileyin.</p>
      <a href="/dashboard/operations" className="text-sm text-brand-light font-semibold hover:underline">Yeniden Dene</a>
    </div>
  )

  const params    = await searchParams
  const rawTab    = params.tab ?? 'komuta'
  const activeTab = VALID_TABS.includes(rawTab) ? rawTab : 'komuta'

  const opTitles: Record<string, string> = {
    komuta:   'Genel Bakış',
    expenses: 'Giderler',
    catalog:  'Katalog',
    stock:    'Stok',
    orders:   'Siparişler',
  }
  const opSubs: Record<string, string> = {
    komuta:   'Günlük komuta · Vadesi geçmiş · Kritik stok · Açık onaylar',
    expenses: 'Gider yönetimi · Ödenmiş/bekleyen · Kategori analizi',
    catalog:  'Ürün kataloğu · Fiyat yönetimi · Stok seviyeleri',
    stock:    'Stok durumu · FIFO değerleme · Kritik seviyeler',
    orders:   'Sipariş takibi · Tedarikçi süreçleri · Teslimat durumu',
  }
  // Per-tab primary action surfaced in the hero (top), not buried in the table.
  const opActions: Record<string, HeroAction | null> = {
    komuta:   null,
    expenses: { label: '+ Masraf Ekle', href: '/dashboard/operations?tab=expenses&new=1' },
    catalog:  { label: '+ Yeni Ürün',   href: '/dashboard/operations?tab=catalog&new=1' },
    stock:    null,
    orders:   null,
  }

  return (
    <div className="flex flex-col gap-5 max-w-5xl">

      {/* PAGE HERO */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-1">Operasyon Merkezi</div>
          <h1 className="text-2xl font-black tracking-tight text-[#0f172a] leading-tight">
            {opTitles[activeTab] ?? 'Operasyon'}
          </h1>
          <p className="text-sm text-[#94a3b8] mt-1">{opSubs[activeTab] ?? ''}</p>
        </div>
        <HubHeroAction action={opActions[activeTab]} />
      </div>

      {/* Sticky tab nav + context bar */}
      <div className="sticky top-0 z-20 bg-white/95 backdrop-blur-sm -mx-4">
        <div className="px-5 pt-1 border-b border-[#e8eaef]">
          <HubTabNav tabs={TABS} activeTab={activeTab} basePath="/dashboard/operations" />
        </div>
        <OperationsContextBar companyId={companyId} />
      </div>

      {/* OPS COMMAND PANEL — always visible at the top */}
      <Suspense fallback={<div className="h-[132px] fl-shimmer rounded-lg" />}>
        <OpsCommandPanel companyId={companyId} />
      </Suspense>

      <Suspense fallback={<TabSkeleton />}>
        {activeTab === 'komuta'   && <KomutaContent  companyId={companyId} />}
        {activeTab === 'expenses' && <ExpensesContent companyId={companyId} />}
        {activeTab === 'catalog'  && <CatalogContent companyId={companyId} userId={userId} />}
        {activeTab === 'stock'    && <StockContent   companyId={companyId} userId={userId} />}
        {activeTab === 'orders'   && <OrdersContent  companyId={companyId} />}
      </Suspense>
    </div>
  )
}
