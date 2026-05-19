'use client'

// ── /dashboard/partners/new ────────────────────────────────────────────────────
// Create a new partner.
//
// Fields:
//   name            — required
//   share_ratio     — required, entered as 0–100 %, sent as 0–1 decimal
//   initial_capital — optional, recorded as a 'loan_in' transaction so it
//                     shows up immediately in the partner's balance / capital
//
// Flow:
//   1. POST /api/partners          → creates the partner row
//   2. POST /api/partners/{id}/transactions  → records initial capital (if > 0)
//   3. router.push('/dashboard/partners')    → back to list

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

const IL  = 'w-full border border-[#e2e8f0] rounded px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand bg-white transition-colors'
const LAB = 'block text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-1.5'

export default function NewPartnerPage() {
  const router = useRouter()

  const [name,           setName]           = useState('')
  const [shareRatioPct,  setShareRatioPct]  = useState('')
  const [initialCapital, setInitialCapital] = useState('')
  const [saving,         setSaving]         = useState(false)
  const [error,          setError]          = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    // ── Client-side validation ─────────────────────────────────────────────────
    const trimName = name.trim()
    if (!trimName) { setError('İsim zorunludur.'); return }

    const ratePct = parseFloat(shareRatioPct)
    if (!Number.isFinite(ratePct) || ratePct <= 0 || ratePct > 100) {
      setError('Pay oranı 1 ile 100 arasında olmalıdır (örn: 50 → %50).'); return
    }

    const capital = parseFloat(initialCapital) || 0
    if (capital < 0) { setError('Başlangıç sermayesi negatif olamaz.'); return }

    setSaving(true)

    try {
      // 1. Create partner (share_ratio is stored as 0–1 decimal)
      const res = await fetch('/api/partners', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ name: trimName, share_ratio: ratePct / 100 }),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Ortak oluşturulamadı.')
        setSaving(false)
        return
      }

      // 2. Record initial capital as a loan_in transaction (optional)
      //    This makes the capital appear immediately in the partner balance view.
      if (capital > 0 && data.id) {
        const txRes = await fetch(`/api/partners/${data.id}/transactions`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            tx_type:  'loan_in',
            amount:   capital,
            currency: 'TRY',
            fx_rate:  1,
            tx_date:  new Date().toISOString().slice(0, 10),
            notes:    'Başlangıç sermayesi',
          }),
        })
        if (!txRes.ok) {
          // Partner was created successfully — warn but still redirect.
          // The capital can be added manually from the partner detail page.
          console.warn('[NewPartner] initial capital transaction failed; partner was still created')
        }
      }

      router.push('/dashboard/partners')
    } catch {
      setError('Ağ hatası: ortak oluşturulamadı.')
      setSaving(false)
    }
  }

  return (
    <div className="max-w-lg">

      {/* ── Breadcrumb / header ──────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 mb-6">
        <Link
          href="/dashboard/partners"
          className="text-sm text-[#94a3b8] hover:text-[#64748b] transition-colors"
        >
          ← Ortaklar
        </Link>
        <span className="text-[#e2e8f0]">/</span>
        <h1 className="text-xl font-black text-[#0f172a] tracking-tight">Yeni Ortak</h1>
      </div>

      {/* ── Form ────────────────────────────────────────────────────────────── */}
      <form onSubmit={handleSubmit} noValidate>
        <div className="bg-white border border-[#e2e8f0] rounded p-6 shadow-sm space-y-5">

          {/* Name */}
          <div>
            <label className={LAB}>İsim *</label>
            <input
              className={IL}
              placeholder="Ortak adı veya şirket adı"
              maxLength={200}
              value={name}
              onChange={e => setName(e.target.value)}
              autoFocus
            />
          </div>

          {/* Share ratio */}
          <div>
            <label className={LAB}>Pay Oranı (%) *</label>
            <div className="relative">
              <input
                type="number"
                min="0.01"
                max="100"
                step="0.01"
                className={IL}
                placeholder="50"
                value={shareRatioPct}
                onChange={e => setShareRatioPct(e.target.value)}
              />
              <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-sm text-[#94a3b8] pointer-events-none">
                %
              </span>
            </div>
            <p className="text-[11px] text-[#94a3b8] mt-1.5">
              Örn: iki eşit ortak için her birine 50 girin.
            </p>
          </div>

          {/* Initial capital */}
          <div>
            <label className={LAB}>Başlangıç Sermayesi (₺)</label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-[#94a3b8] pointer-events-none">
                ₺
              </span>
              <input
                type="number"
                min="0"
                step="0.01"
                className={`${IL} pl-7`}
                placeholder="0"
                value={initialCapital}
                onChange={e => setInitialCapital(e.target.value)}
              />
            </div>
            <p className="text-[11px] text-[#94a3b8] mt-1.5">
              Opsiyonel. "Borç Girişi" olarak kaydedilir ve sermaye hesabına yansır.
            </p>
          </div>

          {/* Error */}
          {error && (
            <div className="text-sm px-3 py-2.5 rounded border bg-neg-light border-neg-light text-neg-text flex items-center gap-2">
              <span>✕</span>
              <span>{error}</span>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-5 py-2.5 text-sm font-bold rounded bg-brand-light text-white hover:bg-brand disabled:opacity-50 transition-colors"
            >
              {saving ? 'Kaydediliyor...' : 'Ortak Ekle'}
            </button>
            <Link
              href="/dashboard/partners"
              className="inline-flex items-center px-4 py-2.5 text-sm font-semibold rounded border border-[#e2e8f0] text-[#64748b] hover:bg-[#f8fafc] transition-colors"
            >
              İptal
            </Link>
          </div>

        </div>
      </form>
    </div>
  )
}
