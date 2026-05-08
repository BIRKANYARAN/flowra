'use client'

import { useCallback, useEffect, useState } from 'react'
import { useSupabase } from '@/lib/hooks/useSupabase'
import { fmtDate, fmtMoney, PageHeader, ErrorBanner, EmptyState, Label } from '@/components/ui'
import { FlowraButton } from '@/components/ui-kit/FlowraButton'
import { FlowraCard }   from '@/components/ui-kit/FlowraCard'
import { FlowraInput }  from '@/components/ui-kit/FlowraInput'
import { CURRENCIES_EXTENDED, EXPENSE_CATEGORIES, type Expense } from '@/types'

// DS-aligned tokens — primary instead of indigo
const IL  = 'w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-primary-400 transition-colors bg-white'
const LAB = 'block text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1.5'

const CATEGORY_LABELS: Record<string, string> = {
  general:      'Genel',
  rent:         'Kira',
  salary:       'Maaş',
  utilities:    'Faturalar',
  marketing:    'Pazarlama',
  logistics:    'Lojistik',
  software:     'Yazılım',
  equipment:    'Ekipman',
  tax:          'Vergi',
  interest:     'Faiz',
  board_fee:    'Yönetim Ücreti',
  principal:    'Anapara',
  dividend:     'Kâr Payı',
  partner_loan: 'Ortak Finansmanı',
  other:        'Diğer',
}

const FREQUENCY_LABELS: Record<string, string> = {
  monthly: 'Aylık', quarterly: '3 Ayda Bir', yearly: 'Yıllık',
}

function sym(c: string) { return c === 'USD' ? '$' : c === 'EUR' ? '€' : c === 'GBP' ? '£' : '₺' }

interface RecurringRow {
  id:          string
  description: string
  amount:      number
  currency:    string
  category:    string
  frequency:   string
  start_date:  string
  end_date:    string | null
  kdv:         number
  is_active:   boolean
}

