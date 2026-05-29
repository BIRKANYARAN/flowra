'use client'

// ─────────────────────────────────────────────────────────────────────────────
// KpiAlertDashboardClient — KPI Alert Thresholds Dashboard
//
// Displays health score badge, alert counts by severity, triggered alerts
// list (color-coded), and category grouping.
//
// Data source: GET /api/intelligence/kpi-thresholds (5-min refetch)
// ─────────────────────────────────────────────────────────────────────────────

import { useQuery }         from '@tanstack/react-query'
import {
  FlowraCard,
  FlowraStatusBadge,
  FlowraAlert,
  cn,
} from '@/components/ds'
import type {
  KpiThresholdEvaluationReport,
  ThresholdEvaluation,
  KpiCategory,
  ThresholdSeverity,
} from '@/lib/services/intelligence/kpi-threshold.service'

// ── Types ──────────────────────────────────────────────────────────────────────

interface ApiResponse {
  report: KpiThresholdEvaluationReport
}

// ── Constants ──────────────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<KpiCategory, string> = {
  financial:   'Finansal',
  commercial:  'Ticari',
  operational: 'Operasyonel',
  partner:     'Ortaklık',
}

const CATEGORY_ORDER: KpiCategory[] = [
  'financial',
  'commercial',
  'operational',
  'partner',
]

const SEVERITY_LABELS: Record<ThresholdSeverity, string> = {
  critical: 'Kritik',
  warning:  'Uyarı',
  info:     'Bilgi',
}

// ── Health score styles ────────────────────────────────────────────────────────

function healthScoreStyle(score: number): {
  bg: string
  text: string
  border: string
  label: string
} {
  if (score >= 80) return { bg: 'bg-emerald-50', text: 'text-emerald-800', border: 'border-emerald-200', label: 'İyi' }
  if (score >= 60) return { bg: 'bg-blue-50',    text: 'text-blue-800',    border: 'border-blue-200',    label: 'İzle' }
  if (score >= 40) return { bg: 'bg-amber-50',   text: 'text-amber-800',   border: 'border-amber-200',   label: 'Dikkat' }
  return               { bg: 'bg-red-50',     text: 'text-red-800',     border: 'border-red-200',     label: 'Kritik' }
}

// ── Severity dot indicator ─────────────────────────────────────────────────────

function SeverityDot({ severity }: { severity: ThresholdSeverity }) {
  const colorMap: Record<ThresholdSeverity, string> = {
    critical: 'bg-red-500',
    warning:  'bg-amber-400',
    info:     'bg-blue-400',
  }
  return (
    <span
      className={cn('inline-block w-2 h-2 rounded-full flex-shrink-0 mt-1.5', colorMap[severity])}
      aria-label={SEVERITY_LABELS[severity]}
    />
  )
}

// ── Severity badge ─────────────────────────────────────────────────────────────

function SeverityBadge({ severity }: { severity: ThresholdSeverity }) {
  const styles: Record<ThresholdSeverity, string> = {
    critical: 'bg-red-100 text-red-800 border-red-200',
    warning:  'bg-amber-100 text-amber-800 border-amber-200',
    info:     'bg-blue-100 text-blue-800 border-blue-200',
  }
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border', styles[severity])}>
      {SEVERITY_LABELS[severity]}
    </span>
  )
}

// ── Alert count chip ──────────────────────────────────────────────────────────

function AlertCountChip({
  count,
  severity,
  label,
}: {
  count: number
  severity: ThresholdSeverity
  label: string
}) {
  const styles: Record<ThresholdSeverity, string> = {
    critical: 'bg-red-100 text-red-900 border-red-200',
    warning:  'bg-amber-100 text-amber-900 border-amber-200',
    info:     'bg-blue-100 text-blue-900 border-blue-200',
  }
  return (
    <div className={cn('flex flex-col items-center px-4 py-3 rounded-lg border', styles[severity])}>
      <span className="text-2xl font-bold tabular-nums">{count}</span>
      <span className="text-xs font-medium mt-0.5">{label}</span>
    </div>
  )
}

// ── Single alert row ───────────────────────────────────────────────────────────

function AlertRow({ evaluation }: { evaluation: ThresholdEvaluation }) {
  if (!evaluation.severity) return null

  const rowBg: Record<ThresholdSeverity, string> = {
    critical: 'border-l-4 border-l-red-500 bg-red-50/60',
    warning:  'border-l-4 border-l-amber-400 bg-amber-50/60',
    info:     'border-l-4 border-l-blue-400 bg-blue-50/60',
  }

  return (
    <div className={cn('flex items-start gap-3 px-4 py-3 rounded-r-lg', rowBg[evaluation.severity])}>
      <SeverityDot severity={evaluation.severity} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-gray-900 truncate">{evaluation.kpi_label_tr}</span>
          <SeverityBadge severity={evaluation.severity} />
        </div>
        <p className="text-xs text-gray-600 mt-0.5 leading-relaxed">{evaluation.message_tr}</p>
      </div>
      {evaluation.current_value !== null && (
        <span className="flex-shrink-0 text-sm font-semibold tabular-nums text-gray-700">
          {evaluation.current_value.toLocaleString('tr-TR', { maximumFractionDigits: 1 })}
          {/* unit is embedded in the message */}
        </span>
      )}
    </div>
  )
}

