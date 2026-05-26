import { NextRequest, NextResponse }       from 'next/server'
import { resolveApiAuth }                  from '@/lib/api-auth'
import { reqCtx, apiError }                from '@/lib/api-utils'
import { CorporateActionsService }         from '@/lib/services/governance/corporate-actions.service'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const ctx = reqCtx(req)
  try {
    const auth = await resolveApiAuth(req)
    if (!auth.ok) return auth.response
    const { companyId, supabase } = auth
    const sp = req.nextUrl.searchParams

    const actions = await CorporateActionsService.list(companyId, supabase, {
      limit:      sp.get('limit') ? Number(sp.get('limit')) : 100,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      actionType: sp.get('type') as any ?? undefined,
      from:       sp.get('from') ?? undefined,
      to:         sp.get('to')   ?? undefined,
    })
    const counts = await CorporateActionsService.countByType(companyId, supabase)
    return NextResponse.json({ actions, counts })
  } catch (e) {
    return apiError(ctx, 'Kurumsal aksiyonlar alınamadı', 500, 'DB_READ_FAILED')
  }
}

export async function POST(req: NextRequest) {
  const ctx = reqCtx(req)
  try {
    const auth = await resolveApiAuth(req)
    if (!auth.ok) return auth.response
    const { uid, companyId, supabase } = auth

    // Fetch role from company_members
    const { data: memberRow } = await supabase
      .from('company_members')
      .select('role')
      .eq('user_id', uid)
      .eq('company_id', companyId)
      .maybeSingle()
    const role = (memberRow as { role?: string } | null)?.role ?? 'viewer'
    if (role !== 'admin') return apiError(ctx, 'Yetkisiz', 403, 'FORBIDDEN')

    const body = await req.json().catch(() => ({}))
    if (!body.action_type || !body.action_date || !body.title || !body.authorized_by) {
      return apiError(ctx, 'Eksik alan: action_type, action_date, title, authorized_by gerekli', 400, 'VALIDATION_ERROR')
    }

    const action = await CorporateActionsService.create({
      companyId,
      userId:              uid,
      actionType:          body.action_type,
      actionDate:          body.action_date,
      title:               body.title,
      description:         body.description,
      authorizedBy:        body.authorized_by,
      resolutionReference: body.resolution_reference,
      linkedEventType:     body.linked_event_type,
      linkedEventId:       body.linked_event_id,
      financialAmount:     body.financial_amount ? Number(body.financial_amount) : undefined,
      financialCurrency:   body.financial_currency ?? 'TRY',
      metadata:            body.metadata ?? {},
    }, supabase)
    return NextResponse.json({ action }, { status: 201 })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Kurumsal aksiyon kaydedilemedi'
    return apiError(ctx, msg, 500, 'DB_WRITE_FAILED')
  }
}
