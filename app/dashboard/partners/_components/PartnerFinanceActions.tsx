'use client'

// ── PartnerFinanceActions — record capital, repayment, compensation transactions
// Persistently visible collapsible panel in the Partners hub.

import { useState, useCallback, useRef, useEffect } from 'react'
import type { PartnerRow } from './types'

// ── Types ─────────────────────────────────────────────────────────────────────

type TxType = 'loan_repayment' | 'capital_in' | 'board_fee' | 'salary'

interface ActionMeta {
  tx_type: TxType
  label:   string
  desc:    string
}

const ACTIONS: ActionMeta[] = [
  { tx_type: 'loan_repayment', label: 'Geri Ödeme',    desc: 'Şirket ortağa borç geri öder'    },
  { tx_type: 'capital_in',     label: 'Sermaye Yatır', desc: 'Ortak hisse sermayesi katkısı'   },
  { tx_type: 'board_fee',      label: 'Huzur Hakkı',   desc: 'Yönetim kurulu ücreti ödemesi'   },
  { tx_type: 'salary',         label: 'Maaş',          desc: 'Ortak maaş ödemesi kaydı'        },
]

interface FormState {
  partner_id: string
  amount:     string
  tx_date:    string
  notes:      string
}

const EMPTY_FORM: FormState = {
  partner_id: '',
  amount:     '',
  tx_date:    new Date().toISOString().slice(0, 10),
  notes:      '',
}

// ── Props ─────────────────────────────────────────────────────────────────────

export interface PartnerFinanceActionsProps {
  partners:  PartnerRow[]
  onRefresh: () => void
}

// ── Component ─────────────────────────────────────────────────────────────────

