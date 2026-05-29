// ── RfmSegmentationService — Customer RFM Segmentation Engine ─────────────────
// Provides quintile-based R/F/M scoring, 11-segment classification,
// segment revenue distribution, and Turkish action labels.
// All pure helpers are exported for unit testing.

import type { SupabaseClient } from '@supabase/supabase-js'

// ── Public types ──────────────────────────────────────────────────────────────

export type RfmSegment =
  | 'champion'
  | 'loyal_customer'
  | 'potential_loyalist'
  | 'recent_customer'
  | 'promising'
  | 'need_attention'
  | 'about_to_sleep'
  | 'at_risk'
  | 'cannot_lose'
  | 'hibernating'
  | 'lost'

// All 11 segment keys (used to initialize zero-filled maps)
export const ALL_RFM_SEGMENTS: RfmSegment[] = [
  'champion',
  'loyal_customer',
  'potential_loyalist',
  'recent_customer',
  'promising',
  'need_attention',
  'about_to_sleep',
  'at_risk',
  'cannot_lose',
  'hibernating',
  'lost',
]

// ── Internal raw row ──────────────────────────────────────────────────────────

interface RawSale {
  customer_id:   string | null
  customer_name: string | null
  sale_date:     string | null
  total:         number | null
}

// ── Pure scoring helpers ──────────────────────────────────────────────────────

/**
 * Recency score based on quintile breaks.
 * Lower days → higher score (more recent = better).
 * days <= p20 → 5 (very recent)
 * days <= p40 → 4
 * days <= p60 → 3
 * days <= p80 → 2
 * days >  p80 → 1 (very dormant)
 */
export function scoreRecency(
  daysSinceLastPurchase: number,
  quintileBreaks: [number, number, number, number],
): 1 | 2 | 3 | 4 | 5 {
  const [p20, p40, p60, p80] = quintileBreaks
  if (daysSinceLastPurchase <= p20) return 5
  if (daysSinceLastPurchase <= p40) return 4
  if (daysSinceLastPurchase <= p60) return 3
  if (daysSinceLastPurchase <= p80) return 2
  return 1
}

/**
 * Frequency score based on quintile breaks.
 * Higher order count → higher score.
 * orders > p80 → 5
 * orders > p60 → 4
 * orders > p40 → 3
 * orders > p20 → 2
 * orders <= p20 → 1
 */
export function scoreFrequency(
  orderCount: number,
  quintileBreaks: [number, number, number, number],
): 1 | 2 | 3 | 4 | 5 {
  const [p20, p40, p60, p80] = quintileBreaks
  if (orderCount > p80) return 5
  if (orderCount > p60) return 4
  if (orderCount > p40) return 3
  if (orderCount > p20) return 2
  return 1
}

/**
 * Monetary score based on quintile breaks.
 * Higher spend → higher score.
 * spend > p80 → 5
 * spend > p60 → 4
 * spend > p40 → 3
 * spend > p20 → 2
 * spend <= p20 → 1
 */
export function scoreMonetary(
  totalSpend: number,
  quintileBreaks: [number, number, number, number],
): 1 | 2 | 3 | 4 | 5 {
  const [p20, p40, p60, p80] = quintileBreaks
  if (totalSpend > p80) return 5
  if (totalSpend > p60) return 4
  if (totalSpend > p40) return 3
  if (totalSpend > p20) return 2
  return 1
}

/**
 * Concatenate R, F, M scores into a 3-character RFM code string.
 * e.g. computeRfmScore(5, 3, 1) → "531"
 */
export function computeRfmScore(r: number, f: number, m: number): string {
  return `${r}${f}${m}`
}

/**
 * Classify customer into one of 11 RFM segments.
 * Rules are checked from most specific to least specific.
 *
 * champion:          R=5, F≥4, M≥4
 * loyal_customer:    F≥4 AND M≥4 (any R)
 * potential_loyalist:R≥4, F≥2, M≥2
 * recent_customer:   R≥4, F=1
 * promising:         R≥3, F=1, M≤2
 * need_attention:    R≥3, F≥3, M≥3
 * about_to_sleep:    R=2, F≤2
 * at_risk:           R=2, F≥3 AND M≥3
 * cannot_lose:       R=1, F≥4 AND M≥4
 * hibernating:       R=1, F≤2
 * lost:              default for R=1 (F≥3 or F=1)
 */
