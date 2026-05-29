'use client'

// ─────────────────────────────────────────────────────────────────────────────
// JournalEntryClient
//
// Read-only viewer for Turkish MSUGT double-entry journal entries.
// Entries are grouped by date and displayed in a tabular format showing
// account codes, Turkish account names, debit and credit amounts.
//
// Empty state: "Muhasebe fişleri bu dönem için hazırlanmadı"
// ─────────────────────────────────────────────────────────────────────────────

import { useQuery }              from '@tanstack/react-query'
import { fmtTRY }                from '@/lib/format'
import { Panel, PanelHeader, EmptySlate } from '@/components/ds/shell'
import type { JournalEntry, JournalLine } from '@/lib/services/ledger/journal-entry.service'

// ── Types ─────────────────────────────────────────────────────────────────────

interface ApiResponse {
  entries:       JournalEntry[]
  trial_balance: {
    balanced:     boolean
    debit_total:  number
    credit_total: number
  }
}

interface Props {
  companyId: string
  from?:     string
  to?:       string
}

// ── Helper: group entries by date ─────────────────────────────────────────────

function groupByDate(entries: JournalEntry[]): Map<string, JournalEntry[]> {
  const map = new Map<string, JournalEntry[]>()
  for (const entry of entries) {
    const list = map.get(entry.entry_date) ?? []
    list.push(entry)
    map.set(entry.entry_date, list)
  }
  return map
}

// ── Helper: format source_type label ─────────────────────────────────────────

function sourceTypeLabel(t: JournalEntry['source_type']): string {
  const labels: Record<JournalEntry['source_type'], string> = {
    sale:         'Satış',
    expense:      'Masraf',
    purchase:     'Alım',
    partner_loan: 'Ortak Borç',
    payment:      'Tahsilat',
    period_close: 'Dönem Kapanış',
  }
  return labels[t] ?? t
}

// ── Entry lines table ─────────────────────────────────────────────────────────

