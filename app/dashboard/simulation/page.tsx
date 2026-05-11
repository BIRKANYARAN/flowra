// ── /dashboard/simulation — server component wrapper ──────────────────────────
//
// Pre-fetches all static data (products, policy rates, FX rates) server-side
// so SimulationClient renders immediately with no loading state.
//
// Data flow:
//   Server: auth → companyId → products + policy_rates + fx_rates (parallel)
//   Client: receives initialProps → reactive simulation with zero loading delay
//
// Remaining client-side fetches (triggered by interaction):
//   • /api/simulation/recurring   — recurring expense projection
//   • /api/partners/debt-burden   — partner debt state
//   • stock_lots (supabase)       — entry date per selected product
//   • get_real_cost RPC           — FIFO-aware cost per product
//   • /api/partners/equalization  — partner payouts per net profit

export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import { resolveCompanyId } from '@/lib/resolve-company'
import SimulationClient from './SimulationClient'
import type { Product } from '@/types'

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
    // ── Parallel data fetch ─────────────────────────────────────────────────
    const [
      productsRes,
      tryRateRes,
      usdRateRes,
      eurRateRes,
      usdFxRes,
      eurFxRes,
      partnerCountRes,
    ] = await Promise.all([
      // Active products for this company
      supabase
        .from('products')
        .select('*')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .eq('is_active', true)
        .order('name'),

      // Latest policy rate — TRY
      supabase
        .from('policy_rates')
        .select('annual_rate')
        .eq('currency', 'TRY')
        .lte('rate_date', today)
        .order('rate_date', { ascending: false })
        .limit(1),

      // Latest policy rate — USD
      supabase
        .from('policy_rates')
        .select('annual_rate')
        .eq('currency', 'USD')
        .lte('rate_date', today)
        .order('rate_date', { ascending: false })
        .limit(1),

      // Latest policy rate — EUR
      supabase
        .from('policy_rates')
        .select('annual_rate')
        .eq('currency', 'EUR')
        .lte('rate_date', today)
        .order('rate_date', { ascending: false })
        .limit(1),

      // Latest FX rate — USD → TRY
      supabase
        .from('fx_rates')
        .select('buying')
        .eq('currency', 'USD')
        .order('rate_date', { ascending: false })
        .limit(1),

      // Latest FX rate — EUR → TRY
      supabase
        .from('fx_rates')
        .select('buying')
        .eq('currency', 'EUR')
        .order('rate_date', { ascending: false })
        .limit(1),

      // Active partner count (company members with accepted_at)
      supabase
        .from('company_members')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .not('accepted_at', 'is', null),
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

    // partnerCountRes.count is the exact row count from Supabase
    initialPartnerCount = partnerCountRes.count ?? 0
  }

  return (
    <SimulationClient
      userId={uid}
      companyId={companyId}
      initialProducts={initialProducts}
      initialPolicyRates={initialPolicyRates}
      initialFxRates={initialFxRates}
      initialPartnerCount={initialPartnerCount}
    />
  )
}
