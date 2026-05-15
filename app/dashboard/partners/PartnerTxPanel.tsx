'use client'

/**
 * PartnerTxPanel — client island for Sermaye / Borçlar / Huzur Hakkı / Temettü tabs
 *
 * FAZ 2 changes:
 *   • Real FX rate auto-fetch for non-TRY currencies (uses fx_rates table → /api/fx fallback)
 *   • correction tx_type support (amounts stored as negative to reverse prior entries)
 *   • Inline delete capability (soft-delete for non-correction entries)
 */

import { useEffect, useState } from 'react'
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
  tone?: 'positive' | 'negative' | 'neutral' | 'correction'
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
  /** If true, amounts are stored as negative (used for correction tab) */
  negateAmount?: boolean
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
  positive:   'text-emerald-700',
  negative:   'text-red-600',
  neutral:    'text-gray-700',
  correction: 'text-orange-600',
}

// ── Component ─────────────────────────────────────────────────────────────────

export function PartnerTxPanel({
  partners, transactions, txTypes, description, emptyLabel, negateAmount = false,
}: Props) {
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

  // FX rate state (FAZ 2)
  const [fxRate,    setFxRate]    = useState('1')
  const [fxDate,    setFxDate]    = useState<string | null>(null)
  const [fxLoading, setFxLoading] = useState(false)

  // Soft-delete confirm
  const [confirmId, setConfirmId] = useState<string | null>(null)

  // ── Auto-fetch FX rate when currency or date changes ──────────────────────
  useEffect(() => {
    if (currency === 'TRY') { setFxRate('1'); setFxDate(null); return }

    let cancelled = false
    setFxLoading(true)

    ;(async () => {
      try {
        // 1. Try fx_rates table
        const { data: dbRates } = await supabase
          .from('fx_rates')
          .select('buying, rate_date')
          .eq('currency', currency)
          .lte('rate_date', txDate)
          .order('rate_date', { ascending: false })
          .limit(1)

        if (!cancelled && dbRates && dbRates.length > 0 && Number(dbRates[0].buying) > 0) {
          setFxRate(Number(dbRates[0].buying).toFixed(4))
          setFxDate(dbRates[0].rate_date)
          return
        }

        // 2. Fallback: /api/fx live rate
        const res  = await fetch('/api/fx', { cache: 'no-store' })
        const data = await res.json()
        if (!cancelled && res.ok) {
          const rate = currency === 'USD' ? Number(data.USD) : Number(data.EUR)
          if (rate > 0) { setFxRate(rate.toFixed(4)); setFxDate(data.rate_date ?? null) }
        }
      } catch { /* non-fatal — user can manually adjust */ }
      finally { if (!cancelled) setFxLoading(false) }
    })()

    return () => { cancelled = true }
  }, [currency, txDate, supabase])

  function resetForm() {
    setPartnerId(partners[0]?.id ?? '')
    setTxType(txTypes[0]?.value ?? '')
    setAmount('')
    setCurrency('TRY')
    setTxDate(new Date().toISOString().slice(0, 10))
    setNotes('')
    setError('')
    setSuccess('')
    setFxRate('1')
    setFxDate(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const rawAmt = parseFloat(amount.replace(',', '.'))
    if (!partnerId) { setError('Ortak seçiniz.'); return }
    if (!txType)    { setError('İşlem türü seçiniz.'); return }
    if (!amount || isNaN(rawAmt) || rawAmt <= 0) { setError('Geçerli bir tutar giriniz.'); return }

    const fx      = Math.max(0.0001, parseFloat(fxRate) || 1)
    // negateAmount=true for correction tab: store as negative to reverse prior entries
    const signedAmt = negateAmount ? -Math.abs(rawAmt) : rawAmt
    const amtTry    = Math.round(signedAmt * fx * 100) / 100

    setSaving(true); setError(''); setSuccess('')

    const { error: insertErr } = await supabase
      .from('partner_transactions')
      .insert({
        partner_id:  partnerId,
        tx_type:     txType,
        amount:      signedAmt,
        currency,
        fx_rate:     fx,
        amount_try:  amtTry,
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
    router.refresh()
  }

  async function softDelete(id: string) {
    const { error: delErr } = await supabase
      .from('partner_transactions')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)

    setConfirmId(null)
    if (delErr) { setError(delErr.message); return }
    router.refresh()
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
          {totalTry !== 0 && (
            <p className={`text-base font-black mt-0.5 tabular-nums ${totalTry < 0 ? 'text-orange-700' : 'text-gray-900'}`}>
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

      {/* ── Error banner ───────────────────────────────────────────────── */}
      {error && !open && (
        <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {error}
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

          {/* FX Rate display (FAZ 2) */}
          {currency !== 'TRY' && (
            <div className="flex items-center gap-2 text-xs text-gray-500 bg-white border border-gray-100 rounded-lg px-3 py-2">
              {fxLoading ? (
                <span className="text-gray-400">Kur yükleniyor…</span>
              ) : (
                <>
                  <span>
                    1 {currency} = ₺{fxRate}
                    {fxDate && <span className="text-gray-400 ml-1">({fxDate})</span>}
                  </span>
                  {amount && parseFloat(amount) > 0 && (
                    <span className="ml-auto font-bold text-gray-700">
                      ≈ ₺{fmtTry(parseFloat(amount.replace(',', '.')) * parseFloat(fxRate))}
                    </span>
                  )}
                  <input
                    type="number"
                    step="0.0001"
                    min="0.0001"
                    value={fxRate}
                    onChange={e => setFxRate(e.target.value)}
                    className="w-24 border border-gray-200 rounded px-2 py-1 text-xs bg-white"
                    title="Kuru manuel düzenleyebilirsiniz"
                  />
                </>
              )}
            </div>
          )}

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

          {negateAmount && (
            <div className="text-[11px] text-orange-600 bg-orange-50 border border-orange-200 rounded-lg px-3 py-2">
              Düzeltme girişleri negatif olarak kaydedilir — yanlış kaydı tersine çevirir.
            </div>
          )}

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
                  <th className="w-16" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {transactions.map(tx => {
                  const typeDef = txTypes.find(t => t.value === tx.tx_type)
                  const tone    = typeDef?.tone ?? 'neutral'
                  return (
                    <tr key={tx.id} className="hover:bg-gray-50/60 group">
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{fmtDate(tx.tx_date)}</td>
                      <td className="px-4 py-3 font-semibold text-gray-900">{tx.partner_name}</td>
                      <td className="px-4 py-3 text-gray-500">
                        <span className={`px-2 py-0.5 rounded-full bg-gray-100 text-[10px] font-bold ${tone === 'correction' ? 'bg-orange-50 text-orange-700' : ''}`}>
                          {typeDef?.label ?? tx.tx_type}
                        </span>
                      </td>
                      <td className={`px-4 py-3 text-right font-mono font-bold ${tx.amount_try < 0 ? 'text-orange-600' : TONE_COLOR[tone]}`}>
                        {fmtTry(tx.amount_try)}
                        {tx.currency !== 'TRY' && (
                          <span className="text-gray-400 font-normal ml-1 text-[10px]">
                            ({tx.currency} {Math.abs(tx.amount).toLocaleString('tr-TR')})
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-400 max-w-[160px] truncate">{tx.notes ?? '—'}</td>
                      <td className="px-4 py-3 text-right">
                        {confirmId === tx.id ? (
                          <span className="flex items-center justify-end gap-1">
                            <button onClick={() => softDelete(tx.id)}
                              className="text-[10px] text-white bg-red-500 hover:bg-red-600 px-2 py-0.5 rounded-lg transition-colors font-semibold">
                              Sil
                            </button>
                            <button onClick={() => setConfirmId(null)}
                              className="text-[10px] text-gray-400 px-1.5 py-0.5 rounded-lg hover:bg-gray-100 transition-colors">
                              İptal
                            </button>
                          </span>
                        ) : (
                          <button
                            onClick={() => setConfirmId(tx.id)}
                            className="opacity-0 group-hover:opacity-100 text-[10px] text-gray-300 hover:text-red-500 px-1.5 py-0.5 rounded-lg hover:bg-red-50 transition-all"
                            title="Kaydı sil"
                          >
                            ✕
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="bg-gray-50 border-t border-gray-200">
                  <td colSpan={3} className="px-4 py-2 text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                    Toplam
                  </td>
                  <td className={`px-4 py-2 text-right font-mono font-black ${totalTry < 0 ? 'text-orange-700' : 'text-gray-900'}`}>
                    {fmtTry(totalTry)}
                  </td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
