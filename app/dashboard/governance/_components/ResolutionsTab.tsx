'use client'

import { useState, useEffect, useCallback } from 'react'
import { cn } from '@/components/ui'
import {
  RESOLUTION_STATUS_LABELS,
  ResolutionsService,
  type GovernanceResolution,
  type VotingOutcome,
} from '@/lib/services/governance/resolutions.service'

// ── Color coding ──────────────────────────────────────────────────────────────
const RESOLUTION_STATUS_COLORS: Record<string, string> = {
  draft:       'bg-[#f8fafc]    text-[#334155]   border-[#e8eaef]',
  approved:    'bg-green-50   text-green-700  border-green-200',
  rejected:    'bg-red-50     text-red-700    border-red-200',
  implemented: 'bg-brand-subtle  text-brand border-brand-subtle',
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' })
}

// ── Voting Bar ─────────────────────────────────────────────────────────────────
function VotingBar({ outcome }: { outcome: VotingOutcome }) {
  const total = outcome.total > 0 ? outcome.total : 1
  const inFavorPct  = Math.round((outcome.in_favor  / total) * 100)
  const againstPct  = Math.round((outcome.against   / total) * 100)
  const abstainPct  = Math.round((outcome.abstained / total) * 100)
  const result      = ResolutionsService.computeVotingResult(outcome)

  return (
    <div className="space-y-1.5">
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-[#f1f5f9]">
        {inFavorPct  > 0 && <div style={{ width: `${inFavorPct}%`  }} className="bg-green-500" />}
        {againstPct  > 0 && <div style={{ width: `${againstPct}%` }} className="bg-red-400" />}
        {abstainPct  > 0 && <div style={{ width: `${abstainPct}%` }} className="bg-[#cbd5e1]" />}
      </div>
      <div className="flex items-center gap-3 text-xs text-[#64748b]">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full bg-green-500" />
          Kabul: {outcome.in_favor}
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full bg-red-400" />
          Red: {outcome.against}
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full bg-[#cbd5e1]" />
          Çekimser: {outcome.abstained}
        </span>
        <span className="ml-auto font-medium">
          {result === 'passed' ? (
            <span className="text-green-600">Kabul edildi</span>
          ) : result === 'failed' ? (
            <span className="text-red-600">Reddedildi</span>
          ) : (
            <span className="text-amber-600">Eşit</span>
          )}
        </span>
      </div>
    </div>
  )
}

// ── Approve form ───────────────────────────────────────────────────────────────
interface ApproveFormProps {
  resolutionId: string
  onDone: () => void
  onCancel: () => void
}

function ApproveForm({ resolutionId, onDone, onCancel }: ApproveFormProps) {
  const [form, setForm] = useState({ in_favor: '', against: '', abstained: '', total: '' })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function submit() {
    setErr(null)
    const total     = Number(form.total     || 0)
    const inFavor   = Number(form.in_favor  || 0)
    const against   = Number(form.against   || 0)
    const abstained = Number(form.abstained || 0)

    if (total <= 0) { setErr('Toplam oy sayısı sıfırdan büyük olmalı'); return }
    if (inFavor + against + abstained > total) { setErr('Oy toplamı total değerini aşamaz'); return }

    setSaving(true)
    try {
      const res = await fetch(`/api/governance/resolutions/${resolutionId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'approve',
          voting_outcome: { in_favor: inFavor, against, abstained, total },
        }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setErr((d as { message?: string }).message ?? 'İşlem başarısız')
        return
      }
      onDone()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="border border-green-200 rounded-xl p-3 bg-green-50 space-y-2">
      <p className="text-xs font-medium text-green-800">Oy Sonuçlarını Girin</p>
      {err && <p className="text-xs text-red-600">{err}</p>}
      <div className="grid grid-cols-4 gap-2">
        {([['total', 'Toplam'], ['in_favor', 'Kabul'], ['against', 'Red'], ['abstained', 'Çekimser']] as const).map(([key, label]) => (
          <div key={key}>
            <label className="text-xs text-[#64748b] mb-0.5 block">{label}</label>
            <input
              type="number" min="0"
              className="w-full border rounded px-2 py-1 text-sm"
              value={form[key]}
              onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}
            />
          </div>
        ))}
      </div>
      <div className="flex gap-2 pt-1">
        <button
          onClick={submit} disabled={saving}
          className="text-xs bg-green-600 text-white px-3 py-1.5 rounded-lg hover:bg-green-700 disabled:opacity-50"
        >
          {saving ? 'Onaylanıyor…' : 'Onayla'}
        </button>
        <button onClick={onCancel} className="text-xs text-[#475569] px-3 py-1.5 rounded-lg hover:bg-[#f1f5f9]">
          İptal
        </button>
      </div>
    </div>
  )
}

// ── Implement form ─────────────────────────────────────────────────────────────
interface ImplementFormProps {
  resolutionId: string
  onDone: () => void
  onCancel: () => void
}

function ImplementForm({ resolutionId, onDone, onCancel }: ImplementFormProps) {
  const [notes, setNotes]   = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr]       = useState<string | null>(null)

  async function submit() {
    setErr(null)
    setSaving(true)
    try {
      const res = await fetch(`/api/governance/resolutions/${resolutionId}/implement`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: notes.trim() || undefined }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setErr((d as { message?: string }).message ?? 'İşlem başarısız')
        return
      }
      onDone()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="border border-brand-subtle rounded-xl p-3 bg-brand-subtle space-y-2">
      <p className="text-xs font-medium text-brand">Uygulama Notları (opsiyonel)</p>
      {err && <p className="text-xs text-red-600">{err}</p>}
      <textarea
        className="w-full border rounded-lg px-3 py-1.5 text-sm" rows={2}
        value={notes}
        onChange={e => setNotes(e.target.value)}
        placeholder="Uygulama detayları…"
      />
      <div className="flex gap-2 pt-1">
        <button
          onClick={submit} disabled={saving}
          className="text-xs bg-brand-light text-white px-3 py-1.5 rounded-lg hover:bg-brand disabled:opacity-50"
        >
          {saving ? 'Uygulanıyor…' : 'Uygula'}
        </button>
        <button onClick={onCancel} className="text-xs text-[#475569] px-3 py-1.5 rounded-lg hover:bg-[#f1f5f9]">
          İptal
        </button>
      </div>
    </div>
  )
}

// ── New Resolution form ────────────────────────────────────────────────────────
interface NewResolutionFormProps {
  onDone: () => void
  onCancel: () => void
}

function NewResolutionForm({ onDone, onCancel }: NewResolutionFormProps) {
  const [form, setForm] = useState({
    title: '', resolution_type: 'board',
    resolution_date: new Date().toISOString().slice(0, 10),
    description: '',
    votes_in_favor: '', votes_against: '', votes_abstained: '', votes_total: '',
  })
  const [saving, setSaving] = useState(false)

  async function submit() {
    if (!form.title || !form.resolution_type || !form.resolution_date || !form.description) return
    setSaving(true)
    try {
      const votingOutcome = form.votes_total ? {
        in_favor:  Number(form.votes_in_favor  || 0),
        against:   Number(form.votes_against   || 0),
        abstained: Number(form.votes_abstained || 0),
        total:     Number(form.votes_total),
      } : undefined
      const res = await fetch('/api/governance/resolutions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, voting_outcome: votingOutcome }),
      })
      if (res.ok) { onDone() }
    } finally { setSaving(false) }
  }

  return (
    <div className="border border-brand-subtle rounded-xl p-4 bg-brand-subtle space-y-3">
      <h3 className="text-sm font-medium text-brand">Yeni Karar Taslağı</h3>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="text-xs text-[#475569] mb-1 block">Başlık *</label>
          <input className="w-full border rounded-lg px-3 py-1.5 text-sm" value={form.title}
            onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
            placeholder="Ör: 2024 Yılı Temettü Dağıtımı Kararı" />
        </div>
        <div>
          <label className="text-xs text-[#475569] mb-1 block">Karar Türü *</label>
          <select className="w-full border rounded-lg px-3 py-1.5 text-sm" value={form.resolution_type}
            onChange={e => setForm(p => ({ ...p, resolution_type: e.target.value }))}>
            <option value="board">Yönetim Kurulu Kararı</option>
            <option value="general_meeting">Genel Kurul Kararı</option>
            <option value="circular">Sirkülasyon Kararı</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-[#475569] mb-1 block">Karar Tarihi *</label>
          <input type="date" className="w-full border rounded-lg px-3 py-1.5 text-sm" value={form.resolution_date}
            onChange={e => setForm(p => ({ ...p, resolution_date: e.target.value }))} />
        </div>
        <div className="col-span-2">
          <label className="text-xs text-[#475569] mb-1 block">Karar Metni *</label>
          <textarea className="w-full border rounded-lg px-3 py-1.5 text-sm" rows={3} value={form.description}
            onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
            placeholder="Karar metnini girin…" />
        </div>
        <div className="col-span-2">
          <p className="text-xs text-[#475569] mb-2 font-medium">Oy Sonuçları (opsiyonel)</p>
          <div className="grid grid-cols-4 gap-2">
            {([['votes_total', 'Toplam'], ['votes_in_favor', 'Kabul'], ['votes_against', 'Red'], ['votes_abstained', 'Çekimser']] as const).map(([key, label]) => (
              <div key={key}>
                <label className="text-xs text-[#64748b] mb-1 block">{label}</label>
                <input type="number" min="0" className="w-full border rounded-lg px-2 py-1.5 text-sm"
                  value={form[key as keyof typeof form]}
                  onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))} />
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="flex gap-2 pt-1">
        <button onClick={submit} disabled={saving}
          className="text-xs bg-brand-light text-white px-4 py-1.5 rounded-lg hover:bg-brand disabled:opacity-50">
          {saving ? 'Kaydediliyor…' : 'Taslak Olarak Kaydet'}
        </button>
        <button onClick={onCancel} className="text-xs text-[#475569] px-3 py-1.5 rounded-lg hover:bg-[#f1f5f9]">
          İptal
        </button>
      </div>
    </div>
  )
}

// ── Resolution Card ────────────────────────────────────────────────────────────
interface ResolutionCardProps {
  res: GovernanceResolution
  expanded: boolean
  onToggle: () => void
  onRefresh: () => void
}

function ResolutionCard({ res, expanded, onToggle, onRefresh }: ResolutionCardProps) {
  const [panel, setPanel] = useState<'approve' | 'implement' | null>(null)
  const [rejectLoading, setRejectLoading] = useState(false)

  async function reject() {
    setRejectLoading(true)
    try {
      await fetch(`/api/governance/resolutions/${res.id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reject' }),
      })
      onRefresh()
    } finally { setRejectLoading(false) }
  }

  function handlePanelDone() {
    setPanel(null)
    onRefresh()
  }

  return (
    <div className="border border-[#e8eaef] rounded-xl bg-white overflow-hidden">
      <div
        className="flex items-start justify-between gap-3 p-4 cursor-pointer hover:bg-[#f8fafc] transition-colors"
        onClick={onToggle}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-mono text-[#64748b]">{res.resolution_number}</span>
            <span className={cn('text-xs px-2 py-0.5 rounded border font-medium', RESOLUTION_STATUS_COLORS[res.status] ?? 'bg-[#f1f5f9] text-[#475569]')}>
              {RESOLUTION_STATUS_LABELS[res.status] ?? res.status}
            </span>
            <span className="text-xs text-[#94a3b8]">
              {res.resolution_type === 'board' ? 'YK Kararı' : res.resolution_type === 'general_meeting' ? 'GK Kararı' : 'Sirkülasyon'}
            </span>
          </div>
          <p className="text-sm font-medium text-[#0f172a] mt-1">{res.title}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-xs text-[#64748b]">{fmtDate(res.resolution_date)}</p>
          {res.voting_outcome && (
            <p className="text-xs text-[#94a3b8] mt-0.5">
              {res.voting_outcome.in_favor}/{res.voting_outcome.total} kabul
            </p>
          )}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-[#f1f5f9] p-4 space-y-3">
          <p className="text-sm text-[#334155] whitespace-pre-wrap">{res.description}</p>

          {res.voting_outcome && <VotingBar outcome={res.voting_outcome} />}

          {/* Action buttons */}
          {res.status === 'draft' && panel === null && (
            <div className="flex gap-2">
              <button
                onClick={() => setPanel('approve')}
                className="text-xs bg-green-600 text-white px-3 py-1.5 rounded-lg hover:bg-green-700"
              >
                Onayla
              </button>
              <button
                onClick={reject}
                disabled={rejectLoading}
                className="text-xs bg-red-50 text-red-600 border border-red-200 px-3 py-1.5 rounded-lg hover:bg-red-100 disabled:opacity-50"
              >
                {rejectLoading ? 'İşleniyor…' : 'Reddet'}
              </button>
            </div>
          )}

          {res.status === 'approved' && panel === null && (
            <button
              onClick={() => setPanel('implement')}
              className="text-xs bg-brand-light text-white px-3 py-1.5 rounded-lg hover:bg-brand"
            >
              Uygula
            </button>
          )}

          {/* Inline panels */}
          {panel === 'approve' && (
            <ApproveForm
              resolutionId={res.id}
              onDone={handlePanelDone}
              onCancel={() => setPanel(null)}
            />
          )}

          {panel === 'implement' && (
            <ImplementForm
              resolutionId={res.id}
              onDone={handlePanelDone}
              onCancel={() => setPanel(null)}
            />
          )}

          {res.implemented_at && (
            <p className="text-xs text-[#94a3b8]">Uygulandı: {fmtDate(res.implemented_at)}</p>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function ResolutionsTab() {
  const [resolutions, setResolutions] = useState<GovernanceResolution[]>([])
  const [loading, setLoading]         = useState(true)
  const [showForm, setShowForm]       = useState(false)
  const [expandedId, setExpandedId]   = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/governance/resolutions')
      if (r.ok) { const d = await r.json(); setResolutions(d.resolutions ?? []) }
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  if (loading) return <div className="py-12 text-center text-sm text-[#64748b]">Yükleniyor…</div>

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-[#0f172a]">Karar Defteri</h2>
          <p className="text-xs text-[#64748b] mt-0.5">Yönetim kurulu ve genel kurul kararları</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="text-xs bg-brand-light text-white px-3 py-1.5 rounded-lg hover:bg-brand transition-colors"
        >
          + Yeni Karar
        </button>
      </div>

      {showForm && (
        <NewResolutionForm
          onDone={() => { setShowForm(false); load() }}
          onCancel={() => setShowForm(false)}
        />
      )}

      {resolutions.length === 0 && !showForm && (
        <div className="py-12 text-center">
          <p className="text-sm text-[#94a3b8]">Henüz karar kaydı yok.</p>
          <p className="text-xs text-[#94a3b8] mt-1">İlk kararı eklemek için &quot;+ Yeni Karar&quot; butonunu kullanın.</p>
        </div>
      )}

      <div className="space-y-3">
        {resolutions.map(res => (
          <ResolutionCard
            key={res.id}
            res={res}
            expanded={expandedId === res.id}
            onToggle={() => setExpandedId(expandedId === res.id ? null : res.id)}
            onRefresh={load}
          />
        ))}
      </div>
    </div>
  )
}
