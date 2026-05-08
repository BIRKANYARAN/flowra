// GET /api/partners/debt-burden
//
// Ownership-normalized debt burden analysis.
// Returns per-partner overfunding ratios, repayment priorities, and the
// amount to repay each partner to equalize per-unit debt exposure.

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createClient }        from '@/lib/supabase-server'
import { resolveCompanyId }    from '@/lib/resolve-company'
import { contextFromHeader }   from '@/lib/logger'
import { REQUEST_ID_HEADER }   from '@/middleware'
import { PartnerService }      from '@/lib/services/partner.service'
import { toErrorResponse }     from '@/types/errors'

export async function GET(req: NextRequest) {
  const supabase = createClient()
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData?.user) {
    return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 })
  }
  const ctx = contextFromHeader(req.headers.get(REQUEST_ID_HEADER), authData.user.id)

  let companyId: string
  try { companyId = await resolveCompanyId(authData.user.id, supabase) }
  catch {
    return NextResponse.json(
      { error: 'Şirket bilgisi alınamadı', code: 'COMPANY_NOT_RESOLVED' },
      { status: 409 }
    )
  }

  try {
    const result = await PartnerService.calculateDebtBurden(authData.user.id, companyId, ctx)
    return NextResponse.json(result, { headers: { [REQUEST_ID_HEADER]: ctx.requestId } })
  } catch (err) {
    const { body, status } = toErrorResponse(err)
    return NextResponse.json(body, { status, headers: { [REQUEST_ID_HEADER]: ctx.requestId } })
  }
}
