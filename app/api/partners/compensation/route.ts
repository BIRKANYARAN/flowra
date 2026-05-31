// ═══════════════════════════════════════════════════════════════════════════════
// GET  /api/partners/compensation?months=3  — list schedules + due payments
// POST /api/partners/compensation
//        { type: 'schedule', ...params }    — create new schedule
//        { type: 'payment', schedule_id, payment_period }  — record payment
// ═══════════════════════════════════════════════════════════════════════════════

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth } from '@/lib/api-auth'
import { reqCtx, apiError } from '@/lib/api-utils'
import { CompensationService } from '@/lib/services/pcle/compensation.service'
import { isMissingSchemaError } from '@/lib/db-errors'

export async function GET(req: NextRequest) {
  const ctx  = reqCtx(req)
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response
  const { companyId, supabase } = auth

  try {
    const { searchParams } = new URL(req.url)
    const months = Math.max(1, Math.min(24, parseInt(searchParams.get('months') ?? '3', 10)))

    // Resolve each independently so a schema gap in one (e.g. an un-applied
    // partner_compensation_payments migration) degrades gracefully instead of
    // failing the whole endpoint with a 500.
    const [schedulesR, dueR] = await Promise.allSettled([
      CompensationService.listSchedules(companyId, supabase),
      CompensationService.getDuePayments(companyId, supabase, { months }),
    ])

    // A non-schema error on either side is a genuine failure → surface it.
    for (const r of [schedulesR, dueR]) {
      if (r.status === 'rejected' && !isMissingSchemaError(r.reason)) {
        console.error('[compensation GET]', r.reason)
        return apiError(ctx, 'Huzur hakkı verileri alınamadı', 500)
      }
      if (r.status === 'rejected') {
        console.error('[compensation GET] schema gap (apply partner_compensation migration):', r.reason)
      }
    }

    const schedules    = schedulesR.status === 'fulfilled' ? schedulesR.value : []
    const due_payments = dueR.status === 'fulfilled' ? dueR.value : []
    const degraded     = schedulesR.status === 'rejected' || dueR.status === 'rejected'

    return NextResponse.json({ schedules, due_payments, degraded })
  } catch (err) {
    console.error('[compensation GET]', err)
    return apiError(ctx, 'Huzur hakkı verileri alınamadı', 500)
  }
}

export async function POST(req: NextRequest) {
  const ctx  = reqCtx(req)
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response
  const { uid, companyId, supabase } = auth

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return apiError(ctx, 'Geçersiz JSON', 422, 'VALIDATION_ERROR', 'BUSINESS')
  }

  const type = body.type

  try {
    if (type === 'schedule') {
      const partner_id        = typeof body.partner_id === 'string' ? body.partner_id : ''
      const monthly_gross_try = Number(body.monthly_gross_try)
      const effective_from    = typeof body.effective_from === 'string' ? body.effective_from : ''

      if (!partner_id || !effective_from || monthly_gross_try <= 0) {
        return apiError(ctx, 'partner_id, monthly_gross_try ve effective_from zorunludur', 422, 'VALIDATION_ERROR', 'BUSINESS')
      }

      const schedule = await CompensationService.createSchedule(companyId, uid, supabase, {
        partner_id,
        monthly_gross_try,
        withholding_rate:   typeof body.withholding_rate === 'number' ? body.withholding_rate : undefined,
        sgk_rate:           typeof body.sgk_rate         === 'number' ? body.sgk_rate         : undefined,
        effective_from,
        effective_until:    typeof body.effective_until  === 'string' ? body.effective_until  : null,
        board_decision_ref: typeof body.board_decision_ref === 'string' ? body.board_decision_ref : undefined,
        notes:              typeof body.notes === 'string' ? body.notes : undefined,
      })

      return NextResponse.json({ schedule }, { status: 201 })
    }

    if (type === 'payment') {
      const schedule_id    = typeof body.schedule_id === 'string' ? body.schedule_id : ''
      const payment_period = typeof body.payment_period === 'string' ? body.payment_period : ''

      if (!schedule_id || !payment_period) {
        return apiError(ctx, 'schedule_id ve payment_period zorunludur', 422, 'VALIDATION_ERROR', 'BUSINESS')
      }

      const result = await CompensationService.recordPayment(companyId, uid, supabase, schedule_id, payment_period)
      return NextResponse.json(result, { status: 201 })
    }

    return apiError(ctx, "type 'schedule' veya 'payment' olmalıdır", 422, 'VALIDATION_ERROR', 'BUSINESS')
  } catch (err) {
    console.error('[compensation POST]', err)
    const msg = err instanceof Error ? err.message : 'İşlem gerçekleştirilemedi'
    return apiError(ctx, msg, 500)
  }
}
