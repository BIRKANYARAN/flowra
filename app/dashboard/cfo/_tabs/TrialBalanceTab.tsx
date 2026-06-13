'use client'

// ── TrialBalanceTab — Mizan (Trial Balance) Viewer ───────────────────────────
// Full mizan viewer with category filter pills, search, period selector,
// grouped account table, and balance indicator.
//
// Real data: periods from /api/periods, balances from /api/ledger/trial-balance
// (TrialBalanceService.compute → GeneralLedgerService.trialBalance). Account rows
// are mapped onto the TrialBalanceLine shape the existing pure helpers expect.

import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fmtTRY } from '@/lib/format'
import {
  classifyAccount,
  validateTrialBalance,
  filterTrialBalanceByCategory,
  computeTrialBalanceSummary,
  type TrialBalanceLine,
} from '@/lib/services/ledger/trial-balance.service'

// ── Real API shapes ───────────────────────────────────────────────────────────

interface PeriodRow {
  id: string
  period_start: string
  period_end: string
  status: string
}

interface TbAccount {
  account_code:    string
  account_name:    string
  account_name_tr: string
  debit_try:       number
  credit_try:      number
  balance_try:     number
}

interface TrialBalanceResponse {
  trial_balance: { accounts: TbAccount[] }
}

/**
 * Map real ledger accounts onto the TrialBalanceLine shape the pure helpers
 * (validateTrialBalance / filterTrialBalanceByCategory / computeTrialBalanceSummary)
 * consume. net_balance follows the debit-minus-credit convention the helpers use
 * (sign only drives row colour; summary uses Math.abs). No new calculations.
 */
function accountsToLines(accounts: TbAccount[]): TrialBalanceLine[] {
  return accounts.map(a => ({
    account_code:   a.account_code,
    account_name:   a.account_name_tr || a.account_name,
    debit_balance:  a.debit_try,
    credit_balance: a.credit_try,
    net_balance:    a.debit_try - a.credit_try,
    normal_balance: classifyAccount(a.account_code).normal_balance,
  }))
}

function periodLabel(p: PeriodRow): string {
  return new Date(p.period_start + 'T00:00:00').toLocaleDateString('tr-TR', {
    month: 'long',
    year:  'numeric',
  })
}

// ── Category filter definition ────────────────────────────────────────────────

type CategoryFilter = 'all' | 'asset' | 'liability' | 'equity' | 'revenue' | 'expense'

const CATEGORY_PILLS: { id: CategoryFilter; label: string }[] = [
  { id: 'all',       label: 'Tumü'        },
  { id: 'asset',     label: 'Varlıklar'   },
  { id: 'liability', label: 'Borçlar'     },
  { id: 'equity',    label: 'Özkaynaklar' },
  { id: 'revenue',   label: 'Gelirler'    },
  { id: 'expense',   label: 'Giderler'    },
]

// ── Component ─────────────────────────────────────────────────────────────────

