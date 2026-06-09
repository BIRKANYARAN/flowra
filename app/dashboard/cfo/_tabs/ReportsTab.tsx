'use client'
// ── ReportsTab — CFO Raporlama Paketi ────────────────────────────────────────
//
// CFO monthly reporting pack tab.
// The user selects a period, clicks "Paket Oluştur", and the system creates an
// empty CfoPackManifest where each report item starts as 'pending'.
//
// Displays:
//   - Period selector dropdown
//   - "Paket Oluştur" button
//   - Progress bar (X/10 rapor hazır) while generating
//   - Report list with icon, Turkish title, description, status chip, size
//   - "Tümünü İndir (ZIP)" button when is_complete=true
//   - Empty state when no pack has been created yet

import { useState }    from 'react'
import {
  REPORT_ORDER,
  computePackProgress,
  getReportTitle,
  getReportDescription,
  type CfoPackManifest,
  type ReportItem,
  type ReportType,
} from '@/lib/services/reporting/cfo-pack.service'

// ── Status chip colours ───────────────────────────────────────────────────────

const STATUS_CLASSES: Record<ReportItem['status'], string> = {
  ready:      'bg-green-100 text-green-800',
  generating: 'bg-yellow-100 text-yellow-800',
  error:      'bg-red-100 text-red-800',
  pending:    'bg-[#f1f5f9] text-[#64748b]',
}

const STATUS_LABELS: Record<ReportItem['status'], string> = {
  ready:      'Hazır',
  generating: 'Oluşturuluyor',
  error:      'Hata',
  pending:    'Bekliyor',
}

// ── Report type icons (emoji fallback — no additional dependency) ──────────────

const REPORT_ICONS: Record<ReportType, string> = {
  trial_balance:          '📋',
  income_statement:       '📊',
  balance_sheet:          '⚖️',
  cash_flow:              '💵',
  partner_capital:        '🤝',
  kdv_summary:            '🧾',
  corporate_tax_estimate: '🏛️',
  receivables_aging:      '📅',
  partner_risk_map:       '🗺️',
  executive_summary:      '📝',
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatSize(sizeKb: number | null): string {
  if (sizeKb === null) return '—'
  if (sizeKb < 1024) return `${sizeKb} KB`
  return `${(sizeKb / 1024).toFixed(1)} MB`
}

function currentYearMonthOptions(): { value: string; label: string }[] {
  const months = [
    'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
    'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
  ]
  const now = new Date()
  const options: { value: string; label: string }[] = []
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const label = `${months[d.getMonth()]} ${d.getFullYear()}`
    options.push({ value, label })
  }
  return options
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ReportsTab() {
  const periodOptions = currentYearMonthOptions()
  const [selectedPeriod, setSelectedPeriod] = useState(periodOptions[0].value)
  const [manifest, setManifest]             = useState<CfoPackManifest | null>(null)
  const [loading, setLoading]               = useState(false)
  const [error, setError]                   = useState<string | null>(null)

  const readyCount  = manifest ? manifest.items.filter(i => i.status === 'ready').length : 0
  const totalCount  = REPORT_ORDER.length
  const progress    = manifest ? computePackProgress(manifest) : 0
  const isComplete  = manifest?.is_complete ?? false

  async function handleCreatePack() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/reports/cfo-pack', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ period_id: selectedPeriod }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`)
      }
      const data = await res.json() as { manifest: CfoPackManifest }
      setManifest(data.manifest)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Bilinmeyen hata')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6 p-4">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-[#0f172a]">CFO Raporlama Paketi</h2>
          <p className="text-sm text-[#64748b] mt-0.5">
            Seçili dönem için tam CFO paketini oluşturun ve indirin.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Period selector */}
          <select
            value={selectedPeriod}
            onChange={e => setSelectedPeriod(e.target.value)}
            className="rounded-md border border-[#e8eaef] bg-white px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-info"
          >
            {periodOptions.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>

          {/* Create button */}
          <button
            onClick={handleCreatePack}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-md bg-info px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-info disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Oluşturuluyor…
              </>
            ) : (
              <>
                <span>📦</span>
                Paket Oluştur
              </>
            )}
          </button>
        </div>
      </div>

      {/* ── Error banner ────────────────────────────────────────────────────── */}
      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          <strong>Hata:</strong> {error}
        </div>
      )}

      {/* ── Empty state ─────────────────────────────────────────────────────── */}
      {!manifest && !loading && !error && (
        <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-[#e8eaef] bg-[#f8fafc] py-16 text-center">
          <span className="text-4xl mb-4">📦</span>
          <p className="text-[#475569] font-medium">Henüz paket oluşturulmadı</p>
          <p className="text-sm text-[#94a3b8] mt-1">
            Paket oluşturmak için "Paket Oluştur" butonuna tıklayın.
          </p>
        </div>
      )}

      {/* ── Manifest view ───────────────────────────────────────────────────── */}
      {manifest && (
        <div className="space-y-4">

          {/* Progress bar */}
          <div className="rounded-lg border border-[#e8eaef] bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-[#334155]">
                {readyCount}/{totalCount} rapor hazır
              </span>
              <span className="text-sm text-[#64748b]">{progress}%</span>
            </div>
            <div className="h-2.5 w-full rounded-full bg-[#e8eaef]">
              <div
                className="h-2.5 rounded-full bg-info transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            {isComplete && (
              <p className="mt-2 text-sm text-green-600 font-medium">
                ✓ Tüm raporlar hazır — paket indirilebilir.
              </p>
            )}
          </div>

          {/* Report list */}
          <div className="divide-y divide-[#f1f5f9] rounded-lg border border-[#e8eaef] bg-white shadow-sm">
            {manifest.items.map(item => (
              <div key={item.type} className="flex items-start gap-4 px-4 py-3">
                {/* Icon */}
                <span className="text-2xl mt-0.5 shrink-0">{REPORT_ICONS[item.type]}</span>

                {/* Title + description */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[#0f172a]">{item.title}</p>
                  <p className="text-xs text-[#64748b] mt-0.5">{item.description}</p>
                </div>

                {/* Status chip + size */}
                <div className="flex items-center gap-3 shrink-0">
                  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_CLASSES[item.status]}`}>
                    {STATUS_LABELS[item.status]}
                  </span>
                  <span className="text-xs text-[#94a3b8] w-14 text-right">
                    {formatSize(item.size_kb)}
                  </span>

                  {/* Download button */}
                  {item.status === 'ready' && item.url ? (
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-md bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700 hover:bg-green-100 transition-colors"
                    >
                      İndir
                    </a>
                  ) : (
                    <span className="w-14" />
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Download all ZIP */}
          {isComplete && manifest.download_url && (
            <div className="flex justify-end">
              <a
                href={manifest.download_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-md bg-green-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-green-700 transition-colors"
              >
                <span>⬇️</span>
                Tümünü İndir (ZIP)
              </a>
            </div>
          )}

          {/* Pack metadata */}
          <p className="text-xs text-[#94a3b8] text-right">
            Dönem: <strong>{manifest.period_label}</strong> · Oluşturulma:{' '}
            {new Date(manifest.created_at).toLocaleString('tr-TR')}
            {manifest.total_size_kb > 0 && (
              <> · Toplam boyut: {formatSize(manifest.total_size_kb)}</>
            )}
          </p>
        </div>
      )}
    </div>
  )
}
