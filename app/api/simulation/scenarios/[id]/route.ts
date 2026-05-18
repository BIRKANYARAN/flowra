// DELETE /api/simulation/scenarios/[id] — soft-delete a saved scenario

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
