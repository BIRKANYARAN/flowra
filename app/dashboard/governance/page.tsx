'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSearchParams, useRouter }       from 'next/navigation'
import { cn } from '@/components/ui'
import AuditReadinessTab    from './_components/AuditReadinessTab'
import ExportsTab            from './_components/ExportsTab'
import CommitmentsTab        from './_components/CommitmentsTab'
import DecisionContextTab    from './_components/DecisionContextTab'
import AuditTrailTab         from './_components/AuditTrailTab'
import AuditHashChainPanel   from './_components/AuditHashChainPanel'
import GovernanceClockTab    from './_components/GovernanceClockTab'
import StakeholderCapitalTab from './_components/StakeholderCapitalTab'

// ── Types ──────────────────────────────────────────────────────────────────────
type TabId = 'calendar' | 'actions' | 'resolutions' | 'audit' | 'exports' | 'commitments' | 'decisions' | 'audit-trail' | 'capital'

interface CorporateAction {
  id: string; action_type: string; action_date: string; title: string
  description: string | null; authorized_by: string; resolution_reference: string | null
  financial_amount: number | null; financial_currency: string; created_at: string
}

interface GovernanceResolution {
  id: string; resolution_number: string; title: string; resolution_type: string
  status: string; resolution_date: string; description: string
  voting_outcome: { in_favor: number; against: number; abstained: number; total: number } | null
  approved_at: string | null; implemented_at: string | null; created_at: string
}
const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: 'calendar',    label: 'Takvim',              icon: '📅' },
  { id: 'actions',     label: 'Kurumsal Aksiyonlar', icon: '🏛️' },
  { id: 'resolutions', label: 'Kararlar',            icon: '⚖️' },
  { id: 'audit',       label: 'Denetim Hazırlığı',  icon: '✅' },
  { id: 'exports',     label: 'Veri Dışa Aktarma',  icon: '📦' },
  { id: 'commitments', label: 'Taahhütler',          icon: '📋' },
  { id: 'decisions',    label: 'Karar Geçmişi',       icon: '🧠' },
  { id: 'audit-trail', label: 'Denetim İzi',          icon: '🔍' },
  { id: 'capital',     label: 'Sermaye Hesapları',    icon: '💰' },
]

const ACTION_TYPE_LABELS: Record<string, string> = {
  CAPITAL_INCREASE: 'Sermaye Artırımı', CAPITAL_CALL: 'Sermaye Çağrısı',
  CAPITAL_DECREASE: 'Sermaye Azaltımı', DIVIDEND_DECLARATION: 'Temettü Kararı',
  DIVIDEND_PAYMENT: 'Temettü Ödemesi', PARTNER_ADMISSION: 'Ortak Kabulü',
  PARTNER_EXIT: 'Ortak Çıkışı', EQUITY_RATIO_CHANGE: 'Hisse Oranı Değişikliği',
  BOARD_APPOINTMENT: 'Yönetici Atanması', BOARD_REMOVAL: 'Yönetici Görevden Alınması',
  AUDITOR_APPOINTMENT: 'Denetçi Atanması', ANNUAL_ACCOUNTS_APPROVAL: 'Yıllık Hesap Onayı',
  BUDGET_APPROVAL: 'Bütçe Onayı', SIGNIFICANT_ASSET_PURCHASE: 'Önemli Varlık Alımı',
  SIGNIFICANT_ASSET_DISPOSAL: 'Önemli Varlık Satışı',
  PARTNER_LOAN_AUTHORIZATION: 'Ortak Borcu Yetkilendirmesi',
  COMPENSATION_AUTHORIZATION: 'Huzur Hakkı Yetkilendirmesi',
  PARTNERSHIP_AGREEMENT_AMENDMENT: 'Ortaklık Sözleşmesi Değişikliği',
  COMPANY_RESTRUCTURE: 'Şirket Yeniden Yapılanması', OTHER: 'Diğer',
}