export function PartnerFinanceActions({ partners, onRefresh }: PartnerFinanceActionsProps) {
  const [open,     setOpen]     = useState(false)
  const [txType,   setTxType]   = useState<TxType>('loan_repayment')
  const [form,     setForm]     = useState<FormState>(EMPTY_FORM)
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState<string | null>(null)
  const [success,  setSuccess]  = useState<string | null>(null)

  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Clear pending timer on unmount to prevent memory leak / setState-after-unmount
  useEffect(() => {
    return () => {
      if (successTimerRef.current) clearTimeout(successTimerRef.current)
    }
  }, [])

  const activePartners = partners.filter(p => p.is_active)

  function field(key: keyof FormState, value: string) {
    setForm(prev => ({ ...prev, [key]: value }))
    setError(null)
  }

  function resetForm() {
    setForm(EMPTY_FORM)
    setError(null)
  }

  function selectAction(type: TxType) {
    setTxType(type)
    setError(null)
    setSuccess(null)
  }

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(null)

    if (!form.partner_id) {
      setError('Lütfen bir ortak seçin')
      return
    }
    const amount = parseFloat(form.amount.replace(',', '.'))
    if (!amount || amount <= 0) {
      setError('Tutar sıfırdan büyük olmalıdır')
      return
    }
    if (!form.tx_date) {
      setError('Tarih zorunludur')
      return
    }

    setSaving(true)
    try {
      const res = await fetch(`/api/partners/${form.partner_id}/transactions`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          tx_type:  txType,
          amount,
          currency: 'TRY',
          fx_rate:  1,
          tx_date:  form.tx_date,
          notes:    form.notes.trim() || undefined,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError((json as { error?: string }).error ?? `Hata (${res.status})`)
        return
      }
      const actionLabel = ACTIONS.find(a => a.tx_type === txType)?.label ?? txType
      setSuccess(`${actionLabel} başarıyla kaydedildi.`)
      resetForm()
      onRefresh()
      // Auto-hide success after 5s — store ref for cleanup on unmount
      if (successTimerRef.current) clearTimeout(successTimerRef.current)
      successTimerRef.current = setTimeout(() => setSuccess(null), 5000)
    } catch {
      setError('Ağ hatası. Lütfen tekrar deneyin.')
    } finally {
      setSaving(false)
    }
  }, [form, txType, onRefresh])

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="bg-white border border-gray-100 rounded shadow-sm">

      {/* Collapsed header / toggle — disabled while save is in flight */}
      <button
        type="button"
        onClick={() => { if (!saving) { setOpen(prev => !prev); setError(null); setSuccess(null) } }}
        disabled={saving}
        className="w-full flex items-center justify-between px-5 py-4 text-left group disabled:cursor-not-allowed"
      >
        <div className="flex items-center gap-2">
          <div className="text-[10px] font-black uppercase tracking-widest text-gray-400">
            Finansal İşlem Kaydet
          </div>
          {success && (
            <span className="text-[10px] text-emerald-700 font-semibold bg-emerald-50 border border-emerald-200 rounded px-2 py-0.5 ml-2">
              {success}
            </span>
          )}
        </div>
        <span className={`text-gray-400 text-sm transition-transform duration-150 ${open ? 'rotate-180' : ''}`}>
          ▼
        </span>
      </button>

      {/* Expanded form */}
      {open && (
        <div className="border-t border-gray-100 px-5 py-5">

          {/* Action type selector */}
          <div className="mb-5">
            <div className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">
              İşlem Türü
            </div>
            <div className="flex flex-wrap gap-2">
              {ACTIONS.map(action => (
                <button
                  key={action.tx_type}
                  type="button"
                  onClick={() => selectAction(action.tx_type)}
                  className={[
                    'px-3 py-1.5 rounded text-xs font-semibold border transition-colors',
                    txType === action.tx_type
                      ? 'bg-primary-50 text-primary-700 border-primary-200'
                      : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50',
                  ].join(' ')}
                  title={action.desc}
                >
                  {action.label}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-gray-400 mt-1.5">
              {ACTIONS.find(a => a.tx_type === txType)?.desc}
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">

            {/* Partner select */}
            <div>
              <label
                htmlFor="pfa-partner"
                className="text-[10px] font-black uppercase tracking-widest text-gray-400 block mb-1.5 leading-none"
              >
                Ortak <span className="text-red-500">*</span>
              </label>
              <select
                id="pfa-partner"
                value={form.partner_id}
                onChange={e => field('partner_id', e.target.value)}
                className="w-full border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300"
                required
              >
                <option value="">— Ortak seçin —</option>
                {activePartners.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            {/* Amount + date */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="pfa-amount"
                  className="text-[10px] font-black uppercase tracking-widest text-gray-400 block mb-1.5 leading-none"
                >
                  Tutar (₺) <span className="text-red-500">*</span>
                </label>
                <input
                  id="pfa-amount"
                  type="number"
                  min="0.01"
                  step="0.01"
                  placeholder="0.00"
                  value={form.amount}
                  onChange={e => field('amount', e.target.value)}
                  className="w-full border border-gray-200 rounded px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary-300"
                  required
                />
              </div>
              <div>
                <label
                  htmlFor="pfa-date"
                  className="text-[10px] font-black uppercase tracking-widest text-gray-400 block mb-1.5 leading-none"
                >
                  Tarih <span className="text-red-500">*</span>
                </label>
                <input
                  id="pfa-date"
                  type="date"
                  value={form.tx_date}
                  onChange={e => field('tx_date', e.target.value)}
                  className="w-full border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300"
                  required
                />
              </div>
            </div>

            {/* Notes */}
            <div>
              <label
                htmlFor="pfa-notes"
                className="text-[10px] font-black uppercase tracking-widest text-gray-400 block mb-1.5 leading-none"
              >
                Notlar
              </label>
              <textarea
                id="pfa-notes"
                value={form.notes}
                onChange={e => field('notes', e.target.value)}
                rows={2}
                placeholder="İsteğe bağlı açıklama…"
                className="w-full border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300 resize-none"
              />
            </div>

            {/* Error */}
            {error && (
              <p className="text-xs text-red-600 font-semibold bg-red-50 border border-red-200 rounded px-3 py-2">
                {error}
              </p>
            )}

            {/* Actions */}
            <div className="flex items-center gap-2 justify-end pt-1">
              <button
                type="button"
                onClick={() => { resetForm(); setOpen(false) }}
                disabled={saving}
                className="px-4 py-2 rounded border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                İptal
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 rounded bg-primary-600 text-white text-sm font-semibold hover:bg-primary-700 transition-colors disabled:opacity-60"
              >
                {saving ? 'Kaydediliyor…' : 'Kaydet'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
