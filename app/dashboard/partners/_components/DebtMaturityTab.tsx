'use client'

// ─────────────────────────────────────────────────────────────────────────────
// DebtMaturityTab — Borç Vade Merdiveni
//
// Displays:
//   - 4 KPI cells: total outstanding, WAM, refinancing risk, debt service 90d
//   - Horizontal bar chart maturity ladder (inline div widths, no external lib)
//   - Maturity cliffs section (if any)
//   - Partner concentration table
// ─────────────────────────────────────────────────────────────────────────────

import { useQuery } from '@tanstack/react-query'
import {
  Panel, PanelHeader, KpiStrip, KpiCell, EmptySlate, Skeleton,
} from '@/components/ds'
import { fmtTRY, fmtPct } from '@/lib/format'
import type {
  DebtMaturityReport,
  MaturityBucket,
  MaturityCliff,
} from '@/lib/services/pcle/debt-maturity.service'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Props {
  companyId?: string
}

// ── Fetch ─────────────────────────────────────────────────────────────────────

async function fetchReport(): Promise<DebtMaturityReport> {
  const res = await fetch('/api/partners/debt-maturity')
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body?.error ?? `HTTP ${res.status}`)
  }
  const json = await res.json()
  return json.report as DebtMaturityReport
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function riskColor(
  risk: DebtMaturityReport['refinancing_risk'],
): string {
  switch (risk) {
    case 'critical': return 'text-neg-text'
    case 'high':     return 'text-orange-700'
    case 'moderate': return 'text-warn-text'
    case 'low':      return 'text-pos-text'
    case 'no_debt':  return 'text-[#64748b]'
    default:         return 'text-[#64748b]'
  }
}

function riskLabel(risk: DebtMaturityReport['refinancing_risk']): string {
  switch (risk) {
    case 'critical': return 'Kritik'
    case 'high':     return 'Yüksek'
    case 'moderate': return 'Orta'
    case 'low':      return 'Düşük'
    case 'no_debt':  return 'Borç Yok'
    default:         return '—'
  }
}

function bucketBarColor(key: MaturityBucket['bucket_key']): string {
  switch (key) {
    case 'overdue':       return 'bg-neg-text'
    case 'days_0_30':     return 'bg-orange-500'
    case 'days_31_90':    return 'bg-warn-text'
    case 'days_91_180':   return 'bg-yellow-400'
    case 'days_181_365':  return 'bg-info-text'
    case 'over_1_year':   return 'bg-pos-text'
    default:              return 'bg-[#94a3b8]'
  }
}

// ── Maturity Ladder Chart ─────────────────────────────────────────────────────

