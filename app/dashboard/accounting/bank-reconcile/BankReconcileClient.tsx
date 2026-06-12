'use client'
// ── BankReconcileClient — read-only statement ↔ book reconciliation preview ────
//
// Upload a bank statement CSV → parse client-side → fetch book cash movements →
// reconcile → show matched/unmatched. NOTHING is persisted; this is a preview the
// owner can run before a real connector + storage exist (roadmap step 3).

import { useMemo, useRef, useState } from 'react'
import { parseBankStatement, reconcileBankToBook, type BookEntry, type BankLine } from '@/lib/connectors'

function fmt(n: number): string {
  return new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
}

export default function BankReconcileClient() {
  const [text, setText]       = useState('')
  const [book, setBook]       = useState<BookEntry[] | null>(null)
  const [loadingBook, setLB]  = useState(false)
  const [err, setErr]         = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const parsed = useMemo(() => {
    if (!text.trim()) return { transactions: [], skipped: 0 }
    try { return parseBankStatement(text) } catch { return { transactions: [], skipped: 0 } }
  }, [text])

  const result = useMemo(() => {
    if (!book || parsed.transactions.length === 0) return null
    const bankLines: BankLine[] = parsed.transactions.map(t => ({
      id: t.external_id, date: t.date, amount: t.amount, description: t.description,
    }))
    return reconcileBankToBook(bankLines, book, { dateWindowDays: 5 })
  }, [book, parsed])

  async function loadBook() {
    setLB(true); setErr('')
    try {
      const res = await fetch('/api/bank/book-entries')
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setErr(data.error ?? 'Defter hareketleri alınamadı'); return }
      setBook(data.entries ?? [])
    } catch { setErr('Bağlantı hatası') } finally { setLB(false) }
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return
    setText(await f.text())
  }

  const matchPct = result ? Math.round(result.matchRate * 100) : 0

  function downloadGaps() {
    if (!result) return
    const esc = (s: string) => (/[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s)
    const rows: string[] = ['﻿Yön;Tarih;Açıklama;Tutar (TRY)']
    for (const b of result.unmatchedBank) rows.push(['Bankada var, Flowra\'da yok', b.date, esc(b.description ?? ''), fmt(b.amount)].join(';'))
    for (const b of result.unmatchedBook) rows.push(['Flowra\'da var, bankada yok', b.date, esc(b.label ?? ''), fmt(b.amount)].join(';'))
    const blob = new Blob([rows.join('\r\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'flowra-mutabakat-acik-kalemler.csv'
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url)
  }

  return (
    <div className="flex flex-col gap-4 max-w-4xl">
      {/* Step 1 — upload */}
      <div className="fl-card p-4 flex flex-col gap-3">
        <div className="text-sm font-bold text-[#0f172a]">1 · Banka ekstresini yükle (CSV / MT940)</div>
        <p className="text-[11px] text-[#64748b]">
          Bankanızın CSV veya MT940 (.sta) ekstresini yükleyin ya da yapıştırın. Format ve sütunlar
          (Tarih · Açıklama · Tutar veya Borç/Alacak) otomatik tanınır. Hiçbir veri kaydedilmez — bu bir önizlemedir.
        </p>
        <div className="flex items-center gap-2">
          <button onClick={() => fileRef.current?.click()} className="border border-[#e8eaef] px-3 py-1.5 rounded text-xs font-semibold text-[#334155] hover:bg-[#f8fafc]">Dosya Seç (.csv / .sta)</button>
          <input ref={fileRef} type="file" accept=".csv,.sta,.txt,text/csv,text/plain" onChange={onFile} className="hidden" />
          <span className="text-[10px] text-[#94a3b8]">veya yapıştır</span>
        </div>
        <textarea
          value={text} onChange={e => setText(e.target.value)} rows={4}
          placeholder="Tarih;Açıklama;Borç;Alacak;Bakiye&#10;01.06.2026;ABC tahsilat;;31.500,00;131.500,00"
          className="w-full border border-[#e8eaef] rounded px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-brand/30 resize-y"
        />
        {text.trim() && (
          <div className="text-[11px] text-[#64748b]">
            <span className="font-bold text-[#0f172a]">{parsed.transactions.length}</span> hareket okundu
            {parsed.skipped > 0 && <span className="text-warn-text"> · {parsed.skipped} satır atlandı</span>}
          </div>
        )}
      </div>

      {/* Step 2 — match */}
      <div className="fl-card p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="text-sm font-bold text-[#0f172a]">2 · Flowra kayıtlarıyla eşleştir</div>
          <button
            onClick={loadBook}
            disabled={loadingBook || parsed.transactions.length === 0}
            className="bg-brand text-white px-3.5 py-2 rounded text-xs font-bold hover:bg-brand-light disabled:opacity-40 transition-colors"
          >
            {loadingBook ? 'Yükleniyor…' : 'Mutabakatı Çalıştır'}
          </button>
        </div>
        {err && <div className="text-xs text-neg bg-neg-light border border-neg-light rounded px-3 py-2">{err}</div>}

        {result && (
          <>
            {/* Summary */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-[#f8fafc] rounded-lg p-3">
                <div className="text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8]">Eşleşme</div>
                <div className={`text-xl font-black tabular-nums ${matchPct >= 80 ? 'text-pos-text' : matchPct >= 50 ? 'text-warn-text' : 'text-neg'}`}>%{matchPct}</div>
                <div className="text-[10px] text-[#94a3b8]">{result.matched.length} / {parsed.transactions.length} hareket</div>
              </div>
              <div className="bg-[#f8fafc] rounded-lg p-3">
                <div className="text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8]">Eşleşen Tutar</div>
                <div className="text-xl font-black tabular-nums text-[#0f172a]">₺{fmt(result.matchedAmountTry)}</div>
              </div>
              <div className="bg-[#f8fafc] rounded-lg p-3">
                <div className="text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8]">Açık Kalem</div>
                <div className="text-xl font-black tabular-nums text-neg">{result.unmatchedBank.length}</div>
                <div className="text-[10px] text-[#94a3b8]">eşleşmeyen banka hareketi</div>
              </div>
            </div>

            {(result.unmatchedBank.length > 0 || result.unmatchedBook.length > 0) && (
              <div className="flex justify-end">
                <button
                  onClick={downloadGaps}
                  className="border border-[#e8eaef] px-3 py-1.5 rounded text-xs font-semibold text-[#334155] hover:bg-[#f8fafc] transition-colors"
                >
                  Açık kalemleri CSV indir
                </button>
              </div>
            )}

            {/* Unmatched bank lines — the actionable list */}
            {result.unmatchedBank.length > 0 && (
              <div className="border border-[#e8eaef] rounded-lg overflow-hidden">
                <div className="px-3 py-2 bg-warn-light text-[10px] font-black uppercase tracking-widest text-warn-text">
                  Bankada var, Flowra'da yok — {result.unmatchedBank.length} hareket
                </div>
                <table className="w-full text-xs">
                  <tbody className="divide-y divide-[#f1f5f9]">
                    {result.unmatchedBank.slice(0, 30).map(b => (
                      <tr key={b.id}>
                        <td className="px-3 py-1.5 text-[#94a3b8] tabular-nums w-24">{b.date}</td>
                        <td className="px-3 py-1.5 text-[#334155] truncate max-w-[260px]">{b.description || '—'}</td>
                        <td className={`px-3 py-1.5 text-right tabular-nums font-semibold ${b.amount < 0 ? 'text-neg' : 'text-pos-text'}`}>₺{fmt(b.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Unmatched book entries — recorded in Flowra but not seen on the statement */}
            {result.unmatchedBook.length > 0 && (
              <div className="border border-[#e8eaef] rounded-lg overflow-hidden">
                <div className="px-3 py-2 bg-info-light text-[10px] font-black uppercase tracking-widest text-info-text">
                  Flowra'da var, bankada yok — {result.unmatchedBook.length} kayıt
                </div>
                <table className="w-full text-xs">
                  <tbody className="divide-y divide-[#f1f5f9]">
                    {result.unmatchedBook.slice(0, 30).map(b => (
                      <tr key={b.id}>
                        <td className="px-3 py-1.5 text-[#94a3b8] tabular-nums w-24">{b.date}</td>
                        <td className="px-3 py-1.5 text-[#334155] truncate max-w-[260px]">{b.label || '—'}</td>
                        <td className={`px-3 py-1.5 text-right tabular-nums font-semibold ${b.amount < 0 ? 'text-neg' : 'text-pos-text'}`}>₺{fmt(b.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <p className="text-[10px] text-[#94a3b8]">
              <strong>Bankada var, Flowra'da yok</strong> = girilmemiş tahsilat/ödeme olabilir.
              <strong> Flowra'da var, bankada yok</strong> = kaydı var ama banka hareketine henüz yansımamış. Bu
              önizleme hiçbir şey kaydetmez; otomatik içe alma, banka connector'ı + saklama tablosu geldiğinde açılacak.
            </p>
          </>
        )}
      </div>
    </div>
  )
}
