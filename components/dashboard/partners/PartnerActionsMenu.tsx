'use client'

// ─────────────────────────────────────────────────────────────────────────────
// PartnerActionsMenu — client island for per-partner mutations.
//
// Renders: Edit (inline form) + Delete (confirmation) buttons.
// On success: calls router.refresh() to reload server component data.
// ─────────────────────────────────────────────────────────────────────────────

import { useState }       from 'react'
import { useRouter }      from 'next/navigation'

interface Props {
  partnerId:    string
  partnerName:  string
  shareRatioPct: number   // 0–100
}

const IL  = 'w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400'

export function PartnerActionsMenu({ partnerId, partnerName, shareRatioPct }: Props) {
  const router = useRouter()

  // Edit state
  const [editing,  setEditing]  = useState(false)
  const [name,     setName]     = useState(partnerName)
  const [ratio,    setRatio]    = useState(String(shareRatioPct))
  const [saving,   setSaving]   = useState(false)
  const [editErr,  setEditErr]  = useState<string | null>(null)

  // Delete state
  const [confirmDel, setConfirmDel] = useState(false)
  const [deleting,   setDeleting]   = useState(false)
  const [delErr,     setDelErr]     = useState<string | null>(null)

  async function saveEdit() {
    const trimName = name.trim()
    const ratePct  = parseFloat(ratio)
    if (!trimName) { setEditErr('İsim zorunludur.'); return }
    if (!Number.isFinite(ratePct) || ratePct <= 0 || ratePct > 100) {
      setEditErr('Pay oranı 1–100 arasında olmalı.'); return
    }
    setSaving(true); setEditErr(null)
    try {
      const res = await fetch(`/api/partners/${partnerId}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ name: trimName, share_ratio: ratePct / 100 }),
      })
      const data = await res.json()
      if (!res.ok) { setEditErr(data.error ?? 'Güncelleme hatası'); setSaving(false); return }
      setEditing(false)
      router.refresh()
    } catch {
      setEditErr('Ağ hatası. Lütfen tekrar deneyin.')
      setSaving(false)
    }
  }

  async function deletePartner() {
    setDeleting(true); setDelErr(null)
    try {
      const res = await fetch(`/api/partners/${partnerId}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json()
        setDelErr(data.error ?? 'Silme hatası')
        setDeleting(false); return
      }
      router.refresh()
    } catch {
      setDelErr('Ağ hatası. Lütfen tekrar deneyin.')
      setDeleting(false)
    }
  }

  if (editing) {
    return (
      <div className="mt-3 pt-3 border-t border-gray-100 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">İsim</label>
            <input className={IL} value={name} onChange={e => setName(e.target.value)} autoFocus />
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Pay Oranı (%)</label>
            <input type="number" min="0.01" max="100" step="0.01" className={IL}
              value={ratio} onChange={e => setRatio(e.target.value)} />
          </div>
        </div>
        {editErr && <p className="text-xs text-red-600">{editErr}</p>}
        <div className="flex gap-2">
          <button onClick={saveEdit} disabled={saving}
            className="text-xs font-bold px-3 py-1.5 rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50 transition-colors">
            {saving ? 'Kaydediliyor...' : 'Kaydet'}
          </button>
          <button onClick={() => { setEditing(false); setEditErr(null) }}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors">
            İptal
          </button>
        </div>
      </div>
    )
  }

  if (confirmDel) {
    return (
      <div className="mt-3 pt-3 border-t border-gray-100 space-y-2">
        <p className="text-xs text-red-600 font-semibold">
          <strong>{partnerName}</strong> silinecek. Bu işlem geri alınamaz.
        </p>
        {delErr && <p className="text-xs text-red-500">{delErr}</p>}
        <div className="flex gap-2">
          <button onClick={deletePartner} disabled={deleting}
            className="text-xs font-bold px-3 py-1.5 rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 transition-colors">
            {deleting ? 'Siliniyor...' : 'Evet, Sil'}
          </button>
          <button onClick={() => { setConfirmDel(false); setDelErr(null) }}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors">
            İptal
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="mt-2 pt-2 border-t border-gray-50 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
      <button onClick={() => { setEditing(true); setName(partnerName); setRatio(String(shareRatioPct)) }}
        className="text-xs text-gray-400 hover:text-primary-600 px-2 py-1 rounded-lg hover:bg-primary-50 transition-colors">
        Düzenle
      </button>
      <button onClick={() => setConfirmDel(true)}
        className="text-xs text-gray-400 hover:text-red-600 px-2 py-1 rounded-lg hover:bg-red-50 transition-colors">
        Sil
      </button>
    </div>
  )
}
