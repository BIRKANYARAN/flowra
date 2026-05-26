// ── SituationLine — Full-width executive status banner ────────────────────────
//
// Displays: status dot + composite score | situation narrative | alert badges
// Server-compatible (no hooks) — pass pre-computed props.
// Colors: healthy=emerald, caution=amber, at-risk=orange, critical=red

export interface SituationLineProps {
  status:        'healthy' | 'caution' | 'at-risk' | 'critical'
  composite:     number       // 0-100
  situationLine: string       // Turkish narrative
  criticalCount: number
  warningCount:  number
}

const STATUS_CONFIG = {
  healthy:   { bg: 'bg-emerald-50',  border: 'border-emerald-200', dot: 'bg-emerald-500', label: 'Sağlıklı',   labelColor: 'text-emerald-700', scoreColor: 'text-emerald-700' },
  caution:   { bg: 'bg-amber-50',    border: 'border-amber-200',   dot: 'bg-amber-500',   label: 'Dikkat',     labelColor: 'text-amber-700',   scoreColor: 'text-amber-700'   },
  'at-risk': { bg: 'bg-orange-50',   border: 'border-orange-200',  dot: 'bg-orange-500',  label: 'Riskli',     labelColor: 'text-orange-700',  scoreColor: 'text-orange-700'  },
  critical:  { bg: 'bg-red-50',      border: 'border-red-200',     dot: 'bg-red-500',     label: 'Kritik',     labelColor: 'text-red-700',     scoreColor: 'text-red-700'     },
}

export function SituationLine({
  status,
  composite,
  situationLine,
  criticalCount,
  warningCount,
}: SituationLineProps) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG['caution']

  return (
    <div className={`w-full flex items-center gap-4 px-4 py-3 rounded border ${cfg.bg} ${cfg.border}`}>

      {/* Left: status indicator + composite score */}
      <div className="flex items-center gap-2 shrink-0">
        <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />
        <span className={`text-xs font-black ${cfg.labelColor}`}>
          {cfg.label}
        </span>
        <span className={`text-xs font-black tabular-nums ${cfg.scoreColor}`}>
          — {composite}
        </span>
      </div>

      {/* Center: situation narrative */}
      <p className="flex-1 text-xs font-medium text-[#0f172a] leading-snug min-w-0 truncate">
        {situationLine}
      </p>

      {/* Right: alert badge pills */}
      {(criticalCount > 0 || warningCount > 0) && (
        <div className="flex items-center gap-1.5 shrink-0">
          {criticalCount > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 border border-red-200 text-[10px] font-black text-red-700 tabular-nums whitespace-nowrap">
              <span className="w-1 h-1 rounded-full bg-red-500" />
              {criticalCount} kritik
            </span>
          )}
          {warningCount > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 border border-amber-200 text-[10px] font-black text-amber-700 tabular-nums whitespace-nowrap">
              <span className="w-1 h-1 rounded-full bg-amber-500" />
              {warningCount} uyarı
            </span>
          )}
        </div>
      )}
    </div>
  )
}
