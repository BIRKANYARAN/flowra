import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth } from '@/lib/api-auth'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response
  const { companyId, supabase } = auth

  const { data: snap } = await supabase
    .from('reconciliation_snapshots')
    .select('id,created_at,created_by,status,is_immutable,immutable_at')
    .eq('id', params.id).eq('company_id', companyId).maybeSingle()

  if (!snap) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: signoffs } = await supabase
    .from('reconciliation_signoffs')
    .select('partner_name,status,signed_at,comments')
    .eq('snapshot_id', params.id)

  // Build synthetic audit trail
  const trail = []
  trail.push({ action: 'created', actor: snap.created_by ?? 'sistem', timestamp: snap.created_at, note: 'Mutabakat oluşturuldu', hash_at_time: null })

  for (const s of signoffs ?? []) {
    if (s.signed_at) {
      trail.push({
        action: s.status === 'approved' ? 'approved' : 'rejected',
        actor: s.partner_name,
        timestamp: s.signed_at,
        note: s.comments ?? null,
        hash_at_time: null,
      })
    }
  }

  if (snap.is_immutable && snap.immutable_at) {
    trail.push({ action: 'locked', actor: 'admin', timestamp: snap.immutable_at, note: 'Mutabakat kilitlendi — değiştirilemez', hash_at_time: null })
  }

  trail.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())

  return NextResponse.json({ snapshot_id: params.id, trail })
}
