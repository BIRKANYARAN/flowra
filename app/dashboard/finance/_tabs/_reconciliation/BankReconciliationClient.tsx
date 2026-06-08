'use client'

// ─────────────────────────────────────────────────────────────────────────────
// BankReconciliationClient
//
// Displays the bank reconciliation report: compares system book balance
// (from sales + expenses + purchases) against reported bank balances.
//
// Features:
//   - As-of date selector (default today)
//   - Overall reconciliation status badge
//   - Summary KPI row: Book Balance / Bank Balance / Discrepancy / Recon %
//   - Reconciliation lines table with status badges
//   - Book-only mode banner when no bank_accounts table exists
//   - TanStack Query caching
// ─────────────────────────────────────────────────────────────────────────────

import { useState }           from 'react'
import { useQuery }           from '@tanstack/react-query'
import { fmtTRY, fmtPct, fmtDate } from '@/lib/format'
import type {
  BankReconciliationReport,
  ReconciliationLine,
  DiscrepancySeverity,
} from '@/lib/services/ledger/bank-reconciliation.service'

// ── Props ──────────────────────────────────────────────────────────────────────

interface Props {
  companyId: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

async function fetchReport(companyId: string, asOf: string): Promise<BankReconciliationReport> {
  const params = new URLSearchParams({ asOf })
  const res = await fetch(`/api/ledger/bank-reconciliation?${params}`, {
    headers: { 'x-company-id': companyId },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

// ── Severity UI maps ──────────────────────────────────────────────────────────

const SEVERITY_BADGE: Record<DiscrepancySeverity, { label: string; cls: string }> = {
  clean:    { label: 'Mutabık',    cls: 'bg-pos-light text-pos-text border-pos-light' },
  minor:    { label: 'Küçük Fark', cls: 'bg-warn-light text-warn-text border-warn-light' },
  moderate: { label: 'Orta Fark',  cls: 'bg-orange-50 text-orange-700 border-orange-200' },
  material: { label: 'Önemli Fark', cls: 'bg-neg-light text-neg-text border-neg-light' },
}

function SeverityBadge({ severity }: { severity: DiscrepancySeverity }) {
  const { label, cls } = SEVERITY_BADGE[severity]
  return (
    <span className={`text-[9px] font-bold px-2 py-0.5 rounded border ${cls}`}>
      {label}
    </span>
  )
}

function LineSeverityBadge({ line }: { line: ReconciliationLine }) {
  if (line.is_reconciled) {
    return (
      <span className="text-[9px] font-bold px-2 py-0.5 rounded border bg-pos-light text-pos-text border-pos-light">
        ✓ Mutabık
      </span>
    )
  }
  const { label, cls } = SEVERITY_BADGE[line.discrepancy_severity]
  const icon = line.discrepancy_severity === 'material' ? '✗' : '△'
  return (
    <span className={`text-[9px] font-bold px-2 py-0.5 rounded border ${cls}`}>
      {icon} {label}
    </span>
  )
}

// ── Summary KPI card ──────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, color = 'text-[#0f172a]' }: {
  label: string
  value: string
  sub?: string
  color?: string
}) {
  return (
    <div className="bg-[#f8fafc] border border-[#e8eaef] rounded px-4 py-3 flex-1 min-w-0">
      <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-1">{label}</div>
      <div className={`text-sm font-black tabular-nums ${color}`}>{value}</div>
      {sub && <div className="text-[0.65rem] text-[#94a3b8] mt-0.5">{sub}</div>}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function BankReconciliationClient({ companyId }: Props) {
  const [asOfDate, setAsOfDate] = useState<string>(todayISO)

  const { data: report, isLoading, isError, error } = useQuery<BankReconciliationReport>({
    queryKey: ['bank-reconciliation', companyId, asOfDate],
    queryFn:  () => fetchReport(companyId, asOfDate),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  })

  return (
    <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft p-4 shadow-sm space-y-4">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">
            Banka Mutabakat Raporu
          </div>
          <div className="text-[10px] text-[#94a3b8] mt-0.5">
            Defter bakiyesi vs banka bakiyesi — fark analizi
          </div>
        </div>

        {/* Date selector */}
        <div className="flex items-center gap-2">
          <label className="text-[10px] text-[#94a3b8] font-semibold whitespace-nowrap">
            İtibarıyla:
          </label>
          <input
            type="date"
            value={asOfDate}
            max={todayISO()}
            onChange={e => setAsOfDate(e.target.value || todayISO())}
            className="text-xs border border-[#e8eaef] rounded px-2 py-1 text-[#334155] focus:outline-none focus:ring-1 focus:ring-brand-light/40"
          />
        </div>
      </div>

      {/* ── Loading ────────────────────────────────────────────────────────── */}
      {isLoading && (
        <div className="flex items-center justify-center py-8 text-xs text-[#94a3b8]">
          <span className="animate-pulse">Yükleniyor…</span>
        </div>
      )}

      {/* ── Error ──────────────────────────────────────────────────────────── */}
      {isError && (
        <div className="bg-neg-light border border-neg-light rounded px-3 py-2 text-xs text-neg-text">
          Rapor yüklenemedi: {error instanceof Error ? error.message : 'Bilinmeyen hata'}
        </div>
      )}

      {/* ── Report ─────────────────────────────────────────────────────────── */}
      {report && (
        <>
          {/* Book-only mode banner */}
          {report.book_only_mode && (
            <div className="flex items-start gap-2 bg-info-light border border-info-light rounded px-3 py-2 text-xs text-info-text">
              <span className="shrink-0 text-base leading-none">ℹ</span>
              <span>
                Banka bakiyesi henüz girilmemiş — yalnızca defter bakiyesi gösteriliyor.
                Banka ekstrelerini sisteme girdikçe mutabakat otomatik güncellenir.
              </span>
            </div>
          )}

          {/* Overall status badge */}
          <div className={`flex items-center justify-between rounded px-3 py-2 border ${
            report.overall_severity === 'clean'
              ? 'bg-pos-light border-pos-light text-pos-text'
              : report.overall_severity === 'minor'
              ? 'bg-warn-light border-warn-light text-warn-text'
              : 'bg-neg-light border-neg-light text-neg-text'
          }`}>
            <div className="flex items-center gap-2">
              <span className="font-bold text-xs">
                {report.overall_severity === 'clean'
                  ? '✓ Tüm hesaplar mutabık'
                  : `⚠ ${report.unreconciled_count} hesap mutabık değil`}
              </span>
              <SeverityBadge severity={report.overall_severity} />
            </div>
            <span className="text-[10px] tabular-nums font-semibold">
              {fmtDate(report.as_of_date)} itibarıyla
            </span>
          </div>

          {/* KPI row */}
          <div className="flex gap-3 flex-wrap">
            <KpiCard
              label="Defter Bakiyesi"
              value={fmtTRY(report.total_book_balance_try)}
              sub="Tahsilat − Ödemeler"
            />
            <KpiCard
              label="Banka Bakiyesi"
              value={fmtTRY(report.total_bank_balance_try)}
              sub={report.book_only_mode ? 'Girilmemiş' : 'Banka ekstresinden'}
              color={report.book_only_mode ? 'text-[#94a3b8]' : 'text-[#0f172a]'}
            />
            <KpiCard
              label="Toplam Fark"
              value={fmtTRY(Math.abs(report.total_discrepancy_try))}
              sub={report.total_discrepancy_try >= 0 ? 'Defter fazlası' : 'Banka fazlası'}
              color={
                report.overall_severity === 'clean'   ? 'text-pos-text'  :
                report.overall_severity === 'minor'   ? 'text-warn-text' :
                'text-neg-text'
              }
            />
            <KpiCard
              label="Mutabakat Oranı"
              value={`%${report.overall_reconciliation_pct.toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}`}
              sub={report.overall_severity === 'clean' ? 'Tam mutabık' : 'Kısmi mutabakat'}
              color={report.overall_reconciliation_pct >= 99 ? 'text-pos-text' : report.overall_reconciliation_pct >= 95 ? 'text-warn-text' : 'text-neg-text'}
            />
          </div>

          {/* Reconciliation lines table */}
          <div className="border border-[#e8eaef] rounded overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-[#f8fafc] border-b border-[#e8eaef]">
                  <th className="text-left px-3 py-2 text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Hesap</th>
                  <th className="text-right px-3 py-2 text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Defter</th>
                  <th className="text-right px-3 py-2 text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Banka</th>
                  <th className="text-right px-3 py-2 text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Fark</th>
                  <th className="text-center px-3 py-2 text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Durum</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f1f5f9]">
                {report.lines.map((line, i) => (
                  <tr
                    key={i}
                    className={`hover:bg-[#f8fafc]/60 ${
                      line.account_name === 'TOPLAM'
                        ? 'bg-[#f8fafc] border-t-2 border-[#e8eaef] font-bold'
                        : ''
                    }`}
                  >
                    <td className="px-3 py-2 text-[#334155] font-medium">
                      {line.account_name}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-mono text-[#0f172a]">
                      {fmtTRY(line.book_balance_try)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-mono text-[#0f172a]">
                      {fmtTRY(line.bank_balance_try)}
                    </td>
                    <td className={`px-3 py-2 text-right tabular-nums font-mono ${
                      line.is_reconciled       ? 'text-pos-text' :
                      line.discrepancy_severity === 'material' ? 'text-neg-text' :
                      'text-warn-text'
                    }`}>
                      {line.discrepancy_try === 0
                        ? '—'
                        : (line.discrepancy_try > 0 ? '+' : '') + fmtTRY(line.discrepancy_try)
                      }
                    </td>
                    <td className="px-3 py-2 text-center">
                      {line.account_name !== 'TOPLAM' && (
                        <LineSeverityBadge line={line} />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Last reconciled + info note */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <p className="text-[10px] text-[#94a3b8]">
              Banka ekstreleri sisteme girildikçe mutabakat otomatik güncellenir.
            </p>
            {report.last_reconciled_at && (
              <span className="text-[10px] text-[#94a3b8] tabular-nums">
                Son mutabakat: {fmtDate(report.last_reconciled_at)}
              </span>
            )}
          </div>
        </>
      )}
    </div>
  )
}