function MaturityLadderChart({
  buckets,
  totalOutstanding,
}: {
  buckets: MaturityBucket[]
  totalOutstanding: number
}) {
  const maxTotal = Math.max(...buckets.map(b => b.total_try), 1)

  return (
    <div className="space-y-2">
      {buckets.map(bucket => {
        const widthPct =
          totalOutstanding > 0
            ? Math.min(100, (bucket.total_try / maxTotal) * 100)
            : 0

        return (
          <div key={bucket.bucket_key} className="flex items-center gap-3 text-xs">
            {/* Label */}
            <div className="w-28 shrink-0 text-right text-[#64748b] font-medium">
              {bucket.label}
            </div>

            {/* Bar */}
            <div className="flex-1 h-5 bg-[#f1f5f9] rounded overflow-hidden">
              <div
                className={`h-full rounded transition-all ${bucketBarColor(bucket.bucket_key)}`}
                style={{ width: `${widthPct}%` }}
              />
            </div>

            {/* Amount */}
            <div className="w-32 shrink-0 text-right font-semibold text-[#1e293b]">
              {bucket.tranche_count > 0
                ? fmtTRY(bucket.total_try)
                : <span className="text-[#94a3b8]">—</span>}
            </div>

            {/* Count badge */}
            <div className="w-10 shrink-0 text-center text-[#94a3b8]">
              {bucket.tranche_count > 0 && (
                <span className="rounded-full bg-[#f1f5f9] px-1.5 py-0.5">
                  {bucket.tranche_count}
                </span>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Maturity Cliffs Section ───────────────────────────────────────────────────

function MaturityCliffsList({ cliffs }: { cliffs: MaturityCliff[] }) {
  if (cliffs.length === 0) return null

  return (
    <Panel>
      <PanelHeader
        label="Vade Uçurumları"
        sub="Toplam borcun %20'sinden fazlasının aynı gün ödendiği durumlar"
      />
      <div className="mt-3 space-y-2">
        {cliffs.map(cliff => (
          <div
            key={cliff.date}
            className="flex items-center justify-between rounded border border-warn-light bg-warn-light/30 px-4 py-3 text-sm"
          >
            <div>
              <span className="font-semibold text-warn-text">{cliff.date}</span>
              <span className="ml-2 text-[#64748b]">
                {cliff.partner_names.join(', ')}
              </span>
            </div>
            <div className="text-right">
              <div className="font-bold text-[#1e293b]">{fmtTRY(cliff.amount_try)}</div>
              <div className="text-[#64748b] text-xs">
                Toplam borcun {fmtPct(cliff.pct_of_total)}'i
              </div>
            </div>
          </div>
        ))}
      </div>
    </Panel>
  )
}

// ── Concentration Table ───────────────────────────────────────────────────────

function ConcentrationTable({
  rows,
}: {
  rows: DebtMaturityReport['concentration_by_partner']
}) {
  if (rows.length === 0) return null

  return (
    <Panel>
      <PanelHeader
        label="Ortak Bazında Konsantrasyon"
        sub="Her ortağın toplam borç içindeki payı"
      />
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-[#e2e8f0] text-[#64748b]">
              <th className="pb-2 text-left font-medium">Ortak</th>
              <th className="pb-2 text-right font-medium">Kalan Borç</th>
              <th className="pb-2 text-right font-medium">Pay</th>
              <th className="pb-2 w-32 pl-4 font-medium">Dağılım</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr
                key={row.partner_id}
                className="border-b border-[#f1f5f9] last:border-0"
              >
                <td className="py-2 font-medium text-[#1e293b]">{row.partner_name}</td>
                <td className="py-2 text-right text-[#1e293b]">{fmtTRY(row.outstanding_try)}</td>
                <td className="py-2 text-right text-[#64748b]">
                  {fmtPct(row.pct_of_total)}
                </td>
                <td className="py-2 pl-4">
                  <div className="h-2 w-full rounded bg-[#f1f5f9] overflow-hidden">
                    <div
                      className="h-full rounded bg-info-text"
                      style={{ width: `${Math.min(100, row.pct_of_total)}%` }}
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export function DebtMaturityTab({ companyId }: Props) {
  const { data: report, isLoading, error } = useQuery<DebtMaturityReport, Error>({
    queryKey:  ['debt-maturity', companyId ?? ''],
    queryFn:   fetchReport,
    staleTime: 1000 * 60 * 30,
  })

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded border border-neg-text/20 bg-neg-light px-4 py-3 text-xs font-medium text-neg-text">
        {error.message}
      </div>
    )
  }

  if (!report || report.total_outstanding_try === 0) {
    return (
      <EmptySlate
        title="Aktif Borç Tranşı Bulunamadı"
        sub="Ortak kredi borçları için henüz aktif tranş kaydı girilmemiş."
      />
    )
  }

  const wamLabel =
    report.weighted_avg_maturity_months !== null
      ? `${report.weighted_avg_maturity_months.toFixed(1)} ay`
      : '—'

  return (
    <div className="space-y-5">
      {/* ── KPI Strip ──────────────────────────────────────────────────────── */}
      <Panel>
        <PanelHeader
          label="Borç Vade Merdiveni"
          sub="Aktif partner kredi tranşlarının zaman bazlı dağılımı"
        />
        <KpiStrip cols={4}>
          <KpiCell
            label="Toplam Kalan Borç"
            value={fmtTRY(report.total_outstanding_try)}
          />
          <KpiCell
            label="Ağırlıklı Ort. Vade"
            value={wamLabel}
          />
          <KpiCell
            label="Refinansman Riski"
            value={
              <span className={riskColor(report.refinancing_risk)}>
                {riskLabel(report.refinancing_risk)}
              </span>
            }
          />
          <KpiCell
            label="90 Günlük Borç Servisi"
            value={fmtTRY(report.debt_service_90d)}
          />
        </KpiStrip>
      </Panel>

      {/* ── Maturity Ladder ─────────────────────────────────────────────────── */}
      <Panel>
        <PanelHeader
          label="Vade Dağılımı"
          sub="Anapara + tahmini faiz dahil toplam yükümlülük"
        />
        <div className="mt-4">
          <MaturityLadderChart
            buckets={report.maturity_ladder}
            totalOutstanding={report.total_outstanding_try}
          />
        </div>

        {/* Debt service sub-row */}
        <div className="mt-5 flex gap-6 border-t border-[#f1f5f9] pt-4 text-xs text-[#64748b]">
          <span>
            30g servis:{' '}
            <strong className="text-[#1e293b]">{fmtTRY(report.debt_service_30d)}</strong>
          </span>
          <span>
            90g servis:{' '}
            <strong className="text-[#1e293b]">{fmtTRY(report.debt_service_90d)}</strong>
          </span>
          <span>
            180g servis:{' '}
            <strong className="text-[#1e293b]">{fmtTRY(report.debt_service_180d)}</strong>
          </span>
          <span>
            Tahmini faiz:{' '}
            <strong className="text-[#1e293b]">
              {fmtTRY(report.total_interest_projected_try)}
            </strong>
          </span>
        </div>
      </Panel>

      {/* ── Maturity Cliffs ──────────────────────────────────────────────────── */}
      <MaturityCliffsList cliffs={report.maturity_cliffs} />

      {/* ── Partner Concentration ────────────────────────────────────────────── */}
      <ConcentrationTable rows={report.concentration_by_partner} />
    </div>
  )
}
