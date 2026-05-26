'use client'
// ─────────────────────────────────────────────────────────────────────────────
// app/dashboard/reports/page.tsx — Reports Hub
//
// Lists all financial reports with branded PDF download.
// Also provides CFO Pack — all statements in one branded PDF.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react'
import Link from 'next/link'
import { useWorkspace } from '@/lib/workspace-context'

function currentPeriod() {
  const now  = new Date()
  const from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  const to   = now.toISOString().slice(0, 10)
  return { from, to }
}

const REPORTS = [
  {
    href:     '/dashboard/reports/income-statement',
    title:    'Gelir Tablosu',
    subtitle: 'Kâr / Zarar özeti, vergi matrahı',
    icon:     '📊',
    color:    'blue',
  },
  {
    href:     '/dashboard/reports/balance-sheet',
    title:    'Bilanço',
    subtitle: 'Varlıklar = Kaynaklar + Özkaynak',
    icon:     '⚖️',
    color:    'violet',
  },
  {
    href:     '/dashboard/reports/cash-flow',
    title:    'Nakit Akış Tablosu',
    subtitle: 'Faaliyet, yatırım, finansman akışları',
    icon:     '💧',
    color:    'cyan',
  },
  {
    href:     '/dashboard/reports/executive-summary',
    title:    'Yönetici Özeti',
    subtitle: 'CEO için tek sayfa — KPI + uyarılar',
    icon:     '🎯',
    color:    'amber',
  },
  {
    href:     '/dashboard/reports/health',
    title:    'Mali Sağlık Raporu',
    subtitle: 'Likidite, karlılık, alacaklar — basılabilir özet',
    icon:     '🏥',
    color:    'green',
  },
]

