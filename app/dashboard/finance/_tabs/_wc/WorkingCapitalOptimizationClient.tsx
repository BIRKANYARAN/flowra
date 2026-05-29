'use client'

// ─────────────────────────────────────────────────────────────────────────────
// WorkingCapitalOptimizationClient
//
// Working capital gap analysis: receivables, inventory, payables vs benchmarks.
//
// Features:
//   - CCC days + efficiency badge + Net Working Capital
//   - Total cash release potential (large, prominent hero number)
//   - 3 gap cards: actual vs benchmark, priority badge, cash release, recommendation
//   - Top action highlighted section
//   - Empty state when no data
//   - Skeleton loading
// ─────────────────────────────────────────────────────────────────────────────

import { useQuery } from '@tanstack/react-query'
import { fmtTRY }   from '@/lib/format'
import type {
  WorkingCapitalOptimizationReport,
  WorkingCapitalGap,
} from '@/lib/services/finance/working-capital-optimization.service'

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  companyId: string
}

// ── Efficiency badge ──────────────────────────────────────────────────────────

type EfficiencyLevel = 'excellent' | 'good' | 'adequate' | 'poor' | 'critical'

function EfficiencyBadge({ level }: { level: EfficiencyLevel }) {
  const cfg: Record<EfficiencyLevel, { label: string; cls: string }> = {
    excellent: { label: 'Mükemmel',   cls: 'bg-green-100 text-green-800 border-green-200' },
    good:      { label: 'İyi',        cls: 'bg-teal-100 text-teal-800 border-teal-200' },
    adequate:  { label: 'Yeterli',    cls: 'bg-blue-100 text-blue-800 border-blue-200' },
    poor:      { label: 'Zayıf',      cls: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
    critical:  { label: 'Kritik',     cls: 'bg-red-100 text-red-800 border-red-200' },
  }
  const c = cfg[level]
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] font-bold ${c.cls}`}>
      {c.label}
    </span>
  )
}

// ── Priority badge ─────────────────────────────────────────────────────────────

type GapPriority = 'high' | 'medium' | 'low' | 'none'

function PriorityBadge({ priority }: { priority: GapPriority }) {
  const cfg: Record<GapPriority, { label: string; cls: string }> = {
    high:   { label: 'Yüksek Öncelik', cls: 'bg-red-100 text-red-800 border-red-200' },
    medium: { label: 'Orta Öncelik',   cls: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
    low:    { label: 'Düşük Öncelik',  cls: 'bg-green-100 text-green-800 border-green-200' },
    none:   { label: 'Hedefte',        cls: 'bg-slate-100 text-slate-600 border-slate-200' },
  }
  const c = cfg[priority]
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-bold ${c.cls}`}>
      {c.label}
    </span>
  )
}

// ── Gap progress bar ──────────────────────────────────────────────────────────

