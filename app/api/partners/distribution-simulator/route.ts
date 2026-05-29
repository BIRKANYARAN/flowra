// ═══════════════════════════════════════════════════════════════════════════════
// app/api/partners/distribution-simulator/route.ts
//
// GET  — standard scenarios (pre-computed from DB)
// POST — custom simulation with requested_distribution
//
// Role guard: admin only
// Cache: revalidate = 0 (always fresh — simulation data)
// ═══════════════════════════════════════════════════════════════════════════════

export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { REQUEST_ID_HEADER } from '@/middleware'
import { resolveApiAuth } from '@/lib/api-auth'
import { requireAdmin } from '@/lib/require-role'
import { DistributionSimulatorService } from '@/lib/services/pcle/distribution-simulator.service'
import { AppError, toErrorResponse } from '@/types/errors'

// ── GET — standard scenarios ──────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response
  const { uid, companyId, supabase, ctx } = auth

  try {
    await requireAdmin(uid, companyId, supabase)
  } catch (e) {
    if (e instanceof AppError && e.code === 'FORBIDDEN') {
      return NextResponse.json(
        { error: e.message, code: 'FORBIDDEN' },
        { status: 403, headers: { [REQUEST_ID_HEADER]: ctx.requestId } },
      )
    }
    throw e
  }

  try {
    const service = new DistributionSimulatorService(supabase)
    const result = await service.getScenarios(companyId)

    return NextResponse.json(
      { result },
      { headers: { [REQUEST_ID_HEADER]: ctx.requestId } },
    )
  } catch (err) {
    const { body, status } = toErrorResponse(err)
    return NextResponse.json(body, { status, headers: { [REQUEST_ID_HEADER]: ctx.requestId } })
  }
}

// ── POST — custom simulation ──────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response
  const { uid, companyId, supabase, ctx } = auth

  try {
    await requireAdmin(uid, companyId, supabase)
  } catch (e) {
    if (e instanceof AppError && e.code === 'FORBIDDEN') {
      return NextResponse.json(
        { error: e.message, code: 'FORBIDDEN' },
        { status: 403, headers: { [REQUEST_ID_HEADER]: ctx.requestId } },
      )
    }
    throw e
  }

  try {
    const body = (await req.json()) as { requested_distribution?: unknown }
    const requestedDistribution = Number(body.requested_distribution ?? 0)

    if (isNaN(requestedDistribution) || requestedDistribution < 0) {
      return NextResponse.json(
        { error: 'requested_distribution geçerli bir pozitif sayı olmalıdır', code: 'INVALID_INPUT' },
        { status: 400, headers: { [REQUEST_ID_HEADER]: ctx.requestId } },
      )
    }

    const service = new DistributionSimulatorService(supabase)
    const result = await service.simulate(companyId, requestedDistribution)

    return NextResponse.json(
      { result },
      { headers: { [REQUEST_ID_HEADER]: ctx.requestId } },
    )
  } catch (err) {
    const { body, status } = toErrorResponse(err)
    return NextResponse.json(body, { status, headers: { [REQUEST_ID_HEADER]: ctx.requestId } })
  }
}
