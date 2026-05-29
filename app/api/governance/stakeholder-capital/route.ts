import { NextRequest, NextResponse }        from 'next/server'
import { resolveApiAuth }                   from '@/lib/api-auth'
import { reqCtx, apiError }                from '@/lib/api-utils'
import { StakeholderCapitalService }        from '@/lib/services/governance/stakeholder-capital.service'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const ctx = reqCtx(req)
  try {
    const auth = await resolveApiAuth(req)
    if (!auth.ok) return auth.response
    const { uid, companyId, supabase } = auth

    // Admin-only
    const { data: memberRow } = await supabase
      .from('company_members')
      .select('role')
      .eq('user_id', uid)
      .eq('company_id', companyId)
      .maybeSingle()
    const role = (memberRow as { role?: string } | null)?.role ?? 'viewer'
    if (role !== 'admin') return apiError(ctx, 'Yetkisiz', 403, 'FORBIDDEN')

    const asOf = req.nextUrl.searchParams.get('asOf') ?? undefined

    const summary = await StakeholderCapitalService.getSummary(companyId, supabase, { asOf })
    return NextResponse.json({ summary })
  } catch (e) {
    return apiError(ctx, 'Sermaye hesapları alınamadı', 500, 'DB_READ_FAILED')
  }
}
