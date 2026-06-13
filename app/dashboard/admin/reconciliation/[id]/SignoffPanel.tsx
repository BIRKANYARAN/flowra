'use client'

// ═══════════════════════════════════════════════════════════════════════════════
// SignoffPanel.tsx — Client component for signoff workflow
// ═══════════════════════════════════════════════════════════════════════════════

import { useState } from 'react'

interface Signoff {
  partner_name:  string
  ownership_pct: number
  status:        'pending' | 'approved' | 'rejected'
  signed_at:     string | null
  comments:      string | null
}

interface SignoffPanelProps {
  snapshotId:   string
  signoffs:     Signoff[]
  isImmutable:  boolean
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString('tr-TR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  } catch { return iso }
}

function statusLabel(s: Signoff['status']): { text: string; cls: string } {
  if (s === 'approved') return { text: 'Onaylandı',  cls: 'bg-green-50 text-green-700 border border-green-200' }
  if (s === 'rejected') return { text: 'Reddedildi', cls: 'bg-red-50 text-red-700 border border-red-200'       }
  return                        { text: 'Bekliyor',   cls: 'bg-amber-50 text-amber-700 border border-amber-200' }
}

export default function SignoffPanel({ snapshotId, signoffs: initial, isImmutable }: SignoffPanelProps) {
  const [signoffs, setSignoffs] = useState<Signoff[]>(initial)
  const [loading, setLoading]   = useState<string | null>(null)  // which partner is loading
  const [error, setError]       = useState<string | null>(null)

  async function submitSignoff(partnerName: string, status: 'approved' | 'rejected') {
    setError(null)
    setLoading(partnerName)
    try {
      const res = await fetch(`/api/reconciliation/snapshots/${snapshotId}/signoff`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ status }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json.error ?? `Hata: ${res.status}`)
      }
      // Optimistically update
      setSignoffs(prev => prev.map(s =>
        s.partner_name === partnerName
          ? { ...s, status, signed_at: new Date().toISOString() }
          : s,
      ))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'İmza kaydedilemedi.')
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="px-4 py-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
          {error}
        </div>
      )}
      {signoffs.map(s => {
        const { text, cls } = statusLabel(s.status)
        const isLoading = loading === s.partner_name
        return (
          <div
            key={s.partner_name}
            className="flex items-center justify-between px-4 py-3 bg-white border border-[#e8eaef] rounded-xl shadow-soft"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-[#f1f5f9] flex items-center justify-center flex-shrink-0">
                <span className="text-xs font-bold text-[#334155]">
                  {s.partner_name.slice(0, 2).toUpperCase()}
                </span>
              </div>
              <div>
                <p className="text-sm font-semibold text-[#0f172a]">{s.partner_name}</p>
                <p className="text-[11px] text-[#94a3b8]">
                  %{s.ownership_pct.toFixed(2)} hisse
                  {s.signed_at && ` · ${fmtDate(s.signed_at)}`}
                </p>
                {s.comments && (
                  <p className="text-xs text-[#64748b] mt-0.5 italic">{s.comments}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold ${cls}`}>
                {text}
              </span>
              {s.status === 'pending' && !isImmutable && (
                <>
                  <button
                    onClick={() => submitSignoff(s.partner_name, 'approved')}
                    disabled={isLoading}
                    className="px-3 py-1 bg-green-600 text-white text-xs font-semibold rounded hover:bg-green-700 disabled:opacity-50 transition-colors"
                  >
                    {isLoading ? '…' : 'Onayla'}
                  </button>
                  <button
                    onClick={() => submitSignoff(s.partner_name, 'rejected')}
                    disabled={isLoading}
                    className="px-3 py-1 bg-red-600 text-white text-xs font-semibold rounded hover:bg-red-700 disabled:opacity-50 transition-colors"
                  >
                    {isLoading ? '…' : 'Reddet'}
                  </button>
                </>
              )}
            </div>
          </div>
        )
      })}
      {signoffs.length === 0 && (
        <p className="text-sm text-[#94a3b8] text-center py-4">Henüz imza kaydı yok.</p>
      )}
    </div>
  )
}
