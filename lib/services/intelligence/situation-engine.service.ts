// ─────────────────────────────────────────────────────────────────────────────
// lib/services/intelligence/situation-engine.service.ts
//
// CEO Situation Engine — Intelligence Layer
//
// Computes a single composite situation score (0-100) and generates the CEO's
// daily "situation line" (Turkish narrative). This is the core intelligence
// layer of the Flowra Situation Engine from the blueprint.
//
// All computation functions are PURE (no side effects, no DB access).
// Data assembly is done by the caller (API route) and passed as SituationInput.
// ─────────────────────────────────────────────────────────────────────────────

import { round2 } from '@/lib/calc'

// ── Input / Output Types ──────────────────────────────────────────────────────

export interface SituationInput {
  cash_runway_months: number | null
  net_margin_pct: number | null
  dsr: number | null              // debt service ratio 0-1
  overdue_ratio: number | null    // overdue receivables / total receivables 0-1
  max_burden_score: number | null // max |burden| from partner equalization
}

export interface SituationComponent {
  key: 'cash' | 'profit' | 'debt' | 'receivables' | 'partner'
  label: string         // Turkish
  score: number         // 0-100
  weight: number        // 0.30, 0.25, etc.
  weighted_score: number
  input_value: number | null
  input_label: string   // e.g. "8 ay runway", "%12 net marj"
}

export interface SituationReport {
  company_id: string
  composite_score: number     // 0-100 weighted average
  status: 'healthy' | 'caution' | 'at_risk' | 'critical'
  status_label: string        // Turkish
  status_color: string        // 'green' | 'yellow' | 'orange' | 'red'
  situation_line: string      // Full Turkish situation narrative
  components: SituationComponent[]
  top_concern: SituationComponent   // lowest weighted_score component
  computed_at: string
}

// ── Constants ─────────────────────────────────────────────────────────────────

const WEIGHTS = {
  cash:        0.30,
  profit:      0.25,
  debt:        0.20,
  receivables: 0.15,
  partner:     0.10,
} as const

const STATUS_LABELS: Record<SituationReport['status'], string> = {
  healthy:  'sağlıklı',
  caution:  'dikkat gerektiriyor',
  at_risk:  'risk altında',
  critical: 'kritik durumda',
}

const STATUS_COLORS: Record<SituationReport['status'], string> = {
  healthy:  'green',
  caution:  'yellow',
  at_risk:  'orange',
  critical: 'red',
}

// ── Pure Score Functions ───────────────────────────────────────────────────────

/**
 * Cash score: min(100, runway_months × 10)
 * 10 months = perfect 100. null → neutral 50.
 */
export function computeCashScore(runwayMonths: number | null): number {
  if (runwayMonths === null) return 50
  return Math.max(0, Math.min(100, runwayMonths * 10))
}

/**
 * Profit score: net_margin_pct × 2 + 50
 * 25% margin = 100 pts, 0% = 50, -25% = 0. null → neutral 50.
 */
export function computeProfitScore(netMarginPct: number | null): number {
  if (netMarginPct === null) return 50
  return Math.max(0, Math.min(100, netMarginPct * 2 + 50))
}

/**
 * Debt score: 100 - (dsr × 100)
 * DSR 0 = 100 pts; DSR 1 = 0 pts. null → 100 (no debt = healthy).
 */
export function computeDebtScore(dsr: number | null): number {
  if (dsr === null) return 100
  return Math.max(0, Math.min(100, 100 - dsr * 100))
}

/**
 * Receivables score: 100 - (overdue_ratio × 100)
 * 0 overdue = 100, all overdue = 0. null → neutral 50.
 */
export function computeReceivablesScore(overdueRatio: number | null): number {
  if (overdueRatio === null) return 50
  return Math.max(0, Math.min(100, 100 - overdueRatio * 100))
}

/**
 * Partner score: 100 - max(|burden_score|) × 200
 * 0 burden = 100, |burden| ≥ 0.5 = 0. null → neutral 50.
 */
export function computePartnerScore(maxBurdenScore: number | null): number {
  if (maxBurdenScore === null) return 50
  return Math.max(0, Math.min(100, 100 - Math.abs(maxBurdenScore) * 200))
}

/**
 * Composite score: Σ (component.weighted_score)
 * Sum of all weighted scores, rounded to 2 decimal places.
 */
export function computeCompositeScore(components: SituationComponent[]): number {
  return round2(components.reduce((sum, c) => sum + c.weighted_score, 0))
}

/**
 * Classify composite score into status tier.
 * ≥80: healthy, ≥60: caution, ≥40: at_risk, <40: critical
 */
export function classifySituation(compositeScore: number): SituationReport['status'] {
  if (compositeScore >= 80) return 'healthy'
  if (compositeScore >= 60) return 'caution'
  if (compositeScore >= 40) return 'at_risk'
  return 'critical'
}

