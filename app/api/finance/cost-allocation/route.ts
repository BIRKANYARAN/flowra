// ─────────────────────────────────────────────────────────────────────────────
// GET /api/finance/cost-allocation
//
// Cost Center Allocation & Overhead Distribution.
// Returns a full allocation report with direct/indirect cost breakdown,
// overhead ratio, cost segregation, and contribution margin analysis.
//
// Auth: resolveApiAuth, manager+
// Cache: revalidate every 1800 seconds
//
// Query params:
//   ?method=revenue_based | headcount_based | equal_split | direct_only | activity_based
// ─────────────────────────────────────────────────────────────────────────────

export const dynamic   = 'force-dynamic'
export const revalidate = 1800

import { NextRequest, NextResponse }         from 'next/server'
import { resolveApiAuth }                    from '@/lib/api-auth'
import { CostAllocationService }             from '@/lib/services/finance/cost-allocation.service'
import type { AllocationMethod }             from '@/lib/services/finance/cost-allocation.service'
import { REQUEST_ID_HEADER }                 from '@/middleware'

const VALID_METHODS: AllocationMethod[] = [
  'revenue_based',
  'headcount_based',
  'equal_split',
  'direct_only',
  'activity_based',
]

export async function GET(req: NextRequest) {
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response
  const { companyId, supabase, ctx } = auth

  // Parse optional method param
  const rawMethod = req.nextUrl.searchParams.get('method') ?? 'revenue_based'
  const method: AllocationMethod = (VALID_METHODS.includes(rawMethod as AllocationMethod)
    ? rawMethod
    : 'revenue_based') as AllocationMethod

  try {
    const service = new CostAllocationService(supabase)
    const report  = await service.getReport(companyId, method)

    return NextResponse.json(
      { report },
      { headers: { [REQUEST_ID_HEADER]: ctx.requestId } },
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json(
      { error: msg, code: 'SERVICE_ERROR', type: 'SYSTEM' },
      { status: 500, headers: { [REQUEST_ID_HEADER]: ctx.requestId } },
    )
  }
}
