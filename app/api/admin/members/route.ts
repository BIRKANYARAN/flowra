// ═══════════════════════════════════════════════════════════════════════════════
// GET  /api/admin/members  — List all company members (admin only)
// POST /api/admin/members  — Invite an existing user to the company (admin only)
//
// Role guard: both endpoints require 'admin' role.
//
// GET response:
//   Array<CompanyMember>  (email + display_name joined from auth.users via admin client)
//
// POST body:
//   { email: string, role: 'admin' | 'manager' | 'viewer' }
//
// POST response:
//   { id: string }  — new company_members row id
//
// Error: 404 if the email does not belong to an existing Flowra account.
//        409 if the user is already a member of this company.
// ═══════════════════════════════════════════════════════════════════════════════

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { safeAdminQuery, getAdminAuth } from '@/lib/admin-db'
import { requireAdmin }              from '@/lib/require-role'
import { AppError }                  from '@/types/errors'
import type { CompanyMember, MemberRole } from '@/types'
import { resolveApiAuth } from '@/lib/api-auth'
// Never use admin client without company_id filter — use safeAdminQuery() from admin-db.ts

const VALID_ROLES: MemberRole[] = ['admin', 'manager', 'viewer']

// ── GET /api/admin/members ────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
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

    // Fetch all active + pending members for this company
    const { data: members, error: membersError } = await supabase
      .from('company_members')
      .select('id, company_id, user_id, role, invited_by, accepted_at, created_at, deleted_at')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .order('created_at', { ascending: true })

    if (membersError) {
      return NextResponse.json({ error: membersError.message }, { status: 500 })
    }

    // Enrich with email + display_name from auth.users.
    // getAdminAuth() is the only approved path for auth.users reads.
    const adminAuth = getAdminAuth()
    const userIds = (members ?? []).map((m: { user_id: string }) => m.user_id)

    // Parallel auth lookups — one Supabase Admin API call per user, all concurrent
    const authUserMap: Record<string, { email: string | null; display_name: string | null }> = {}
    await Promise.all(userIds.map(async (userId) => {
      try {
        const { data: authUser } = await adminAuth.getUserById(userId)
        if (authUser?.user) {
          const meta  = authUser.user.user_metadata ?? {}
          const first = String(meta.first_name ?? '').trim()
          const last  = String(meta.last_name  ?? '').trim()
          authUserMap[userId] = {
            email:        authUser.user.email ?? null,
            display_name: [first, last].filter(Boolean).join(' ') || authUser.user.email?.split('@')[0] || null,
          }
        } else {
          authUserMap[userId] = { email: null, display_name: null }
        }
      } catch (authErr) {
        // Non-fatal — user row may have been deleted from auth.
        // Log with userId so operators can spot orphaned company_members rows.
        console.warn('[admin/members] auth user fetch failed for userId:', userId, authErr instanceof Error ? authErr.message : String(authErr))
        authUserMap[userId] = { email: null, display_name: null }
      }
    }))

    type RawMember = { id: string; user_id: string; role: string; company_id: string; invited_by?: string | null; accepted_at?: string | null; created_at: string; deleted_at?: string | null }
    const enriched: CompanyMember[] = ((members ?? []) as RawMember[]).map((m) => ({
      id:           m.id,
      user_id:      m.user_id,
      role:         (m.role as MemberRole),
      company_id:   m.company_id,
      invited_by:   m.invited_by   ?? null,
      accepted_at:  m.accepted_at  ?? null,
      created_at:   m.created_at,
      deleted_at:   m.deleted_at   ?? null,
      email:        authUserMap[m.user_id]?.email        ?? null,
      display_name: authUserMap[m.user_id]?.display_name ?? null,
    }))

    return NextResponse.json(enriched)

  } catch (err) {
    console.error('[admin/members GET] Unexpected error:', err instanceof Error ? err.message : String(err))
    return NextResponse.json({ error: 'Sunucu hatası' }, { status: 500 })
  }
}

