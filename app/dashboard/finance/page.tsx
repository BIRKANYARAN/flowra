export const dynamic = 'force-dynamic'
export const metadata = { title: 'Finans' }

// ═══════════════════════════════════════════════════════════════════════════════
// /dashboard/finance — Financial Intelligence Hub
//
// Route: /dashboard/finance?tab=[tab_id]
//
// Active tabs (6):
//   pnl      → Kâr / Zarar   — Accrual P&L statement
//   balance  → Bilanço        — Balance sheet
//   cashflow → Nakit Akışı   — Cashflow + burn rate + runway + projection
//   tax      → Vergi          — KDV + geçici vergi calendar
//   risks    → Riskler        — AR aging + concentration
//   cfo      → CFO            — CFO cockpit + quarterly + period management
//
// Legacy redirects (server-side, no flash):
//   overview  → /dashboard
//   forecast  → ?tab=cashflow
//   quarterly → ?tab=cfo
//
// Data: each tab is a full RSC that loads its own data.
// Auth: resolved once here, passed as props to all tabs.
// ═══════════════════════════════════════════════════════════════════════════════

import { redirect }          from 'next/navigation'
import { Suspense }          from 'react'
import Link                  from 'next/link'
import { createClient }      from '@/lib/supabase-server'
import { resolveCompanyId }  from '@/lib/resolve-company'
import { UnifiedTabNav }     from '@/app/dashboard/_shared/UnifiedTabNav'
import { FINANCE_TABS }      from '@/lib/nav-config'
import { getGlMode }         from '@/lib/middleware/period-guard'
import { Icon }              from '@/components/ui/Icon'

import { PnlTab }           from './_tabs/PnlTab'
import { BalanceTab }       from './_tabs/BalanceTab'
import { CashflowTab }      from './_tabs/CashflowTab'
import { TaxTab }           from './_tabs/TaxTab'
import { RisksTab }         from './_tabs/RisksTab'
import { CorporateTaxTab }  from './_tabs/CorporateTaxTab'
import { FinanceContextBar } from './_shared/FinanceContextBar'
import { DetailSection }     from '@/components/dashboard/DetailSection'
import { HubFallback }       from '@/components/dashboard/HubFallback'

// ── Valid tabs ─────────────────────────────────────────────────────────────────

// OWNER-first: only the 5 owner views (+ kurumlar-vergisi merge alias). The
// accountant tabs (cfo/boardpack/reports/mizan) MOVED to the Muhasebe zone; their
// old keys are intercepted by the redirects below before this list is consulted.
type FinanceTab = 'pnl' | 'balance' | 'cashflow' | 'tax' | 'kurumlar-vergisi' | 'risks'

const VALID_TABS: FinanceTab[] = ['pnl', 'balance', 'cashflow', 'tax', 'kurumlar-vergisi', 'risks']

// FINANCE_TABS now lives in nav-config (single source shared with the header
// breadcrumb); aliased here to keep the JSX below unchanged.
const FINANCE_NAV_TABS = [...FINANCE_TABS]

// Single flat tab row (FINANCE_TABS) — the 2-level grouping was dropped
// for a clearer "one row of views" model; kurumlar-vergisi/boardpack/mizan remain as
// "Detaylı" panels inside their parent tab (Vergi / Raporlar).

const TAB_META: Record<FinanceTab, { title: string; sub: string }> = {
  pnl:       { title: 'Kâr / Zarar',          sub: 'Ciro · Brüt Kâr · Faaliyet Kârı · Vergi Sonrası Net' },
  balance:   { title: 'Bilanço',               sub: 'Varlıklar · Yükümlülükler · Özsermaye' },
  cashflow:  { title: 'Nakit Akışı',          sub: 'Burn rate · Runway · 12 ay projeksiyon · Baskı haritası' },
  tax:               { title: 'Vergi Merkezi',         sub: 'KDV · Geçici Vergi · Kurumlar Vergisi · Matrah Analizi' },
  'kurumlar-vergisi': { title: 'Kurumlar Vergisi',     sub: 'Yıllık vergi tahmini · Geçici vergi takvimi · Ödeme planı' },
  risks:             { title: 'Risk Analizi',          sub: 'Alacak yaşlandırma · Müşteri konsantrasyonu · HHI Endeksi' },
}

// ── Loading skeleton ───────────────────────────────────────────────────────────

function TabSkeleton() {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="fl-shimmer rounded-lg h-16" />
        ))}
      </div>
      <div className="fl-shimmer rounded-lg h-48" />
      <div className="fl-shimmer rounded-lg h-32" />
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

interface PageProps {
  searchParams: Promise<{ tab?: string }>
}

