'use client'

// ─────────────────────────────────────────────────────────────────────────────
// InsightPanel — Rule-based BI insight cards for CEO Cockpit.
//
// Displays up to 6 insights (critical first).
// Each card has severity border, icon, title, narrative, metric chip, CTA.
// Uses TanStack Query (5-minute stale matches server revalidate: 300).
// ─────────────────────────────────────────────────────────────────────────────

import Link         from 'next/link'
import { useQuery } from '@tanstack/react-query'
import type { InsightReport, BusinessInsight, InsightSeverity } from '@/lib/services/intelligence/insight-engine.service'

// ── Severity config ────────────────────────────────────────────────────────────

const SEVERITY_CONFIG: Record<InsightSeverity, {
  border:  string
  icon:    string
  iconCls: string
  titleCls: string
  badge:   string
  label:   string
  actionCls: string
}> = {
  critical: {
    border:    'border-l-4 border-l-[#ef4444]',
    icon:      '▲',
    iconCls:   'text-[#ef4444]',
    titleCls:  'text-[#dc2626] font-bold',
    badge:     'bg-neg-light text-neg text-[9px] font-bold px-1.5 py-0.5 rounded uppercase',
    label:     'Kritik',
    actionCls: 'bg-neg text-white hover:bg-neg/90',
  },
  warning: {
    border:    'border-l-4 border-l-[#f59e0b]',
    icon:      '◆',
    iconCls:   'text-[#f59e0b]',
    titleCls:  'text-[#b45309] font-semibold',
    badge:     'bg-warn-light text-warn-text text-[9px] font-bold px-1.5 py-0.5 rounded uppercase',
    label:     'Uyarı',
    actionCls: 'bg-warn-light text-warn-text hover:bg-warn/10 border border-warn/30',
  },
  positive: {
    border:    'border-l-4 border-l-[#22c55e]',
    icon:      '●',
    iconCls:   'text-[#22c55e]',
    titleCls:  'text-pos-text font-semibold',
    badge:     'bg-pos-light text-pos-text text-[9px] font-bold px-1.5 py-0.5 rounded uppercase',
    label:     'Pozitif',
    actionCls: 'bg-pos-light text-pos-text hover:bg-pos/10 border border-pos/30',
  },
  info: {
    border:    'border-l-4 border-l-[#e2e8f0]',
    icon:      'ℹ',
    iconCls:   'text-[#94a3b8]',
    titleCls:  'text-[#475569] font-medium',
    badge:     'bg-[#f1f5f9] text-[#64748b] text-[9px] font-bold px-1.5 py-0.5 rounded uppercase',
    label:     'Bilgi',
    actionCls: 'bg-[#f1f5f9] text-[#64748b] hover:bg-[#e2e8f0]',
  },
}

// ── Insight card ──────────────────────────────────────────────────────────────

function InsightCard({ insight }: { insight: BusinessInsight }) {
  const cfg = SEVERITY_CONFIG[insight.severity]

  return (
    <div className={`bg-white rounded px-3 py-2.5 ${cfg.border} shadow-sm`}>
      <div className="flex items-start gap-2">
        <span className={`text-sm leading-none mt-0.5 flex-shrink-0 ${cfg.iconCls}`} aria-hidden="true">
          {cfg.icon}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
            <span className={`text-xs ${cfg.titleCls} leading-snug`}>{insight.title}</span>
            <span className={cfg.badge}>{cfg.label}</span>
          </div>
          <p className="text-[10px] text-[#64748b] leading-relaxed">{insight.narrative}</p>
          {insight.metric_value !== undefined && insight.metric_label && (
            <div className="mt-1.5 flex items-center gap-2 flex-wrap">
              <span className="text-xs font-black tabular-nums text-[#0f172a]">
                {typeof insight.metric_value === 'number' ? insight.metric_value.toLocaleString('tr-TR', { maximumFractionDigits: 1 }) : insight.metric_value}
              </span>
              <span className="text-[10px] text-[#94a3b8]">{insight.metric_label}</span>
            </div>
          )}
        </div>
        {insight.action_label && insight.action_href && (
          <Link
            href={insight.action_href}
            className={`text-[10px] font-semibold shrink-0 px-2 py-1 rounded transition-colors ${cfg.actionCls}`}
          >
            {insight.action_label} →
          </Link>
        )}
      </div>
    </div>
  )
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function InsightSkeleton() {
  return (
    <div className="bg-white rounded border-l-4 border-l-[#e2e8f0] px-3 py-2.5 shadow-sm animate-pulse">
      <div className="flex items-start gap-2">
        <div className="w-3 h-3 bg-[#e2e8f0] rounded-full mt-0.5 flex-shrink-0" />
        <div className="flex-1 space-y-1.5">
          <div className="h-3 bg-[#e2e8f0] rounded w-2/5" />
          <div className="h-2.5 bg-[#f1f5f9] rounded w-4/5" />
          <div className="h-2.5 bg-[#f1f5f9] rounded w-3/5" />
        </div>
      </div>
    </div>
  )
}

// ── Summary badge row ─────────────────────────────────────────────────────────

function SummaryBadges({ report }: { report: InsightReport }) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {report.critical_count > 0 && (
        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-neg-light text-neg uppercase">
          {report.critical_count} Kritik
        </span>
      )}
      {report.warning_count > 0 && (
        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-warn-light text-warn-text uppercase">
          {report.warning_count} Uyarı
        </span>
      )}
      {report.positive_count > 0 && (
        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-pos-light text-pos-text uppercase">
          {report.positive_count} Pozitif
        </span>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function InsightPanel() {
  const { data, isLoading, isError } = useQuery<InsightReport>({
    queryKey: ['intelligence', 'insights'],
    queryFn:  async () => {
      const res = await fetch('/api/intelligence/insights')
      if (!res.ok) throw new Error('Failed to fetch insights')
      return res.json() as Promise<InsightReport>
    },
    staleTime: 5 * 60 * 1_000,   // 5 minutes
    retry: 1,
  })

  return (
    <div className="bg-white border border-[#e2e8f0] rounded shadow-sm">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#f1f5f9]">
        <div className="flex items-center gap-2">
          <span className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">
            İş Zekası
          </span>
          {data && <SummaryBadges report={data} />}
        </div>
        <Link
          href="/dashboard/reports"
          className="text-[10px] text-brand-light font-semibold hover:text-brand"
        >
          Tüm içgörüler →
        </Link>
      </div>

      {/* ── Body ───────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-2 p-3">
        {isLoading && (
          <>
            <InsightSkeleton />
            <InsightSkeleton />
            <InsightSkeleton />
          </>
        )}

        {isError && (
          <p className="text-[10px] text-[#94a3b8] text-center py-3">
            İçgörüler yüklenemedi. Lütfen sayfayı yenileyin.
          </p>
        )}

        {data && data.insights.length === 0 && (
          <p className="text-[10px] text-[#94a3b8] text-center py-3">
            Şu an için öne çıkan bir içgörü yok — veriler sağlıklı görünüyor.
          </p>
        )}

        {data && data.insights.slice(0, 6).map(insight => (
          <InsightCard key={insight.id} insight={insight} />
        ))}

        {data && data.insights.length > 6 && (
          <div className="text-center pt-1">
            <Link
              href="/dashboard/reports"
              className="text-[10px] text-brand-light font-semibold hover:text-brand"
            >
              +{data.insights.length - 6} daha fazla içgörü →
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