const RESOLUTION_STATUS_COLORS: Record<string, string> = {
  draft:       'bg-yellow-50 text-yellow-700 border-yellow-200',
  approved:    'bg-green-50  text-green-700  border-green-200',
  rejected:    'bg-red-50    text-red-700    border-red-200',
  implemented: 'bg-blue-50   text-blue-700   border-blue-200',
}
const RESOLUTION_STATUS_LABELS: Record<string, string> = {
  draft: 'Taslak', approved: 'Onaylandı', rejected: 'Reddedildi', implemented: 'Uygulandı',
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' })
}

// ── Corporate Actions Tab ──────────────────────────────────────────────────────
function ActionsTab() {
  const [actions, setActions] = useState<CorporateAction[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving]   = useState(false)
  const [form, setForm] = useState({
    action_type: 'DIVIDEND_DECLARATION', action_date: new Date().toISOString().slice(0, 10),
    title: '', description: '', authorized_by: 'board', resolution_reference: '',
    financial_amount: '', financial_currency: 'TRY',
  })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/governance/corporate-actions')
      if (r.ok) { const d = await r.json(); setActions(d.actions ?? []) }
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  async function save() {
    if (!form.title || !form.action_type || !form.action_date || !form.authorized_by) return
    setSaving(true)
    try {
      const r = await fetch('/api/governance/corporate-actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          financial_amount: form.financial_amount ? Number(form.financial_amount) : null,
        }),
      })
      if (r.ok) { setShowForm(false); load() }
    } finally { setSaving(false) }
  }

  if (loading) return <div className="py-12 text-center text-sm text-gray-500">Yükleniyor…</div>

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Kurumsal Aksiyonlar Kaydı</h2>
          <p className="text-xs text-gray-500 mt-0.5">Şirketteki önemli kurumsal kararlar — değiştirilemez kayıt</p>
        </div>
        <button onClick={() => setShowForm(!showForm)}
          className="text-xs bg-violet-600 text-white px-3 py-1.5 rounded-lg hover:bg-violet-700 transition-colors">
          + Aksiyon Kaydet
        </button>
      </div>

      {showForm && (
        <div className="border border-violet-200 rounded-xl p-4 bg-violet-50 space-y-3">
          <h3 className="text-sm font-medium text-violet-900">Yeni Kurumsal Aksiyon</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-600 mb-1 block">Aksiyon Türü *</label>
              <select className="w-full border rounded-lg px-3 py-1.5 text-sm" value={form.action_type}
                onChange={e => setForm(p => ({ ...p, action_type: e.target.value }))}>
                {Object.entries(ACTION_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-600 mb-1 block">Tarih *</label>
              <input type="date" className="w-full border rounded-lg px-3 py-1.5 text-sm" value={form.action_date}
                onChange={e => setForm(p => ({ ...p, action_date: e.target.value }))} />
            </div>
            <div className="col-span-2">
              <label className="text-xs text-gray-600 mb-1 block">Başlık *</label>
              <input className="w-full border rounded-lg px-3 py-1.5 text-sm" value={form.title}
                onChange={e => setForm(p => ({ ...p, title: e.target.value }))} placeholder="Ör: 2024 yılı temettü kararı — ₺500.000" />
            </div>
            <div className="col-span-2">
              <label className="text-xs text-gray-600 mb-1 block">Açıklama</label>
              <textarea className="w-full border rounded-lg px-3 py-1.5 text-sm" rows={2} value={form.description}
                onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="Karar detayları…" />
            </div>
            <div>
              <label className="text-xs text-gray-600 mb-1 block">Yetkili *</label>
              <select className="w-full border rounded-lg px-3 py-1.5 text-sm" value={form.authorized_by}
                onChange={e => setForm(p => ({ ...p, authorized_by: e.target.value }))}>
                <option value="board">Yönetim Kurulu</option>
                <option value="general_meeting">Genel Kurul</option>
                <option value="shareholders">Ortaklar</option>
                <option value="management">Yönetim</option>
                <option value="single_shareholder">Tek Pay Sahibi</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-600 mb-1 block">Karar Referansı</label>
              <input className="w-full border rounded-lg px-3 py-1.5 text-sm" value={form.resolution_reference}
                onChange={e => setForm(p => ({ ...p, resolution_reference: e.target.value }))} placeholder="YK-2024-001" />
            </div>
            <div>
              <label className="text-xs text-gray-600 mb-1 block">Tutar (opsiyonel)</label>
              <input type="number" className="w-full border rounded-lg px-3 py-1.5 text-sm" value={form.financial_amount}
                onChange={e => setForm(p => ({ ...p, financial_amount: e.target.value }))} placeholder="0" />
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <button onClick={save} disabled={saving}
              className="text-xs bg-violet-600 text-white px-4 py-1.5 rounded-lg hover:bg-violet-700 disabled:opacity-50">
              {saving ? 'Kaydediliyor…' : 'Kaydet'}
            </button>
            <button onClick={() => setShowForm(false)} className="text-xs text-gray-600 px-3 py-1.5 rounded-lg hover:bg-gray-100">
              İptal
            </button>
          </div>
        </div>
      )}

      {actions.length === 0 && !showForm && (
        <div className="py-12 text-center">
          <p className="text-sm text-gray-400">Henüz kurumsal aksiyon kaydı yok.</p>
          <p className="text-xs text-gray-400 mt-1">İlk aksiyonu kaydetmek için &quot;+ Aksiyon Kaydet&quot; butonunu kullanın.</p>
        </div>
      )}

      <div className="space-y-2">
        {actions.map(a => (
          <div key={a.id} className="border border-gray-200 rounded-xl p-4 bg-white hover:border-gray-300 transition-colors">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-medium text-violet-700 bg-violet-50 px-2 py-0.5 rounded border border-violet-200">
                    {ACTION_TYPE_LABELS[a.action_type] ?? a.action_type}
                  </span>
                  {a.resolution_reference && (
                    <span className="text-xs text-gray-500 font-mono">{a.resolution_reference}</span>
                  )}
                </div>
                <p className="text-sm font-medium text-gray-900 mt-1">{a.title}</p>
                {a.description && <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{a.description}</p>}
              </div>
              <div className="shrink-0 text-right">
                <p className="text-xs text-gray-500">{fmtDate(a.action_date)}</p>
                {a.financial_amount && (
                  <p className="text-sm font-semibold text-gray-700 mt-0.5">
                    ₺{Number(a.financial_amount).toLocaleString('tr-TR')}
                  </p>
                )}
                <p className="text-xs text-gray-400 mt-0.5 capitalize">{a.authorized_by.replace('_', ' ')}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Resolutions Tab ────────────────────────────────────────────────────────────
function ResolutionsTab() {
  const [resolutions, setResolutions] = useState<GovernanceResolution[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving]    = useState(false)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [approveLoading, setApproveLoading] = useState<string | null>(null)
  const [form, setForm] = useState({
    title: '', resolution_type: 'board', resolution_date: new Date().toISOString().slice(0, 10),
    description: '', votes_in_favor: '', votes_against: '', votes_abstained: '', votes_total: '',
  })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/governance/resolutions')
      if (r.ok) { const d = await r.json(); setResolutions(d.resolutions ?? []) }
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  async function createResolution() {
    if (!form.title || !form.resolution_type || !form.resolution_date || !form.description) return
    setSaving(true)
    try {
      const votingOutcome = form.votes_total ? {
        in_favor:  Number(form.votes_in_favor  || 0),
        against:   Number(form.votes_against   || 0),
        abstained: Number(form.votes_abstained || 0),
        total:     Number(form.votes_total),
      } : undefined
      const r = await fetch('/api/governance/resolutions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, voting_outcome: votingOutcome }),
      })
      if (r.ok) { setShowForm(false); load() }
    } finally { setSaving(false) }
  }

  async function transition(id: string, action: 'approve' | 'reject') {
    setApproveLoading(id)
    try {
      await fetch(`/api/governance/resolutions/${id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      load()
    } finally { setApproveLoading(null) }
  }

  async function implement(id: string) {
    setApproveLoading(id)
    try {
      await fetch(`/api/governance/resolutions/${id}/implement`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      load()
    } finally { setApproveLoading(null) }
  }

  if (loading) return <div className="py-12 text-center text-sm text-gray-500">Yükleniyor…</div>

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Karar Defteri</h2>
          <p className="text-xs text-gray-500 mt-0.5">Yönetim kurulu ve genel kurul kararları</p>
        </div>
        <button onClick={() => setShowForm(!showForm)}
          className="text-xs bg-violet-600 text-white px-3 py-1.5 rounded-lg hover:bg-violet-700 transition-colors">
          + Yeni Karar
        </button>
      </div>

      {showForm && (
        <div className="border border-violet-200 rounded-xl p-4 bg-violet-50 space-y-3">
          <h3 className="text-sm font-medium text-violet-900">Yeni Karar Taslağı</h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="text-xs text-gray-600 mb-1 block">Başlık *</label>
              <input className="w-full border rounded-lg px-3 py-1.5 text-sm" value={form.title}
                onChange={e => setForm(p => ({ ...p, title: e.target.value }))} placeholder="Ör: 2024 Yılı Temettü Dağıtımı Kararı" />
            </div>
            <div>
              <label className="text-xs text-gray-600 mb-1 block">Karar Türü *</label>
              <select className="w-full border rounded-lg px-3 py-1.5 text-sm" value={form.resolution_type}
                onChange={e => setForm(p => ({ ...p, resolution_type: e.target.value }))}>
                <option value="board">Yönetim Kurulu Kararı</option>
                <option value="general_meeting">Genel Kurul Kararı</option>
                <option value="circular">Sirkülasyon Kararı</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-600 mb-1 block">Karar Tarihi *</label>
              <input type="date" className="w-full border rounded-lg px-3 py-1.5 text-sm" value={form.resolution_date}
                onChange={e => setForm(p => ({ ...p, resolution_date: e.target.value }))} />
            </div>
            <div className="col-span-2">
              <label className="text-xs text-gray-600 mb-1 block">Karar Metni *</label>
              <textarea className="w-full border rounded-lg px-3 py-1.5 text-sm" rows={3} value={form.description}
                onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                placeholder="Karar metnini girin…" />
            </div>
            <div className="col-span-2">
              <p className="text-xs text-gray-600 mb-2 font-medium">Oy Sonuçları (opsiyonel)</p>
              <div className="grid grid-cols-4 gap-2">
                {([['votes_total','Toplam'],['votes_in_favor','Kabul'],['votes_against','Red'],['votes_abstained','Çekimser']] as const).map(([key, label]) => (
                  <div key={key}>
                    <label className="text-xs text-gray-500 mb-1 block">{label}</label>
                    <input type="number" min="0" className="w-full border rounded-lg px-2 py-1.5 text-sm"
                      value={form[key as keyof typeof form]}
                      onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))} />
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <button onClick={createResolution} disabled={saving}
              className="text-xs bg-violet-600 text-white px-4 py-1.5 rounded-lg hover:bg-violet-700 disabled:opacity-50">
              {saving ? 'Kaydediliyor…' : 'Taslak Olarak Kaydet'}
            </button>
            <button onClick={() => setShowForm(false)} className="text-xs text-gray-600 px-3 py-1.5 rounded-lg hover:bg-gray-100">
              İptal
            </button>
          </div>
        </div>
      )}

      {resolutions.length === 0 && !showForm && (
        <div className="py-12 text-center">
          <p className="text-sm text-gray-400">Henüz karar kaydı yok.</p>
          <p className="text-xs text-gray-400 mt-1">İlk kararı eklemek için &quot;+ Yeni Karar&quot; butonunu kullanın.</p>
        </div>
      )}

      <div className="space-y-3">
        {resolutions.map(res => (
          <div key={res.id} className="border border-gray-200 rounded-xl bg-white overflow-hidden">
            <div
              className="flex items-start justify-between gap-3 p-4 cursor-pointer hover:bg-gray-50 transition-colors"
              onClick={() => setActiveId(activeId === res.id ? null : res.id)}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-mono text-gray-500">{res.resolution_number}</span>
                  <span className={cn('text-xs px-2 py-0.5 rounded border font-medium', RESOLUTION_STATUS_COLORS[res.status] ?? 'bg-gray-100 text-gray-600')}>
                    {RESOLUTION_STATUS_LABELS[res.status] ?? res.status}
                  </span>
                  <span className="text-xs text-gray-400 capitalize">
                    {res.resolution_type === 'board' ? 'YK Kararı' : res.resolution_type === 'general_meeting' ? 'GK Kararı' : 'Sirkülasyon'}
                  </span>
                </div>
                <p className="text-sm font-medium text-gray-900 mt-1">{res.title}</p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-xs text-gray-500">{fmtDate(res.resolution_date)}</p>
                {res.voting_outcome && (
                  <p className="text-xs text-gray-400 mt-0.5">
                    {res.voting_outcome.in_favor}/{res.voting_outcome.total} kabul
                  </p>
                )}
              </div>
            </div>

            {activeId === res.id && (
              <div className="border-t border-gray-100 p-4 space-y-3">
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{res.description}</p>

                {res.voting_outcome && (
                  <div className="grid grid-cols-4 gap-2 bg-gray-50 rounded-lg p-3">
                    {(
                      [
                        ['Toplam', res.voting_outcome.total],
                        ['Kabul', res.voting_outcome.in_favor],
                        ['Red', res.voting_outcome.against],
                        ['Çekimser', res.voting_outcome.abstained],
                      ] as [string, number][]
                    ).map(([label, val]) => (
                      <div key={label} className="text-center">
                        <p className="text-xs text-gray-500">{label}</p>
                        <p className="text-sm font-semibold text-gray-700">{val}</p>
                      </div>
                    ))}
                  </div>
                )}

                {res.status === 'draft' && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => transition(res.id, 'approve')}
                      disabled={approveLoading === res.id}
                      className="text-xs bg-green-600 text-white px-3 py-1.5 rounded-lg hover:bg-green-700 disabled:opacity-50"
                    >
                      ✓ Onayla
                    </button>
                    <button
                      onClick={() => transition(res.id, 'reject')}
                      disabled={approveLoading === res.id}
                      className="text-xs bg-red-50 text-red-600 border border-red-200 px-3 py-1.5 rounded-lg hover:bg-red-100 disabled:opacity-50"
                    >
                      ✗ Reddet
                    </button>
                  </div>
                )}
                {res.status === 'approved' && (
                  <button
                    onClick={() => implement(res.id)}
                    disabled={approveLoading === res.id}
                    className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 disabled:opacity-50"
                  >
                    ⚡ Uygulama Olarak İşaretle
                  </button>
                )}
                {res.implemented_at && (
                  <p className="text-xs text-gray-400">Uygulandı: {fmtDate(res.implemented_at)}</p>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function GovernancePage() {
  const searchParams = useSearchParams()
  const router       = useRouter()
  const activeTab    = (searchParams.get('tab') ?? 'calendar') as TabId

  function setTab(id: TabId) {
    router.replace(`/dashboard/governance?tab=${id}`, { scroll: false })
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-xl font-bold text-gray-900">Yönetişim Merkezi</h1>
        <p className="text-sm text-gray-500 mt-1">
          Kurumsal takvim, aksiyon kaydı ve karar defteri
        </p>
      </div>

      {/* Tab nav */}
      <div className="flex gap-1 border-b border-gray-200">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              'px-4 py-2 text-sm font-medium transition-colors -mb-px border-b-2',
              activeTab === t.id
                ? 'border-violet-600 text-violet-700'
                : 'border-transparent text-gray-500 hover:text-gray-700',
            )}
          >
            <span className="mr-1.5">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div>
        {activeTab === 'calendar'    && <GovernanceClockTab />}
        {activeTab === 'actions'     && <ActionsTab />}
        {activeTab === 'resolutions' && <ResolutionsTab />}
        {activeTab === 'audit'       && <AuditReadinessTab />}
        {activeTab === 'exports'     && <ExportsTab />}
        {activeTab === 'commitments' && <CommitmentsTab />}
        {activeTab === 'decisions'   && <DecisionContextTab />}
        {activeTab === 'audit-trail' && (
          <div className="space-y-6">
            <AuditHashChainPanel />
            <AuditTrailTab />
          </div>
        )}
        {activeTab === 'capital' && <StakeholderCapitalTab />}
      </div>
    </div>
  )
}
