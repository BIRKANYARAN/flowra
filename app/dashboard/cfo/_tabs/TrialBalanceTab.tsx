'use client'

// ── TrialBalanceTab — Mizan (Trial Balance) Viewer ───────────────────────────
// Full mizan viewer with category filter pills, search, period selector,
// grouped account table, and balance indicator.

import { useState, useMemo } from 'react'
import { fmtTRY } from '@/lib/format'
import {
  classifyAccount,
  validateTrialBalance,
  filterTrialBalanceByCategory,
  computeTrialBalanceSummary,
  type TrialBalanceLine,
} from '@/lib/services/ledger/trial-balance.service'

// ── Mock data: 12 accounts across all categories ─────────────────────────────

const MOCK_LINES: TrialBalanceLine[] = [
  // Assets (1xx)
  { account_code: '100', account_name: 'Kasa',                    debit_balance: 45_000,   credit_balance: 12_000,  net_balance: 33_000,   normal_balance: 'debit'  },
  { account_code: '102', account_name: 'Bankalar',                debit_balance: 280_000,  credit_balance: 95_000,  net_balance: 185_000,  normal_balance: 'debit'  },
  { account_code: '120', account_name: 'Alıcılar',                debit_balance: 175_000,  credit_balance: 40_000,  net_balance: 135_000,  normal_balance: 'debit'  },
  { account_code: '153', account_name: 'Ticari Mallar',           debit_balance: 92_000,   credit_balance: 30_000,  net_balance: 62_000,   normal_balance: 'debit'  },
  // Non-current asset with contra (2xx)
  { account_code: '253', account_name: 'Tesis Makine ve Cihazlar', debit_balance: 200_000, credit_balance: 0,       net_balance: 200_000,  normal_balance: 'debit'  },
  { account_code: '257', account_name: 'Birikmiş Amortismanlar',  debit_balance: 0,        credit_balance: 60_000,  net_balance: -60_000,  normal_balance: 'credit' },
  // Liabilities (3xx)
  { account_code: '320', account_name: 'Satıcılar',               debit_balance: 25_000,   credit_balance: 110_000, net_balance: -85_000,  normal_balance: 'credit' },
  { account_code: '360', account_name: 'Ödenecek Vergiler',       debit_balance: 5_000,    credit_balance: 38_000,  net_balance: -33_000,  normal_balance: 'credit' },
  // Equity (5xx)
  { account_code: '500', account_name: 'Sermaye',                 debit_balance: 0,        credit_balance: 300_000, net_balance: -300_000, normal_balance: 'credit' },
  { account_code: '570', account_name: 'Geçmiş Yıllar Karları',  debit_balance: 0,        credit_balance: 120_000, net_balance: -120_000, normal_balance: 'credit' },
  // Revenue (60x)
  { account_code: '600', account_name: 'Yurt İçi Satışlar',      debit_balance: 0,        credit_balance: 450_000, net_balance: -450_000, normal_balance: 'credit' },
  // Expense (7xx)
  { account_code: '770', account_name: 'Genel Yönetim Giderleri', debit_balance: 83_000,  credit_balance: 0,       net_balance: 83_000,   normal_balance: 'debit'  },
]

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

const PERIOD_OPTIONS = [
  { value: '2025-04', label: 'Nisan 2025'  },
  { value: '2025-03', label: 'Mart 2025'   },
  { value: '2025-02', label: 'Şubat 2025'  },
  { value: '2025-01', label: 'Ocak 2025'   },
]

// ── Component ─────────────────────────────────────────────────────────────────

