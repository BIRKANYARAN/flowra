// ── /dashboard/admin/users — Ekip Yönetimi (server component) ────────────────
//
// FAZ 14: Converted from 'use client' to server component.
//
// Server-rendered sections (static, no JS):
//   Zone 1 — KPI strip: total members, active, pending, role distribution
//   Zone 2 — Access-denied panel (when not admin)
//
// Client island:
//   UsersClient — invite form + role change + remove (re-fetches /api/admin/members)
//
// Self-HTTP eliminated for the initial render.
// auth.users enrichment (email + display_name) done server-side via getAdminAuth().

export const dynamic = 'force-dynamic'

import { redirect }         from 'next/navigation'
import { createClient }     from '@/lib/supabase-server'
import { resolveCompanyId } from '@/lib/resolve-company'
import { requireAdmin }     from '@/lib/require-role'
import { getAdminAuth }     from '@/lib/admin-db'
import { AppError }         from '@/types/errors'
import type { CompanyMember, MemberRole } from '@/types'
import UsersClient          from './UsersClient'

// ── Analytics helpers (pure, tested in tests/member-analytics.test.ts) ────────

function activeMembers(members: CompanyMember[]): CompanyMember[] {
  return members.filter(m => m.accepted_at !== null)
}

function pendingMembers(members: CompanyMember[]): CompanyMember[] {
  return members.filter(m => m.accepted_at === null)
}

