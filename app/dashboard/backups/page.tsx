// ── /dashboard/backups — Yedekleme Merkezi (server component) ────────────────
//
// FAZ 15: Converted from 'use client' to server component.
//
// Server-rendered sections (static, no JS):
//   Zone 1 — KPI strip: total backups, latest backup date, total storage used
//   Zone 2 — Per-backup size bar chart (top 5)
//
// Client island:
//   BackupsClient — create, file download, restore modal, JSON export/import
//
// Self-HTTP eliminated: backup list fetched directly from Supabase Storage
// (replicates GET /api/backups logic — no fetch() call needed).

export const dynamic = 'force-dynamic'

import { redirect }     from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import BackupsClient, { type BackupEntry, fmtSize, fmtBackupDate } from './BackupsClient'

// ── Analytics helpers (pure, tested in tests/backup-analytics.test.ts) ────────

function totalBackupSize(backups: BackupEntry[]): number {
  return backups.reduce((sum, b) => sum + b.totalSize, 0)
}

function latestBackupName(backups: BackupEntry[]): string | null {
  // backups are already sorted descending (newest first) from storage list
  return backups[0]?.name ?? null
}

// ── Page ──────────────────────────────────────────────────────────────────────

const BUCKET = 'backups'

export default async function BackupsPage() {
  const supabase = createClient()
  let uid: string
  try {
    const { data, error } = await supabase.auth.getUser()
    if (error || !data?.user) redirect('/auth')
    uid = data.user.id
  } catch (e) {
    if (e && typeof e === 'object' && 'digest' in e) throw e
    redirect('/auth')
  }

  // ── Replicate GET /api/backups — list storage folders for this user ─────────
  const prefix = `${uid}/`
  const { data: folders } = await supabase.storage
    .from(BUCKET)
    .list(prefix, { limit: 100, sortBy: { column: 'name', order: 'desc' } })

  const backups: BackupEntry[] = []

  for (const folder of folders ?? []) {
    if (!folder.name) continue
    const folderPath = `${prefix}${folder.name}`

    // Read metadata.json
    const { data: metaFile } = await supabase.storage
      .from(BUCKET)
      .download(`${folderPath}/metadata.json`)

    let metadata: BackupEntry['metadata'] = {}
    if (metaFile) {
      try { metadata = JSON.parse(await metaFile.text()) as BackupEntry['metadata'] }
      catch { /* ignore parse errors */ }
    }

    // List files in this backup folder
    const { data: files } = await supabase.storage
      .from(BUCKET)
      .list(folderPath, { limit: 50 })

    const totalSize = (files ?? []).reduce((sum, f) => sum + (f.metadata?.size ?? 0), 0)

    backups.push({
      name:      folder.name,
      path:      folderPath,
      fileCount: (files ?? []).length,
      totalSize,
      metadata,
      files: (files ?? []).map(f => ({
        name: f.name,
        size: f.metadata?.size ?? 0,
        path: `${folderPath}/${f.name}`,
      })),
    })
  }

  // ── Server-side analytics ──────────────────────────────────────────────────
  const totalSize  = totalBackupSize(backups)
  const latestName = latestBackupName(backups)

  return (
    <div className="max-w-4xl space-y-6">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-xl font-black text-gray-900 tracking-tight">Yedekleme</h1>
        <p className="text-xs text-gray-400 mt-0.5">
          Veri yedekleme ve geri yükleme · {backups.length} yedek
        </p>
      </div>

      {/* ── Zone 1: KPI Strip ────────────────────────────────────────────── */}
      {backups.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-0 bg-white border border-gray-200 rounded-xl overflow-hidden">
          {[
            {
              label: 'Toplam Yedek',
              value: String(backups.length),
              sub:   'yedek dosyası',
              color: 'text-gray-900',
            },
            {
              label: 'Son Yedek',
              value: latestName ? fmtBackupDate(latestName) : '—',
              sub:   'en güncel yedek',
              color: 'text-primary-600',
            },
            {
              label: 'Toplam Boyut',
              value: totalSize > 0 ? fmtSize(totalSize) : '—',
              sub:   'depolama alanı',
              color: 'text-gray-700',
            },
          ].map((card, i) => (
            <div key={card.label}
              className={`p-3 ${i < 2 ? 'border-b sm:border-b-0 sm:border-r border-gray-100' : ''}`}>
              <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">{card.label}</div>
              <div className={`text-lg font-black tabular-nums leading-none ${card.color}`}>{card.value}</div>
              <div className="text-[10px] text-gray-400 mt-1">{card.sub}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── Zone 2: Backup size chart (top 5, server-rendered) ───────────── */}
      {backups.length > 1 && (
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">
            Yedek Boyutları (son 5)
          </div>
          <div className="space-y-2">
            {backups.slice(0, 5).map(b => {
              const pct = totalSize > 0 ? Math.round((b.totalSize / totalSize) * 100) : 0
              return (
                <div key={b.name}>
                  <div className="flex justify-between items-center mb-0.5">
                    <span className="text-xs text-gray-600">{fmtBackupDate(b.name)}</span>
                    <span className="text-xs font-semibold tabular-nums text-gray-700">
                      {fmtSize(b.totalSize)}
                    </span>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary-400 rounded-full transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Client island: toolbar + backup list ─────────────────────────── */}
      <BackupsClient initialBackups={backups} />

    </div>
  )
}
