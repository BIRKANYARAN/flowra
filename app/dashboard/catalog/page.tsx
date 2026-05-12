// ── /dashboard/catalog — Katalog (server component) ──────────────────────────
//
// FAZ 20: Converted from 'use client' to server component.
//
// Server prefetches:
//   • products (is_active = true, ordered by name)
//   • real costs via get_real_cost RPC — one call per product, Promise.allSettled
//
// Client island:
//   CatalogClient — search, currency toggle, inline price edit,
//                   lots on demand, cost calculator modal, portfolio totals
//
// Self-HTTP eliminated. Loading spinner on mount eliminated.
// FX rates still fetched client-side on mount (external source, non-blocking).

export const dynamic = 'force-dynamic'

import { redirect }         from 'next/navigation'
import { Suspense }         from 'react'
import { createClient }     from '@/lib/supabase-server'
import { resolveCompanyId } from '@/lib/resolve-company'
import type { Product }     from '@/types'
import CatalogClient        from './CatalogClient'
import { CatalogCommandBar } from './_components/CatalogCommandBar'

function CommandBarSkeleton() {
  return (
    <div className="flex items-center gap-2 animate-pulse">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="h-8 w-28 bg-gray-100 rounded-xl" />
      ))}
    </div>
  )
}

export default async function CatalogPage() {
  const supabase = createClient()
  let uid: string
  try {
    const { data, error } = await supabase.auth.getUser()
    if (error || !data?.user) redirect('/auth')
    uid = data.user.id
  } catch (e) {
    if (e && typeof e === 'object' && 'digest' in e) throw e
    redirect('/auth')
  }

  let companyId: string
  try { companyId = await resolveCompanyId(uid, supabase) }
  catch { redirect('/auth') }

  // ── Fetch active products ──────────────────────────────────────────────────
  const { data: prodData } = await supabase
    .from('products')
    .select('*')
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .eq('is_active', true)
    .order('name')

  const products = (prodData ?? []) as Product[]

  // ── Prefetch real costs via RPC — parallel ─────────────────────────────────
  // get_real_cost returns { real_cost: number | null }
  const realCostResults = await Promise.allSettled(
    products.map(async p => {
      const { data: rpc } = await supabase.rpc('get_real_cost', {
        p_product_id: p.id,
        p_user_id:    uid,
      })
      return { id: p.id, cost: (rpc as { real_cost?: number | null } | null)?.real_cost ?? null }
    })
  )

  const initialRealCosts: Record<string, number | null> = {}
  realCostResults.forEach(r => {
    if (r.status === 'fulfilled') {
      initialRealCosts[r.value.id] = r.value.cost
    }
  })

  return (
    <div className="space-y-4">
      {/* ── Margin intelligence strip ─────────────────────────────────────── */}
      <Suspense fallback={<CommandBarSkeleton />}>
        <CatalogCommandBar companyId={companyId} />
      </Suspense>

      {/* ── Interactive catalog ───────────────────────────────────────────── */}
      <CatalogClient
        initialProducts={products}
        initialRealCosts={initialRealCosts}
        userId={uid}
        companyId={companyId}
      />
    </div>
  )
}
