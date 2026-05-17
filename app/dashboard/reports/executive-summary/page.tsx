'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { PrintButton } from '@/components/reports/PrintButton'

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

const _fmt = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
function fmt(n: number) {
  const v = Number(n) || 0; if (!v) return '₺0'
  const abs = Math.abs(v)
  if (abs >= 1_000_000) return `${v < 0 ? '−' : ''}₺${(abs / 1_000_000).toFixed(1)}M`
  if (abs >= 10_000)    return `${v < 0 ? '−' : ''}₺${(abs / 1_000).toFixed(0)}K`
  return (v < 0 ? '−' : '') + '₺' + _fmt.format(abs)
}
function fmtPct(n: number) { return n.toFixed(1) + '%' }

function KpiCard({ label, value, sub, tone = 'neutral' }: {
  label: string; value: string; sub?: string; tone?: 'positive' | 'negative' | 'neutral'
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl px-4 py-3">
      <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">{label}</div>
      <div className={`text-lg font-black tabular-nums leading-tight ${
        tone === 'positive' ? 'text-emerald-700' : tone === 'negative' ? 'text-red-600' : 'text-gray-900'
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

  useEffect(() => {
    setLoading(true)
    fetch(`/api/reports/executive-summary?from=${from}&to=${to}&as_of=${to}`)
      .then(r => r.json())
      .then(d => setData(d as ExecSummary))
      .catch(() => setError('Veriler yüklenemedi'))
      .finally(() => setLoading(false))
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
            className="border border-gray-200 rounded-lg px-2 py-1 text-xs" />
          <span className="text-xs text-gray-400">—</span>
          <input type="date" value={to} onChange={e => setTo(e.target.value)}
            className="border border-gray-200 rounded-lg px-2 py-1 text-xs" />
          <PrintButton label="PDF İndir" />
          <Link href="/dashboard" className="text-xs text-gray-400 hover:text-primary-600 font-semibold">← Dashboard</Link>
        </div>
      </div>

      {/* Print header */}
      <div className="hidden print:block mb-6 border-b pb-4">
        <h1 className="text-3xl font-black">Yönetici Özeti</h1>
        <p className="text-sm text-gray-500 mt-1">{from} — {to}</p>
      </div>

      {error && <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">{error}</div>}
      {loading && <div className="bg-gray-100 rounded-xl h-48 animate-pulse" />}

      {data && !loading && (
        <>
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
              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                {[
                  { label: 'Faaliyet Nakit Akışı',   value: cf?.operating  ?? 0 },
                  { label: 'Yatırım Nakit Akışı',    value: cf?.investing  ?? 0 },
                  { label: 'Finansman Nakit Akışı',  value: cf?.financing  ?? 0 },
                  { label: 'Net Nakit Değişimi',     value: cf?.net_change ?? 0, bold: true },
                ].map(row => (
                  <div key={row.label} className={`flex items-center justify-between px-4 py-2 border-b border-gray-50 last:border-0 ${row.bold ? 'bg-gray-50' : ''}`}>
                    <span className={`text-xs ${row.bold ? 'font-black text-gray-900' : 'text-gray-600'}`}>{row.label}</span>
                    <span className={`tabular-nums text-xs font-semibold ${row.value > 0 ? 'text-emerald-700' : row.value < 0 ? 'text-red-600' : 'text-gray-500'}`}>
                      {fmt(row.value)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Vergi Özeti</div>
              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                {[
                  { label: 'Satış KDV',     value: tax?.sales_vat    ?? 0 },
                  { label: 'Alış KDV',      value: -(tax?.purchase_vat ?? 0) },
                  { label: 'Gider KDV',     value: -(tax?.expense_vat ?? 0) },
                  { label: 'Net KDV',       value: tax?.net_vat ?? 0, bold: true },
                  { label: 'Kurumlar Verg.',value: -(is?.corporate_tax ?? 0) },
                ].map(row => (
                  <div key={row.label} className={`flex items-center justify-between px-4 py-2 border-b border-gray-50 last:border-0 ${row.bold ? 'bg-gray-50' : ''}`}>
                    <span className={`text-xs ${row.bold ? 'font-black text-gray-900' : 'text-gray-600'}`}>{row.label}</span>
                    <span className={`tabular-nums text-xs font-semibold ${row.value > 0 ? 'text-orange-600' : row.value < 0 ? 'text-gray-600' : 'text-gray-400'}`}>
                      {fmt(Math.abs(row.value))} {row.bold && tax ? (tax.status === 'payable' ? '⬆ Ödenecek' : '⬇ Devir') : ''}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Quick links */}
          <div className="flex items-center gap-2 print:hidden">
            {[
              { href: '/dashboard/reports/income-statement', label: 'Gelir Tablosu' },
              { href: '/dashboard/reports/balance-sheet',    label: 'Bilanço' },
              { href: '/dashboard/reports/cash-flow',        label: 'Nakit Akışı' },
              { href: '/dashboard/cfo/trial-balance',        label: 'Mizan' },
            ].map(l => (
              <Link key={l.href} href={l.href}
                className="text-xs text-primary-600 hover:text-primary-700 font-semibold px-2 py-1.5 rounded-lg hover:bg-primary-50 transition-colors">
                {l.label} →
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
