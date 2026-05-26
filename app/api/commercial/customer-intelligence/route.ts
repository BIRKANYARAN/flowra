// ── /api/commercial/customer-intelligence ─────────────────────────────────────
// GET — per-customer payment profiles + portfolio risk summary
//
// Query params:
//   ?sort=risk|revenue|name|overdue   (default: risk)
//
// Access: any authenticated user with a company (admin, manager, viewer)

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth } from '@/lib/api-auth'
import { apiError, reqCtx } from '@/lib/api-utils'
import {
  CustomerIntelligenceService,
  type CustomerPaymentProfile,
} from '@/lib/services/commercial/customer-intelligence.service'

const RISK_ORDER: Record<CustomerPaymentProfile['risk_tier'], number> = {
  critical: 0,
  high:     1,
  medium:   2,
  low:      3,
}

export async function GET(req: NextRequest) {
  const ctx = reqCtx(req)
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response

  const { companyId, supabase } = auth
  const { searchParams } = new URL(req.url)
  const sort = searchParams.get('sort') ?? 'risk'

  try {
    const profiles = await CustomerIntelligenceService.getProfiles(companyId, supabase)
    const portfolio = CustomerIntelligenceService.computePortfolioRisk(profiles)

    // Sort
    const sorted = [...profiles].sort((a, b) => {
      switch (sort) {
        case 'revenue':
          return b.total_revenue_try - a.total_revenue_try
        case 'name':
          return a.customer_name.localeCompare(b.customer_name, 'tr')
        case 'overdue':
          return b.overdue_amount_try - a.overdue_amount_try
        case 'risk':
        default:
          // Primary: risk tier, secondary: overdue amount desc
          const tierDiff = RISK_ORDER[a.risk_tier] - RISK_ORDER[b.risk_tier]
          if (tierDiff !== 0) return tierDiff
          return b.overdue_amount_try - a.overdue_amount_try
      }
    })

    return NextResponse.json({
      profiles:    sorted,
      portfolio,
      computed_at: new Date().toISOString(),
    })
  } catch (err) {
    console.error('[customer-intelligence]', err)
    return apiError(ctx, 'Müşteri zekası hesaplanamadı', 500)
  }
}