export default function ReportsHubPage() {
  const ws = useWorkspace()
  const [generating, setGenerating] = useState(false)
  const [error,      setError]      = useState<string | null>(null)
  const { from, to } = currentPeriod()

  async function downloadCfoPack() {
    setGenerating(true)
    setError(null)
    try {
      const asOf = to
      const res  = await fetch(`/api/reports/cfo-pack?from=${from}&to=${to}&as_of=${asOf}`)
      if (!res.ok) throw new Error('API hatası: ' + res.status)
      const data = await res.json() as {
        company_name: string
        from: string
        to: string
        sections: {
          income_statement: Record<string, number | null> | null
          tax_summary:      Record<string, number | null> | null
          receivables_aging: { current: number; overdue_30: number; overdue_60: number; overdue_90: number } | null
        }
      }

      const { generateCfoPack } = await import('@/lib/utils/pdf-report')
      await generateCfoPack({
        companyName:        ws.companyName ?? data.company_name ?? 'Şirket',
        from:               data.from,
        to:                 data.to,
        incomeStatement:    data.sections.income_statement ?? undefined,
        taxSummary:         data.sections.tax_summary ?? undefined,
        receivablesAging:   data.sections.receivables_aging ?? undefined,
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'PDF oluşturulamadı')
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-[#0f172a] tracking-tight">Finansal Raporlar</h1>
          <p className="text-xs text-[#94a3b8] mt-0.5">Tüm tablolar ve PDF indirme</p>
        </div>
        <button
          onClick={downloadCfoPack}
          disabled={generating}
          className="inline-flex items-center gap-2 px-4 py-2 rounded bg-brand-light text-white text-sm font-semibold hover:bg-brand transition-colors disabled:opacity-60"
        >
          {generating ? (
            <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
          ) : (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M12 16l-4-4h3V4h2v8h3l-4 4z" />
              <path d="M20 18H4v2h16v-2z" />
            </svg>
          )}
          {generating ? 'Oluşturuluyor…' : 'CFO Rapor Paketi İndir'}
        </button>
      </div>

      {error && (
        <div className="bg-neg-light border border-neg-light rounded px-4 py-3 text-sm text-neg-text">
          {error}
        </div>
      )}

      {/* CFO Pack info */}
      <div className="bg-brand-subtle border border-[#e2e8f0] rounded px-4 py-3">
        <div className="flex items-start gap-3">
          <span className="text-2xl flex-shrink-0">📦</span>
          <div>
            <div className="text-sm font-bold text-brand">CFO Rapor Paketi</div>
            <div className="text-xs text-brand-light mt-0.5">
              Tek bir markalı PDF olarak: Gelir Tablosu + Vergi Özeti + Alacak Yaşlandırma.
              Dönem: {from} — {to}
            </div>
          </div>
        </div>
      </div>

      {/* Report cards */}
      <div className="grid grid-cols-2 gap-4">
        {REPORTS.map(r => (
          <Link key={r.href} href={r.href}
            className="bg-white border border-[#e2e8f0] rounded p-4 hover:border-[#e2e8f0] hover:shadow-sm transition-all group"
          >
            <div className="flex items-start gap-3">
              <span className="text-2xl flex-shrink-0">{r.icon}</span>
              <div className="min-w-0">
                <div className="font-bold text-sm text-[#0f172a] group-hover:text-brand transition-colors">
                  {r.title}
                </div>
                <div className="text-xs text-[#94a3b8] mt-0.5">{r.subtitle}</div>
              </div>
            </div>
            <div className="mt-3 flex items-center gap-1 text-[10px] font-semibold text-brand-light">
              Görüntüle <span className="group-hover:translate-x-0.5 transition-transform">→</span>
            </div>
          </Link>
        ))}
      </div>

      {/* Accountant CSV Export */}
      <div className="bg-white border border-[#e2e8f0] rounded p-4">
        <div className="flex items-start gap-3 mb-3">
          <span className="text-2xl flex-shrink-0">📋</span>
          <div>
            <div className="text-sm font-bold text-[#0f172a]">Muhasebeci için CSV Aktarımı</div>
            <div className="text-xs text-[#94a3b8] mt-0.5">
              Excel'de açılmaya hazır, noktalı virgülle ayrılmış · UTF-8 · Türkçe format · Dönem: {from} — {to}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <a
            href={`/api/export/sales?from=${from}&to=${to}`}
            download
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded border border-[#e2e8f0] bg-[#f8fafc] text-xs font-semibold text-[#334155] hover:border-[#e2e8f0] hover:bg-brand-subtle hover:text-brand transition-colors"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M12 16l-4-4h3V4h2v8h3l-4 4z" />
              <path d="M20 18H4v2h16v-2z" />
            </svg>
            Satış Listesi (.csv)
          </a>
          <a
            href={`/api/export/expenses?from=${from}&to=${to}`}
            download
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded border border-[#e2e8f0] bg-[#f8fafc] text-xs font-semibold text-[#334155] hover:border-[#e2e8f0] hover:bg-brand-subtle hover:text-brand transition-colors"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M12 16l-4-4h3V4h2v8h3l-4 4z" />
              <path d="M20 18H4v2h16v-2z" />
            </svg>
            Masraf Listesi (.csv)
          </a>
          <a
            href={`/api/export/purchases?from=${from}&to=${to}`}
            download
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded border border-[#e2e8f0] bg-[#f8fafc] text-xs font-semibold text-[#334155] hover:border-[#e2e8f0] hover:bg-brand-subtle hover:text-brand transition-colors"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M12 16l-4-4h3V4h2v8h3l-4 4z" />
              <path d="M20 18H4v2h16v-2z" />
            </svg>
            Satın Alma Listesi (.csv)
          </a>
          <a
            href="/api/export/stock"
            download
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded border border-[#e2e8f0] bg-[#f8fafc] text-xs font-semibold text-[#334155] hover:border-[#e2e8f0] hover:bg-brand-subtle hover:text-brand transition-colors"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M12 16l-4-4h3V4h2v8h3l-4 4z" />
              <path d="M20 18H4v2h16v-2z" />
            </svg>
            Stok Durum (.csv)
          </a>
          <a
            href="/api/export/customers"
            download
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded border border-[#e2e8f0] bg-[#f8fafc] text-xs font-semibold text-[#334155] hover:border-[#e2e8f0] hover:bg-brand-subtle hover:text-brand transition-colors"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M12 16l-4-4h3V4h2v8h3l-4 4z" />
              <path d="M20 18H4v2h16v-2z" />
            </svg>
            Müşteri Listesi (.csv)
          </a>
          <span className="text-[10px] text-[#cbd5e1] italic">Tarih aralığı değiştirmek için URL parametrelerini düzenleyin</span>
        </div>
      </div>

      {/* Cross-navigation */}
      <div className="flex items-center justify-between px-1">
        <p className="text-[10px] text-[#94a3b8] leading-relaxed">
          Raporlar CFO cockpit ve dönem kapanış süreciyle birlikte değerlendirilmeli.
        </p>
        <div className="flex items-center gap-2 shrink-0 ml-4">
          <Link href="/dashboard/finance?tab=cfo" className="text-[11px] font-bold text-brand-light hover:text-brand underline underline-offset-2 whitespace-nowrap">
            CFO Cockpit →
          </Link>
          <span className="text-[#e2e8f0]">|</span>
          <Link href="/dashboard/cfo/trial-balance" className="text-[11px] font-bold text-brand-light hover:text-brand underline underline-offset-2 whitespace-nowrap">
            Mizan →
          </Link>
          <span className="text-[#e2e8f0]">|</span>
          <Link href="/dashboard/cfo/period-close" className="text-[11px] font-bold text-brand-light hover:text-brand underline underline-offset-2 whitespace-nowrap">
            Dönem Kapanışı →
          </Link>
        </div>
      </div>
    </div>
  )
}
