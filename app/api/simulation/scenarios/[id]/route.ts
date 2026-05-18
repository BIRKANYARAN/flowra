// /api/simulation/scenarios/[id]
//   DELETE — soft-delete a saved scenario
//   PATCH  — update scenario (currently: set as baseline)

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth } from '@/lib/api-auth'

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response
  const { companyId, supabase } = auth

  const { id } = params
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const { error } = await supabase
    .from('simulation_scenarios')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .eq('company_id', companyId)   // RLS + explicit company guard

  if (error) {
    console.error('[scenarios] delete error:', error.message)
    return NextResponse.json({ error: 'Could not delete scenario' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response
  const { companyId, supabase } = auth

  const { id } = params
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  let body: Record<string, unknown>
  try { body = await req.json() } catch { body = {} }

  // Currently only supports setting is_baseline
  if (body.is_baseline === true) {
    // 1. Unset baseline for all other scenarios in this company
    const { error: clearErr } = await supabase
      .from('simulation_scenarios')
      .update({ is_baseline: false })
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .neq('id', id)

    if (clearErr) {
      console.error('[scenarios] clear baseline error:', clearErr.message)
      return NextResponse.json({ error: 'Could not clear baseline' }, { status: 500 })
    }

    // 2. Set this scenario as baseline
    const { error: setErr } = await supabase
      .from('simulation_scenarios')
      .update({ is_baseline: true, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('company_id', companyId)

    if (setErr) {
      console.error('[scenarios] set baseline error:', setErr.message)
      return NextResponse.json({ error: 'Could not set baseline' }, { status: 500 })
    }

    return NextResponse.json({ ok: true, is_baseline: true })
  }

  return NextResponse.json({ error: 'Unsupported patch operation' }, { status: 400 })
}
