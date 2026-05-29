// ═══════════════════════════════════════════════════════════════════════════════
// lib/services/finance/ccc-scorecard.service.ts
//
// Cash Conversion Cycle (CCC) Efficiency Scorecard
//
// Combines DSO, DPO, DIO into a single efficiency rating (0–100),
// tracks improvement over 6 months, and benchmarks against Turkish SME norms:
//   DSO benchmark: 30 days
//   DPO benchmark: 45 days
//   DIO benchmark: 30 days
//   CCC benchmark: DSO + DIO − DPO = 30 + 30 − 45 = 15 days
//
// Scoring curves:
//   DSO: lower = better  (0d→100, 30d→80, 60d→60, 90d→40, 120+d→20)
//   DPO: higher = better (0d→0, 30d→40, 45d→70, 60d→90, 90+d→100)
//   DIO: lower = better  (same curve as DSO)
//
// Weighted composite: 40% DSO + 30% DPO + 30% DIO
// ═══════════════════════════════════════════════════════════════════════════════

import type { SupabaseClient } from '@supabase/supabase-js'
import { WorkingCapitalService } from './working-capital.service'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CccScorecardPeriod {
  period_key: string
  period_label: string
  dso_days: number | null
  dpo_days: number | null
  dio_days: number | null
  ccc_days: number | null
  dso_score: number
  dpo_score: number
  dio_score: number
  efficiency_score: number
  benchmark_delta: number | null
}

export interface CccScorecardReport {
  current_period: CccScorecardPeriod
  periods: CccScorecardPeriod[]           // last 6 months, newest first
  overall_efficiency_score: number        // current period score
  efficiency_grade: 'A' | 'B' | 'C' | 'D' | 'F'  // A≥80/B≥65/C≥50/D≥35/F<35
  benchmark_dso: number                   // 30
  benchmark_dpo: number                   // 45
  benchmark_dio: number                   // 30
  benchmark_ccc: number                   // 15
  trend: 'improving' | 'stable' | 'deteriorating' | 'insufficient_data'
  worst_component: 'dso' | 'dpo' | 'dio' | null   // component with lowest score
  improvement_potential_days: number      // max(0, actual_ccc - benchmark_ccc)
}

// ── Benchmarks ────────────────────────────────────────────────────────────────

export const CCC_BENCHMARKS = {
  dso: 30,
  dpo: 45,
  dio: 30,
  ccc: 15,   // 30 + 30 − 45
} as const

// ── Pure scoring functions ─────────────────────────────────────────────────────

/**
 * Compute DSO score (0–100): lower DSO = better.
 * Breakpoints: 0d→100, 30d→80, 60d→60, 90d→40, 120+d→20.
 * Linear interpolation between breakpoints.
 */
export function computeDsoScore(dsoDays: number): number {
  if (dsoDays <= 0)   return 100
  if (dsoDays >= 120) return 20

  // Piecewise linear interpolation
  const breakpoints: [number, number][] = [
    [0,   100],
    [30,   80],
    [60,   60],
    [90,   40],
    [120,  20],
  ]

  for (let i = 0; i < breakpoints.length - 1; i++) {
    const [x0, y0] = breakpoints[i]!
    const [x1, y1] = breakpoints[i + 1]!
    if (dsoDays >= x0 && dsoDays <= x1) {
      const t = (dsoDays - x0) / (x1 - x0)
      return Math.round(y0 + t * (y1 - y0))
    }
  }

  return 20
}

/**
 * Compute DPO score (0–100): higher DPO = better (more cash retained).
 * Breakpoints: 0d→0, 30d→40, 45d→70, 60d→90, 90+d→100.
 * Linear interpolation between breakpoints.
 */
export function computeDpoScore(dpoDays: number): number {
  if (dpoDays <= 0)  return 0
  if (dpoDays >= 90) return 100

  const breakpoints: [number, number][] = [
    [0,    0],
    [30,  40],
    [45,  70],
    [60,  90],
    [90, 100],
  ]

  for (let i = 0; i < breakpoints.length - 1; i++) {
    const [x0, y0] = breakpoints[i]!
    const [x1, y1] = breakpoints[i + 1]!
    if (dpoDays >= x0 && dpoDays <= x1) {
      const t = (dpoDays - x0) / (x1 - x0)
      return Math.round(y0 + t * (y1 - y0))
    }
  }

  return 100
}

/**
 * Compute DIO score (0–100): lower DIO = better.
 * Same curve as DSO: 0d→100, 30d→80, 60d→60, 90d→40, 120+d→20.
 */
export function computeDioScore(dioDays: number): number {
  return computeDsoScore(dioDays)
}

/**
 * Compute CCC efficiency score: 40% DSO + 30% DPO + 30% DIO.
 * All inputs should be 0–100 scores.
 */
export function computeCccEfficiencyScore(
  dsoScore: number,
  dpoScore: number,
  dioScore: number,
): number {
  return Math.round(dsoScore * 0.4 + dpoScore * 0.3 + dioScore * 0.3)
}

/**
 * Compute CCC vs benchmark delta.
 * Positive = CCC worse than benchmark (bad).
 * Negative = CCC better than benchmark (good).
 * Default benchmark: 15 days (DSO=30 + DIO=30 − DPO=45).
 */