export function classifyRfmSegment(
  rScore: number,
  fScore: number,
  mScore: number,
): RfmSegment {
  // champion: most recent, very frequent, very high value
  if (rScore === 5 && fScore >= 4 && mScore >= 4) return 'champion'

  // cannot_lose: dormant but historically high value (check before loyal_customer — R overrides)
  if (rScore === 1 && fScore >= 4 && mScore >= 4) return 'cannot_lose'

  // loyal_customer: highly frequent and high monetary regardless of recency
  if (fScore >= 4 && mScore >= 4) return 'loyal_customer'

  // potential_loyalist: recent and starting to show frequency
  if (rScore >= 4 && fScore >= 2 && mScore >= 2) return 'potential_loyalist'

  // recent_customer: just made first/only purchase
  if (rScore >= 4 && fScore === 1) return 'recent_customer'

  // need_attention: was doing well but recency slipping
  if (rScore >= 3 && fScore >= 3 && mScore >= 3) return 'need_attention'

  // promising: recent but low frequency, low monetary
  if (rScore >= 3 && fScore === 1 && mScore <= 2) return 'promising'

  // at_risk: recency has dropped but was previously engaged
  if (rScore === 2 && fScore >= 3 && mScore >= 3) return 'at_risk'

  // about_to_sleep: declining recency, low engagement
  if (rScore === 2 && fScore <= 2) return 'about_to_sleep'

  // hibernating: fully dormant, low historical engagement
  if (rScore === 1 && fScore <= 2) return 'hibernating'

  // lost: everything else for R=1 (F≥3 with lower M, or edge cases)
  return 'lost'
}

/**
 * Compute [p20, p40, p60, p80] percentile values from an array of numbers.
 * If fewer than 5 values, returns all the same value (edge case).
 * Input array does not need to be sorted.
 */
export function computeQuintileBreaks(
  values: number[],
): [number, number, number, number] {
  if (values.length === 0) return [0, 0, 0, 0]
  const sorted = [...values].sort((a, b) => a - b)
  if (sorted.length < 5) {
    const v = sorted[0]
    return [v, v, v, v]
  }
  const pct = (p: number): number => {
    const idx = Math.floor((p / 100) * (sorted.length - 1))
    return sorted[idx]
  }
  return [pct(20), pct(40), pct(60), pct(80)]
}

/**
 * Compute revenue percentage per segment.
 * Returns 0 for segments with no customers.
 */
export function computeSegmentRevenuePct(
  customers: Array<{ segment: RfmSegment; total_spend: number }>,
): Record<RfmSegment, number> {
  const result = Object.fromEntries(ALL_RFM_SEGMENTS.map(s => [s, 0])) as Record<RfmSegment, number>

  if (customers.length === 0) return result

  const totalAll = customers.reduce((sum, c) => sum + c.total_spend, 0)
  if (totalAll === 0) return result

  for (const seg of ALL_RFM_SEGMENTS) {
    const segTotal = customers
      .filter(c => c.segment === seg)
      .reduce((sum, c) => sum + c.total_spend, 0)
    result[seg] = (segTotal / totalAll) * 100
  }

  return result
}

/**
 * Returns a Turkish action recommendation string for each RFM segment.
 */