export default async function FinancePage({ searchParams }: PageProps) {

  // ── Auth — layout.tsx is the single gate; no redirect here ────────────────────
  const supabase = createClient()
  let userId: string | null = null
  try {
    const { data, error } = await supabase.auth.getUser()
    if (!error && data?.user) userId = data.user.id
  } catch (e) {
    if (e && typeof e === 'object' && 'digest' in e) throw e
  }
  if (!userId) return <HubFallback variant="auth" retryHref="/dashboard/finance" />

  let companyId: string | null = null
  try { companyId = await resolveCompanyId(userId, supabase) } catch { /* non-fatal */ }
  if (!companyId) return <HubFallback variant="company" retryHref="/dashboard/finance" />

  // ── Tab resolution — legacy redirects (server-side, no flash) ────────────────
  const params = await searchParams
  const rawTab = params.tab ?? 'pnl'

  // Legacy tabs absorbed into other pages
  if (rawTab === 'overview')  redirect('/dashboard')
  if (rawTab === 'forecast')  redirect('/dashboard/finance?tab=cashflow')

  // Refoundation W3 — accountant depth moved OUT of the owner's Finance hub into
  // the Muhasebe zone. The CFO cockpit + reporting pack (and their mizan/boardpack
  // folds) now live under /dashboard/accounting; old deep-links redirect there.
  // ⚠️ Compatibility shims — DO NOT REMOVE: these intercept the old accountant
  // tab keys (deep-links/bookmarks) before VALID_TABS is consulted and forward
  // them to the Muhasebe zone where those tools now live.
  if (rawTab === 'quarterly' || rawTab === 'cfo') redirect('/dashboard/accounting/cockpit')
  if (rawTab === 'reports' || rawTab === 'boardpack' || rawTab === 'mizan') redirect('/dashboard/accounting/reports')

  // Co-located "Detaylı" panel merges that stay inside Finance.
  const TAB_MERGE: Record<string, FinanceTab> = {
    'kurumlar-vergisi': 'tax',     // Kurumlar Vergisi now under Vergi (Detaylı)
  }
  const mergedTab = TAB_MERGE[rawTab] ?? rawTab
  const activeTab = (VALID_TABS.includes(mergedTab as FinanceTab) ? mergedTab : 'pnl') as FinanceTab
  const meta      = TAB_META[activeTab]

  // ── GL mode — show data source indicator ─────────────────────────────────
  let glMode: string = 'shadow'
  try { glMode = await getGlMode(companyId, supabase) } catch { /* non-fatal */ }

  const tabProps  = { userId, companyId, glMode }

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-5 w-full">

      {/* ── PAGE HERO ─────────────────────────────────────────────────────────── */}
      {/* Owner-first: no accountant CTAs here. Dönem Kapat / KDV Beyanı live in the
          Muhasebe zone (/dashboard/accounting), not the owner's Finans hub. */}
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <div className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8] mb-1">Finans</div>
          <h1 className="text-2xl font-bold tracking-tight text-[#0f172a] leading-tight">{meta.title}</h1>
          <p className="text-sm text-[#94a3b8] mt-1">{meta.sub}</p>
        </div>
      </div>

      {/* ── Tab nav + persistent context bar (sticky together) ──────────────────── */}
      <div className="sticky top-0 z-20 bg-white/95 backdrop-blur-sm -mx-4">
        <div className="px-5 pt-1 border-b border-[#e8eaef]">
          <UnifiedTabNav tabs={FINANCE_NAV_TABS} activeTab={activeTab} basePath="/dashboard/finance" />
        </div>
        <div className="px-5">
          <FinanceContextBar companyId={companyId} />
        </div>
      </div>

      {/* ── Data-source indicator — owner-friendly, plain language ──────────────── */}
      {/* No GL/mizan jargon and no owner→/dashboard/cfo door; the owner is pointed
          to the Muhasebe zone where the accountant turns on formal accounting. */}
      {glMode === 'shadow' && (
        <div className="flex items-center gap-2.5 px-3.5 py-2.5 bg-warn-light border border-warn-light rounded text-xs">
          <Icon name="info" size={16} className="text-warn shrink-0" />
          <div>
            <span className="font-bold text-warn-text">Bilanço ve resmi tablolar hazırlanıyor</span>
            <span className="text-warn-text ml-2">— Muhasebe bağlantısı tamamlandığında otomatik dolacak.</span>
          </div>
          <Link href="/dashboard/accounting"
            className="ml-auto shrink-0 text-warn-text font-semibold hover:underline whitespace-nowrap">
            Muhasebe →
          </Link>
        </div>
      )}
      {glMode === 'parallel' && (
        <div className="flex items-center gap-2.5 px-3.5 py-2.5 bg-info-light border border-info-light rounded text-xs">
          <Icon name="info" size={16} className="text-info shrink-0" />
          <span className="font-bold text-info-text">Muhasebe bağlantısı etkin</span>
          <span className="text-info ml-1">— Resmi mali tablolar hazırlanıyor.</span>
        </div>
      )}

      {/* ── Active tab content ────────────────────────────────────────────────── */}
      <Suspense fallback={<div className="mt-5"><TabSkeleton /></div>}>
        {activeTab === 'pnl'       && <PnlTab      {...tabProps} />}
        {activeTab === 'balance'   && <BalanceTab  {...tabProps} />}
        {activeTab === 'cashflow'  && <CashflowTab {...tabProps} />}
        {activeTab === 'tax' && (
          <div className="space-y-5">
            <TaxTab {...tabProps} />
            {/* Faz 3 merge — Kurumlar Vergisi co-located under Vergi */}
            <DetailSection title="Kurumlar Vergisi" subtitle="Kurumlar vergisi matrahı ve hesaplaması">
              <CorporateTaxTab {...tabProps} />
            </DetailSection>
          </div>
        )}
        {activeTab === 'risks'     && <RisksTab     {...tabProps} />}
      </Suspense>

    </div>
  )
}
