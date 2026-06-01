// ── computeHealthScore — extracted verbatim from CFOTab.tsx ───────────────────
// Pure financial-health scoring (0-100). No imports; now independently testable.

export function computeHealthScore(metrics: {
  grossMarginPct:    number
  netMarginPct:      number
  runwayMonths:      number | null
  debtToEquity:      number
  collectionRatePct: number
}): { score: number; grade: 'A' | 'B' | 'C' | 'D' | 'F' } {
  let score = 0

  if (metrics.grossMarginPct >= 30)      score += 25
  else if (metrics.grossMarginPct >= 15) score += 15
  else if (metrics.grossMarginPct >= 0)  score += 5

  if (metrics.netMarginPct >= 10)      score += 20
  else if (metrics.netMarginPct >= 5)  score += 12
  else if (metrics.netMarginPct >= 0)  score += 5

  const r = metrics.runwayMonths
  if (r === null || r > 18)     score += 25
  else if (r >= 6)              score += 18
  else if (r >= 3)              score += 10

  if (metrics.debtToEquity <= 0.5)    score += 15
  else if (metrics.debtToEquity <= 1) score += 10
  else if (metrics.debtToEquity <= 2) score += 5

  if (metrics.collectionRatePct >= 85)      score += 15
  else if (metrics.collectionRatePct >= 60) score += 8
  else if (metrics.collectionRatePct >= 0)  score += 3

  const grade: 'A' | 'B' | 'C' | 'D' | 'F' =
    score >= 85 ? 'A' :
    score >= 70 ? 'B' :
    score >= 55 ? 'C' :
    score >= 40 ? 'D' : 'F'

  return { score, grade }
}