export function TrialBalanceTab() {
  const [period,   setPeriod]   = useState('2025-04')
  const [search,   setSearch]   = useState('')
  const [category, setCategory] = useState<CategoryFilter>('all')
  const [expanded, setExpanded] = useState<Set<CategoryFilter>>(new Set(['all', 'asset', 'liability', 'equity', 'revenue', 'expense']))

  const periodLabel = PERIOD_OPTIONS.find(p => p.value === period)?.label ?? period

  // Filter lines by category + search
  const filteredLines = useMemo<TrialBalanceLine[]>(() => {
    let lines = MOCK_LINES
    if (category !== 'all') {
      lines = filterTrialBalanceByCategory(lines, category)
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      lines = lines.filter(
        l => l.account_code.includes(q) || l.account_name.toLowerCase().includes(q)
      )
    }
    return lines
  }, [category, search])

  const validation = useMemo(() => validateTrialBalance(MOCK_LINES), [])
  const summary    = useMemo(() => computeTrialBalanceSummary(MOCK_LINES), [])

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
          <h2 className="text-lg font-black text-[#0f172a] tracking-tight">
            Mizan · {periodLabel}
          </h2>
          <p className="text-[0.65rem] text-[#94a3b8] mt-0.5 font-medium uppercase tracking-widest">
            Genel Muhasebe Hesap Bakiyeleri
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Period selector */}
          <select
            value={period}
            onChange={e => setPeriod(e.target.value)}
            className="text-xs border border-[#e2e8f0] rounded px-2.5 py-1.5 bg-white text-[#334155] font-semibold focus:outline-none focus:ring-1 focus:ring-brand-light"
          >
            {PERIOD_OPTIONS.map(p => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
          {/* Search */}
          <input
            type="search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Hesap ara..."
            className="text-xs border border-[#e2e8f0] rounded px-2.5 py-1.5 w-44 bg-white focus:outline-none focus:ring-1 focus:ring-brand-light placeholder-[#94a3b8]"
          />
        </div>
      </div>

      {/* ── Category filter pills ───────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-1.5">
        {CATEGORY_PILLS.map(pill => (
          <button
            key={pill.id}
            onClick={() => setCategory(pill.id)}
            className={`text-[11px] font-bold px-3 py-1 rounded-full border transition-colors ${
              category === pill.id
                ? 'bg-[#1e293b] text-white border-[#1e293b]'
                : 'bg-white text-[#64748b] border-[#e2e8f0] hover:border-[#cbd5e1] hover:text-[#334155]'
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
          <div key={k.label} className="bg-white border border-[#e2e8f0] rounded px-3 py-2.5 shadow-sm">
            <div className="text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8] mb-1">{k.label}</div>
            <div className={`text-xs font-black tabular-nums ${k.color ?? 'text-[#0f172a]'}`}>
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
            const lines = filterTrialBalanceByCategory(filteredLines.length ? filteredLines : MOCK_LINES, grp.id)
            if (lines.length === 0) return null
            const grpTotal = validateTrialBalance(lines)
            const isOpen   = expanded.has(grp.id)
            return (
              <div key={grp.id} className="bg-white border border-[#e2e8f0] rounded overflow-hidden shadow-sm">
                <button
                  onClick={() => toggleGroup(grp.id)}
                  className="w-full flex items-center justify-between px-4 py-2.5 bg-[#f8fafc] hover:bg-[#f1f5f9] transition-colors border-b border-[#e2e8f0]"
                >
                  <span className="text-[0.65rem] font-black uppercase tracking-widest text-[#64748b]">
                    {grp.label}
                    <span className="ml-2 text-[#94a3b8] font-semibold normal-case">{lines.length} hesap</span>
                  </span>
                  <span className="text-[10px] text-[#94a3b8]">{isOpen ? '▲' : '▼'}</span>
                </button>
                {isOpen && (
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-[#f1f5f9]">
                        <th className="px-4 py-2 text-left   text-[10px] font-black text-[#94a3b8] uppercase tracking-widest">Hesap Kodu</th>
                        <th className="px-4 py-2 text-left   text-[10px] font-black text-[#94a3b8] uppercase tracking-widest">Hesap Adı</th>
                        <th className="px-4 py-2 text-right  text-[10px] font-black text-[#94a3b8] uppercase tracking-widest">Borç</th>
                        <th className="px-4 py-2 text-right  text-[10px] font-black text-[#94a3b8] uppercase tracking-widest">Alacak</th>
                        <th className="px-4 py-2 text-right  text-[10px] font-black text-[#94a3b8] uppercase tracking-widest">Bakiye</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#f1f5f9]">
                      {lines.map(line => (
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
                      <tr className="border-t-2 border-[#e2e8f0] bg-[#f8fafc]">
                        <td colSpan={2} className="px-4 py-2 text-[10px] font-black uppercase tracking-widest text-[#64748b]">
                          Alt Toplam
                        </td>
                        <td className="px-4 py-2 text-right font-mono font-black text-[#0f172a] tabular-nums">
                          {fmtTRY(grpTotal.total_debits)}
                        </td>
                        <td className="px-4 py-2 text-right font-mono font-black text-[#0f172a] tabular-nums">
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
        <div className="bg-white border border-[#e2e8f0] rounded overflow-hidden shadow-sm">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-[#f8fafc] border-b border-[#e2e8f0]">
                <th className="px-4 py-2.5 text-left  text-[10px] font-black text-[#94a3b8] uppercase tracking-widest">Hesap Kodu</th>
                <th className="px-4 py-2.5 text-left  text-[10px] font-black text-[#94a3b8] uppercase tracking-widest">Hesap Adı</th>
                <th className="px-4 py-2.5 text-right text-[10px] font-black text-[#94a3b8] uppercase tracking-widest">Borç</th>
                <th className="px-4 py-2.5 text-right text-[10px] font-black text-[#94a3b8] uppercase tracking-widest">Alacak</th>
                <th className="px-4 py-2.5 text-right text-[10px] font-black text-[#94a3b8] uppercase tracking-widest">Bakiye</th>
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
      <div className="bg-white border border-[#e2e8f0] rounded overflow-hidden shadow-sm">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#f1f5f9]">
          <span className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">TOPLAM</span>
          <div className="flex items-center gap-6 tabular-nums text-xs font-black">
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

    </div>
  )
}