// ── POST /api/admin/members ───────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
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
    const email = (typeof body.email === 'string' ? body.email.trim().toLowerCase() : '')
    const role  = (typeof body.role  === 'string' ? body.role  : 'viewer') as MemberRole

    if (!email) {
      return NextResponse.json({ error: 'E-posta adresi zorunludur.', field: 'email' }, { status: 422 })
    }
    if (!VALID_ROLES.includes(role)) {
      return NextResponse.json({ error: 'Geçersiz rol.', field: 'role' }, { status: 422 })
    }

    // Look up the target user by email via the admin client.
    // listUsers() has no server-side email filter: we paginate until found.
    // Limit: 50 pages × 1000/page = up to 50,000 users before giving up.
    const adminAuth = getAdminAuth()
    let targetUser: { id: string; email?: string } | undefined
    let page = 1
    const PER_PAGE = 1000
    const MAX_PAGES = 50

    while (page <= MAX_PAGES) {
      const { data: listData, error: listError } = await adminAuth.listUsers({
        page,
        perPage: PER_PAGE,
      })
      if (listError) {
        console.error('[admin/members POST] listUsers error:', listError.message)
        return NextResponse.json({ error: 'Kullanıcı aranamadı.' }, { status: 500 })
      }
      const users = listData?.users ?? []
      const found = users.find(u => (u.email ?? '').toLowerCase() === email)
      if (found) { targetUser = found; break }
      // Stop early if this page was not full (no more pages)
      if (users.length < PER_PAGE) break
      page++
    }

    if (!targetUser) {
      return NextResponse.json(
        { error: `Bu e-posta adresine kayıtlı bir hesap bulunamadı: ${email}`, code: 'USER_NOT_FOUND' },
        { status: 404 },
      )
    }

    // Prevent self-invite
    if (targetUser.id === uid) {
      return NextResponse.json(
        { error: 'Kendinizi davet edemezsiniz.', code: 'SELF_INVITE' },
        { status: 422 },
      )
    }

    // Check for existing active or pending membership (unique constraint guard)
    const { data: existing } = await supabase
      .from('company_members')
      .select('id, deleted_at')
      .eq('company_id', companyId)
      .eq('user_id', targetUser.id)
      .maybeSingle()

    if (existing && !existing.deleted_at) {
      return NextResponse.json(
        { error: 'Bu kullanıcı zaten bu şirkette kayıtlı veya davet bekliyor.', code: 'ALREADY_MEMBER' },
        { status: 409 },
      )
    }

    // ── All writes to company_members use the admin (service-role) client ────
    // Rationale: company_members has RLS enabled with SELECT-only policies.
    // No INSERT/UPDATE/DELETE policy exists — direct client writes are denied
    // implicitly by RLS. The admin client bypasses RLS for these privileged
    // operations. Auth + admin role check above authorise the caller.

    // If a soft-deleted row exists, reactivate it (upsert semantics)
    if (existing && existing.deleted_at) {
      const { error: updateError } = await safeAdminQuery('company_members', companyId)
        .updateById(existing.id, {
          role:        role,
          invited_by:  uid,
          accepted_at: null,   // reset to pending — cleared on invited user's first login via DB function
          deleted_at:  null,
          created_at:  new Date().toISOString(),
        })

      if (updateError) {
        console.error('[admin/members POST] reactivate error:', updateError.message)
        return NextResponse.json({ error: 'Üye yeniden etkinleştirilemedi.' }, { status: 500 })
      }
      return NextResponse.json({ id: existing.id }, { status: 200 })
    }

    // Insert new invitation row (accepted_at = null → pending)
    const { data: inserted, error: insertError } = await safeAdminQuery('company_members', companyId)
      .insert({
        company_id:  companyId,
        user_id:     targetUser.id,
        role:        role,
        invited_by:  uid,
        accepted_at: null,   // pending until a future SECURITY DEFINER accept RPC is called
      })
      .select('id')
      .single()

    if (insertError) {
      if (insertError.code === '23505') {
        return NextResponse.json(
          { error: 'Bu kullanıcı zaten bu şirkette kayıtlı.', code: 'ALREADY_MEMBER' },
          { status: 409 },
        )
      }
      return NextResponse.json({ error: insertError.message }, { status: 500 })
    }

    return NextResponse.json({ id: inserted.id }, { status: 201 })

  } catch (err) {
    console.error('[admin/members POST] Unexpected error:', err instanceof Error ? err.message : String(err))
    return NextResponse.json({ error: 'Sunucu hatası' }, { status: 500 })
  }
}
