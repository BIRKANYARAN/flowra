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
 * • If not → fall back to the cookie-based createClient(). This is CORRECT for
 *   server components (the user's session cookie is present) but WRONG for
 *   Bearer-token API routes (no auth cookie → anonymous client → RLS blocks).
 *
 * The fallback is now NEVER silent: the [AUTH-DRIFT] warning is emitted in
 * production as well as dev/test, so drift is visible in production logs and can
 * be traced to the exact caller. Known drift points must thread auth.supabase
 * (or createClient()) explicitly so this branch is never hit at runtime.
 *
 * The `caller` string (e.g. "PartnerCrudService.listPartners") identifies the
 * source in logs — keep it short and descriptive.
 */
export function requireAuthContext(
  clientOverride: AnySupabase | undefined,
  caller: string,
): AnySupabase {
  if (clientOverride != null) return clientOverride

  // Non-silent in ALL environments (incl. production). A missing client in a
  // Bearer-token route yields an anonymous client and RLS-blocked queries; this
  // warning is the breadcrumb that ties the resulting failure back to `caller`.
  console.warn(
    `[AUTH-DRIFT] ${caller} — no authenticated client supplied. ` +
    `Falling back to createClient() (cookie-based). ` +
    `In Bearer-token API routes this produces an unauthenticated client → RLS blocks. ` +
    `Pass auth.supabase from resolveApiAuth() through the full call chain.`,
  )

  return createClient()
}
