// ── CatalogContent — Operations hub / catalog tab ─────────────────────────────

import { Suspense } from 'react'
import { createClient } from '@/lib/supabase-server'
import type { Product } from '@/types'
import CatalogClient from '@/app/dashboard/catalog/CatalogClient'
import { CatalogCommandBar } from '@/app/dashboard/catalog/_components/CatalogCommandBar'

function CommandBarSkeleton() {
  return (
    <div className="flex items-center gap-2 animate-pulse">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="h-8 w-28 bg-gray-100 rounded-xl" />
      ))}
    </div>
  )
}

interface Props { companyId: string; userId: string }

export async function CatalogContent({ companyId, userId }: Props) {
  const supabase = createClient()

  const { data: prodData } = await supabase
    .from('products')
    .select('*')
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .eq('is_active', true)
    .order('name')

  const products = (prodData ?? []) as Product[]

  const realCostResults = await Promise.allSettled(
    products.map(async p => {
      const { data: rpc } = await supabase.rpc('get_real_cost', {
        p_product_id: p.id,
        p_user_id:    userId,
      })
      return { id: p.id, cost: (rpc as { real_cost?: number | null } | null)?.real_cost ?? null }
    })
  )

  const initialRealCosts: Record<string, number | null> = {}
  realCostResults.forEach(r => {
    if (r.status === 'fulfilled') initialRealCosts[r.value.id] = r.value.cost
  })

  return (
    <div className="space-y-4">
      <Suspense fallback={<CommandBarSkeleton />}>
        <CatalogCommandBar companyId={companyId} />
      </Suspense>
      <CatalogClient
        initialProducts={products}
        initialRealCosts={initialRealCosts}
        userId={userId}
        companyId={companyId}
      />
    </div>
  )
}
