'use client'
// Dashboard toolbar: 🔄 Kur Güncelle / 📦 İndir / 📥 Yükle

import { useRef, useState, type ChangeEvent } from 'react'

type Status = { kind: 'success' | 'error' | 'info'; msg: string } | null

export function DashboardActions() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [status, setStatus] = useState<Status>(null)
  const [busy,   setBusy]   = useState(false)

  function flash(kind: 'success' | 'error' | 'info', msg: string, ms = 4000) {
    setStatus({ kind, msg })
    if (ms > 0) setTimeout(() => setStatus(null), ms)
  }

  // ── Refresh FX rates ──────────────────────────────────────────────────────
  async function refreshFx() {
    setBusy(true)
    flash('info', 'Kur güncelleniyor…', 0)
    try {
      const res  = await fetch('/api/fx', { cache: 'no-store' })
      const data = await res.json()
      if (!res.ok) {
        flash('error', data.error || 'Kur alınamadı')
      } else if (data.source === 'fallback') {
        flash('error', 'TCMB ve önbellek boş — kur verisi yok')
      } else {
        const src = data.source === 'tcmb_today'             ? 'TCMB'
                  : data.source === 'tcmb_last_business_day' ? 'TCMB (son iş günü)'
                  : 'TCMB (kayıtlı)'
        flash('success', `USD ₺${Number(data.USD).toFixed(4)}  ·  EUR ₺${Number(data.EUR).toFixed(4)}  [${src}]`)
      }
    } catch {
      flash('error', 'Ağ hatası — kur güncellenemedi')
    }
    setBusy(false)
  }

  // ── Export backup ─────────────────────────────────────────────────────────
  async function downloadExport() {
    setBusy(true)
    try {
      const res = await fetch('/api/export')
      if (!res.ok) { flash('error', 'Dışa aktarma başarısız'); setBusy(false); return }
      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      a.download = `flowra-backup-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
      flash('success', 'Yedek indirildi ✓')
    } catch { flash('error', 'İndirme hatası') }
    setBusy(false)
  }

  // ── Import backup ─────────────────────────────────────────────────────────
  async function handleImport(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setBusy(true)
    try {
      const text = await file.text()
      const res  = await fetch('/api/import', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    text,
      })
      const data = await res.json()
      if (!res.ok) flash('error', data.error || 'Yükleme başarısız')
      else { flash('success', 'Yedek yüklendi ✓'); setTimeout(() => location.reload(), 1500) }
    } catch { flash('error', 'Dosya okunamadı') }
    setBusy(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  const btn = 'inline-flex items-center gap-1.5 px-3 py-2 rounded text-xs font-semibold border transition-colors disabled:opacity-40 cursor-pointer'
  const gray = `${btn} bg-white border-[#e2e8f0] text-gray-700 hover:bg-[#f8fafc]`

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex gap-2 flex-wrap justify-end">
        <button onClick={refreshFx}                       disabled={busy} className={gray}>🔄 Kur Güncelle</button>
        <button onClick={downloadExport}                  disabled={busy} className={gray}>📦 Verileri İndir</button>
        <button onClick={() => fileRef.current?.click()} disabled={busy} className={gray}>📥 Yedek Yükle</button>
        <input ref={fileRef} type="file" accept=".json" className="hidden" onChange={handleImport} />
      </div>
      {status && (
        <div className={`text-xs px-3 py-1.5 rounded font-medium max-w-sm text-right ${
          status.kind === 'success' ? 'bg-pos-light text-pos-text border border-pos-light'
        : status.kind === 'error'   ? 'bg-neg-light text-neg-text border border-neg-light'
                                    : 'bg-info-light text-info-text border border-info-light'
        }`}>
          {status.msg}
        </div>
      )}
    </div>
  )
}
