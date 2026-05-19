'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { PdfExportButton } from '@/components/reports/PdfExportButton'
import { useWorkspace }    from '@/lib/workspace-context'
import type { PdfReportOptions } from '@/lib/utils/pdf-report'
import { fmtCompact as fmt } from '@/lib/format'

interface ExecSummary {
  from: string; to: string; as_of: string; computed_at: string
  income_statement: {
    revenue: number; cogs: number; gross_profit: number; gross_margin_pct: number
    expenses: number; ebitda: number; corporate_tax: number
    net_income: number; net_margin_pct: number
  } | null
  tax_summary: {
    sales_vat: number; purchase_vat: number; expense_vat: number
    net_vat: number; status: 'payable' | 'carry_forward'
  } | null
  balance_sheet: {
    total_assets: number; total_liabilities: number; total_equity: number
    is_balanced: boolean; cash_try: number; receivables_try: number; inventory_try: number
  } | null
  cash_flow: { operating: number; investing: number; financing: number; net_change: number } | null
}

function fmtPct(n: number) { return n.toFixed(1) + '%' }

function KpiCard({ label, value, sub, tone = 'neutral' }: {
  label: string; value: string; sub?: string; tone?: 'positive' | 'negative' | 'neutral'
}) {
  return (
    <div className="bg-white border border-[#e2e8f0] rounded px-4 py-3">
      <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-1">{label}</div>
      <div className={`text-lg font-black tabular-nums leading-tight ${
        tone === 'positive' ? 'text-pos-text' : tone === 'negative' ? 'text-neg' : 'text-gray-900'
      }`}>{value}</div>
      {sub && <div className="text-[10px] text-gray-400 mt-0.5">{sub}</div>}
    </div>
  )
}

function currentPeriod() {
  const now = new Date()
  const from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  const to   = now.toISOString().slice(0, 10)
  return { from, to }
}

