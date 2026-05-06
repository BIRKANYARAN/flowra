// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/simulate
//
// Run a what-if scenario for a single product. READ-ONLY — zero DB writes.
//
// Request body (JSON):
//   {
//     "product_id":    "uuid",
//     "quantity":      100,           // total units across the period
//     "sale_price":    250.00,        // per-unit net price in TRY (ex-VAT)
//     "discount_rate": 10,            // % discount  0–99
//     "period_months": 3,             // 1 | 3 | 6 | 9 | 12
//     "tax_rate":      25,            // optional — corporate tax %; default 25
//     "kdv_rate":      20,            // optional — output VAT %; default 20
//     "start_month":   "2026-05"      // optional — YYYY-MM; default = next month
//   }
//
// Success response: SimulationResult (see types/index.ts)
//
// Error codes:
//   401 UNAUTHORIZED       — unauthenticated
//   422 VALIDATION_ERROR   — invalid input fields (array in details.errors)
//   404 PRODUCT_NOT_FOUND  — product doesn't exist or doesn't belong to user
//   500 DB_READ_FAILED     — infrastructure failure
// ═══════════════════════════════════════════════════════════════════════════════

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { contextFromHeader } from '@/lib/logger'
import { REQUEST_ID_HEADER } from '@/middleware'
import { SimulationService } from '@/lib/services/simulation.service'
import { toErrorResponse } from '@/types/errors'
import { resolveCompanyId } from '@/lib/resolve-company'

const VALID_PERIOD_MONTHS = new Set([1, 3, 6, 9, 12])

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData?.user) {
    return NextResponse.json(
      { error: 'Unauthorized', code: 'UNAUTHORIZED', type: 'SECURITY' },
      { status: 401 }
    )
  }
  const ctx = contextFromHeader(req.headers.get(REQUEST_ID_HEADER), authData.user.id)

  let companyId: string
  try { companyId = await resolveCompanyId(authData.user.id, supabase) }
  catch { return NextResponse.json({ error: 'Şirket bilgisi alınamadı', code: 'COMPANY_NOT_RESOLVED', type: 'SYSTEM' }, { status: 409 }) }

  try {
    // ── Parse body ──────────────────────────────────────────────────────────
    let body: Record<string, unknown>
    try {
      body = await req.json()
    } catch {
      return NextResponse.json(
        { error: 'Geçersiz JSON', code: 'VALIDATION_ERROR', type: 'BUSINESS' },
        { status: 422, headers: { [REQUEST_ID_HEADER]: ctx.requestId } }
      )
    }

    // ── Light-coerce the public-facing fields ──────────────────────────────
    // SimulationService.simulateScenario() will do full validation and
    // throw AppError('VALIDATION_ERROR', ...) on any problem — we catch that
    // below and let toErrorResponse map it to a 422.
    const input = {
      product_id:    String(body.product_id ?? ''),
      quantity:      Number(body.quantity),
      sale_price:    Number(body.sale_price),
      discount_rate: Number(body.discount_rate ?? 0),
      period_months: Number(body.period_months) as 1 | 3 | 6 | 9 | 12,
      ...(body.tax_rate   !== undefined && { tax_rate:    Number(body.tax_rate) }),
      ...(body.kdv_rate   !== undefined && { kdv_rate:    Number(body.kdv_rate) }),
      ...(body.start_month !== undefined && { start_month: String(body.start_month) }),
    }

    // Fast-path: detect obviously bad period before hitting DB
    if (!VALID_PERIOD_MONTHS.has(input.period_months)) {
      return NextResponse.json(
        {
          error:   'period_months şunlardan biri olmalı: 1, 3, 6, 9, 12',
          code:    'VALIDATION_ERROR',
          type:    'BUSINESS',
          details: { received: body.period_months },
        },
        { status: 422, headers: { [REQUEST_ID_HEADER]: ctx.requestId } }
      )
    }

    // ── Verify product ownership (prevents enumeration via product_id) ─────
    const { data: product, error: prodErr } = await supabase
      .from('products')
      .select('id, name, is_active')
      .eq('id', input.product_id)
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .maybeSingle()

    if (prodErr || !product) {
      return NextResponse.json(
        { error: 'Ürün bulunamadı', code: 'PRODUCT_NOT_FOUND', type: 'BUSINESS' },
        { status: 404, headers: { [REQUEST_ID_HEADER]: ctx.requestId } }
      )
    }

    // ── Run simulation ─────────────────────────────────────────────────────
    const result = await SimulationService.simulateScenario(
      authData.user.id,
      companyId,
      input,
      ctx,
    )

    return NextResponse.json(
      { product_name: product.name, ...result },
      { headers: { [REQUEST_ID_HEADER]: ctx.requestId } }
    )

  } catch (err) {
    const { body, status } = toErrorResponse(err)
    return NextResponse.json(body, { status, headers: { [REQUEST_ID_HEADER]: ctx.requestId } })
  }
}
