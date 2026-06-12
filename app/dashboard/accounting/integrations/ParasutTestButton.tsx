'use client'
// ── ParasutTestButton — read-only 'does my Paraşüt connection work?' check ─────
// POSTs to /api/connectors/parasut/test. Shows ok + a sample invoice or the error.
// Nothing is persisted.

import { useState } from 'react'

interface Result { ok: boolean; detail?: string; invoiceCount?: number; sample?: { no?: string | null; date?: string; party?: string; total?: number; currency?: string }[] }

export default function ParasutTestButton() {
  const [loading, setLoading] = useState(false)
  const [res, setRes] = useState<Result | null>(null)

  async function test() {
    setLoading(true); setRes(null)
    try {
      const r = await fetch('/api/connectors/parasut/test', { method: 'POST' })
      setRes(await r.json().catch(() => ({ ok: false, detail: 'Yanıt okunamadı' })))
    } catch { setRes({ ok: false, detail: 'Bağlantı hatası' }) }
    finally { setLoading(false) }
  }

  return (
    <div className="flex flex-col gap-1.5 mt-1">
      <button
        onClick={test}
        disabled={loading}
        className="self-start border border-[#e8eaef] px-3 py-1.5 rounded-lg text-[11px] font-semibold text-[#334155] hover:bg-[#f8fafc] disabled:opacity-50 transition-all"
      >
        {loading ? 'Test ediliyor…' : 'Bağlantıyı Test Et'}
      </button>
      {res && (
        <div className={`text-[10px] rounded px-2 py-1.5 border ${res.ok ? 'bg-pos-light border-pos-light text-pos-text' : 'bg-warn-light border-warn-light text-warn-text'}`}>
          {res.ok
            ? <>✓ Bağlantı çalışıyor{res.sample && res.sample.length > 0 && <> · örnek: {res.sample[0].party ?? '—'} · ₺{res.sample[0].total}</>}</>
            : <>Bağlanamadı — {res.detail}</>}
        </div>
      )}
    </div>
  )
}
