import { NextRequest, NextResponse }      from 'next/server'
import { resolveApiAuth }                 from '@/lib/api-auth'
import { reqCtx, apiError }              from '@/lib/api-utils'
import { AuditReadinessService }         from '@/lib/services/governance/audit-readiness.service'

export const dynamic = 'force-dynamic'

const ACKNOWLEDGED_KEYS = new Set([
  'receivables_aging_reviewed',
  'partner_distributions_reviewed',
  'governance_review_completed',
  'tax_review_acknowledged',
])

export async function POST(req: NextRequest) {
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

    const body = await req.json().catch(() => ({}))
    const { check_key, notes, valid_days } = body as {
      check_key?: string
      notes?:     string
      valid_days?: number
    }

    if (!check_key) {
      return apiError(ctx, 'check_key gerekli', 400, 'VALIDATION_ERROR')
    }
    if (!ACKNOWLEDGED_KEYS.has(check_key)) {
      return apiError(ctx, `Geçersiz check_key: ${check_key}`, 400, 'VALIDATION_ERROR')
    }

    await AuditReadinessService.acknowledge(companyId, check_key, uid, supabase, {
      notes,
      validDays: valid_days ?? 30,
    })

    return NextResponse.json({ ok: true }, { status: 201 })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Onay kaydedilemedi'
    return apiError(ctx, msg, 500, 'DB_WRITE_FAILED')
  }
}
