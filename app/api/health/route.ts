// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/health
//
// Deploy verification endpoint — no authentication required.
// Checks every critical system dependency and returns a structured report.
//
// Response shape:
//   {
//     status: "ok" | "degraded" | "fail",
//     checks: [{ name, ok, detail? }],
//     timestamp: ISO string
//   }
//
// HTTP status codes:
//   200 — all checks pass  (status: "ok")
//   503 — any core check fails  (status: "degraded" or "fail")
//
// Checks performed (in order):
//   1. env_vars              — NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY present
//   2. db_connection         — fx_rates table reachable (anon client)
//   3. company_members_table — company_members table readable (admin client, bypasses RLS)
//   4. bootstrap_rpc         — bootstrap_user_company() exists in DB (via admin)
//   5. idempotency_table     — idempotency_keys table reachable (anon client)
//   6. audit_table           — audit_logs table reachable (anon client)
//   7. tasks_table           — tasks table exists (anon client; RLS denial = OK)
//   8. storage_logos_bucket  — logos storage bucket exists (admin client; informational)
//   9. fx_feed               — /api/fx returns a live USD rate (informational only)
//
// Core checks: 1–7. If ANY core check fails, status = "fail" and HTTP 503.
// storage_logos_bucket (#8) and fx_feed (#9) are informational — their failure
// does not affect HTTP status.
// ═══════════════════════════════════════════════════════════════════════════════

export const dynamic = 'force-dynamic'

import { NextResponse }  from 'next/server'
import { createClient }  from '@/lib/supabase-server'

interface Check {
  name:    string
  ok:      boolean
  detail?: string
}

