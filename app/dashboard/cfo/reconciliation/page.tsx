'use client'

// /dashboard/cfo/reconciliation — GL vs Operasyonel Mutabakat
//
// Compares GL-derived account balances with operational table totals.
// Surfaces drift between double-entry ledger and sales/expenses tables.
// Essential before period close — CFO must clear all critical items.

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Skeleton } from '@/components/ds'
import { fmtTRY as fmt } from '@/lib/format'

interface ReconciliationItem {
  name:        string
  gl_value:    number
  operational: number
  diff:        number
  passed:      boolean
  severity:    'ok' | 'warning' | 'critical'
}

interface ReconciliationReport {
  company_id:    string
  period_id:     string | null
  items:         ReconciliationItem[]
  is_reconciled: boolean
  checked_at:    string
}

const SEV_CONFIG = {
  ok:       { cls: 'bg-pos-light text-pos-text border-pos-light', icon: '✓', label: 'Tamam'    },
  warning:  { cls: 'bg-warn-light text-warn-text border-warn-light',       icon: '!', label: 'Uyarı'    },
  critical: { cls: 'bg-neg-light text-neg-text border-neg-light',             icon: '✗', label: 'Kritik'   },
}

const PRINT_STYLE = `
@media print {
  body { background: white !important; -webkit-print-color-adjust: exact; }
  [data-print-hide] { display: none !important; }
  .print\\:block { display: block !important; }
}
`

