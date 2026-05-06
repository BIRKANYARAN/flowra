// ── POST /api/events/process ──────────────────────────────────────────────────
// Processes pending events from the outbox.
// Triggered by a CRON scheduler.
// Auth: requires the CRON_SECRET bearer token.

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getSystemAdminClient }      from '@/lib/admin-db'
import { EventService }              from '@/lib/services/event.service'
import { makeRequestContext }        from '@/lib/logger'

export async function POST(req: NextRequest) {
  // ── Auth ─────────────────────────────────────────────────────────────────
  const cronSecret = process.env.CRON_SECRET
  const authHeader = req.headers.get('authorization')
  const bearerToken = authHeader?.replace(/^Bearer\s+/i, '')
  if (!cronSecret || bearerToken !== cronSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getSystemAdminClient()
  const ctx = makeRequestContext('service_role')

  try {
    const processed = await EventService.processEvents(supabase, ctx)
    return NextResponse.json({ ok: true, processed })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[/api/events/process]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
