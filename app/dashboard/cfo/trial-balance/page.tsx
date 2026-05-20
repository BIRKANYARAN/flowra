'use client'

// /dashboard/cfo/trial-balance — Mizan (Trial Balance) Viewer
// Shows GL account balances + invariant checks.
// Gracefully empty when no journal entries exist (gl_mode = 'shadow').

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Skeleton, ErrorBanner } from '@/components/ds'
import { fmtTRY as fmt } from '@/lib/format'

const PRINT_STYLE = `
@media print {
  body { background: white !important; -webkit-print-color-adjust: exact; }
  [data-print-hide] { display: none !important; }
  .shadow-\\[0_1px_2px_rgba\\(17\\,24\\,39\\,0\\.04\\)\\] { box-shadow: none !important; }
  table { page-break-inside: avoid; }
}
`

interface GLAccount {
  account_code:   string
  account_name_tr: string
  class:          string
  debit_try:      number
  credit_try:     number
  balance_try:    number
  normal_balance: 'debit' | 'credit'
}

interface TBCheck {
  name:    string
  passed:  boolean
  detail?: string
  amount?: number
}

interface TBReport {
  trial_balance: {
    accounts:         GLAccount[]
    total_debit_try:  number
    total_credit_try: number
    is_balanced:      boolean
    imbalance_try:    number
  }
  checks:           TBCheck[]
  all_passed:       boolean
  can_close_period: boolean
  computed_at:      string
}

const CLASS_LABELS: Record<string, string> = {
  current_asset:         'Dönen Varlıklar',
  non_current_asset:     'Duran Varlıklar',
  current_liability:     'Kısa Vadeli Yabancı Kaynaklar',
  non_current_liability: 'Uzun Vadeli Yabancı Kaynaklar',
  equity:                'Özkaynaklar',
  revenue:               'Gelirler',
  cogs:                  'Satış Maliyeti',
  operating_expense:     'Faaliyet Giderleri',
  financing:             'Finansman Giderleri',
}

