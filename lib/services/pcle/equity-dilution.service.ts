// ─────────────────────────────────────────────────────────────────────────────
// lib/services/pcle/equity-dilution.service.ts
//
// Partner Equity Dilution & Capital Structure Tracker
//
// Tracks equity ownership changes over time (dilution events), computes
// fully-diluted ownership percentages, and models the impact of capital calls
// on partner share ratios.
//
// Two service families in this file:
//
//   LEGACY — original dilution simulation (external raise / buyout scenarios)
//     EquityDilutionReport (LegacyEquityDilutionReport alias kept for API compat)
//     EquityDilutionService.getReport()
//
//   NEW — capital structure / ownership drift / capital call simulator
//     PartnerEquityPosition, CapitalCallScenario, CapitalStructureReport
//     CapitalStructureService.getReport()
//
// Pure exports (testable without DB):
//   computeEffectiveOwnership
//   computeDilutionImpact
//   computeFullyDilutedOwnership
//   computeCapitalGap
//   simulateCapitalCall
//   computeDilutionAfterExternalRaise  (legacy)
//   computePartnerBuyout               (legacy)
//   buildDilutionDescription           (legacy)
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'
import { round2 } from '@/lib/calc'
import { BalanceSheetService } from '@/lib/services/balance-sheet.service'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION A — LEGACY interfaces (used by original EquityDilutionService)
// ═══════════════════════════════════════════════════════════════════════════════

export interface CurrentPartnerEquity {
  partner_id:             string
  partner_name:           string
  share_ratio:            number        // current 0-1
  paid_capital_try:       number        // from partner_capital_commitments (paid)
  committed_capital_try:  number        // total committed (may > paid)
  equity_gap_try:         number        // committed - paid
}

export interface DilutionScenario {
  scenario_name:           string
  new_capital_try:         number
  new_partner_name?:       string
  new_partner_share_ratio?: number

  partners_after: Array<{
    partner_name:              string
    share_ratio_before:        number
    share_ratio_after:         number
    dilution_pct:              number
    equity_value_before_try:   number
    equity_value_after_try:    number
    value_change_try:          number
  }>

  total_equity_before:  number
  total_equity_after:   number
  dilution_description: string
}

export interface EquityDilutionReport {
  current_partners:         CurrentPartnerEquity[]
  current_total_equity_try: number
  equity_gap_total_try:     number

