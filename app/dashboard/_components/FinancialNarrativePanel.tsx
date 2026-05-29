'use client'

// ─────────────────────────────────────────────────────────────────────────────
// FinancialNarrativePanel — Financial Narrative Engine UI
//
// Displays a full Turkish financial narrative summary:
//   - Headline (colored by sentiment)
//   - Executive summary paragraph
//   - Key numbers strip (4 columns)
//   - Collapsible section cards (revenue, expenses, cash, receivables, partners)
//
// Data source: GET /api/intelligence/narrative?context=ceo_summary (5-min cache)
// ─────────────────────────────────────────────────────────────────────────────

import { useState }   from 'react'
import { useQuery }   from '@tanstack/react-query'
import type {
  FinancialNarrative,
  NarrativeContext,
  NarrativeSection,
} from '@/lib/services/intelligence/financial-narrative.service'

// ── Sentiment colors ──────────────────────────────────────────────────────────

const SENTIMENT_COLORS: Record<NarrativeSection['sentiment'], {
  headline: string
  badge:    string
  border:   string
  dot:      string
}> = {
  positive: {
    headline: 'text-emerald-700',
    badge:    'bg-emerald-100 text-emerald-800 border-emerald-200',
    border:   'border-emerald-200',
    dot:      'bg-emerald-500',
  },
  negative: {
    headline: 'text-red-700',
    badge:    'bg-red-100 text-red-800 border-red-200',
    border:   'border-red-200',
    dot:      'bg-red-500',
  },
  mixed: {
    headline: 'text-amber-700',
    badge:    'bg-amber-100 text-amber-800 border-amber-200',
    border:   'border-amber-200',
    dot:      'bg-amber-500',
  },
  neutral: {
    headline: 'text-slate-700',
    badge:    'bg-slate-100 text-slate-700 border-slate-200',
    border:   'border-slate-200',
    dot:      'bg-slate-400',
  },
}

const PRIORITY_LABEL: Record<NarrativeSection['priority'], string> = {
  critical: 'Kritik',
  high:     'Yüksek',
  medium:   'Orta',
  low:      'Düşük',
}

