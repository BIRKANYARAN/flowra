'use client'

import Link from 'next/link'
import {
  LedgerData, LedgerEntry, LedgerSortCol,
  pct, fmt,
} from '@/app/dashboard/partners/_components/types'
import { Skeleton } from '@/app/dashboard/partners/_components/ui'

export interface LedgerTabProps {
  loading: boolean
  ledger: LedgerData | null
  sortedLedgerEntries: LedgerEntry[]
  ledgerSort: { col: string; dir: 'asc' | 'desc' }
  onToggleSort: (col: LedgerSortCol) => void
}

export function LedgerTab({
  loading,
  ledger,
  sortedLedgerEntries,
  ledgerSort,
  onToggleSort,
}: LedgerTabProps) {
  return (
    <div className="flex flex-col gap-3">
      {loading ? <Skeleton h="h-40" /> : !ledger ? (
        <div className="bg-neg-light border border-neg-light rounded px-4 py-3 text-sm text-neg">Finansal defter yüklenemedi.</div>
      ) : (
        <>
          <div className="grid grid-cols-4 gap-2">
            {[
              { label: 'Toplam Özkaynak',  value: fmt(ledger.summary.total_equity_pool),      color: 'text-primary-600' },
              { label: 'Net Borç',          value: fmt(ledger.summary.total_debt_to_partners), color: ledger.summary.total_debt_to_partners > 0 ? 'text-warn-text' : 'text-gray-400' },
              { label: 'Toplam Temettü',    value: fmt(ledger.summary.total_dividends),        color: 'text-pos-text' },
              { label: 'Borç/Özkaynak',     value: ledger.summary.debt_to_equity_ratio !== null ? ledger.summary.debt_to_equity_ratio.toFixed(2) + '×' : '—', color: 'text-gray-700' },
            ].map(c => (
              <div key={c.label} className="bg-white border border-[#e2e8f0] rounded px-4 py-3 shadow-sm">
                <div className={`text-[10px] font-bold uppercase tracking-widest mb-1 ${c.color}`}>{c.label}</div>
                <div className="text-lg font-black tabular-nums text-gray-900 leading-none">{c.value}</div>
              </div>
            ))}
          </div>
          <div className="bg-white border border-[#e2e8f0] rounded overflow-hidden shadow-sm">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[#e2e8f0] bg-[#f8fafc]">
                  {([
                    { col: 'partner_name',        label: 'Ortak',       align: 'left'  },
                    { col: 'equity_contributed',   label: 'Özkaynak',    align: 'right' },
                    { col: 'loans_given',          label: 'Verilen Borç',align: 'right' },
                    { col: null,                   label: 'Geri Ödenen', align: 'right' },
                    { col: 'net_loan_outstanding', label: 'Net Borç',    align: 'right' },
                    { col: 'dividends_received',   label: 'Temettü',     align: 'right' },
                    { col: null,                   label: 'Maaş/Huzur', align: 'right' },
                    { col: 'company_total_owed',   label: 'Şirket Borcu',align: 'right' },
                  ] as { col: string | null; label: string; align: string }[]).map(h => {
                    const isSorted   = h.col && ledgerSort.col === h.col
                    const isLeft     = h.align === 'left'
                    return (
                      <th
                        key={h.label}
                        className={`px-4 py-2.5 text-[10px] font-black uppercase tracking-widest ${isSorted ? 'text-primary-600' : 'text-gray-400'} ${isLeft ? 'text-left' : 'text-right'} ${h.col ? 'cursor-pointer select-none hover:text-gray-600' : ''}`}
                        onClick={h.col ? () => onToggleSort(h.col as LedgerSortCol) : undefined}
                      >
                        {h.label}
                        {isSorted && <span className="ml-0.5">{ledgerSort.dir === 'asc' ? ' ↑' : ' ↓'}</span>}
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f1f5f9]">
                {sortedLedgerEntries.map(e => (
                  <tr key={e.partner_id} className={`hover:bg-[#f8fafc]/60 ${!e.is_active ? 'opacity-50' : ''}`}>
                    <td className="px-4 py-3 font-semibold text-gray-900">
                      {e.partner_name}
                      {!e.is_active && <span className="ml-1.5 text-[9px] text-gray-400">(pasif)</span>}
                      <div className="text-[10px] text-gray-400 font-normal">{pct(e.share_ratio)}</div>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-primary-700 font-bold">{fmt(e.equity_contributed)}</td>
                    <td className="px-4 py-3 text-right font-mono text-warn-text">{fmt(e.loans_given)}</td>
                    <td className="px-4 py-3 text-right font-mono text-gray-500">{fmt(e.loans_repaid)}</td>
                    <td className={`px-4 py-3 text-right font-mono font-bold ${e.net_loan_outstanding > 0 ? 'text-warn-text' : 'text-gray-400'}`}>{fmt(e.net_loan_outstanding)}</td>
                    <td className="px-4 py-3 text-right font-mono text-pos-text">{fmt(e.dividends_received)}</td>
                    <td className="px-4 py-3 text-right font-mono text-gray-500">{fmt(e.salary_received)}</td>
                    <td className="px-4 py-3 text-right font-mono font-black text-primary-800">{fmt(e.company_total_owed)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Cross-navigation */}
      <div className="flex items-center justify-between px-1 pt-1">
        <p className="text-[10px] text-gray-400 leading-relaxed">
          Ortak defter özkaynaklar ve bilanço ile uyumlu olmalıdır.
        </p>
        <div className="flex items-center gap-2 shrink-0 ml-4">
          <Link href="/dashboard/finance?tab=balance" className="text-[11px] font-bold text-primary-600 hover:text-primary-700 underline underline-offset-2 whitespace-nowrap">
            Bilanço →
          </Link>
          <span className="text-gray-200">|</span>
          <Link href="/dashboard/partners?tab=tranches" className="text-[11px] font-bold text-primary-600 hover:text-primary-700 underline underline-offset-2 whitespace-nowrap">
            Borç Dilimleri →
          </Link>
        </div>
      </div>
    </div>
  )
}
