'use client'

// ═══════════════════════════════════════════════════════════════════════════════
// CEO Executive Cockpit — Flowra Situation Room
//
// Client component. Fetches /api/executive-summary on mount.
// Layout:
//   SITUATION LINE    — full-width, color-coded by status
//   5 KPI CARDS       — revenue, net income, cash, runway, receivables
//   DECISION ALERTS   — top 5 severity-sorted alerts (left 60%)
//   PARTNER STRIP     — per-partner health badges (right 40%)
//   PENDING ACTIONS   — pending workflows + overdue obligations
// ═══════════════════════════════════════════════════════════════════════════════

import React, { useEffect, useState } from 'react'
import type { ExecutiveSummary }       from '@/lib/services/intelligence/executive-summary.service'

// ── Status color maps ─────────────────────────────────────────────────────────

const STATUS_BG: Record<string, string> = {
  healthy:  'bg-emerald-600',
  caution:  'bg-amber-500',
  'at-risk': 'bg-orange-500',
  critical: 'bg-red-600',
}

const STATUS_BORDER: Record<string, string> = {
  healthy:  'border-emerald-500',
  caution:  'border-amber-400',
  'at-risk': 'border-orange-400',
  critical: 'border-red-500',
}

const STATUS_TEXT: Record<string, string> = {
  healthy:  'text-emerald-700',
  caution:  'text-amber-700',
  'at-risk': 'text-orange-700',
  critical: 'text-red-700',
}

const SEVERITY_BG: Record<string, string> = {
  critical: 'bg-red-50 border-red-200',
  warning:  'bg-amber-50 border-amber-200',
  info:     'bg-gray-50 border-gray-200',
}

const SEVERITY_ICON_COLOR: Record<string, string> = {
  critical: 'text-red-600',
  warning:  'text-amber-600',
  info:     'text-gray-400',
}

const SEVERITY_ICON: Record<string, string> = {
  critical: '⚠',
  warning:  '●',
  info:     'ℹ',
}

const HEALTH_BADGE: Record<string, string> = {
  healthy:   'bg-emerald-100 text-emerald-800',
  attention: 'bg-amber-100 text-amber-800',
  critical:  'bg-red-100 text-red-800',
}

const HEALTH_LABEL: Record<string, string> = {
  healthy:   'Sağlıklı',
  attention: 'Dikkat',
  critical:  'Kritik',
}

// ── Formatting helpers ────────────────────────────────────────────────────────

function fmtTRY(n: number): string {
  const abs = Math.abs(n)
  const sign = n < 0 ? '-' : ''
  if (abs >= 1_000_000) return `${sign}₺${(abs / 1_000_000).toFixed(2)}M`
  if (abs >= 1_000)     return `${sign}₺${(abs / 1_000).toFixed(1)}K`
  return `${sign}₺${abs.toFixed(0)}`
}

function fmtRunway(months: number | null): string {
  if (months === null) return 'Kârlı'
  return `${months.toFixed(1)} ay`
}

// ── Loading skeleton ──────────────────────────────────────────────────────────

function Skeleton({ className }: { className?: string }) {
  return (
    <div className={`animate-pulse bg-gray-200 rounded ${className ?? ''}`} />
  )
}