/**
 * Build Turkish situation narrative.
 * Template: "Şirket [status_label] seyrediyor — [top concern description]"
 */
export function buildSituationLine(
  status: string,
  topConcern: SituationComponent,
): string {
  const statusLabelMap: Record<string, string> = {
    healthy:  'sağlıklı',
    caution:  'dikkat gerektiriyor',
    at_risk:  'risk altında',
    critical: 'kritik durumda',
  }
  const label = statusLabelMap[status] ?? status

  let concernDesc: string
  switch (topConcern.key) {
    case 'cash':
      concernDesc = topConcern.input_value !== null
        ? `nakit ${round2(topConcern.input_value)} ay runway`
        : 'nakit durumu belirsiz'
      break
    case 'profit':
      concernDesc = topConcern.input_value !== null
        ? `net marj %${round2(topConcern.input_value)}`
        : 'kârlılık verisi yok'
      break
    case 'debt':
      concernDesc = 'borç servisi yükümlülüğü yüksek'
      break
    case 'receivables':
      concernDesc = topConcern.input_value !== null
        ? `alacakların %${round2(topConcern.input_value * 100)}'i vadesi geçmiş`
        : 'alacak tahsilat riski mevcut'
      break
    case 'partner':
      concernDesc = 'ortak finansman dengesizliği'
      break
    default:
      concernDesc = 'genel finansal sağlık iyi'
  }

  return `Şirket ${label} seyrediyor — ${concernDesc}`
}

// ── Component Builder ─────────────────────────────────────────────────────────

function buildComponents(input: SituationInput): SituationComponent[] {
  const cashScore        = round2(computeCashScore(input.cash_runway_months))
  const profitScore      = round2(computeProfitScore(input.net_margin_pct))
  const debtScore        = round2(computeDebtScore(input.dsr))
  const receivablesScore = round2(computeReceivablesScore(input.overdue_ratio))
  const partnerScore     = round2(computePartnerScore(input.max_burden_score))

  return [
    {
      key:           'cash',
      label:         'Nakit Durumu',
      score:         cashScore,
      weight:        WEIGHTS.cash,
      weighted_score: round2(cashScore * WEIGHTS.cash),
      input_value:   input.cash_runway_months,
      input_label:   input.cash_runway_months !== null
        ? `${round2(input.cash_runway_months)} ay runway`
        : 'Veri yok',
    },
    {
      key:           'profit',
      label:         'Kârlılık',
      score:         profitScore,
      weight:        WEIGHTS.profit,
      weighted_score: round2(profitScore * WEIGHTS.profit),
      input_value:   input.net_margin_pct,
      input_label:   input.net_margin_pct !== null
        ? `%${round2(input.net_margin_pct)} net marj`
        : 'Veri yok',
    },
    {
      key:           'debt',
      label:         'Borç Yükü',
      score:         debtScore,
      weight:        WEIGHTS.debt,
      weighted_score: round2(debtScore * WEIGHTS.debt),
      input_value:   input.dsr,
      input_label:   input.dsr !== null
        ? `DSO: ${round2(input.dsr * 100)}%`
        : 'Borç yok',
    },
    {
      key:           'receivables',
      label:         'Alacak Tahsilatı',
      score:         receivablesScore,
      weight:        WEIGHTS.receivables,
      weighted_score: round2(receivablesScore * WEIGHTS.receivables),
      input_value:   input.overdue_ratio,
      input_label:   input.overdue_ratio !== null
        ? `%${round2(input.overdue_ratio * 100)} vadesi geçmiş`
        : 'Veri yok',
    },
    {
      key:           'partner',
      label:         'Ortak Dengesi',
      score:         partnerScore,
      weight:        WEIGHTS.partner,
      weighted_score: round2(partnerScore * WEIGHTS.partner),
      input_value:   input.max_burden_score,
      input_label:   input.max_burden_score !== null
        ? `Sapma: %${round2(Math.abs(input.max_burden_score) * 100)}`
        : 'Veri yok',
    },
  ]
}

// ── Main Assembler ────────────────────────────────────────────────────────────

/**
 * Assemble a full SituationReport from raw input data.
 * This is the main entry point for the API route.
 */
export function assembleSituationReport(
  companyId: string,
  input: SituationInput,
): SituationReport {
  const components     = buildComponents(input)
  const compositeScore = computeCompositeScore(components)
  const status         = classifySituation(compositeScore)

  // Top concern: component with lowest weighted_score
  const topConcern = [...components].sort((a, b) => a.weighted_score - b.weighted_score)[0]

  const situationLine = buildSituationLine(status, topConcern)

  return {
    company_id:      companyId,
    composite_score: compositeScore,
    status,
    status_label:    STATUS_LABELS[status],
    status_color:    STATUS_COLORS[status],
    situation_line:  situationLine,
    components,
    top_concern:     topConcern,
    computed_at:     new Date().toISOString(),
  }
}
