'use client'

import { useState, useCallback, useEffect } from 'react'
import { cn } from '@/components/ui'
import type { ExportLogEntry } from '@/lib/services/export/export-log.service'
import type { CertifiedExportPackage } from '@/lib/services/export/certified-export.service'

// ── Helpers ────────────────────────────────────────────────────────────────────
function today(): string {
  return new Date().toISOString().slice(0, 10)
}

function firstOfMonth(): string {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' })
}

function truncate(s: string, n = 16) {
  return s.length > n ? s.slice(0, n) + '…' : s
}

// ── ExportsTab ─────────────────────────────────────────────────────────────────
export default function ExportsTab() {
  const [from, setFrom] = useState(firstOfMonth())
  const [to, setTo]     = useState(today())
  const [loading, setLoading]         = useState(false)
  const [historyLoading, setHistoryLoading] = useState(true)
  const [history, setHistory]         = useState<ExportLogEntry[]>([])
  const [lastPackage, setLastPackage] = useState<CertifiedExportPackage | null>(null)
  const [error, setError]             = useState<string | null>(null)

  // ── Load history ─────────────────────────────────────────────────────────────
  const loadHistory = useCallback(async () => {
    setHistoryLoading(true)
    try {
      const r = await fetch('/api/export/history')
      if (r.ok) {
        const d = await r.json()
        setHistory(d.entries ?? [])
      }
    } finally {
      setHistoryLoading(false)
    }
  }, [])

  useEffect(() => { loadHistory() }, [loadHistory])

  // ── Generate export ───────────────────────────────────────────────────────────
  async function generateExport() {
    if (!from || !to) return
    setLoading(true)
    setError(null)
    setLastPackage(null)
    try {
      const r = await fetch(`/api/export/certified?from=${from}&to=${to}`)
      if (!r.ok) {
        const errData = await r.json().catch(() => ({}))
        setError(errData.error ?? 'Dışa aktarma başarısız oldu.')
        return
      }
      const pkg: CertifiedExportPackage = await r.json()
      setLastPackage(pkg)

      // ── Trigger browser download ──────────────────────────────────────────
      const companySlug = pkg.manifest.company_name
        .toLowerCase()
        .replace(/\s+/g, '_')
        .replace(/[^a-z0-9_]/g, '')
      const dateSlug = pkg.manifest.generated_at.slice(0, 10).replace(/-/g, '')
      const fileName = `flowra_export_${companySlug}_${dateSlug}.json`

      const blob = new Blob([JSON.stringify(pkg, null, 2)], { type: 'application/json' })
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href = url
      a.download = fileName
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      // Refresh history
      await loadHistory()
    } catch (e) {
      console.error('[ExportsTab] generate error', e)
      setError('Beklenmedik bir hata oluştu.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div>
        <h2 className="text-base font-semibold text-gray-900">Sertifikalı Finansal Dışa Aktarma</h2>
        <p className="text-xs text-gray-500 mt-0.5">
          Denetçiler ve muhasebeciler için doğrulanabilir, imzalı finansal veri paketi oluşturun.
        </p>
      </div>

      {/* Disclaimer */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
        <p className="text-xs text-amber-800 font-medium">
          Önemli Uyarı: Bu dışa aktarma bağımsız bir denetim yerine geçmez.
        </p>
        <p className="text-xs text-amber-700 mt-1">
          Veriler, Flowra sistem kayıtlarına dayanmaktadır. Bağımsız denetim için mali müşavirinize danışın.
        </p>
      </div>

      {/* Generate section */}
      <div className="border border-gray-200 rounded-xl p-5 space-y-4 bg-white">
        <h3 className="text-sm font-semibold text-gray-800">Yeni Dışa Aktarma Oluştur</h3>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-gray-600 mb-1 block font-medium">Başlangıç Tarihi</label>
            <input
              type="date"
              value={from}
              onChange={e => setFrom(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
          </div>
          <div>
            <label className="text-xs text-gray-600 mb-1 block font-medium">Bitiş Tarihi</label>
            <input
              type="date"
              value={to}
              onChange={e => setTo(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            <p className="text-xs text-red-700">{error}</p>
          </div>
        )}

        <button
          onClick={generateExport}
          disabled={loading || !from || !to}
          className={cn(
            'w-full py-2.5 px-4 rounded-lg text-sm font-medium transition-colors',
            loading || !from || !to
              ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
              : 'bg-violet-600 text-white hover:bg-violet-700',
          )}
        >
          {loading ? 'Dışa Aktarılıyor…' : 'Dışa Aktar (JSON)'}
        </button>

        {/* Manifest summary after generation */}
        {lastPackage && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-green-700 font-medium text-sm">Dışa aktarma paketi oluşturuldu.</span>
            </div>
            <div className="grid grid-cols-3 gap-3 text-xs text-gray-600">
              <div>
                <span className="font-medium text-gray-700">Satış kaydı:</span>
                <span className="ml-1">{lastPackage.manifest.record_counts.sales ?? 0}</span>
              </div>
              <div>
                <span className="font-medium text-gray-700">Gider kaydı:</span>
                <span className="ml-1">{lastPackage.manifest.record_counts.expenses ?? 0}</span>
              </div>
              <div>
                <span className="font-medium text-gray-700">Ortak:</span>
                <span className="ml-1">{lastPackage.manifest.record_counts.partners ?? 0}</span>
              </div>
            </div>
            <div className="pt-1 border-t border-green-200">
              <p className="text-xs text-gray-500">
                <span className="font-medium text-gray-700">SHA-256:</span>{' '}
                <span className="font-mono text-[11px] break-all">{lastPackage.manifest.checksum}</span>
              </p>
            </div>
            <p className="text-[10px] text-gray-400 italic">{lastPackage.manifest.disclaimer}</p>
          </div>
        )}
      </div>

      {/* History section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-800">Dışa Aktarma Geçmişi</h3>
          <button
            onClick={loadHistory}
            className="text-xs text-violet-600 hover:underline"
          >
            Yenile
          </button>
        </div>

        {historyLoading ? (
          <div className="py-8 text-center text-sm text-gray-400">Yükleniyor…</div>
        ) : history.length === 0 ? (
          <div className="py-8 text-center">
            <p className="text-sm text-gray-400">Henüz dışa aktarma yapılmamış.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 px-3 text-gray-500 font-medium">Tarih</th>
                  <th className="text-left py-2 px-3 text-gray-500 font-medium">Dönem</th>
                  <th className="text-left py-2 px-3 text-gray-500 font-medium">SHA-256 (kısaltılmış)</th>
                  <th className="text-left py-2 px-3 text-gray-500 font-medium">Kayıtlar</th>
                </tr>
              </thead>
              <tbody>
                {history.map(entry => (
                  <tr
                    key={entry.id}
                    className="border-b border-gray-100 hover:bg-gray-50 transition-colors"
                  >
                    <td className="py-2.5 px-3 text-gray-700">{fmtDate(entry.created_at)}</td>
                    <td className="py-2.5 px-3 text-gray-600">
                      {entry.period_from} → {entry.period_to}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-gray-500">
                      {truncate(entry.checksum, 20)}
                    </td>
                    <td className="py-2.5 px-3 text-gray-500">
                      {Object.entries(entry.record_counts ?? {})
                        .map(([k, v]) => `${k}: ${v}`)
                        .join(', ') || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
