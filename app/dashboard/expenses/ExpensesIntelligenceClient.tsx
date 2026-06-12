'use client'

// ── ExpensesIntelligenceClient — Sprint 4 wrapper ─────────────────────────────
// Adds:
//   • Approval queue with inline approve/reject buttons
//   • Slide-over panel for "Masraf Ekle" instead of inline card
//   • Delegates list rendering to the existing ExpensesClient logic (composition)

import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { fmtDate, fmtMoney, ErrorBanner, EmptyState, Label } from '@/components/ui'
import { fmtTRY } from '@/lib/format'
import { FlowraButton } from '@/components/ui-kit/FlowraButton'
import { FlowraInput }  from '@/components/ui-kit/FlowraInput'
import { CURRENCIES_EXTENDED, EXPENSE_CATEGORIES, type Expense } from '@/types'
import { CATEGORY_LABELS, type RecurringRow } from '@/app/dashboard/expenses/ExpensesClient'

const IL  = 'w-full border border-[#e8eaef] rounded px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition-colors bg-white'
const LAB = 'block text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8] mb-1.5'

const FREQUENCY_LABELS: Record<string, string> = {
  monthly: 'Aylık', quarterly: '3 Ayda Bir', yearly: 'Yıllık',
}

type ExpenseRow = Expense & { kdv?: number; title?: string }

interface ApprovalItem {
  id: string
  title: string
  amount_try: number
  category: string
  expense_date: string
  workflow_instance: string | null
}

interface Props {
  initialExpenses:  ExpenseRow[]
  initialRecurring: RecurringRow[]
  initialPartners:  { id: string; name: string }[]
  approvalQueue:    ApprovalItem[]
}

// ── Slide-over Add Form ───────────────────────────────────────────────────────

interface AddFormProps {
  onClose: () => void
  onSaved: () => void
  partners: { id: string; name: string }[]
}

const fmtTRYLocal = (n: number) => fmtTRY(n, 0)

