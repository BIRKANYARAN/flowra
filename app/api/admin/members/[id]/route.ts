// ═══════════════════════════════════════════════════════════════════════════════
// PATCH  /api/admin/members/[id]  — Update a member's role (admin only)
// DELETE /api/admin/members/[id]  — Remove a member from the company (admin only)
//
// Role guard: both endpoints require 'admin' role.
//
// PATCH body: { role: 'admin' | 'manager' | 'viewer' }
// DELETE:     soft-deletes the company_members row (sets deleted_at)
//
// Guards:
//   • Cannot demote/remove the last admin of a company.
//   • Cannot remove yourself (to prevent lockout).
// ═══════════════════════════════════════════════════════════════════════════════

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { safeAdminQuery }    from '@/lib/admin-db'
import { requireAdmin }      from '@/lib/require-role'
import { AppError }          from '@/types/errors'
import type { MemberRole }   from '@/types'
import { resolveApiAuth } from '@/lib/api-auth'
import type { SupabaseClient } from '@supabase/supabase-js'
// Never use admin client without company_id filter — use safeAdminQuery() from admin-db.ts

const VALID_ROLES: MemberRole[] = ['admin', 'manager', 'viewer']

// ── Helper: count active admins for a company ─────────────────────────────────

async function countAdmins(companyId: string, supabase: SupabaseClient): Promise<number> {
  const { count, error } = await supabase
    .from('company_members')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .eq('role', 'admin')
    .is('deleted_at', null)
    .not('accepted_at', 'is', null)

  if (error) return 0
  return count ?? 0
}

// ── PATCH /api/admin/members/[id] ─────────────────────────────────────────────

export async function PATCH(
  req:     NextRequest,
  context: { params: { id: string } },
) {
  try {
    const memberId = context.params.id
    if (!memberId) {
      return NextResponse.json({ error: 'id zorunludur' }, { status: 422 })
    }

    const auth = await resolveApiAuth(req)
    if (!auth.ok) return auth.response
    const { uid, companyId, supabase, ctx } = auth

    // Enforce admin-only access
    try { await requireAdmin(uid, companyId, supabase) }
    catch (e) {
      if (e instanceof AppError && e.code === 'FORBIDDEN') {
        return NextResponse.json({ error: e.message, code: 'FORBIDDEN' }, { status: 403 })
      }
      throw e
    }

    const body = await req.json()
    const role = (typeof body.role === 'string' ? body.role : '') as MemberRole
    if (!VALID_ROLES.includes(role)) {
      return NextResponse.json({ error: 'Geçersiz rol.', field: 'role' }, { status: 422 })
    }

    // Fetch the target member row
    const { data: target, error: fetchError } = await supabase
      .from('company_members')
      .select('id, user_id, role, accepted_at')
      .eq('id', memberId)
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .maybeSingle()

    if (fetchError || !target) {
      return NextResponse.json({ error: 'Üye bulunamadı.', code: 'NOT_FOUND' }, { status: 404 })
    }

    // Guard: cannot demote the last active admin
    if (target.role === 'admin' && role !== 'admin') {
      const adminCount = await countAdmins(companyId, supabase)
      if (adminCount <= 1) {
        return NextResponse.json(
          { error: 'Şirkette en az bir yönetici olmalıdır. Son yöneticiyi düşüremezsiniz.', code: 'LAST_ADMIN' },
          { status: 422 },
        )
      }
    }

    // company_members has no UPDATE RLS policy — use safeAdminQuery (service-role).
    // company_id scope guard enforced automatically by safeAdminQuery.updateById().
    const { error: updateError } = await safeAdminQuery('company_members', companyId)
      .updateById(memberId, { role })

    if (updateError) {
      console.error('[admin/members PATCH] update error:', updateError.message)
      return NextResponse.json({ error: 'Rol güncellenemedi.' }, { status: 500 })
    }

    return NextResponse.json({ id: memberId, role })

  } catch (err) {
    console.error('[admin/members PATCH] Unexpected error:', err instanceof Error ? err.message : String(err))
    return NextResponse.json({ error: 'Sunucu hatası' }, { status: 500 })
  }
}

// ── DELETE /api/admin/members/[id] ───────────────────────────────────────────

export async function DELETE(
  req:     NextRequest,
  context: { params: { id: string } },
) {
  try {
    const memberId = context.params.id
    if (!memberId) {
      return NextResponse.json({ error: 'id zorunludur' }, { status: 422 })
    }

    const auth = await resolveApiAuth(req)
    if (!auth.ok) return auth.response
    const { uid, companyId, supabase, ctx } = auth

    // Enforce admin-only access
    try { await requireAdmin(uid, companyId, supabase) }
    catch (e) {
      if (e instanceof AppError && e.code === 'FORBIDDEN') {
        return NextResponse.json({ error: e.message, code: 'FORBIDDEN' }, { status: 403 })
      }
      throw e
    }

    // Fetch the target member row
    const { data: target, error: fetchError } = await supabase
      .from('company_members')
      .select('id, user_id, role, accepted_at')
      .eq('id', memberId)
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .maybeSingle()

    if (fetchError || !target) {
      return NextResponse.json({ error: 'Üye bulunamadı.', code: 'NOT_FOUND' }, { status: 404 })
    }

    // Guard: cannot remove yourself
    if (target.user_id === uid) {
      return NextResponse.json(
        { error: 'Kendinizi şirketten çıkaramazsınız.', code: 'SELF_REMOVE' },
        { status: 422 },
      )
    }

    // Guard: cannot remove the last active admin
    if (target.role === 'admin') {
      const adminCount = await countAdmins(companyId, supabase)
      if (adminCount <= 1) {
        return NextResponse.json(
          { error: 'Şirkette en az bir yönetici olmalıdır. Son yöneticiyi çıkaramazsınız.', code: 'LAST_ADMIN' },
          { status: 422 },
        )
      }
    }

    // Soft-delete — company_members has no UPDATE RLS policy, use safeAdminQuery (service-role).
    // company_id + id scope guards enforced automatically by safeAdminQuery.softDeleteById().
    const { error: deleteError } = await safeAdminQuery('company_members', companyId)
      .softDeleteById(memberId)

    if (deleteError) {
      console.error('[admin/members DELETE] soft-delete error:', deleteError.message)
      return NextResponse.json({ error: 'Üye çıkarılamadı.' }, { status: 500 })
    }

    return NextResponse.json({ deleted: true })

  } catch (err) {
    console.error('[admin/members DELETE] Unexpected error:', err instanceof Error ? err.message : String(err))
    return NextResponse.json({ error: 'Sunucu hatası' }, { status: 500 })
  }
}
