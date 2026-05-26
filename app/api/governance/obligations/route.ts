import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth }            from '@/lib/api-auth'
import { reqCtx, apiError }          from '@/lib/api-utils'

export const dynamic = 'force-dynamic'

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
    if (!body.title || !body.due_date) {
      return apiError(ctx, 'title ve due_date gerekli', 400, 'VALIDATION_ERROR')
    }

    const { data, error } = await supabase
      .from('governance_obligations')
      .insert({
        company_id:       companyId,
        obligation_type:  body.obligation_type ?? 'contractual',
        title:            body.title,
        description:      body.description ?? null,
        due_date:         body.due_date,
        recurrence:       body.recurrence ?? 'none',
        recurrence_day:   body.recurrence_day ?? null,
        status:           'pending',
        source:           'user',
        metadata:         body.metadata ?? {},
        created_by:       uid,
      })
      .select()
      .single()
    if (error) throw error
    return NextResponse.json({ obligation: data }, { status: 201 })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Yükümlülük kaydedilemedi'
    return apiError(ctx, msg, 500, 'DB_WRITE_FAILED')
  }
}