function LinesTable({ lines }: { lines: JournalLine[] }) {
  return (
    <table className="w-full text-[11px]">
      <thead>
        <tr className="text-slate-400 border-b border-slate-100">
          <th className="text-left py-1 pr-2 font-medium w-12">Kod</th>
          <th className="text-left py-1 pr-2 font-medium">Hesap Adı</th>
          <th className="text-right py-1 pr-2 font-medium w-24">Borç (₺)</th>
          <th className="text-right py-1 font-medium w-24">Alacak (₺)</th>
        </tr>
      </thead>
      <tbody>
        {lines.map((line, i) => (
          <tr key={i} className="border-b border-slate-50 last:border-0">
            <td className="py-1 pr-2 font-mono text-slate-500">{line.account_code}</td>
            <td className="py-1 pr-2 text-slate-700">{line.account_name}</td>
            <td className="py-1 pr-2 text-right font-mono">
              {(line.debit_try ?? 0) > 0 ? fmtTRY(line.debit_try ?? 0) : ''}
            </td>
            <td className="py-1 text-right font-mono">
              {(line.credit_try ?? 0) > 0 ? fmtTRY(line.credit_try ?? 0) : ''}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// ── Single journal entry card ─────────────────────────────────────────────────

function EntryCard({ entry }: { entry: JournalEntry }) {
  const totalDebit  = entry.lines.reduce((s, l) => s + (l.debit_try  ?? 0), 0)
  const totalCredit = entry.lines.reduce((s, l) => s + (l.credit_try ?? 0), 0)

  return (
    <div className="border border-slate-200 rounded-md p-3 bg-white">
      <div className="flex items-start justify-between mb-2">
        <div>
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-100 mr-1.5">
            {sourceTypeLabel(entry.source_type)}
          </span>
          <span className="text-[12px] font-medium text-slate-800">{entry.description}</span>
          {entry.reference && entry.reference !== entry.source_id && (
            <span className="ml-2 text-[11px] text-slate-400">Ref: {entry.reference}</span>
          )}
        </div>
        <div className="text-right shrink-0 ml-2">
          <div className="text-[11px] text-slate-400">Toplam</div>
          <div className="text-[12px] font-semibold text-slate-700">{fmtTRY(totalDebit)}</div>
        </div>
      </div>
      <LinesTable lines={entry.lines} />
      {/* Balance footer */}
      <div className="mt-2 pt-1.5 border-t border-slate-100 flex justify-end gap-8 text-[11px]">
        <span className="text-slate-500">Borç: <span className="font-mono font-medium text-slate-700">{fmtTRY(totalDebit)}</span></span>
        <span className="text-slate-500">Alacak: <span className="font-mono font-medium text-slate-700">{fmtTRY(totalCredit)}</span></span>
      </div>
    </div>
  )
}

// ── Trial balance banner ──────────────────────────────────────────────────────

function TrialBalanceBanner({
  balanced,
  debit_total,
  credit_total,
}: {
  balanced:     boolean
  debit_total:  number
  credit_total: number
}) {
  return (
    <div className={`flex items-center justify-between px-4 py-2.5 rounded-md text-[12px] border ${
      balanced
        ? 'bg-green-50 border-green-200 text-green-800'
        : 'bg-red-50 border-red-200 text-red-800'
    }`}>
      <span className="font-semibold">
        {balanced ? '✓ Mizan dengeli' : '⚠ Mizan dengesiz'}
      </span>
      <span className="font-mono text-[11px] flex gap-6">
        <span>Toplam Borç: {fmtTRY(debit_total)}</span>
        <span>Toplam Alacak: {fmtTRY(credit_total)}</span>
      </span>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function JournalEntryClient({ companyId, from, to }: Props) {
  const { data, isLoading, isError } = useQuery<ApiResponse>({
    queryKey: ['journal-entries', companyId, from, to],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (from) params.set('from', from)
      if (to)   params.set('to', to)
      const res = await fetch(`/api/ledger/journal-entries?${params}`)
      if (!res.ok) throw new Error('Muhasebe fişleri yüklenemedi')
      return res.json()
    },
    enabled: Boolean(companyId),
    staleTime: 5 * 60 * 1000, // 5 min
  })

  const entries      = data?.entries        ?? []
  const trialBalance = data?.trial_balance

  return (
    <Panel>
      <PanelHeader
        label="Muhasebe Fişleri"
        sub="MSUGT uyumlu çift taraflı kayıt sistemi"
      />

      <div className="px-5 pb-6 space-y-4">
        {/* Trial balance */}
        {trialBalance && (
          <TrialBalanceBanner
            balanced={trialBalance.balanced}
            debit_total={trialBalance.debit_total}
            credit_total={trialBalance.credit_total}
          />
        )}

        {/* Loading */}
        {isLoading && (
          <div className="space-y-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-24 rounded-md bg-slate-100 animate-pulse" />
            ))}
          </div>
        )}

        {/* Error */}
        {isError && !isLoading && (
          <div className="text-[13px] text-red-600 py-4">
            Muhasebe fişleri yüklenirken hata oluştu.
          </div>
        )}

        {/* Empty state */}
        {!isLoading && !isError && entries.length === 0 && (
          <EmptySlate
            icon="📒"
            title="Muhasebe fişi bulunamadı"
            sub="Muhasebe fişleri bu dönem için hazırlanmadı"
          />
        )}

        {/* Entries grouped by date */}
        {!isLoading && entries.length > 0 && (() => {
          const grouped = groupByDate(entries)
          return Array.from(grouped.entries()).map(([date, dayEntries]) => (
            <div key={date} className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                  {new Date(date + 'T00:00:00').toLocaleDateString('tr-TR', {
                    weekday: 'short',
                    day:     'numeric',
                    month:   'long',
                    year:    'numeric',
                  })}
                </span>
                <div className="flex-1 h-px bg-slate-200" />
                <span className="text-[10px] text-slate-400">{dayEntries.length} fiş</span>
              </div>
              {dayEntries.map((entry, i) => (
                <EntryCard key={`${entry.source_id}-${i}`} entry={entry} />
              ))}
            </div>
          ))
        })()}
      </div>
    </Panel>
  )
}
