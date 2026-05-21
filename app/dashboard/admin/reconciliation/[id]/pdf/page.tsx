'use client'

// ═══════════════════════════════════════════════════════════════════════════════
// app/dashboard/admin/reconciliation/[id]/pdf/page.tsx
//
// PDF download page for a reconciliation snapshot.
// Client component — fetches snapshot on load, renders download button.
// ═══════════════════════════════════════════════════════════════════════════════

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { ReconciliationData } from '@/types/reconciliation'

interface SnapshotForPdf {
  id:                  string
  title:               string
  period_label:        string | null
  reconciliation_date: string
  data_hash:           string | null
  confidence_score:    number | null
  status:              string
  sections:            ReconciliationData
  signoffs: Array<{
    partner_name:  string
    ownership_pct: number
    status:        string
    signed_at:     string | null
    comments:      string | null
  }>
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString('tr-TR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
    })
  } catch { return iso }
}

export default function ReconciliationPdfPage({
  params,
}: {
  params: { id: string }
}) {
  const [snapshot, setSnapshot]     = useState<SnapshotForPdf | null>(null)
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/reconciliation/snapshots/${params.id}`)
        if (!res.ok) {
          setError(`Mutabakat yüklenemedi (${res.status})`)
          return
        }
        const json = await res.json()
        const raw = json.snapshot
        if (raw) raw.signoffs = raw.reconciliation_signoffs ?? []
        setSnapshot(raw ?? null)
      } catch {
        setError('Ağ hatası oluştu.')
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [params.id])

  async function handleDownload() {
    if (!snapshot) return
    setGenerating(true)
    try {
      const { generateReconciliationPdf } = await import('@/lib/pdf/reconciliation.pdf')
      await generateReconciliationPdf({
        title:               snapshot.title,
        period_label:        snapshot.period_label,
        reconciliation_date: snapshot.reconciliation_date,
        data_hash:           snapshot.data_hash,
        confidence_score:    snapshot.confidence_score,
        sections:            snapshot.sections,
        signoffs:            snapshot.signoffs,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'PDF oluşturulamadı.')
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#f8fafc]">
      {/* Header */}
      <div className="bg-white border-b border-[#e2e8f0]">
        <div className="max-w-2xl mx-auto px-6 py-8">
          <div className="flex items-center gap-3 mb-4">
            <Link
              href={`/dashboard/admin/reconciliation/${params.id}`}
              className="text-[#94a3b8] hover:text-[#64748b] transition-colors"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
              </svg>
            </Link>
            <p className="text-[11px] font-semibold text-[#94a3b8] uppercase tracking-widest">
              Mutabakat Dosyası
            </p>
          </div>
          <h1 className="text-2xl font-black text-[#0f172a] tracking-tight">
            PDF İndir
          </h1>
          <p className="text-sm text-[#64748b] mt-1">
            Kurumsal 19-bölüm ortak mutabakat dosyası PDF olarak indirilecektir.
          </p>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-2xl mx-auto px-6 py-8">

        {/* Loading state */}
        {loading && (
          <div className="bg-white border border-[#e2e8f0] rounded-lg p-8 text-center">
            <div className="w-8 h-8 border-2 border-[#94a3b8] border-t-[#0f172a] rounded-full animate-spin mx-auto mb-4" />
            <p className="text-sm text-[#64748b]">Mutabakat yükleniyor…</p>
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="px-4 py-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Loaded state */}
        {!loading && snapshot && (
          <>
            {/* Snapshot info */}
            <div className="bg-white border border-[#e2e8f0] rounded-lg overflow-hidden mb-4">
              <div className="px-5 py-3 border-b border-[#e2e8f0] bg-[#f8fafc]">
                <span className="text-xs font-black text-[#0f172a] uppercase tracking-widest">
                  Dosya Bilgileri
                </span>
              </div>
              <div className="px-5 py-4 space-y-2">
                <div className="flex justify-between">
                  <span className="text-xs text-[#94a3b8]">Başlık</span>
                  <span className="text-xs font-semibold text-[#0f172a]">{snapshot.title}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-xs text-[#94a3b8]">Dönem</span>
                  <span className="text-xs font-semibold text-[#0f172a]">{snapshot.period_label ?? '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-xs text-[#94a3b8]">Tarih</span>
                  <span className="text-xs font-semibold text-[#0f172a]">{fmtDate(snapshot.reconciliation_date)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-xs text-[#94a3b8]">Güven Skoru</span>
                  <span className={`text-xs font-semibold ${
                    (snapshot.confidence_score ?? 0) >= 80 ? 'text-green-700' :
                    (snapshot.confidence_score ?? 0) >= 60 ? 'text-amber-700' :
                    'text-red-700'
                  }`}>
                    {snapshot.confidence_score ?? 0}/100
                  </span>
                </div>
                {snapshot.data_hash && (
                  <div className="flex justify-between">
                    <span className="text-xs text-[#94a3b8]">SHA-256</span>
                    <span className="text-[11px] font-mono text-[#64748b]">
                      {snapshot.data_hash.slice(0, 16)}…
                    </span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-xs text-[#94a3b8]">İmza Durumu</span>
                  <span className="text-xs font-semibold text-[#0f172a]">
                    {snapshot.signoffs.filter(s => s.status === 'approved').length} / {snapshot.signoffs.length} ortak
                  </span>
                </div>
              </div>
            </div>

            {/* Download button */}
            <button
              onClick={handleDownload}
              disabled={generating}
              className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-[#0f172a] text-white text-sm font-semibold rounded-lg hover:bg-[#1e293b] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {generating ? (
                <>
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  PDF Oluşturuluyor… (19 bölüm)
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Ortak Mutabakat PDF&apos;ini İndir
                </>
              )}
            </button>

            {/* Info note */}
            <div className="mt-4 bg-[#f8fafc] border border-[#e2e8f0] rounded-lg px-5 py-4">
              <p className="text-xs font-semibold text-[#334155] mb-2">PDF içeriği</p>
              <ul className="space-y-1 text-xs text-[#64748b]">
                <li>• Kurumsal kapak + SHA-256 parmak izi şeridi</li>
                <li>• 19 tam bölüm (şirket kimliği, bilanço, kâr/zarar, vergi, stok, sabit kıymetler…)</li>
                <li>• Yönetişim bulguları (renkli önem seviyeleri)</li>
                <li>• Ortak imza durumları</li>
                <li>• Her sayfada GİZLİ — YÖNETİCİ EKİ alt bilgisi</li>
              </ul>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