// ── Category section ──────────────────────────────────────────────────────────

function CategorySection({
  category,
  alerts,
}: {
  category: KpiCategory
  alerts: ThresholdEvaluation[]
}) {
  if (alerts.length === 0) return null

  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 px-1 mb-2">
        {CATEGORY_LABELS[category]}
        <span className="ml-2 inline-flex items-center justify-center w-4 h-4 rounded-full bg-gray-200 text-gray-700 text-[10px] font-bold">
          {alerts.length}
        </span>
      </h3>
      <div className="space-y-1.5">
        {alerts.map(ev => (
          <AlertRow key={ev.kpi_key} evaluation={ev} />
        ))}
      </div>
    </div>
  )
}

// ── Loading skeleton ───────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-20 bg-gray-100 rounded-lg" />
      <div className="grid grid-cols-3 gap-3">
        {[0, 1, 2].map(i => (
          <div key={i} className="h-16 bg-gray-100 rounded-lg" />
        ))}
      </div>
      <div className="space-y-2">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="h-14 bg-gray-100 rounded-lg" />
        ))}
      </div>
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────────

export function KpiAlertDashboardClient() {
  const { data, isLoading, isError, error } = useQuery<ApiResponse>({
    queryKey: ['kpi-thresholds'],
    queryFn:  async () => {
      const res = await fetch('/api/intelligence/kpi-thresholds')
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error((body as { error?: string }).error ?? 'KPI eşik verisi yüklenemedi')
      }
      return res.json() as Promise<ApiResponse>
    },
    staleTime:     5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  })

  if (isLoading) {
    return (
      <FlowraCard>
        <div className="p-5">
          <h2 className="text-base font-semibold text-gray-900 mb-4">KPI Uyarı Paneli</h2>
          <LoadingSkeleton />
        </div>
      </FlowraCard>
    )
  }

  if (isError) {
    return (
      <FlowraCard>
        <div className="p-5">
          <h2 className="text-base font-semibold text-gray-900 mb-4">KPI Uyarı Paneli</h2>
          <FlowraAlert
            tone="danger"
            text="Veri yüklenemedi"
            sub={error instanceof Error ? error.message : 'Beklenmeyen bir hata oluştu.'}
          />
        </div>
      </FlowraCard>
    )
  }

  const report = data?.report
  if (!report) return null

  const healthStyle = healthScoreStyle(report.health_score)
  const hasAlerts   = report.triggered_alerts.length > 0

  return (
    <FlowraCard>
      <div className="p-5 space-y-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-gray-900">KPI Uyarı Paneli</h2>
            <p className="text-xs text-gray-500 mt-0.5">{report.thresholds_used.length} KPI izleniyor</p>
          </div>

          {/* Health score badge */}
          <div
            className={cn(
              'flex flex-col items-center px-5 py-2.5 rounded-xl border',
              healthStyle.bg,
              healthStyle.border,
            )}
          >
            <span className={cn('text-2xl font-bold tabular-nums', healthStyle.text)}>
              {report.health_score}
            </span>
            <span className={cn('text-xs font-semibold', healthStyle.text)}>
              {healthStyle.label}
            </span>
          </div>
        </div>

        {/* Narrative */}
        <p className="text-sm text-gray-700 bg-gray-50 rounded-lg px-4 py-3 border border-gray-100">
          {report.narrative}
        </p>

        {/* Alert count chips */}
        <div className="grid grid-cols-3 gap-3">
          <AlertCountChip count={report.alert_counts.critical} severity="critical" label="Kritik"  />
          <AlertCountChip count={report.alert_counts.warning}  severity="warning"  label="Uyarı"   />
          <AlertCountChip count={report.alert_counts.info}     severity="info"     label="Bilgi"    />
        </div>

        {/* Triggered alerts by category */}
        {hasAlerts ? (
          <div className="space-y-5">
            {CATEGORY_ORDER.map(cat => (
              <CategorySection
                key={cat}
                category={cat}
                alerts={report.alerts_by_category[cat] ?? []}
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <span className="text-3xl mb-2">✓</span>
            <p className="text-sm font-medium text-emerald-700">Tüm KPI'lar hedef seviyede</p>
            <p className="text-xs text-gray-500 mt-1">Aktif uyarı bulunmuyor</p>
          </div>
        )}
      </div>
    </FlowraCard>
  )
}
