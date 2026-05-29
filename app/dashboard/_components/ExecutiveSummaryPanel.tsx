'use client'

// ─────────────────────────────────────────────────────────────────────────────
// ExecutiveSummaryPanel — CEO One-Stop Executive Summary
//
// Displays the unified ExecutiveSummaryReport aggregated from Finance,
// Commercial, Operations, and Partners.
//
// Features:
//   - Overall health score (large number) with health badge
//   - Status line (prominent Turkish narrative)
//   - 4 sub-score pills: Finance / Commercial / Operations / Partners
//   - Top 3 alerts and top 3 positives
//   - Links to each area
//
// Data source: GET /api/intelligence/executive-summary (5-min cache)
// ─────────────────────────────────────────────────────────────────────────────

import { useQuery }   from '@tanstack/react-query'
import Link           from 'next/link'
import type { ExecutiveSummaryReport } from '@/lib/services/intelligence/executive-summary.service'

// ── Health config ──────────────────────────────────────────────────────────────

const HEALTH_CONFIG = {
  excellent: {
    bg:        'bg-emerald-50',
    border:    'border-emerald-200',
    scoreText: 'text-emerald-700',
    badgeBg:   'bg-emerald-100',
    badgeBorder: 'border-emerald-200',
    badgeText: 'text-emerald-800',
    bar:       'bg-emerald-500',
    label:     'Mükemmel',
  },
  good: {
    bg:        'bg-blue-50',
    border:    'border-blue-200',
    scoreText: 'text-blue-700',
    badgeBg:   'bg-blue-100',
    badgeBorder: 'border-blue-200',
    badgeText: 'text-blue-800',
    bar:       'bg-blue-500',
    label:     'İyi',
  },
  fair: {
    bg:        'bg-amber-50',
    border:    'border-amber-200',
    scoreText: 'text-amber-700',
    badgeBg:   'bg-amber-100',
    badgeBorder: 'border-amber-200',
    badgeText: 'text-amber-800',
    bar:       'bg-amber-500',
    label:     'Orta',
  },
  poor: {
    bg:        'bg-orange-50',
    border:    'border-orange-200',
    scoreText: 'text-orange-700',
    badgeBg:   'bg-orange-100',
    badgeBorder: 'border-orange-200',
    badgeText: 'text-orange-800',
    bar:       'bg-orange-500',
    label:     'Dikkat',
  },
  critical: {
    bg:        'bg-red-50',
    border:    'border-red-200',
    scoreText: 'text-red-700',
    badgeBg:   'bg-red-100',
    badgeBorder: 'border-red-200',
    badgeText: 'text-red-800',
    bar:       'bg-red-500',
    label:     'Kritik',
  },
} as const

// ── Area config ────────────────────────────────────────────────────────────────

const AREA_CONFIG: Record<string, { label: string; href: string }> = {
  finance:    { label: 'Finans',   href: '/dashboard/finance' },
  commercial: { label: 'Ticaret',  href: '/dashboard/commercial' },
  operations: { label: 'Operasyon', href: '/dashboard/operations' },
  partners:   { label: 'Ortaklar', href: '/dashboard/partners' },
}

// ── Score pill ─────────────────────────────────────────────────────────────────

interface ScorePillProps {
  label: string
  score: number
  href:  string
}