export default function ExpensesPage() {
  const supabase = useSupabase()

  const [list,    setList]    = useState<Expense[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')

  const [recurring,      setRecurring]      = useState<RecurringRow[]>([])
  const [recurringError, setRecurringError] = useState('')

  const [partners, setPartners] = useState<{ id: string; name: string }[]>([])

  const [saving,   setSaving]   = useState(false)
  const [formErr,  setFormErr]  = useState('')
  const [showForm, setShowForm] = useState(false)

  const today = new Date().toISOString().slice(0, 10)

  const [form, setForm] = useState({
    description:  '',
    amount:       '',
    currency:     'TRY',
    category:     'general',
    expense_date: today,
    kdv:          '0',
    partner_id:   '',
    is_recurring: false,
    frequency:    'monthly',
    start_date:   today,
    end_date:     '',
  })

  const totalTRY = list.reduce((s, e) => s + Number(e.amount_try), 0)

  // ── Load ─────────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('expenses')
      .select('*')
      .is('deleted_at', null)
      .order('expense_date', { ascending: false })
      .order('created_at',   { ascending: false })
      .limit(100)
    if (err) { setError('Giderler yüklenemedi. Lütfen sayfayı yenileyin.'); setLoading(false); return }
    setList((data ?? []) as Expense[])

    try {
      const res = await fetch('/api/recurring-expenses')
      if (res.ok) {
        const data = await res.json()
        setRecurring(Array.isArray(data) ? data : [])
      }
      else setRecurringError('Tekrarlayan giderler yüklenemedi')
    } catch { setRecurringError('Tekrarlayan giderler yüklenemedi') }

    setLoading(false)
  }, [supabase])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (form.category !== 'partner_loan' || partners.length > 0) return
    fetch('/api/partners')
      .then(r => r.ok ? r.json() : [])
      .then((data: { id: string; name: string }[]) => setPartners(data ?? []))
      .catch(() => { /* non-fatal */ })
  }, [form.category, partners.length])

  // ── Form helpers ──────────────────────────────────────────────────────────────
  function openForm() {
    setForm({
      description:  '',
      amount:       '',
      currency:     'TRY',
      category:     'general',
      expense_date: today,
      kdv:          '0',
      partner_id:   '',
      is_recurring: false,
      frequency:    'monthly',
      start_date:   today,
      end_date:     '',
    })
    setFormErr('')
    setShowForm(true)
  }

  function closeForm() { setShowForm(false); setFormErr('') }

  // ── Save ──────────────────────────────────────────────────────────────────────
  async function save() {
    if (!form.description.trim()) { setFormErr('Açıklama zorunludur.'); return }
    const amt = parseFloat(form.amount)
    if (!isFinite(amt) || amt <= 0) { setFormErr('Geçerli bir tutar girin.'); return }
    const kdv = Math.min(100, Math.max(0, parseFloat(form.kdv) || 0))

    setSaving(true); setFormErr('')

    if (form.is_recurring) {
      if (!form.start_date) { setFormErr('Başlangıç tarihi zorunludur.'); setSaving(false); return }
      const res = await fetch('/api/recurring-expenses', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          description: form.description.trim(),
          amount:      amt,
          currency:    form.currency,
          category:    form.category,
          frequency:   form.frequency,
          start_date:  form.start_date,
          end_date:    form.end_date || null,
          kdv,
        }),
      })
      const json = await res.json()
      if (!res.ok) { setFormErr(json.error ?? 'Kayıt hatası'); setSaving(false); return }
    } else {
      const res = await fetch('/api/expenses', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          description:  form.description.trim(),
          amount:       amt,
          currency:     form.currency,
          category:     form.category,
          expense_date: form.expense_date,
          kdv,
          ...(form.category === 'partner_loan' && form.partner_id
            ? { partner_id: form.partner_id }
            : {}),
        }),
      })
      const json = await res.json()
      if (!res.ok) { setFormErr(json.error ?? 'Kayıt hatası'); setSaving(false); return }
    }

    closeForm(); setSaving(false); load()
  }

  // ── Delete helpers ────────────────────────────────────────────────────────────
  async function del(id: string) {
    if (!confirm('Bu gideri silmek istediğinizden emin misiniz?')) return
    await fetch(`/api/expenses?id=${id}`, { method: 'DELETE' })
    load()
  }

  async function delRecurring(id: string) {
    if (!confirm('Bu tekrarlayan gideri durdurmak istediğinizden emin misiniz?')) return
    await fetch(`/api/recurring-expenses?id=${id}`, { method: 'DELETE' })
    load()
  }

  // ── Render ────────────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="flex items-center justify-center h-40">
      <div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader
        title="Giderler"
        sub={`${list.length} tek seferlik · ${recurring.length} tekrarlayan`}
        action={!showForm
          ? <FlowraButton variant="primary" size="sm" onClick={openForm}>+ Gider Ekle</FlowraButton>
          : undefined}
      />

      {error && <ErrorBanner msg={error} />}

      {/* ── Summary strip ─────────────────────────────────────────────────────── */}
      {(list.length > 0 || recurring.length > 0) && (
        <div className="grid grid-cols-3 gap-4">
          <FlowraCard>
            <Label className="mb-1">Toplam Gider (TRY)</Label>
            <div className="text-2xl font-black text-red-600 tabular-nums mt-1">
              {fmtMoney(totalTRY)}
            </div>
          </FlowraCard>
          <FlowraCard>
            <Label className="mb-1">Tek Seferlik</Label>
            <div className="text-2xl font-black tabular-nums mt-1">{list.length}</div>
          </FlowraCard>
          <FlowraCard>
            <Label className="mb-1">Tekrarlayan Şablon</Label>
            <div className="text-2xl font-black tabular-nums mt-1">{recurring.length}</div>
          </FlowraCard>
        </div>
      )}

      {/* ── Add form ──────────────────────────────────────────────────────────── */}
      {showForm && (
        <FlowraCard>
          <h3 className="font-bold text-sm border-b border-gray-100 pb-3 mb-4">Yeni Gider</h3>

          <div className="space-y-4">
            {/* Description */}
            <FlowraInput
              label="Açıklama *"
              autoFocus
              placeholder="Ofis kirası, fatura..."
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            />

            {/* Amount + currency + KDV */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={LAB}>Tutar *</label>
                <div className="flex gap-2">
                  <input
                    type="number" min="0.01" step="0.01"
                    className={IL}
                    placeholder="1500.00"
                    value={form.amount}
                    onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                  />
                  <select
                    className="border border-gray-200 rounded-xl px-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400 bg-white transition-colors"
                    value={form.currency}
                    onChange={e => setForm(f => ({ ...f, currency: e.target.value }))}
                  >
                    {CURRENCIES_EXTENDED.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className={LAB}>KDV (%)</label>
                <select
                  className={IL}
                  value={form.kdv}
                  onChange={e => setForm(f => ({ ...f, kdv: e.target.value }))}
                >
                  {['0','1','8','10','18','20'].map(v => (
                    <option key={v} value={v}>%{v}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Category */}
            <div>
              <label className={LAB}>Kategori</label>
              <select
                className={IL}
                value={form.category}
                onChange={e => setForm(f => ({ ...f, category: e.target.value, partner_id: '' }))}
              >
                {EXPENSE_CATEGORIES.map(c => (
                  <option key={c} value={c}>{CATEGORY_LABELS[c] ?? c}</option>
                ))}
              </select>
            </div>

            {/* Partner selector — only for partner_loan */}
            {form.category === 'partner_loan' && !form.is_recurring && (
              <div>
                <label className={LAB}>Ortak (opsiyonel)</label>
                <select
                  className={IL}
                  value={form.partner_id}
                  onChange={e => setForm(f => ({ ...f, partner_id: e.target.value }))}
                >
                  <option value="">— Ortak seçin (opsiyonel) —</option>
                  {partners.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                {partners.length === 0 && (
                  <p className="text-xs text-gray-400 mt-1">
                    Yükleniyor... Ortak sistemi aktif değilse boş bırakabilirsiniz.
                  </p>
                )}
              </div>
            )}

            {/* Recurring toggle */}
            <label className="flex items-center gap-3 cursor-pointer select-none">
              <div
                onClick={() => setForm(f => ({ ...f, is_recurring: !f.is_recurring }))}
                className={`relative w-10 h-5 rounded-full transition-colors ${
                  form.is_recurring ? 'bg-primary-600' : 'bg-gray-200'
                }`}
              >
                <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                  form.is_recurring ? 'translate-x-5' : 'translate-x-0.5'
                }`} />
              </div>
              <span className="text-sm font-medium text-gray-700">Tekrarlayan gider</span>
            </label>

            {/* Date field(s) */}
            {form.is_recurring ? (
              <div className="grid grid-cols-3 gap-4 pl-3 border-l-2 border-primary-200">
                <div>
                  <label className={LAB}>Sıklık</label>
                  <select
                    className={IL}
                    value={form.frequency}
                    onChange={e => setForm(f => ({ ...f, frequency: e.target.value }))}
                  >
                    <option value="monthly">Aylık</option>
                    <option value="quarterly">3 Ayda Bir</option>
                    <option value="yearly">Yıllık</option>
                  </select>
                </div>
                <FlowraInput
                  label="Başlangıç *"
                  type="date"
                  value={form.start_date}
                  onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))}
                />
                <FlowraInput
                  label="Bitiş (opsiyonel)"
                  type="date"
                  value={form.end_date}
                  min={form.start_date}
                  onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))}
                />
              </div>
            ) : (
              <FlowraInput
                label="Tarih"
                type="date"
                value={form.expense_date}
                onChange={e => setForm(f => ({ ...f, expense_date: e.target.value }))}
              />
            )}

            {formErr && <ErrorBanner msg={formErr} />}

            <div className="flex gap-2 pt-1">
              <FlowraButton
                variant="primary"
                onClick={save}
                loading={saving}
                disabled={saving}
              >
                {saving ? 'Kaydediliyor...' : 'Kaydet'}
              </FlowraButton>
              <FlowraButton variant="secondary" onClick={closeForm}>İptal</FlowraButton>
            </div>
          </div>
        </FlowraCard>
      )}

      {/* ── Lists ─────────────────────────────────────────────────────────────── */}
      {list.length === 0 && recurring.length === 0 ? (
        <EmptyState
          icon="💸"
          title="Henüz gider eklenmedi"
          sub="Gider eklemek için butona tıklayın."
          action={
            <FlowraButton variant="primary" onClick={openForm}>+ Gider Ekle</FlowraButton>
          }
        />
      ) : (
        <>
          {/* ── One-off expenses ──────────────────────────────────────────────── */}
          {list.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              {/* Header row */}
              <div className="grid grid-cols-12 text-[10px] font-bold text-gray-400 uppercase tracking-widest px-5 py-3 border-b border-gray-100">
                <div className="col-span-4">Açıklama</div>
                <div className="col-span-2">Kategori</div>
                <div className="col-span-2">Tarih</div>
                <div className="col-span-1 text-right">KDV</div>
                <div className="col-span-1 text-right">Tutar</div>
                <div className="col-span-2 text-right">TRY</div>
              </div>

              <div className="divide-y divide-gray-50">
                {list.map(e => (
                  <div
                    key={e.id}
                    className="grid grid-cols-12 items-center px-5 py-3.5 hover:bg-gray-50/60 transition-colors group"
                  >
                    <div className="col-span-4 min-w-0">
                      <div className="text-sm font-medium text-gray-800 truncate">{e.description}</div>
                    </div>
                    <div className="col-span-2">
                      <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-lg">
                        {CATEGORY_LABELS[e.category] ?? e.category}
                      </span>
                    </div>
                    <div className="col-span-2 text-sm text-gray-500">{fmtDate(e.expense_date)}</div>
                    <div className="col-span-1 text-right text-xs text-gray-400">
                      {Number((e as Expense & { kdv?: number }).kdv ?? 0) > 0
                        ? `%${Number((e as Expense & { kdv?: number }).kdv)}`
                        : '—'}
                    </div>
                    <div className="col-span-1 text-right text-sm tabular-nums text-gray-700">
                      {sym(e.currency)}{Number(e.amount).toFixed(2)}
                      {e.currency !== 'TRY' && (
                        <div className="text-xs text-gray-400">kur: {Number(e.fx_rate).toFixed(4)}</div>
                      )}
                    </div>
                    <div className="col-span-2 text-right flex items-center justify-end gap-2">
                      <span className="text-sm font-bold tabular-nums text-red-600">
                        {fmtMoney(Number(e.amount_try))}
                      </span>
                      <button
                        onClick={() => del(e.id)}
                        className="opacity-0 group-hover:opacity-100 text-xs text-gray-400 hover:text-red-500 px-1.5 py-1 rounded-lg hover:bg-red-50 transition-all"
                      >
                        Sil
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Recurring expense templates ──────────────────────────────────── */}
          {recurring.length > 0 && (
            <div>
              <Label className="mb-3">Tekrarlayan Giderler ({recurring.length})</Label>

              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                <div className="grid grid-cols-12 text-[10px] font-bold text-gray-400 uppercase tracking-widest px-5 py-3 border-b border-gray-100">
                  <div className="col-span-4">Açıklama</div>
                  <div className="col-span-2">Kategori</div>
                  <div className="col-span-2">Sıklık</div>
                  <div className="col-span-1 text-right">KDV</div>
                  <div className="col-span-2 text-right">Tutar</div>
                  <div className="col-span-1 text-right" />
                </div>

                <div className="divide-y divide-gray-50">
                  {recurring.map(r => (
                    <div
                      key={r.id}
                      className="grid grid-cols-12 items-center px-5 py-3.5 hover:bg-gray-50/60 transition-colors group"
                    >
                      <div className="col-span-4 min-w-0">
                        <div className="text-sm font-medium text-gray-800 truncate">{r.description}</div>
                        <div className="text-xs text-gray-400 mt-0.5">
                          {fmtDate(r.start_date)}{r.end_date ? ` → ${fmtDate(r.end_date)}` : ' → süresiz'}
                        </div>
                      </div>
                      <div className="col-span-2">
                        <span className="text-xs bg-primary-50 text-primary-600 px-2 py-0.5 rounded-lg">
                          {CATEGORY_LABELS[r.category] ?? r.category}
                        </span>
                      </div>
                      <div className="col-span-2">
                        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-lg">
                          {FREQUENCY_LABELS[r.frequency] ?? r.frequency}
                        </span>
                      </div>
                      <div className="col-span-1 text-right text-xs text-gray-400">
                        {Number(r.kdv) > 0 ? `%${r.kdv}` : '—'}
                      </div>
                      <div className="col-span-2 text-right text-sm font-bold tabular-nums text-red-600">
                        {sym(r.currency)}{Number(r.amount).toFixed(2)}
                      </div>
                      <div className="col-span-1 text-right">
                        <button
                          onClick={() => delRecurring(r.id)}
                          className="opacity-0 group-hover:opacity-100 text-xs text-gray-400 hover:text-red-500 px-1.5 py-1 rounded-lg hover:bg-red-50 transition-all"
                        >
                          Durdur
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {recurringError && <p className="text-xs text-red-500 mt-2">{recurringError}</p>}
            </div>
          )}
        </>
      )}
    </div>
  )
}