function StatusBanner({ report }: { report: ReconciliationReport }) {
  const criticalCount = report.items.filter(i => i.severity === 'critical').length
  const warnCount     = report.items.filter(i => i.severity === 'warning').length

  if (report.is_reconciled && criticalCount === 0 && warnCount === 0) {
    return (
      <div className="bg-pos-light border border-pos-light rounded px-4 py-3 flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-pos-light flex items-center justify-center text-pos-text font-black text-sm shrink-0">✓</div>
        <div>
          <div className="text-xs font-black text-pos-text">Mutabakat Tamamlandı — Dönem Kapanışına Hazır</div>
          <div className="text-[10px] text-pos-text mt-0.5">Tüm GL hesapları operasyonel tablolarla uyuşuyor. 100 TRY üzeri fark bulunmuyor.</div>
        </div>
      </div>
    )
  }

  if (criticalCount > 0) {
    return (
      <div className="bg-neg-light border border-neg-light rounded px-4 py-3 flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-neg-light flex items-center justify-center text-neg-text font-black text-sm shrink-0">✗</div>
        <div>
          <div className="text-xs font-black text-neg-text">Kritik Farklar Mevcut — Dönem Kapatılamaz</div>
          <div className="text-[10px] text-neg mt-0.5">
            {criticalCount} kritik, {warnCount} uyarı. 100 TRY üzerindeki farklar giderilmeden dönem kapanışı engellenilir.
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-warn-light border border-warn-light rounded px-4 py-3 flex items-center gap-3">
      <div className="w-8 h-8 rounded-full bg-warn-light flex items-center justify-center text-warn-text font-black text-sm shrink-0">!</div>
      <div>
        <div className="text-xs font-black text-warn-text">Küçük Farklar Var — Dönem Kapatılabilir</div>
        <div className="text-[10px] text-warn-text mt-0.5">
          {warnCount} uyarı (1–99 TRY arası). Zamanlama farkı olabilir — araştırılması önerilir.
        </div>
      </div>
    </div>
  )
}

export default function ReconciliationPage() {
  const [report,   setReport]   = useState<ReconciliationReport | null>(null)
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState<string | null>(null)
  const [lastRun,  setLastRun]  = useState<string | null>(null)

  const runCheck = useCallback(() => {
    setLoading(true)
    setError(null)
    const asOf = new Date().toISOString().slice(0, 10)
    fetch(`/api/reconciliation?as_of=${asOf}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) throw new Error(d.error)
        setReport(d as ReconciliationReport)
        setLastRun(new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }))
      })
      .catch(err => setError(err.message ?? 'Mutabakat yüklenemedi'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { runCheck() }, [runCheck])

  const criticalCount = report?.items.filter(i => i.severity === 'critical').length ?? 0
  const warnCount     = report?.items.filter(i => i.severity === 'warning').length ?? 0
  const okCount       = report?.items.filter(i => i.severity === 'ok').length ?? 0

  // ── C5: Reconciliation Intelligence — causal narrative ─────────────────────
  const reconLines: string[] = []
  if (report) {
    const criticalItems = report.items.filter(i => i.severity === 'critical')
    const warnItems     = report.items.filter(i => i.severity === 'warning')

    if (criticalItems.length === 0 && warnItems.length === 0) {
      reconLines.push('GL ve operasyonel tablolar tamamen uyuşuyor — dönem kapanışı için muhasebe bütünlüğü teyit edildi.')
    }
    if (criticalItems.length > 0) {
      reconLines.push(
        `${criticalItems.length} kritik fark (${criticalItems.map(i => i.name).join(', ')}) — GL ile operasyonel tablolar uyuşmuyor. Genellikle eksik veya hatalı journal entry nedeniyle oluşur.`
      )
      reconLines.push(
        'Kritik farklar giderilmeden bu dönemin gelir tablosu ve bilançosu kesinleştirilmemeli — dönem kapanışı engellenecek.'
      )
    }
    if (warnItems.length > 0) {
      reconLines.push(
        `${warnItems.length} zamanlama farkı — dönem kesim tarihine yakın işlemler bir sonraki dönem kapanışına sarkabilir. Araştırılması önerilir ama kapanışı engellemez.`
      )
    }
  }

  return (
    <div className="flex flex-col gap-4 max-w-4xl">
      <style dangerouslySetInnerHTML={{ __html: PRINT_STYLE }} />

      {/* Header */}
      <div className="flex items-center justify-between" data-print-hide>
        <div>
          <h1 className="text-2xl font-black text-[#0f172a] tracking-tight">GL Mutabakat</h1>
          <p className="text-xs text-[#94a3b8] mt-0.5">
            GL hesap bakiyeleri · Operasyonel tablo karşılaştırması
            {lastRun && <span className="ml-1 text-[#cbd5e1]">· {lastRun} itibarıyla</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={runCheck}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-[#e2e8f0] bg-white text-xs font-semibold text-[#64748b] hover:bg-[#f8fafc] hover:border-[#e2e8f0] transition-colors disabled:opacity-50"
          >
            <svg className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {loading ? 'Kontrol ediliyor…' : 'Yenile'}
          </button>
          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-[#e2e8f0] bg-white text-xs font-semibold text-[#64748b] hover:bg-[#f8fafc] hover:border-[#e2e8f0] transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            PDF
          </button>
          <Link href="/dashboard/finance?tab=cfo" className="text-xs text-[#94a3b8] hover:text-brand-light font-semibold">
            ← CFO Cockpit
          </Link>
        </div>
      </div>

      {/* Print-only header */}
      <div className="hidden print:block mb-2">
        <div className="text-[10px] uppercase tracking-widest text-[#94a3b8] font-black">Flowra — CFO Raporu</div>
        <h1 className="text-2xl font-black text-[#0f172a]">GL Mutabakat Raporu</h1>
        <p className="text-xs text-[#64748b] mt-0.5">
          {new Date().toLocaleDateString('tr-TR', { day:'2-digit', month:'long', year:'numeric' })} itibarıyla
        </p>
      </div>

      {error && (
        <div className="bg-neg-light border border-neg-light rounded px-4 py-3 text-xs text-neg-text">{error}</div>
      )}

      {loading && !report && (
        <div className="flex flex-col gap-3">
          {[1,2,3,4].map(i => (
            <Skeleton key={i} height="h-14" />
          ))}
        </div>
      )}

      {report && (
        <>
          {/* Status banner */}
          <StatusBanner report={report} />

          {/* C5: Mutabakat Zeka Değerlendirmesi */}
          {reconLines.length > 0 && (
            <div className="bg-white border border-[#e2e8f0] rounded-xl shadow-soft px-4 py-3">
              <div className="flex items-center justify-between mb-2.5">
                <span className="text-[9px] font-black uppercase tracking-widest text-[#94a3b8]">Mutabakat Değerlendirmesi</span>
                <span className="text-[9px] text-[#94a3b8]">Finansal doğruluk · Dönem kapanış hazırlığı</span>
              </div>
              <div className="space-y-0.5">
                {reconLines.map((line, i) => (
                  <div key={i} className="text-[11px] text-[#64748b] leading-snug">
                    <span className="text-[#cbd5e1] mr-1.5">—</span>{line}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Summary chips */}
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-pos-light border border-pos-light rounded px-4 py-3 text-center">
              <div className="text-xl font-black text-pos-text tabular-nums">{okCount}</div>
              <div className="text-[0.65rem] font-black uppercase tracking-widest text-pos-text mt-0.5">Tamam</div>
            </div>
            <div className={`border rounded px-4 py-3 text-center ${warnCount > 0 ? 'bg-warn-light border-warn-light' : 'bg-[#f8fafc] border-[#e2e8f0]'}`}>
              <div className={`text-xl font-black tabular-nums ${warnCount > 0 ? 'text-warn-text' : 'text-[#94a3b8]'}`}>{warnCount}</div>
              <div className={`text-[0.65rem] font-black uppercase tracking-widest mt-0.5 ${warnCount > 0 ? 'text-warn-text' : 'text-[#94a3b8]'}`}>Uyarı</div>
            </div>
            <div className={`border rounded px-4 py-3 text-center ${criticalCount > 0 ? 'bg-neg-light border-neg-light' : 'bg-[#f8fafc] border-[#e2e8f0]'}`}>
              <div className={`text-xl font-black tabular-nums ${criticalCount > 0 ? 'text-neg-text' : 'text-[#94a3b8]'}`}>{criticalCount}</div>
              <div className={`text-[0.65rem] font-black uppercase tracking-widest mt-0.5 ${criticalCount > 0 ? 'text-neg' : 'text-[#94a3b8]'}`}>Kritik</div>
            </div>
          </div>

          {/* Reconciliation items table */}
          <div className="bg-white border border-[#e2e8f0] rounded-xl shadow-soft overflow-hidden shadow-sm">
            <div className="px-4 py-2.5 border-b border-[#e2e8f0] bg-[#f8fafc]">
              <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Hesap Karşılaştırması</div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[#e2e8f0]">
                    <th className="px-4 py-2.5 text-left text-[10px] font-black text-[#94a3b8] uppercase tracking-widest">Hesap / Kontrol</th>
                    <th className="px-4 py-2.5 text-right text-[10px] font-black text-[#94a3b8] uppercase tracking-widest">GL Değeri</th>
                    <th className="px-4 py-2.5 text-right text-[10px] font-black text-[#94a3b8] uppercase tracking-widest">Operasyonel</th>
                    <th className="px-4 py-2.5 text-right text-[10px] font-black text-[#94a3b8] uppercase tracking-widest">Fark</th>
                    <th className="px-4 py-2.5 text-center text-[10px] font-black text-[#94a3b8] uppercase tracking-widest">Durum</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f1f5f9]">
                  {report.items.map((item, i) => {
                    const cfg = SEV_CONFIG[item.severity]
                    return (
                      <tr key={i} className={`${item.severity !== 'ok' ? 'bg-opacity-30' : ''} hover:bg-[#f8fafc]/60`}>
                        <td className="px-4 py-3">
                          <div className="font-semibold text-[#1e293b]">{item.name}</div>
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-[#334155] tabular-nums">
                          {fmt(item.gl_value)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-[#334155] tabular-nums">
                          {fmt(item.operational)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums">
                          <span className={item.diff > 0 ? (item.severity === 'critical' ? 'text-neg font-bold' : 'text-warn-text font-semibold') : 'text-[#94a3b8]'}>
                            {item.diff > 0 ? fmt(item.diff) : '—'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold border ${cfg.cls}`}>
                            {cfg.icon} {cfg.label}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Guidance */}
          <div className="bg-[#f8fafc] border border-[#e2e8f0] rounded px-4 py-3 text-xs text-[#64748b] space-y-1" data-print-hide>
            <div className="font-semibold text-[#334155] mb-1.5">Ne anlama geliyor?</div>
            <div className="flex gap-2"><span className="text-pos-text font-bold shrink-0">✓ Tamam</span><span>GL ve operasyonel değer arasında {`<`}1 TRY fark var. Yuvarlama sapması.</span></div>
            <div className="flex gap-2"><span className="text-warn-text font-bold shrink-0">! Uyarı</span><span>1–99 TRY arası fark. Muhtemelen zamanlama farkı (dönem sonu kesilmemiş işlem). İncelenmesi önerilir.</span></div>
            <div className="flex gap-2"><span className="text-neg font-bold shrink-0">✗ Kritik</span><span>100+ TRY fark. GL ile operasyonel tablolar uyuşmuyor. Dönem kapanışı bu durum giderilmeden engellenilir.</span></div>
          </div>

          {/* Cross-navigation */}
          <div className="flex items-center justify-between px-1" data-print-hide>
            <p className="text-[10px] text-[#94a3b8] leading-relaxed">
              {report.checked_at
                ? `Son kontrol: ${new Date(report.checked_at).toLocaleString('tr-TR')} — Kritik fark olmadan dönem kapanışı yapılabilir`
                : 'Sonuçlar her çalıştırmada canlı hesaplanır — dönem kapanışı öncesi temiz mutabakat şart.'}
            </p>
            <div className="flex items-center gap-2 shrink-0 ml-4">
              <Link href="/dashboard/cfo/trial-balance" className="text-[11px] font-bold text-brand-light hover:text-brand underline underline-offset-2 whitespace-nowrap">
                Mizan →
              </Link>
              <span className="text-[#e2e8f0]">|</span>
              <Link href="/dashboard/cfo/journal-entries" className="text-[11px] font-bold text-brand-light hover:text-brand underline underline-offset-2 whitespace-nowrap">
                Journal Kayıtları →
              </Link>
              <span className="text-[#e2e8f0]">|</span>
              <Link href="/dashboard/cfo/period-close" className="text-[11px] font-bold text-brand-light hover:text-brand underline underline-offset-2 whitespace-nowrap">
                Dönem Kapat →
              </Link>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
