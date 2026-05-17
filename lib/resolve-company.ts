// ─────────────────────────────────────────────────────────────────────────────
// lib/resolve-company.ts
//
// Resolves the primary company_id for an authenticated user.
//
// Design decisions:
//   • Queries company_members (not companies.owner_user_id) — Phase 4.3
//     compatible: a user may belong to a company they do not own.
//   • ORDER BY created_at ASC: deterministic. The user's oldest membership wins.
//   • Bootstrap path: if no company exists (new signup, trigger race condition,
//     or pre-trigger DB) calls bootstrap_user_company() RPC which atomically
//     creates companies + company_members + user_settings in one transaction.
//   • Never returns null — throws AppError('COMPANY_NOT_RESOLVED') only if
//     both the lookup AND the bootstrap fail.
//   • Accepts the caller's supabase instance so the function runs within the
//     same request context (cookies, auth) without creating a second client.
// ─────────────────────────────────────────────────────────────────────────────

import { AppError } from '@/types/errors'

// Minimal interface: only the .from() and .rpc() methods are used here.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabaseClient = any

/**
 * Resolve the primary company_id for `userId`.
 *
 * Call this exactly once per request handler, right after the auth check.
 * Pass the result through to every INSERT and service call — never re-resolve.
 *
 * @throws AppError('COMPANY_NOT_RESOLVED', ...) — route should return HTTP 500.
 */
export async function resolveCompanyId(
  userId:   string,
  supabase: AnySupabaseClient,
): Promise<string> {
  // ── Primary lookup ────────────────────────────────────────────────────────
  const { data, error } = await supabase
    .from('company_members')
    .select('company_id')
    .eq('user_id', userId)
    .is('deleted_at', null)
    .not('accepted_at', 'is', null)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error('[Flowra][resolveCompanyId] DB error on company_members lookup:', {
      userId,
      code:    error.code,
      message: error.message,
    })
    throw new AppError(
      'COMPANY_NOT_RESOLVED',
      'Şirket bilgisi alınamadı',
      { dbError: error.message },
    )
  }

  if (data?.company_id) {
    return data.company_id as string
  }

  // ── Bootstrap path ────────────────────────────────────────────────────────
  // Reaches here when:
  //   • User signed up before the on_auth_user_created trigger was installed
  //   • Social login / OAuth race condition (trigger fired before user row committed)
  //   • DB was freshly installed but the backfill in 08_bootstrap.sql didn't run yet
  //
  // bootstrap_user_company() is SECURITY DEFINER + idempotent:
  //   - Creates companies + company_members + user_settings in one transaction
  //   - Returns immediately if already bootstrapped (no duplicate rows)
  const { data: companyId, error: bootstrapError } = await supabase
    .rpc('bootstrap_user_company', { p_user_id: userId })

  if (bootstrapError) {
    console.error('[Flowra][resolveCompanyId] bootstrap_user_company RPC failed:', {
      userId,
      code:    bootstrapError.code,
      message: bootstrapError.message,
    })
    throw new AppError(
      'COMPANY_NOT_RESOLVED',
      'Bu hesaba bağlı bir şirket bulunamadı ve otomatik oluşturulamadı.',
      { dbError: bootstrapError.message, userId },
    )
  }

  if (!companyId) {
    console.error('[Flowra][resolveCompanyId] bootstrap_user_company returned null:', { userId })
    throw new AppError(
      'COMPANY_NOT_RESOLVED',
      'Bu hesaba bağlı bir şirket bulunamadı. Lütfen destek ekibiyle iletişime geçin.',
      { userId },
    )
  }

  return companyId as string
}

// ── Multi-company support ──────────────────────────────────────────────────────

export interface UserCompanyEntry {
  companyId:   string
  companyName: string | null
  role:        string
}

/**
 * List all companies a user belongs to (for multi-company switcher).
 * Returns empty array if query fails — non-fatal.
 */
export async function listCompaniesForUser(
  userId:   string,
  supabase: AnySupabaseClient,
): Promise<UserCompanyEntry[]> {
  try {
    const { data, error } = await supabase
      .from('company_members')
      .select('company_id, role, companies(name)')
      .eq('user_id', userId)
      .is('deleted_at', null)
      .not('accepted_at', 'is', null)
      .order('created_at', { ascending: true })

    if (error || !data) return []

    return (data as Array<{
      company_id: string
      role: string
      companies: { name: string } | null
    }>).map(row => ({
      companyId:   row.company_id,
      companyName: row.companies?.name ?? null,
      role:        row.role ?? 'viewer',
    }))
  } catch {
    return []
  }
}

/** Cookie name for selected company preference */
export const COMPANY_PREF_COOKIE = 'flowra_company_pref'

/**
 * Resolve company considering user's explicit preference cookie.
 * Falls back to resolveCompanyId if:
 *   - No preference cookie
 *   - Preference cookie references a company the user doesn't belong to
 */
export async function resolveCompanyWithPref(
  userId:    string,
  supabase:  AnySupabaseClient,
  prefCookieValue: string | undefined,
): Promise<string> {
  if (prefCookieValue) {
    // Verify user is actually a member of the preferred company
    try {
      const { data } = await supabase
        .from('company_members')
        .select('company_id')
        .eq('user_id', userId)
        .eq('company_id', prefCookieValue)
        .is('deleted_at', null)
        .not('accepted_at', 'is', null)
        .maybeSingle()

      if (data?.company_id) return data.company_id as string
    } catch {
      // Fall through to default resolution
    }
  }
  return resolveCompanyId(userId, supabase)
}