function GapBar({ actualDays, benchmarkDays, priority }: {
  actualDays: number
  benchmarkDays: number
  priority: GapPriority
}) {
  const max = Math.max(actualDays, benchmarkDays) * 1.1
  const actualPct    = Math.min(100, (actualDays / max) * 100)
  const benchmarkPct = Math.min(100, (benchmarkDays / max) * 100)

  const barColor: Record<GapPriority, string> = {
    high:   'bg-red-400',
    medium: 'bg-yellow-400',
    low:    'bg-green-400',
    none:   'bg-teal-400',
  }

  return (
    <div className="relative w-full mt-2">
      {/* Actual bar */}
      <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${barColor[priority]}`}
          style={{ width: `${actualPct}%` }}
        />
      </div>
      {/* Benchmark marker */}
      <div
        className="absolute top-0 h-2 w-0.5 bg-slate-500"
        style={{ left: `${benchmarkPct}%` }}
        title={`Hedef: ${benchmarkDays} gün`}
      />
    </div>
  )
}

// ── Gap card ───────────────────────────────────────────────────────────────────

function GapCard({ gap, isTopAction }: { gap: WorkingCapitalGap; isTopAction: boolean }) {
  const borderColor = isTopAction
    ? 'border-orange-300 bg-orange-50'
    : 'border-slate-200 bg-white'

  return (
    <div className={`rounded-lg border p-4 space-y-3 ${borderColor}`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-[11px] text-slate-500 font-medium uppercase tracking-wide">
            {gap.label}
          </div>
          {isTopAction && (
            <div className="text-[10px] text-orange-600 font-bold mt-0.5">
              ★ Öncelikli Aksiyon
            </div>
          )}
        </div>
        <PriorityBadge priority={gap.priority} />
      </div>

      {/* Actual vs Benchmark */}
      <div className="flex items-center gap-3 text-sm">
        <div className="text-center">
          <div className="text-lg font-black text-slate-800">{Math.round(gap.actual_days)}</div>
          <div className="text-[10px] text-slate-400">Mevcut (gün)</div>
        </div>
        <div className="text-slate-300 text-xl">→</div>
        <div className="text-center">
          <div className="text-lg font-black text-teal-700">{gap.benchmark_days}</div>
          <div className="text-[10px] text-slate-400">Hedef (gün)</div>
        </div>
        {gap.gap_days > 0 && (
          <>
            <div className="text-slate-300 text-xl">=</div>
            <div className="text-center">
              <div className="text-lg font-black text-red-600">+{gap.gap_days}</div>
              <div className="text-[10px] text-slate-400">Açık (gün)</div>
            </div>
          </>
        )}
      </div>

      {/* Progress bar */}
      <GapBar
        actualDays={gap.actual_days}
        benchmarkDays={gap.benchmark_days}
        priority={gap.priority}
      />

      {/* Cash impact */}
      {gap.cash_impact_try > 0 && (
        <div className="flex items-center justify-between text-sm bg-slate-50 rounded-md px-3 py-2">
          <span className="text-slate-500 text-[11px]">Potansiyel Nakit Açığa Çıkarma</span>
          <span className="font-bold text-slate-800">{fmtTRY(gap.cash_impact_try)}</span>
        </div>
      )}

      {/* Recommendation */}
      <p className="text-[12px] text-slate-600 leading-relaxed border-t border-slate-100 pt-2">
        {gap.recommendation}
      </p>
    </div>
  )
}

// ── Skeleton ───────────────────────────────────────────────────────────────────

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse bg-slate-200 rounded ${className ?? ''}`} />
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      {/* KPI row */}
      <div className="grid grid-cols-3 gap-4">
        {[0, 1, 2].map(i => (
          <div key={i} className="border border-slate-200 rounded-lg p-4 space-y-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-8 w-20" />
          </div>
        ))}
      </div>
      {/* Hero */}
      <div className="border border-slate-200 rounded-lg p-6 space-y-2">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-12 w-40" />
      </div>
      {/* Gap cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[0, 1, 2].map(i => (
          <div key={i} className="border border-slate-200 rounded-lg p-4 space-y-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-8 w-24" />
            <Skeleton className="h-2 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Empty state ────────────────────────────────────────────────────────────────

function EmptySlate() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="text-4xl mb-3">📊</div>
      <div className="text-slate-700 font-semibold text-base mb-1">Veri bulunamadı</div>
      <div className="text-slate-400 text-sm">
        Çalışma sermayesi analizi için satış ve gider verisi gereklidir.
      </div>
    </div>
  )
}

// ── KPI cell ───────────────────────────────────────────────────────────────────

function KpiCell({
  label, value, sub,
}: {
  label: string
  value: React.ReactNode
  sub?: string
}) {
  return (
    <div className="border border-slate-200 rounded-lg p-4 bg-white">
      <div className="text-[11px] text-slate-500 uppercase tracking-wide mb-1">{label}</div>
      <div className="text-2xl font-black text-slate-800">{value}</div>
      {sub && <div className="text-[11px] text-slate-400 mt-0.5">{sub}</div>}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function WorkingCapitalOptimizationClient({ companyId }: Props) {
  const { data, isLoading, isError } = useQuery<{ report: WorkingCapitalOptimizationReport }>({
    queryKey: ['working-capital-optimization', companyId],
    queryFn:  async () => {
      const res = await fetch('/api/finance/working-capital-optimization')
      if (!res.ok) throw new Error('Veri yüklenemedi')
      return res.json() as Promise<{ report: WorkingCapitalOptimizationReport }>
    },
    staleTime: 1_800_000,
  })

  if (isLoading) return <LoadingSkeleton />
  if (isError || !data?.report) return <EmptySlate />

  const { report } = data
  const topActionId = report.top_action?.dimension

  return (
    <div className="space-y-6">
      {/* Panel header */}
      <div>
        <h2 className="text-lg font-bold text-slate-800">Çalışma Sermayesi Optimizasyonu</h2>
        <p className="text-sm text-slate-500 mt-0.5">
          Türk KOBİ kıyaslamalarına göre alacak, stok ve borç açıkları
        </p>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiCell
          label="Nakit Dönüşüm Döngüsü (NDC)"
          value={
            <span className="flex items-center gap-2">
              {report.ccc_days} gün
              <EfficiencyBadge level={report.efficiency} />
            </span>
          }
          sub={`Hedef: ${15} gün`}
        />
        <KpiCell
          label="Net Çalışma Sermayesi"
          value={fmtTRY(report.net_working_capital_try)}
          sub={
            report.working_capital_ratio_pct !== null
              ? `Gelirin %${Math.round(report.working_capital_ratio_pct)}'i`
              : undefined
          }
        />
        <KpiCell
          label="Kıyaslama"
          value={`DSO ${report.actuals.dso_days}g · DIO ${report.actuals.dio_days}g · DPO ${report.actuals.dpo_days}g`}
          sub="Hedef: 30 · 30 · 45 gün"
        />
      </div>

      {/* Hero: total cash release */}
      <div className="rounded-xl border border-teal-200 bg-gradient-to-br from-teal-50 to-white p-6">
        <div className="text-[11px] text-teal-600 uppercase tracking-widest font-bold mb-1">
          Toplam Açığa Çıkarılabilir Nakit Potansiyeli
        </div>
        <div className="text-4xl font-black text-teal-700 mb-1">
          {fmtTRY(report.total_cash_release_potential_try)}
        </div>
        <div className="text-sm text-teal-600 opacity-80">
          DSO, DIO ve DPO açıklarının kapatılmasıyla tahmini nakit kazanımı
        </div>
      </div>

      {/* Top action highlight */}
      {report.top_action && (
        <div className="rounded-xl border border-orange-200 bg-orange-50 px-5 py-4 flex items-start gap-4">
          <div className="text-2xl mt-0.5">★</div>
          <div>
            <div className="text-[11px] text-orange-600 font-bold uppercase tracking-wide mb-1">
              Öncelikli Aksiyon
            </div>
            <div className="font-semibold text-slate-800 text-sm mb-1">
              {report.top_action.label}
            </div>
            <div className="text-sm text-slate-600">{report.top_action.recommendation}</div>
            <div className="mt-2 text-sm font-bold text-orange-700">
              Potansiyel: {fmtTRY(report.top_action.cash_impact_try)}
            </div>
          </div>
        </div>
      )}

      {/* 3 gap cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {report.gaps.map(gap => (
          <GapCard
            key={gap.dimension}
            gap={gap}
            isTopAction={gap.dimension === topActionId}
          />
        ))}
      </div>

      {/* Footer note */}
      <p className="text-[11px] text-slate-400 text-center">
        Son 90 günlük satış ve gider verisi baz alınmıştır.
        Nakit potansiyeli tahminidir — gerçek değerler koşullara göre değişebilir.
      </p>
    </div>
  )
}