export function computeCccBenchmarkDelta(
  actualCccDays: number,
  benchmarkCccDays: number = CCC_BENCHMARKS.ccc,
): number {
  return Math.round((actualCccDays - benchmarkCccDays) * 100) / 100
}

// ── Grade classification ──────────────────────────────────────────────────────

function scoreToGrade(score: number): 'A' | 'B' | 'C' | 'D' | 'F' {
  if (score >= 80) return 'A'
  if (score >= 65) return 'B'
  if (score >= 50) return 'C'
  if (score >= 35) return 'D'
  return 'F'
}

// ── Month label helper ────────────────────────────────────────────────────────

function monthLabelTR(yyyyMM: string): string {
  const [y, m] = yyyyMM.split('-').map(Number)
  return new Date(y!, m! - 1, 1).toLocaleDateString('tr-TR', {
    month: 'long',
    year: 'numeric',
  })
}

// ── Period builder ────────────────────────────────────────────────────────────

function buildScorecardPeriod(
  month: { month: string; dso_days: number | null; dpo_days: number | null; dio_days: number | null; ccc_days: number | null },
): CccScorecardPeriod {
  const dso = month.dso_days ?? 0
  const dpo = month.dpo_days ?? 0
  const dio = month.dio_days ?? 0

  const dsoScore = computeDsoScore(dso)
  const dpoScore = computeDpoScore(dpo)
  const dioScore = computeDioScore(dio)
  const efficiencyScore = computeCccEfficiencyScore(dsoScore, dpoScore, dioScore)

  const benchmarkDelta = month.ccc_days !== null
    ? computeCccBenchmarkDelta(month.ccc_days)
    : null

  return {
    period_key:       month.month,
    period_label:     monthLabelTR(month.month),
    dso_days:         month.dso_days,
    dpo_days:         month.dpo_days,
    dio_days:         month.dio_days,
    ccc_days:         month.ccc_days,
    dso_score:        dsoScore,
    dpo_score:        dpoScore,
    dio_score:        dioScore,
    efficiency_score: efficiencyScore,
    benchmark_delta:  benchmarkDelta,
  }
}

// ── Trend classification ──────────────────────────────────────────────────────
// Compare last 3 months avg vs prior 3 months avg (>5 points threshold).

function classifyScorecardTrend(
  periods: CccScorecardPeriod[],
): 'improving' | 'stable' | 'deteriorating' | 'insufficient_data' {
  // periods[0] = most recent
  if (periods.length < 6) return 'insufficient_data'

  const recent = periods.slice(0, 3)
  const prior  = periods.slice(3, 6)

  const avgRecent = recent.reduce((s, p) => s + p.efficiency_score, 0) / recent.length
  const avgPrior  = prior.reduce((s, p) => s + p.efficiency_score, 0) / prior.length

  const diff = avgRecent - avgPrior  // positive = getting better
  if (diff >  5) return 'improving'
  if (diff < -5) return 'deteriorating'
  return 'stable'
}

// ── Service class ──────────────────────────────────────────────────────────────

export class CccScorecardService {
  private supabase: AnyClient

  constructor(supabase: AnyClient) {
    this.supabase = supabase
  }

  async getReport(companyId: string): Promise<CccScorecardReport> {
    // Fetch 12-month working capital data from WorkingCapitalService
    const wcReport = await WorkingCapitalService.getReport(companyId, this.supabase)

    // months[0] = most recent, take last 6
    const last6Months = wcReport.months.slice(0, 6)

    // Build scorecard periods
    const periods: CccScorecardPeriod[] = last6Months.map(buildScorecardPeriod)

    const currentPeriod = periods[0]!

    // Trend
    const trend = classifyScorecardTrend(periods)

    // Worst component (lowest score in current period)
    const scores: Array<['dso' | 'dpo' | 'dio', number]> = [
      ['dso', currentPeriod.dso_score],
      ['dpo', currentPeriod.dpo_score],
      ['dio', currentPeriod.dio_score],
    ]
    // Only identify worst if there's data (avoid flagging 0-score from missing data)
    const hasAnyData = currentPeriod.dso_days !== null
      || currentPeriod.dpo_days !== null
      || currentPeriod.dio_days !== null

    let worstComponent: 'dso' | 'dpo' | 'dio' | null = null
    if (hasAnyData) {
      scores.sort((a, b) => a[1] - b[1])
      worstComponent = scores[0]![0]
    }

    // Improvement potential in CCC days
    const improvementPotentialDays = currentPeriod.ccc_days !== null
      ? Math.max(0, Math.round(currentPeriod.ccc_days - CCC_BENCHMARKS.ccc))
      : 0

    return {
      current_period:           currentPeriod,
      periods,
      overall_efficiency_score: currentPeriod.efficiency_score,
      efficiency_grade:         scoreToGrade(currentPeriod.efficiency_score),
      benchmark_dso:            CCC_BENCHMARKS.dso,
      benchmark_dpo:            CCC_BENCHMARKS.dpo,
      benchmark_dio:            CCC_BENCHMARKS.dio,
      benchmark_ccc:            CCC_BENCHMARKS.ccc,
      trend,
      worst_component:          worstComponent,
      improvement_potential_days: improvementPotentialDays,
    }
  }
}
