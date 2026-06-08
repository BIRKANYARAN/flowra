export const dynamic = 'force-dynamic'

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

import { PnlTab }           from './_tabs/PnlTab'
import { BalanceTab }       from './_tabs/BalanceTab'
import { CashflowTab }      from './_tabs/CashflowTab'
import { TaxTab }           from './_tabs/TaxTab'
import { RisksTab }         from './_tabs/RisksTab'
import { CFOTab }           from './_tabs/CFOTab'
import { BoardPackTab }     from './_tabs/BoardPackTab'
import { CorporateTaxTab }  from './_tabs/CorporateTaxTab'
import { FinanceContextBar } from './_shared/FinanceContextBar'
import { DetailSection }     from '@/components/dashboard/DetailSection'
import ReportsTab        from '@/app/dashboard/cfo/_tabs/ReportsTab'
import { TrialBalanceTab } from '@/app/dashboard/cfo/_tabs/TrialBalanceTab'

// ── Valid tabs ─────────────────────────────────────────────────────────────────

type FinanceTab = 'pnl' | 'balance' | 'cashflow' | 'tax' | 'kurumlar-vergisi' | 'risks' | 'cfo' | 'boardpack' | 'reports' | 'mizan'

const VALID_TABS: FinanceTab[] = ['pnl', 'balance', 'cashflow', 'tax', 'kurumlar-vergisi', 'risks', 'cfo', 'boardpack', 'reports', 'mizan']

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
  cfo:       { title: 'CFO Cockpit',          sub: 'Muhasebe doğruluğu · Çeyreklik · Dönem yönetimi · Mizan' },
  mizan:     { title: 'Mizan',                sub: 'Hesap Kodları · Borç/Alacak Bakiyeleri · Denge Kontrolü' },
  boardpack: { title: 'Yönetim Paketi',       sub: 'Tüm finansal tablolar · Rasyolar · Uyarılar · Belgeler' },
  reports:   { title: 'CFO Raporlama Paketi', sub: 'Aylık CFO paketi · Tüm raporlar · ZIP indirme' },
}

// ── Loading skeleton ───────────────────────────────────────────────────────────

function TabSkeleton() {
  return (
    <div className="space-y-3 animate-pulse">
      <div className="grid grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-[#f1f5f9] rounded h-16" />
        ))}
      </div>
      <div className="bg-[#f1f5f9] rounded h-48" />
      <div className="bg-[#f1f5f9] rounded h-32" />
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
  if (!userId) return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-center px-4">
      <div className="text-3xl">⚠️</div>
      <p className="text-sm text-[#64748b]">Oturum bilgisi alınamadı. Lütfen sayfayı yenileyin.</p>
      <a href="/dashboard/finance" className="text-sm text-brand-light font-semibold hover:underline">Yeniden Dene</a>
    </div>
  )

  let companyId: string | null = null
  try { companyId = await resolveCompanyId(userId, supabase) } catch { /* non-fatal */ }
  if (!companyId) return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-center px-4">
      <div className="text-3xl">⚠️</div>
      <p className="text-sm text-[#64748b]">Şirket bilgisi yüklenemedi. Lütfen sayfayı yenileyin.</p>
      <a href="/dashboard/finance" className="text-sm text-brand-light font-semibold hover:underline">Yeniden Dene</a>
    </div>
  )

  // ── Tab resolution — legacy redirects (server-side, no flash) ────────────────
  const params = await searchParams
  const rawTab = params.tab ?? 'pnl'

  // Legacy tabs absorbed into other pages
  if (rawTab === 'overview')  redirect('/dashboard')
  if (rawTab === 'forecast')  redirect('/dashboard/finance?tab=cashflow')
  if (rawTab === 'quarterly') redirect('/dashboard/finance?tab=cfo')

  // Faz 3 merge — fewer top tabs. Merged tabs render inside the canonical tab's
  // "Detaylı" panel, so old deep-links still land on the right content.
  const TAB_MERGE: Record<string, FinanceTab> = {
    'kurumlar-vergisi': 'tax',     // Kurumlar Vergisi now under Vergi (Detaylı)
    boardpack:          'reports', // Yönetim Paketi now under Raporlar (Detaylı)
    mizan:              'reports', // Mizan now under Raporlar (Detaylı)
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
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-1">Finans Merkezi</div>
          <h1 className="text-2xl font-black tracking-tight text-[#0f172a] leading-tight">{meta.title}</h1>
          <p className="text-sm text-[#94a3b8] mt-1">{meta.sub}</p>
        </div>
        {activeTab === 'cfo' && (
          <Link href="/dashboard/cfo/period-close"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded bg-brand-light text-white text-xs font-semibold hover:bg-brand transition-colors">
            Dönem Kapat
          </Link>
        )}
        {activeTab === 'tax' && (
          <Link href="/dashboard/cfo/tax/kdv"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded border border-[#e2e8f0] text-[#334155] text-xs font-semibold hover:bg-[#f8fafc] transition-colors">
            KDV Beyanı →
          </Link>
        )}
      </div>

      {/* ── Tab nav + persistent context bar (sticky together) ──────────────────── */}
      <div className="sticky top-0 z-20 bg-white/95 backdrop-blur-sm -mx-4">
        <div className="px-5 pt-1 border-b border-[#e2e8f0]">
          <UnifiedTabNav tabs={FINANCE_NAV_TABS} activeTab={activeTab} basePath="/dashboard/finance" />
        </div>
        <div className="px-5">
          <FinanceContextBar companyId={companyId} />
        </div>
      </div>

      {/* ── GL mode indicator ─────────────────────────────────────────────────── */}
      {glMode === 'shadow' && (
        <div className="flex items-center gap-2.5 px-3.5 py-2.5 bg-warn-light border border-warn-light rounded text-xs">
          <span className="text-warn text-base leading-none">⚠</span>
          <div>
            <span className="font-bold text-warn-text">Muhasebe kaynağı: Operasyonel tablolar</span>
            <span className="text-warn-text ml-2">— Çift taraflı muhasebe (GL) henüz aktif değil. Bilanço ve mizan boş görünebilir.</span>
          </div>
          <Link href="/dashboard/cfo/reconciliation"
            className="ml-auto shrink-0 text-warn-text font-semibold hover:underline whitespace-nowrap">
            GL Aktive Et →
          </Link>
        </div>
      )}
      {glMode === 'parallel' && (
        <div className="flex items-center gap-2.5 px-3.5 py-2.5 bg-info-light border border-info-light rounded text-xs">
          <span className="text-info text-base leading-none">ℹ</span>
          <span className="font-bold text-info-text">Muhasebe kaynağı: Paralel mod</span>
          <span className="text-info ml-1">— GL journal yazılıyor ancak raporlama hâlâ operasyonel tablolardan.</span>
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
        {activeTab === 'risks'             && <RisksTab         {...tabProps} />}
        {activeTab === 'cfo'       && <CFOTab      {...tabProps} />}
        {activeTab === 'reports' && (
          <div className="space-y-5">
            <ReportsTab />
            {/* Faz 3 merge — Mizan + Yönetim Paketi co-located under Raporlar */}
            <DetailSection title="Mizan & Yönetim Paketi" subtitle="Trial balance · yönetim kurulu paketi">
              <TrialBalanceTab />
              <BoardPackTab {...tabProps} />
            </DetailSection>
          </div>
        )}
      </Suspense>

    </div>
  )
}
