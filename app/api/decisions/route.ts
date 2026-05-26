// app/api/decisions/route.ts
//
// GET  — list decision context snapshots (admin or manager)
// POST — capture a new manual snapshot { trigger_type, trigger_label, trigger_id? }

import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth }            from '@/lib/api-auth'
import { reqCtx, apiError }          from '@/lib/api-utils'
import { DecisionContextService }    from '@/lib/services/decision-context/decision-context.service'

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = reqCtx(req)
  try {
    const auth = await resolveApiAuth(req)
    if (!auth.ok) return auth.response

    const { uid, companyId, supabase } = auth

    // Verify company membership
    const { data: member } = await supabase
      .from('company_members')
      .select('role')
      .eq('company_id', companyId)
      .eq('user_id', uid)
      .maybeSingle()

    if (!member) {
      return apiError(ctx, 'Bu şirkete erişim yetkiniz yok', 403, 'FORBIDDEN')
    }

    const { searchParams } = new URL(req.url)
    const triggerType = searchParams.get('trigger_type') ?? undefined
    const limit       = parseInt(searchParams.get('limit')  ?? '50', 10)
    const offset      = parseInt(searchParams.get('offset') ?? '0',  10)

    const snapshots = await DecisionContextService.list(companyId, supabase, {
      triggerType,
      limit:  Math.min(limit, 100),
      offset: Math.max(offset, 0),
    })

    return NextResponse.json({ snapshots })
  } catch (e) {
    console.error('[api/decisions GET]', e)
    return apiError(ctx, 'Karar geçmişi alınamadı', 500)
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = reqCtx(req)
  try {
    const auth = await resolveApiAuth(req)
    if (!auth.ok) return auth.response

    const { uid, companyId, supabase } = auth

    // Admin-only write
    const { data: member } = await supabase
      .from('company_members')
      .select('role')
      .eq('company_id', companyId)
      .eq('user_id', uid)
      .maybeSingle()

    if (!member || member.role !== 'admin') {
      return apiError(ctx, 'Bu işlem için yönetici yetkisi gereklidir', 403, 'FORBIDDEN')
    }

    const body = await req.json()
    const { trigger_type, trigger_label, trigger_id } = body

    if (!trigger_type || !trigger_label) {
      return apiError(ctx, 'trigger_type ve trigger_label zorunludur', 400, 'VALIDATION_ERROR', 'BUSINESS')
    }

    const snapshot = await DecisionContextService.capture(companyId, uid, supabase, {
      triggerType:  trigger_type as string,
      triggerId:    trigger_id as string | undefined,
      triggerLabel: trigger_label as string,
    })

    return NextResponse.json({ snapshot }, { status: 201 })
  } catch (e) {
    console.error('[api/decisions POST]', e)
    return apiError(ctx, 'Karar bağlamı kaydedilemedi', 500)
  }
}
