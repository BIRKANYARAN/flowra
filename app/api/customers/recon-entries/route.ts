// ── /api/customers/recon-entries — read-only Flowra cari for name reconciliation
//
// Returns Flowra's customers as { id, name } to match (by normalized name)
// against an accounting system's cari list uploaded client-side. READ-ONLY.

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth } from '@/lib/api-auth'
import type { NamedParty } from '@/lib/connectors/reconcile-names'

export async function GET(req: NextRequest) {
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response
  const { companyId, supabase } = auth

  const { data, error } = await supabase
    .from('customers')
    .select('id, name')
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .order('name')
    .limit(5000)

  if (error) return NextResponse.json({ error: 'Veri alınamadı' }, { status: 500 })

  const entries: NamedParty[] = ((data ?? []) as Array<{ id: string; name: string | null }>)
    .map(c => ({ id: c.id, name: (c.name ?? '').trim() }))
    .filter(c => c.name !== '')

  return NextResponse.json({ entries })
}
