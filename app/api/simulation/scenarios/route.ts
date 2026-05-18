// GET  /api/simulation/scenarios  — list saved what-if scenarios (latest 20)
// POST /api/simulation/scenarios  — save a new scenario

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth } from '@/lib/api-auth'

export async function GET(req: NextRequest) {
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response
  const { companyId, supabase } = auth

  const { data, error } = await supabase
    .from('simulation_scenarios')
    .select('id, name, description, inputs, summary, is_baseline, created_at, updated_at')
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .order('updated_at', { ascending: false })
    .limit(20)

  if (error) {
    console.error('[scenarios] list error:', error.message)
    return NextResponse.json({ error: 'Could not load scenarios' }, { status: 500 })
  }

  return NextResponse.json({ scenarios: data ?? [] })
}

export async function POST(req: NextRequest) {
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response
  const { uid, companyId, supabase } = auth

  let body: { name?: string; inputs?: unknown; summary?: unknown; tags?: unknown } = {}
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 422 })
  }

  const name = String(body.name ?? '').trim().slice(0, 80)
  if (!name) return NextResponse.json({ error: 'name required' }, { status: 422 })

  // Keep only the 20 most recent scenarios (soft-delete oldest beyond cap)
  const { data: existing } = await supabase
    .from('simulation_scenarios')
    .select('id, created_at')
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })

  if (existing && existing.length >= 20) {
    const toArchive = existing.slice(0, existing.length - 19).map(r => r.id)
    await supabase
      .from('simulation_scenarios')
      .update({ deleted_at: new Date().toISOString() })
      .in('id', toArchive)
  }

  const { data: row, error } = await supabase
    .from('simulation_scenarios')
    .insert({
      company_id:        companyId,
      user_id:           uid,
      name,
      inputs:            body.inputs ?? {},
      summary:           body.summary ?? {},
      monthly_breakdown: [],
      assumptions:       [],
      tags:              Array.isArray(body.tags) ? body.tags : [],
    })
    .select('id, name, inputs, summary, created_at')
    .single()

  if (error) {
    console.error('[scenarios] insert error:', error.message)
    return NextResponse.json({ error: 'Could not save scenario' }, { status: 500 })
  }

  return NextResponse.json({ scenario: row }, { status: 201 })
}