function CockpitSkeleton() {
  return (
    <div className="min-h-screen bg-gray-50 p-6 space-y-6">
      <Skeleton className="h-20 w-full" />
      <div className="grid grid-cols-5 gap-4">
        {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-24" />)}
      </div>
      <div className="grid grid-cols-5 gap-4">
        <div className="col-span-3"><Skeleton className="h-64" /></div>
        <div className="col-span-2"><Skeleton className="h-64" /></div>
      </div>
      <Skeleton className="h-16" />
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SituationLine({ summary }: { summary: ExecutiveSummary }) {
  const { status, situation_line, composite_score, components } = summary.situation
  const bgClass = STATUS_BG[status] ?? 'bg-gray-600'

  return (
    <div className={`${bgClass} rounded-lg p-5 text-white`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <p className="text-lg font-semibold leading-snug">{situation_line}</p>
          {summary.period && (
            <span className="mt-1 inline-block text-xs bg-white/20 rounded-full px-2 py-0.5">
              {summary.period.label} · {summary.period.status}
            </span>
          )}
        </div>
        <div className="flex-shrink-0 text-right">
          <div className="text-3xl font-bold">{composite_score}</div>
          <div className="text-xs opacity-80">/ 100</div>
        </div>
      </div>
      {/* Composite score bar */}
      <div className="mt-3 bg-white/20 rounded-full h-2">
        <div
          className="bg-white rounded-full h-2 transition-all duration-700"
          style={{ width: `${composite_score}%` }}
        />
      </div>
      {/* Sub-scores */}
      <div className="mt-3 grid grid-cols-5 gap-2 text-xs text-white/80">
        <div>Nakit <span className="font-semibold text-white">{components.cash_score}</span></div>
        <div>Kâr <span className="font-semibold text-white">{components.profit_score}</span></div>
        <div>Borç <span className="font-semibold text-white">{components.debt_score}</span></div>
        <div>Alacak <span className="font-semibold text-white">{components.receivable_score}</span></div>
        <div>Ortak <span className="font-semibold text-white">{components.partner_score}</span></div>
      </div>
    </div>
  )
}

function KpiCard({
  label,
  value,
  sub,
  status,
}: {
  label: string
  value: string
  sub?: string
  status: ExecutiveSummary['situation']['status']
}) {
  const borderClass = STATUS_BORDER[status] ?? 'border-gray-300'
  return (
    <div className={`bg-white rounded-lg border-b-2 ${borderClass} shadow-sm p-4`}>
      <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">{label}</p>
      <p className="text-xl font-bold text-gray-900">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  )
}

function DecisionAlerts({ alerts }: { alerts: ExecutiveSummary['top_alerts'] }) {
  if (alerts.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-sm p-6 text-center text-gray-400 text-sm">
        Aktif karar uyarısı yok
      </div>
    )
  }
  return (
    <div className="bg-white rounded-lg shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100">
        <h3 className="text-sm font-semibold text-gray-700">Karar Uyarıları</h3>
      </div>
      <ul className="divide-y divide-gray-100">
        {alerts.map(alert => (
          <li
            key={alert.id}
            className={`flex gap-3 p-4 border-l-4 ${SEVERITY_BG[alert.severity] ?? 'bg-white border-gray-200'}`}
          >
            <span className={`text-lg mt-0.5 ${SEVERITY_ICON_COLOR[alert.severity] ?? 'text-gray-400'}`}>
              {SEVERITY_ICON[alert.severity] ?? 'ℹ'}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900">{alert.title}</p>
              <p className="text-xs text-gray-500 mt-0.5">{alert.detail}</p>
              {alert.amount_try !== null && (
                <span className="inline-block mt-1 text-xs font-semibold bg-white border border-gray-200 rounded px-2 py-0.5">
                  {fmtTRY(alert.amount_try)}
                </span>
              )}
            </div>
            {alert.action_href && alert.action_label && (
              <a
                href={alert.action_href}
                className="flex-shrink-0 self-center text-xs font-medium text-blue-600 hover:underline"
              >
                {alert.action_label} →
              </a>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

function PartnerStrip({ partners }: { partners: ExecutiveSummary['partner_strip'] }) {
  if (partners.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-sm p-6 text-center text-gray-400 text-sm">
        Ortak bulunamadı
      </div>
    )
  }
  return (
    <div className="bg-white rounded-lg shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100">
        <h3 className="text-sm font-semibold text-gray-700">Ortak Durumu</h3>
      </div>
      <ul className="divide-y divide-gray-100">
        {partners.map(p => (
          <li key={p.partner_id} className="flex items-center gap-3 px-4 py-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{p.name}</p>
              <p className="text-xs text-gray-500">
                %{p.share_pct} pay · {fmtTRY(p.loan_outstanding_try)} borç
              </p>
            </div>
            <span className={`text-xs font-semibold rounded-full px-2 py-0.5 ${HEALTH_BADGE[p.health] ?? 'bg-gray-100 text-gray-700'}`}>
              {HEALTH_LABEL[p.health] ?? p.health}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function PendingActions({ summary }: { summary: ExecutiveSummary }) {
  const { pending_workflows, active_alerts } = summary.kpis
  const total = pending_workflows + active_alerts

  if (total === 0) {
    return (
      <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-5 py-3 text-sm text-emerald-800 flex items-center gap-2">
        <span>✓</span>
        <span>Bekleyen işlem yok — tüm karar noktaları temizlendi</span>
      </div>
    )
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg px-5 py-3 flex flex-wrap gap-4 text-sm">
      <span className="font-semibold text-gray-700">Bekleyen İşlemler</span>
      {active_alerts > 0 && (
        <span className="text-red-700 font-medium">
          {active_alerts} aktif uyarı
        </span>
      )}
      {pending_workflows > 0 && (
        <span className="text-amber-700 font-medium">
          {pending_workflows} bekleyen onay
        </span>
      )}
      <a href="/dashboard/tasks" className="ml-auto text-blue-600 hover:underline">
        Tümünü Gör →
      </a>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function CeoCockpitPage() {
  const [summary, setSummary] = useState<ExecutiveSummary | null>(null)
  const [error,   setError]   = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    fetch('/api/executive-summary')
      .then(async res => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`)
        }
        return res.json() as Promise<{ summary: ExecutiveSummary }>
      })
      .then(({ summary: s }) => {
        if (!cancelled) setSummary(s)
      })
      .catch(err => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  }, [])

  if (loading) return <CockpitSkeleton />

  if (error || !summary) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white rounded-lg shadow p-8 text-center max-w-md">
          <p className="text-red-600 font-semibold mb-2">Yönetici özeti yüklenemedi</p>
          <p className="text-gray-500 text-sm">{error ?? 'Bilinmeyen hata'}</p>
          <button
            className="mt-4 text-sm text-blue-600 hover:underline"
            onClick={() => window.location.reload()}
          >
            Yeniden Dene
          </button>
        </div>
      </div>
    )
  }

  const { situation, kpis, top_alerts, partner_strip } = summary

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto p-6 space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Yönetici Kokpiti</h1>
            <p className="text-xs text-gray-400 mt-0.5">
              {new Date(summary.computed_at).toLocaleString('tr-TR', { dateStyle: 'medium', timeStyle: 'short' })}
            </p>
          </div>
          <a href="/dashboard/cfo" className="text-sm text-blue-600 hover:underline">
            CFO Raporları →
          </a>
        </div>

        {/* Situation Line */}
        <SituationLine summary={summary} />

        {/* KPI Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          <KpiCard
            label="Gelir (MTD)"
            value={fmtTRY(kpis.revenue_mtd_try)}
            status={situation.status}
          />
          <KpiCard
            label="Net Kâr (MTD)"
            value={fmtTRY(kpis.net_income_mtd_try)}
            sub={kpis.net_income_mtd_try < 0 ? 'Zarar' : undefined}
            status={situation.status}
          />
          <KpiCard
            label="Nakit"
            value={fmtTRY(kpis.cash_balance_try)}
            status={situation.status}
          />
          <KpiCard
            label="Runway"
            value={fmtRunway(kpis.runway_months)}
            status={situation.status}
          />
          <KpiCard
            label="Alacak"
            value={fmtTRY(kpis.accounts_receivable_try)}
            sub={kpis.overdue_receivable_try > 0 ? `${fmtTRY(kpis.overdue_receivable_try)} vadesi geçmiş` : undefined}
            status={situation.status}
          />
        </div>

        {/* Main content: alerts (60%) + partner strip (40%) */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
          <div className="lg:col-span-3">
            <DecisionAlerts alerts={top_alerts} />
          </div>
          <div className="lg:col-span-2">
            <PartnerStrip partners={partner_strip} />
          </div>
        </div>

        {/* Pending Actions footer */}
        <PendingActions summary={summary} />

        {/* Quick navigation */}
        <nav className="flex flex-wrap gap-3 pt-2 border-t border-gray-200">
          {[
            { href: '/dashboard/finance',    label: 'Finans' },
            { href: '/dashboard/commercial', label: 'Ticari' },
            { href: '/dashboard/partners',   label: 'Ortaklar' },
            { href: '/dashboard/cfo',        label: 'CFO Paneli' },
            { href: '/dashboard/planning',   label: 'Planlama' },
          ].map(link => (
            <a
              key={link.href}
              href={link.href}
              className="text-xs text-gray-500 hover:text-blue-600 hover:underline"
            >
              {link.label}
            </a>
          ))}
        </nav>

      </div>
    </div>
  )
}
