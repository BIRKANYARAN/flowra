'use client'

// ─────────────────────────────────────────────────────────────────────────────
// RevenueRecognitionClient
//
// Revenue recognition dashboard — accrual vs cash basis.
//
// Features:
//   - Method toggle: accrual_basis / cash_basis
//   - KPI strip: accrual, cash, recognition rate, deferred balance
//   - Recognition gap visualization (AR banner)
//   - Monthly recognition trend chart (CSS bar chart)
//   - Collection lag display
//   - Turkish narrative footer
// ─────────────────────────────────────────────────────────────────────────────

import { useState }  from 'react'
import { useQuery }  from '@tanstack/react-query'
import {
  KpiStrip,
  KpiCell,
  Panel,
  PanelHeader,
  NarrativeFooter,
  SkeletonPanel,
  EmptySlate,
  AlertRow,
} from '@/components/ds'
import { fmtTRY, fmtMonthShort } from '@/lib/format'
import type {
  RevenueRecognitionReport,
  RecognitionMethod,
} from '@/lib/services/finance/revenue-recognition.service'

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtPct(val: number | null, decimals = 1): string {
  if (val === null) return '—'
  return `%${val.toFixed(decimals)}`
}

function qualityLabel(
  q: RevenueRecognitionReport['recognition_quality'],
): { label: string; cls: string } {
  const map: Record<typeof q, { label: string; cls: string }> = {
    high_quality:       { label: 'Mükemmel',        cls: 'bg-green-100 text-green-800 border-green-200' },
    good_quality:       { label: 'İyi',              cls: 'bg-teal-100 text-teal-800 border-teal-200' },
    mixed:              { label: 'Karma',             cls: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
    poor_quality:       { label: 'Zayıf',            cls: 'bg-orange-100 text-orange-800 border-orange-200' },
    uncollectable_risk: { label: 'Kritik Risk',      cls: 'bg-red-100 text-red-800 border-red-200' },
  }
  return map[q]
}

function barColorForGap(gap: number): string {
  if (gap <= 0) return 'bg-green-500'
  return 'bg-blue-400'
}

// ── Sub-components ────────────────────────────────────────────────────────────

function QualityBadge({ quality }: { quality: RevenueRecognitionReport['recognition_quality'] }) {
  const { label, cls } = qualityLabel(quality)
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] font-bold ${cls}`}>
      {label}
    </span>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

interface Props {
  companyId: string
}

export function RevenueRecognitionClient({ companyId }: Props) {
  const [method, setMethod] = useState<RecognitionMethod>('accrual_basis')

  const { data, isLoading, isError } = useQuery<{ report: RevenueRecognitionReport }>({
    queryKey: ['revenue-recognition', companyId, method],
    queryFn:  async () => {
      const res = await fetch(`/api/finance/revenue-recognition?method=${method}`)
      if (!res.ok) throw new Error('Gelir tanıma verisi yüklenemedi')
      return res.json()
    },
    staleTime: 5 * 60 * 1000,
  })

  // ── Loading ────────────────────────────────────────────────────────────────
  if (isLoading) return <SkeletonPanel />

  // ── Error ──────────────────────────────────────────────────────────────────
  if (isError || !data?.report) {
    return (
      <EmptySlate
        icon="⚠"
        title="Veri yüklenemedi"
        sub="Gelir tanıma raporu alınırken hata oluştu."
      />
    )
  }

  const report = data.report
  const monthly = report.monthly_recognition

  // Max accrual for bar chart scaling
  const maxAccrual = Math.max(...monthly.map(m => m.earned_revenue_accrual), 1)

  return (
    <div className="space-y-4">

      {/* ── Header + method toggle ─────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8]">
            Gelir Tanıma — {report.period_label}
          </h3>
        </div>
        <div className="flex items-center gap-2">
          <QualityBadge quality={report.recognition_quality} />
          <div className="flex border border-[#e8eaef] rounded overflow-hidden">
            {(['accrual_basis', 'cash_basis'] as RecognitionMethod[]).map(m => (
              <button
                key={m}
                onClick={() => setMethod(m)}
                className={`px-3 py-1 text-[11px] font-bold transition-colors ${
                  method === m
                    ? 'bg-[#0f172a] text-white'
                    : 'bg-white text-[#64748b] hover:bg-[#f8fafc]'
                }`}
              >
                {m === 'accrual_basis' ? 'Tahakkuk' : 'Nakit Esası'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── KPI strip ─────────────────────────────────────────────────────── */}
      <KpiStrip>
        <KpiCell
          label="Tahakkuk Geliri"
          value={fmtTRY(report.total_accrual_revenue, 0)}
          sub="Fatura edilen toplam"
        />
        <KpiCell
          label="Nakit Geliri"
          value={fmtTRY(report.total_cash_revenue, 0)}
          sub="Tahsil edilen toplam"
        />
        <KpiCell
          label="Tanıma Oranı"
          value={fmtPct(report.recognition_rate_pct)}
          sub="Nakit / tahakkuk"
        />
        <KpiCell
          label="Ertelenmiş Gelir"
          value={fmtTRY(report.deferred_revenue_balance, 0)}
          sub="Ön ödemeler"
        />
        {report.avg_collection_lag_days !== null && (
          <KpiCell
            label="Ort. Tahsilat Süresi"
            value={`${report.avg_collection_lag_days.toFixed(0)} gün`}
            sub="Satıştan ödemeye"
          />
        )}
      </KpiStrip>

      {/* ── Recognition gap alert ──────────────────────────────────────────── */}
      {report.recognition_gap > 0 && (
        <AlertRow
          severity="info"
          title={`Tahakkuk-nakit farkı: ${fmtTRY(report.recognition_gap, 0)}`}
          detail="Tahsil edilmeyen alacaklar mevcut"
          actionLabel="Detay"
          actionHref="/dashboard/commercial?tab=customers"
        />
      )}

      {/* ── Monthly recognition trend chart ──────────────────────────────── */}
      <Panel>
        <PanelHeader
          label="Aylık Gelir Tanıma"
          sub="6 aylık tahakkuk ve nakit karşılaştırması"
        />
        <div className="space-y-2.5">
          {monthly.map(m => {
            const accrualPct = (m.earned_revenue_accrual / maxAccrual) * 100
            const cashPct    = (m.earned_revenue_cash    / maxAccrual) * 100
            const gapPct     = Math.abs(m.recognition_gap)

            return (
              <div key={m.year_month} className="space-y-1">
                {/* Month label + gap */}
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-[#475569] w-12 shrink-0">
                    {fmtMonthShort(m.year_month)}
                  </span>
                  <span className={`text-[10px] tabular-nums font-semibold ${
                    m.recognition_gap > 0 ? 'text-info-text' : 'text-green-600'
                  }`}>
                    {m.recognition_gap !== 0
                      ? `${m.recognition_gap > 0 ? '+' : ''}${fmtTRY(m.recognition_gap, 0)} fark`
                      : 'Tam eşleşme'}
                  </span>
                </div>

                {/* Accrual bar */}
                <div className="flex items-center gap-2">
                  <span className="text-[9px] text-[#94a3b8] w-12 shrink-0">Tahakkuk</span>
                  <div className="flex-1 h-2.5 bg-[#f1f5f9] rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-blue-400 transition-all duration-300"
                      style={{ width: `${accrualPct}%` }}
                    />
                  </div>
                  <span className="text-[10px] tabular-nums w-20 text-right shrink-0 text-[#475569]">
                    {fmtTRY(m.earned_revenue_accrual, 0)}
                  </span>
                </div>

                {/* Cash bar */}
                <div className="flex items-center gap-2">
                  <span className="text-[9px] text-[#94a3b8] w-12 shrink-0">Nakit</span>
                  <div className="flex-1 h-2.5 bg-[#f1f5f9] rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${barColorForGap(m.recognition_gap)}`}
                      style={{ width: `${cashPct}%` }}
                    />
                  </div>
                  <span className="text-[10px] tabular-nums w-20 text-right shrink-0 text-[#475569]">
                    {fmtTRY(m.earned_revenue_cash, 0)}
                  </span>
                </div>

                {/* Cumulative AR */}
                {m.cumulative_receivables > 0 && (
                  <div className="flex items-center gap-2 pl-14">
                    <span className="text-[9px] text-[#94a3b8] italic">
                      Kümülatif alacak: {fmtTRY(m.cumulative_receivables, 0)}
                    </span>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </Panel>

      {/* ── Delta summary ──────────────────────────────────────────────────── */}
      <Panel>
        <PanelHeader
          label="Tahakkuk-Nakit Delta"
          sub="6 aylık kümülatif fark analizi"
        />
        <div className="grid grid-cols-3 gap-4">
          <div>
            <div className="text-[9px] font-bold uppercase tracking-wider text-[#94a3b8] mb-1">
              Toplam Fark
            </div>
            <div className="text-lg font-black tabular-nums text-[#0f172a]">
              {fmtTRY(report.accrual_cash_delta.absolute_delta, 0)}
            </div>
          </div>
          <div>
            <div className="text-[9px] font-bold uppercase tracking-wider text-[#94a3b8] mb-1">
              Aylık Ort. Fark
            </div>
            <div className="text-lg font-black tabular-nums text-[#0f172a]">
              {fmtTRY(report.accrual_cash_delta.avg_monthly_delta, 0)}
            </div>
          </div>
          <div>
            <div className="text-[9px] font-bold uppercase tracking-wider text-[#94a3b8] mb-1">
              Fark Oranı
            </div>
            <div className="text-lg font-black tabular-nums text-[#0f172a]">
              {report.accrual_cash_delta.delta_ratio_pct !== null
                ? `%${report.accrual_cash_delta.delta_ratio_pct.toFixed(1)}`
                : '—'}
            </div>
          </div>
        </div>
      </Panel>

      {/* ── Narrative footer ───────────────────────────────────────────────── */}
      <NarrativeFooter narrative={report.narrative} links={[]} />
    </div>
  )
}
