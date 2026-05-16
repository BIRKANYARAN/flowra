// Situation Engine — weighted composite financial health scoring
// Pure function, no DB access. All inputs are pre-computed by the caller.

import { round2 } from '@/lib/calc'

export type SituationStatus = 'healthy' | 'caution' | 'at-risk' | 'critical'

export interface SituationInputs {
  // Cash dimension (weight 0.30)
  cashRunwayMonths: number        // months of runway at current burn rate (0 if profitable)
  isProfitable:     boolean

  // Profit dimension (weight 0.25)
  netMarginPct:     number        // 0-1 scale (e.g. 0.15 = 15%)

  // Debt dimension (weight 0.20)
  debtServiceRatio: number        // monthly debt service / monthly net income (0 if no debt)

  // Receivables dimension (weight 0.15)
  overdueRatioPct:  number        // overdue receivables / total receivables (0-100)

  // Partner dimension (weight 0.10)
  maxBurdenScoreAbs: number       // absolute value of worst partner burden score (0-1 scale)
}

export interface SituationResult {
  status:          SituationStatus
  composite:       number         // 0-100
  situationLine:   string         // Turkish one-liner for CEO
  criticalFactor:  string         // what drove the score down
  scores: {
    cash:        number
    profit:      number
    debt:        number
    receivables: number
    partner:     number
  }
}

const WEIGHTS = {
  cash:        0.30,
  profit:      0.25,
  debt:        0.20,
  receivables: 0.15,
  partner:     0.10,
}

function cashScore(inputs: SituationInputs): number {
  if (inputs.isProfitable) return 100
  // Unprofitable: 10 months runway = 100, 0 months = 0
  return Math.max(0, Math.min(100, inputs.cashRunwayMonths * 10))
}

function profitScore(inputs: SituationInputs): number {
  // net_margin: 25% margin = 100 pts, 0% = 50, -25% = 0
  const raw = inputs.netMarginPct * 100
  return Math.max(0, Math.min(100, raw * 2 + 50))
}

function debtScore(inputs: SituationInputs): number {
  // DSR 0 = 100 pts, DSR 1.0+ = 0 pts
  return Math.max(0, Math.min(100, 100 - inputs.debtServiceRatio * 100))
}

function receivablesScore(inputs: SituationInputs): number {
  // 0% overdue = 100, 100% overdue = 0
  return Math.max(0, Math.min(100, 100 - inputs.overdueRatioPct))
}

function partnerScore(inputs: SituationInputs): number {
  // |burden| 0 = 100, |burden| 0.5+ = 0
  return Math.max(0, Math.min(100, 100 - inputs.maxBurdenScoreAbs * 200))
}

function statusFromComposite(composite: number): SituationStatus {
  if (composite >= 80) return 'healthy'
  if (composite >= 60) return 'caution'
  if (composite >= 40) return 'at-risk'
  return 'critical'
}

const STATUS_LABELS: Record<SituationStatus, string> = {
  healthy:  'sağlıklı seyrediyor',
  caution:  'dikkat gerektiriyor',
  'at-risk': 'risk altında',
  critical: 'kritik durumda',
}

function deriveCriticalFactor(
  inputs: SituationInputs,
  scores: SituationResult['scores'],
): string {
  const dims = [
    { key: 'cash',        score: scores.cash,        weight: WEIGHTS.cash },
    { key: 'profit',      score: scores.profit,      weight: WEIGHTS.profit },
    { key: 'debt',        score: scores.debt,        weight: WEIGHTS.debt },
    { key: 'receivables', score: scores.receivables, weight: WEIGHTS.receivables },
    { key: 'partner',     score: scores.partner,     weight: WEIGHTS.partner },
  ]
  const worst = dims.sort((a, b) => (a.score * a.weight) - (b.score * b.weight))[0]

  switch (worst.key) {
    case 'cash':
      return inputs.isProfitable
        ? 'Nakit pozisyonu güçlü'
        : `Nakit yaklaşık ${Math.round(inputs.cashRunwayMonths)} ay yeter`
    case 'profit':
      return inputs.netMarginPct < 0
        ? `Zarar marjı: %${Math.abs(round2(inputs.netMarginPct * 100))}`
        : `Net marj düşük: %${round2(inputs.netMarginPct * 100)}`
    case 'debt':
      return `Borç servis oranı yüksek: ${round2(inputs.debtServiceRatio * 100)}%`
    case 'receivables':
      return `Vadesi geçmiş alacak oranı: %${round2(inputs.overdueRatioPct)}`
    case 'partner':
      return `Ortak dengesizliği: skor ${round2(inputs.maxBurdenScoreAbs * 100)}`
    default:
      return 'Genel finansal sağlık'
  }
}

export function computeSituation(inputs: SituationInputs): SituationResult {
  const scores = {
    cash:        round2(cashScore(inputs)),
    profit:      round2(profitScore(inputs)),
    debt:        round2(debtScore(inputs)),
    receivables: round2(receivablesScore(inputs)),
    partner:     round2(partnerScore(inputs)),
  }

  const composite = round2(
    scores.cash        * WEIGHTS.cash        +
    scores.profit      * WEIGHTS.profit      +
    scores.debt        * WEIGHTS.debt        +
    scores.receivables * WEIGHTS.receivables +
    scores.partner     * WEIGHTS.partner,
  )

  const status         = statusFromComposite(composite)
  const criticalFactor = deriveCriticalFactor(inputs, scores)
  const situationLine  = `Şirket ${STATUS_LABELS[status]} — ${criticalFactor}`

  return { status, composite, situationLine, criticalFactor, scores }
}
