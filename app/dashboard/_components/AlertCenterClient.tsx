'use client'

// ─────────────────────────────────────────────────────────────────────────────
// AlertCenterClient — Configurable Alert Rules Engine UI
//
// Displays all active KPI alerts grouped by category with severity indicators,
// health score badge, and count chips.
//
// Data source: GET /api/intelligence/alerts (5-min refetch interval)
// ─────────────────────────────────────────────────────────────────────────────

import { useQuery }       from '@tanstack/react-query'
import Link               from 'next/link'
import type {
  Alert,
  AlertCategory,
  AlertSeverity,
} from '@/lib/services/intelligence/alert-rules.service'
import { computeAlertSummary } from '@/lib/services/intelligence/alert-rules.service'

// ── Config ─────────────────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<AlertCategory, string> = {
  cash:        'Nakit',
  receivables: 'Alacaklar',
  inventory:   'Stok',
  partners:    'Ortaklar',
  compliance:  'Uyum',
  revenue:     'Gelir',
  expenses:    'Giderler',
  performance: 'Performans',
}

const CATEGORY_ORDER: AlertCategory[] = [
  'cash', 'receivables', 'compliance', 'partners',
  'inventory', 'revenue', 'expenses', 'performance',
]

// ── Health score color ────────────────────────────────────────────────────────

function healthScoreStyle(score: number): { bg: string; text: string; label: string } {
  if (score >= 80) return { bg: 'bg-emerald-100 border-emerald-200', text: 'text-emerald-800', label: 'İyi' }
  if (score >= 60) return { bg: 'bg-blue-100 border-blue-200',       text: 'text-blue-800',    label: 'Normal' }
  if (score >= 40) return { bg: 'bg-amber-100 border-amber-200',     text: 'text-amber-800',   label: 'Dikkat' }
  return                   { bg: 'bg-red-100 border-red-200',         text: 'text-red-800',     label: 'Kritik' }
}

// ── Severity icon ─────────────────────────────────────────────────────────────

function SeverityDot({ severity }: { severity: AlertSeverity }) {
  const color =
    severity === 'critical' ? 'bg-red-500' :
    severity === 'warning'  ? 'bg-amber-500' :
    'bg-blue-400'

  return <span className={`inline-block w-2 h-2 rounded-full flex-shrink-0 mt-1 ${color}`} />
}

// ── Single alert row ──────────────────────────────────────────────────────────

function AlertRow({ alert }: { alert: Alert }) {
  const severityColor =
    alert.severity === 'critical' ? 'text-red-700 font-semibold' :
    alert.severity === 'warning'  ? 'text-amber-700 font-medium' :
    'text-blue-700'

  return (
    <div className="flex items-start gap-2 py-2 border-b border-[#f1f5f9] last:border-0">
      <SeverityDot severity={alert.severity} />
      <div className="flex-1 min-w-0">
        <p className={`text-[0.75rem] leading-snug ${severityColor}`}>{alert.title}</p>
        <p className="text-[0.68rem] text-[#64748b] leading-snug mt-0.5">{alert.detail}</p>
      </div>
      <Link
        href={alert.action_href}
        className="flex-shrink-0 text-[0.65rem] font-semibold text-brand-light hover:text-brand whitespace-nowrap"
      >
        {alert.action_label} →
      </Link>
    </div>
  )
}

// ── Category group ────────────────────────────────────────────────────────────

function CategoryGroup({ category, alerts }: { category: AlertCategory; alerts: Alert[] }) {
  if (alerts.length === 0) return null

  return (
    <div className="mb-3">
      <div className="text-[0.6rem] font-bold uppercase tracking-widest text-[#94a3b8] mb-1">
        {CATEGORY_LABELS[category]}
      </div>
      {alerts.map(a => (
        <AlertRow key={a.id} alert={a} />
      ))}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

interface AlertCenterClientProps {
  companyId?: string
}

export function AlertCenterClient({ companyId }: AlertCenterClientProps) {
  const { data, isLoading, isError } = useQuery<{
    alerts: Alert[]
    summary: ReturnType<typeof computeAlertSummary>
    health_score: number
    last_evaluated: string
  }>({
    queryKey:       ['alerts', companyId],
    queryFn:        () => fetch('/api/intelligence/alerts').then(r => r.json()),
    staleTime:      5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
    retry:          1,
  })

  if (isLoading) {
    return (
      <div className="bg-white border border-[#e2e8f0] rounded-lg p-4 shadow-sm">
        <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-3">
          Uyarı Merkezi
        </div>
        <div className="animate-pulse space-y-2">
          <div className="h-6 bg-[#f1f5f9] rounded w-1/4" />
          <div className="h-4 bg-[#f1f5f9] rounded w-3/4" />
          <div className="h-4 bg-[#f1f5f9] rounded w-2/3" />
          <div className="h-4 bg-[#f1f5f9] rounded w-1/2" />
        </div>
      </div>
    )
  }

  if (isError || !data) {
    return (
      <div className="bg-white border border-[#e2e8f0] rounded-lg p-4 shadow-sm">
        <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-2">
          Uyarı Merkezi
        </div>
        <p className="text-xs text-[#94a3b8]">Uyarılar yüklenemedi.</p>
      </div>
    )
  }

  const { alerts, summary, health_score } = data
  const scoreStyle = healthScoreStyle(health_score)

  // Group alerts by category
  const byCategory = new Map<AlertCategory, Alert[]>()
  for (const cat of CATEGORY_ORDER) byCategory.set(cat, [])
  for (const alert of alerts) {
    const group = byCategory.get(alert.category) ?? []
    group.push(alert)
    byCategory.set(alert.category, group)
  }

  return (
    <div className="bg-white border border-[#e2e8f0] rounded-lg p-4 shadow-sm">

      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">
          Uyarı Merkezi
        </div>

        {/* Health score badge */}
        <span className={`text-[0.65rem] font-bold px-2 py-0.5 rounded border ${scoreStyle.bg} ${scoreStyle.text}`}>
          Skor {health_score} — {scoreStyle.label}
        </span>
      </div>

      {/* Count chips */}
      <div className="flex flex-wrap gap-2 mb-4">
        {summary.critical > 0 && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 border border-red-200 text-red-700 text-[0.65rem] font-semibold">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500" />
            {summary.critical} kritik
          </span>
        )}
        {summary.warning > 0 && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 border border-amber-200 text-amber-700 text-[0.65rem] font-semibold">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500" />
            {summary.warning} uyarı
          </span>
        )}
        {summary.info > 0 && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-100 border border-blue-200 text-blue-700 text-[0.65rem] font-semibold">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-400" />
            {summary.info} bilgi
          </span>
        )}
        {summary.total === 0 && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 border border-emerald-200 text-emerald-700 text-[0.65rem] font-semibold">
            Tümü normal
          </span>
        )}
      </div>

      {/* Empty state */}
      {alerts.length === 0 && (
        <div className="flex flex-col items-center py-6 gap-2 text-center">
          <span className="text-2xl">&#10003;</span>
          <p className="text-sm font-semibold text-emerald-700">Aktif uyarı bulunmuyor</p>
          <p className="text-xs text-[#94a3b8]">Tüm KPI&apos;lar normal seviyelerde.</p>
        </div>
      )}

      {/* Alert list grouped by category */}
      {alerts.length > 0 && (
        <div>
          {CATEGORY_ORDER.map(cat => (
            <CategoryGroup
              key={cat}
              category={cat}
              alerts={byCategory.get(cat) ?? []}
            />
          ))}
        </div>
      )}

    </div>
  )
}
