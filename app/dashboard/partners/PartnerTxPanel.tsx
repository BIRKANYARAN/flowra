'use client'

/**
 * PartnerTxPanel — client island for Sermaye / Borçlar / Huzur Hakkı tabs
 *
 * Renders:
 *   1. Transaction history table (from server-prefetched data)
 *   2. "Yeni Kayıt" toggle form
 *   3. Insert via useSupabase() → router.refresh() after success
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSupabase } from '@/lib/hooks/useSupabase'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TxRow {
  id:         string
  partner_id: string
  partner_name: string
  tx_type:    string
  amount:     number
  currency:   string
  amount_try: number
  tx_date:    string
  notes:      string | null
}

export interface TxTypeOption {
  value: string
  label: string
  tone?: 'positive' | 'negative' | 'neutral'
}

interface Props {
  /** All active partners — for the partner selector */
  partners: { id: string; name: string }[]
  /** Pre-fetched transactions for this tab */
  transactions: TxRow[]
  /** Which tx_types this panel handles */
  txTypes: TxTypeOption[]
  /** Description shown under the panel heading */
  description: string
  /** Empty state message */
  emptyLabel: string
}

// ── Formatting ────────────────────────────────────────────────────────────────

const TRY_FMT = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })

function fmtTry(n: number): string {
  const abs  = Math.abs(Number(n || 0))
  const sign = n < 0 ? '−' : ''
  if (abs >= 1_000_000) return `${sign}₺${(abs / 1_000_000).toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 2 })}M`
  if (abs >= 10_000)    return `${sign}₺${(abs / 1_000).toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}K`
  return `${sign}₺${TRY_FMT.format(abs)}`
}

function fmtDate(d: string): string {
  return new Date(d + 'T00:00:00Z').toLocaleDateString('tr-TR', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
  })
}

// ── TX type tone → color ──────────────────────────────────────────────────────

const TONE_COLOR: Record<string, string> = {
  positive: 'text-emerald-700',
  negative: 'text-red-600',
  neutral:  'text-gray-700',
}

// ── Component ─────────────────────────────────────────────────────────────────