function ScorePill({ label, score, href }: ScorePillProps) {
  const color =
    score >= 80 ? 'bg-emerald-100 text-emerald-800 border-emerald-200' :
    score >= 65 ? 'bg-blue-100 text-blue-800 border-blue-200' :
    score >= 50 ? 'bg-amber-100 text-amber-800 border-amber-200' :
    score >= 35 ? 'bg-orange-100 text-orange-800 border-orange-200' :
                  'bg-red-100 text-red-800 border-red-200'

  return (
    <Link
      href={href}
      className={`inline-flex flex-col items-center px-3 py-2 rounded border text-center hover:opacity-80 transition-opacity ${color}`}
    >
      <span className="text-[0.6rem] font-bold uppercase tracking-wider opacity-70">{label}</span>
      <span className="text-lg font-black tabular-nums leading-tight">{score}</span>
    </Link>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export function ExecutiveSummaryPanel() {
  const { data, isLoading, isError } = useQuery<{ report: ExecutiveSummaryReport }>({
    queryKey:  ['executive-summary'],
    queryFn:   () => fetch('/api/intelligence/executive-summary').then(r => r.json()),
    staleTime: 5 * 60 * 1000,
    retry:     1,
  })

  if (isLoading) {
    return (
      <div className="bg-white border border-[#e2e8f0] rounded-lg p-4 shadow-sm">
        <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-3">
          Yönetici Özeti
        </div>
        <div className="animate-pulse space-y-2">
          <div className="h-12 bg-[#f1f5f9] rounded w-1/3" />
          <div className="h-4 bg-[#f1f5f9] rounded w-3/4" />
          <div className="h-4 bg-[#f1f5f9] rounded w-1/2" />
        </div>
      </div>
    )
  }

  if (isError || !data?.report) {
    return (
      <div className="bg-white border border-[#e2e8f0] rounded-lg p-4 shadow-sm">
        <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-2">
          Yönetici Özeti
        </div>
        <p className="text-xs text-[#94a3b8]">Özet rapor yüklenemedi.</p>
      </div>
    )
  }

  const { report } = data
  const cfg = HEALTH_CONFIG[report.overall_health]

  return (
    <div className={`rounded-lg border p-4 shadow-sm ${cfg.bg} ${cfg.border}`}>

      {/* Header row */}
      <div className="flex items-start justify-between mb-3">
        <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">
          Yönetici Özeti
        </div>
        <span className={`text-[0.65rem] font-bold px-2 py-0.5 rounded border ${cfg.badgeBg} ${cfg.badgeBorder} ${cfg.badgeText}`}>
          {cfg.label}
        </span>
      </div>

      {/* Score row */}
      <div className="flex items-end gap-3 mb-3">
        <div className={`text-5xl font-black tabular-nums leading-none ${cfg.scoreText}`}>
          {report.overall_score}
        </div>
        <div className="pb-1">
          <div className="text-[0.6rem] text-[#94a3b8] uppercase tracking-wider">Genel Skor</div>
          {/* Score bar */}
          <div className="w-32 h-1.5 bg-white/60 rounded-full mt-1">
            <div
              className={`h-1.5 rounded-full ${cfg.bar}`}
              style={{ width: `${report.overall_score}%` }}
            />
          </div>
        </div>
      </div>

      {/* Status line */}
      <p className="text-sm font-medium text-[#1e293b] mb-4 leading-snug">
        {report.status_line}
      </p>

      {/* Sub-score pills */}
      <div className="flex flex-wrap gap-2 mb-4">
        <ScorePill label="Finans"   score={report.finance.finance_score}          href="/dashboard/finance" />
        <ScorePill label="Ticaret"  score={report.commercial.commercial_score}    href="/dashboard/commercial" />
        <ScorePill label="Operasyon" score={report.operations.operations_score}   href="/dashboard/operations" />
        <ScorePill label="Ortaklar" score={report.partners.partners_score}        href="/dashboard/partners" />
      </div>

      {/* Alerts + Positives */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

        {/* Alerts */}
        {report.top_alerts.length > 0 && (
          <div>
            <div className="text-[0.6rem] font-bold uppercase tracking-wider text-[#94a3b8] mb-1.5">
              Uyarılar
            </div>
            <ul className="space-y-1">
              {report.top_alerts.map((a, i) => (
                <li key={i} className="flex items-start gap-1.5">
                  <span className={`mt-0.5 inline-block w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                    a.severity === 'critical' ? 'bg-red-500' : 'bg-amber-500'
                  }`} />
                  <Link
                    href={AREA_CONFIG[a.area]?.href ?? '#'}
                    className="text-[0.7rem] text-[#334155] hover:text-[#0f172a] hover:underline leading-snug"
                  >
                    {a.message}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Positives */}
        {report.top_positives.length > 0 && (
          <div>
            <div className="text-[0.6rem] font-bold uppercase tracking-wider text-[#94a3b8] mb-1.5">
              Olumlu Sinyaller
            </div>
            <ul className="space-y-1">
              {report.top_positives.map((p, i) => (
                <li key={i} className="flex items-start gap-1.5">
                  <span className="mt-0.5 inline-block w-1.5 h-1.5 rounded-full flex-shrink-0 bg-emerald-500" />
                  <Link
                    href={AREA_CONFIG[p.area]?.href ?? '#'}
                    className="text-[0.7rem] text-[#334155] hover:text-[#0f172a] hover:underline leading-snug"
                  >
                    {p.message}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Footer: quick links */}
      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-3 pt-2 border-t border-white/50">
        <span className="text-[0.6rem] text-[#94a3b8]">Detay:</span>
        {Object.entries(AREA_CONFIG).map(([, cfg]) => (
          <Link
            key={cfg.href}
            href={cfg.href}
            className="text-[0.6rem] font-semibold text-brand-light hover:text-brand whitespace-nowrap"
          >
            {cfg.label} →
          </Link>
        ))}
      </div>

    </div>
  )
}
