'use client'

// ─────────────────────────────────────────────────────────────────────────────
// DividendLedgerTab — Dağıtım Geçmişi (Formal Dividend Statement)
//
// Displays the formal dividend ledger for the company:
//   1. Year selector
//   2. Summary strip — Total Declared / Total Paid / Total Pending / Total Withholding
//   3. Compliance notes panel (yellow info box if notes exist)
//   4. Per-partner summary cards — name, share %, yield, gross/withholding/net
//   5. Full event ledger table — Date | Partner | Type | Gross | Withholding | Net | Status
//   6. Empty state
//
// Uses TanStack Query with queryKey: ['dividend-ledger', companyId, year]
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fmtTRY, fmtDate, fmtPct } from '@/lib/format'
import type { DividendLedger, DividendEvent, PartnerDividendSummary } from '@/lib/services/pcle/dividend-ledger.service'

// ── Types ─────────────────────────────────────────────────────────────────────

interface LedgerApiResponse {
  ledger: DividendLedger
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function fetchLedger(year?: number): Promise<DividendLedger> {
  const params = new URLSearchParams()
  if (year) params.set('year', String(year))
  const url = '/api/partners/dividend-ledger' + (params.size > 0 ? `?${params}` : '')
  const res = await fetch(url)
  const data = await res.json()
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`)
  return (data as LedgerApiResponse).ledger
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SummaryCard({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex flex-col gap-0.5 p-3">
      <div className="text-[0.6rem] font-bold uppercase tracking-wider text-[#94a3b8]">{label}</div>
      <div className={`text-base font-black tabular-nums ${tone ?? 'text-[#0f172a]'}`}>{value}</div>
    </div>
  )
}

function StatusBadge({ isPaid }: { isPaid: boolean }) {
  if (isPaid) {
    return (
      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded border bg-pos-light text-pos-text border-pos-light">
        Ödendi
      </span>
    )
  }
  return (
    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded border bg-warn-light text-warn-text border-warn-light">
      Bekliyor
    </span>
  )
}

function EventTypeBadge({ type }: { type: DividendEvent['event_type'] }) {
  if (type === 'DIVIDEND_PAID') {
    return (
      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded border bg-pos-light text-pos-text border-pos-light">
        Ödeme
      </span>
    )
  }
  return (
    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded border bg-[#f1f5f9] text-[#64748b] border-[#e8eaef]">
      Beyan
    </span>
  )
}

function EventRow({ event }: { event: DividendEvent }) {
  return (
    <tr className="hover:bg-[#f8fafc]/50 border-b border-[#f1f5f9] last:border-0">
      <td className="px-3 py-2.5 text-xs text-[#64748b] whitespace-nowrap">
        {fmtDate(event.event_date)}
      </td>
      <td className="px-3 py-2.5 text-xs font-medium text-[#1e293b] whitespace-nowrap">
        {event.partner_name}
      </td>
      <td className="px-3 py-2.5">
        <EventTypeBadge type={event.event_type} />
      </td>
      <td className="px-3 py-2.5 text-right tabular-nums text-xs font-semibold text-[#0f172a]">
        {fmtTRY(event.gross_amount_try)}
      </td>
      <td className="px-3 py-2.5 text-right tabular-nums text-xs text-warn-text">
        −{fmtTRY(event.withholding_tax_try)}
      </td>
      <td className="px-3 py-2.5 text-right tabular-nums text-xs font-black text-pos-text">
        {fmtTRY(event.net_amount_try)}
      </td>
      <td className="px-3 py-2.5">
        <StatusBadge isPaid={event.is_paid} />
      </td>
    </tr>
  )
}

function PartnerSummaryCard({ summary }: { summary: PartnerDividendSummary }) {
  return (
    <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft overflow-hidden shadow-sm">
      <div className="px-4 py-3 border-b border-[#e8eaef] bg-[#f8fafc] flex items-start justify-between gap-2">
        <div>
          <div className="text-xs font-black text-[#0f172a]">{summary.partner_name}</div>
          <div className="text-[10px] text-[#94a3b8] mt-0.5">
            {fmtPct(summary.share_ratio_pct)} pay
            {summary.paid_in_capital_try > 0 && (
              <> · Sermaye: {fmtTRY(summary.paid_in_capital_try)}</>
            )}
          </div>
        </div>
        {summary.dividend_yield_pct !== null && (
          <div className="text-right flex-shrink-0">
            <div className="text-[0.6rem] font-bold uppercase tracking-wider text-[#94a3b8]">Temettü Verimi</div>
            <div className="text-sm font-black text-pos-text tabular-nums">
              {fmtPct(summary.dividend_yield_pct)}
            </div>
          </div>
        )}
      </div>
      <div className="grid grid-cols-3 divide-x divide-[#e8eaef]">
        <div className="px-3 py-2.5">
          <div className="text-[0.55rem] font-bold uppercase tracking-wider text-[#94a3b8]">Brüt</div>
          <div className="text-xs font-black tabular-nums text-[#0f172a] mt-0.5">
            {fmtTRY(summary.total_gross_dividends_try)}
          </div>
        </div>
        <div className="px-3 py-2.5">
          <div className="text-[0.55rem] font-bold uppercase tracking-wider text-[#94a3b8]">Stopaj (%10)</div>
          <div className="text-xs font-bold tabular-nums text-warn-text mt-0.5">
            −{fmtTRY(summary.total_withholding_try)}
          </div>
        </div>
        <div className="px-3 py-2.5">
          <div className="text-[0.55rem] font-bold uppercase tracking-wider text-[#94a3b8]">Net</div>
          <div className="text-xs font-black tabular-nums text-pos-text mt-0.5">
            {fmtTRY(summary.total_net_dividends_try)}
          </div>
        </div>
      </div>
      {summary.pending_gross_try > 0 && (
        <div className="px-4 py-2 border-t border-[#e8eaef] bg-warn-light flex items-center justify-between">
          <span className="text-[10px] text-warn-text font-semibold">Bekleyen Temettü</span>
          <span className="text-[10px] font-black text-warn-text tabular-nums">
            {fmtTRY(summary.pending_gross_try)}
          </span>
        </div>
      )}
    </div>
  )
}

// ── Year selector ─────────────────────────────────────────────────────────────

const CURRENT_YEAR = new Date().getFullYear()
const YEAR_OPTIONS = [undefined, ...Array.from({ length: 5 }, (_, i) => CURRENT_YEAR - i)]

// ── Main component ────────────────────────────────────────────────────────────

export function DividendLedgerTab() {
  const [selectedYear, setSelectedYear] = useState<number | undefined>(undefined)

  const companyId = '' // resolved server-side via auth

  const { data: ledger, isLoading, isError } = useQuery<DividendLedger>({
    queryKey: ['dividend-ledger', companyId, selectedYear],
    queryFn:  () => fetchLedger(selectedYear),
    staleTime: 60_000,
  })

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-16 bg-[#f1f5f9] rounded animate-pulse" />
        ))}
      </div>
    )
  }

  if (isError || !ledger) {
    return (
      <div className="bg-neg-light border border-neg-light rounded px-4 py-3 text-xs text-neg-text">
        Temettü defteri yüklenemedi. Lütfen sayfayı yenileyin.
      </div>
    )
  }

  const hasEvents = ledger.all_events.length > 0
  const declaredEvents = ledger.all_events.filter(e => e.event_type === 'DIVIDEND_DECLARED')

  return (
    <div className="space-y-5">

      {/* ── Year selector ────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <span className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8]">Dönem</span>
        <div className="flex gap-1">
          {YEAR_OPTIONS.map(y => (
            <button
              key={y ?? 'all'}
              onClick={() => setSelectedYear(y)}
              className={[
                'px-3 py-1.5 text-xs font-semibold rounded border transition-colors',
                selectedYear === y
                  ? 'bg-[#0f172a] text-white border-[#0f172a]'
                  : 'bg-white text-[#64748b] border-[#e8eaef] hover:border-[#94a3b8]',
              ].join(' ')}
            >
              {y ?? 'Tümü'}
            </button>
          ))}
        </div>
      </div>

      {/* ── 1. Summary strip ─────────────────────────────────────────────────── */}
      <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft overflow-hidden shadow-sm">
        <div className="px-4 py-3 border-b border-[#e8eaef] bg-[#f8fafc]">
          <div className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8]">Temettü Özeti</div>
          <p className="text-[10px] text-[#94a3b8] mt-0.5">GVK 94 stopaj dahil · TTK 509 uyum takibi</p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-y sm:divide-y-0 divide-[#e8eaef]">
          <SummaryCard
            label="Toplam Beyan (Brüt)"
            value={fmtTRY(ledger.total_declared_try)}
          />
          <SummaryCard
            label="Toplam Ödenen"
            value={fmtTRY(ledger.total_paid_try)}
            tone="text-pos-text"
          />
          <SummaryCard
            label="Bekleyen"
            value={fmtTRY(ledger.total_pending_try)}
            tone={ledger.total_pending_try > 0 ? 'text-warn-text' : 'text-[#0f172a]'}
          />
          <SummaryCard
            label="Toplam Stopaj (YTD)"
            value={fmtTRY(ledger.total_withholding_ytd_try)}
            tone="text-warn-text"
          />
        </div>
      </div>

      {/* ── 2. Compliance notes ──────────────────────────────────────────────── */}
      {ledger.compliance_notes.length > 0 && (
        <div className="bg-warn-light border border-warn-light rounded px-4 py-3 space-y-1">
          <div className="text-[0.65rem] font-bold uppercase tracking-wider text-warn-text mb-1">
            Yasal Uyum Notları
          </div>
          {ledger.compliance_notes.map((note, i) => (
            <div key={i} className="text-[10px] text-warn-text flex items-start gap-1.5">
              <span className="mt-0.5 flex-shrink-0">•</span>
              <span>{note}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── 3. Per-partner summary cards ─────────────────────────────────────── */}
      {ledger.partner_summaries.length > 0 && (
        <div>
          <div className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8] mb-3">
            Ortak Bazında Özet
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {ledger.partner_summaries.map(summary => (
              <PartnerSummaryCard key={summary.partner_id} summary={summary} />
            ))}
          </div>
        </div>
      )}

      {/* ── 4. Full event ledger table ───────────────────────────────────────── */}
      <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft overflow-hidden shadow-sm">
        <div className="px-4 py-3 border-b border-[#e8eaef] bg-[#f8fafc]">
          <div className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8]">Temettü Hareketleri</div>
          <p className="text-[10px] text-[#94a3b8] mt-0.5">
            Tüm beyan ve ödeme kayıtları · Kronolojik · GVK 94 stopaj
          </p>
        </div>

        {!hasEvents ? (
          <div className="px-4 py-10 text-center">
            <div className="text-sm font-semibold text-[#64748b]">Temettü kaydı bulunamadı</div>
            <div className="text-xs text-[#94a3b8] mt-1">
              {selectedYear
                ? `${selectedYear} yılına ait temettü beyanı mevcut değil`
                : 'Henüz temettü beyanı yapılmamış'}
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[680px]">
              <thead>
                <tr className="border-b border-[#e8eaef] bg-[#f8fafc]">
                  <th className="text-left px-3 py-2 text-[0.6rem] font-black uppercase text-[#94a3b8]">Tarih</th>
                  <th className="text-left px-3 py-2 text-[0.6rem] font-black uppercase text-[#94a3b8]">Ortak</th>
                  <th className="text-left px-3 py-2 text-[0.6rem] font-black uppercase text-[#94a3b8]">Tür</th>
                  <th className="text-right px-3 py-2 text-[0.6rem] font-black uppercase text-[#94a3b8]">Brüt</th>
                  <th className="text-right px-3 py-2 text-[0.6rem] font-black uppercase text-[#94a3b8]">Stopaj</th>
                  <th className="text-right px-3 py-2 text-[0.6rem] font-black uppercase text-[#94a3b8]">Net</th>
                  <th className="text-left px-3 py-2 text-[0.6rem] font-black uppercase text-[#94a3b8]">Durum</th>
                </tr>
              </thead>
              <tbody>
                {declaredEvents.map(event => (
                  <EventRow key={event.event_id} event={event} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  )
}
