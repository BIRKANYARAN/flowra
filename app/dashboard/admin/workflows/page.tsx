'use client'

// /dashboard/admin/workflows — Pending Workflow Approvals
// Lists pending expense approvals (and future workflow types).
// Admin-only page.

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { fmtDate as fmt } from '@/lib/format'

interface WorkflowInstance {
  id:            string
  workflow_type: string
  status:        string
  initiator_id:  string
  initiated_at:  string
  expires_at:    string | null
  payload:       Record<string, unknown>
  resource_type: string | null
  resource_id:   string | null
  notes:         string | null
}

const TYPE_LABELS: Record<string, string> = {
  expense_approval:     'Masraf Onayı',
  partner_loan:         'Ortak Borç',
  dividend_declaration: 'Temettü Beyanı',
  period_close:         'Dönem Kapanış',
}

function fmtMoney(n: unknown) {
  const v = Number(n ?? 0)
  if (isNaN(v)) return '—'
  return '₺' + Math.round(v).toLocaleString('tr-TR')
}

function Skeleton() { return <div className="bg-gray-100 rounded-xl h-20 animate-pulse" /> }

export default function WorkflowsPage() {
  const [workflows, setWorkflows] = useState<WorkflowInstance[]>([])
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState<string | null>(null)
  const [working,   setWorking]   = useState<string | null>(null)
  const [notes,     setNotes]     = useState<Record<string, string>>({})
  const [feedback,  setFeedback]  = useState<Record<string, { ok: boolean; msg: string }>>({})

  const load = useCallback(() => {
    setLoading(true)
    fetch('/api/workflow')
      .then(r => r.json())
      .then(d => setWorkflows(d.workflows ?? []))
      .catch(() => setError('Onay bekleyen işlemler yüklenemedi'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  async function resolve(id: string, action: 'approve' | 'reject') {
    setWorking(id)
    setFeedback(f => ({ ...f, [id]: { ok: true, msg: '' } }))
    try {
      const res  = await fetch(`/api/workflow/${id}/resolve`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ action, notes: notes[id] ?? '' }),
      })
      const data = await res.json()
      if (!res.ok) {
        setFeedback(f => ({ ...f, [id]: { ok: false, msg: data.error ?? 'Hata oluştu' } }))
      } else {
        setFeedback(f => ({ ...f, [id]: { ok: true, msg: action === 'approve' ? '✓ Onaylandı' : '✕ Reddedildi' } }))
        setTimeout(() => setWorkflows(prev => prev.filter(w => w.id !== id)), 1500)
      }
    } catch {
      setFeedback(f => ({ ...f, [id]: { ok: false, msg: 'Ağ hatası' } }))
    }
    setWorking(null)
  }

  return (
    <div className="max-w-3xl space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black text-gray-900 tracking-tight">Onay Bekleyen İşlemler</h1>
          <p className="text-xs text-gray-400 mt-0.5">
            {loading ? 'Yükleniyor…' : `${workflows.length} işlem onay bekliyor`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="text-xs text-gray-400 hover:text-primary-600 font-semibold">
            ↺ Yenile
          </button>
          <Link href="/dashboard/admin" className="text-xs text-gray-400 hover:text-primary-600 font-semibold">
            ← Yönetim
          </Link>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {loading && (
        <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} />)}</div>
      )}

      {!loading && workflows.length === 0 && !error && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-12 text-center">
          <div className="text-2xl mb-2">✓</div>
          <div className="text-sm font-semibold text-gray-500">Onay bekleyen işlem yok</div>
          <div className="text-xs text-gray-400 mt-1">Tüm işlemler onaylandı veya henüz onay gerektiren işlem oluşturulmadı.</div>
        </div>
      )}

      <div className="space-y-3">
        {workflows.map(w => {
          const fb      = feedback[w.id]
          const isWork  = working === w.id
          const payload = w.payload ?? {}

          return (
            <div key={w.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              {/* Main row */}
              <div className="px-5 py-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    {/* Type badge */}
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-[10px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">
                        {TYPE_LABELS[w.workflow_type] ?? w.workflow_type}
                      </span>
                      {w.expires_at && (
                        <span className="text-[10px] text-gray-400">
                          Son: {fmt(w.expires_at)}
                        </span>
                      )}
                    </div>

                    {/* Expense details */}
                    {w.workflow_type === 'expense_approval' && (
                      <div className="space-y-0.5">
                        <div className="text-sm font-bold text-gray-900">
                          {fmtMoney(payload.amount_try)}
                          <span className="text-xs font-normal text-gray-400 ml-1.5">
                            ({String(payload.currency ?? 'TRY')} {Number(payload.amount ?? 0).toLocaleString('tr-TR')} @ kur)
                          </span>
                        </div>
                        <div className="text-xs text-gray-500 truncate">
                          {String(payload.description ?? '—')}
                        </div>
                        <div className="flex gap-3 text-[10px] text-gray-400 mt-1">
                          <span>Kategori: {String(payload.category ?? '—')}</span>
                          <span>Tarih: {String(payload.expense_date ?? '—')}</span>
                          <span>Eşik: {fmtMoney(payload.threshold)}</span>
                        </div>
                      </div>
                    )}

                    {/* Generic payload for other types */}
                    {w.workflow_type !== 'expense_approval' && (
                      <div className="text-xs text-gray-500">
                        {JSON.stringify(payload).slice(0, 120)}…
                      </div>
                    )}

                    <div className="text-[10px] text-gray-400 mt-1.5">
                      Başlatıldı: {fmt(w.initiated_at)}
                    </div>
                  </div>
                </div>

                {/* Notes */}
                <div className="mt-3">
                  <input
                    type="text"
                    placeholder="Not (opsiyonel)…"
                    value={notes[w.id] ?? ''}
                    onChange={e => setNotes(n => ({ ...n, [w.id]: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary-400 bg-gray-50"
                  />
                </div>

                {/* Actions */}
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() => resolve(w.id, 'approve')}
                    disabled={isWork}
                    className="flex-1 text-xs font-bold py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                  >
                    {isWork ? '…' : '✓ Onayla'}
                  </button>
                  <button
                    onClick={() => resolve(w.id, 'reject')}
                    disabled={isWork}
                    className="flex-1 text-xs font-bold py-2 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 disabled:opacity-50 transition-colors border border-red-200"
                  >
                    {isWork ? '…' : '✕ Reddet'}
                  </button>
                  {w.resource_id && w.resource_type === 'expense' && (
                    <Link
                      href={`/dashboard/expenses?highlight=${w.resource_id}`}
                      className="text-xs text-primary-600 font-semibold px-3 py-2 rounded-lg hover:bg-primary-50 transition-colors border border-gray-200"
                    >
                      Masrafı Gör →
                    </Link>
                  )}
                </div>

                {fb && fb.msg && (
                  <div className={`mt-2 text-xs px-3 py-2 rounded-lg ${fb.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
                    {fb.msg}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
