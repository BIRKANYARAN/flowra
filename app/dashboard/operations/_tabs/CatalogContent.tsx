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

  // Batch FIFO cost: one query for all products instead of N×RPC.
  // real_cost = weighted average entry_cost_try weighted by qty_remaining.
  const { data: lotData } = await supabase
    .from('stock_lots')
    .select('product_id, cost_price_try, qty_remaining')
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .gt('qty_remaining', 0)

  const initialRealCosts: Record<string, number | null> = {}
  const lotSums: Record<string, { costQty: number; qty: number }> = {}
  for (const lot of lotData ?? []) {
    const pid = String(lot.product_id ?? '')
    if (!pid) continue
    const prev = lotSums[pid] ?? { costQty: 0, qty: 0 }
    lotSums[pid] = {
      costQty: prev.costQty + Number((lot as { cost_price_try?: number | null }).cost_price_try ?? 0) * Number(lot.qty_remaining ?? 0),
      qty:     prev.qty     + Number(lot.qty_remaining ?? 0),
    }
  }
  for (const [pid, { costQty, qty }] of Object.entries(lotSums)) {
    initialRealCosts[pid] = qty > 0 ? costQty / qty : null
  }

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
