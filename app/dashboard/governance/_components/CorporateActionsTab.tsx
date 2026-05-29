'use client'

import { useState, useEffect, useCallback } from 'react'
import { cn } from '@/components/ui'
import {
  CORPORATE_ACTION_TYPES,
  CORPORATE_ACTION_TYPE_LABELS,
  classifyFinancialImpact,
  type CorporateActionType,
  type FinancialImpactLevel,
} from '@/lib/services/governance/corporate-actions.service'

// ── Local types ────────────────────────────────────────────────────────────────

interface CorporateAction {
  id:                   string
  action_type:          string
  action_date:          string
  title:                string
  description:          string | null
  authorized_by:        string
  resolution_reference: string | null
  financial_amount:     number | null
  financial_currency:   string
  created_at:           string
}

interface SummaryEntry {
  action_type:  CorporateActionType
  count:        number
  total_amount: number
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' })
}

function fmtTRY(n: number) {
  return '₺' + n.toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

const IMPACT_COLORS: Record<FinancialImpactLevel, string> = {
  major:       'bg-red-50   text-red-700   border-red-200',
  significant: 'bg-orange-50 text-orange-700 border-orange-200',
  moderate:    'bg-yellow-50 text-yellow-700 border-yellow-200',
  minor:       'bg-gray-50  text-gray-500  border-gray-200',
}
const IMPACT_LABELS: Record<FinancialImpactLevel, string> = {
  major:       'Büyük Etki',
  significant: 'Önemli Etki',
  moderate:    'Orta Etki',
  minor:       'Küçük Etki',
}

// ── Summary row ────────────────────────────────────────────────────────────────

function SummaryRow({ summaries }: { summaries: SummaryEntry[] }) {
  if (summaries.length === 0) return null

  // Show top 5 by count
  const top = [...summaries].sort((a, b) => b.count - a.count).slice(0, 5)

  return (
    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
      {top.map(s => (
        <div key={s.action_type}
          className="border border-violet-100 rounded-xl bg-violet-50 px-3 py-2 text-center"
        >
          <p className="text-[10px] text-violet-500 font-medium leading-tight line-clamp-2">
            {CORPORATE_ACTION_TYPE_LABELS[s.action_type]}
          </p>
          <p className="text-xl font-bold text-violet-700 mt-0.5">{s.count}</p>
          {s.total_amount > 0 && (
            <p className="text-[10px] text-violet-400 mt-0.5">{fmtTRY(s.total_amount)}</p>
          )}
        </div>
      ))}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function CorporateActionsTab() {
  const [actions,   setActions]   = useState<CorporateAction[]>([])
  const [summaries, setSummaries] = useState<SummaryEntry[]>([])
  const [loading,   setLoading]   = useState(true)
  const [showForm,  setShowForm]  = useState(false)
  const [saving,    setSaving]    = useState(false)
  const [filter,    setFilter]    = useState<CorporateActionType | ''>('')

  const [form, setForm] = useState({
    action_type:          'DIVIDEND_DECLARATION' as CorporateActionType,
    action_date:          new Date().toISOString().slice(0, 10),
    title:                '',
    description:          '',
    authorized_by:        'board',
    resolution_reference: '',
    financial_amount:     '',
    financial_currency:   'TRY',
  })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const url = filter
        ? `/api/governance/corporate-actions?action_type=${filter}`
        : '/api/governance/corporate-actions'
      const r = await fetch(url)
      if (r.ok) {
        const d = await r.json()
        setActions(d.actions ?? [])
        // Build summaries from counts + amounts locally when available
        if (d.counts) {
          const map: Record<string, SummaryEntry> = {}
          for (const a of (d.actions ?? []) as CorporateAction[]) {
            const e = map[a.action_type] ?? { action_type: a.action_type as CorporateActionType, count: 0, total_amount: 0 }
            e.count++
            e.total_amount += Number(a.financial_amount) || 0
            map[a.action_type] = e
          }
          setSummaries(Object.values(map))
        }
      }
    } finally { setLoading(false) }
  }, [filter])

  useEffect(() => { load() }, [load])

  async function save() {
    if (!form.title || !form.action_type || !form.action_date || !form.authorized_by) return
    setSaving(true)
    try {
      const r = await fetch('/api/governance/corporate-actions', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          ...form,
          financial_amount: form.financial_amount ? Number(form.financial_amount) : null,
        }),
      })
      if (r.ok) {
        setShowForm(false)
        setForm({
          action_type:          'DIVIDEND_DECLARATION',
          action_date:          new Date().toISOString().slice(0, 10),
          title:                '',
          description:          '',
          authorized_by:        'board',
          resolution_reference: '',
          financial_amount:     '',
          financial_currency:   'TRY',
        })
        load()
      }
    } finally { setSaving(false) }
  }

  if (loading) return <div className="py-12 text-center text-sm text-gray-500">Yükleniyor…</div>

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Kurumsal Aksiyonlar Kaydı</h2>
          <p className="text-xs text-gray-500 mt-0.5">Şirketteki önemli kurumsal kararlar — değiştirilemez kayıt</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="text-xs bg-violet-600 text-white px-3 py-1.5 rounded-lg hover:bg-violet-700 transition-colors"
        >
          + Yeni Aksiyon
        </button>
      </div>

      {/* Summary row */}
      <SummaryRow summaries={summaries} />

      {/* Filter */}
      <div className="flex items-center gap-2">
        <label className="text-xs text-gray-500 shrink-0">Tür filtresi:</label>
        <select
          value={filter}
          onChange={e => setFilter(e.target.value as CorporateActionType | '')}
          className="border rounded-lg px-2 py-1 text-xs text-gray-700 bg-white"
        >
          <option value="">Tümü</option>
          {CORPORATE_ACTION_TYPES.map(t => (
            <option key={t} value={t}>{CORPORATE_ACTION_TYPE_LABELS[t]}</option>
          ))}
        </select>
        {filter && (
          <button
            onClick={() => setFilter('')}
            className="text-xs text-gray-400 hover:text-gray-600"
          >
            Temizle
          </button>
        )}
      </div>

      {/* New action form */}
      {showForm && (
        <div className="border border-violet-200 rounded-xl p-4 bg-violet-50 space-y-3">
          <h3 className="text-sm font-medium text-violet-900">Yeni Kurumsal Aksiyon</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-600 mb-1 block">Aksiyon Türü *</label>
              <select
                className="w-full border rounded-lg px-3 py-1.5 text-sm"
                value={form.action_type}
                onChange={e => setForm(p => ({ ...p, action_type: e.target.value as CorporateActionType }))}
              >
                {CORPORATE_ACTION_TYPES.map(t => (
                  <option key={t} value={t}>{CORPORATE_ACTION_TYPE_LABELS[t]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-600 mb-1 block">Tarih *</label>
              <input
                type="date"
                className="w-full border rounded-lg px-3 py-1.5 text-sm"
                value={form.action_date}
                onChange={e => setForm(p => ({ ...p, action_date: e.target.value }))}
              />
            </div>
            <div className="col-span-2">
              <label className="text-xs text-gray-600 mb-1 block">Başlık *</label>
              <input
                className="w-full border rounded-lg px-3 py-1.5 text-sm"
                value={form.title}
                onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
                placeholder="Ör: 2024 yılı temettü kararı — ₺500.000"
              />
            </div>
            <div className="col-span-2">
              <label className="text-xs text-gray-600 mb-1 block">Açıklama</label>
              <textarea
                className="w-full border rounded-lg px-3 py-1.5 text-sm"
                rows={2}
                value={form.description}
                onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                placeholder="Karar detayları…"
              />
            </div>
            <div>
              <label className="text-xs text-gray-600 mb-1 block">Yetkili *</label>
              <select
                className="w-full border rounded-lg px-3 py-1.5 text-sm"
                value={form.authorized_by}
                onChange={e => setForm(p => ({ ...p, authorized_by: e.target.value }))}
              >
                <option value="board">Yönetim Kurulu</option>
                <option value="general_meeting">Genel Kurul</option>
                <option value="shareholders">Ortaklar</option>
                <option value="management">Yönetim</option>
                <option value="single_shareholder">Tek Pay Sahibi</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-600 mb-1 block">Karar Referansı</label>
              <input
                className="w-full border rounded-lg px-3 py-1.5 text-sm"
                value={form.resolution_reference}
                onChange={e => setForm(p => ({ ...p, resolution_reference: e.target.value }))}
                placeholder="YK-2024-001"
              />
            </div>
            <div>
              <label className="text-xs text-gray-600 mb-1 block">Tutar (opsiyonel)</label>
              <input
                type="number"
                min="0"
                className="w-full border rounded-lg px-3 py-1.5 text-sm"
                value={form.financial_amount}
                onChange={e => setForm(p => ({ ...p, financial_amount: e.target.value }))}
                placeholder="0"
              />
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <button
              onClick={save}
              disabled={saving}
              className="text-xs bg-violet-600 text-white px-4 py-1.5 rounded-lg hover:bg-violet-700 disabled:opacity-50"
            >
              {saving ? 'Kaydediliyor…' : 'Kaydet'}
            </button>
            <button
              onClick={() => setShowForm(false)}
              className="text-xs text-gray-600 px-3 py-1.5 rounded-lg hover:bg-gray-100"
            >
              İptal
            </button>
          </div>
        </div>
      )}

      {actions.length === 0 && !showForm && (
        <div className="py-12 text-center">
          <p className="text-sm text-gray-400">Henüz kurumsal aksiyon kaydı yok.</p>
          <p className="text-xs text-gray-400 mt-1">İlk aksiyonu kaydetmek için &quot;+ Yeni Aksiyon&quot; butonunu kullanın.</p>
        </div>
      )}

      {/* Action list */}
      <div className="space-y-2">
        {actions.map(a => {
          const impact      = classifyFinancialImpact(a.financial_amount)
          const hasAmount   = a.financial_amount !== null && a.financial_amount !== 0

          return (
            <div
              key={a.id}
              className="border border-gray-200 rounded-xl p-4 bg-white hover:border-gray-300 transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Action type badge */}
                    <span className="text-xs font-medium text-violet-700 bg-violet-50 px-2 py-0.5 rounded border border-violet-200">
                      {CORPORATE_ACTION_TYPE_LABELS[a.action_type as CorporateActionType] ?? a.action_type}
                    </span>

                    {/* Financial impact badge (only when amount is set) */}
                    {hasAmount && (
                      <span className={cn(
                        'text-[10px] font-semibold px-1.5 py-0.5 rounded border uppercase tracking-wide',
                        IMPACT_COLORS[impact],
                      )}>
                        {IMPACT_LABELS[impact]}
                      </span>
                    )}

                    {/* Resolution reference */}
                    {a.resolution_reference && (
                      <span className="text-xs text-gray-500 font-mono">
                        {a.resolution_reference}
                      </span>
                    )}
                  </div>

                  <p className="text-sm font-medium text-gray-900 mt-1">{a.title}</p>
                  {a.description && (
                    <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{a.description}</p>
                  )}

                  {/* Resolution link */}
                  {a.resolution_reference && (
                    <p className="text-xs text-violet-500 mt-1">
                      Karar: {a.resolution_reference}
                    </p>
                  )}
                </div>

                <div className="shrink-0 text-right">
                  <p className="text-xs text-gray-500">{fmtDate(a.action_date)}</p>
                  {hasAmount && (
                    <p className="text-sm font-semibold text-gray-700 mt-0.5">
                      {fmtTRY(Number(a.financial_amount))}
                    </p>
                  )}
                  <p className="text-xs text-gray-400 mt-0.5 capitalize">
                    {a.authorized_by.replace(/_/g, ' ')}
                  </p>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
