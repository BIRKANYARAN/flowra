'use client'

// /dashboard/admin/workflows — Pending Workflow Approvals
// Lists pending expense approvals (and future workflow types).
// Admin-only page.

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { fmtDate as fmt, fmtTRY } from '@/lib/format'

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

const fmtMoney = (n: unknown) => fmtTRY(Number(n ?? 0) || 0, 0)

function Skeleton() { return <div className="bg-[#f1f5f9] rounded h-20 animate-pulse" /> }

export default function WorkflowsPage() {
  const [workflows, setWorkflows] = useState<WorkflowInstance[]>([])
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState<string | null>(null)
  const [working,   setWorking]   = useState<string | null>(null)
  const [notes,     setNotes]     = useState<Record<string, string>>({})
  const [feedback,  setFeedback]  = useState<Record<string, { ok: boolean; msg: string }>>({})

  const load = useCallback((signal?: AbortSignal) => {
    setLoading(true)
    fetch('/api/workflow', { signal })
      .then(r => r.json())
      .then(d => setWorkflows(d.workflows ?? []))
      .catch(err => { if (err.name !== 'AbortError') setError('Onay bekleyen işlemler yüklenemedi') })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    const ctrl = new AbortController()
    load(ctrl.signal)
    return () => ctrl.abort()
  }, [load])

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
          <h1 className="text-xl font-black text-[#0f172a] tracking-tight">Onay Bekleyen İşlemler</h1>
          <p className="text-xs text-[#94a3b8] mt-0.5">
            {loading ? 'Yükleniyor…' : `${workflows.length} işlem onay bekliyor`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => load()} className="text-xs text-[#94a3b8] hover:text-primary-600 font-semibold">
            ↺ Yenile
          </button>
          <Link href="/dashboard/admin" className="text-xs text-[#94a3b8] hover:text-primary-600 font-semibold">
            ← Yönetim
          </Link>
        </div>
      </div>

      {error && (
        <div className="bg-neg-light border border-neg-light rounded px-4 py-3 text-sm text-neg-text">{error}</div>
      )}

      {loading && (
        <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} />)}</div>
      )}

      {!loading && workflows.length === 0 && !error && (
        <div className="bg-[#f8fafc] border border-[#e2e8f0] rounded px-4 py-12 text-center">
          <div className="text-2xl mb-2">✓</div>
          <div className="text-sm font-semibold text-[#64748b]">Onay bekleyen işlem yok</div>
          <div className="text-xs text-[#94a3b8] mt-1">Tüm işlemler onaylandı veya henüz onay gerektiren işlem oluşturulmadı.</div>
        </div>
      )}

      <div className="space-y-3">
        {workflows.map(w => {
          const fb      = feedback[w.id]
          const isWork  = working === w.id
          const payload = w.payload ?? {}

          return (
            <div key={w.id} className="bg-white border border-[#e2e8f0] rounded overflow-hidden">
              {/* Main row */}
              <div className="px-5 py-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    {/* Type badge */}
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-[0.65rem] font-black uppercase tracking-widest px-1.5 py-0.5 rounded bg-warn-light text-warn-text">
                        {TYPE_LABELS[w.workflow_type] ?? w.workflow_type}
                      </span>
                      {w.expires_at && (
                        <span className="text-[10px] text-[#94a3b8]">
                          Son: {fmt(w.expires_at)}
                        </span>
                      )}
                    </div>

                    {/* Expense details */}
                    {w.workflow_type === 'expense_approval' && (
                      <div className="space-y-0.5">
                        <div className="text-sm font-bold text-[#0f172a]">
                          {fmtMoney(payload.amount_try)}
                          <span className="text-xs font-normal text-[#94a3b8] ml-1.5">
                            ({String(payload.currency ?? 'TRY')} {Number(payload.amount ?? 0).toLocaleString('tr-TR')} @ kur)
                          </span>
                        </div>
                        <div className="text-xs text-[#64748b] truncate">
                          {String(payload.description ?? '—')}
                        </div>
                        <div className="flex gap-3 text-[10px] text-[#94a3b8] mt-1">
                          <span>Kategori: {String(payload.category ?? '—')}</span>
                          <span>Tarih: {String(payload.expense_date ?? '—')}</span>
                          <span>Eşik: {fmtMoney(payload.threshold)}</span>
                        </div>
                      </div>
                    )}

                    {/* Generic payload for other types */}
                    {w.workflow_type !== 'expense_approval' && (
                      <div className="text-xs text-[#64748b]">
                        {JSON.stringify(payload).slice(0, 120)}…
                      </div>
                    )}

                    <div className="text-[10px] text-[#94a3b8] mt-1.5">
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
                    className="w-full border border-[#e2e8f0] rounded px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-brand/30 bg-[#f8fafc]"
                  />
                </div>

                {/* Actions */}
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() => resolve(w.id, 'approve')}
                    disabled={isWork}
                    className="flex-1 text-xs font-bold py-2 rounded bg-pos text-white hover:bg-pos disabled:opacity-50 transition-colors"
                  >
                    {isWork ? '…' : '✓ Onayla'}
                  </button>
                  <button
                    onClick={() => resolve(w.id, 'reject')}
                    disabled={isWork}
                    className="flex-1 text-xs font-bold py-2 rounded bg-neg-light text-neg hover:bg-neg-light disabled:opacity-50 transition-colors border border-neg-light"
                  >
                    {isWork ? '…' : '✕ Reddet'}
                  </button>
                  {w.resource_id && w.resource_type === 'expense' && (
                    <Link
                      href={`/dashboard/expenses?highlight=${w.resource_id}`}
                      className="text-xs text-primary-600 font-semibold px-3 py-2 rounded hover:bg-primary-50 transition-colors border border-[#e2e8f0]"
                    >
                      Masrafı Gör →
                    </Link>
                  )}
                </div>

                {fb && fb.msg && (
                  <div className={`mt-2 text-xs px-3 py-2 rounded ${fb.ok ? 'bg-pos-light text-pos-text' : 'bg-neg-light text-neg'}`}>
                    {fb.msg}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Cross-navigation */}
      <div className="flex items-center justify-between px-1">
        <p className="text-[10px] text-[#94a3b8] leading-relaxed">
          Onay bekleyen işlemler denetim izinde kayıt altına alınır.
        </p>
        <div className="flex items-center gap-2 shrink-0 ml-4">
          <Link href="/dashboard/admin/audit" className="text-[11px] font-bold text-primary-600 hover:text-primary-700 underline underline-offset-2 whitespace-nowrap">
            Denetim İzi →
          </Link>
          <span className="text-[#e2e8f0]">|</span>
          <Link href="/dashboard/operations?tab=expenses" className="text-[11px] font-bold text-primary-600 hover:text-primary-700 underline underline-offset-2 whitespace-nowrap">
            Giderler →
          </Link>
        </div>
      </div>
    </div>
  )
}
