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
import type { CompanyMember, MemberRole } from '@/types'

// ── Style tokens ──────────────────────────────────────────────────────────────
const IL  = 'w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-primary-400 bg-white transition-colors'
const LAB = 'block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5'
const SEL = `${IL} cursor-pointer`

// ── Role labels ───────────────────────────────────────────────────────────────
const ROLE_LABELS: Record<MemberRole, string> = {
  admin:   'Yönetici',
  manager: 'Satış Temsilcisi',
  viewer:  'İzleyici',
}

const ROLE_COLORS: Record<MemberRole, string> = {
  admin:   'bg-primary-100 text-primary-700',
  manager: 'bg-blue-100 text-blue-700',
  viewer:  'bg-gray-100 text-gray-600',
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
        <div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (forbidden) {
    return (
      <div className="max-w-lg">
        <div className="bg-red-50 border border-red-100 rounded-2xl p-6 text-center">
          <div className="text-3xl mb-3">🔒</div>
          <h2 className="font-bold text-red-700 mb-1">Yetkisiz Erişim</h2>
          <p className="text-sm text-red-600">Bu sayfaya yalnızca yöneticiler erişebilir.</p>
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
          <h1 className="text-2xl font-black">Ekip Yönetimi</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {activeMembers.length} aktif üye
            {pendingMembers.length > 0 ? `, ${pendingMembers.length} bekleyen davet` : ''}
          </p>
        </div>
        {!showInvite && (
          <button
            onClick={() => { setShowInvite(true); setInvError(''); setInvSuccess('') }}
            className="bg-primary-600 text-white px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-primary-700 transition-colors"
          >
            + Kullanıcı Davet Et
          </button>
        )}
      </div>

      {/* Global error */}
      {error && (
        <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-3 text-sm text-red-600 mb-5">
          {error}
        </div>
      )}

      {/* Role-save error */}
      {roleError && (
        <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-3 text-sm text-red-600 mb-5 flex items-center justify-between">
          <span>{roleError}</span>
          <button onClick={() => setRoleError('')} className="ml-3 text-red-400 hover:text-red-600 font-bold text-base leading-none">×</button>
        </div>
      )}

      {/* Remove-member error */}
      {removeError && (
        <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-3 text-sm text-red-600 mb-5 flex items-center justify-between">
          <span>{removeError}</span>
          <button onClick={() => setRemoveError('')} className="ml-3 text-red-400 hover:text-red-600 font-bold text-base leading-none">×</button>
        </div>
      )}

      {/* Invite form */}
      {showInvite && (
        <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-[0_1px_2px_rgba(17,24,39,0.04)] mb-5 space-y-4">
          <h3 className="font-bold text-sm border-b border-gray-100 pb-3">Kullanıcı Davet Et</h3>
          <p className="text-xs text-gray-500">
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

          <div className="bg-gray-50 rounded-xl p-3 text-xs text-gray-500 space-y-1">
            <div><span className="font-semibold">İzleyici:</span> Tüm kayıtları okuyabilir, oluşturamaz veya düzenleyemez.</div>
            <div><span className="font-semibold">Satış Temsilcisi:</span> Kendi oluşturduğu müşterileri ve satışları yönetir.</div>
            <div><span className="font-semibold">Yönetici:</span> Tüm kayıtlara tam erişim ve ekip yönetimi.</div>
          </div>

          {invError   && <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">{invError}</div>}
          {invSuccess && <div className="text-sm text-green-700 bg-green-50 border border-green-100 rounded-xl px-3 py-2">{invSuccess}</div>}

          <div className="flex gap-2">
            <button
              onClick={submitInvite}
              disabled={invSaving || !invEmail.trim()}
              className="bg-primary-600 text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-primary-700 disabled:opacity-40 transition-colors"
            >
              {invSaving ? 'Gönderiliyor...' : 'Davet Gönder'}
            </button>
            <button
              onClick={() => { setShowInvite(false); setInvEmail(''); setInvError(''); setInvSuccess('') }}
              className="border border-gray-200 px-5 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-50/60 transition-colors"
            >
              İptal
            </button>
          </div>
        </div>
      )}

      {/* Active members */}
      <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden mb-5">
        <div className="px-5 py-3 border-b border-gray-100">
          <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Aktif Üyeler</span>
        </div>
        {activeMembers.length === 0 ? (
          <div className="text-center py-10 text-gray-400 text-sm">Aktif üye bulunamadı.</div>
        ) : (
          <div className="divide-y divide-gray-50">
            {activeMembers.map(m => (
              <div key={m.id} className="flex items-center justify-between px-5 py-4 hover:bg-gray-50/60 transition-colors">
                {/* User info */}
                <div className="min-w-0 flex-1 mr-4">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-primary-100 flex items-center justify-center flex-shrink-0">
                      <span className="text-primary-700 font-bold text-xs">
                        {(m.display_name || m.email || '?').slice(0, 2).toUpperCase()}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold truncate">{m.display_name || m.email || m.user_id}</div>
                      {m.display_name && m.email && (
                        <div className="text-xs text-gray-400 truncate">{m.email}</div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Role / edit */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  {editingId === m.id ? (
                    <>
                      <select
                        className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary-400"
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
                        className="text-xs text-primary-600 font-semibold hover:text-primary-800 disabled:opacity-40 px-2 py-1 rounded-lg hover:bg-primary-50 transition-colors"
                      >
                        {roleSaving ? '...' : 'Kaydet'}
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="text-xs text-gray-400 px-2 py-1 rounded-lg hover:bg-gray-100 transition-colors"
                      >
                        İptal
                      </button>
                    </>
                  ) : (
                    <>
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${ROLE_COLORS[m.role]}`}>
                        {ROLE_LABELS[m.role]}
                      </span>
                      <button
                        onClick={() => startEditRole(m)}
                        className="text-xs text-gray-400 hover:text-gray-700 px-2 py-1 rounded-lg hover:bg-gray-100 transition-colors"
                      >
                        Rol Değiştir
                      </button>
                      <button
                        onClick={() => removeMember(m)}
                        className="text-xs text-gray-400 hover:text-red-500 px-2 py-1 rounded-lg hover:bg-red-50 transition-colors"
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
        <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-[0_1px_2px_rgba(17,24,39,0.04)]">
          <div className="px-5 py-3 border-b border-gray-100">
            <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Bekleyen Davetler</span>
          </div>
          <div className="divide-y divide-gray-50">
            {pendingMembers.map(m => (
              <div key={m.id} className="flex items-center justify-between px-5 py-4 hover:bg-gray-50/60 transition-colors">
                <div className="min-w-0 flex-1 mr-4">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center flex-shrink-0">
                      <span className="text-amber-600 font-bold text-xs">?</span>
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold truncate text-gray-500">
                        {m.email || m.user_id}
                      </div>
                      <div className="text-xs text-amber-600">Davet bekleniyor</div>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${ROLE_COLORS[m.role]}`}>
                    {ROLE_LABELS[m.role]}
                  </span>
                  <button
                    onClick={() => removeMember(m)}
                    className="text-xs text-gray-400 hover:text-red-500 px-2 py-1 rounded-lg hover:bg-red-50 transition-colors"
                  >
                    İptal
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
