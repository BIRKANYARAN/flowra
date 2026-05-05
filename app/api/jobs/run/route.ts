// ── POST /api/jobs/run ────────────────────────────────────────────────────────
// Triggered by a CRON (Vercel Cron / Supabase pg_cron / external scheduler).
// Protected by a shared secret in the Authorization header.
//
// Vercel cron.json example:
// { "crons": [{ "path": "/api/jobs/run", "schedule": "* * * * *" }] }

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { drainJobs } from '@/lib/jobs/worker'

async function handler(req: NextRequest) {
  // ── Auth: shared secret — fail closed ────────────────────────────────────
  // If CRON_SECRET is not configured, deny ALL requests rather than allowing
  // open access. Set CRON_SECRET in your environment before deploying.
  const cronSecret = process.env.CRON_SECRET
  const token      = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!cronSecret || token !== cronSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const results   = await drainJobs(20)
    const succeeded = results.filter(r => r.success).length
    const failed    = results.filter(r => !r.success).length

    return NextResponse.json({ processed: results.length, succeeded, failed, results })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[/api/jobs/run]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export { handler as GET, handler as POST }
