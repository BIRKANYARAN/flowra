export const dynamic = 'force-dynamic'

// ═══════════════════════════════════════════════════════════════════════════════
// /dashboard/finance — Financial Intelligence Hub
//
// Route: /dashboard/finance?tab=[tab_id]
//
// Tabs:
//   overview  → Genel Finans   — CEO liquidity cockpit
//   pnl       → Kâr / Zarar   — Accrual P&L statement
//   balance   → Bilanço        — Balance sheet
//   cashflow  → Nakit Akışı   — Cashflow timeline + scenario
//   tax       → Vergi          — KDV + geçici vergi calendar
//   risks     → Riskler        — AR aging + concentration
//   forecast  → Tahmin         — Runway projection
//   quarterly → Çeyreklik      — YTD + quarter grid
//   cfo       → CFO            — CFO cockpit + period management
//
// Data: each tab is a full RSC that loads its own data.
// Auth: resolved once here, passed as props to all tabs.
// ═══════════════════════════════════════════════════════════════════════════════

import { redirect }          from 'next/navigation'
import { Suspense }          from 'react'
import { createClient }      from '@/lib/supabase-server'
import { resolveCompanyId }  from '@/lib/resolve-company'
import { UnifiedTabNav }     from '@/app/dashboard/_shared/UnifiedTabNav'

import { OverviewTab }   from './_tabs/OverviewTab'
import { PnlTab }        from './_tabs/PnlTab'
import { BalanceTab }    from './_tabs/BalanceTab'
import { CashflowTab }   from './_tabs/CashflowTab'
import { TaxTab }        from './_tabs/TaxTab'
import { RisksTab }      from './_tabs/RisksTab'
import { ForecastTab }   from './_tabs/ForecastTab'
import { QuarterlyTab }  from './_tabs/QuarterlyTab'
import { CFOTab }        from './_tabs/CFOTab'

// ── Valid tabs ─────────────────────────────────────────────────────────────────

type FinanceTab = 'overview' | 'pnl' | 'balance' | 'cashflow' | 'tax' | 'risks' | 'forecast' | 'quarterly' | 'cfo'

const VALID_TABS: FinanceTab[] = [
  'overview', 'pnl', 'balance', 'cashflow', 'tax', 'risks', 'forecast', 'quarterly', 'cfo',
]

const FINANCE_NAV_TABS = [
  { key: 'overview',  label: 'Genel'      },
  { key: 'pnl',       label: 'Kâr/Zarar'  },
  { key: 'balance',   label: 'Bilanço'    },
  { key: 'cashflow',  label: 'Nakit'      },
  { key: 'tax',       label: 'Vergi'      },
  { key: 'risks',     label: 'Riskler'    },
  { key: 'forecast',  label: 'Tahmin'     },
  { key: 'quarterly', label: 'Çeyreklik'  },
  { key: 'cfo',       label: 'CFO'        },
]

const TAB_META: Record<FinanceTab, { title: string; sub: string }> = {
  overview:  { title: 'Genel Finans',   sub: 'Likidite · Tahsilat · Risk Matrisi · Nakit Projeksiyonu' },
  pnl:       { title: 'Kâr / Zarar',   sub: 'Ciro · Brüt Kâr · Faaliyet Kârı · Vergi Sonrası Net' },
  balance:   { title: 'Bilanço',        sub: 'Varlıklar · Yükümlülükler · Özsermaye' },
  cashflow:  { title: 'Nakit Akışı',   sub: '12 aylık tahsilat · gider · baskı haritası · senaryo' },
  tax:       { title: 'Vergi Merkezi',  sub: 'KDV · Geçici Vergi · Kurumlar Vergisi · Matrah Analizi' },
  risks:     { title: 'Risk Analizi',   sub: 'Alacak yaşlandırma · Müşteri konsantrasyonu · HHI Endeksi' },
  forecast:  { title: 'Nakit Tahmini', sub: 'Runway projeksiyonu · 12 ay nakit akışı · Senaryo analizi' },
  quarterly: { title: 'Çeyreklik CFO', sub: 'YTD P&L · Çeyreklik performans · Vergi takvimi · Aylık detay' },
  cfo:       { title: 'CFO Cockpit',   sub: 'Muhasebe doğruluğu · Dönem yönetimi · Mizan · Uzlaştırma' },
}

