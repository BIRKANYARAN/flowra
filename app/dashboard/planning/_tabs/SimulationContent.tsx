// ── SimulationContent — Planning hub / simulation tabs ────────────────────────

import Link from 'next/link'
import { Suspense } from 'react'
import { createClient } from '@/lib/supabase-server'
import type { Product } from '@/types'
import SimulationClient from '@/app/dashboard/simulation/SimulationClient'
import { SimulationContext } from '@/app/dashboard/simulation/_components/SimulationContext'

function ContextSkeleton() {
  return (
    <div className="space-y-2 animate-pulse">
      <div className="grid grid-cols-5 gap-2">
        {[...Array(5)].map((_, i) => <div key={i} className="h-16 bg-gray-100 rounded-xl" />)}
      </div>
      <div className="h-9 bg-gray-100 rounded-xl" />
    </div>
  )
}

// cash-projection, scenarios, debt-pressure are now separate components.
// SimulationContent only handles unit-profit + partner-impact.
type SimTab = 'unit-profit' | 'partner-impact'

const TAB_CONTEXT: Record<SimTab, { title: string; focus: string }> = {
  'unit-profit':    { title: 'Birim Kâr Analizi', focus: 'WAC · Satış fiyatı · Brüt marj · Başabaş noktası' },
  'partner-impact': { title: 'Ortak Etkisi',      focus: 'Dağıtılabilir kâr · Eşitleme hesabı · Dağıtım zaman planı' },
}

interface Props { companyId: string; userId: string; activeTab?: SimTab }

export async function SimulationContent({ companyId, userId, activeTab = 'unit-profit' }: Props) {
  // Guard: only render for tabs this component owns
  if (activeTab !== 'unit-profit' && activeTab !== 'partner-impact') return null
  const ctx = TAB_CONTEXT[activeTab]
  const supabase = createClient()
  const today    = new Date().toISOString().slice(0, 10)

  let initialProducts:    Product[] = []
  let initialPolicyRates = { TRY: 0, USD: 0, EUR: 0 }
  let initialFxRates     = { USD: 0, EUR: 0 }
  let initialPartnerCount = 0

  const [
    productsRes,
    tryRateRes,
    usdRateRes,
    eurRateRes,
    usdFxRes,
    eurFxRes,
    partnerCountRes,
  ] = await Promise.all([
    supabase.from('products').select('*').eq('company_id', companyId)
      .is('deleted_at', null).eq('is_active', true).order('name'),
    supabase.from('policy_rates').select('annual_rate').eq('currency', 'TRY')
      .lte('rate_date', today).order('rate_date', { ascending: false }).limit(1),
    supabase.from('policy_rates').select('annual_rate').eq('currency', 'USD')
      .lte('rate_date', today).order('rate_date', { ascending: false }).limit(1),
    supabase.from('policy_rates').select('annual_rate').eq('currency', 'EUR')
      .lte('rate_date', today).order('rate_date', { ascending: false }).limit(1),
    supabase.from('fx_rates').select('buying').eq('currency', 'USD')
      .order('rate_date', { ascending: false }).limit(1),
    supabase.from('fx_rates').select('buying').eq('currency', 'EUR')
      .order('rate_date', { ascending: false }).limit(1),
    supabase.from('company_members').select('id', { count: 'exact', head: true })
      .eq('company_id', companyId).is('deleted_at', null).not('accepted_at', 'is', null),
  ])

  initialProducts = (productsRes.data ?? []) as Product[]
  initialPolicyRates = {
    TRY: tryRateRes.data?.[0] ? Number(tryRateRes.data[0].annual_rate) : 0,
    USD: usdRateRes.data?.[0] ? Number(usdRateRes.data[0].annual_rate) : 0,
    EUR: eurRateRes.data?.[0] ? Number(eurRateRes.data[0].annual_rate) : 0,
  }
  initialFxRates = {
    USD: usdFxRes.data?.[0] ? Number(usdFxRes.data[0].buying) : 0,
    EUR: eurFxRes.data?.[0] ? Number(eurFxRes.data[0].buying) : 0,
  }
  initialPartnerCount = partnerCountRes.count ?? 0

  return (
    <div className="space-y-4 max-w-5xl">

      {/* Tab context header */}
      <div className="px-4 py-3 bg-primary-50 border border-primary-100 rounded-xl">
        <div className="text-sm font-black text-primary-800">{ctx.title}</div>
        <div className="text-[10px] text-primary-500 mt-0.5">{ctx.focus}</div>
      </div>

      <Suspense fallback={<ContextSkeleton />}>
        <SimulationContext companyId={companyId} />
      </Suspense>

      <div className="flex items-center gap-3">
        <div className="flex-1 border-t border-dashed border-gray-200" />
        <span className="text-[9px] font-black uppercase tracking-widest text-gray-300">Simülasyon Motoru</span>
        <div className="flex-1 border-t border-dashed border-gray-200" />
      </div>

      <SimulationClient
        userId={userId}
        companyId={companyId}
        initialProducts={initialProducts}
        initialPolicyRates={initialPolicyRates}
        initialFxRates={initialFxRates}
        initialPartnerCount={initialPartnerCount}
      />

      {/* Cross-navigation */}
      <div className="flex items-center justify-between px-1">
        <p className="text-[10px] text-gray-400 leading-relaxed">
          Simülasyon sonuçlarını nakit projeksiyonu ve gerçek P&amp;L ile karşılaştırın.
        </p>
        <div className="flex items-center gap-2 shrink-0 ml-4">
          <Link href="/dashboard/planning?tab=cash-projection" className="text-[11px] font-bold text-primary-600 hover:text-primary-700 underline underline-offset-2 whitespace-nowrap">
            Nakit Projeksiyonu →
          </Link>
          <span className="text-gray-200">|</span>
          <Link href="/dashboard/planning?tab=what-if" className="text-[11px] font-bold text-primary-600 hover:text-primary-700 underline underline-offset-2 whitespace-nowrap">
            What-If →
          </Link>
          <span className="text-gray-200">|</span>
          <Link href="/dashboard/finance?tab=overview" className="text-[11px] font-bold text-primary-600 hover:text-primary-700 underline underline-offset-2 whitespace-nowrap">
            Finansal Durum →
          </Link>
        </div>
      </div>
    </div>
  )
}
