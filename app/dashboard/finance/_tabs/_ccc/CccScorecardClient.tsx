'use client'

// ─────────────────────────────────────────────────────────────────────────────
// CccScorecardClient
//
// Cash Conversion Cycle Efficiency Scorecard
//
// Features:
//   - Efficiency grade hero: large letter (A-F) + score
//   - 3-component breakdown bars: DSO (blue), DPO (green), DIO (purple)
//   - Worst component callout with action
//   - Benchmark delta: better/worse than CCC benchmark
//   - 6-month trend table
//   - Improvement potential with link to WC optimizer
//   - Empty state if no working capital data
// ─────────────────────────────────────────────────────────────────────────────

import Link       from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { fmtTRY } from '@/lib/format'
import type {
  CccScorecardReport,
  CccScorecardPeriod,
} from '@/lib/services/finance/ccc-scorecard.service'

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  companyId: string
}

// ── Grade config ──────────────────────────────────────────────────────────────

function gradeConfig(grade: CccScorecardReport['efficiency_grade']) {
  const cfg = {
    A: { bg: 'bg-green-50',  border: 'border-green-200',  text: 'text-green-700',  label: 'Mükemmel' },
    B: { bg: 'bg-blue-50',   border: 'border-blue-200',   text: 'text-blue-700',   label: 'İyi' },
    C: { bg: 'bg-yellow-50', border: 'border-yellow-200', text: 'text-yellow-700', label: 'Orta' },
    D: { bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-700', label: 'Zayıf' },
    F: { bg: 'bg-red-50',    border: 'border-red-200',    text: 'text-red-700',    label: 'Kritik' },
  }
  return cfg[grade]
}

// ── Trend config ──────────────────────────────────────────────────────────────

function trendLabel(trend: CccScorecardReport['trend']) {
  const cfg = {
    improving:         { label: 'Gelişiyor',    cls: 'text-green-600' },
    stable:            { label: 'Stabil',        cls: 'text-blue-600' },
    deteriorating:     { label: 'Kötüleşiyor',  cls: 'text-red-600' },
    insufficient_data: { label: 'Yetersiz Veri', cls: 'text-gray-400' },
  }
  return cfg[trend]
}

// ── Grade row for trend table ─────────────────────────────────────────────────

function inlineGrade(score: number): string {
  if (score >= 80) return 'A'
  if (score >= 65) return 'B'
  if (score >= 50) return 'C'
  if (score >= 35) return 'D'
  return 'F'
}

// ── Score bar ─────────────────────────────────────────────────────────────────

function ScoreBar({
  label,
  score,
  currentDays,
  benchmarkDays,
  colorClass,
}: {
  label: string
  score: number
  currentDays: number | null
  benchmarkDays: number
  colorClass: string
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="font-bold text-[#334155]">{label}</span>
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-[#94a3b8]">
            Kıyaslama: {benchmarkDays}g
          </span>
          {currentDays !== null && (
            <span className={`font-black tabular-nums ${
              currentDays > benchmarkDays ? 'text-orange-600' : 'text-green-600'
            }`}>
              {currentDays.toFixed(0)}g
            </span>
          )}
          {currentDays === null && (
            <span className="text-[#94a3b8]">—</span>
          )}
        </div>
      </div>
      {/* Score bar */}
      <div className="relative h-2 bg-[#f1f5f9] rounded-full overflow-hidden">
        <div
          className={`absolute left-0 top-0 h-full rounded-full transition-all ${colorClass}`}
          style={{ width: `${Math.max(2, score)}%` }}
        />
      </div>
      <div className="flex items-center justify-between text-[10px] text-[#94a3b8]">
        <span>0</span>
        <span className="font-bold text-[#64748b]">Skor: {score}</span>
        <span>100</span>
      </div>
    </div>
  )
}

// ── Worst component action message ────────────────────────────────────────────

function worstComponentAction(component: 'dso' | 'dpo' | 'dio'): string {
  const actions = {
    dso: 'Tahsilat sürecinizi hızlandırın ve vadesi geçmiş alacakları takip edin',
    dpo: 'Tedarikçilerle ödeme vadesi uzatma müzakeresi yapın',
    dio: 'Stok devir hızını artırın ve fazla stoğu azaltın',
  }
  return actions[component]
}

function worstComponentLabel(component: 'dso' | 'dpo' | 'dio'): string {
  const labels = {
    dso: 'DSO (Alacak Tahsilat Süresi)',
    dpo: 'DPO (Borç Ödeme Süresi)',
    dio: 'DIO (Stok Tutma Süresi)',
  }
  return labels[component]
}

// ── Trend table row ───────────────────────────────────────────────────────────

function TrendRow({ period, isCurrent }: { period: CccScorecardPeriod; isCurrent: boolean }) {
  const grade = inlineGrade(period.efficiency_score)
  return (
    <tr className={isCurrent ? 'bg-blue-50' : 'hover:bg-[#f8fafc]'}>
      <td className="px-3 py-2 text-xs font-medium text-[#334155] whitespace-nowrap">
        {period.period_label}
        {isCurrent && (
          <span className="ml-1.5 text-[9px] font-black uppercase tracking-wide text-blue-600">
            Güncel
          </span>
        )}
      </td>
      <td className="px-3 py-2 text-xs tabular-nums text-center font-bold text-[#0f172a]">
        {period.ccc_days !== null ? `${period.ccc_days.toFixed(0)}g` : '—'}
      </td>
      <td className="px-3 py-2 text-xs tabular-nums text-center font-bold text-[#0f172a]">
        {period.efficiency_score}
      </td>
      <td className="px-3 py-2 text-center">
        <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-black ${
          grade === 'A' ? 'bg-green-100 text-green-700' :
          grade === 'B' ? 'bg-blue-100 text-blue-700' :
          grade === 'C' ? 'bg-yellow-100 text-yellow-700' :
          grade === 'D' ? 'bg-orange-100 text-orange-700' :
                          'bg-red-100 text-red-700'
        }`}>
          {grade}
        </span>
      </td>
      <td className="px-3 py-2 text-xs tabular-nums text-center">
        {period.benchmark_delta !== null ? (
          <span className={period.benchmark_delta > 0 ? 'text-orange-600 font-bold' : 'text-green-600 font-bold'}>
            {period.benchmark_delta > 0 ? `+${period.benchmark_delta.toFixed(0)}g` : `${period.benchmark_delta.toFixed(0)}g`}
          </span>
        ) : '—'}
      </td>
    </tr>
  )
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft px-6 py-10 text-center">
      <div className="w-10 h-10 rounded-full bg-[#f1f5f9] flex items-center justify-center mx-auto mb-3">
        <svg className="w-5 h-5 text-[#94a3b8]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      </div>
      <div className="text-sm font-bold text-[#0f172a] mb-1">Veri Yetersiz</div>
      <div className="text-xs text-[#64748b]">
        CCC skorkartı için işletme sermayesi verisi bulunamadı.
        Satış ve gider kayıtları ekledikçe skor hesaplanacaktır.
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export function CccScorecardClient({ companyId }: Props) {
  const { data, isLoading, isError } = useQuery<{ report: CccScorecardReport }>({
    queryKey: ['ccc-scorecard', companyId],
    queryFn: async () => {
      const res = await fetch('/api/finance/ccc-scorecard')
      if (!res.ok) throw new Error(await res.text())
      return res.json()
    },
    staleTime: 60 * 60 * 1000, // 1 hour
  })

  if (isLoading) {
    return (
      <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft px-6 py-10 text-center">
        <div className="text-sm text-[#94a3b8] font-medium">CCC Skorkartı yükleniyor...</div>
      </div>
    )
  }

  if (isError || !data) {
    return (
      <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft px-6 py-6 text-center">
        <div className="text-sm text-[#ef4444] font-medium">CCC Skorkartı yüklenemedi.</div>
      </div>
    )
  }

  const { report } = data
  const { current_period: cp } = report

  // Check if there's meaningful data
  const hasData = cp.dso_days !== null || cp.dpo_days !== null || cp.dio_days !== null

  if (!hasData) {
    return <EmptyState />
  }

  const gc          = gradeConfig(report.efficiency_grade)
  const trendCfg    = trendLabel(report.trend)
  const currentIdx  = 0

  // Estimate improvement potential in TRY: rough proxy — not available without revenue
  // We show days only here; full ₺ estimate lives in WC optimizer
  const hasPotential = report.improvement_potential_days > 0

  return (
    <div className="space-y-4">
      {/* Section header */}
      <div className="flex items-center justify-between px-1">
        <span className="text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8]">
          Nakit Dönüşüm Verimliliği Skorkartı
        </span>
        <span className={`text-[10px] font-bold ${trendCfg.cls}`}>
          Trend: {trendCfg.label}
        </span>
      </div>

      {/* Hero: Grade + Score */}
      <div className={`rounded-xl border-2 ${gc.bg} ${gc.border} px-6 py-5`}>
        <div className="flex items-center gap-6">
          {/* Grade letter */}
          <div className={`text-7xl font-black leading-none tabular-nums ${gc.text} flex-shrink-0`}>
            {report.efficiency_grade}
          </div>
          {/* Score + label */}
          <div className="flex-1">
            <div className="text-[10px] font-black uppercase tracking-widest text-[#94a3b8] mb-1">
              Nakit Dönüşüm Verimliliği
            </div>
            <div className="text-3xl font-black tabular-nums text-[#0f172a]">
              {report.overall_efficiency_score}
              <span className="text-base font-semibold text-[#94a3b8] ml-1">/ 100</span>
            </div>
            <div className={`text-sm font-bold mt-1 ${gc.text}`}>
              {gc.label}
            </div>
            {/* CCC days */}
            {cp.ccc_days !== null && (
              <div className="text-[11px] text-[#64748b] mt-1.5">
                Mevcut CCC:{' '}
                <span className="font-black text-[#0f172a]">{cp.ccc_days.toFixed(0)} gün</span>
                {' '}·{' '}
                Kıyaslama:{' '}
                <span className="font-bold">{report.benchmark_ccc} gün</span>
              </div>
            )}
          </div>
          {/* Benchmark delta badge */}
          {cp.benchmark_delta !== null && (
            <div className={`flex-shrink-0 text-center px-4 py-3 rounded-lg border ${
              cp.benchmark_delta <= 0
                ? 'bg-green-50 border-green-200'
                : 'bg-orange-50 border-orange-200'
            }`}>
              <div className="text-[9px] font-black uppercase tracking-wide text-[#94a3b8] mb-0.5">
                Kıyaslama vs
              </div>
              <div className={`text-xl font-black tabular-nums ${
                cp.benchmark_delta <= 0 ? 'text-green-700' : 'text-orange-700'
              }`}>
                {cp.benchmark_delta > 0
                  ? `+${cp.benchmark_delta.toFixed(0)}g`
                  : `${cp.benchmark_delta.toFixed(0)}g`
                }
              </div>
              <div className={`text-[9px] font-semibold ${
                cp.benchmark_delta <= 0 ? 'text-green-600' : 'text-orange-600'
              }`}>
                {cp.benchmark_delta <= 0 ? 'tasarruf' : 'fazla'}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 3-Component breakdown */}
      <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft px-5 py-4 space-y-5">
        <div className="text-[10px] font-black uppercase tracking-widest text-[#94a3b8] mb-3">
          Bileşen Skorları
        </div>

        <ScoreBar
          label="DSO — Alacak Tahsilat Süresi"
          score={cp.dso_score}
          currentDays={cp.dso_days}
          benchmarkDays={report.benchmark_dso}
          colorClass="bg-blue-500"
        />

        <ScoreBar
          label="DPO — Borç Ödeme Süresi"
          score={cp.dpo_score}
          currentDays={cp.dpo_days}
          benchmarkDays={report.benchmark_dpo}
          colorClass="bg-green-500"
        />

        <ScoreBar
          label="DIO — Stok Tutma Süresi"
          score={cp.dio_score}
          currentDays={cp.dio_days}
          benchmarkDays={report.benchmark_dio}
          colorClass="bg-purple-500"
        />

        {/* Weight legend */}
        <div className="pt-2 border-t border-[#f1f5f9] flex items-center gap-4 text-[10px] text-[#94a3b8]">
          <span className="font-bold">Ağırlıklar:</span>
          <span>DSO × 40%</span>
          <span>DPO × 30%</span>
          <span>DIO × 30%</span>
        </div>
      </div>

      {/* Worst component callout */}
      {report.worst_component && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 flex items-start gap-3">
          <div className="flex-shrink-0 w-5 h-5 mt-0.5">
            <svg className="w-5 h-5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[11px] font-black uppercase tracking-wide text-amber-800 mb-0.5">
              En Düşük Skor
            </div>
            <div className="text-xs font-bold text-amber-900">
              {worstComponentLabel(report.worst_component)}
            </div>
            <div className="text-xs text-amber-700 mt-0.5 leading-relaxed">
              {worstComponentAction(report.worst_component)}
            </div>
          </div>
        </div>
      )}

      {/* 6-month trend table */}
      {report.periods.length > 0 && (
        <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft overflow-hidden">
          <div className="px-4 py-3 border-b border-[#e8eaef] bg-[#f8fafc]">
            <span className="text-[0.65rem] font-black uppercase tracking-widest text-[#64748b]">
              6 Aylık Trend
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[#f1f5f9]">
                  <th className="px-3 py-2 text-left text-[10px] font-black uppercase tracking-wide text-[#94a3b8]">Ay</th>
                  <th className="px-3 py-2 text-center text-[10px] font-black uppercase tracking-wide text-[#94a3b8]">CCC</th>
                  <th className="px-3 py-2 text-center text-[10px] font-black uppercase tracking-wide text-[#94a3b8]">Verimlilik</th>
                  <th className="px-3 py-2 text-center text-[10px] font-black uppercase tracking-wide text-[#94a3b8]">Not</th>
                  <th className="px-3 py-2 text-center text-[10px] font-black uppercase tracking-wide text-[#94a3b8]">vs Kıyaslama</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f1f5f9]">
                {report.periods.map((period, i) => (
                  <TrendRow
                    key={period.period_key}
                    period={period}
                    isCurrent={i === currentIdx}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Improvement potential */}
      {hasPotential && (
        <div className="bg-[#f0fdf4] border border-[#bbf7d0] rounded-lg px-4 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1">
              <div className="text-[10px] font-black uppercase tracking-wide text-[#16a34a] mb-1">
                İyileştirme Potansiyeli
              </div>
              <div className="text-sm text-[#15803d] leading-relaxed">
                CCC,{' '}
                <span className="font-black">
                  {report.improvement_potential_days} gün
                </span>{' '}
                kısaltılabilir (kıyaslama: {report.benchmark_ccc}g).
                Nakit optimizasyonu için İşletme Sermayesi Optimize Aracı&apos;nı inceleyin.
              </div>
            </div>
            <Link
              href="#wc-optimizer"
              className="flex-shrink-0 text-[11px] font-bold text-[#16a34a] hover:text-[#15803d] underline underline-offset-2 whitespace-nowrap mt-0.5"
            >
              WC Optimizer →
            </Link>
          </div>
        </div>
      )}

      {/* Already at benchmark */}
      {!hasPotential && cp.ccc_days !== null && (
        <div className="bg-[#f0fdf4] border border-[#bbf7d0] rounded-lg px-4 py-3 flex items-center gap-3">
          <svg className="w-4 h-4 text-[#16a34a] flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          <div className="text-xs text-[#15803d] font-medium">
            Tebrikler! CCC kıyaslama değerinin ({report.benchmark_ccc} gün) altında veya eşitinde.
          </div>
        </div>
      )}

      {/* Benchmark reference footer */}
      <div className="px-1 text-[10px] text-[#94a3b8]">
        Kıyaslama referansları Türk KOBİ sektörü normlarına göre belirlenmiştir:
        DSO {report.benchmark_dso}g · DPO {report.benchmark_dpo}g · DIO {report.benchmark_dio}g · CCC {report.benchmark_ccc}g
      </div>
    </div>
  )
}