// ── Loading skeleton ───────────────────────────────────────────────────────────

function TabSkeleton() {
  return (
    <div className="space-y-3 animate-pulse">
      <div className="grid grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-gray-100 rounded-xl h-16" />
        ))}
      </div>
      <div className="bg-gray-100 rounded-xl h-48" />
      <div className="bg-gray-100 rounded-xl h-32" />
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
      <p className="text-sm text-gray-500">Oturum bilgisi alınamadı. Lütfen sayfayı yenileyin.</p>
      <a href="/dashboard/finance" className="text-sm text-violet-600 font-semibold hover:underline">Yeniden Dene</a>
    </div>
  )

  let companyId: string | null = null
  try { companyId = await resolveCompanyId(userId, supabase) } catch { /* non-fatal */ }
  if (!companyId) return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-center px-4">
      <div className="text-3xl">⚠️</div>
      <p className="text-sm text-gray-500">Şirket bilgisi yüklenemedi. Lütfen sayfayı yenileyin.</p>
      <a href="/dashboard/finance" className="text-sm text-violet-600 font-semibold hover:underline">Yeniden Dene</a>
    </div>
  )

  // ── Tab resolution ─────────────────────────────────────────────────────────
  const params    = await searchParams
  const rawTab    = params.tab ?? 'overview'
  const activeTab = (VALID_TABS.includes(rawTab as FinanceTab) ? rawTab : 'overview') as FinanceTab
  const meta      = TAB_META[activeTab]
  const tabProps  = { userId, companyId }

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-5 w-full">

      {/* ── PAGE HERO ─────────────────────────────────────────────────────────── */}
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <div className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1">Finans Merkezi</div>
          <h1 className="text-2xl font-black tracking-tight text-gray-900 leading-tight">{meta.title}</h1>
          <p className="text-sm text-gray-400 mt-1">{meta.sub}</p>
        </div>
        {activeTab === 'cfo' && (
          <a href="/dashboard/cfo/period-close"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-primary-600 text-white text-xs font-semibold hover:bg-primary-700 transition-colors">
            Dönem Kapat
          </a>
        )}
        {activeTab === 'tax' && (
          <a href="/dashboard/cfo/tax/kdv"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-gray-200 text-gray-700 text-xs font-semibold hover:bg-gray-50 transition-colors">
            KDV Beyanı →
          </a>
        )}
      </div>

      {/* ── Tab navigation (sticky) ───────────────────────────────────────────── */}
      <div className="sticky top-0 z-20 bg-white/95 backdrop-blur-sm -mx-5 px-5 pt-1 border-b border-gray-100">
        <UnifiedTabNav tabs={FINANCE_NAV_TABS} activeTab={activeTab} basePath="/dashboard/finance" />
      </div>

      {/* ── Active tab content ────────────────────────────────────────────────── */}
      <Suspense fallback={<TabSkeleton />}>
        {activeTab === 'overview'  && <OverviewTab  {...tabProps} />}
        {activeTab === 'pnl'       && <PnlTab       {...tabProps} />}
        {activeTab === 'balance'   && <BalanceTab   {...tabProps} />}
        {activeTab === 'cashflow'  && <CashflowTab  {...tabProps} />}
        {activeTab === 'tax'       && <TaxTab       {...tabProps} />}
        {activeTab === 'risks'     && <RisksTab     {...tabProps} />}
        {activeTab === 'forecast'  && <ForecastTab  {...tabProps} />}
        {activeTab === 'quarterly' && <QuarterlyTab {...tabProps} />}
        {activeTab === 'cfo'       && <CFOTab       {...tabProps} />}
      </Suspense>

    </div>
  )
}
