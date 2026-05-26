'use client'

// ─────────────────────────────────────────────────────────────────────────────
// DividendLedgerTab — Dağıtım Geçmişi
//
// Displays the full dividend history ledger for the company:
//   1. Summary strip — totals: declared, paid, withholding, YTD amounts
//   2. Per-entry table — date, period, gross, withholding, net, status,
//      compliance dots (green = compliant, red = violation)
//   3. Per-partner totals table — aggregated view at the bottom
// ─────────────────────────────────────────────────────────────────────────────

import { useQuery } from '@tanstack/react-query'
import { fmtTRY, fmtDate } from '@/lib/format'
import type { DividendLedgerReport, DividendLedgerEntry } from '@/lib/services/pcle/dividend-ledger.service'

// ── Types ─────────────────────────────────────────────────────────────────────

interface LedgerApiResponse {
  report: DividendLedgerReport
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function fetchLedger(): Promise<DividendLedgerReport> {
  const res = await fetch('/api/partners/dividend-ledger')
  const data = await res.json()
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`)
  return (data as LedgerApiResponse).report
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { cls: string; label: string }> = {
    pending:  { cls: 'bg-warn-light text-warn-text border-warn-light',   label: 'Onay Bekliyor' },
    approved: { cls: 'bg-pos-light text-pos-text border-pos-light',      label: 'Onaylandı'     },
    rejected: { cls: 'bg-neg-light text-neg-text border-neg-light',      label: 'Reddedildi'    },
    expired:  { cls: 'bg-[#f1f5f9] text-[#64748b] border-[#e2e8f0]',    label: 'Süresi Doldu'  },
  }
  const { cls, label } = map[status] ?? map.expired
  return (
    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${cls}`}>
      {label}
    </span>
  )
}

function ComplianceDot({ ok, title }: { ok: boolean; title: string }) {
  return (
    <span
      title={title}
      className={`inline-block w-2 h-2 rounded-full ${ok ? 'bg-pos-text' : 'bg-neg'}`}
    />
  )
}

function SummaryCard({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex flex-col gap-0.5 p-3">
      <div className="text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8]">{label}</div>
      <div className={`text-base font-black tabular-nums ${tone ?? 'text-[#0f172a]'}`}>{value}</div>
    </div>
  )
}

