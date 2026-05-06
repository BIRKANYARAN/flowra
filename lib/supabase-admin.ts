// ─────────────────────────────────────────────────────────────────────────────
// lib/supabase-admin.ts — INTERNAL DEPENDENCY ONLY
//
// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  DO NOT import this file directly from routes, services, or components. ║
// ║  Use lib/admin-db.ts instead:                                           ║
// ║    import { safeAdminQuery, getAdminAuth } from '@/lib/admin-db'        ║
// ║                                                                          ║
// ║  safeAdminQuery() enforces company_id on every query.                   ║
// ║  getAdminAuth()   exposes auth.users reads only.                        ║
// ║                                                                          ║
// ║  This file is the sole dependency of lib/admin-db.ts.                  ║
// ║  Nothing else should import it.                                         ║
// ╚══════════════════════════════════════════════════════════════════════════╝
//
// This client bypasses ALL Row Level Security policies.
// Never use admin.from() without going through safeAdminQuery().
// Never expose the service-role key to the browser.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from '@supabase/supabase-js'

/**
 * Returns a Supabase client authenticated with the service role key.
 * Bypasses RLS. Server-side only.
 *
 * @throws Error if SUPABASE_SERVICE_ROLE_KEY is not set.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    throw new Error(
      '[Flowra] Missing service-role environment variables.\n' +
      'Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your .env.local file.',
    )
  }

  return createClient(url, key, {
    auth: {
      // Disable automatic session persistence — this is a server-only client.
      autoRefreshToken:  false,
      persistSession:    false,
      detectSessionInUrl: false,
    },
  })
}