export function PartnerTxPanel({ partners, transactions, txTypes, description, emptyLabel }: Props) {
  const supabase = useSupabase()
  const router   = useRouter()

  // Form state
  const [open,     setOpen]     = useState(false)
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState('')
  const [success,  setSuccess]  = useState('')

  const [partnerId, setPartnerId] = useState(partners[0]?.id ?? '')
  const [txType,    setTxType]    = useState(txTypes[0]?.value ?? '')
  const [amount,    setAmount]    = useState('')
  const [currency,  setCurrency]  = useState('TRY')
  const [txDate,    setTxDate]    = useState(new Date().toISOString().slice(0, 10))
  const [notes,     setNotes]     = useState('')

  function resetForm() {
    setPartnerId(partners[0]?.id ?? '')
    setTxType(txTypes[0]?.value ?? '')
    setAmount('')
    setCurrency('TRY')
    setTxDate(new Date().toISOString().slice(0, 10))
    setNotes('')
    setError('')
    setSuccess('')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const amt = parseFloat(amount.replace(',', '.'))
    if (!partnerId) { setError('Ortak seçiniz.'); return }
    if (!txType)    { setError('İşlem türü seçiniz.'); return }
    if (!amount || isNaN(amt) || amt <= 0) { setError('Geçerli bir tutar giriniz.'); return }

    setSaving(true); setError(''); setSuccess('')

    const { error: insertErr } = await supabase
      .from('partner_transactions')
      .insert({
        partner_id:  partnerId,
        tx_type:     txType,
        amount:      amt,
        currency:    currency,
        fx_rate:     1,          // TRY: 1:1; non-TRY will need real FX (future)
        amount_try:  amt,        // simplified: assume TRY for now
        tx_date:     txDate,
        notes:       notes.trim() || null,
      })

    setSaving(false)

    if (insertErr) {
      setError(insertErr.message)
      return
    }

    setSuccess('Kayıt eklendi ✓')
    resetForm()
    setOpen(false)
    router.refresh()  // re-run server component to reload transaction list
  }

  const totalTry = transactions.reduce((s, t) => s + t.amount_try, 0)

  // ── Render ────────────────────────────────────────────────────────────────

  const IL  = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400 bg-white'
  const LAB = 'block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1'
  const SEL = `${IL} cursor-pointer`

  return (
    <div className="space-y-4">

      {/* ── Header row ───────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs text-gray-400">{description}</p>
          {totalTry > 0 && (
            <p className="text-base font-black text-gray-900 mt-0.5 tabular-nums">
              Toplam: {fmtTry(totalTry)}
            </p>
          )}
        </div>
        {partners.length > 0 && (
          <button
            onClick={() => { setOpen(o => !o); setError(''); setSuccess('') }}
            className="shrink-0 text-xs font-bold px-3 py-1.5 rounded-lg bg-primary-600 text-white hover:bg-primary-700 transition-colors"
          >
            {open ? '✕ Kapat' : '+ Yeni Kayıt'}
          </button>
        )}
      </div>

      {/* ── Success banner ─────────────────────────────────────────────── */}
      {success && (
        <div className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
          {success}
        </div>
      )}

      {/* ── Add form ───────────────────────────────────────────────────── */}
      {open && (
        <form
          onSubmit={handleSubmit}
          className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-3"
        >
          {/* Row 1: partner + type */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LAB}>Ortak</label>
              <select className={SEL} value={partnerId} onChange={e => setPartnerId(e.target.value)}>
                {partners.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={LAB}>İşlem Türü</label>
              <select className={SEL} value={txType} onChange={e => setTxType(e.target.value)}>
                {txTypes.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Row 2: amount + currency + date */}
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className={LAB}>Tutar</label>
              <input
                type="number"
                min="0.01"
                step="0.01"
                placeholder="0,00"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                className={IL}
              />
            </div>
            <div>
              <label className={LAB}>Para Birimi</label>
              <select className={SEL} value={currency} onChange={e => setCurrency(e.target.value)}>
                <option value="TRY">TRY ₺</option>
                <option value="USD">USD $</option>
                <option value="EUR">EUR €</option>
              </select>
            </div>
          </div>

          {/* Row 3: date + notes */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LAB}>Tarih</label>
              <input
                type="date"
                value={txDate}
                onChange={e => setTxDate(e.target.value)}
                className={IL}
              />
            </div>
            <div>
              <label className={LAB}>Not (opsiyonel)</label>
              <input
                type="text"
                placeholder="Açıklama..."
                value={notes}
                onChange={e => setNotes(e.target.value)}
                className={IL}
              />
            </div>
          </div>

          {error && (
            <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          <div className="flex gap-2 justify-end pt-1">
            <button
              type="button"
              onClick={() => { setOpen(false); resetForm() }}
              className="text-xs px-3 py-1.5 rounded-lg text-gray-500 hover:bg-gray-200 transition-colors"
            >
              İptal
            </button>
            <button
              type="submit"
              disabled={saving}
              className="text-xs font-bold px-4 py-1.5 rounded-lg bg-gray-900 text-white hover:bg-gray-700 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Kaydediliyor…' : 'Kaydet'}
            </button>
          </div>
        </form>
      )}

      {/* ── Transaction table ──────────────────────────────────────────── */}
      {transactions.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl px-6 py-10 text-center">
          <div className="text-2xl mb-2">📋</div>
          <div className="text-sm font-bold text-gray-600">{emptyLabel}</div>
          <div className="text-xs text-gray-400 mt-1">
            {partners.length === 0
              ? 'Önce bir ortak eklemelisiniz.'
              : '"+ Yeni Kayıt" butonuyla ekleyebilirsiniz.'}
          </div>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[560px]">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-gray-400">Tarih</th>
                  <th className="text-left px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-gray-400">Ortak</th>
                  <th className="text-left px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-gray-400">Tür</th>
                  <th className="text-right px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-gray-400">Tutar (TRY)</th>
                  <th className="text-left px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-gray-400">Not</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {transactions.map(tx => {
                  const typeDef = txTypes.find(t => t.value === tx.tx_type)
                  const tone    = typeDef?.tone ?? 'neutral'
                  return (
                    <tr key={tx.id} className="hover:bg-gray-50/60">
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{fmtDate(tx.tx_date)}</td>
                      <td className="px-4 py-3 font-semibold text-gray-900">{tx.partner_name}</td>
                      <td className="px-4 py-3 text-gray-500">
                        <span className="px-2 py-0.5 rounded-full bg-gray-100 text-[10px] font-bold">
                          {typeDef?.label ?? tx.tx_type}
                        </span>
                      </td>
                      <td className={`px-4 py-3 text-right font-mono font-bold ${TONE_COLOR[tone]}`}>
                        {fmtTry(tx.amount_try)}
                        {tx.currency !== 'TRY' && (
                          <span className="text-gray-400 font-normal ml-1 text-[10px]">
                            ({tx.currency} {tx.amount.toLocaleString('tr-TR')})
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-400 max-w-[160px] truncate">{tx.notes ?? '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="bg-gray-50 border-t border-gray-200">
                  <td colSpan={3} className="px-4 py-2 text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                    Toplam
                  </td>
                  <td className="px-4 py-2 text-right font-mono font-black text-gray-900">
                    {fmtTry(totalTry)}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
