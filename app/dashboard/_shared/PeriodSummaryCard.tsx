'use client'

// ─────────────────────────────────────────────────────────────────────────────
// PeriodSummaryCard — "Dönem Özeti" for CEO Cockpit
//
// Displays the Financial Narrative Engine output as a financial brief.
// Think: a brief from a CFO to a CEO — factual, precise, left-aligned.
//
// Headline is shown prominently.
// 4 section paragraphs are collapsible (default: collapsed).
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react'
import type { FinancialNarrative } from '@/lib/services/intelligence/narrative.service'

const STATUS_COLORS = {
  healthy:   { border: 'border-pos',      badge: 'bg-pos-light text-pos-text' },
  caution:   { border: 'border-warn',     badge: 'bg-warn-light text-warn-text' },
  'at-risk': { border: 'border-orange-400', badge: 'bg-orange-50 text-orange-700' },
  critical:  { border: 'border-neg',      badge: 'bg-neg-light text-neg-text' },
}

const STATUS_LABELS = {
  healthy:   'Sağlıklı',
  caution:   'Dikkat',
  'at-risk': 'Risk',
  critical:  'Kritik',
}

const SECTION_LABELS = {
  performance: 'Performans',
  liquidity:   'Likidite',
  risk:        'Risk',
  outlook:     'Görünüm',
}

export function PeriodSummaryCard({ narrative }: { narrative: FinancialNarrative }) {
  const [openSection, setOpenSection] = useState<string | null>(null)

  const colors = STATUS_COLORS[narrative.situation_status] ?? STATUS_COLORS.caution

  const toggleSection = (key: string) => {
    setOpenSection(prev => prev === key ? null : key)
  }

  const generatedAt = (() => {
    try {
      return new Date(narrative.generated_at).toLocaleString('tr-TR', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      })
    } catch {
      return narrative.generated_at
    }
  })()

  return (
    <div className={`bg-white border ${colors.border} rounded shadow-sm overflow-hidden`}>
      {/* ── Header bar ───────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-[#e2e8f0] bg-[#f8fafc]">
        <div className="flex items-center gap-2">
          <span className="text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8]">
            Dönem Özeti
          </span>
          <span className="text-[0.6rem] text-[#94a3b8]">—</span>
          <span className="text-[0.6rem] font-semibold text-[#475569]">
            {narrative.period_label}
          </span>
        </div>
        <span className={`text-[0.55rem] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide ${colors.badge}`}>
          {STATUS_LABELS[narrative.situation_status]}
        </span>
      </div>

      {/* ── Headline ─────────────────────────────────────────────────────── */}
      <div className="px-4 py-3 border-b border-[#f1f5f9]">
        <p className="text-[0.8rem] font-semibold text-[#0f172a] leading-relaxed font-mono">
          {narrative.headline}
        </p>
      </div>

      {/* ── Expandable sections ───────────────────────────────────────────── */}
      <div className="divide-y divide-[#f1f5f9]">
        {(Object.keys(narrative.sections) as Array<keyof typeof narrative.sections>).map(key => {
          const isOpen = openSection === key
          return (
            <div key={key}>
              <button
                onClick={() => toggleSection(key)}
                className="w-full flex items-center justify-between px-4 py-2 text-left hover:bg-[#f8fafc] transition-colors"
              >
                <span className="text-[0.65rem] font-bold uppercase tracking-widest text-[#64748b]">
                  {SECTION_LABELS[key]}
                </span>
                <span className="text-[0.65rem] text-[#94a3b8] ml-2">
                  {isOpen ? '▲' : '▼'}
                </span>
              </button>
              {isOpen && (
                <div className="px-4 pb-3">
                  <p className="text-[0.72rem] text-[#334155] leading-relaxed font-mono whitespace-pre-wrap">
                    {narrative.sections[key]}
                  </p>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* ── Footer timestamp ─────────────────────────────────────────────── */}
      <div className="px-4 py-2 bg-[#f8fafc] border-t border-[#f1f5f9]">
        <span className="text-[0.55rem] text-[#94a3b8] tabular-nums">
          Oluşturuldu: {generatedAt}
        </span>
      </div>
    </div>
  )
}
