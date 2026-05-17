// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/products/lots?product_id=…
//
// Returns raw stock_lots for a single product scoped to the caller's company.
// Used by CatalogClient (expand row) and SimulationClient (earliest entry date).
//
// Query params:
//   product_id  (required)
//   active      "1" → filter qty_remaining > 0
//   order       "asc" | "desc" — entry_date order (default: desc)
//   limit       positive integer (default: no limit)
//
// Returns: { lots: StockLot[], count: number }
// ═══════════════════════════════════════════════════════════════════════════════

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth } from '@/lib/api-auth'
import type { StockLot } from '@/types'

export async function GET(req: NextRequest) {
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response
  const { companyId, supabase } = auth

  const url       = new URL(req.url)
  const productId = url.searchParams.get('product_id') || ''
  const active    = url.searchParams.get('active') === '1'
  const order     = url.searchParams.get('order') === 'asc' ? true : false
  const limitStr  = url.searchParams.get('limit')
  const limit     = limitStr ? Math.max(1, parseInt(limitStr, 10) || 1) : undefined

  if (!productId) {
    return NextResponse.json(
      { error: 'product_id zorunludur', code: 'VALIDATION_ERROR' },
      { status: 422 }
    )
  }

  try {
    let query = supabase
      .from('stock_lots')
      .select('*')
      .eq('product_id', productId)
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .order('entry_date', { ascending: order })

    if (active) {
      query = query.gt('qty_remaining', 0)
    }

    if (limit) {
      query = query.limit(limit)
    }

    const { data, error } = await query

    if (error) {
      console.error('[api/products/lots] DB error:', error.message)
      return NextResponse.json({ error: 'Stok lotları okunamadı.' }, { status: 500 })
    }

    const lots = (data ?? []) as StockLot[]
    return NextResponse.json({ lots, count: lots.length })

  } catch (err) {
    console.error('[api/products/lots] Unexpected error:', err instanceof Error ? err.message : String(err))
    return NextResponse.json({ error: 'Sunucu hatası' }, { status: 500 })
  }
}
