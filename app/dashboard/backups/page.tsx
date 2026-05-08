'use client'

import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react'
import { useSupabase } from '@/lib/hooks/useSupabase'
import { PageHeader, Btn, ErrorBanner, EmptyState, LoadingSpinner } from '@/components/ui'

interface BackupFile {
  name: string
  size: number
  path: string
}

interface BackupEntry {
  name: string
  path: string
  fileCount: number
  totalSize: number
  metadata: {
    created_at?: string
    total_rows?: number
    tables?: Record<string, number>
    version?: string
  }
  files: BackupFile[]
}

function fmtSize(bytes: number) {
  if (bytes === 0) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

function fmtBackupDate(name: string) {
  // name format: YYYYMMDD_HHmmss
  try {
    const y = name.slice(0, 4)
    const m = name.slice(4, 6)
    const d = name.slice(6, 8)
    const h = name.slice(9, 11)
    const min = name.slice(11, 13)
    return `${d}.${m}.${y} ${h}:${min}`
  } catch {
    return name
  }
}

export default function BackupsPage() {
  const supabase = useSupabase()
  const [backups, setBackups] = useState<BackupEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [creating, setCreating] = useState(false)
  const [restoring, setRestoring] = useState(false)

  // Phase 7 — JSON export/import (migrated from DashboardActions)
  const importRef = useRef<HTMLInputElement>(null)
  const [exportBusy, setExportBusy] = useState(false)
  const [exportMsg,  setExportMsg]  = useState('')

  // Restore modal state
  const [restoreTarget, setRestoreTarget] = useState<BackupEntry | null>(null)
  const [confirmText, setConfirmText] = useState('')

  // ── JSON export / import (Phase 7 — moved from dashboard header) ─────────────
  async function downloadJsonExport() {
    setExportBusy(true)
    setExportMsg('')
    try {
      const res = await fetch('/api/export')
      if (!res.ok) { setExportMsg('Dışa aktarma başarısız'); setExportBusy(false); return }
      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      a.download = `flowra-export-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
      setExportMsg('Dışa aktarıldı ✓')
    } catch { setExportMsg('İndirme hatası') }
    setExportBusy(false)
    setTimeout(() => setExportMsg(''), 4000)
  }

  async function handleJsonImport(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setExportBusy(true)
    setExportMsg('')
    try {
      const text = await file.text()
      const res  = await fetch('/api/import', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: text,
      })
      const data = await res.json()
      if (!res.ok) setExportMsg(data.error || 'Yükleme başarısız')
      else { setExportMsg('Yedek yüklendi ✓'); setTimeout(() => window.location.reload(), 1500) }
    } catch { setExportMsg('Dosya okunamadı') }
    setExportBusy(false)
    if (importRef.current) importRef.current.value = ''
  }

  const load = useCallback(async () => {
    setError('')
    const res = await fetch('/api/backups')
    const json = await res.json()
    if (!res.ok) {
      setError(json.error ?? 'Yedek listesi alınamadı')
      setLoading(false)
      return
    }
    setBackups(json.backups ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function createBackup() {
    setCreating(true)
    setError('')
    try {
      const res = await fetch('/api/backups', { method: 'POST' })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? 'Yedekleme başarısız')
        setCreating(false)
        return
      }
      await load()
    } catch {
      setError('Yedekleme sırasında bir hata oluştu')
    }
    setCreating(false)
  }

  async function downloadFile(path: string, fileName: string) {
    const { data, error } = await supabase.storage.from('backups').download(path)
    if (error || !data) {
      setError('Dosya indirilemedi')
      return
    }
    const url = URL.createObjectURL(data)
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    a.click()
    URL.revokeObjectURL(url)
  }

  function openRestoreModal(backup: BackupEntry) {
    setRestoreTarget(backup)
    setConfirmText('')
  }

  function closeRestoreModal() {
    setRestoreTarget(null)
    setConfirmText('')
  }

  async function executeRestore() {
    if (!restoreTarget || confirmText !== 'RESTORE') return
    setRestoring(true)
    setError('')
    try {
      const res = await fetch('/api/backups/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: restoreTarget.path }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? 'Geri yükleme başarısız. Lütfen tekrar deneyin.')
      } else {
        closeRestoreModal()
        setError('')
        window.location.reload()
      }
    } catch {
      setError('Geri yükleme sırasında bir hata oluştu. Lütfen tekrar deneyin.')
    }
    setRestoring(false)
  }

  if (loading) return <LoadingSpinner />

  return (
    <div className="max-w-4xl">
      <PageHeader
        title="Yedekleme"
        sub={`${backups.length} yedek`}
        action={
          <div className="flex items-center gap-2 flex-wrap justify-end">
            {/* Phase 7 — JSON export/import migrated from dashboard header */}
            <button
              onClick={downloadJsonExport}
              disabled={exportBusy}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border bg-white border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-40 transition-colors"
            >
              📦 Verileri İndir
            </button>
            <button
              onClick={() => importRef.current?.click()}
              disabled={exportBusy}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border bg-white border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-40 transition-colors"
            >
              📥 Yedek Yükle
            </button>
            <input ref={importRef} type="file" accept=".json" className="hidden" onChange={handleJsonImport} />
            <Btn onClick={createBackup} disabled={creating}>
              {creating ? 'Yedekleniyor...' : '+ Yedek Al'}
            </Btn>
            {exportMsg && (
              <span className={`text-xs px-2 py-1 rounded-lg font-medium ${
                exportMsg.includes('✓') ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
              }`}>
                {exportMsg}
              </span>
            )}
          </div>
        }
      />

      {error && <div className="mb-4"><ErrorBanner msg={error} /></div>}

      {/* Summary */}
      {backups.length > 0 && (
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">
              Toplam Yedek
            </div>
            <div className="text-2xl font-black tabular-nums">{backups.length}</div>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">
              Son Yedek
            </div>
            <div className="text-lg font-bold tabular-nums text-primary-600">
              {fmtBackupDate(backups[0]?.name ?? '')}
            </div>
          </div>
        </div>
      )}

      {/* Backup list */}
      {backups.length === 0 ? (
        <EmptyState
          icon="💾"
          title="Henüz yedek alınmadı"
          sub="Verilerinizi güvenle yedeklemek için butona tıklayın."
          action={
            <Btn onClick={createBackup} disabled={creating}>
              {creating ? 'Yedekleniyor...' : '+ Yedek Al'}
            </Btn>
          }
        />
      ) : (
        <div className="space-y-4">
          {backups.map(backup => (
            <div
              key={backup.name}
              className="bg-white border border-gray-200 rounded-xl p-5"
            >
              {/* Header row */}
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="text-sm font-bold text-gray-800">
                    {fmtBackupDate(backup.name)}
                  </div>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-xs text-gray-400">
                      {backup.fileCount} dosya
                    </span>
                    <span className="text-xs text-gray-400">
                      {fmtSize(backup.totalSize)}
                    </span>
                    {backup.metadata.total_rows !== undefined && (
                      <span className="text-xs text-gray-400">
                        {backup.metadata.total_rows} kayit
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Btn small variant="secondary" onClick={() => openRestoreModal(backup)}>
                    Geri Yukle
                  </Btn>
                </div>
              </div>

              {/* Table counts */}
              {backup.metadata.tables && (
                <div className="flex flex-wrap gap-2 mb-3">
                  {Object.entries(backup.metadata.tables).map(([table, count]) => (
                    <span
                      key={table}
                      className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-lg"
                    >
                      {table}: {count as number}
                    </span>
                  ))}
                </div>
              )}

              {/* File list */}
              <div className="border-t border-gray-100 pt-3">
                <div className="flex flex-wrap gap-2">
                  {backup.files
                    .filter(f => f.name !== 'metadata.json')
                    .map(file => (
                      <button
                        key={file.name}
                        onClick={() => downloadFile(file.path, file.name)}
                        className="inline-flex items-center gap-1.5 text-xs text-primary-600 hover:text-primary-800 bg-primary-50 hover:bg-primary-100 px-2.5 py-1.5 rounded-lg transition-colors"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        {file.name.replace('.json', '')}
                      </button>
                    ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Restore confirmation modal */}
      {restoreTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-2">
              Geri Yükleme Onayı
            </h3>
            <p className="text-sm text-gray-500 mb-1">
              <strong>{fmtBackupDate(restoreTarget.name)}</strong> tarihli yedek geri yüklenecek.
            </p>
            <div className="bg-red-50 border border-red-100 rounded-xl p-3 mb-4">
              <p className="text-sm text-red-700 font-medium">
                Bu işlem mevcut verilerinizin üzerine yazacaktır. Bu işlem geri alınamaz.
              </p>
            </div>
            <div className="mb-4">
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
                Onaylamak için &quot;RESTORE&quot; yazın
              </label>
              <input
                type="text"
                className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                placeholder="RESTORE"
                value={confirmText}
                onChange={e => setConfirmText(e.target.value)}
                autoFocus
              />
            </div>
            <div className="flex gap-2">
              <Btn
                variant="danger"
                onClick={executeRestore}
                disabled={confirmText !== 'RESTORE' || restoring}
              >
                {restoring ? 'Yükleniyor...' : 'Geri Yükle'}
              </Btn>
              <Btn variant="secondary" onClick={closeRestoreModal}>
                İptal
              </Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