const SENTIMENT_LABEL: Record<NarrativeSection['sentiment'], string> = {
  positive: 'Olumlu',
  negative: 'Olumsuz',
  mixed:    'Karma',
  neutral:  'Nötr',
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse bg-slate-100 rounded ${className}`} />
}

// ── EmptySlate ────────────────────────────────────────────────────────────────

function EmptySlate({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center py-8">
      <p className="text-xs text-slate-400">{message}</p>
    </div>
  )
}

// ── Key Number card ───────────────────────────────────────────────────────────

interface KeyNumberCardProps {
  label: string
  value: string
  change_description: string
  is_positive: boolean
}

function KeyNumberCard({ label, value, change_description, is_positive }: KeyNumberCardProps) {
  return (
    <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
      <div className="text-[0.6rem] font-bold uppercase tracking-wider text-slate-400 mb-1">
        {label}
      </div>
      <div className={`text-lg font-black tabular-nums leading-tight ${is_positive ? 'text-slate-900' : 'text-red-700'}`}>
        {value}
      </div>
      <div className="text-[0.65rem] text-slate-500 mt-0.5 leading-snug">
        {change_description}
      </div>
    </div>
  )
}

// ── Section card (collapsible) ────────────────────────────────────────────────

interface SectionCardProps {
  section: NarrativeSection
}

function SectionCard({ section }: SectionCardProps) {
  const [open, setOpen] = useState(false)
  const colors = SENTIMENT_COLORS[section.sentiment]

  return (
    <div className={`rounded-lg border ${colors.border} bg-white overflow-hidden`}>
      {/* Header — always visible, clickable */}
      <button
        type="button"
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors text-left"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${colors.dot}`} />
          <span className="text-sm font-semibold text-slate-800 truncate">{section.title}</span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 ml-2">
          <span className={`text-[0.6rem] font-bold px-1.5 py-0.5 rounded border ${colors.badge}`}>
            {SENTIMENT_LABEL[section.sentiment]}
          </span>
          <span className="text-[0.6rem] font-bold text-slate-400">
            {PRIORITY_LABEL[section.priority]}
          </span>
          <span className={`text-slate-400 text-xs transition-transform ${open ? 'rotate-180' : ''}`}>
            ▾
          </span>
        </div>
      </button>

      {/* Body — shown when open */}
      {open && (
        <div className="px-4 pb-4 border-t border-slate-100">
          <p className="text-sm text-slate-700 mt-3 leading-relaxed">
            {section.narrative}
          </p>
          {section.highlights.length > 0 && (
            <ul className="mt-2 space-y-1">
              {section.highlights.map((h, i) => (
                <li key={i} className="flex items-start gap-1.5">
                  <span className="mt-1.5 inline-block w-1 h-1 rounded-full bg-slate-400 flex-shrink-0" />
                  <span className="text-xs text-slate-600">{h}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main panel ────────────────────────────────────────────────────────────────

interface FinancialNarrativePanelProps {
  companyId: string
  context?:  NarrativeContext
}

export function FinancialNarrativePanel({
  companyId,
  context = 'ceo_summary',
}: FinancialNarrativePanelProps) {
  const { data, isLoading, isError } = useQuery<{ narrative: FinancialNarrative }>({
    queryKey:  ['financial-narrative', companyId, context],
    queryFn:   () => fetch(`/api/intelligence/narrative?context=${context}`).then(r => r.json()),
    staleTime: 5 * 60 * 1000,
    retry:     1,
  })

  // ── Loading state ────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
        <Skeleton className="h-3 w-24 mb-4" />
        <Skeleton className="h-5 w-full mb-2" />
        <Skeleton className="h-4 w-3/4 mb-4" />
        <div className="grid grid-cols-4 gap-3 mb-4">
          {[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-16" />)}
        </div>
        <div className="space-y-2">
          {[0, 1, 2].map(i => <Skeleton key={i} className="h-10" />)}
        </div>
      </div>
    )
  }

  // ── Error / empty state ──────────────────────────────────────────────────────
  if (isError || !data?.narrative) {
    return (
      <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
        <div className="text-[0.65rem] font-black uppercase tracking-widest text-slate-400 mb-2">
          Finansal Özet
        </div>
        <EmptySlate message="Finansal özet yüklenemedi." />
      </div>
    )
  }

  const { narrative } = data

  // Determine overall headline sentiment from sections
  const hasCritical  = narrative.sections.some(s => s.priority === 'critical')
  const hasNegative  = narrative.sections.some(s => s.sentiment === 'negative')
  const hasPositive  = narrative.sections.some(s => s.sentiment === 'positive')
  const overallSent: NarrativeSection['sentiment'] =
    hasCritical || hasNegative ? 'negative' :
    hasPositive                 ? 'positive' :
    'neutral'
  const headlineColors = SENTIMENT_COLORS[overallSent]

  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">

      {/* Panel header */}
      <div className="px-4 pt-4 pb-3 border-b border-slate-100">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[0.65rem] font-black uppercase tracking-widest text-slate-400">
            Finansal Özet
          </span>
          <span className="text-[0.6rem] text-slate-400">
            {narrative.period}
          </span>
        </div>

        {/* Headline */}
        <h2 className={`text-sm font-semibold leading-snug ${headlineColors.headline}`}>
          {narrative.headline}
        </h2>
      </div>

      {/* Executive summary */}
      <div className="px-4 py-3 border-b border-slate-100">
        <p className="text-xs text-slate-600 leading-relaxed">
          {narrative.executive_summary}
        </p>
      </div>

      {/* Key numbers strip */}
      {narrative.key_numbers.length > 0 && (
        <div className="px-4 py-3 border-b border-slate-100">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {narrative.key_numbers.map((kn, i) => (
              <KeyNumberCard
                key={i}
                label={kn.label}
                value={kn.value}
                change_description={kn.change_description}
                is_positive={kn.is_positive}
              />
            ))}
          </div>
        </div>
      )}

      {/* Sections */}
      {narrative.sections.length > 0 ? (
        <div className="px-4 py-3 space-y-2">
          {narrative.sections.map(section => (
            <SectionCard key={section.section_id} section={section} />
          ))}
        </div>
      ) : (
        <EmptySlate message="Bölüm verisi bulunamadı." />
      )}

      {/* Footer */}
      <div className="px-4 pb-3 pt-1 border-t border-slate-100">
        <p className="text-[0.6rem] text-slate-400">
          Oluşturulma: {new Date(narrative.generated_at).toLocaleString('tr-TR')}
        </p>
      </div>
    </div>
  )
}
