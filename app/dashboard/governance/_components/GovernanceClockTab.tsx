'use client'

import { useState, useEffect, useCallback } from 'react'
import { cn } from '@/components/ui'

// ── Types ──────────────────────────────────────────────────────────────────────
interface GovernanceObligation {
  id: string
  source: string
  title: string
  description: string
  due_date: string
  status: string
  severity: string
  days_until: number
  action_href: string | null
  is_informational: boolean
  metadata: Record<string, unknown>
}

type HorizonDays = 30 | 60 | 90

// ── Helpers ────────────────────────────────────────────────────────────────────
function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' })
}

function severityBadge(s: string) {
  if (s === 'critical') return 'bg-red-100 text-red-700'
  if (s === 'warning')  return 'bg-amber-100 text-amber-700'
  return 'bg-[#f1f5f9] text-[#475569]'
}

const SOURCE_LABELS: Record<string, string> = {
  period_close:    'Dönem',
  pcle_repayment:  'Kredi',
  workflow_pending:'İş Akışı',
  statutory_ref:   'Yasal (Ref)',
  user_declared:   'Manuel',
}

// ── ObligationRow ──────────────────────────────────────────────────────────────
function ObligationRow({
  o,
  onComplete,
  onDelete,
}: {
  o: GovernanceObligation
  onComplete: (id: string) => void
  onDelete: (id: string) => void
}) {
  const isUserDeclared = o.id.startsWith('declared_')
  const sourceLabel    = SOURCE_LABELS[o.source] ?? o.source

  return (
    <div
      className={cn(
        'flex items-start gap-3 p-3 rounded-xl border',
        o.status === 'overdue'   ? 'border-red-200 bg-red-50'     :
        o.status === 'due_today' ? 'border-amber-200 bg-amber-50' :
                                    'border-[#e8eaef] bg-white',
      )}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Source badge */}
          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded border bg-brand-subtle text-brand border-brand-subtle shrink-0">
            {sourceLabel}
          </span>
          <span className="text-sm font-medium text-[#0f172a] truncate">{o.title}</span>
          {o.is_informational && (
            <span className="text-[10px] text-[#94a3b8] bg-[#f1f5f9] px-1.5 py-0.5 rounded font-medium shrink-0">
              BİLGİ AMAÇLI
            </span>
          )}
          <span
            className={cn(
              'text-[10px] px-1.5 py-0.5 rounded font-semibold uppercase tracking-wide shrink-0',
              severityBadge(o.severity),
            )}
          >
            {o.days_until < 0
              ? `${Math.abs(o.days_until)} gün gecikmeli`
              : o.days_until === 0
              ? 'Bugün son gün'
              : `${o.days_until} gün kaldı`}
          </span>
        </div>
        {o.description && (
          <p className="text-xs text-[#64748b] mt-0.5 truncate">{o.description}</p>
        )}
        <p className="text-xs text-[#94a3b8] mt-0.5">{fmtDate(o.due_date)}</p>
      </div>
      <div className="flex gap-1 shrink-0">
        {o.action_href && (
          <a href={o.action_href} className="text-xs text-brand hover:underline px-2 py-1">
            Git →
          </a>
        )}
        {isUserDeclared && (
          <>
            <button
              onClick={() => onComplete(o.id)}
              className="text-xs text-green-700 bg-green-50 border border-green-200 px-2 py-1 rounded-lg hover:bg-green-100"
            >
              ✓ Tamamla
            </button>
            <button
              onClick={() => onDelete(o.id)}
              className="text-xs text-red-600 bg-red-50 border border-red-200 px-2 py-1 rounded-lg hover:bg-red-100"
              title="Yükümlülüğü sil"
            >
              ✕
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// ── GovernanceClockTab ─────────────────────────────────────────────────────────
export default function GovernanceClockTab() {
  const [obligations, setObligations] = useState<GovernanceObligation[]>([])
  const [loading, setLoading]         = useState(true)
  const [horizon, setHorizon]         = useState<HorizonDays>(90)
  const [showAddForm, setShowAddForm] = useState(false)
  const [newObl, setNewObl] = useState({
    title: '', due_date: '', description: '', obligation_type: 'contractual',
  })
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch(`/api/governance/clock?horizon=${horizon}`)
      if (r.ok) {
        const d = await r.json()
        setObligations(d.obligations ?? [])
      }
    } finally {
      setLoading(false)
    }
  }, [horizon])

  useEffect(() => { load() }, [load])

  async function markComplete(id: string) {
    if (!id.startsWith('declared_')) return
    const oblId = id.replace('declared_', '')
    await fetch(`/api/governance/obligations/${oblId}/complete`, { method: 'POST' })
    load()
  }

  async function deleteObligation(id: string) {
    if (!id.startsWith('declared_')) return
    const oblId = id.replace('declared_', '')
    const r = await fetch(`/api/governance/obligations/${oblId}`, { method: 'DELETE' })
    if (r.ok) load()
  }

  async function addObligation() {
    if (!newObl.title || !newObl.due_date) return
    setSaving(true)
    try {
      await fetch('/api/governance/obligations', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(newObl),
      })
      setNewObl({ title: '', due_date: '', description: '', obligation_type: 'contractual' })
      setShowAddForm(false)
      load()
    } finally {
      setSaving(false)
    }
  }

  const overdue  = obligations.filter(o => o.status === 'overdue')
  const dueToday = obligations.filter(o => o.status === 'due_today')
  const upcoming = obligations.filter(o => o.status === 'upcoming')

  if (loading) return <div className="py-12 text-center text-sm text-[#64748b]">Yükleniyor…</div>

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-base font-semibold text-[#0f172a]">Yönetişim Takvimi</h2>
          <p className="text-xs text-[#64748b] mt-0.5">
            Önümüzdeki {horizon} gün içindeki yükümlülükler
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Horizon selector */}
          <div className="flex rounded-lg border border-[#e8eaef] overflow-hidden text-xs">
            {([30, 60, 90] as HorizonDays[]).map(h => (
              <button
                key={h}
                onClick={() => setHorizon(h)}
                className={cn(
                  'px-3 py-1.5 font-medium transition-colors',
                  horizon === h
                    ? 'bg-brand-light text-white'
                    : 'text-[#475569] hover:bg-[#f8fafc]',
                )}
              >
                {h} gün
              </button>
            ))}
          </div>
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="text-xs bg-brand-light text-white px-3 py-1.5 rounded-lg hover:bg-brand transition-colors"
          >
            + Yükümlülük Ekle
          </button>
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className={cn(
          'rounded-xl border p-3 text-center',
          overdue.length > 0 ? 'border-red-200 bg-red-50' : 'border-[#e8eaef] bg-white',
        )}>
          <p className={cn('text-2xl font-bold', overdue.length > 0 ? 'text-red-600' : 'text-[#94a3b8]')}>
            {overdue.length}
          </p>
          <p className="text-xs text-[#64748b] mt-0.5">Gecikmiş</p>
        </div>
        <div className={cn(
          'rounded-xl border p-3 text-center',
          dueToday.length > 0 ? 'border-amber-200 bg-amber-50' : 'border-[#e8eaef] bg-white',
        )}>
          <p className={cn('text-2xl font-bold', dueToday.length > 0 ? 'text-amber-600' : 'text-[#94a3b8]')}>
            {dueToday.length}
          </p>
          <p className="text-xs text-[#64748b] mt-0.5">Bugün</p>
        </div>
        <div className="rounded-xl border border-[#e8eaef] bg-white p-3 text-center">
          <p className="text-2xl font-bold text-[#334155]">{upcoming.length}</p>
          <p className="text-xs text-[#64748b] mt-0.5">Yaklaşan</p>
        </div>
      </div>

      {/* Add form */}
      {showAddForm && (
        <div className="border border-brand-subtle rounded-xl p-4 bg-brand-subtle space-y-3">
          <h3 className="text-sm font-medium text-brand">Yeni Yükümlülük</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-[#475569] mb-1 block">Başlık *</label>
              <input
                className="w-full border rounded-lg px-3 py-1.5 text-sm"
                value={newObl.title}
                onChange={e => setNewObl(p => ({ ...p, title: e.target.value }))}
                placeholder="Kira sözleşmesi yenileme"
              />
            </div>
            <div>
              <label className="text-xs text-[#475569] mb-1 block">Son Tarih *</label>
              <input
                type="date"
                className="w-full border rounded-lg px-3 py-1.5 text-sm"
                value={newObl.due_date}
                onChange={e => setNewObl(p => ({ ...p, due_date: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs text-[#475569] mb-1 block">Tür</label>
              <select
                className="w-full border rounded-lg px-3 py-1.5 text-sm"
                value={newObl.obligation_type}
                onChange={e => setNewObl(p => ({ ...p, obligation_type: e.target.value }))}
              >
                <option value="contractual">Sözleşmesel</option>
                <option value="statutory">Yasal (Bilgi amaçlı)</option>
                <option value="internal">İç</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-[#475569] mb-1 block">Açıklama</label>
              <input
                className="w-full border rounded-lg px-3 py-1.5 text-sm"
                value={newObl.description}
                onChange={e => setNewObl(p => ({ ...p, description: e.target.value }))}
                placeholder="Opsiyonel"
              />
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <button
              onClick={addObligation}
              disabled={saving}
              className="text-xs bg-brand-light text-white px-4 py-1.5 rounded-lg hover:bg-brand disabled:opacity-50"
            >
              {saving ? 'Kaydediliyor…' : 'Kaydet'}
            </button>
            <button
              onClick={() => setShowAddForm(false)}
              className="text-xs text-[#475569] px-3 py-1.5 rounded-lg hover:bg-[#f1f5f9]"
            >
              İptal
            </button>
          </div>
        </div>
      )}

      {obligations.length === 0 && (
        <div className="py-12 text-center text-sm text-[#94a3b8]">
          Önümüzdeki {horizon} günde bekleyen yükümlülük yok.
        </div>
      )}

      {/* Overdue */}
      {overdue.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-red-600 uppercase tracking-wider mb-2">
            Gecikmiş — {overdue.length}
          </h3>
          <div className="space-y-2">
            {overdue.map(o => (
              <ObligationRow key={o.id} o={o} onComplete={markComplete} onDelete={deleteObligation} />
            ))}
          </div>
        </div>
      )}

      {/* Due today */}
      {dueToday.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-amber-600 uppercase tracking-wider mb-2">
            Bugün Son Günü — {dueToday.length}
          </h3>
          <div className="space-y-2">
            {dueToday.map(o => (
              <ObligationRow key={o.id} o={o} onComplete={markComplete} onDelete={deleteObligation} />
            ))}
          </div>
        </div>
      )}

      {/* Upcoming */}
      {upcoming.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-[#64748b] uppercase tracking-wider mb-2">
            Yaklaşan — {upcoming.length}
          </h3>
          <div className="space-y-2">
            {upcoming.map(o => (
              <ObligationRow key={o.id} o={o} onComplete={markComplete} onDelete={deleteObligation} />
            ))}
          </div>
        </div>
      )}

      {/* Informational notice */}
      <p className="text-xs text-[#94a3b8] bg-[#f8fafc] rounded-lg px-3 py-2">
        &quot;Bilgi Amaçlı&quot; olarak işaretlenen yasal tarihler referans niteliğindedir.
        Kesin tarihler ve yükümlülükler için mali müşavirinize danışın.
      </p>
    </div>
  )
}
