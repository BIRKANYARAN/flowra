'use client'
// ── CariReconcileClient — accounting cari ↔ Flowra customers (name match) ──────
//
// Upload your accounting system's customer/supplier (cari) list (CSV) → match by
// normalized name against Flowra's customers → surface who's missing on each side.
// Read-only — nothing is persisted.

import { useMemo, useRef, useState } from 'react'
import { parseCsv, gridToObjects } from '@/lib/csv'
import { reconcileByName, type NamedParty } from '@/lib/connectors'

const CARI_SYN: Record<string, string> = {
  'müşteri': 'name', 'müşteri adı': 'name', 'cari': 'name', 'cari unvanı': 'name', 'cari adı': 'name',
  'ünvan': 'name', 'unvan': 'name', 'ad': 'name', 'adı': 'name', 'isim': 'name', 'firma': 'name',
  'tedarikçi': 'name', 'name': 'name', 'müsteri': 'name',
}

export default function CariReconcileClient() {
  const [text, setText]   = useState('')
  const [flowra, setF]    = useState<NamedParty[] | null>(null)
  const [loading, setL]   = useState(false)
  const [err, setErr]     = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const cari = useMemo<NamedParty[]>(() => {
    if (!text.trim()) return []
    try {
      const { rows } = gridToObjects(parseCsv(text), CARI_SYN)
      return rows.map((r, i) => ({ id: `c:${i}`, name: (r.name ?? '').trim() })).filter(p => p.name)
    } catch { return [] }
  }, [text])

  const result = useMemo(() => {
    if (!flowra || cari.length === 0) return null
    return reconcileByName(cari, flowra)
  }, [flowra, cari])

  async function loadFlowra() {
    setL(true); setErr('')
    try {
      const res = await fetch('/api/customers/recon-entries')
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setErr(data.error ?? 'Müşteriler alınamadı'); return }
      setF(data.entries ?? [])
    } catch { setErr('Bağlantı hatası') } finally { setL(false) }
  }
  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (f) setText(await f.text())
  }

  const matchPct = result ? Math.round(result.matchRate * 100) : 0

  return (
    <div className="flex flex-col gap-4 max-w-4xl">
      <div className="fl-card p-4 flex flex-col gap-3">
        <div className="text-sm font-bold text-[#0f172a]">1 · Muhasebe cari listesini yükle (CSV)</div>
        <p className="text-[11px] text-[#64748b]">
          Muhasebe sisteminizden müşteri/tedarikçi (cari) listesini CSV olarak yükleyin. Unvan sütunu otomatik
          tanınır; A.Ş./Ltd./Şti. gibi ekler ve yazım farkları normalize edilir. Hiçbir veri kaydedilmez.
        </p>
        <div className="flex items-center gap-2">
          <button onClick={() => fileRef.current?.click()} className="border border-[#e8eaef] px-3 py-1.5 rounded-lg text-xs font-semibold text-[#334155] hover:bg-[#f8fafc]">Dosya Seç (.csv)</button>
          <input ref={fileRef} type="file" accept=".csv,text/csv,text/plain" onChange={onFile} className="hidden" />
          <span className="text-[10px] text-[#94a3b8]">veya yapıştır</span>
        </div>
        <textarea
          value={text} onChange={e => setText(e.target.value)} rows={4}
          placeholder="Cari Unvanı&#10;ABC Teknoloji A.Ş.&#10;XYZ Lojistik Ltd. Şti."
          className="w-full border border-[#e8eaef] rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-brand/30 resize-y"
        />
        {text.trim() && <div className="text-[11px] text-[#64748b]"><span className="font-bold text-[#0f172a]">{cari.length}</span> cari okundu</div>}
      </div>

      <div className="fl-card p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="text-sm font-bold text-[#0f172a]">2 · Flowra müşterileriyle eşleştir</div>
          <button onClick={loadFlowra} disabled={loading || cari.length === 0}
            className="bg-brand text-white px-3.5 py-2 rounded-lg text-xs font-bold hover:bg-brand-light disabled:opacity-40 transition-all">
            {loading ? 'Yükleniyor…' : 'Mutabakatı Çalıştır'}
          </button>
        </div>
        {err && <div className="text-xs text-neg bg-neg-light border border-neg-light rounded px-3 py-2">{err}</div>}

        {result && (
          <>
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-[#f8fafc] rounded-lg p-3">
                <div className="text-[0.6rem] font-bold uppercase tracking-wider text-[#94a3b8]">Eşleşme</div>
                <div className={`text-xl font-bold tabular-nums ${matchPct >= 80 ? 'text-pos-text' : matchPct >= 50 ? 'text-warn-text' : 'text-neg'}`}>%{matchPct}</div>
                <div className="text-[10px] text-[#94a3b8]">{result.matched.length} / {cari.length} cari</div>
              </div>
              <div className="bg-[#f8fafc] rounded-lg p-3">
                <div className="text-[0.6rem] font-bold uppercase tracking-wider text-[#94a3b8]">Flowra'da Yok</div>
                <div className="text-xl font-bold tabular-nums text-neg">{result.onlyInA.length}</div>
                <div className="text-[10px] text-[#94a3b8]">eklenmemiş cari</div>
              </div>
              <div className="bg-[#f8fafc] rounded-lg p-3">
                <div className="text-[0.6rem] font-bold uppercase tracking-wider text-[#94a3b8]">Sadece Flowra'da</div>
                <div className="text-xl font-bold tabular-nums text-[#0f172a]">{result.onlyInB.length}</div>
                <div className="text-[10px] text-[#94a3b8]">muhasebede yok</div>
              </div>
            </div>

            {result.onlyInA.length > 0 && (
              <div className="border border-[#e8eaef] rounded-lg overflow-hidden">
                <div className="px-3 py-2 bg-warn-light text-[10px] font-bold uppercase tracking-wider text-warn-text">
                  Muhasebede var, Flowra'da yok — {result.onlyInA.length} cari
                </div>
                <ul className="divide-y divide-[#f1f5f9]">
                  {result.onlyInA.slice(0, 50).map(p => (
                    <li key={p.id} className="px-3 py-1.5 text-xs text-[#334155] truncate">{p.name}</li>
                  ))}
                </ul>
              </div>
            )}

            <p className="text-[10px] text-[#94a3b8]">
              <strong>Muhasebede var, Flowra'da yok</strong> = Flowra'ya eklenmemiş cari. Bunları “Müşteriler → İçe
              Aktar” ile toplu ekleyebilirsiniz. Bu önizleme hiçbir şey kaydetmez.
            </p>
          </>
        )}
      </div>
    </div>
  )
}
