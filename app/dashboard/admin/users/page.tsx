'use client'

// ─────────────────────────────────────────────────────────────────────────────
// /dashboard/admin/users — Company member management (admin only)
//
// Features:
//   • List all company members with status (active / pending invite)
//   • Invite an existing user by email
//   • Change a member's role (admin / manager / viewer)
//   • Remove a member from the company
//
// Access: admin role only. Non-admins see a 403 message after the API returns.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback, type ChangeEvent } from 'react'
import Link from 'next/link'
import type { CompanyMember, MemberRole } from '@/types'

// ── Style tokens ──────────────────────────────────────────────────────────────
const IL  = 'w-full border border-[#e8eaef] rounded px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand bg-white transition-colors'
const LAB = 'block text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8] mb-1.5'
const SEL = `${IL} cursor-pointer`

// ── Role labels ───────────────────────────────────────────────────────────────
const ROLE_LABELS: Record<MemberRole, string> = {
  admin:   'Yönetici',
  manager: 'Satış Temsilcisi',
  viewer:  'İzleyici',
}

const ROLE_COLORS: Record<MemberRole, string> = {
  admin:   'bg-brand-subtle text-brand',
  manager: 'bg-info-light text-info-text',
  viewer:  'bg-[#f1f5f9] text-[#64748b]',
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function AdminUsersPage() {
  const [members,    setMembers]    = useState<CompanyMember[]>([])
  const [loading,    setLoading]    = useState(true)
  const [forbidden,  setForbidden]  = useState(false)
  const [error,      setError]      = useState('')

  // Invite form state
  const [showInvite, setShowInvite] = useState(false)
  const [invEmail,   setInvEmail]   = useState('')
  const [invRole,    setInvRole]    = useState<MemberRole>('viewer')
  const [invSaving,  setInvSaving]  = useState(false)
  const [invError,   setInvError]   = useState('')
  const [invSuccess, setInvSuccess] = useState('')

  // Inline role-edit state
  const [editingId,   setEditingId]   = useState<string | null>(null)
  const [editingRole, setEditingRole] = useState<MemberRole>('viewer')
  const [roleSaving,  setRoleSaving]  = useState(false)
  const [roleError,   setRoleError]   = useState('')

  // Remove-member inline error
  const [removeError, setRemoveError] = useState('')

  // ── Fetch members ──────────────────────────────────────────────────────────

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true)
    setError('')
    const res = await fetch('/api/admin/members', { signal })
    if (res.status === 403) { setForbidden(true); setLoading(false); return }
    if (!res.ok) { setError('Üyeler yüklenemedi.'); setLoading(false); return }
    const data = await res.json()
    setMembers(Array.isArray(data) ? data : [])
    setLoading(false)
  }, [])

  useEffect(() => {
    const ctrl = new AbortController()
    load(ctrl.signal).catch(err => { if (err.name !== 'AbortError') setError('Üyeler yüklenemedi.') })
    return () => ctrl.abort()
  }, [load])

  // ── Invite submit ──────────────────────────────────────────────────────────

  async function submitInvite() {
    if (!invEmail.trim()) { setInvError('E-posta adresi zorunludur.'); return }
    setInvSaving(true); setInvError(''); setInvSuccess('')

    const res = await fetch('/api/admin/members', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: invEmail.trim(), role: invRole }),
    })
    const json = await res.json()

    if (!res.ok) {
      setInvError(json.error ?? 'Davet gönderilemedi.')
      setInvSaving(false)
      return
    }

    setInvSuccess(`${invEmail} başarıyla davet edildi.`)
    setInvEmail('')
    setInvRole('viewer')
    setInvSaving(false)
    load()
  }

  // ── Role change ────────────────────────────────────────────────────────────

  function startEditRole(m: CompanyMember) {
    setEditingId(m.id)
    setEditingRole(m.role)
  }

  async function saveRole(memberId: string) {
    setRoleSaving(true)
    setRoleError('')
    const res = await fetch(`/api/admin/members/${memberId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: editingRole }),
    })
    if (!res.ok) {
      const json = await res.json()
      setRoleError(json.error ?? 'Rol güncellenemedi.')
      setRoleSaving(false)
      return
    }
    setEditingId(null)
    setRoleSaving(false)
    load()
  }

  // ── Remove member ──────────────────────────────────────────────────────────

  async function removeMember(m: CompanyMember) {
    const label = m.display_name || m.email || m.user_id
    if (!confirm(`${label} adlı kullanıcıyı şirketten çıkarmak istediğinizden emin misiniz?`)) return

    setRemoveError('')
    const res = await fetch(`/api/admin/members/${m.id}`, { method: 'DELETE' })
    if (!res.ok) {
      const json = await res.json()
      setRemoveError(json.error ?? 'Üye çıkarılamadı.')
      return
    }
    load()
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40">
        <div className="w-6 h-6 border-2 border-brand border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (forbidden) {
    return (
      <div className="max-w-lg">
        <div className="bg-neg-light border border-neg-light rounded p-6 text-center">
          <div className="text-3xl mb-3">🔒</div>
          <h2 className="font-bold text-neg-text mb-1">Yetkisiz Erişim</h2>
          <p className="text-sm text-neg">Bu sayfaya yalnızca yöneticiler erişebilir.</p>
        </div>
      </div>
    )
  }

  const activeMembers  = members.filter(m => m.accepted_at !== null)
  const pendingMembers = members.filter(m => m.accepted_at === null)

  return (
    <div className="max-w-3xl">
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link href="/dashboard/admin" className="text-xs text-[#94a3b8] hover:text-[#64748b]">← Yönetim</Link>
          <h1 className="text-2xl font-black tracking-tight text-[#0f172a] mt-1">Ekip Yönetimi</h1>
          <p className="text-sm text-[#64748b] mt-0.5">
            {activeMembers.length} aktif üye
            {pendingMembers.length > 0 ? `, ${pendingMembers.length} bekleyen davet` : ''}
          </p>
        </div>
        {!showInvite && (
          <button
            onClick={() => { setShowInvite(true); setInvError(''); setInvSuccess('') }}
            className="bg-brand-light text-white px-4 py-2.5 rounded text-sm font-semibold hover:bg-brand transition-colors"
          >
            + Kullanıcı Davet Et
          </button>
        )}
      </div>

      {/* Global error */}
      {error && (
        <div className="bg-neg-light border border-neg-light rounded px-4 py-3 text-sm text-neg mb-5">
          {error}
        </div>
      )}

      {/* Role-save error */}
      {roleError && (
        <div className="bg-neg-light border border-neg-light rounded px-4 py-3 text-sm text-neg mb-5 flex items-center justify-between">
          <span>{roleError}</span>
          <button onClick={() => setRoleError('')} className="ml-3 text-neg hover:text-neg font-bold text-base leading-none">×</button>
        </div>
      )}

      {/* Remove-member error */}
      {removeError && (
        <div className="bg-neg-light border border-neg-light rounded px-4 py-3 text-sm text-neg mb-5 flex items-center justify-between">
          <span>{removeError}</span>
          <button onClick={() => setRemoveError('')} className="ml-3 text-neg hover:text-neg font-bold text-base leading-none">×</button>
        </div>
      )}

      {/* Invite form */}
      {showInvite && (
        <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft p-6 shadow-sm mb-5 space-y-4">
          <h3 className="font-bold text-sm border-b border-[#e8eaef] pb-3">Kullanıcı Davet Et</h3>
          <p className="text-xs text-[#64748b]">
            Davet edilecek kullanıcının Flowra hesabı olması gerekir.
            Henüz hesabı yoksa önce kayıt olmaları gerekir.
          </p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={LAB}>E-posta *</label>
              <input
                type="email"
                className={IL}
                placeholder="kullanici@ornek.com"
                value={invEmail}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setInvEmail(e.target.value)}
                autoFocus
              />
            </div>
            <div>
              <label className={LAB}>Rol</label>
              <select
                className={SEL}
                value={invRole}
                onChange={(e: ChangeEvent<HTMLSelectElement>) => setInvRole(e.target.value as MemberRole)}
              >
                <option value="viewer">İzleyici</option>
                <option value="manager">Satış Temsilcisi</option>
                <option value="admin">Yönetici</option>
              </select>
            </div>
          </div>

          <div className="bg-[#f8fafc] rounded p-3 text-xs text-[#64748b] space-y-1">
            <div><span className="font-semibold">İzleyici:</span> Tüm kayıtları okuyabilir, oluşturamaz veya düzenleyemez.</div>
            <div><span className="font-semibold">Satış Temsilcisi:</span> Kendi oluşturduğu müşterileri ve satışları yönetir.</div>
            <div><span className="font-semibold">Yönetici:</span> Tüm kayıtlara tam erişim ve ekip yönetimi.</div>
          </div>

          {invError   && <div className="text-sm text-neg bg-neg-light border border-neg-light rounded px-3 py-2">{invError}</div>}
          {invSuccess && <div className="text-sm text-pos-text bg-pos-light border border-green-100 rounded px-3 py-2">{invSuccess}</div>}

          <div className="flex gap-2">
            <button
              onClick={submitInvite}
              disabled={invSaving || !invEmail.trim()}
              className="bg-brand-light text-white px-5 py-2.5 rounded text-sm font-semibold hover:bg-brand disabled:opacity-40 transition-colors"
            >
              {invSaving ? 'Gönderiliyor...' : 'Davet Gönder'}
            </button>
            <button
              onClick={() => { setShowInvite(false); setInvEmail(''); setInvError(''); setInvSuccess('') }}
              className="border border-[#e8eaef] px-5 py-2.5 rounded text-sm font-medium hover:bg-[#f8fafc]/60 transition-colors"
            >
              İptal
            </button>
          </div>
        </div>
      )}

      {/* Active members */}
      <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft overflow-hidden mb-5">
        <div className="px-5 py-3 border-b border-[#e8eaef]">
          <span className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8]">Aktif Üyeler</span>
        </div>
        {activeMembers.length === 0 ? (
          <div className="text-center py-10 text-[#94a3b8] text-sm">Aktif üye bulunamadı.</div>
        ) : (
          <div className="divide-y divide-[#f1f5f9]">
            {activeMembers.map(m => (
              <div key={m.id} className="flex items-center justify-between px-5 py-4 hover:bg-[#f8fafc]/60 transition-colors">
                {/* User info */}
                <div className="min-w-0 flex-1 mr-4">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded bg-brand-subtle flex items-center justify-center flex-shrink-0">
                      <span className="text-brand font-bold text-xs">
                        {(m.display_name || m.email || '?').slice(0, 2).toUpperCase()}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold truncate">{m.display_name || m.email || m.user_id}</div>
                      {m.display_name && m.email && (
                        <div className="text-xs text-[#94a3b8] truncate">{m.email}</div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Role / edit */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  {editingId === m.id ? (
                    <>
                      <select
                        className="border border-[#e8eaef] rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-brand/30"
                        value={editingRole}
                        onChange={(e: ChangeEvent<HTMLSelectElement>) => setEditingRole(e.target.value as MemberRole)}
                        autoFocus
                      >
                        <option value="viewer">İzleyici</option>
                        <option value="manager">Satış Temsilcisi</option>
                        <option value="admin">Yönetici</option>
                      </select>
                      <button
                        onClick={() => saveRole(m.id)}
                        disabled={roleSaving}
                        className="text-xs text-brand-light font-semibold hover:text-brand disabled:opacity-40 px-2 py-1 rounded hover:bg-brand-subtle transition-colors"
                      >
                        {roleSaving ? '...' : 'Kaydet'}
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="text-xs text-[#94a3b8] px-2 py-1 rounded hover:bg-[#f1f5f9] transition-colors"
                      >
                        İptal
                      </button>
                    </>
                  ) : (
                    <>
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded ${ROLE_COLORS[m.role]}`}>
                        {ROLE_LABELS[m.role]}
                      </span>
                      <button
                        onClick={() => startEditRole(m)}
                        className="text-xs text-[#94a3b8] hover:text-[#334155] px-2 py-1 rounded hover:bg-[#f1f5f9] transition-colors"
                      >
                        Rol Değiştir
                      </button>
                      <button
                        onClick={() => removeMember(m)}
                        className="text-xs text-[#94a3b8] hover:text-neg px-2 py-1 rounded hover:bg-neg-light transition-colors"
                      >
                        Çıkar
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Pending invitations */}
      {pendingMembers.length > 0 && (
        <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft overflow-hidden shadow-sm">
          <div className="px-5 py-3 border-b border-[#e8eaef]">
            <span className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8]">Bekleyen Davetler</span>
          </div>
          <div className="divide-y divide-[#f1f5f9]">
            {pendingMembers.map(m => (
              <div key={m.id} className="flex items-center justify-between px-5 py-4 hover:bg-[#f8fafc]/60 transition-colors">
                <div className="min-w-0 flex-1 mr-4">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded bg-warn-light flex items-center justify-center flex-shrink-0">
                      <span className="text-warn-text font-bold text-xs">?</span>
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold truncate text-[#64748b]">
                        {m.email || m.user_id}
                      </div>
                      <div className="text-xs text-warn-text">Davet bekleniyor</div>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded ${ROLE_COLORS[m.role]}`}>
                    {ROLE_LABELS[m.role]}
                  </span>
                  <button
                    onClick={() => removeMember(m)}
                    className="text-xs text-[#94a3b8] hover:text-neg px-2 py-1 rounded hover:bg-neg-light transition-colors"
                  >
                    İptal
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Cross-navigation */}
      <div className="flex items-center justify-between px-1">
        <p className="text-[10px] text-[#94a3b8] leading-relaxed">
          Kullanıcı ve rol yönetimi yönetişim sistemiyle birlikte çalışır.
        </p>
        <div className="flex items-center gap-2 shrink-0 ml-4">
          <Link href="/dashboard/admin/audit" className="text-[11px] font-bold text-brand-light hover:text-brand underline underline-offset-2 whitespace-nowrap">
            Denetim İzi →
          </Link>
          <span className="text-[#e2e8f0]">|</span>
          <Link href="/dashboard/admin/governance" className="text-[11px] font-bold text-brand-light hover:text-brand underline underline-offset-2 whitespace-nowrap">
            Yönetişim →
          </Link>
        </div>
      </div>
    </div>
  )
}