function AddExpenseSlideOver({ onClose, onSaved, partners: initialPartners }: AddFormProps) {
  const today = new Date().toISOString().slice(0, 10)
  const [partners, setPartners] = useState(initialPartners)
  const [saving,   setSaving]   = useState(false)
  const [formErr,  setFormErr]  = useState('')
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

  // Lazy-load partners when partner_loan selected
  useEffect(() => {
    if (form.category !== 'partner_loan' || partners.length > 0) return
    const ctrl = new AbortController()
    fetch('/api/partners', { signal: ctrl.signal })
      .then(r => r.ok ? r.json() : [])
      .then((data: { id: string; name: string }[]) => setPartners(data ?? []))
      .catch(() => {})
    return () => ctrl.abort()
  }, [form.category, partners.length])

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
      if (!res.ok) { setFormErr((json as { error?: string }).error ?? 'Kayıt hatası'); setSaving(false); return }
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
      if (!res.ok) { setFormErr((json as { error?: string }).error ?? 'Kayıt hatası'); setSaving(false); return }
    }

    setSaving(false)
    onSaved()
    onClose()
  }

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />
      {/* Panel */}
      <div className="fixed right-0 top-0 h-full w-full max-w-md bg-white shadow-2xl z-50 flex flex-col overflow-hidden">
        <div className="px-5 py-4 border-b border-[#e8eaef] flex items-center justify-between">
          <h2 className="text-sm font-bold text-[#0f172a]">Yeni Gider Ekle</h2>
          <button onClick={onClose} className="text-[#94a3b8] hover:text-[#334155] text-lg leading-none p-1">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
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
                  className="border border-[#e8eaef] rounded px-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 bg-white transition-colors"
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
            </div>
          )}

          <label className="flex items-center gap-3 cursor-pointer select-none">
            <div
              onClick={() => setForm(f => ({ ...f, is_recurring: !f.is_recurring }))}
              className={`relative w-10 h-5 rounded-full transition-colors ${form.is_recurring ? 'bg-brand-light' : 'bg-[#e2e8f0]'}`}
            >
              <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${form.is_recurring ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </div>
            <span className="text-sm font-medium text-[#334155]">Tekrarlayan gider</span>
          </label>

          {form.is_recurring ? (
            <div className="grid grid-cols-3 gap-4 pl-3 border-l-2 border-[#e8eaef]">
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
        </div>
        <div className="px-5 py-4 border-t border-[#e8eaef] flex gap-2">
          <FlowraButton variant="primary" onClick={save} loading={saving} disabled={saving}>
            {saving ? 'Kaydediliyor...' : 'Kaydet'}
          </FlowraButton>
          <FlowraButton variant="secondary" onClick={onClose}>İptal</FlowraButton>
        </div>
      </div>
    </>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function ExpensesIntelligenceClient({
  initialExpenses,
  initialRecurring,
  initialPartners,
  approvalQueue: initialApprovalQueue,
}: Props) {
  const [list,          setList]          = useState(initialExpenses)
  const [recurring,     setRecurring]     = useState(initialRecurring)
  const [partners]                        = useState(initialPartners)
  const [loading,       setLoading]       = useState(false)
  const [error,         setError]         = useState('')
  const [recurringError,setRecurringError]= useState('')
  const [deleting,      setDeleting]      = useState<string | null>(null)
  const [confirmExpId,  setConfirmExpId]  = useState<string | null>(null)
  const [confirmRecId,  setConfirmRecId]  = useState<string | null>(null)
  const [showAddSlider, setShowAddSlider] = useState(false)

  // Task-first: open the add-expense slide-over immediately when reached via "+ Yeni" (?new=1)
  const searchParams = useSearchParams()
  useEffect(() => { if (searchParams.get('new') === '1') setShowAddSlider(true) }, [searchParams])

  const [approvalQueue, setApprovalQueue] = useState(initialApprovalQueue)
  const [approvingId,   setApprovingId]   = useState<string | null>(null)
  const [approvalError, setApprovalError] = useState('')

  // ── Refresh ────────────────────────────────────────────────────────────────
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

  // ── Approval actions ───────────────────────────────────────────────────────
  async function resolveWorkflow(item: ApprovalItem, decision: 'approved' | 'rejected') {
    if (!item.workflow_instance) return
    setApprovingId(item.id)
    setApprovalError('')
    try {
      const res = await fetch(`/api/workflow/${item.workflow_instance}/resolve`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ decision }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error((d as { error?: string }).error ?? 'İşlem başarısız')
      }
      setApprovalQueue(prev => prev.filter(q => q.id !== item.id))
      await refresh()
    } catch (e) {
      setApprovalError(e instanceof Error ? e.message : 'Hata oluştu')
    } finally {
      setApprovingId(null)
    }
  }

  // ── Delete ─────────────────────────────────────────────────────────────────
  async function del(id: string) {
    if (deleting) return
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
      {/* ── Section header ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-[#0f172a]">Gider Kayıtları</h2>
          <p className="text-xs text-[#94a3b8] mt-0.5">
            {list.length} tek seferlik · {recurring.length} tekrarlayan
            {totalTRY > 0 && <span className="ml-2 text-neg font-semibold">· {fmtMoney(totalTRY)} toplam</span>}
          </p>
        </div>
        <FlowraButton variant="primary" size="sm" onClick={() => setShowAddSlider(true)}>+ Masraf Ekle</FlowraButton>
      </div>

      {error && <ErrorBanner msg={error} />}

      {/* ── Approval Queue ──────────────────────────────────────────────────────── */}
      {approvalQueue.length > 0 && (
        <div className="bg-warn-light border border-warn/30 rounded overflow-hidden">
          <div className="px-4 py-3 border-b border-warn/20">
            <div className="text-[0.65rem] font-bold uppercase tracking-wider text-warn-text">
              Onay Bekleyen Masraflar — {approvalQueue.length} kalem
            </div>
          </div>
          {approvalError && (
            <div className="px-4 py-2 text-xs text-neg-text bg-neg-light">{approvalError}</div>
          )}
          <div className="divide-y divide-warn/10">
            {approvalQueue.map(item => (
              <div key={item.id} className="flex items-center gap-3 px-4 py-3 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold text-[#0f172a] truncate">{item.title}</div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-[10px] bg-warn-light text-warn-text px-1.5 py-0.5 rounded">
                      {CATEGORY_LABELS[item.category] ?? item.category}
                    </span>
                    <span className="text-[10px] text-[#94a3b8]">{item.expense_date}</span>
                  </div>
                </div>
                <div className="text-xs font-extrabold tabular-nums text-warn-text shrink-0">
                  {fmtTRYLocal(item.amount_try)}
                </div>
                {item.workflow_instance && (
                  <div className="flex gap-2 shrink-0">
                    <button
                      disabled={approvingId === item.id}
                      onClick={() => resolveWorkflow(item, 'approved')}
                      className="px-3 py-1.5 rounded text-[11px] font-bold bg-pos-light text-pos-text border border-pos-light hover:brightness-95 disabled:opacity-50"
                    >
                      {approvingId === item.id ? '…' : 'Onayla'}
                    </button>
                    <button
                      disabled={approvingId === item.id}
                      onClick={() => resolveWorkflow(item, 'rejected')}
                      className="px-3 py-1.5 rounded text-[11px] font-bold bg-neg-light text-neg border border-neg-light hover:brightness-95 disabled:opacity-50"
                    >
                      Reddet
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Lists ───────────────────────────────────────────────────────────────── */}
      {list.length === 0 && recurring.length === 0 ? (
        <EmptyState
          icon="💸"
          title="Henüz gider eklenmedi"
          sub="İlk giderini ekle; kategori dağılımı, aylık yakım hızı ve nakit etkisi otomatik hesaplansın."
          action={<FlowraButton variant="primary" onClick={() => setShowAddSlider(true)}>+ Masraf Ekle</FlowraButton>}
        />
      ) : (
        <>
          {/* One-off expenses */}
          {list.length > 0 && (
            <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft overflow-hidden">
              <div className="grid grid-cols-12 text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8] px-5 py-3 border-b border-[#e8eaef]">
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
                    className={`grid grid-cols-12 items-center px-5 py-3.5 hover:bg-[#f8fafc]/60 transition-colors group ${e.payment_status === 'pending' ? 'bg-warn-light/10' : ''}`}>
                    <div className="col-span-4 min-w-0">
                      <div className="text-sm font-medium text-[#1e293b] truncate">{e.description}</div>
                      {e.payment_status === 'pending' && (
                        <span className="text-[9px] bg-warn-light text-warn-text px-1.5 py-0.5 rounded font-semibold">ONAY BEKLİYOR</span>
                      )}
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
                      {fmtMoney(Number(e.amount), e.currency)}
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

          {/* Recurring expense templates */}
          {recurring.length > 0 && (
            <div>
              <Label className="mb-3">Tekrarlayan Giderler ({recurring.length})</Label>
              <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft overflow-hidden">
                <div className="grid grid-cols-12 text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8] px-5 py-3 border-b border-[#e8eaef]">
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
                        <span className="text-xs bg-brand-subtle text-brand-light px-2 py-0.5 rounded">
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
                        {fmtMoney(Number(r.amount), r.currency)}
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

      {/* ── Add Expense Slide-over ───────────────────────────────────────────────── */}
      {showAddSlider && (
        <AddExpenseSlideOver
          partners={partners}
          onClose={() => setShowAddSlider(false)}
          onSaved={() => refresh()}
        />
      )}

      {loading && (
        <div className="text-xs text-[#94a3b8] text-center py-2 animate-pulse">Yükleniyor…</div>
      )}
    </div>
  )
}
