// ═══════════════════════════════════════════════════════════════════════════════
// Auth Context Guard
//
// Every authenticated route resolves one Supabase client via resolveApiAuth()
// and MUST pass it down to every service call.  Services that silently fall
// back to createClient() produce unauthenticated cookie-based clients in
// Bearer-token paths → RLS blocks data → phantom NOT_FOUND errors.
//
// Usage in services:
//
//   import { requireAuthContext } from '@/lib/auth-context'
//   // at top of every DB-touching function:
//   const db = requireAuthContext(clientOverride, 'PartnerCrudService.listPartners')
//
// In development the function logs a warning when auth context is absent and
// the caller falls through to createClient() — this surfaces drift quickly
// without breaking production.
// ═══════════════════════════════════════════════════════════════════════════════

import { createClient } from '@/lib/supabase-server'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = any

/**
 * Resolve the Supabase client for a service call.
 *
 * • If the caller supplied an authenticated client (from resolveApiAuth) → use it.
 * • If not → fall back to createClient() and emit a dev-mode warning so the drift
 *   is visible during development/testing without crashing production.
 *
 * The `caller` string (e.g. "PartnerCrudService.listPartners") is only used for
 * the warning message — keep it short and descriptive.
 */
export function requireAuthContext(
  clientOverride: AnySupabase | undefined,
  caller: string,
): AnySupabase {
  if (clientOverride != null) return clientOverride

  if (process.env.NODE_ENV !== 'production') {
    // In dev/test: loud warning so missing propagation is caught immediately.
    console.warn(
      `[AUTH-DRIFT] ${caller} — no authenticated client supplied. ` +
      `Falling back to createClient() (cookie-based). ` +
      `In Bearer-token API routes this produces an unauthenticated client → RLS blocks. ` +
      `Pass auth.supabase from resolveApiAuth() through the full call chain.`,
    )
  }

  return createClient()
}
