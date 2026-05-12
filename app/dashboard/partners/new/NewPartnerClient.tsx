'use client'

// ── NewPartnerClient — partner creation form ──────────────────────────────────
// Extracted from partners/new/page.tsx (FAZ 16).
// Handles form state, validation, and two-step API submission:
//   1. POST /api/partners               → create partner row
//   2. POST /api/partners/{id}/transactions → record initial capital (if > 0)

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

const IL  = 'w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-primary-400 bg-white transition-colors'
const LAB = 'block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5'

// ── Pure validation helpers (tested in tests/partner-validation.test.ts) ───────

export function validatePartnerForm(
  name:           string,
  shareRatioPct:  string,
  initialCapital: string,
): string | null {
  if (!name.trim()) return 'İsim zorunludur.'

  const ratePct = parseFloat(shareRatioPct)
  if (!Number.isFinite(ratePct) || ratePct <= 0 || ratePct > 100) {
    return 'Pay oranı 1 ile 100 arasında olmalıdır (örn: 50 → %50).'
  }

  const capital = parseFloat(initialCapital) || 0
  if (capital < 0) return 'Başlangıç sermayesi negatif olamaz.'

  return null
}

export function parseShareRatio(pct: string): number {
  // "50" → 0.5  (stored as 0–1 decimal in DB)
  return parseFloat(pct) / 100
}

export function parseCapital(input: string): number {
  const n = parseFloat(input)
  return Number.isFinite(n) && n > 0 ? n : 0
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function NewPartnerClient() {
  const router = useRouter()

  const [name,           setName]           = useState('')
  const [shareRatioPct,  setShareRatioPct]  = useState('')
  const [initialCapital, setInitialCapital] = useState('')
  const [saving,         setSaving]         = useState(false)
  const [error,          setError]          = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    // ── Validation ─────────────────────────────────────────────────────────────
    const validationError = validatePartnerForm(name, shareRatioPct, initialCapital)
    if (validationError) { setError(validationError); return }

    const trimName = name.trim()
    const capital  = parseCapital(initialCapital)

    setSaving(true)
    try {
      // 1. Create partner (share_ratio stored as 0–1 decimal)
      const res  = await fetch('/api/partners', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ name: trimName, share_ratio: parseShareRatio(shareRatioPct) }),
      })
      const data = await res.json() as { id?: string; error?: string }

      if (!res.ok) { setError(data.error ?? 'Ortak oluşturulamadı.'); setSaving(false); return }

      // 2. Record initial capital as loan_in transaction (optional)
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
          // Partner created — warn but still redirect; capital can be added manually.
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
    <form onSubmit={handleSubmit} noValidate>
      <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-5">

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
            <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-sm text-gray-400 pointer-events-none">
              %
            </span>
          </div>
          <p className="text-[11px] text-gray-400 mt-1.5">
            Örn: iki eşit ortak için her birine 50 girin.
          </p>
        </div>

        {/* Initial capital */}
        <div>
          <label className={LAB}>Başlangıç Sermayesi (₺)</label>
          <div className="relative">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-gray-400 pointer-events-none">
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
          <p className="text-[11px] text-gray-400 mt-1.5">
            Opsiyonel. &quot;Borç Girişi&quot; olarak kaydedilir ve sermaye hesabına yansır.
          </p>
        </div>

        {/* Error */}
        {error && (
          <div className="text-sm px-3 py-2.5 rounded-xl border bg-red-50 border-red-100 text-red-700 flex items-center gap-2">
            <span>✕</span>
            <span>{error}</span>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3 pt-1">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-1.5 px-5 py-2.5 text-sm font-bold rounded-xl bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Kaydediliyor…' : 'Ortak Ekle'}
          </button>
          <Link
            href="/dashboard/partners"
            className="inline-flex items-center px-4 py-2.5 text-sm font-semibold rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
          >
            İptal
          </Link>
        </div>

      </div>
    </form>
  )
}
