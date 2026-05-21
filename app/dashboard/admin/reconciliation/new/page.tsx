'use client'

// ═══════════════════════════════════════════════════════════════════════════════
// app/dashboard/admin/reconciliation/new/page.tsx
//
// Form to create a new shareholder reconciliation snapshot.
// Client component — handles form state, API call, and redirect.
// ═══════════════════════════════════════════════════════════════════════════════

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

export default function NewReconciliationPage() {
  const router = useRouter()

  const [title, setTitle]                     = useState('')
  const [periodLabel, setPeriodLabel]         = useState('')
  const [reconciliationDate, setDate]         = useState(today())
  const [loading, setLoading]                 = useState(false)
  const [error, setError]                     = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const res = await fetch('/api/reconciliation/snapshots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title:               title.trim() || 'Ortaklar Kurulu Mutabakat Dosyası',
          period_label:        periodLabel.trim() || null,
          reconciliation_date: reconciliationDate,
        }),
      })

      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json.error ?? `Hata: ${res.status}`)
      }

      const json = await res.json()
      const snapshotId: string = json.snapshot?.id
      if (!snapshotId) throw new Error('Sunucu geçerli bir yanıt döndürmedi.')

      router.push(`/dashboard/admin/reconciliation/${snapshotId}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bilinmeyen bir hata oluştu.')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#f8fafc]">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-[#e2e8f0]">
        <div className="max-w-2xl mx-auto px-6 py-8">
          <div className="flex items-center gap-3 mb-4">
            <Link
              href="/dashboard/admin/reconciliation"
              className="text-[#94a3b8] hover:text-[#64748b] transition-colors"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
              </svg>
            </Link>
            <p className="text-[11px] font-semibold text-[#94a3b8] uppercase tracking-widest">
              Mutabakat Dosyaları
            </p>
          </div>
          <h1 className="text-2xl font-black text-[#0f172a] tracking-tight">
            Yeni Mutabakat Oluştur
          </h1>
          <p className="text-sm text-[#64748b] mt-1">
            Sistem tüm 19 bölümü otomatik olarak hesaplayacak ve dosyayı oluşturacaktır.
          </p>
        </div>
      </div>

      {/* ── Form ─────────────────────────────────────────────────────────────── */}
      <div className="max-w-2xl mx-auto px-6 py-8">
        <form onSubmit={handleSubmit} className="bg-white border border-[#e2e8f0] rounded-lg overflow-hidden">
          <div className="px-5 py-3 border-b border-[#e2e8f0] bg-[#f8fafc]">
            <span className="text-xs font-black text-[#0f172a] uppercase tracking-widest">
              Mutabakat Bilgileri
            </span>
          </div>

          <div className="px-6 py-6 space-y-5">
            {/* Title */}
            <div>
              <label htmlFor="title" className="block text-xs font-semibold text-[#334155] uppercase tracking-wide mb-1.5">
                Başlık
              </label>
              <input
                id="title"
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="Q1 2026 Ortak Mutabakatı"
                className="w-full px-3 py-2 text-sm text-[#0f172a] border border-[#e2e8f0] rounded focus:outline-none focus:ring-2 focus:ring-[#0f172a]/10 focus:border-[#334155] transition-colors placeholder:text-[#cbd5e1]"
              />
            </div>

            {/* Period label */}
            <div>
              <label htmlFor="period" className="block text-xs font-semibold text-[#334155] uppercase tracking-wide mb-1.5">
                Dönem
              </label>
              <input
                id="period"
                type="text"
                value={periodLabel}
                onChange={e => setPeriodLabel(e.target.value)}
                placeholder="Ocak 2026"
                className="w-full px-3 py-2 text-sm text-[#0f172a] border border-[#e2e8f0] rounded focus:outline-none focus:ring-2 focus:ring-[#0f172a]/10 focus:border-[#334155] transition-colors placeholder:text-[#cbd5e1]"
              />
              <p className="text-[11px] text-[#94a3b8] mt-1">
                Opsiyonel. Boş bırakılırsa tarihten otomatik oluşturulur.
              </p>
            </div>

            {/* Date */}
            <div>
              <label htmlFor="rdate" className="block text-xs font-semibold text-[#334155] uppercase tracking-wide mb-1.5">
                Mutabakat Tarihi
              </label>
              <input
                id="rdate"
                type="date"
                value={reconciliationDate}
                onChange={e => setDate(e.target.value)}
                required
                className="w-full px-3 py-2 text-sm text-[#0f172a] border border-[#e2e8f0] rounded focus:outline-none focus:ring-2 focus:ring-[#0f172a]/10 focus:border-[#334155] transition-colors"
              />
            </div>

            {/* Error */}
            {error && (
              <div className="px-4 py-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                {error}
              </div>
            )}

            {/* Loading note */}
            {loading && (
              <div className="px-4 py-3 bg-[#f8fafc] border border-[#e2e8f0] rounded text-sm text-[#64748b]">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-[#94a3b8] border-t-[#0f172a] rounded-full animate-spin flex-shrink-0" />
                  <span>19 bölüm hesaplanıyor, lütfen bekleyin…</span>
                </div>
              </div>
            )}
          </div>

          {/* Footer / Submit */}
          <div className="px-6 py-4 border-t border-[#e2e8f0] bg-[#f8fafc] flex items-center justify-between">
            <Link
              href="/dashboard/admin/reconciliation"
              className="text-sm text-[#64748b] hover:text-[#334155] transition-colors"
            >
              İptal
            </Link>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center gap-2 px-5 py-2 bg-[#0f172a] text-white text-sm font-semibold rounded hover:bg-[#1e293b] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Hesaplanıyor…
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Hesapla ve Oluştur
                </>
              )}
            </button>
          </div>
        </form>

        {/* Info box */}
        <div className="mt-4 bg-[#f8fafc] border border-[#e2e8f0] rounded-lg px-5 py-4">
          <p className="text-xs font-semibold text-[#334155] mb-2">Bu işlem neler yapar?</p>
          <ul className="space-y-1 text-xs text-[#64748b]">
            <li>• Tüm finansal verileri seçilen tarihe göre hesaplar (19 bölüm)</li>
            <li>• SHA-256 veri parmak izi oluşturur</li>
            <li>• Güven skoru ve yönetişim bulgularını tespit eder</li>
            <li>• Aktif ortaklar için onay sırası başlatır</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
