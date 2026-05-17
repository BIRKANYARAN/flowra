'use client'

// /dashboard/cfo/trial-balance — Mizan (Trial Balance) Viewer
// Shows GL account balances + invariant checks.
// Gracefully empty when no journal entries exist (gl_mode = 'shadow').

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { formatTRY as fmt } from '@/lib/format'

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

function Skeleton() {
  return <div className="bg-gray-100 rounded-xl h-12 animate-pulse" />
}

export default function TrialBalancePage() {
  const [report,  setReport]  = useState<TBReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/ledger/trial-balance')
      .then(r => r.json())
      .then(d => setReport(d as TBReport))
      .catch(() => setError('Trial balance yüklenemedi'))
      .finally(() => setLoading(false))
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black text-gray-900 tracking-tight">Mizan</h1>
          <p className="text-xs text-gray-400 mt-0.5">Genel Muhasebe Hesap Bakiyeleri</p>
        </div>
        <Link href="/dashboard/cfo" className="text-xs text-gray-400 hover:text-primary-600 font-semibold">
          ← CFO Cockpit
        </Link>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {/* Accounting checks */}
      {!loading && checks.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-4 py-2.5 border-b border-gray-100 bg-gray-50">
            <div className="text-[10px] font-black uppercase tracking-widest text-gray-400">Muhasebe Doğruluk Kontrolleri</div>
          </div>
          <div className="divide-y divide-gray-50">
            {checks.map((c, i) => (
              <div key={i} className="flex items-start justify-between px-4 py-3 gap-4">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 text-[10px] font-black ${c.passed ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                    {c.passed ? '✓' : '✗'}
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-gray-800">{c.name}</div>
                    {c.detail && <div className="text-[10px] text-gray-400 truncate">{c.detail}</div>}
                  </div>
                </div>
                {c.amount != null && (
                  <div className="text-xs font-black tabular-nums text-red-600 shrink-0">{fmt(c.amount)}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Summary row */}
      {!loading && tb && (
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-white border border-gray-200 rounded-xl px-4 py-3">
            <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">Toplam Borç</div>
            <div className="text-xl font-black tabular-nums text-gray-900">{fmt(tb.total_debit_try)}</div>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl px-4 py-3">
            <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">Toplam Alacak</div>
            <div className="text-xl font-black tabular-nums text-gray-900">{fmt(tb.total_credit_try)}</div>
          </div>
          <div className={`border rounded-xl px-4 py-3 ${tb.is_balanced ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
            <div className={`text-[10px] font-bold uppercase tracking-widest mb-1 ${tb.is_balanced ? 'text-emerald-600' : 'text-red-600'}`}>
              {tb.is_balanced ? 'Dengeli' : 'Dengesiz'}
            </div>
            <div className={`text-xl font-black tabular-nums ${tb.is_balanced ? 'text-emerald-700' : 'text-red-700'}`}>
              {tb.is_balanced ? '✓ Tamam' : fmt(tb.imbalance_try) + ' fark'}
            </div>
          </div>
        </div>
      )}

      {loading && (
        <div className="flex flex-col gap-2">
          {[1,2,3,4].map(i => <Skeleton key={i} />)}
        </div>
      )}

      {!loading && !hasData && !error && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-10 text-center">
          <div className="text-2xl mb-2">📒</div>
          <div className="text-sm font-semibold text-gray-500">Henüz journal entry yok</div>
          <div className="text-xs text-gray-400 mt-1">
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
              <div key={cls} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                <div className="px-4 py-2.5 border-b border-gray-100 bg-gray-50">
                  <div className="text-[10px] font-black uppercase tracking-widest text-gray-500">
                    {CLASS_LABELS[cls] ?? cls}
                  </div>
                </div>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-gray-50">
                      <th className="px-4 py-2 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Hesap</th>
                      <th className="px-4 py-2 text-right text-[10px] font-black text-gray-400 uppercase tracking-widest">Borç</th>
                      <th className="px-4 py-2 text-right text-[10px] font-black text-gray-400 uppercase tracking-widest">Alacak</th>
                      <th className="px-4 py-2 text-right text-[10px] font-black text-gray-400 uppercase tracking-widest">Bakiye</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {accounts.map(a => (
                      <tr key={a.account_code} className="hover:bg-gray-50/60">
                        <td className="px-4 py-2.5">
                          <span className="font-mono font-semibold text-gray-500 mr-2">{a.account_code}</span>
                          <span className="text-gray-800">{a.account_name_tr}</span>
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-gray-600">{a.debit_try > 0 ? fmt(a.debit_try) : '—'}</td>
                        <td className="px-4 py-2.5 text-right font-mono text-gray-600">{a.credit_try > 0 ? fmt(a.credit_try) : '—'}</td>
                        <td className={`px-4 py-2.5 text-right font-mono font-bold ${a.balance_try > 0 ? 'text-gray-900' : a.balance_try < 0 ? 'text-red-600' : 'text-gray-400'}`}>
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
    </div>
  )
}