export default function TrialBalancePage() {
  const [report,  setReport]  = useState<TBReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)

  useEffect(() => {
    const ctrl = new AbortController()
    fetch('/api/ledger/trial-balance', { signal: ctrl.signal })
      .then(r => r.json())
      .then(d => setReport(d as TBReport))
      .catch(err => { if (err.name !== 'AbortError') setError('Trial balance yüklenemedi') })
      .finally(() => setLoading(false))
    return () => ctrl.abort()
  }, [])

  const tb    = report?.trial_balance
  const checks = report?.checks ?? []

  // Group accounts by class
  const grouped = new Map<string, GLAccount[]>()
  for (const acc of tb?.accounts ?? []) {
    if (!grouped.has(acc.class)) grouped.set(acc.class, [])
    grouped.get(acc.class)!.push(acc)
  }

  const classOrder = [
    'current_asset','non_current_asset',
    'current_liability','non_current_liability',
    'equity','revenue','cogs','operating_expense','financing',
  ]

  const hasData = (tb?.accounts ?? []).some(a => a.debit_try > 0 || a.credit_try > 0)

  return (
    <div className="flex flex-col gap-4 max-w-4xl">
      <style dangerouslySetInnerHTML={{ __html: PRINT_STYLE }} />
      <div className="flex items-center justify-between" data-print-hide>
        <div>
          <h1 className="text-2xl font-black text-[#0f172a] tracking-tight">Mizan</h1>
          <p className="text-xs text-[#94a3b8] mt-0.5">Genel Muhasebe Hesap Bakiyeleri</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => window.print()}
            title="Mizanı PDF olarak kaydet veya yazdır"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-[#e2e8f0] bg-white text-xs font-semibold text-[#64748b] hover:bg-[#f8fafc] hover:border-[#e2e8f0] transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            Yazdır / PDF
          </button>
          <Link href="/dashboard/cfo" className="text-xs text-[#94a3b8] hover:text-brand-light font-semibold">
            ← CFO Cockpit
          </Link>
        </div>
      </div>
      {/* Print-only header */}
      <div className="hidden print:block mb-4">
        <div className="text-[10px] uppercase tracking-widest text-[#94a3b8] font-black">Flowra — Muhasebe Raporu</div>
        <h1 className="text-2xl font-black text-[#0f172a]">Mizan</h1>
        <p className="text-xs text-[#64748b] mt-0.5">Genel Muhasebe Hesap Bakiyeleri · {new Date().toLocaleDateString('tr-TR', { day:'2-digit', month:'long', year:'numeric' })}</p>
      </div>

      {error && (
        <ErrorBanner msg={error} />
      )}

      {/* Accounting checks */}
      {!loading && checks.length > 0 && (
        <div className="bg-white border border-[#e2e8f0] rounded overflow-hidden shadow-sm">
          <div className="px-4 py-2.5 border-b border-[#e2e8f0] bg-[#f8fafc]">
            <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Muhasebe Doğruluk Kontrolleri</div>
          </div>
          <div className="divide-y divide-[#f1f5f9]">
            {checks.map((c, i) => (
              <div key={i} className="flex items-start justify-between px-4 py-3 gap-4">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 text-[10px] font-black ${c.passed ? 'bg-pos-light text-pos-text' : 'bg-neg-light text-neg-text'}`}>
                    {c.passed ? '✓' : '✗'}
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-[#1e293b]">{c.name}</div>
                    {c.detail && <div className="text-[10px] text-[#94a3b8] truncate">{c.detail}</div>}
                  </div>
                </div>
                {c.amount != null && (
                  <div className="text-xs font-black tabular-nums text-neg shrink-0">{fmt(c.amount)}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Summary row */}
      {!loading && tb && (
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-white border border-[#e2e8f0] rounded px-4 py-3 shadow-sm">
            <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-1">Toplam Borç</div>
            <div className="text-xl font-black tabular-nums text-[#0f172a]">{fmt(tb.total_debit_try)}</div>
          </div>
          <div className="bg-white border border-[#e2e8f0] rounded px-4 py-3 shadow-sm">
            <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-1">Toplam Alacak</div>
            <div className="text-xl font-black tabular-nums text-[#0f172a]">{fmt(tb.total_credit_try)}</div>
          </div>
          <div className={`border rounded px-4 py-3 ${tb.is_balanced ? 'bg-pos-light border-pos-light' : 'bg-neg-light border-neg-light'}`}>
            <div className={`text-[10px] font-bold uppercase tracking-widest mb-1 ${tb.is_balanced ? 'text-pos-text' : 'text-neg'}`}>
              {tb.is_balanced ? 'Dengeli' : 'Dengesiz'}
            </div>
            <div className={`text-xl font-black tabular-nums ${tb.is_balanced ? 'text-pos-text' : 'text-neg-text'}`}>
              {tb.is_balanced ? '✓ Tamam' : fmt(tb.imbalance_try) + ' fark'}
            </div>
          </div>
        </div>
      )}

      {loading && (
        <div className="flex flex-col gap-2">
          {[1,2,3,4].map(i => <Skeleton key={i} height="h-12" />)}
        </div>
      )}

      {!loading && !hasData && !error && (
        <div className="bg-[#f8fafc] border border-[#e2e8f0] rounded px-4 py-10 text-center">
          <div className="text-xs font-medium text-[#334155] mb-1">Henüz muhasebe kaydı yok</div>
          <div className="text-xs text-[#94a3b8] mt-1">
            GL modu aktifleştirildikten sonra muhasebe kayıtları burada görünür.
          </div>
        </div>
      )}

      {/* Account table grouped by class */}
      {!loading && hasData && (
        <div className="flex flex-col gap-3">
          {classOrder.map(cls => {
            const accounts = (grouped.get(cls) ?? []).filter(a => a.debit_try > 0 || a.credit_try > 0)
            if (accounts.length === 0) return null
            return (
              <div key={cls} className="bg-white border border-[#e2e8f0] rounded overflow-hidden shadow-sm">
                <div className="px-4 py-2.5 border-b border-[#e2e8f0] bg-[#f8fafc]">
                  <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#64748b]">
                    {CLASS_LABELS[cls] ?? cls}
                  </div>
                </div>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-[#f1f5f9]">
                      <th className="px-4 py-2 text-left text-[10px] font-black text-[#94a3b8] uppercase tracking-widest">Hesap</th>
                      <th className="px-4 py-2 text-right text-[10px] font-black text-[#94a3b8] uppercase tracking-widest">Borç</th>
                      <th className="px-4 py-2 text-right text-[10px] font-black text-[#94a3b8] uppercase tracking-widest">Alacak</th>
                      <th className="px-4 py-2 text-right text-[10px] font-black text-[#94a3b8] uppercase tracking-widest">Bakiye</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#f1f5f9]">
                    {accounts.map(a => (
                      <tr key={a.account_code} className="hover:bg-[#f8fafc]/60">
                        <td className="px-4 py-2">
                          <span className="font-mono font-semibold text-[#64748b] mr-2">{a.account_code}</span>
                          <span className="text-[#1e293b]">{a.account_name_tr}</span>
                        </td>
                        <td className="px-4 py-2 text-right font-mono text-[#64748b]">{a.debit_try > 0 ? fmt(a.debit_try) : '—'}</td>
                        <td className="px-4 py-2 text-right font-mono text-[#64748b]">{a.credit_try > 0 ? fmt(a.credit_try) : '—'}</td>
                        <td className={`px-4 py-2 text-right font-mono font-bold ${a.balance_try > 0 ? 'text-[#0f172a]' : a.balance_try < 0 ? 'text-neg' : 'text-[#94a3b8]'}`}>
                          {fmt(a.balance_try)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          })}
        </div>
      )}

      {/* Cross-navigation */}
      <div className="flex items-center justify-between px-1 pt-1">
        <p className="text-[10px] text-[#94a3b8] leading-relaxed">
          Mizan dengesi bilanço ve journal entries ile doğrulanmalı.
        </p>
        <div className="flex items-center gap-2 shrink-0 ml-4">
          <Link href="/dashboard/finance?tab=balance" className="text-[11px] font-bold text-brand-light hover:text-brand underline underline-offset-2 whitespace-nowrap">
            Bilanço →
          </Link>
          <span className="text-[#e2e8f0]">|</span>
          <Link href="/dashboard/cfo/journal-entries" className="text-[11px] font-bold text-brand-light hover:text-brand underline underline-offset-2 whitespace-nowrap">
            Journal Entries →
          </Link>
          <span className="text-[#e2e8f0]">|</span>
          <Link href="/dashboard/finance?tab=pnl" className="text-[11px] font-bold text-brand-light hover:text-brand underline underline-offset-2 whitespace-nowrap">
            P&amp;L →
          </Link>
        </div>
      </div>
    </div>
  )
}
