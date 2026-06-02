// ═══════════════════════════════════════════════════════════════════════════════
// GET  /api/settings/kpi-targets  → list all active KPI targets for company
// POST /api/settings/kpi-targets  → upsert one target (admin only)
//
// POST body: { kpi_key, target_value, period_type?, target_label? }
// ═══════════════════════════════════════════════════════════════════════════════

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth }            from '@/lib/api-auth'
import { requireAdmin }              from '@/lib/require-role'
import { KPI_DEFINITIONS }           from '@/lib/services/intelligence/kpi-tracker.service'

const VALID_KPI_KEYS = new Set(Object.keys(KPI_DEFINITIONS))
const VALID_PERIOD_TYPES = new Set(['monthly', 'quarterly', 'annual', 'rolling'])

export async function GET(req: NextRequest) {
  try {
    const auth = await resolveApiAuth(req)
    if (!auth.ok) return auth.response
    const { companyId, supabase } = auth

    const { data, error } = await supabase
      .from('kpi_targets')
      .select('id, kpi_key, target_value, target_label, period_type, is_active, created_at, updated_at')
      .eq('company_id', companyId)
      .eq('is_active', true)
      .order('kpi_key')

    if (error) {
      // Table may not exist yet in dev
      return NextResponse.json({ targets: [] })
    }

    return NextResponse.json({ targets: data ?? [] })
  } catch (e) {
    console.error('[settings/kpi-targets GET]', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await resolveApiAuth(req)
    if (!auth.ok) return auth.response
    const { uid, companyId, supabase } = auth

    await requireAdmin(uid, companyId, supabase)

    const body = await req.json().catch(() => null)

    if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Geçersiz JSON gövdesi', code: 'VALIDATION_ERROR' }, { status: 422 })
    const { kpi_key, target_value, period_type, target_label } = body

    // Validate kpi_key
    if (!kpi_key || !VALID_KPI_KEYS.has(String(kpi_key))) {
      return NextResponse.json(
        { error: `kpi_key geçersiz. Geçerli değerler: ${[...VALID_KPI_KEYS].join(', ')}` },
        { status: 400 },
      )
    }

    // Validate target_value
    if (target_value === undefined || target_value === null) {
      return NextResponse.json({ error: 'target_value zorunludur' }, { status: 400 })
    }
    const numericTarget = Number(target_value)
    if (isNaN(numericTarget)) {
      return NextResponse.json({ error: 'target_value sayısal olmalıdır' }, { status: 400 })
    }

    // Validate period_type
    const resolvedPeriodType = period_type ?? 'monthly'
    if (!VALID_PERIOD_TYPES.has(String(resolvedPeriodType))) {
      return NextResponse.json(
        { error: `period_type geçersiz. Geçerli değerler: monthly, quarterly, annual, rolling` },
        { status: 400 },
      )
    }

    const { data: upserted, error } = await supabase
      .from('kpi_targets')
      .upsert({
        company_id:   companyId,
        kpi_key:      String(kpi_key),
        target_value: numericTarget,
        target_label: target_label ?? null,
        period_type:  String(resolvedPeriodType),
        is_active:    true,
        created_by:   uid,
      }, { onConflict: 'company_id,kpi_key' })
      .select('id, kpi_key, target_value, target_label, period_type, is_active, updated_at')
      .single()

    if (error) {
      console.error('[settings/kpi-targets POST] upsert error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ target: upserted })
  } catch (e) {
    console.error('[settings/kpi-targets POST]', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
