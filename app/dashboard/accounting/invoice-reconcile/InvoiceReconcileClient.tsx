'use client'
// ── InvoiceReconcileClient — accounting invoices ↔ Flowra sales preview ────────
//
// Upload your accounting / e-Fatura system's invoice list (CSV) → match against
// Flowra's sales by amount + date → surface 'muhasebede var, Flowra'da yok'
// (invoices not yet in Flowra) and the reverse. Read-only — nothing is persisted.

import { useMemo, useRef, useState } from 'react'
import { parseCsv, gridToObjects } from '@/lib/csv'
import { parseTrNumber, parseStmtDate, reconcileBankToBook, type BookEntry, type BankLine } from '@/lib/connectors'

const INVOICE_SYN: Record<string, string> = {
  'tarih': 'date', 'fatura tarihi': 'date', 'belge tarihi': 'date', 'düzenleme tarihi': 'date', 'date': 'date',
  'tutar': 'amount', 'genel toplam': 'amount', 'toplam': 'amount', 'fatura tutarı': 'amount', 'tutarı': 'amount',
  'ödenecek': 'amount', 'amount': 'amount', 'total': 'amount',
  'müşteri': 'party', 'cari': 'party', 'cari unvanı': 'party', 'ünvan': 'party', 'unvan': 'party',
  'müşteri adı': 'party', 'alıcı': 'party',
  'fatura no': 'no', 'belge no': 'no', 'fatura numarası': 'no', 'no': 'no', 'invoice no': 'no',
}

function fmt(n: number): string {
  return new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
}

export default function InvoiceReconcileClient() {
  const [text, setText]      = useState('')
  const [sales, setSales]    = useState<BookEntry[] | null>(null)
  const [loading, setL]      = useState(false)
  const [err, setErr]        = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const invoices = useMemo<BankLine[]>(() => {
    if (!text.trim()) return []
    try {
      const { rows } = gridToObjects(parseCsv(text), INVOICE_SYN)
      return rows
        .map((r, i) => {
          const amount = parseTrNumber(r.amount)
          const date   = parseStmtDate(r.date)
          return { id: `inv:${i}`, date, amount: Math.abs(amount), description: [r.no, r.party].filter(Boolean).join(' · ') }
        })
        .filter(l => l.date && isFinite(l.amount) && l.amount > 0)
    } catch { return [] }
  }, [text])

  const result = useMemo(() => {
    if (!sales || invoices.length === 0) return null
    return reconcileBankToBook(invoices, sales, { dateWindowDays: 7 })
  }, [sales, invoices])

  async function loadSales() {
    setL(true); setErr('')
    try {
      const res = await fetch('/api/sales/recon-entries')
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setErr(data.error ?? 'Satışlar alınamadı'); return }
      setSales(data.entries ?? [])
    } catch { setErr('Bağlantı hatası') } finally { setL(false) }
  }
  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (f) setText(await f.text())
  }

  const matchPct = result ? Math.round(result.matchRate * 100) : 0

  return (
    <div className="flex flex-col gap-4 max-w-4xl">
      <div className="fl-card p-4 flex flex-col gap-3">
        <div className="text-sm font-bold text-[#0f172a]">1 · Muhasebe fatura listesini yükle (CSV)</div>
        <p className="text-[11px] text-[#64748b]">
          Muhasebe/e-Fatura sisteminizden fatura listesini CSV olarak dışa aktarın ve yükleyin.
          Tarih · Tutar · Müşteri · Fatura No sütunları otomatik tanınır. Hiçbir veri kaydedilmez.
        </p>
        <div className="flex items-center gap-2">
          <button onClick={() => fileRef.current?.click()} className="border border-[#e8eaef] px-3 py-1.5 rounded-lg text-xs font-semibold text-[#334155] hover:bg-[#f8fafc]">Dosya Seç (.csv)</button>
          <input ref={fileRef} type="file" accept=".csv,text/csv,text/plain" onChange={onFile} className="hidden" />
          <span className="text-[10px] text-[#94a3b8]">veya yapıştır</span>
        </div>
        <textarea
          value={text} onChange={e => setText(e.target.value)} rows={4}
          placeholder="Fatura No;Tarih;Müşteri;Tutar&#10;FTR-1;01.06.2026;ABC A.Ş.;31.500,00"
          className="w-full border border-[#e8eaef] rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-brand/30 resize-y"
        />
        {text.trim() && <div className="text-[11px] text-[#64748b]"><span className="font-bold text-[#0f172a]">{invoices.length}</span> fatura okundu</div>}
      </div>

      <div className="fl-card p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="text-sm font-bold text-[#0f172a]">2 · Flowra satışlarıyla eşleştir</div>
          <button onClick={loadSales} disabled={loading || invoices.length === 0}
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
                <div className="text-[10px] text-[#94a3b8]">{result.matched.length} / {invoices.length} fatura</div>
              </div>
              <div className="bg-[#f8fafc] rounded-lg p-3">
                <div className="text-[0.6rem] font-bold uppercase tracking-wider text-[#94a3b8]">Eşleşen Tutar</div>
                <div className="text-xl font-bold tabular-nums text-[#0f172a]">₺{fmt(result.matchedAmountTry)}</div>
              </div>
              <div className="bg-[#f8fafc] rounded-lg p-3">
                <div className="text-[0.6rem] font-bold uppercase tracking-wider text-[#94a3b8]">Flowra'da Yok</div>
                <div className="text-xl font-bold tabular-nums text-neg">{result.unmatchedBank.length}</div>
                <div className="text-[10px] text-[#94a3b8]">girilmemiş fatura</div>
              </div>
            </div>

            {result.unmatchedBank.length > 0 && (
              <div className="border border-[#e8eaef] rounded-lg overflow-hidden">
                <div className="px-3 py-2 bg-warn-light text-[10px] font-bold uppercase tracking-wider text-warn-text">
                  Muhasebede var, Flowra'da yok — {result.unmatchedBank.length} fatura
                </div>
                <table className="w-full text-xs">
                  <tbody className="divide-y divide-[#f1f5f9]">
                    {result.unmatchedBank.slice(0, 40).map(b => (
                      <tr key={b.id}>
                        <td className="px-3 py-1.5 text-[#94a3b8] tabular-nums w-24">{b.date}</td>
                        <td className="px-3 py-1.5 text-[#334155] truncate max-w-[280px]">{b.description || '—'}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums font-semibold text-[#0f172a]">₺{fmt(b.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {result.unmatchedBook.length > 0 && (
              <div className="border border-[#e8eaef] rounded-lg overflow-hidden">
                <div className="px-3 py-2 bg-info-light text-[10px] font-bold uppercase tracking-wider text-info-text">
                  Flowra'da var, muhasebede yok — {result.unmatchedBook.length} satış
                </div>
                <table className="w-full text-xs">
                  <tbody className="divide-y divide-[#f1f5f9]">
                    {result.unmatchedBook.slice(0, 40).map(b => (
                      <tr key={b.id}>
                        <td className="px-3 py-1.5 text-[#94a3b8] tabular-nums w-24">{b.date}</td>
                        <td className="px-3 py-1.5 text-[#334155] truncate max-w-[280px]">{b.label || '—'}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums font-semibold text-[#0f172a]">₺{fmt(b.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <p className="text-[10px] text-[#94a3b8]">
              <strong>Muhasebede var, Flowra'da yok</strong> = Flowra'ya girilmemiş satış faturaları. Bu önizleme
              hiçbir şey kaydetmez; otomatik içe alma, muhasebe connector'ı geldiğinde açılacak.
            </p>
          </>
        )}
      </div>
    </div>
  )
}
