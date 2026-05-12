// ── DecisionCards — the executive agenda ─────────────────────────────────────
//
// The HERO element of the Executive Command Center.
// Answers: "What do I need to do TODAY?"
//
// Visual design:
//   • Each card: white bg + colored left border (4px) by urgency tier
//   • Tier badge: KRİTİK / DİKKAT / FIRSAT in a pill
//   • Detail line: key numbers at a glance
//   • Guidance line: specific recommended action
//   • Arrow CTA: links directly to the relevant page
//
// Empty state:
//   • When no decisions: a premium "all clear" state — rewards good management

import Link from 'next/link'
import type { Decision, DecisionTier } from '@/lib/finance/executive-summary'

// ── Config ────────────────────────────────────────────────────────────────────

const TIER_CONFIG: Record<DecisionTier, {
  border: string; bg: string; badge: string; badgeText: string
}> = {
  critical: {
    border:    'border-l-red-500',
    bg:        'bg-white hover:bg-red-50/40',
    badge:     'bg-red-100 text-red-700',
    badgeText: 'KRİTİK',
  },
  attention: {
    border:    'border-l-amber-400',
    bg:        'bg-white hover:bg-amber-50/40',
    badge:     'bg-amber-100 text-amber-700',
    badgeText: 'DİKKAT',
  },
  opportunity: {
    border:    'border-l-emerald-500',
    bg:        'bg-white hover:bg-emerald-50/30',
    badge:     'bg-emerald-100 text-emerald-700',
    badgeText: 'FIRSAT',
  },
  info: {
    border:    'border-l-gray-300',
    bg:        'bg-white hover:bg-gray-50/60',
    badge:     'bg-gray-100 text-gray-500',
    badgeText: 'BİLGİ',
  },
}

// ── All-clear state ───────────────────────────────────────────────────────────

function AllClear() {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[180px] bg-white border border-gray-100 rounded-2xl px-8 py-10 text-center">
      <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center mb-3">
        <svg className="w-6 h-6 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <div className="text-sm font-black text-gray-900 mb-1">Tüm Sistemler Nominal</div>
      <div className="text-xs text-gray-400 leading-relaxed max-w-[200px]">
        Bugün için kritik aksiyon bulunmuyor. Şirket sağlıklı görünüyor.
      </div>
    </div>
  )
}

// ── Single decision card ───────────────────────────────────────────────────────

function DecisionCard({ decision }: { decision: Decision }) {
  const cfg = TIER_CONFIG[decision.tier]

  return (
    <Link href={decision.href}
      className={`
        group flex items-start gap-3.5 px-4 py-3.5 rounded-xl
        border border-l-4 border-gray-100 ${cfg.border} ${cfg.bg}
        transition-all duration-150 hover:shadow-sm
      `}>

      {/* Icon */}
      <span className="text-xl flex-shrink-0 leading-none mt-0.5" aria-hidden>
        {decision.icon}
      </span>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Title row */}
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-xs font-black text-gray-900 leading-snug flex-1 min-w-0 truncate">
            {decision.title}
          </span>
          <span className={`flex-shrink-0 text-[9px] font-black px-1.5 py-0.5 rounded-full tracking-wide ${cfg.badge}`}>
            {cfg.badgeText}
          </span>
        </div>

        {/* Detail */}
        <p className="text-[11px] text-gray-600 font-medium leading-snug">
          {decision.detail}
        </p>

        {/* Guidance */}
        <p className="text-[10px] text-gray-400 mt-0.5 leading-snug italic">
          {decision.guidance}
        </p>
      </div>

      {/* Arrow */}
      <span className="flex-shrink-0 text-gray-300 group-hover:text-gray-500 text-sm mt-0.5 transition-colors">
        →
      </span>
    </Link>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  decisions:     Decision[]
  decisionCount: number   // total before slice (for "+N more" badge)
}

export function DecisionCards({ decisions, decisionCount }: Props) {
  const hasCritical = decisions.some(d => d.tier === 'critical')

  return (
    <div className="flex flex-col h-full">

      {/* Header */}
      <div className="flex items-center gap-2 mb-2.5 px-0.5">
        <span className="text-[10px] font-black uppercase tracking-[0.14em] text-gray-400">
          Gündem
        </span>
        {decisions.length > 0 && (
          <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${
            hasCritical
              ? 'bg-red-100 text-red-600'
              : 'bg-amber-100 text-amber-600'
          }`}>
            {decisions.length}
          </span>
        )}
        {decisionCount > decisions.length && (
          <span className="text-[9px] text-gray-400 font-semibold ml-auto">
            +{decisionCount - decisions.length} daha
          </span>
        )}
      </div>

      {/* Cards */}
      {decisions.length === 0 ? (
        <AllClear />
      ) : (
        <div className="flex flex-col gap-2">
          {decisions.map((d, i) => (
            <DecisionCard key={i} decision={d} />
          ))}
        </div>
      )}
    </div>
  )
}
