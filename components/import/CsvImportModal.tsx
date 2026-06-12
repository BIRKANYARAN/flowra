'use client'
// ── CsvImportModal — paste/upload a CSV, preview, bulk-import ──────────────────
// Generic over the target entity: the caller passes the API endpoint, the
// header→field synonym dictionary, and the field list. Parsing happens fully
// client-side (lib/csv) so the preview is instant; only the mapped rows are POSTed.

import { useMemo, useRef, useState } from 'react'
import { parseCsv, gridToObjects } from '@/lib/csv'

export interface ImportField { key: string; label: string; required?: boolean }

interface Props {
  open: boolean
  onClose: () => void
  onDone: () => void                       // called after a successful import
  title: string
  endpoint: string                          // POST { rows } → { inserted, skipped, errorCount }
  synonyms: Record<string, string>
  fields: ImportField[]
  sampleHeaders: string                     // shown as a hint / template
}

type Result = { inserted: number; skipped: number; errorCount: number } | null

export function CsvImportModal({ open, onClose, onDone, title, endpoint, synonyms, fields, sampleHeaders }: Props) {
  const [text, setText]         = useState('')
  const [importing, setImport]  = useState(false)
  const [result, setResult]     = useState<Result>(null)
  const [error, setError]       = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const parsed = useMemo(() => {
    if (!text.trim()) return { fields: [], rows: [] as Record<string, string>[] }
    try { return gridToObjects(parseCsv(text), synonyms) }
    catch { return { fields: [], rows: [] as Record<string, string>[] } }
  }, [text, synonyms])

  const requiredKey = fields.find(f => f.required)?.key
  const hasRequired = requiredKey ? parsed.fields.includes(requiredKey) : true
  const validRows   = requiredKey ? parsed.rows.filter(r => (r[requiredKey] ?? '').trim() !== '') : parsed.rows

  if (!open) return null

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setText(await file.text())
    setResult(null); setError('')
  }

  async function doImport() {
    setImport(true); setError(''); setResult(null)
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: validRows }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(data.error ?? 'İçe aktarma başarısız'); return }
      setResult({ inserted: data.inserted ?? 0, skipped: data.skipped ?? 0, errorCount: data.errorCount ?? 0 })
      if ((data.inserted ?? 0) > 0) onDone()
    } catch {
      setError('Bağlantı hatası')
    } finally {
      setImport(false)
    }
  }

  const previewCols = fields.filter(f => parsed.fields.includes(f.key))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[88vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#e8eaef] sticky top-0 bg-white">
          <h3 className="font-bold text-sm text-[#0f172a]">{title}</h3>
          <button onClick={onClose} className="text-[#94a3b8] hover:text-[#334155] text-lg leading-none p-1">✕</button>
        </div>

        <div className="p-5 space-y-4">
          {!result && (
            <>
              <div className="text-xs text-[#64748b] leading-relaxed">
                Excel/Sheets dosyanı <strong>CSV olarak kaydet</strong> ve aşağıya yükle ya da yapıştır.
                İlk satır başlık olmalı. Tanınan başlıklar (TR/EN) otomatik eşlenir; ayraç (<code>,</code> / <code>;</code>) otomatik algılanır.
                <div className="mt-1 text-[10px] text-[#94a3b8]">Örnek başlık: <code>{sampleHeaders}</code></div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => fileRef.current?.click()}
                  className="border border-[#e8eaef] px-3 py-1.5 rounded text-xs font-semibold text-[#334155] hover:bg-[#f8fafc]"
                >
                  Dosya Seç (.csv)
                </button>
                <input ref={fileRef} type="file" accept=".csv,text/csv,text/plain" onChange={onFile} className="hidden" />
                <span className="text-[10px] text-[#94a3b8]">veya aşağıya yapıştır</span>
              </div>

              <textarea
                value={text}
                onChange={e => { setText(e.target.value); setResult(null); setError('') }}
                rows={6}
                placeholder={sampleHeaders + '\n…'}
                className="w-full border border-[#e8eaef] rounded px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-brand/30 bg-white resize-y"
              />

              {text.trim() && !hasRequired && (
                <div className="text-xs text-warn-text bg-warn-light border border-warn-light rounded px-3 py-2">
                  Zorunlu sütun bulunamadı. Başlık satırında “{fields.find(f => f.required)?.label}” karşılığı bir kolon olmalı.
                </div>
              )}

              {text.trim() && hasRequired && (
                <div className="border border-[#e8eaef] rounded-lg overflow-hidden">
                  <div className="px-3 py-2 bg-[#f8fafc] text-[10px] font-bold uppercase tracking-wider text-[#94a3b8] border-b border-[#e8eaef]">
                    Önizleme — {validRows.length} geçerli satır
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-[#94a3b8] text-[10px] border-b border-[#f1f5f9]">
                          {previewCols.map(c => <th key={c.key} className="text-left px-3 py-1.5 font-semibold">{c.label}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {validRows.slice(0, 5).map((r, i) => (
                          <tr key={i} className="border-b border-[#f8fafc]">
                            {previewCols.map(c => <td key={c.key} className="px-3 py-1.5 text-[#334155] truncate max-w-[160px]">{r[c.key] ?? '—'}</td>)}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {error && <div className="text-xs text-neg bg-neg-light border border-neg-light rounded px-3 py-2">{error}</div>}

              <div className="flex gap-2 justify-end">
                <button onClick={onClose} className="border border-[#e8eaef] px-4 py-2 rounded text-xs font-medium hover:bg-[#f8fafc]">İptal</button>
                <button
                  onClick={doImport}
                  disabled={importing || !hasRequired || validRows.length === 0}
                  className="bg-brand text-white px-4 py-2 rounded text-xs font-bold hover:bg-brand-light disabled:opacity-40 transition-colors"
                >
                  {importing ? 'İçe aktarılıyor…' : `${validRows.length} kaydı içe aktar`}
                </button>
              </div>
            </>
          )}

          {result && (
            <div className="space-y-3 text-center py-4">
              <div className="text-3xl">✅</div>
              <div className="text-sm font-bold text-[#0f172a]">{result.inserted} kayıt içe aktarıldı</div>
              <div className="text-xs text-[#64748b]">
                {result.skipped > 0 && <span>{result.skipped} yinelenen atlandı · </span>}
                {result.errorCount > 0 && <span className="text-warn-text">{result.errorCount} hatalı satır</span>}
                {result.skipped === 0 && result.errorCount === 0 && <span>Tümü başarıyla eklendi.</span>}
              </div>
              <button onClick={onClose} className="bg-brand text-white px-5 py-2 rounded text-xs font-bold hover:bg-brand-light">Tamam</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