export async function GET() {
  const checks: Check[] = []
  const t0 = Date.now()

  // ── 1. ENV vars ───────────────────────────────────────────────────────────
  const supabaseUrl  = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const envOk        = !!(supabaseUrl && supabaseAnon)
  checks.push({
    name:   'env_vars',
    ok:     envOk,
    detail: envOk
      ? undefined
      : 'NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY is not set',
  })

  // ── 2. DB connection (anon client — fx_rates is always populated) ─────────
  let dbOk = false
  try {
    const supabase  = createClient()
    const { error } = await supabase.from('fx_rates').select('id').limit(1)
    dbOk = !error
    checks.push({ name: 'db_connection', ok: dbOk, detail: error?.message })
  } catch (e) {
    checks.push({ name: 'db_connection', ok: false, detail: String(e) })
  }

  // ── 3. company_members table (admin client — bypasses RLS) ───────────────
  // Uses SUPABASE_SERVICE_ROLE_KEY if available. This key is not required for
  // the app to function but is needed for this specific health check.
  let companyMembersOk = false
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (supabaseUrl && serviceKey) {
    try {
      // Import directly — health route is infrastructure, not a data route
      const { createClient: createSBClient } = await import('@supabase/supabase-js')
      const admin = createSBClient(supabaseUrl, serviceKey, {
        auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
      })
      const { error } = await admin.from('company_members').select('company_id').limit(1)
      companyMembersOk = !error
      checks.push({
        name:   'company_members_table',
        ok:     companyMembersOk,
        detail: error?.message,
      })
    } catch (e) {
      checks.push({ name: 'company_members_table', ok: false, detail: String(e) })
    }
  } else {
    // No service role key — fall back to anon client.
    // RLS will block the read, but we can distinguish "table exists" (RLS error)
    // from "table missing" (42P01 code).
    try {
      const supabase  = createClient()
      const { error } = await supabase.from('company_members').select('company_id').limit(1)
      // code '42P01' = relation does not exist = table missing
      if (!error) {
        companyMembersOk = true
        checks.push({ name: 'company_members_table', ok: true })
      } else if ((error as { code?: string }).code === '42P01') {
        checks.push({ name: 'company_members_table', ok: false, detail: 'Table does not exist' })
      } else {
        // Permission denied (RLS) — table exists, anon just can't read it
        companyMembersOk = true
        checks.push({ name: 'company_members_table', ok: true, detail: 'RLS blocks anon read (expected)' })
      }
    } catch (e) {
      checks.push({ name: 'company_members_table', ok: false, detail: String(e) })
    }
  }

  // ── 4. bootstrap_user_company RPC (admin — call with dummy UUID to verify
  //       the function exists; it returns null for a non-existent user) ──────
  let bootstrapOk = false
  if (supabaseUrl && serviceKey) {
    try {
      const { createClient: createSBClient } = await import('@supabase/supabase-js')
      const admin = createSBClient(supabaseUrl, serviceKey, {
        auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
      })
      // A known-nonexistent UUID — function should return null, not throw
      const { error } = await admin.rpc('bootstrap_user_company', {
        p_user_id: '00000000-0000-0000-0000-000000000000',
      })
      // If function exists: no error (or a constraint violation is fine, table exists)
      // If function missing: error code 42883 (function does not exist)
      if (!error) {
        bootstrapOk = true
        checks.push({ name: 'bootstrap_rpc', ok: true })
      } else if ((error as { code?: string }).code === '42883') {
        checks.push({ name: 'bootstrap_rpc', ok: false, detail: 'bootstrap_user_company() RPC not found' })
      } else {
        // Other DB error — function likely exists but rejected our dummy UUID
        bootstrapOk = true
        checks.push({ name: 'bootstrap_rpc', ok: true, detail: error.message })
      }
    } catch (e) {
      checks.push({ name: 'bootstrap_rpc', ok: false, detail: String(e) })
    }
  } else {
    checks.push({ name: 'bootstrap_rpc', ok: true, detail: 'Skipped (no service role key)' })
    bootstrapOk = true
  }

  // ── 5. idempotency_keys table ─────────────────────────────────────────────
  let idempotencyOk = false
  try {
    const supabase  = createClient()
    const { error } = await supabase.from('idempotency_keys').select('id').limit(1)
    idempotencyOk = !error
    checks.push({ name: 'idempotency_table', ok: idempotencyOk, detail: error?.message })
  } catch (e) {
    checks.push({ name: 'idempotency_table', ok: false, detail: String(e) })
  }

  // ── 6. audit_logs table ───────────────────────────────────────────────────
  let auditOk = false
  try {
    const supabase  = createClient()
    const { error } = await supabase.from('audit_logs').select('id').limit(1)
    auditOk = !error
    checks.push({ name: 'audit_table', ok: auditOk, detail: error?.message })
  } catch (e) {
    checks.push({ name: 'audit_table', ok: false, detail: String(e) })
  }

  // ── 7. tasks table ────────────────────────────────────────────────────────
  // Use the anon client. RLS will block the read, but we can distinguish
  // "table exists" (any error code other than 42P01) from "table missing" (42P01).
  let tasksOk = false
  try {
    const supabase  = createClient()
    const { error } = await supabase.from('tasks').select('id').limit(1)
    if (!error) {
      tasksOk = true
      checks.push({ name: 'tasks_table', ok: true })
    } else if ((error as { code?: string }).code === '42P01') {
      checks.push({ name: 'tasks_table', ok: false, detail: 'Table does not exist — run repair_production.sql' })
    } else {
      // Permission denied (RLS blocks anon) — table exists, just not readable by anon
      tasksOk = true
      checks.push({ name: 'tasks_table', ok: true, detail: 'RLS blocks anon read (expected)' })
    }
  } catch (e) {
    checks.push({ name: 'tasks_table', ok: false, detail: String(e) })
  }

  // ── 8. Storage bucket: logos (informational) ──────────────────────────────
  // Checked via admin client when service role key is available.
  // Failure here does NOT affect HTTP status (informational only).
  let logosOk = false
  if (supabaseUrl && serviceKey) {
    try {
      const { createClient: createSBClient } = await import('@supabase/supabase-js')
      const admin = createSBClient(supabaseUrl, serviceKey, {
        auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
      })
      const { data: bucket, error } = await admin.storage.getBucket('logos')
      logosOk = !error && !!bucket
      checks.push({
        name:   'storage_logos_bucket',
        ok:     logosOk,
        detail: error?.message ?? (logosOk ? undefined : 'Bucket not found — run repair_production.sql'),
      })
    } catch (e) {
      checks.push({ name: 'storage_logos_bucket', ok: false, detail: String(e) })
    }
  } else {
    // No service role key — skip rather than fail (storage requires admin access)
    checks.push({ name: 'storage_logos_bucket', ok: true, detail: 'Skipped (no service role key)' })
    logosOk = true
  }

  // ── 9. FX feed (informational — external dependency) ─────────────────────
  let fxOk = false
  try {
    const base = process.env.NEXT_PUBLIC_SITE_URL
      ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null)
      ?? 'http://localhost:3000'
    const res = await fetch(`${base}/api/fx`, { cache: 'no-store' })
    if (res.ok) {
      const d = await res.json()
      fxOk = typeof d.USD === 'number' && d.USD > 0
    }
    checks.push({ name: 'fx_feed', ok: fxOk, detail: fxOk ? undefined : 'No valid USD rate returned' })
  } catch (e) {
    checks.push({ name: 'fx_feed', ok: false, detail: String(e) })
  }

  // ── Status ────────────────────────────────────────────────────────────────
  // Core checks: 1–7 (env_vars, db_connection, company_members, bootstrap_rpc,
  //              idempotency_table, audit_table, tasks_table).
  // Informational only: storage_logos_bucket (#8), fx_feed (#9).
  const NON_CORE = new Set(['fx_feed', 'storage_logos_bucket'])
  const coreChecks = checks.filter(c => !NON_CORE.has(c.name))
  const allCoreOk  = coreChecks.every(c => c.ok)
  const status     = allCoreOk ? 'ok' : 'fail'

  // Log failures server-side so they appear in Vercel Function Logs
  if (!allCoreOk) {
    const failures = coreChecks.filter(c => !c.ok).map(c => `${c.name}: ${c.detail ?? 'failed'}`)
    console.error('[Flowra][health] Core check failures:', failures)
  }

  return NextResponse.json(
    {
      status,
      checks,
      timestamp: new Date().toISOString(),
      duration_ms: Date.now() - t0,
    },
    { status: allCoreOk ? 200 : 503 },
  )
}
