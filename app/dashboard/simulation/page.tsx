// ── /dashboard/simulation — server component wrapper ──────────────────────────
//
// FAZ T4: Simulation Intelligence Engine
//
// Data flow:
//   Server: auth → companyId → SimulationContext (live financial state)
//                            → products + policy_rates + fx_rates (parallel)
//   Client: SimulationClient receives all pre-fetched data → zero loading delay
//
// Layout:
//   SimulationContext  — server RSC: live financial KPIs + break-even signal
//   SimulationClient   — client: full interactive simulation engine

export const dynamic = 'force-dynamic'

import { redirect }         from 'next/navigation'
import { Suspense }         from 'react'
import { createClient }     from '@/lib/supabase-server'
import { resolveCompanyId } from '@/lib/resolve-company'
import SimulationClient     from './SimulationClient'
import { SimulationContext } from './_components/SimulationContext'
import type { Product }     from '@/types'

// ── Skeleton ──────────────────────────────────────────────────────────────────

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

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function SimulationPage() {
  const supabase = createClient()
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData?.user) redirect('/login')

  const uid   = authData.user.id
  const today = new Date().toISOString().slice(0, 10)

  // ── Resolve company ───────────────────────────────────────────────────────
  let companyId: string | null = null
  try { companyId = await resolveCompanyId(uid, supabase) } catch { /* renders with empty state */ }

  // ── Defaults ──────────────────────────────────────────────────────────────
  let initialProducts:    Product[] = []
  let initialPolicyRates = { TRY: 0, USD: 0, EUR: 0 }
  let initialFxRates     = { USD: 0, EUR: 0 }
  let initialPartnerCount = 0

  if (companyId) {
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
  }

  return (
    <div className="space-y-4 max-w-5xl">

      {/* ── Live financial context ──────────────────────────────────────────── */}
      {companyId && (
        <Suspense fallback={<ContextSkeleton />}>
          <SimulationContext companyId={companyId} />
        </Suspense>
      )}

      {/* ── Divider ────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <div className="flex-1 border-t border-dashed border-gray-200" />
        <span className="text-[9px] font-black uppercase tracking-widest text-gray-300">
          Simülasyon Motoru
        </span>
        <div className="flex-1 border-t border-dashed border-gray-200" />
      </div>

      {/* ── Interactive simulation engine ───────────────────────────────────── */}
      <SimulationClient
        userId={uid}
        companyId={companyId}
        initialProducts={initialProducts}
        initialPolicyRates={initialPolicyRates}
        initialFxRates={initialFxRates}
        initialPartnerCount={initialPartnerCount}
      />
    </div>
  )
}
