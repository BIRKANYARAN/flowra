'use client'

// ── ExpensesClient — interactive list + entry form for expenses ────────────────
//
// Receives initialExpenses, initialRecurring, initialPartners from the server
// component so the first render has data immediately (no loading spinner).
//
// Responsibilities:
//   • Add Expense form (one-off + recurring toggle)
//   • Delete buttons on each row (soft-delete via API)
//   • Re-fetch on mutation to stay in sync (server sections refresh on reload)

import { useCallback, useEffect, useState } from 'react'
import { fmtDate, fmtMoney, ErrorBanner, EmptyState, Label } from '@/components/ui'
import { FlowraButton } from '@/components/ui-kit/FlowraButton'
import { FlowraCard }   from '@/components/ui-kit/FlowraCard'
import { FlowraInput }  from '@/components/ui-kit/FlowraInput'
import { CURRENCIES_EXTENDED, EXPENSE_CATEGORIES, type Expense } from '@/types'

const IL  = 'w-full border border-[#e2e8f0] rounded px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-primary-400 transition-colors bg-white'
const LAB = 'block text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-1.5'

export const CATEGORY_LABELS: Record<string, string> = {
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

export interface RecurringRow {
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

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  initialExpenses:  (Expense & { kdv?: number })[]
  initialRecurring: RecurringRow[]
  initialPartners:  { id: string; name: string }[]
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ExpensesClient({
  initialExpenses,
  initialRecurring,
  initialPartners,
}: Props) {
  const [list,              setList]              = useState(initialExpenses)
  const [recurring,         setRecurring]         = useState(initialRecurring)
  const [partners,          setPartners]          = useState(initialPartners)
  const [loading,           setLoading]           = useState(false)
  const [error,             setError]             = useState('')
  const [recurringError,    setRecurringError]    = useState('')
  const [saving,            setSaving]            = useState(false)
  const [deleting,          setDeleting]          = useState<string | null>(null)
  const [formErr,           setFormErr]           = useState('')
  const [showForm,          setShowForm]          = useState(false)
  const [confirmExpId,      setConfirmExpId]      = useState<string | null>(null)
  const [confirmRecId,      setConfirmRecId]      = useState<string | null>(null)

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

  // ── Refresh data after mutations ──────────────────────────────────────────
  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const [expRes, recRes] = await Promise.all([
        fetch('/api/expenses'),
        fetch('/api/recurring-expenses'),
      ])
      if (expRes.ok) {
        const data = await expRes.json()
        setList(Array.isArray(data) ? data : (data?.data ?? []))
      }
      if (recRes.ok) {
        const data = await recRes.json()
        setRecurring(Array.isArray(data) ? data : [])
      } else {
        setRecurringError('Tekrarlayan giderler yüklenemedi')
      }
    } catch {
      setError('Veriler yenilenemedi.')
    } finally {
      setLoading(false)
    }
  }, [])

  // ── Lazy-load partners when partner_loan category selected ────────────────
  useEffect(() => {
    if (form.category !== 'partner_loan' || partners.length > 0) return
    const controller = new AbortController()
    fetch('/api/partners', { signal: controller.signal })
      .then(r => r.ok ? r.json() : [])
      .then((data: { id: string; name: string }[]) => setPartners(data ?? []))
      .catch(() => { /* non-fatal — includes AbortError */ })
    return () => controller.abort()
  }, [form.category, partners.length])

  // ── Form helpers ──────────────────────────────────────────────────────────
  function openForm() {
    setForm({
      description: '', amount: '', currency: 'TRY', category: 'general',
      expense_date: today, kdv: '0', partner_id: '',
      is_recurring: false, frequency: 'monthly', start_date: today, end_date: '',
    })
    setFormErr('')
    setShowForm(true)
  }

  function closeForm() { setShowForm(false); setFormErr('') }

  // ── Save ──────────────────────────────────────────────────────────────────
  async function save() {
    if (!form.description.trim()) { setFormErr('Açıklama zorunludur.'); return }
    const amt = parseFloat(form.amount)
    if (!isFinite(amt) || amt <= 0) { setFormErr('Geçerli bir tutar girin.'); return }
    const kdv = Math.min(100, Math.max(0, parseFloat(form.kdv) || 0))

    setSaving(true); setFormErr('')

    if (form.is_recurring) {
      if (!form.start_date) { setFormErr('Başlangıç tarihi zorunludur.'); setSaving(false); return }
      const res = await fetch('/api/recurring-expenses', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: form.description.trim(), amount: amt, currency: form.currency,
          category: form.category, frequency: form.frequency,
          start_date: form.start_date, end_date: form.end_date || null, kdv,
        }),
      })
      const json = await res.json()
      if (!res.ok) { setFormErr(json.error ?? 'Kayıt hatası'); setSaving(false); return }
    } else {
      const res = await fetch('/api/expenses', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: form.description.trim(), amount: amt, currency: form.currency,
          category: form.category, expense_date: form.expense_date, kdv,
          ...(form.category === 'partner_loan' && form.partner_id ? { partner_id: form.partner_id } : {}),
        }),
      })
      const json = await res.json()
      if (!res.ok) { setFormErr(json.error ?? 'Kayıt hatası'); setSaving(false); return }
    }

    // Keep saving=true until refresh completes so the button stays disabled
    // and the user can't re-submit while the list is re-fetching.
    try {
      closeForm()
      await refresh()
    } finally {
      setSaving(false)
    }
  }

  // ── Delete ────────────────────────────────────────────────────────────────
  async function del(id: string) {
    if (deleting) return                     // prevent double-click / concurrent deletes
    setDeleting(id)
    setError('')
    try {
      const res = await fetch(`/api/expenses?id=${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const d = await res.json().catch(() => ({})) as Record<string, unknown>
        setError((d.error as string | undefined) ?? 'Silinemedi — lütfen tekrar deneyin.')
        return
      }
      setConfirmExpId(null)
      await refresh()
    } catch {
      setError('Ağ hatası. Lütfen tekrar deneyin.')
    } finally {
      setDeleting(null)
    }
  }

  async function delRecurring(id: string) {
    if (deleting) return
    setDeleting(id)
    setRecurringError('')
    try {
      const res = await fetch(`/api/recurring-expenses?id=${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const d = await res.json().catch(() => ({})) as Record<string, unknown>
        setRecurringError((d.error as string | undefined) ?? 'Silinemedi — lütfen tekrar deneyin.')
        return
      }
      setConfirmRecId(null)
      await refresh()
    } catch {
      setRecurringError('Ağ hatası. Lütfen tekrar deneyin.')
    } finally {
      setDeleting(null)
    }
  }

  const totalTRY = list.reduce((s, e) => s + Number(e.amount_try), 0)

  return (
    <div className="space-y-6">
      {/* ── Section header ───────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-[#0f172a]">Gider Kayıtları</h2>
          <p className="text-xs text-[#94a3b8] mt-0.5">
            {list.length} tek seferlik · {recurring.length} tekrarlayan
            {totalTRY > 0 && <span className="ml-2 text-neg font-semibold">· {fmtMoney(totalTRY)} toplam</span>}
          </p>
        </div>
        {!showForm && (
          <FlowraButton variant="primary" size="sm" onClick={openForm}>+ Gider Ekle</FlowraButton>
        )}
      </div>

      {error && <ErrorBanner msg={error} />}

      {/* ── Add form ─────────────────────────────────────────────────────────── */}
      {showForm && (
        <FlowraCard>
          <h3 className="font-bold text-sm border-b border-[#e2e8f0] pb-3 mb-4">Yeni Gider</h3>
          <div className="space-y-4">

            <FlowraInput
              label="Açıklama *"
              autoFocus
              placeholder="Ofis kirası, fatura..."
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            />

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={LAB}>Tutar *</label>
                <div className="flex gap-2">
                  <input
                    type="number" min="0.01" step="0.01" className={IL}
                    placeholder="1500.00" value={form.amount}
                    onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                  />
                  <select
                    className="border border-[#e2e8f0] rounded px-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400 bg-white transition-colors"
                    value={form.currency}
                    onChange={e => setForm(f => ({ ...f, currency: e.target.value }))}
                  >
                    {CURRENCIES_EXTENDED.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className={LAB}>KDV (%)</label>
                <select className={IL} value={form.kdv}
                  onChange={e => setForm(f => ({ ...f, kdv: e.target.value }))}
                >
                  {['0', '1', '8', '10', '18', '20'].map(v => (
                    <option key={v} value={v}>%{v}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className={LAB}>Kategori</label>
              <select className={IL} value={form.category}
                onChange={e => setForm(f => ({ ...f, category: e.target.value, partner_id: '' }))}
              >
                {EXPENSE_CATEGORIES.map(c => (
                  <option key={c} value={c}>{CATEGORY_LABELS[c] ?? c}</option>
                ))}
              </select>
            </div>

            {form.category === 'partner_loan' && !form.is_recurring && (
              <div>
                <label className={LAB}>Ortak (opsiyonel)</label>
                <select className={IL} value={form.partner_id}
                  onChange={e => setForm(f => ({ ...f, partner_id: e.target.value }))}
                >
                  <option value="">— Ortak seçin (opsiyonel) —</option>
                  {partners.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                {partners.length === 0 && (
                  <p className="text-xs text-[#94a3b8] mt-1">Ortak sistemi aktif değilse boş bırakabilirsiniz.</p>
                )}
              </div>
            )}

            <label className="flex items-center gap-3 cursor-pointer select-none">
              <div
                onClick={() => setForm(f => ({ ...f, is_recurring: !f.is_recurring }))}
                className={`relative w-10 h-5 rounded-full transition-colors ${form.is_recurring ? 'bg-primary-600' : 'bg-[#e2e8f0]'}`}
              >
                <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${form.is_recurring ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </div>
              <span className="text-sm font-medium text-[#334155]">Tekrarlayan gider</span>
            </label>

            {form.is_recurring ? (
              <div className="grid grid-cols-3 gap-4 pl-3 border-l-2 border-primary-200">
                <div>
                  <label className={LAB}>Sıklık</label>
                  <select className={IL} value={form.frequency}
                    onChange={e => setForm(f => ({ ...f, frequency: e.target.value }))}
                  >
                    <option value="monthly">Aylık</option>
                    <option value="quarterly">3 Ayda Bir</option>
                    <option value="yearly">Yıllık</option>
                  </select>
                </div>
                <FlowraInput label="Başlangıç *" type="date" value={form.start_date}
                  onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} />
                <FlowraInput label="Bitiş (opsiyonel)" type="date" value={form.end_date}
                  min={form.start_date}
                  onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} />
              </div>
            ) : (
              <FlowraInput label="Tarih" type="date" value={form.expense_date}
                onChange={e => setForm(f => ({ ...f, expense_date: e.target.value }))} />
            )}

            {formErr && <ErrorBanner msg={formErr} />}

            <div className="flex gap-2 pt-1">
              <FlowraButton variant="primary" onClick={save} loading={saving} disabled={saving}>
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
          action={<FlowraButton variant="primary" onClick={openForm}>+ Gider Ekle</FlowraButton>}
        />
      ) : (
        <>
          {/* ── One-off expenses ──────────────────────────────────────────────── */}
          {list.length > 0 && (
            <div className="bg-white border border-[#e2e8f0] rounded overflow-hidden">
              <div className="grid grid-cols-12 text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] px-5 py-3 border-b border-[#e2e8f0]">
                <div className="col-span-4">Açıklama</div>
                <div className="col-span-2">Kategori</div>
                <div className="col-span-2">Tarih</div>
                <div className="col-span-1 text-right">KDV</div>
                <div className="col-span-1 text-right">Tutar</div>
                <div className="col-span-2 text-right">TRY</div>
              </div>
              <div className="divide-y divide-[#f1f5f9]">
                {list.map(e => (
                  <div key={e.id}
                    className="grid grid-cols-12 items-center px-5 py-3.5 hover:bg-[#f8fafc]/60 transition-colors group">
                    <div className="col-span-4 min-w-0">
                      <div className="text-sm font-medium text-[#1e293b] truncate">{e.description}</div>
                    </div>
                    <div className="col-span-2">
                      <span className="text-xs bg-[#f1f5f9] text-[#64748b] px-2 py-0.5 rounded">
                        {CATEGORY_LABELS[e.category] ?? e.category}
                      </span>
                    </div>
                    <div className="col-span-2 text-sm text-[#64748b]">{fmtDate(e.expense_date)}</div>
                    <div className="col-span-1 text-right text-xs text-[#94a3b8]">
                      {Number(e.kdv ?? 0) > 0 ? `%${Number(e.kdv)}` : '—'}
                    </div>
                    <div className="col-span-1 text-right text-sm tabular-nums text-[#334155]">
                      {sym(e.currency)}{Number(e.amount).toFixed(2)}
                      {e.currency !== 'TRY' && (
                        <div className="text-xs text-[#94a3b8]">kur: {Number(e.fx_rate).toFixed(4)}</div>
                      )}
                    </div>
                    <div className="col-span-2 text-right flex items-center justify-end gap-2">
                      <span className="text-sm font-bold tabular-nums text-neg">
                        {fmtMoney(Number(e.amount_try))}
                      </span>
                      {confirmExpId === e.id ? (
                        <span className="flex items-center gap-1">
                          <button
                            onClick={() => del(e.id)}
                            disabled={deleting === e.id}
                            className="text-xs text-white bg-neg-light hover:bg-neg px-2 py-0.5 rounded transition-colors font-semibold disabled:opacity-50"
                          >
                            {deleting === e.id ? '…' : 'Evet'}
                          </button>
                          <button
                            onClick={() => setConfirmExpId(null)}
                            disabled={deleting === e.id}
                            className="text-xs text-[#94a3b8] px-1.5 py-0.5 rounded hover:bg-[#f1f5f9] transition-colors disabled:opacity-50"
                          >
                            İptal
                          </button>
                        </span>
                      ) : (
                        <button
                          onClick={() => setConfirmExpId(e.id)}
                          className="opacity-0 group-hover:opacity-100 text-xs text-[#94a3b8] hover:text-neg px-1.5 py-1 rounded hover:bg-neg-light transition-all"
                        >
                          Sil
                        </button>
                      )}
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
              <div className="bg-white border border-[#e2e8f0] rounded overflow-hidden">
                <div className="grid grid-cols-12 text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] px-5 py-3 border-b border-[#e2e8f0]">
                  <div className="col-span-4">Açıklama</div>
                  <div className="col-span-2">Kategori</div>
                  <div className="col-span-2">Sıklık</div>
                  <div className="col-span-1 text-right">KDV</div>
                  <div className="col-span-2 text-right">Tutar</div>
                  <div className="col-span-1 text-right" />
                </div>
                <div className="divide-y divide-[#f1f5f9]">
                  {recurring.map(r => (
                    <div key={r.id}
                      className="grid grid-cols-12 items-center px-5 py-3.5 hover:bg-[#f8fafc]/60 transition-colors group">
                      <div className="col-span-4 min-w-0">
                        <div className="text-sm font-medium text-[#1e293b] truncate">{r.description}</div>
                        <div className="text-xs text-[#94a3b8] mt-0.5">
                          {fmtDate(r.start_date)}{r.end_date ? ` → ${fmtDate(r.end_date)}` : ' → süresiz'}
                        </div>
                      </div>
                      <div className="col-span-2">
                        <span className="text-xs bg-primary-50 text-primary-600 px-2 py-0.5 rounded">
                          {CATEGORY_LABELS[r.category] ?? r.category}
                        </span>
                      </div>
                      <div className="col-span-2">
                        <span className="text-xs bg-[#f1f5f9] text-[#64748b] px-2 py-0.5 rounded">
                          {FREQUENCY_LABELS[r.frequency] ?? r.frequency}
                        </span>
                      </div>
                      <div className="col-span-1 text-right text-xs text-[#94a3b8]">
                        {Number(r.kdv) > 0 ? `%${r.kdv}` : '—'}
                      </div>
                      <div className="col-span-2 text-right text-sm font-bold tabular-nums text-neg">
                        {sym(r.currency)}{Number(r.amount).toFixed(2)}
                      </div>
                      <div className="col-span-1 text-right">
                        {confirmRecId === r.id ? (
                          <span className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => delRecurring(r.id)}
                              disabled={deleting === r.id}
                              className="text-xs text-white bg-neg-light hover:bg-neg px-2 py-0.5 rounded transition-colors font-semibold disabled:opacity-50"
                            >
                              {deleting === r.id ? '…' : 'Evet'}
                            </button>
                            <button
                              onClick={() => setConfirmRecId(null)}
                              disabled={deleting === r.id}
                              className="text-xs text-[#94a3b8] px-1.5 py-0.5 rounded hover:bg-[#f1f5f9] transition-colors disabled:opacity-50"
                            >
                              İptal
                            </button>
                          </span>
                        ) : (
                          <button
                            onClick={() => setConfirmRecId(r.id)}
                            className="opacity-0 group-hover:opacity-100 text-xs text-[#94a3b8] hover:text-neg px-1.5 py-1 rounded hover:bg-neg-light transition-all"
                          >
                            Durdur
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              {recurringError && <p className="text-xs text-neg mt-2">{recurringError}</p>}
            </div>
          )}
        </>
      )}
    </div>
  )
}
