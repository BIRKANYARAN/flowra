// ── /api/seed — insert demo data for a fresh account ─────────────────────────
// Guards against re-seeding: checks both customers AND products.
//
// SECURITY: Disabled in production unless ENABLE_SEED=true is set explicitly.
// Entity seeders live in ./_seed/ — one file per domain.

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/require-role'
import { resolveApiAuth } from '@/lib/api-auth'
import { seedCustomers } from './_seed/customers'
import { seedBanks     } from './_seed/banks'
import { seedProducts  } from './_seed/products'
import { seedExpenses  } from './_seed/expenses'
import { seedProformas } from './_seed/proformas'

export async function POST(req: NextRequest) {
  // Feature flag guard
  if (process.env.ENABLE_SEED !== 'true') {
    return NextResponse.json(
      { error: 'This endpoint is disabled in this environment.', code: 'FORBIDDEN', type: 'SECURITY' },
      { status: 403 },
    )
  }

  try {
    const auth = await resolveApiAuth(req)
    if (!auth.ok) return auth.response
    const { uid, companyId, supabase } = auth
    const ctx = { supabase, uid, companyId }

    // Seed writes data — admin only (belt-and-suspenders; env guard is primary).
    try { await requireAdmin(uid, companyId, supabase) }
    catch { return NextResponse.json({ error: 'Demo veri yükleme için admin yetkisi gerekir', code: 'FORBIDDEN', type: 'SECURITY' }, { status: 403 }) }

    // Guard: check BOTH customers and products — prevents partial re-seed
    // after a reset that only soft-deleted customers but left products.
    const [custCheck, prodCheck] = await Promise.all([
      supabase.from('customers').select('id').eq('company_id', companyId).is('deleted_at', null),
      supabase.from('products').select('id').eq('company_id', companyId).is('deleted_at', null),
    ])

    const custLen = Array.isArray(custCheck.data) ? custCheck.data.length : 0
    const prodLen = Array.isArray(prodCheck.data) ? prodCheck.data.length : 0

    if (custLen > 0 || prodLen > 0) {
      return NextResponse.json({ message: 'already_seeded', seeded: false, detail: `customers: ${custLen}, products: ${prodLen}` })
    }

    // ── Entity seeders (sequential — each step builds on the previous) ────────
    const custResult = await seedCustomers(ctx)
    if ('error' in custResult) return custResult.error

    const { defaultBankId } = await seedBanks(ctx)
    const { products }      = await seedProducts(ctx)

    await seedExpenses(ctx)

    if (products.length > 0 && custResult.customers.length > 0) {
      await seedProformas({ ...ctx, customers: custResult.customers, products, defaultBankId })
    } else {
      console.error('[seed] skipping proformas: missing products or customers')
    }

    console.log('[seed] completed for user', uid)
    return NextResponse.json({ message: 'seeded', seeded: true })

  } catch (err) {
    console.error('[seed]', err instanceof Error ? err.message : String(err))
    return NextResponse.json({ error: 'Seed failed' }, { status: 500 })
  }
}
