import { NextRequest, NextResponse }      from 'next/server'
import { resolveApiAuth }                 from '@/lib/api-auth'
import { reqCtx, apiError }              from '@/lib/api-utils'
import { AuditReadinessService }         from '@/lib/services/governance/audit-readiness.service'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const ctx = reqCtx(req)
  try {
    const auth = await resolveApiAuth(req)
    if (!auth.ok) return auth.response
    const { companyId, supabase } = auth

    const report = await AuditReadinessService.compute(companyId, supabase)
    return NextResponse.json({ report })
  } catch (e) {
    return apiError(ctx, 'Denetim hazırlık raporu alınamadı', 500, 'DB_READ_FAILED')
  }
}
