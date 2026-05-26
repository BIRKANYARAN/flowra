'use client'

import { useState, useCallback, useEffect } from 'react'
import { cn } from '@/components/ui'
import { fmtTRY, fmtDate } from '@/lib/format'
import type { CommitmentsLedger, ForwardObligation } from '@/lib/services/governance/commitments.service'

// ── Constants ──────────────────────────────────────────────────────────────────

const COMMITMENT_TYPE_LABELS: Record<string, string> = {
  contract:       'Sözleşme',
  purchase_order: 'Satın Alma Siparişi',
  lease:          'Kiralama',
  tax_payment:    'Vergi Ödemesi',
  loan_repayment: 'Kredi Geri Ödemesi',
  dividend:       'Temettü',
  capex:          'Sermaye Yatırımı',
  interest_accrual: 'Faiz Tahakkuku',
  other:          'Diğer',
}

const SOURCE_LABELS: Record<string, string> = {
  loan_repayment:       'Kredi Geri Ödemesi',
  interest_accrual:     'Faiz Tahakkuku',
  workflow_expense:     'İş Akışı — Masraf',
  governance_obligation:'Yönetişim Yükümlülüğü',
  declared_commitment:  'Beyan Edilen Taahhüt',
}

const RECURRENCE_LABELS: Record<string, string> = {
  monthly:   'Aylık',
  quarterly: 'Üç Aylık',
  annual:    'Yıllık',
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function statusBadgeClass(status: ForwardObligation['status']): string {
  if (status === 'overdue')  return 'bg-red-100   text-red-700   border border-red-200'
  if (status === 'due_soon') return 'bg-amber-100 text-amber-700 border border-amber-200'
  return 'bg-gray-100 text-gray-600 border border-gray-200'
}

function statusLabel(status: ForwardObligation['status']): string {
  if (status === 'overdue')  return 'Gecikmiş'
  if (status === 'due_soon') return 'Yaklaşıyor'
  return 'Planlı'
}

function relativeDue(dueDate: string, today: string): string {
  const diff = Math.round(
    (new Date(dueDate).getTime() - new Date(today).getTime()) / 86_400_000,
  )
  if (diff < 0)  return `Gecikmiş — ${Math.abs(diff)} gün`
  if (diff === 0) return 'Bugün son gün'
  if (diff === 1) return 'Yarın'
  return `${diff} gün sonra`
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

function nextTwelveMonths(): string[] {
  const result: string[] = []
  const now  = new Date()
  let year   = now.getFullYear()
  let month  = now.getMonth() + 1  // 1-indexed
  for (let i = 0; i < 12; i++) {
    result.push(`${year}-${String(month).padStart(2, '0')}`)
    month++
    if (month > 12) { month = 1; year++ }
  }
  return result
}

function fmtMonth(yyyyMm: string): string {
  const [y, m] = yyyyMm.split('-')
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('tr-TR', {
    month: 'long', year: 'numeric',
  })
}

// ── KPI card ──────────────────────────────────────────────────────────────────

function KpiCard({
  label, value, sub, color,
}: {
  label: string
  value: string
  sub?: string
  color?: 'red' | 'amber' | 'green' | 'default'
}) {
  const valueColor =
    color === 'red'    ? 'text-red-700'    :
    color === 'amber'  ? 'text-amber-700'  :
    color === 'green'  ? 'text-green-700'  :
    'text-gray-900'

  return (
    <div className="border border-gray-200 rounded-xl p-4 bg-white">
      <p className="text-xs text-gray-500 font-medium">{label}</p>
      <p className={cn('text-xl font-bold mt-1 tabular-nums', valueColor)}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}

// ── Monthly outlook table ─────────────────────────────────────────────────────

function MonthlyOutlookTable({
  byMonth,
}: {
  byMonth: CommitmentsLedger['by_month']
}) {
  const months = nextTwelveMonths()

  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-800 mb-3">12 Aylık Öngörü</h3>
      <div className="border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">Dönem</th>
              <th className="text-right px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">Yükümlülük Sayısı</th>
              <th className="text-right px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">Toplam (TRY)</th>
            </tr>
          </thead>
          <tbody>
            {months.map((m, idx) => {
              const row = byMonth[m]
              const isEmpty = !row || row.count === 0
              return (
                <tr
                  key={m}
                  className={cn(
                    'border-b border-gray-100 last:border-0',
                    idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50',
                    !isEmpty ? 'font-medium' : '',
                  )}
                >
                  <td className="px-4 py-2.5 text-gray-800">{fmtMonth(m)}</td>
                  <td className="px-4 py-2.5 text-right text-gray-600">
                    {isEmpty ? <span className="text-gray-300">—</span> : row.count}
                  </td>
                  <td className="px-4 py-2.5 text-right text-gray-900 tabular-nums">
                    {isEmpty
                      ? <span className="text-gray-300">—</span>
                      : row.total_try > 0
                        ? `₺${fmtTRY(row.total_try)}`
                        : <span className="text-gray-400 text-xs">Tutarsız</span>
                    }
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Obligation row ─────────────────────────────────────────────────────────────

function ObligationRow({
  obligation,
  today,
  onFulfil,
  onCancel,
}: {
  obligation: ForwardObligation
  today:      string
  onFulfil:   (id: string) => void
  onCancel:   (id: string) => void
}) {
  const isOverdue  = obligation.status === 'overdue'
  const isDueSoon  = obligation.status === 'due_soon'
  const isDeclared = !obligation.is_computed

  // Extract raw DB id from prefixed id ("declared_commitment_<uuid>")
  const rawId = obligation.id.replace('declared_commitment_', '')

  return (
    <div
      className={cn(
        'border rounded-xl p-4 bg-white',
        isOverdue  ? 'border-red-200   bg-red-50/30'   :
        isDueSoon  ? 'border-amber-200 bg-amber-50/20' :
                     'border-gray-200',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          {/* Title + badges */}
          <div className="flex flex-wrap items-center gap-1.5 mb-1">
            <span className="text-sm font-medium text-gray-900 truncate max-w-xs">{obligation.title}</span>
            <span className={cn('text-[10px] px-1.5 py-0.5 rounded font-semibold uppercase tracking-wide shrink-0', statusBadgeClass(obligation.status))}>
              {statusLabel(obligation.status)}
            </span>
            <span className={cn(
              'text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0 border',
              isDeclared
                ? 'bg-violet-50 text-violet-700 border-violet-200'
                : 'bg-blue-50   text-blue-600   border-blue-200',
            )}>
              {isDeclared ? 'Beyan' : 'Otomatik'}
            </span>
          </div>

          {/* Source + type */}
          <div className="flex flex-wrap gap-3 text-xs text-gray-500">
            <span>{SOURCE_LABELS[obligation.source] ?? obligation.source}</span>
            {obligation.counterparty && (
              <span className="text-gray-400">· {obligation.counterparty}</span>
            )}
            {obligation.commitment_type && COMMITMENT_TYPE_LABELS[obligation.commitment_type] && (
              <span className="text-gray-400">· {COMMITMENT_TYPE_LABELS[obligation.commitment_type]}</span>
            )}
            {obligation.recurrence && RECURRENCE_LABELS[obligation.recurrence] && (
              <span className="text-gray-400">· {RECURRENCE_LABELS[obligation.recurrence]}</span>
            )}
          </div>

          {/* Description */}
          {obligation.description && (
            <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">{obligation.description}</p>
          )}
        </div>

        {/* Right side: amount + date + actions */}
        <div className="shrink-0 text-right space-y-1">
          <p className="text-sm font-semibold text-gray-900 tabular-nums">
            {obligation.amount_try != null
              ? `₺${fmtTRY(obligation.amount_try)}`
              : <span className="text-gray-400 text-xs font-normal">Tutar belirsiz</span>
            }
          </p>
          <p className="text-xs text-gray-500">{fmtDate(obligation.due_date)}</p>
          <p className={cn(
            'text-[11px] font-medium',
            isOverdue ? 'text-red-600' : isDueSoon ? 'text-amber-600' : 'text-gray-400',
          )}>
            {relativeDue(obligation.due_date, today)}
          </p>

          {/* Action buttons for declared commitments only */}
          {isDeclared && (
            <div className="flex gap-1 pt-1 justify-end">
              <button
                onClick={() => onFulfil(rawId)}
                className="text-[11px] bg-green-50 text-green-700 border border-green-200 px-2 py-1 rounded-lg hover:bg-green-100 transition-colors"
              >
                ✓ Yerine Getir
              </button>
              <button
                onClick={() => onCancel(rawId)}
                className="text-[11px] bg-gray-50 text-gray-500 border border-gray-200 px-2 py-1 rounded-lg hover:bg-gray-100 transition-colors"
              >
                ✗ İptal
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Add Commitment Form ────────────────────────────────────────────────────────

interface AddFormState {
  title:           string
  commitment_type: string
  amount_try:      string
  due_date:        string
  recurrence:      string
  counterparty:    string
  description:     string
}

const EMPTY_FORM: AddFormState = {
  title:           '',
  commitment_type: 'contract',
  amount_try:      '',
  due_date:        '',
  recurrence:      '',
  counterparty:    '',
  description:     '',
}

function AddCommitmentForm({ onSaved, onCancel }: { onSaved: () => void; onCancel: () => void }) {
  const [form, setForm] = useState<AddFormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState<string | null>(null)

  async function handleSave() {
    if (!form.title.trim() || !form.due_date || !form.commitment_type) {
      setError('Başlık, tür ve son tarih zorunludur.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/governance/commitments', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          title:           form.title.trim(),
          commitment_type: form.commitment_type,
          amount_try:      form.amount_try ? Number(form.amount_try) : null,
          due_date:        form.due_date,
          recurrence:      form.recurrence || null,
          counterparty:    form.counterparty.trim() || null,
          description:     form.description.trim() || null,
        }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setError((d as { error?: string }).error ?? 'Kayıt başarısız')
        return
      }
      setForm(EMPTY_FORM)
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="border border-violet-200 rounded-xl p-4 bg-violet-50 space-y-4">
      <h3 className="text-sm font-semibold text-violet-900">Yeni Taahhüt Ekle</h3>

      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="text-xs text-gray-600 mb-1 block">Başlık *</label>
          <input
            className="w-full border rounded-lg px-3 py-1.5 text-sm bg-white"
            value={form.title}
            onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
            placeholder="Ör: Ofis kira ödemesi — Temmuz 2026"
          />
        </div>

        <div>
          <label className="text-xs text-gray-600 mb-1 block">Tür *</label>
          <select
            className="w-full border rounded-lg px-3 py-1.5 text-sm bg-white"
            value={form.commitment_type}
            onChange={e => setForm(p => ({ ...p, commitment_type: e.target.value }))}
          >
            {Object.entries(COMMITMENT_TYPE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-xs text-gray-600 mb-1 block">Son Tarih *</label>
          <input
            type="date"
            className="w-full border rounded-lg px-3 py-1.5 text-sm bg-white"
            value={form.due_date}
            onChange={e => setForm(p => ({ ...p, due_date: e.target.value }))}
          />
        </div>

        <div>
          <label className="text-xs text-gray-600 mb-1 block">Tutar (TRY, opsiyonel)</label>
          <input
            type="number"
            min="0"
            step="0.01"
            className="w-full border rounded-lg px-3 py-1.5 text-sm bg-white"
            value={form.amount_try}
            onChange={e => setForm(p => ({ ...p, amount_try: e.target.value }))}
            placeholder="0,00"
          />
        </div>

        <div>
          <label className="text-xs text-gray-600 mb-1 block">Tekrar (opsiyonel)</label>
          <select
            className="w-full border rounded-lg px-3 py-1.5 text-sm bg-white"
            value={form.recurrence}
            onChange={e => setForm(p => ({ ...p, recurrence: e.target.value }))}
          >
            <option value="">Tekrar yok</option>
            <option value="monthly">Aylık</option>
            <option value="quarterly">Üç Aylık</option>
            <option value="annual">Yıllık</option>
          </select>
        </div>

        <div>
          <label className="text-xs text-gray-600 mb-1 block">Karşı Taraf (opsiyonel)</label>
          <input
            className="w-full border rounded-lg px-3 py-1.5 text-sm bg-white"
            value={form.counterparty}
            onChange={e => setForm(p => ({ ...p, counterparty: e.target.value }))}
            placeholder="Tedarikçi, ortak adı…"
          />
        </div>

        <div>
          <label className="text-xs text-gray-600 mb-1 block">Açıklama (opsiyonel)</label>
          <input
            className="w-full border rounded-lg px-3 py-1.5 text-sm bg-white"
            value={form.description}
            onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
            placeholder="Opsiyonel not…"
          />
        </div>
      </div>

      {error && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
      )}

      <div className="flex gap-2 pt-1">
        <button
          onClick={handleSave}
          disabled={saving}
          className="text-xs bg-violet-600 text-white px-4 py-1.5 rounded-lg hover:bg-violet-700 disabled:opacity-50 transition-colors"
        >
          {saving ? 'Kaydediliyor…' : 'Kaydet'}
        </button>
        <button
          onClick={onCancel}
          className="text-xs text-gray-600 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors"
        >
          İptal
        </button>
      </div>
    </div>
  )
}

// ── Main CommitmentsTab ────────────────────────────────────────────────────────

export default function CommitmentsTab() {
  const [ledger, setLedger]         = useState<CommitmentsLedger | null>(null)
  const [loading, setLoading]       = useState(true)
  const [showAddForm, setShowAddForm] = useState(false)
  const today = todayStr()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/governance/commitments?horizon=365')
      if (res.ok) {
        const data = await res.json() as CommitmentsLedger
        setLedger(data)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function handleFulfil(id: string) {
    await fetch(`/api/governance/commitments/${id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ status: 'fulfilled' }),
    })
    load()
  }

  async function handleCancel(id: string) {
    await fetch(`/api/governance/commitments/${id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ status: 'cancelled' }),
    })
    load()
  }

  if (loading) {
    return <div className="py-12 text-center text-sm text-gray-500">Yükleniyor…</div>
  }

  if (!ledger) {
    return (
      <div className="py-12 text-center text-sm text-gray-400">
        Taahhüt defteri yüklenemedi.
      </div>
    )
  }

  const totalByMonth = Object.values(ledger.by_month).reduce(
    (s, v) => s + v.total_try, 0,
  )

  const overdue  = ledger.obligations.filter(o => o.status === 'overdue')
  const dueSoon  = ledger.obligations.filter(o => o.status === 'due_soon')
  const upcoming = ledger.obligations.filter(o => o.status === 'upcoming')

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Taahhüt ve Yükümlülük Defteri</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Bilinen tüm ileriye dönük finansal yükümlülükler — otomatik hesaplanan ve beyan edilen
          </p>
        </div>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="text-xs bg-violet-600 text-white px-3 py-1.5 rounded-lg hover:bg-violet-700 transition-colors"
        >
          + Taahhüt Ekle
        </button>
      </div>

      {/* Add form */}
      {showAddForm && (
        <AddCommitmentForm
          onSaved={() => { setShowAddForm(false); load() }}
          onCancel={() => setShowAddForm(false)}
        />
      )}

      {/* ── 1. KPI summary strip ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard
          label="Bilinen Toplam Yükümlülük"
          value={`₺${fmtTRY(ledger.total_known_try)}`}
          sub="Tutarı bilinen tüm yükümlülükler"
        />
        <KpiCard
          label="Gecikmiş"
          value={String(ledger.overdue_count)}
          sub="Vadesi geçmiş"
          color={ledger.overdue_count > 0 ? 'red' : 'default'}
        />
        <KpiCard
          label="Yaklaşan (14 gün)"
          value={String(ledger.due_soon_count)}
          sub="14 gün içinde vadesi dolacak"
          color={ledger.due_soon_count > 0 ? 'amber' : 'default'}
        />
        <KpiCard
          label="12 Aylık Öngörü"
          value={`₺${fmtTRY(totalByMonth)}`}
          sub="Önümüzdeki 12 ay toplam"
        />
      </div>

      {/* ── 2. Monthly outlook table ─────────────────────────────────────────── */}
      <MonthlyOutlookTable byMonth={ledger.by_month} />

      {/* ── 3. Obligation list ───────────────────────────────────────────────── */}
      <div>
        <h3 className="text-sm font-semibold text-gray-800 mb-3">
          Tüm Yükümlülükler
          <span className="ml-2 text-xs font-normal text-gray-400">({ledger.obligations.length} adet)</span>
        </h3>

        {ledger.obligations.length === 0 && (
          <div className="py-10 text-center text-sm text-gray-400">
            Önümüzdeki 12 ay için kayıtlı yükümlülük yok.
          </div>
        )}

        <div className="space-y-4">
          {/* Overdue group */}
          {overdue.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-red-600 uppercase tracking-wider mb-2">
                Gecikmiş — {overdue.length}
              </p>
              <div className="space-y-2">
                {overdue.map(o => (
                  <ObligationRow
                    key={o.id}
                    obligation={o}
                    today={today}
                    onFulfil={handleFulfil}
                    onCancel={handleCancel}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Due soon group */}
          {dueSoon.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-amber-600 uppercase tracking-wider mb-2">
                14 Günde Vadesi Dolacak — {dueSoon.length}
              </p>
              <div className="space-y-2">
                {dueSoon.map(o => (
                  <ObligationRow
                    key={o.id}
                    obligation={o}
                    today={today}
                    onFulfil={handleFulfil}
                    onCancel={handleCancel}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Upcoming group */}
          {upcoming.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                Planlı — {upcoming.length}
              </p>
              <div className="space-y-2">
                {upcoming.map(o => (
                  <ObligationRow
                    key={o.id}
                    obligation={o}
                    today={today}
                    onFulfil={handleFulfil}
                    onCancel={handleCancel}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Footer note */}
      <p className="text-xs text-gray-400 bg-gray-50 rounded-lg px-3 py-2">
        Otomatik hesaplanan yükümlülükler Flowra veritabanındaki mevcut verilerden türetilmiştir. Beyan edilen taahhütler manuel olarak girilmiştir. Resmi finansal yükümlülükler için mali müşavirinizle doğrulayın.
      </p>
    </div>
  )
}