function roleDistribution(members: CompanyMember[]): Record<MemberRole, number> {
  const counts: Record<MemberRole, number> = { admin: 0, manager: 0, viewer: 0 }
  for (const m of members) {
    if (m.accepted_at !== null) {          // only active members count
      counts[m.role] = (counts[m.role] ?? 0) + 1
    }
  }
  return counts
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function AdminUsersPage() {
  const supabase = createClient()
  let uid: string
  try {
    const { data, error } = await supabase.auth.getUser()
    if (error || !data?.user) redirect('/auth')
    uid = data.user.id
  } catch (e) {
    if (e && typeof e === 'object' && 'digest' in e) throw e
    redirect('/auth')
  }

  let companyId: string
  try { companyId = await resolveCompanyId(uid, supabase) }
  catch { redirect('/auth') }

  // ── Admin guard ────────────────────────────────────────────────────────────
  let isAdmin = true
  try { await requireAdmin(uid, companyId, supabase) }
  catch (e) {
    if (e instanceof AppError && e.code === 'FORBIDDEN') {
      isAdmin = false
    } else {
      throw e
    }
  }

  if (!isAdmin) {
    return (
      <div className="max-w-lg">
        <div className="bg-red-50 border border-red-100 rounded-xl p-6 text-center">
          <div className="text-3xl mb-3">🔒</div>
          <h2 className="font-bold text-red-700 mb-1">Yetkisiz Erişim</h2>
          <p className="text-sm text-red-600">Bu sayfaya yalnızca yöneticiler erişebilir.</p>
        </div>
      </div>
    )
  }

  // ── Fetch company members ──────────────────────────────────────────────────
  const { data: rawMembers, error: membersError } = await supabase
    .from('company_members')
    .select('id, company_id, user_id, role, invited_by, accepted_at, created_at, deleted_at')
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })

  if (membersError) {
    // Soft failure — render empty state rather than crashing
    return (
      <div className="max-w-3xl">
        <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-3 text-sm text-red-600">
          Üyeler yüklenemedi: {membersError.message}
        </div>
      </div>
    )
  }

  // ── Enrich with email + display_name from auth.users ──────────────────────
  // Replicates /api/admin/members GET logic — direct auth.admin access avoids self-HTTP.
  const adminAuth = getAdminAuth()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const userIds = (rawMembers ?? []).map((m: any) => m.user_id as string)

  const authUserMap: Record<string, { email: string | null; display_name: string | null }> = {}
  for (const userId of userIds) {
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
      }
    } catch {
      authUserMap[userId] = { email: null, display_name: null }
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const members: CompanyMember[] = (rawMembers ?? []).map((m: any) => ({
    id:           m.id,
    user_id:      m.user_id,
    role:         m.role as MemberRole,
    company_id:   m.company_id,
    invited_by:   m.invited_by   ?? null,
    accepted_at:  m.accepted_at  ?? null,
    created_at:   m.created_at,
    deleted_at:   m.deleted_at   ?? null,
    email:        authUserMap[m.user_id]?.email        ?? null,
    display_name: authUserMap[m.user_id]?.display_name ?? null,
  }))

  // ── Server-side analytics ──────────────────────────────────────────────────
  const active  = activeMembers(members)
  const pending = pendingMembers(members)
  const roleDist = roleDistribution(members)

  const ROLE_LABELS: Record<MemberRole, string> = {
    admin:   'Yönetici',
    manager: 'Satış Temsilcisi',
    viewer:  'İzleyici',
  }

  return (
    <div className="max-w-3xl space-y-6">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-xl font-black text-gray-900 tracking-tight">Ekip Yönetimi</h1>
        <p className="text-xs text-gray-400 mt-0.5">
          Şirket üyeleri ve davet yönetimi
        </p>
      </div>

      {/* ── Zone 1: KPI Strip ────────────────────────────────────────────── */}
      {members.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-0 bg-white border border-gray-200 rounded-xl overflow-hidden">
          {[
            {
              label: 'Aktif Üye',
              value: String(active.length),
              sub:   active.length === 1 ? '1 kişi' : `${active.length} kişi`,
              color: active.length > 0 ? 'text-gray-900' : 'text-gray-400',
            },
            {
              label: 'Bekleyen Davet',
              value: pending.length > 0 ? String(pending.length) : '—',
              sub:   pending.length > 0 ? 'onay bekliyor' : 'davet yok',
              color: pending.length > 0 ? 'text-amber-600' : 'text-gray-400',
            },
            {
              label: 'Yönetici',
              value: roleDist.admin > 0 ? String(roleDist.admin) : '—',
              sub:   'tam yetki',
              color: roleDist.admin > 0 ? 'text-primary-700' : 'text-gray-400',
            },
            {
              label: 'Temsilci / İzleyici',
              value: (roleDist.manager + roleDist.viewer) > 0
                ? String(roleDist.manager + roleDist.viewer)
                : '—',
              sub:   `${roleDist.manager} temsilci · ${roleDist.viewer} izleyici`,
              color: 'text-gray-700',
            },
          ].map((card, i) => (
            <div key={card.label}
              className={`p-3 ${i < 3 ? 'border-b sm:border-b-0 sm:border-r border-gray-100' : ''}`}>
              <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">{card.label}</div>
              <div className={`text-xl font-black tabular-nums leading-none ${card.color}`}>{card.value}</div>
              <div className="text-[10px] text-gray-400 mt-1">{card.sub}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── Role distribution bar (server-rendered) ───────────────────────── */}
      {active.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">
            Rol Dağılımı
          </div>
          <div className="space-y-2">
            {(['admin', 'manager', 'viewer'] as MemberRole[]).map(role => {
              const count = roleDist[role]
              const pct   = active.length > 0 ? Math.round((count / active.length) * 100) : 0
              const colors = {
                admin:   { bar: 'bg-primary-400', text: 'text-primary-700' },
                manager: { bar: 'bg-blue-400',    text: 'text-blue-700'    },
                viewer:  { bar: 'bg-gray-300',    text: 'text-gray-600'    },
              }
              return (
                <div key={role}>
                  <div className="flex justify-between items-center mb-0.5">
                    <span className="text-xs text-gray-600">{ROLE_LABELS[role]}</span>
                    <span className={`text-xs font-semibold tabular-nums ${colors[role].text}`}>{count}</span>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${colors[role].bar} rounded-full transition-all`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Client island: invite + role change + remove ──────────────────── */}
      <UsersClient initialMembers={members} />

    </div>
  )
}