export function getSegmentActionLabel(segment: RfmSegment): string {
  const labels: Record<RfmSegment, string> = {
    champion:            'Ödüllendirin, elçi yapın',
    loyal_customer:      'Üst ürün önerin, sadakat programına alın',
    potential_loyalist:  'Üyelik / program teklif edin',
    recent_customer:     'Onboarding başlatın',
    promising:           'Marka bilinirliği oluşturun',
    need_attention:      'Kişiselleştirilmiş teklif yapın',
    about_to_sleep:      'Değer hatırlatması gönderin',
    at_risk:             'Win-back kampanyası başlatın',
    cannot_lose:         'Kişisel iletişim kurun, reaktif kampanya yapın',
    hibernating:         'İlgili ürün önerin',
    lost:                'Yeniden kazanma kampanyası veya çık',
  }
  return labels[segment]
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/** Derive stable customer key for deduplication. */
function customerKey(row: RawSale): string {
  if (row.customer_id) return `id:${row.customer_id}`
  if (row.customer_name) return `name:${row.customer_name}`
  return 'name:Bilinmiyor'
}

// ── Service class ─────────────────────────────────────────────────────────────

export interface RfmCustomerRecord {
  customer_id: string
  customer_name: string
  r_score: number
  f_score: number
  m_score: number
  rfm_code: string
  segment: RfmSegment
  action: string
  days_since_purchase: number
  order_count: number
  total_spend: number
  last_purchase_date: string | null
}

export interface RfmSegmentationReport {
  customers: RfmCustomerRecord[]
  segment_distribution: Record<RfmSegment, number>
  segment_revenue_pct: Record<RfmSegment, number>
  high_value_customer_count: number
  at_risk_count: number
  revenue_at_risk_pct: number | null
}

export class RfmSegmentationService {
  constructor(private supabase: SupabaseClient<any>) {}

  async getReport(companyId: string): Promise<RfmSegmentationReport> {
    const today = new Date().toISOString().slice(0, 10)
    const cutoff24m = new Date()
    cutoff24m.setFullYear(cutoff24m.getFullYear() - 2)

    // Fetch all sales from the last 24 months
    const { data, error } = await this.supabase
      .from('sales')
      .select('customer_id, customer_name, sale_date, total')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .or('is_proforma.is.null,is_proforma.eq.false')
      .gte('sale_date', cutoff24m.toISOString().slice(0, 10))
      .order('sale_date', { ascending: true })

    if (error) throw new Error(`RfmSegmentationService.getReport: ${error.message}`)

    const rows = (data ?? []) as RawSale[]

    if (rows.length === 0) {
      return buildEmptyReport()
    }

    // Aggregate per customer
    type CustomerAgg = {
      customer_id: string | null
      customer_name: string
      lastSaleDate: string
      orderCount: number
      totalSpend: number
    }

    const aggMap = new Map<string, CustomerAgg>()

    for (const row of rows) {
      if (!row.sale_date) continue
      const key = customerKey(row)
      const amount = Number(row.total ?? 0)

      if (!aggMap.has(key)) {
        aggMap.set(key, {
          customer_id:   row.customer_id ?? null,
          customer_name: row.customer_name ?? 'Bilinmiyor',
          lastSaleDate:  row.sale_date,
          orderCount:    0,
          totalSpend:    0,
        })
      }

      const agg = aggMap.get(key)!
      agg.orderCount += 1
      agg.totalSpend += amount
      if (row.sale_date > agg.lastSaleDate) {
        agg.lastSaleDate = row.sale_date
      }
    }

    if (aggMap.size === 0) {
      return buildEmptyReport()
    }

    // Build arrays for quintile computation
    const allAggs = Array.from(aggMap.values())

    const todayMs = new Date(today).getTime()

    const recencyValues = allAggs.map(a => {
      const lastMs = new Date(a.lastSaleDate).getTime()
      return Math.max(0, Math.floor((todayMs - lastMs) / (1000 * 60 * 60 * 24)))
    })

    const frequencyValues = allAggs.map(a => a.orderCount)
    const monetaryValues  = allAggs.map(a => a.totalSpend)

    const recencyBreaks   = computeQuintileBreaks(recencyValues)
    const frequencyBreaks = computeQuintileBreaks(frequencyValues)
    const monetaryBreaks  = computeQuintileBreaks(monetaryValues)

    // Score and classify each customer
    const customers: RfmCustomerRecord[] = allAggs.map((agg, idx) => {
      const daysSince = recencyValues[idx]
      const rScore = scoreRecency(daysSince, recencyBreaks)
      const fScore = scoreFrequency(agg.orderCount, frequencyBreaks)
      const mScore = scoreMonetary(agg.totalSpend, monetaryBreaks)
      const rfmCode = computeRfmScore(rScore, fScore, mScore)
      const segment = classifyRfmSegment(rScore, fScore, mScore)
      const action = getSegmentActionLabel(segment)

      return {
        customer_id:          agg.customer_id ?? `name:${agg.customer_name}`,
        customer_name:        agg.customer_name,
        r_score:              rScore,
        f_score:              fScore,
        m_score:              mScore,
        rfm_code:             rfmCode,
        segment,
        action,
        days_since_purchase:  daysSince,
        order_count:          agg.orderCount,
        total_spend:          agg.totalSpend,
        last_purchase_date:   agg.lastSaleDate,
      }
    })

    // Sort by RFM code descending (best customers first)
    customers.sort((a, b) => b.rfm_code.localeCompare(a.rfm_code))

    // Segment distribution (count per segment)
    const segment_distribution = Object.fromEntries(
      ALL_RFM_SEGMENTS.map(s => [s, 0]),
    ) as Record<RfmSegment, number>
    for (const c of customers) {
      segment_distribution[c.segment] += 1
    }

    // Segment revenue percentage
    const segment_revenue_pct = computeSegmentRevenuePct(
      customers.map(c => ({ segment: c.segment, total_spend: c.total_spend })),
    )

    // High value: champion + loyal_customer + cannot_lose
    const high_value_customer_count =
      segment_distribution['champion'] +
      segment_distribution['loyal_customer'] +
      segment_distribution['cannot_lose']

    // At-risk: at_risk + cannot_lose
    const at_risk_count =
      segment_distribution['at_risk'] +
      segment_distribution['cannot_lose']

    // Revenue at risk
    const totalRevenue = customers.reduce((s, c) => s + c.total_spend, 0)
    const revenueAtRisk = customers
      .filter(c => c.segment === 'at_risk' || c.segment === 'cannot_lose')
      .reduce((s, c) => s + c.total_spend, 0)

    const revenue_at_risk_pct =
      totalRevenue > 0 ? (revenueAtRisk / totalRevenue) * 100 : null

    return {
      customers,
      segment_distribution,
      segment_revenue_pct,
      high_value_customer_count,
      at_risk_count,
      revenue_at_risk_pct,
    }
  }
}

// ── Empty report helper ───────────────────────────────────────────────────────

function buildEmptyReport(): RfmSegmentationReport {
  const emptyDist = Object.fromEntries(
    ALL_RFM_SEGMENTS.map(s => [s, 0]),
  ) as Record<RfmSegment, number>
  const emptyRevPct = Object.fromEntries(
    ALL_RFM_SEGMENTS.map(s => [s, 0]),
  ) as Record<RfmSegment, number>

  return {
    customers: [],
    segment_distribution: emptyDist,
    segment_revenue_pct: emptyRevPct,
    high_value_customer_count: 0,
    at_risk_count: 0,
    revenue_at_risk_pct: null,
  }
}
