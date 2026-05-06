// ─────────────────────────────────────────────────────────────────────────────
// lib/require-role.ts
//
// Role resolution and enforcement for API routes.
//
// Role hierarchy:
//   admin   > manager > viewer
//   3         2         1
//
// Usage pattern in an admin-only route handler:
//
//   const companyId = await resolveCompanyId(user.id, supabase)
//   await requireRole(user.id, companyId, 'admin', supabase)
//   // continues only if admin; throws HTTP-403-shaped AppError otherwise
//
// The resolver reads company_members directly (RLS allows the user to read
// their own membership row). No SECURITY DEFINER is needed here.
// ─────────────────────────────────────────────────────────────────────────────

import { AppError } from '@/types/errors'
import type { MemberRole } from '@/types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabaseClient = any

const ROLE_RANK: Record<MemberRole, number> = {
  admin:   3,
  manager: 2,
  viewer:  1,
}

/**
 * Fetch the caller's role for the given company.
 *
 * Returns null when:
 *   • the user has no membership row (not a member)
 *   • the membership row is soft-deleted
 *
 * Pending invitations are not active memberships. accepted_at must be set.
 *
 * @throws AppError('DB_READ_FAILED') on unexpected DB errors.
 */
export async function resolveUserRole(
  userId:    string,
  companyId: string,
  supabase:  AnySupabaseClient,
): Promise<MemberRole | null> {
  const { data, error } = await supabase
    .from('company_members')
    .select('role')
    .eq('user_id',    userId)
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .not('accepted_at', 'is', null)
    .maybeSingle()

  if (error) {
    throw new AppError(
      'DB_READ_FAILED',
      'Rol bilgisi alınamadı',
      { dbError: error.message },
    )
  }

  if (!data?.role) return null
  return data.role as MemberRole
}

/**
 * Enforce a minimum role level. Throws a 403-shaped AppError if the user's
 * role is lower than `required`, or if they have no active membership.
 *
 * @throws AppError('FORBIDDEN') — route handler must return HTTP 403.
 * @throws AppError('DB_READ_FAILED') — on unexpected DB errors.
 */
export async function requireRole(
  userId:    string,
  companyId: string,
  required:  MemberRole,
  supabase:  AnySupabaseClient,
): Promise<MemberRole> {
  const role = await resolveUserRole(userId, companyId, supabase)

  if (!role) {
    throw new AppError(
      'FORBIDDEN',
      'Bu şirkete erişim yetkiniz bulunmuyor.',
      { userId, companyId },
    )
  }

  if (ROLE_RANK[role] < ROLE_RANK[required]) {
    throw new AppError(
      'FORBIDDEN',
      `Bu işlem için '${required}' yetkisi gereklidir. Mevcut yetkiniz: '${role}'.`,
      { userId, companyId, required, actual: role },
    )
  }

  return role
}

/**
 * Convenience wrapper — require admin role.
 * @throws AppError('FORBIDDEN') if not admin.
 */
export async function requireAdmin(
  userId:    string,
  companyId: string,
  supabase:  AnySupabaseClient,
): Promise<void> {
  await requireRole(userId, companyId, 'admin', supabase)
}