export default function ExecutiveSummaryPage() {
  const [data,    setData]    = useState<ExecSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)
  const [from,    setFrom]    = useState(currentPeriod().from)
  const [to,      setTo]      = useState(currentPeriod().to)
  const ws = useWorkspace()

  useEffect(() => {
    const ctrl = new AbortController()
    setLoading(true)
    setError(null)
    fetch(`/api/reports/executive-summary?from=${from}&to=${to}&as_of=${to}`, { signal: ctrl.signal })
      .then(r => r.json())
      .then(d => setData(d as ExecSummary))
      .catch(err => { if (err.name !== 'AbortError') setError('Veriler yüklenemedi') })
      .finally(() => setLoading(false))
    return () => ctrl.abort()
  }, [from, to])

  const is  = data?.income_statement
  const bs  = data?.balance_sheet
  const cf  = data?.cash_flow
  const tax = data?.tax_summary

  return (
    <div className="flex flex-col gap-4 max-w-4xl print:max-w-none">
      {/* Header */}
      <div className="flex items-center justify-between print:hidden">
        <div>
          <h1 className="text-xl font-black text-gray-900 tracking-tight">Yönetici Özeti</h1>
          <p className="text-xs text-gray-400 mt-0.5">1 Sayfa CEO Raporu</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <input type="date" value={from} onChange={e => setFrom(e.target.value)}
            className="border border-[#e2e8f0] rounded px-2 py-1 text-xs" />
          <span className="text-xs text-gray-400">—</span>
          <input type="date" value={to} onChange={e => setTo(e.target.value)}
            className="border border-[#e2e8f0] rounded px-2 py-1 text-xs" />
          {data && (
            <PdfExportButton label="PDF İndir" opts={{
              companyName: ws.companyName ?? 'Şirket',
              reportTitle: 'Yönetici Özeti',
              subtitle:    `${from} — ${to}`,
              filename:    `yonetici-ozeti-${from}-${to}`,
              sections: [
                { title: 'Kâr / Zarar', rows: [
                  { label: 'Satış Gelirleri',  value: fmt(is?.revenue ?? 0) },
                  { label: 'Brüt Kâr',         value: fmt(is?.gross_profit ?? 0), indent: true,
                    tone: is && is.gross_profit > 0 ? 'positive' : 'negative' },
                  { label: 'Brüt Marj',         value: fmtPct(is?.gross_margin_pct ?? 0), indent: true },
                  { label: 'Faaliyet Kârı (EBITDA)', value: fmt(is?.ebitda ?? 0), bold: true,
                    tone: is && is.ebitda > 0 ? 'positive' : 'negative' },
                  { label: 'Net Kâr',           value: fmt(is?.net_income ?? 0), bold: true,
                    tone: is && is.net_income > 0 ? 'positive' : 'negative' },
                  { label: 'Net Marj',          value: fmtPct(is?.net_margin_pct ?? 0), indent: true },
                ]},
                { title: 'Finansal Pozisyon', rows: [
                  { label: 'Toplam Varlık',     value: fmt(bs?.total_assets ?? 0) },
                  { label: 'Nakit',             value: fmt(bs?.cash_try ?? 0), indent: true, tone: 'positive' },
                  { label: 'Alacaklar',         value: fmt(bs?.receivables_try ?? 0), indent: true },
                  { label: 'Toplam Yükümlülük', value: fmt(bs?.total_liabilities ?? 0) },
                  { label: 'Özkaynak',          value: fmt(bs?.total_equity ?? 0), bold: true,
                    tone: bs && bs.total_equity > 0 ? 'positive' : 'negative' },
                ]},
                { title: 'Nakit Akışı', rows: [
                  { label: 'Faaliyet Nakit Akışı',  value: fmt(cf?.operating ?? 0),
                    tone: cf && cf.operating > 0 ? 'positive' : 'negative' },
                  { label: 'Yatırım Nakit Akışı',   value: fmt(cf?.investing ?? 0) },
                  { label: 'Finansman Nakit Akışı',  value: fmt(cf?.financing ?? 0) },
                  { label: 'Net Nakit Değişimi',     value: fmt(cf?.net_change ?? 0), bold: true,
                    tone: cf && cf.net_change > 0 ? 'positive' : 'negative' },
                ]},
                { title: 'Vergi Özeti', rows: [
                  { label: 'Satış KDV',         value: fmt(tax?.sales_vat ?? 0) },
                  { label: 'Alış KDV',          value: fmt(tax?.purchase_vat ?? 0), indent: true },
                  { label: 'Gider KDV',         value: fmt(tax?.expense_vat ?? 0), indent: true },
                  { label: 'Net KDV',           value: fmt(tax?.net_vat ?? 0), bold: true,
                    tone: tax?.status === 'payable' ? 'negative' : 'positive' },
                  { label: 'Kurumlar Vergisi',  value: fmt(is?.corporate_tax ?? 0), tone: 'negative' },
                ]},
              ],
            } as PdfReportOptions} />
          )}
          <Link href="/dashboard" className="text-xs text-gray-400 hover:text-primary-600 font-semibold">← Dashboard</Link>
        </div>
      </div>

      {/* Print header */}
      <div className="hidden print:block mb-6 border-b pb-4">
        <h1 className="text-3xl font-black">Yönetici Özeti</h1>
        <p className="text-sm text-gray-500 mt-1">{from} — {to}</p>
      </div>

      {error && <div className="bg-neg-light border border-neg-light rounded px-4 py-3 text-sm text-neg-text">{error}</div>}
      {loading && <div className="bg-gray-100 rounded h-48 animate-pulse" />}

      {data && !loading && (
        <>
          {/* ── Intelligence Alerts ─────────────────────────────────────────── */}
          {is && is.net_income < 0 && (
            <div className="bg-neg-light border border-neg-light rounded px-4 py-3 flex items-start gap-3">
              <span className="text-base mt-0.5">🔴</span>
              <div className="flex-1">
                <div className="text-[11px] font-black uppercase tracking-wide text-neg-text">
                  Dönem Zararı — {fmt(Math.abs(is.net_income))}
                </div>
                <div className="text-xs text-neg-text mt-0.5">
                  Bu dönem net zarar ile kapanıyor. Gider yapısı ve brüt marj incelenmeli.
                </div>
              </div>
              <Link href="/dashboard/reports/income-statement" className="text-[10px] font-bold text-neg-text hover:text-neg-text underline underline-offset-2 shrink-0 mt-0.5">
                Gelir Tablosu →
              </Link>
            </div>
          )}

          {bs && bs.total_equity < 0 && (
            <div className="bg-neg-light border border-neg-light rounded px-4 py-3 flex items-start gap-3">
              <span className="text-base mt-0.5">🔴</span>
              <div className="flex-1">
                <div className="text-[11px] font-black uppercase tracking-wide text-neg-text">
                  Negatif Özkaynak — Teknik İflas Riski
                </div>
                <div className="text-xs text-neg-text mt-0.5">
                  Toplam yükümlülükler varlıkları aşıyor. TTK kapsamında ek sermaye yükümlülüğü doğabilir.
                </div>
              </div>
              <Link href="/dashboard/reports/balance-sheet" className="text-[10px] font-bold text-neg-text hover:text-neg-text underline underline-offset-2 shrink-0 mt-0.5">
                Bilanço →
              </Link>
            </div>
          )}

          {cf && cf.operating < 0 && is && is.net_income > 0 && (
            <div className="bg-warn-light border border-warn-light rounded px-4 py-3 flex items-start gap-3">
              <span className="text-base mt-0.5">⚠</span>
              <div className="flex-1">
                <div className="text-[11px] font-black uppercase tracking-wide text-warn-text">
                  Negatif Faaliyet Nakit Akışı
                </div>
                <div className="text-xs text-warn-text mt-0.5">
                  Dönem kârlı olmasına rağmen faaliyet nakit akışı negatif. Tahsilat ve alacak yönetimi gözden geçirilmeli.
                </div>
              </div>
              <Link href="/dashboard/reports/cash-flow" className="text-[10px] font-bold text-warn-text hover:text-warn-text underline underline-offset-2 shrink-0 mt-0.5">
                Nakit Akışı →
              </Link>
            </div>
          )}

          {/* P&L Summary */}
          <div>
            <div className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Kâr / Zarar</div>
            <div className="grid grid-cols-4 gap-2">
              <KpiCard label="Satış Gelirleri"  value={fmt(is?.revenue ?? 0)} />
              <KpiCard label="Brüt Kâr"         value={fmt(is?.gross_profit ?? 0)}
                sub={is ? `Marj: %${fmtPct(is.gross_margin_pct)}` : undefined}
                tone={is && is.gross_profit > 0 ? 'positive' : 'negative'} />
              <KpiCard label="Faaliyet Kârı"     value={fmt(is?.ebitda ?? 0)}
                tone={is && is.ebitda > 0 ? 'positive' : 'negative'} />
              <KpiCard label="Net Kâr"           value={fmt(is?.net_income ?? 0)}
                sub={is ? `Net marj: %${fmtPct(is.net_margin_pct)}` : undefined}
                tone={is && is.net_income > 0 ? 'positive' : 'negative'} />
            </div>
          </div>

          {/* Balance Sheet + Cash Flow */}
          <div>
            <div className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Finansal Pozisyon</div>
            <div className="grid grid-cols-4 gap-2">
              <KpiCard label="Toplam Varlık"     value={fmt(bs?.total_assets ?? 0)} />
              <KpiCard label="Nakit"             value={fmt(bs?.cash_try ?? 0)} tone="positive" />
              <KpiCard label="Alacaklar"         value={fmt(bs?.receivables_try ?? 0)} />
              <KpiCard label="Özkaynak"          value={fmt(bs?.total_equity ?? 0)}
                tone={bs && bs.total_equity > 0 ? 'positive' : 'negative'} />
            </div>
          </div>

          {/* Cash Flow + Tax */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Nakit Akışı</div>
              <div className="bg-white border border-[#e2e8f0] rounded overflow-hidden">
                {[
                  { label: 'Faaliyet Nakit Akışı',   value: cf?.operating  ?? 0 },
                  { label: 'Yatırım Nakit Akışı',    value: cf?.investing  ?? 0 },
                  { label: 'Finansman Nakit Akışı',  value: cf?.financing  ?? 0 },
                  { label: 'Net Nakit Değişimi',     value: cf?.net_change ?? 0, bold: true },
                ].map(row => (
                  <div key={row.label} className={`flex items-center justify-between px-4 py-2 border-b border-[#f1f5f9] last:border-0 ${row.bold ? 'bg-[#f8fafc]' : ''}`}>
                    <span className={`text-xs ${row.bold ? 'font-black text-gray-900' : 'text-gray-600'}`}>{row.label}</span>
                    <span className={`tabular-nums text-xs font-semibold ${row.value > 0 ? 'text-pos-text' : row.value < 0 ? 'text-neg' : 'text-gray-500'}`}>
                      {fmt(row.value)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Vergi Özeti</div>
              <div className="bg-white border border-[#e2e8f0] rounded overflow-hidden">
                {[
                  { label: 'Satış KDV',     value: tax?.sales_vat    ?? 0 },
                  { label: 'Alış KDV',      value: -(tax?.purchase_vat ?? 0) },
                  { label: 'Gider KDV',     value: -(tax?.expense_vat ?? 0) },
                  { label: 'Net KDV',       value: tax?.net_vat ?? 0, bold: true },
                  { label: 'Kurumlar Verg.',value: -(is?.corporate_tax ?? 0) },
                ].map(row => (
                  <div key={row.label} className={`flex items-center justify-between px-4 py-2 border-b border-[#f1f5f9] last:border-0 ${row.bold ? 'bg-[#f8fafc]' : ''}`}>
                    <span className={`text-xs ${row.bold ? 'font-black text-gray-900' : 'text-gray-600'}`}>{row.label}</span>
                    <span className={`tabular-nums text-xs font-semibold ${row.value > 0 ? 'text-orange-600' : row.value < 0 ? 'text-gray-600' : 'text-gray-400'}`}>
                      {fmt(Math.abs(row.value))} {row.bold && tax ? (tax.status === 'payable' ? '⬆ Ödenecek' : '⬇ Devir') : ''}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Cross-navigation */}
          <div className="flex items-center justify-between px-1 print:hidden">
            <p className="text-[10px] text-gray-400 leading-relaxed">
              Yönetici özeti tüm raporlarla birlikte değerlendirilmeli.
            </p>
            <div className="flex items-center gap-2 shrink-0 ml-4">
              <Link href="/dashboard/reports/income-statement" className="text-[11px] font-bold text-primary-600 hover:text-primary-700 underline underline-offset-2 whitespace-nowrap">
                Gelir Tablosu →
              </Link>
              <span className="text-gray-200">|</span>
              <Link href="/dashboard/reports/balance-sheet" className="text-[11px] font-bold text-primary-600 hover:text-primary-700 underline underline-offset-2 whitespace-nowrap">
                Bilanço →
              </Link>
              <span className="text-gray-200">|</span>
              <Link href="/dashboard/reports/cash-flow" className="text-[11px] font-bold text-primary-600 hover:text-primary-700 underline underline-offset-2 whitespace-nowrap">
                Nakit Akışı →
              </Link>
              <span className="text-gray-200">|</span>
              <Link href="/dashboard/cfo/trial-balance" className="text-[11px] font-bold text-primary-600 hover:text-primary-700 underline underline-offset-2 whitespace-nowrap">
                Mizan →
              </Link>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