function EntryRow({ entry }: { entry: DividendLedgerEntry }) {
  return (
    <tr className="hover:bg-[#f8fafc]/50 border-b border-[#f1f5f9] last:border-0">
      <td className="px-3 py-2.5 text-xs text-[#64748b] whitespace-nowrap">
        {fmtDate(entry.event_date)}
      </td>
      <td className="px-3 py-2.5 text-xs font-medium text-[#1e293b] whitespace-nowrap">
        {entry.period_label}
      </td>
      <td className="px-3 py-2.5 text-right tabular-nums text-xs font-semibold text-[#0f172a]">
        {fmtTRY(entry.gross_amount_try)}
      </td>
      <td className="px-3 py-2.5 text-right tabular-nums text-xs text-warn-text">
        −{fmtTRY(entry.withholding_try)}
      </td>
      <td className="px-3 py-2.5 text-right tabular-nums text-xs font-black text-pos-text">
        {fmtTRY(entry.net_amount_try)}
      </td>
      <td className="px-3 py-2.5">
        <StatusBadge status={entry.workflow_status} />
      </td>
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-1.5">
          <ComplianceDot ok={entry.ttk_509_compliant} title={entry.ttk_509_compliant ? 'TTK 509 uyumlu' : 'TTK 509 ihlali — dağıtılabilir kâr yok'} />
          <ComplianceDot ok={entry.ttk_519_compliant} title={entry.ttk_519_compliant ? 'TTK 519 uyumlu' : 'TTK 519 ihlali — yasal yedek karşılanmamış'} />
        </div>
      </td>
      <td className="px-3 py-2.5 text-[10px] text-[#94a3b8] max-w-[160px] truncate" title={entry.notes ?? undefined}>
        {entry.notes ?? '—'}
      </td>
    </tr>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function DividendLedgerTab() {
  const { data: report, isLoading, isError } = useQuery<DividendLedgerReport>({
    queryKey: ['dividend-ledger'],
    queryFn:  fetchLedger,
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

  if (isError || !report) {
    return (
      <div className="bg-neg-light border border-neg-light rounded px-4 py-3 text-xs text-neg-text">
        Dağıtım geçmişi yüklenemedi. Lütfen sayfayı yenileyin.
      </div>
    )
  }

  return (
    <div className="space-y-5">

      {/* ── 1. Summary strip ─────────────────────────────────────────────────── */}
      <div className="bg-white border border-[#e2e8f0] rounded overflow-hidden shadow-sm">
        <div className="px-4 py-3 border-b border-[#e2e8f0] bg-[#f8fafc]">
          <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Dağıtım Özeti</div>
          <p className="text-[10px] text-[#94a3b8] mt-0.5">Son 2 yıl · GVK 94 stopaj dahil</p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-y sm:divide-y-0 divide-[#e2e8f0]">
          <SummaryCard
            label="Toplam Beyan (Brüt)"
            value={fmtTRY(report.total_declared_try)}
          />
          <SummaryCard
            label="Toplam Ödenen (Brüt)"
            value={fmtTRY(report.total_paid_try)}
            tone="text-pos-text"
          />
          <SummaryCard
            label="Toplam Stopaj"
            value={fmtTRY(report.total_withholding_try)}
            tone="text-warn-text"
          />
          <SummaryCard
            label="Net Ödenen"
            value={fmtTRY(report.total_net_paid_try)}
            tone="text-pos-text"
          />
        </div>
        {/* YTD strip */}
        <div className="px-4 py-2.5 border-t border-[#e2e8f0] bg-[#f8fafc] flex items-center gap-6 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8]">YTD Beyan</span>
            <span className="text-xs font-black text-[#0f172a] tabular-nums">{fmtTRY(report.ytd_declared_try)}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8]">YTD Ödenen</span>
            <span className="text-xs font-black text-pos-text tabular-nums">{fmtTRY(report.ytd_paid_try)}</span>
          </div>
          {report.compliance_issues.length > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="inline-block w-2 h-2 rounded-full bg-neg flex-shrink-0" />
              <span className="text-[10px] text-neg-text font-semibold">
                {report.compliance_issues.length} uyum sorunu
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ── 2. Compliance issues banner ──────────────────────────────────────── */}
      {report.compliance_issues.length > 0 && (
        <div className="bg-neg-light border border-neg-light rounded px-4 py-3 space-y-1">
          <div className="text-[0.65rem] font-black uppercase tracking-widest text-neg-text mb-1">
            TTK Uyum Sorunları
          </div>
          {report.compliance_issues.map((issue, i) => (
            <div key={i} className="text-[10px] text-neg-text">
              • {issue}
            </div>
          ))}
        </div>
      )}

      {/* ── 3. Per-entry table ───────────────────────────────────────────────── */}
      <div className="bg-white border border-[#e2e8f0] rounded overflow-hidden shadow-sm">
        <div className="px-4 py-3 border-b border-[#e2e8f0] bg-[#f8fafc]">
          <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Temettü Hareketleri</div>
          <p className="text-[10px] text-[#94a3b8] mt-0.5">Son 2 yıl · Yeniden eskiye · Uyum: TTK509 · TTK519</p>
        </div>

        {report.entries.length === 0 ? (
          <div className="px-4 py-8 text-center text-xs text-[#94a3b8]">
            Henüz temettü beyanı yok
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[700px]">
              <thead>
                <tr className="border-b border-[#e2e8f0] bg-[#f8fafc]">
                  <th className="text-left px-3 py-2 text-[0.6rem] font-black uppercase text-[#94a3b8]">Tarih</th>
                  <th className="text-left px-3 py-2 text-[0.6rem] font-black uppercase text-[#94a3b8]">Dönem</th>
                  <th className="text-right px-3 py-2 text-[0.6rem] font-black uppercase text-[#94a3b8]">Brüt</th>
                  <th className="text-right px-3 py-2 text-[0.6rem] font-black uppercase text-[#94a3b8]">Stopaj</th>
                  <th className="text-right px-3 py-2 text-[0.6rem] font-black uppercase text-[#94a3b8]">Net</th>
                  <th className="text-left px-3 py-2 text-[0.6rem] font-black uppercase text-[#94a3b8]">Durum</th>
                  <th className="text-left px-3 py-2 text-[0.6rem] font-black uppercase text-[#94a3b8]">Uyum</th>
                  <th className="text-left px-3 py-2 text-[0.6rem] font-black uppercase text-[#94a3b8]">Not</th>
                </tr>
              </thead>
              <tbody>
                {report.entries.map(entry => (
                  <EntryRow key={entry.id} entry={entry} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── 4. Per-partner totals ────────────────────────────────────────────── */}
      {report.per_partner_totals.length > 0 && (
        <div className="bg-white border border-[#e2e8f0] rounded overflow-hidden shadow-sm">
          <div className="px-4 py-3 border-b border-[#e2e8f0] bg-[#f8fafc]">
            <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Ortak Bazında Toplam</div>
            <p className="text-[10px] text-[#94a3b8] mt-0.5">Beyan edilmiş ve ödenmiş tutarların toplamı</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[#e2e8f0] bg-[#f8fafc]">
                  <th className="text-left px-3 py-2 text-[0.6rem] font-black uppercase text-[#94a3b8]">Ortak</th>
                  <th className="text-right px-3 py-2 text-[0.6rem] font-black uppercase text-[#94a3b8]">Toplam Brüt</th>
                  <th className="text-right px-3 py-2 text-[0.6rem] font-black uppercase text-[#94a3b8]">Toplam Stopaj</th>
                  <th className="text-right px-3 py-2 text-[0.6rem] font-black uppercase text-[#94a3b8]">Toplam Net</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f1f5f9]">
                {report.per_partner_totals.map(pt => (
                  <tr key={pt.partner_name} className="hover:bg-[#f8fafc]/50">
                    <td className="px-3 py-2.5 font-medium text-[#1e293b]">{pt.partner_name}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-[#0f172a]">
                      {fmtTRY(pt.total_gross_try)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-warn-text">
                      −{fmtTRY(pt.total_withholding_try)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-black text-pos-text">
                      {fmtTRY(pt.total_net_try)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

    </div>
  )
}