export function TrialBalanceTab() {
  const [period,   setPeriod]   = useState('')          // selected period_id ('' → most recent)
  const [search,   setSearch]   = useState('')
  const [category, setCategory] = useState<CategoryFilter>('all')
  const [expanded, setExpanded] = useState<Set<CategoryFilter>>(new Set(['all', 'asset', 'liability', 'equity', 'revenue', 'expense']))

  // Periods (real) — most recent first
  const periodsQuery = useQuery({
    queryKey: ['periods'],
    queryFn:  () => fetch('/api/periods').then(r => {
      if (!r.ok) throw new Error('periods')
      return r.json() as Promise<{ periods: PeriodRow[] }>
    }),
  })
  const periods = useMemo<PeriodRow[]>(() => {
    const list = periodsQuery.data?.periods ?? []
    return [...list].sort((a, b) => b.period_start.localeCompare(a.period_start))
  }, [periodsQuery.data])

  const activePeriod = period || periods[0]?.id || ''
  const activePeriodLabel =
    periods.find(p => p.id === activePeriod) != null
      ? periodLabel(periods.find(p => p.id === activePeriod)!)
      : 'Güncel'

  // Trial balance (real) for the active period
  const tbQuery = useQuery({
    queryKey: ['trial-balance', activePeriod],
    enabled:  !!activePeriod,
    queryFn:  () => fetch(`/api/ledger/trial-balance?period_id=${activePeriod}`).then(r => {
      if (!r.ok) throw new Error('trial-balance')
      return r.json() as Promise<TrialBalanceResponse>
    }),
  })

  const lines = useMemo<TrialBalanceLine[]>(
    () => accountsToLines(tbQuery.data?.trial_balance?.accounts ?? []),
    [tbQuery.data],
  )

  const isLoading = periodsQuery.isLoading || (!!activePeriod && tbQuery.isLoading)
  const isError   = periodsQuery.isError || tbQuery.isError
  const isEmpty   = !isLoading && !isError && lines.length === 0

  // Filter lines by category + search
  const filteredLines = useMemo<TrialBalanceLine[]>(() => {
    let result = lines
    if (category !== 'all') {
      result = filterTrialBalanceByCategory(result, category)
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(
        l => l.account_code.includes(q) || l.account_name.toLowerCase().includes(q)
      )
    }
    return result
  }, [lines, category, search])

  const validation = useMemo(() => validateTrialBalance(lines), [lines])
  const summary    = useMemo(() => computeTrialBalanceSummary(lines), [lines])

  // Group by category for expandable sections
  type Cat = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense'
  const categoryGroups: { id: Cat; label: string }[] = [
    { id: 'asset',     label: 'Varlıklar'   },
    { id: 'liability', label: 'Borçlar'     },
    { id: 'equity',    label: 'Özkaynaklar' },
    { id: 'revenue',   label: 'Gelirler'    },
    { id: 'expense',   label: 'Giderler'    },
  ]

  const toggleGroup = (id: CategoryFilter) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  // When a category filter is active, show flat table; otherwise show grouped
  const showGrouped = category === 'all' && !search.trim()

  return (
    <div className="space-y-4">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-[#0f172a] tracking-tight">
            Mizan · {activePeriodLabel}
          </h2>
          <p className="text-[0.65rem] text-[#94a3b8] mt-0.5 font-medium uppercase tracking-widest">
            Genel Muhasebe Hesap Bakiyeleri
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Period selector (real periods) */}
          <select
            value={activePeriod}
            onChange={e => setPeriod(e.target.value)}
            disabled={periods.length === 0}
            className="text-xs border border-[#e8eaef] rounded px-2.5 py-1.5 bg-white text-[#334155] font-semibold focus:outline-none focus:ring-1 focus:ring-brand-light disabled:opacity-50"
          >
            {periods.length === 0 ? (
              <option value="">Dönem yok</option>
            ) : (
              periods.map(p => (
                <option key={p.id} value={p.id}>{periodLabel(p)}</option>
              ))
            )}
          </select>
          {/* Search */}
          <input
            type="search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Hesap ara..."
            className="text-xs border border-[#e8eaef] rounded px-2.5 py-1.5 w-44 bg-white focus:outline-none focus:ring-1 focus:ring-brand-light placeholder-[#94a3b8]"
          />
        </div>
      </div>

      {/* ── Loading / error / empty states ──────────────────────────────────── */}
      {isLoading && (
        <div className="space-y-2 animate-pulse">
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
            {[...Array(5)].map((_, i) => <div key={i} className="bg-[#f1f5f9] rounded h-14" />)}
          </div>
          <div className="bg-[#f1f5f9] rounded h-48" />
        </div>
      )}

      {isError && (
        <div className="bg-neg-light border border-neg-light rounded px-4 py-6 text-center">
          <p className="text-xs font-semibold text-neg-text">Mizan verisi yüklenemedi.</p>
          <p className="text-[10px] text-neg-text mt-1">Lütfen sayfayı yenileyin veya daha sonra tekrar deneyin.</p>
        </div>
      )}

      {isEmpty && (
        <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft px-4 py-10 text-center shadow-sm">
          <p className="text-xs font-medium text-[#334155] mb-1">Bu dönem için journal kaydı bulunamadı.</p>
          <p className="text-[0.65rem] text-[#94a3b8]">Mizan, defteri kebir kayıtları oluştukça dolacaktır.</p>
        </div>
      )}

      {!isLoading && !isError && !isEmpty && (
        <>
      {/* ── Category filter pills ───────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-1.5">
        {CATEGORY_PILLS.map(pill => (
          <button
            key={pill.id}
            onClick={() => setCategory(pill.id)}
            className={`text-[11px] font-bold px-3 py-1 rounded-full border transition-colors ${
              category === pill.id
                ? 'bg-[#1e293b] text-white border-[#1e293b]'
                : 'bg-white text-[#64748b] border-[#e8eaef] hover:border-[#cbd5e1] hover:text-[#334155]'
            }`}
          >
            {pill.label}
          </button>
        ))}
      </div>

      {/* ── Summary KPI row ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
        {[
          { label: 'Varlıklar',   value: summary.total_assets      },
          { label: 'Borçlar',     value: summary.total_liabilities  },
          { label: 'Özkaynaklar', value: summary.total_equity       },
          { label: 'Gelirler',    value: summary.total_revenue      },
          { label: 'Net Gelir',   value: summary.net_income, color: summary.net_income >= 0 ? 'text-pos-text' : 'text-neg-text' },
        ].map(k => (
          <div key={k.label} className="bg-white border border-[#e8eaef] rounded-xl shadow-soft px-3 py-2.5 shadow-sm">
            <div className="text-[0.6rem] font-bold uppercase tracking-wider text-[#94a3b8] mb-1">{k.label}</div>
            <div className={`text-xs font-bold tabular-nums ${k.color ?? 'text-[#0f172a]'}`}>
              {fmtTRY(k.value)}
            </div>
          </div>
        ))}
      </div>

      {/* ── Account table ───────────────────────────────────────────────────── */}
      {showGrouped ? (
        // Grouped view
        <div className="space-y-2">
          {categoryGroups.map(grp => {
            const grpLines = filterTrialBalanceByCategory(filteredLines.length ? filteredLines : lines, grp.id)
            if (grpLines.length === 0) return null
            const grpTotal = validateTrialBalance(grpLines)
            const isOpen   = expanded.has(grp.id)
            return (
              <div key={grp.id} className="bg-white border border-[#e8eaef] rounded-xl shadow-soft overflow-hidden shadow-sm">
                <button
                  onClick={() => toggleGroup(grp.id)}
                  className="w-full flex items-center justify-between px-4 py-2.5 bg-[#f8fafc] hover:bg-[#f1f5f9] transition-colors border-b border-[#e8eaef]"
                >
                  <span className="text-[0.65rem] font-bold uppercase tracking-wider text-[#64748b]">
                    {grp.label}
                    <span className="ml-2 text-[#94a3b8] font-semibold normal-case">{grpLines.length} hesap</span>
                  </span>
                  <span className="text-[10px] text-[#94a3b8]">{isOpen ? '▲' : '▼'}</span>
                </button>
                {isOpen && (
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-[#f1f5f9]">
                        <th className="px-4 py-2 text-left   text-[10px] font-bold text-[#94a3b8] uppercase tracking-widest">Hesap Kodu</th>
                        <th className="px-4 py-2 text-left   text-[10px] font-bold text-[#94a3b8] uppercase tracking-widest">Hesap Adı</th>
                        <th className="px-4 py-2 text-right  text-[10px] font-bold text-[#94a3b8] uppercase tracking-widest">Borç</th>
                        <th className="px-4 py-2 text-right  text-[10px] font-bold text-[#94a3b8] uppercase tracking-widest">Alacak</th>
                        <th className="px-4 py-2 text-right  text-[10px] font-bold text-[#94a3b8] uppercase tracking-widest">Bakiye</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#f1f5f9]">
                      {grpLines.map(line => (
                        <tr key={line.account_code} className="hover:bg-[#f8fafc]/60">
                          <td className="px-4 py-2 font-mono font-semibold text-[#64748b]">{line.account_code}</td>
                          <td className="px-4 py-2 text-[#1e293b]">{line.account_name}</td>
                          <td className="px-4 py-2 text-right font-mono text-[#64748b]">
                            {line.debit_balance > 0 ? fmtTRY(line.debit_balance) : '—'}
                          </td>
                          <td className="px-4 py-2 text-right font-mono text-[#64748b]">
                            {line.credit_balance > 0 ? fmtTRY(line.credit_balance) : '—'}
                          </td>
                          <td className={`px-4 py-2 text-right font-mono font-bold ${
                            line.net_balance > 0 ? 'text-[#0f172a]' :
                            line.net_balance < 0 ? 'text-neg-text' : 'text-[#94a3b8]'
                          }`}>
                            {fmtTRY(Math.abs(line.net_balance))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-[#e8eaef] bg-[#f8fafc]">
                        <td colSpan={2} className="px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-[#64748b]">
                          Alt Toplam
                        </td>
                        <td className="px-4 py-2 text-right font-mono font-bold text-[#0f172a] tabular-nums">
                          {fmtTRY(grpTotal.total_debits)}
                        </td>
                        <td className="px-4 py-2 text-right font-mono font-bold text-[#0f172a] tabular-nums">
                          {fmtTRY(grpTotal.total_credits)}
                        </td>
                        <td className="px-4 py-2" />
                      </tr>
                    </tfoot>
                  </table>
                )}
              </div>
            )
          })}
        </div>
      ) : (
        // Flat filtered view
        <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft overflow-hidden shadow-sm">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-[#f8fafc] border-b border-[#e8eaef]">
                <th className="px-4 py-2.5 text-left  text-[10px] font-bold text-[#94a3b8] uppercase tracking-widest">Hesap Kodu</th>
                <th className="px-4 py-2.5 text-left  text-[10px] font-bold text-[#94a3b8] uppercase tracking-widest">Hesap Adı</th>
                <th className="px-4 py-2.5 text-right text-[10px] font-bold text-[#94a3b8] uppercase tracking-widest">Borç</th>
                <th className="px-4 py-2.5 text-right text-[10px] font-bold text-[#94a3b8] uppercase tracking-widest">Alacak</th>
                <th className="px-4 py-2.5 text-right text-[10px] font-bold text-[#94a3b8] uppercase tracking-widest">Bakiye</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f1f5f9]">
              {filteredLines.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-[#94a3b8] text-xs">
                    Aramanızla eşleşen hesap bulunamadı.
                  </td>
                </tr>
              ) : (
                filteredLines.map(line => (
                  <tr key={line.account_code} className="hover:bg-[#f8fafc]/60">
                    <td className="px-4 py-2 font-mono font-semibold text-[#64748b]">{line.account_code}</td>
                    <td className="px-4 py-2 text-[#1e293b]">{line.account_name}</td>
                    <td className="px-4 py-2 text-right font-mono text-[#64748b]">
                      {line.debit_balance > 0 ? fmtTRY(line.debit_balance) : '—'}
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-[#64748b]">
                      {line.credit_balance > 0 ? fmtTRY(line.credit_balance) : '—'}
                    </td>
                    <td className={`px-4 py-2 text-right font-mono font-bold ${
                      line.net_balance > 0 ? 'text-[#0f172a]' :
                      line.net_balance < 0 ? 'text-neg-text' : 'text-[#94a3b8]'
                    }`}>
                      {fmtTRY(Math.abs(line.net_balance))}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Footer: TOPLAM + balance indicator ────────────────────────────── */}
      <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft overflow-hidden shadow-sm">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#f1f5f9]">
          <span className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8]">TOPLAM</span>
          <div className="flex items-center gap-6 tabular-nums text-xs font-bold">
            <div>
              <span className="text-[#94a3b8] font-semibold mr-1.5">Borç:</span>
              <span className="text-[#0f172a]">{fmtTRY(validation.total_debits)}</span>
            </div>
            <div>
              <span className="text-[#94a3b8] font-semibold mr-1.5">Alacak:</span>
              <span className="text-[#0f172a]">{fmtTRY(validation.total_credits)}</span>
            </div>
          </div>
        </div>
        {/* Balance indicator */}
        <div className={`px-4 py-3 flex items-center justify-between ${
          validation.balanced
            ? 'bg-pos-light'
            : 'bg-neg-light'
        }`}>
          <div className={`flex items-center gap-2 text-xs font-bold ${
            validation.balanced ? 'text-pos-text' : 'text-neg-text'
          }`}>
            <span className="text-base leading-none">{validation.balanced ? '✓' : '⚠'}</span>
            <span>
              {validation.balanced
                ? 'Σ Borç = Σ Alacak — Mizan Dengeli'
                : `DENGESIZ — Fark: ${fmtTRY(validation.discrepancy)}`}
            </span>
          </div>
          {validation.balanced ? (
            <span className="text-[10px] font-bold text-pos-text bg-white border border-pos-light px-2 py-0.5 rounded">
              {fmtTRY(validation.total_debits)}
            </span>
          ) : (
            <span className="text-[10px] font-bold text-neg-text bg-white border border-neg-light px-2 py-0.5 rounded">
              Fark: {fmtTRY(validation.discrepancy)}
            </span>
          )}
        </div>
      </div>
        </>
      )}

    </div>
  )
}
