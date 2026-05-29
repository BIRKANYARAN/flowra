// ── /api/commercial/category-performance ─────────────────────────────────────
// GET — Returns CategoryPerformanceReport: product category sales performance.
// Analyzes current month vs same month prior year with growth, margin,
// mix shift, and HHI concentration analysis.
// Access: manager+ only.

export const revalidate = 1800 // 30 minutes

import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth } from '@/lib/api-auth'
import { apiError } from '@/lib/api-utils'
import { CategoryPerformanceService } from '@/lib/services/commercial/category-performance.service'

export async function GET(req: NextRequest) {
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response

  const { companyId, supabase, ctx } = auth

  try {
    const service = new CategoryPerformanceService(supabase)
    const report  = await service.getReport(companyId)
    return NextResponse.json({ report })
  } catch (err) {
    console.error('[category-performance]', err)
    return apiError(ctx, 'Kategori performans raporu hesaplanamadı', 500)
  }
}