  scenarios: {
    gap_filled:     DilutionScenario
    small_raise:    DilutionScenario
    large_raise:    DilutionScenario
    partner_buyout: DilutionScenario
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION B — NEW interfaces (capital structure tracker)
// ═══════════════════════════════════════════════════════════════════════════════

export interface PartnerEquityPosition {
  partner_id:                string
  partner_name:              string
  committed_capital_try:     number
  paid_capital_try:          number
  capital_gap_try:           number
  commitment_pct:            number   // committed / total_committed × 100
  effective_ownership_pct:   number   // paid / total_paid × 100
  fully_diluted_pct:         number   // (paid + remaining) / total(paid + all_remaining) × 100
  contractual_share_pct:     number   // from partner.share_pct (share_ratio × 100)
  ownership_vs_contractual:  number   // effective_ownership - contractual_share (drift)
  is_underpaid:              boolean  // capital_gap > 0
}

export interface CapitalCallScenario {
  call_pct:                    number   // e.g. 50 (percent of remaining commitment called)
  total_additional_capital_try: number
  partner_impacts: Array<{
    partner_id:              string
    partner_name:            string
    additional_payment_try:  number
    current_ownership_pct:   number
    projected_ownership_pct: number
    dilution_impact_pct:     number
  }>
}

export interface CapitalStructureReport {
  total_committed_capital_try: number
  total_paid_capital_try:      number
  total_capital_gap_try:       number
  overall_funding_pct:         number   // paid / committed × 100
  partners:                    PartnerEquityPosition[]
  capital_call_scenarios:      CapitalCallScenario[]  // 25%, 50%, 100%
  has_ownership_drift:         boolean  // any partner |drift| > 2%
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION C — NEW pure functions (exported for testing)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Compute effective ownership: paid_capital / total_paid_capital × 100.
 * Returns 0 if totalPaidCapitalTry is 0 to avoid division by zero.
 */
export function computeEffectiveOwnership(
  partnerPaidCapitalTry: number,
  totalPaidCapitalTry: number,
): number {
  if (totalPaidCapitalTry === 0) return 0
  return round2((partnerPaidCapitalTry / totalPaidCapitalTry) * 100)
}

/**
 * Compute dilution impact: new_ownership - old_ownership.
 * Negative = diluted, positive = anti-diluted.
 */
export function computeDilutionImpact(
  oldOwnershipPct: number,
  newOwnershipPct: number,
): number {
  return round2(newOwnershipPct - oldOwnershipPct)
}

/**
 * Compute fully-diluted ownership: (paid + remaining_commitment) /
 * total(paid + all_remaining_commitments) × 100.
 * Returns 0 if denominator is 0.
 */
export function computeFullyDilutedOwnership(
  partnerPaidTry: number,
  partnerCommittedTry: number,   // remaining unpaid commitment for this partner
  totalPaidTry: number,
  totalCommittedTry: number,     // remaining unpaid commitments across ALL partners
): number {
  const numerator   = partnerPaidTry + partnerCommittedTry
  const denominator = totalPaidTry + totalCommittedTry
  if (denominator === 0) return 0
  return round2((numerator / denominator) * 100)
}

/**
 * Compute capital gap: committed - paid.
 * Returns 0 if paid >= committed (no gap or overpaid situation).
 */
export function computeCapitalGap(committedTry: number, paidTry: number): number {
  return round2(Math.max(0, committedTry - paidTry))
}

/**
 * Simulate capital call: compute new ownership pcts if all partners pay X% of
 * their remaining commitment.
 * Returns a map of partner_id → projected_ownership_pct.
 */
export function simulateCapitalCall(
  partners: Array<{
    id: string
    paid_try: number
    committed_try: number
  }>,
  callPct: number,  // e.g. 50 = 50% of remaining commitment called
): Record<string, number> {
  if (partners.length === 0) return {}

  // Compute additional payment per partner
  const projectedPaid: Record<string, number> = {}
  let totalProjectedPaid = 0

  for (const p of partners) {
    const gap            = Math.max(0, p.committed_try - p.paid_try)
    const additionalCall = round2(gap * (callPct / 100))
    const newPaid        = round2(p.paid_try + additionalCall)
    projectedPaid[p.id]  = newPaid
    totalProjectedPaid  += newPaid
  }

  const result: Record<string, number> = {}
  for (const p of partners) {
    result[p.id] = computeEffectiveOwnership(projectedPaid[p.id] ?? 0, totalProjectedPaid)
  }
  return result
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION D — LEGACY pure functions (kept for backward compat / existing tests)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Compute partner equity state after an external capital raise.
 */
export function computeDilutionAfterExternalRaise(
  partners:             CurrentPartnerEquity[],
  newCapitalTry:        number,
  newPartnerShareRatio: number,
  currentEquity:        number,
): DilutionScenario['partners_after'] {
  const safeEquity   = currentEquity > 0 ? currentEquity : 1
  const equityAfter  = safeEquity + newCapitalTry
  const dilutionFactor = 1 - newPartnerShareRatio

  return partners.map(p => {
    const ratioAfter    = round2(p.share_ratio * dilutionFactor)
    const dilution_pct  = p.share_ratio > 0
      ? round2(((ratioAfter - p.share_ratio) / p.share_ratio) * 100)
      : 0
    const value_before  = round2(p.share_ratio * safeEquity)
    const value_after   = round2(ratioAfter * equityAfter)
    return {
      partner_name:            p.partner_name,
      share_ratio_before:      p.share_ratio,
      share_ratio_after:       ratioAfter,
      dilution_pct,
      equity_value_before_try: value_before,
      equity_value_after_try:  value_after,
      value_change_try:        round2(value_after - value_before),
    }
  })
}

/**
 * Compute partner equity state after buying out the named partner.
 */
export function computePartnerBuyout(
  partners:          CurrentPartnerEquity[],
  buyoutPartnerName: string,
  currentEquity:     number,
): DilutionScenario['partners_after'] {
  const safeEquity    = currentEquity > 0 ? currentEquity : 1
  const buyoutPartner = partners.find(p => p.partner_name === buyoutPartnerName)
  if (!buyoutPartner) {
    return partners.map(p => ({
      partner_name:            p.partner_name,
      share_ratio_before:      p.share_ratio,
      share_ratio_after:       p.share_ratio,
      dilution_pct:            0,
      equity_value_before_try: round2(p.share_ratio * safeEquity),
      equity_value_after_try:  round2(p.share_ratio * safeEquity),
      value_change_try:        0,
    }))
  }

  const boughtOutShare = buyoutPartner.share_ratio
  const remaining      = partners.filter(p => p.partner_name !== buyoutPartnerName)
  const remainingTotal = remaining.reduce((s, p) => s + p.share_ratio, 0) || 1

  return partners.map(p => {
    if (p.partner_name === buyoutPartnerName) {
      return {
        partner_name:            p.partner_name,
        share_ratio_before:      p.share_ratio,
        share_ratio_after:       0,
        dilution_pct:            -100,
        equity_value_before_try: round2(p.share_ratio * safeEquity),
        equity_value_after_try:  0,
        value_change_try:        round2(-(p.share_ratio * safeEquity)),
      }
    }
    const additionalShare = boughtOutShare * (p.share_ratio / remainingTotal)
    const ratioAfter      = round2(p.share_ratio + additionalShare)
    const dilution_pct    = p.share_ratio > 0
      ? round2(((ratioAfter - p.share_ratio) / p.share_ratio) * 100)
      : 0
    const value_before    = round2(p.share_ratio * safeEquity)
    const value_after     = round2(ratioAfter * safeEquity)
    return {
      partner_name:            p.partner_name,
      share_ratio_before:      p.share_ratio,
      share_ratio_after:       ratioAfter,
      dilution_pct,
      equity_value_before_try: value_before,
      equity_value_after_try:  value_after,
      value_change_try:        round2(value_after - value_before),
    }
  })
}

/**
 * Build a Turkish dilution description from the partners_after array.
 */
export function buildDilutionDescription(
  partners: DilutionScenario['partners_after'],
): string {
  if (partners.length === 0) return 'Ortak bulunamadı.'

  const diluted = partners
    .filter(p => p.dilution_pct < 0 && p.dilution_pct > -100)
    .sort((a, b) => a.dilution_pct - b.dilution_pct)

  if (diluted.length === 0) {
    const gained = partners.filter(p => p.dilution_pct > 0)
    if (gained.length > 0) {
      const p      = gained[0]
      const before = (p.share_ratio_before * 100).toFixed(0)
      const after  = (p.share_ratio_after  * 100).toFixed(0)
      return `${p.partner_name} payı %${before}'ten %${after}'e yükseliyor.`
    }
    return 'Pay oranlarında değişiklik yok.'
  }

  const p          = diluted[0]
  const before     = (p.share_ratio_before * 100).toFixed(0)
  const after      = (p.share_ratio_after  * 100).toFixed(0)
  const absDilPct  = Math.abs(p.dilution_pct).toFixed(1)
  return `${p.partner_name} payı %${before}'den %${after}'e düşüyor (seyreltme: -%${absDilPct}).`
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION E — NEW CapitalStructureService
// ═══════════════════════════════════════════════════════════════════════════════

export class CapitalStructureService {
  constructor(private supabase: SupabaseClient) {}

  async getReport(companyId: string): Promise<CapitalStructureReport> {
    // 1. Fetch active partners (id, name, share_ratio)
    const { data: partnerRows } = await this.supabase
      .from('partners')
      .select('id, name, share_ratio')
      .eq('company_id', companyId)
      .eq('is_active', true)
      .is('deleted_at', null)
      .order('name', { ascending: true })

    type PartnerRow = { id: string; name: string; share_ratio: number }
    const partners: PartnerRow[] = (partnerRows ?? []) as PartnerRow[]

    if (partners.length === 0) {
      return {
        total_committed_capital_try: 0,
        total_paid_capital_try:      0,
        total_capital_gap_try:       0,
        overall_funding_pct:         0,
        partners:                    [],
        capital_call_scenarios:      [25, 50, 100].map(pct => ({
          call_pct:                     pct,
          total_additional_capital_try: 0,
          partner_impacts:              [],
        })),
        has_ownership_drift: false,
      }
    }

    const partnerIds = partners.map(p => p.id)

    // 2. Fetch latest commitment per partner from partner_capital_commitments
    //    sum all non-cancelled commitments as "committed"
    const { data: commitmentRows } = await this.supabase
      .from('partner_capital_commitments')
      .select('partner_id, committed_try')
      .eq('company_id', companyId)
      .is('deleted_at', null)   // cancelled commitments are soft-deleted (no payment_status column)
      .in('partner_id', partnerIds)

    type CommitmentRow = { partner_id: string; committed_try: number }
    const committedMap = new Map<string, number>()
    for (const r of (commitmentRows ?? []) as CommitmentRow[]) {
      committedMap.set(r.partner_id, (committedMap.get(r.partner_id) ?? 0) + Number(r.committed_try))
    }

    // 3. Fetch EQUITY_PAYMENT events from partner_finance_events → Σ per partner = paid_capital
    //    Fall back to paid partner_capital_commitments if table doesn't exist.
    let paidMap = new Map<string, number>()
    try {
      const { data: eventRows, error: evErr } = await this.supabase
        .from('partner_finance_events')
        .select('partner_id, amount_try')
        .eq('company_id', companyId)
        .eq('event_type', 'EQUITY_PAYMENT')
        .in('partner_id', partnerIds)

      if (!evErr && eventRows && eventRows.length > 0) {
        type EventRow = { partner_id: string; amount_try: number }
        for (const r of eventRows as EventRow[]) {
          paidMap.set(r.partner_id, (paidMap.get(r.partner_id) ?? 0) + Number(r.amount_try))
        }
      } else {
        // Fallback: paid commitments
        const { data: paidRows } = await this.supabase
          .from('partner_capital_commitments')
          .select('partner_id, paid_try')
          .eq('company_id', companyId)
          .is('deleted_at', null)
          .in('partner_id', partnerIds)

        type PaidRow = { partner_id: string; paid_try: number }
        for (const r of (paidRows ?? []) as PaidRow[]) {
          paidMap.set(r.partner_id, (paidMap.get(r.partner_id) ?? 0) + Number(r.paid_try))
        }
      }
    } catch {
      // Fallback: paid commitments
      const { data: paidRows } = await this.supabase
        .from('partner_capital_commitments')
        .select('partner_id, paid_try')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .in('partner_id', partnerIds)

      type PaidRow = { partner_id: string; paid_try: number }
      for (const r of (paidRows ?? []) as PaidRow[]) {
        paidMap.set(r.partner_id, (paidMap.get(r.partner_id) ?? 0) + Number(r.paid_try))
      }
    }

    // 4. Compute totals
    let totalCommitted = 0
    let totalPaid      = 0
    for (const p of partners) {
      totalCommitted += committedMap.get(p.id) ?? 0
      totalPaid      += paidMap.get(p.id) ?? 0
    }
    totalCommitted = round2(totalCommitted)
    totalPaid      = round2(totalPaid)
    const totalGap        = round2(Math.max(0, totalCommitted - totalPaid))
    const overallFundingPct = totalCommitted > 0
      ? round2((totalPaid / totalCommitted) * 100)
      : 0

    // 5. Build PartnerEquityPosition for each partner
    const totalRemainingCommitment = round2(totalCommitted - totalPaid)

    const equityPositions: PartnerEquityPosition[] = partners.map(p => {
      const committed   = round2(committedMap.get(p.id) ?? 0)
      const paid        = round2(paidMap.get(p.id) ?? 0)
      const gap         = computeCapitalGap(committed, paid)
      const remaining   = gap  // remaining = gap (unpaid portion)

      const commitmentPct        = totalCommitted > 0
        ? round2((committed / totalCommitted) * 100)
        : 0
      const effectiveOwnershipPct = computeEffectiveOwnership(paid, totalPaid)
      const fullyDilutedPct       = computeFullyDilutedOwnership(
        paid,
        remaining,
        totalPaid,
        totalRemainingCommitment,
      )
      const contractualSharePct   = round2(Number(p.share_ratio) * 100)
      const drift                 = computeDilutionImpact(contractualSharePct, effectiveOwnershipPct)

      return {
        partner_id:               p.id,
        partner_name:             p.name,
        committed_capital_try:    committed,
        paid_capital_try:         paid,
        capital_gap_try:          gap,
        commitment_pct:           commitmentPct,
        effective_ownership_pct:  effectiveOwnershipPct,
        fully_diluted_pct:        fullyDilutedPct,
        contractual_share_pct:    contractualSharePct,
        ownership_vs_contractual: drift,
        is_underpaid:             gap > 0,
      }
    })

    // 6. Compute 3 capital call scenarios: 25%, 50%, 100%
    const partnerCallInputs = partners.map(p => ({
      id:           p.id,
      paid_try:     paidMap.get(p.id) ?? 0,
      committed_try: committedMap.get(p.id) ?? 0,
    }))

    const capitalCallScenarios: CapitalCallScenario[] = [25, 50, 100].map(callPct => {
      const projectedOwnership = simulateCapitalCall(partnerCallInputs, callPct)

      let totalAdditional = 0
      const impacts = partners.map(p => {
        const gap            = Math.max(0, (committedMap.get(p.id) ?? 0) - (paidMap.get(p.id) ?? 0))
        const additionalPay  = round2(gap * (callPct / 100))
        totalAdditional     += additionalPay

        const pos            = equityPositions.find(ep => ep.partner_id === p.id)
        const currentOwn     = pos?.effective_ownership_pct ?? 0
        const projectedOwn   = projectedOwnership[p.id] ?? 0

        return {
          partner_id:              p.id,
          partner_name:            p.name,
          additional_payment_try:  additionalPay,
          current_ownership_pct:   currentOwn,
          projected_ownership_pct: projectedOwn,
          dilution_impact_pct:     computeDilutionImpact(currentOwn, projectedOwn),
        }
      })

      return {
        call_pct:                     callPct,
        total_additional_capital_try: round2(totalAdditional),
        partner_impacts:              impacts,
      }
    })

    // 7. Check ownership drift
    const hasOwnershipDrift = equityPositions.some(
      p => Math.abs(p.ownership_vs_contractual) > 2,
    )

    return {
      total_committed_capital_try: totalCommitted,
      total_paid_capital_try:      totalPaid,
      total_capital_gap_try:       totalGap,
      overall_funding_pct:         overallFundingPct,
      partners:                    equityPositions,
      capital_call_scenarios:      capitalCallScenarios,
      has_ownership_drift:         hasOwnershipDrift,
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION F — LEGACY EquityDilutionService (kept for backward compat)
// ═══════════════════════════════════════════════════════════════════════════════

export class EquityDilutionService {
  static async getReport(
    companyId: string,
    supabase:  AnyClient,
  ): Promise<EquityDilutionReport> {
    // 1. Fetch partners
    const partnersResult = await (supabase as SupabaseClient)
      .from('partners')
      .select('id, name, share_ratio, is_active')
      .eq('company_id', companyId)
      .eq('is_active', true)
      .is('deleted_at', null)
      .order('created_at', { ascending: true })

    const partnersRaw: Array<{ id: string; name: string; share_ratio: number; is_active: boolean }> =
      partnersResult.data ?? []

    if (partnersRaw.length === 0) {
      return {
        current_partners:         [],
        current_total_equity_try: 0,
        equity_gap_total_try:     0,
        scenarios: {
          gap_filled:     _emptyScenario('Özkaynak Açığı Kapanması'),
          small_raise:    _emptyScenario('Küçük Sermaye Artışı (+%10)'),
          large_raise:    _emptyScenario('Büyük Sermaye Artışı (+%50)'),
          partner_buyout: _emptyScenario('Ortak Hisse Alımı'),
        },
      }
    }

    const partnerIds = partnersRaw.map(p => p.id)

    const [paidResult, committedResult] = await Promise.allSettled([
      (supabase as SupabaseClient)
        .from('partner_capital_commitments')
        .select('partner_id, paid_try')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .in('partner_id', partnerIds),
      (supabase as SupabaseClient)
        .from('partner_capital_commitments')
        .select('partner_id, committed_try')
        .eq('company_id', companyId)
        .is('deleted_at', null)   // cancelled = soft-deleted (no payment_status column)
        .in('partner_id', partnerIds),
    ])

    const paidRows: Array<{ partner_id: string; paid_try: number }> =
      paidResult.status === 'fulfilled' ? (paidResult.value.data ?? []) : []
    const committedRows: Array<{ partner_id: string; committed_try: number }> =
      committedResult.status === 'fulfilled' ? (committedResult.value.data ?? []) : []

    const paidByPartner      = new Map<string, number>()
    const committedByPartner = new Map<string, number>()

    for (const r of paidRows) {
      paidByPartner.set(r.partner_id, (paidByPartner.get(r.partner_id) ?? 0) + Number(r.paid_try))
    }
    for (const r of committedRows) {
      committedByPartner.set(r.partner_id, (committedByPartner.get(r.partner_id) ?? 0) + Number(r.committed_try))
    }

    const today = new Date().toISOString().slice(0, 10)
    let current_total_equity_try = 0
    try {
      const bs = await BalanceSheetService.compute('system', companyId, today, supabase)
      current_total_equity_try = bs.equity.total_equity_try
    } catch {
      current_total_equity_try = 0
    }
    const safeEquity = current_total_equity_try > 0 ? current_total_equity_try : 1

    const current_partners: CurrentPartnerEquity[] = partnersRaw.map(p => {
      const paid      = round2(paidByPartner.get(p.id) ?? 0)
      const committed = round2(committedByPartner.get(p.id) ?? 0)
      const gap       = round2(Math.max(0, committed - paid))
      return {
        partner_id:            p.id,
        partner_name:          p.name,
        share_ratio:           Number(p.share_ratio),
        paid_capital_try:      paid,
        committed_capital_try: committed,
        equity_gap_try:        gap,
      }
    })

    const equity_gap_total_try = round2(current_partners.reduce((s, p) => s + p.equity_gap_try, 0))

    const gapFilledPartnersAfter: DilutionScenario['partners_after'] = current_partners.map(p => {
      const value_before = round2(p.share_ratio * safeEquity)
      const value_after  = round2(p.share_ratio * (safeEquity + equity_gap_total_try))
      return {
        partner_name:            p.partner_name,
        share_ratio_before:      p.share_ratio,
        share_ratio_after:       p.share_ratio,
        dilution_pct:            0,
        equity_value_before_try: value_before,
        equity_value_after_try:  value_after,
        value_change_try:        round2(value_after - value_before),
      }
    })

    const gapFilled: DilutionScenario = {
      scenario_name:    'Özkaynak Açığı Kapanması',
      new_capital_try:  equity_gap_total_try,
      partners_after:   gapFilledPartnersAfter,
      total_equity_before: safeEquity,
      total_equity_after:  round2(safeEquity + equity_gap_total_try),
      dilution_description: equity_gap_total_try > 0
        ? `Toplam ₺${Math.round(equity_gap_total_try).toLocaleString('tr-TR')} taahhüt açığı kapatıldığında pay oranları değişmez, özkaynak değerleri yükselir.`
        : 'Taahhüt açığı bulunmuyor; tüm ortaklar taahhütlerini ödemiş.',
    }

    const smallRaiseCapital  = round2(safeEquity * 0.10)
    const smallRaiseNewShare = 0.25
    const smallRaiseAfter    = computeDilutionAfterExternalRaise(
      current_partners, smallRaiseCapital, smallRaiseNewShare, safeEquity
    )
    const smallRaise: DilutionScenario = {
      scenario_name:           'Küçük Sermaye Artışı (+%10)',
      new_capital_try:         smallRaiseCapital,
      new_partner_name:        'Yeni Yatırımcı',
      new_partner_share_ratio: smallRaiseNewShare,
      partners_after:          smallRaiseAfter,
      total_equity_before:     safeEquity,
      total_equity_after:      round2(safeEquity + smallRaiseCapital),
      dilution_description:    buildDilutionDescription(smallRaiseAfter),
    }

    const largeRaiseCapital  = round2(safeEquity * 0.50)
    const largeRaiseNewShare = 0.33
    const largeRaiseAfter    = computeDilutionAfterExternalRaise(
      current_partners, largeRaiseCapital, largeRaiseNewShare, safeEquity
    )
    const largeRaise: DilutionScenario = {
      scenario_name:           'Büyük Sermaye Artışı (+%50)',
      new_capital_try:         largeRaiseCapital,
      new_partner_name:        'Yeni Yatırımcı',
      new_partner_share_ratio: largeRaiseNewShare,
      partners_after:          largeRaiseAfter,
      total_equity_before:     safeEquity,
      total_equity_after:      round2(safeEquity + largeRaiseCapital),
      dilution_description:    buildDilutionDescription(largeRaiseAfter),
    }

    let partnerBuyout: DilutionScenario
    if (current_partners.length <= 1) {
      partnerBuyout = {
        scenario_name:    'Ortak Hisse Alımı',
        new_capital_try:  0,
        partners_after:   current_partners.map(p => ({
          partner_name:            p.partner_name,
          share_ratio_before:      p.share_ratio,
          share_ratio_after:       p.share_ratio,
          dilution_pct:            0,
          equity_value_before_try: round2(p.share_ratio * safeEquity),
          equity_value_after_try:  round2(p.share_ratio * safeEquity),
          value_change_try:        0,
        })),
        total_equity_before:  safeEquity,
        total_equity_after:   safeEquity,
        dilution_description: 'Tek ortak mevcut — hisse alım senaryosu uygulanamaz.',
      }
    } else {
      const smallestPartner = [...current_partners].sort((a, b) => a.share_ratio - b.share_ratio)[0]
      const buyoutAfter     = computePartnerBuyout(current_partners, smallestPartner.partner_name, safeEquity)
      const buyoutValue     = round2(smallestPartner.share_ratio * safeEquity)
      partnerBuyout = {
        scenario_name:    'Ortak Hisse Alımı',
        new_capital_try:  buyoutValue,
        partners_after:   buyoutAfter,
        total_equity_before: safeEquity,
        total_equity_after:  safeEquity,
        dilution_description: `${smallestPartner.partner_name} ortağının ₺${Math.round(buyoutValue).toLocaleString('tr-TR')} değerindeki payı diğer ortaklar tarafından orantılı olarak devralınıyor.`,
      }
    }

    return {
      current_partners,
      current_total_equity_try,
      equity_gap_total_try,
      scenarios: {
        gap_filled:     gapFilled,
        small_raise:    smallRaise,
        large_raise:    largeRaise,
        partner_buyout: partnerBuyout,
      },
    }
  }
}

// ── Internal helper ───────────────────────────────────────────────────────────

function _emptyScenario(name: string): DilutionScenario {
  return {
    scenario_name:        name,
    new_capital_try:      0,
    partners_after:       [],
    total_equity_before:  0,
    total_equity_after:   0,
    dilution_description: 'Ortak verisi bulunamadı.',
  }
}
