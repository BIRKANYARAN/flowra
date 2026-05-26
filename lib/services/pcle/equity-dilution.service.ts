// ─────────────────────────────────────────────────────────────────────────────
// lib/services/pcle/equity-dilution.service.ts
//
// Simulation-only service (read-only, no writes).
// Answers: "If we raise new capital or a partner pays in committed capital,
// how does each partner's equity share change?"
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'
import { round2 } from '@/lib/calc'
import { BalanceSheetService } from '@/lib/services/balance-sheet.service'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any

// ── Interfaces ────────────────────────────────────────────────────────────────

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
  new_capital_try:         number       // new capital injection amount
  new_partner_name?:       string       // if new external partner
  new_partner_share_ratio?: number      // if external, what % they get

  // Resulting state after dilution
  partners_after: Array<{
    partner_name:          string
    share_ratio_before:    number
    share_ratio_after:     number
    dilution_pct:          number       // (after - before) / before × 100 (negative = diluted)
    equity_value_before_try: number     // share × total_equity_before
    equity_value_after_try:  number     // share × total_equity_after
    value_change_try:      number
  }>

  total_equity_before: number
  total_equity_after:  number
  dilution_description: string          // Turkish: "₺X yeni sermaye ile Ahmet'in payı %25'ten %20'ye düşüyor"
}

export interface EquityDilutionReport {
  current_partners:        CurrentPartnerEquity[]
  current_total_equity_try: number
  equity_gap_total_try:    number       // sum of all equity gaps

  // Pre-built scenarios
  scenarios: {
    gap_filled:     DilutionScenario    // what if all equity gaps are paid
    small_raise:    DilutionScenario    // +10% of current equity raised externally (25% to new partner)
    large_raise:    DilutionScenario    // +50% of current equity raised externally (33% to new partner)
    partner_buyout: DilutionScenario    // if smallest partner is bought out by others (proportional)
  }
}

// ── Pure helper functions (exported for testing) ──────────────────────────────

/**
 * Compute partner equity state after an external capital raise.
 * New partner gets newPartnerShareRatio of the company; existing partners are
 * diluted proportionally (each multiplied by (1 − newPartnerShareRatio)).
 */
export function computeDilutionAfterExternalRaise(
  partners:              CurrentPartnerEquity[],
  newCapitalTry:         number,
  newPartnerShareRatio:  number,
  currentEquity:         number,
): DilutionScenario['partners_after'] {
  const safeEquity = currentEquity > 0 ? currentEquity : 1
  const equityAfter = safeEquity + newCapitalTry
  const dilutionFactor = 1 - newPartnerShareRatio

  return partners.map(p => {
    const ratioAfter        = round2(p.share_ratio * dilutionFactor)
    const ratioBeforePct    = p.share_ratio * 100
    const ratioAfterPct     = ratioAfter * 100
    const dilution_pct      = p.share_ratio > 0
      ? round2(((ratioAfter - p.share_ratio) / p.share_ratio) * 100)
      : 0
    const value_before      = round2(p.share_ratio * safeEquity)
    const value_after       = round2(ratioAfter * equityAfter)

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
 * The bought-out partner's share is redistributed proportionally to remaining partners.
 */
export function computePartnerBuyout(
  partners:          CurrentPartnerEquity[],
  buyoutPartnerName: string,
  currentEquity:     number,
): DilutionScenario['partners_after'] {
  const safeEquity   = currentEquity > 0 ? currentEquity : 1
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

    // Remaining partners absorb the bought-out share proportionally
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

  // Find most diluted partner (most negative dilution_pct, excluding buyouts at -100)
  const diluted = partners
    .filter(p => p.dilution_pct < 0 && p.dilution_pct > -100)
    .sort((a, b) => a.dilution_pct - b.dilution_pct)

  if (diluted.length === 0) {
    const gained = partners.filter(p => p.dilution_pct > 0)
    if (gained.length > 0) {
      const p = gained[0]
      const before = (p.share_ratio_before * 100).toFixed(0)
      const after  = (p.share_ratio_after  * 100).toFixed(0)
      return `${p.partner_name} payı %${before}'ten %${after}'e yükseliyor.`
    }
    return 'Pay oranlarında değişiklik yok.'
  }

  const p      = diluted[0]
  const before = (p.share_ratio_before * 100).toFixed(0)
  const after  = (p.share_ratio_after  * 100).toFixed(0)
  const absDilPct = Math.abs(p.dilution_pct).toFixed(1)

  return `${p.partner_name} payı %${before}'den %${after}'e düşüyor (seyreltme: -%${absDilPct}).`
}

// ── Main service class ────────────────────────────────────────────────────────

export class EquityDilutionService {
  static async getReport(
    companyId: string,
    supabase:  AnyClient,
  ): Promise<EquityDilutionReport> {
    // ── 1. Fetch partners ─────────────────────────────────────────────────────
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

    // ── 2. Fetch paid & committed capital from partner_capital_commitments ─────
    const [paidResult, committedResult] = await Promise.allSettled([
      (supabase as SupabaseClient)
        .from('partner_capital_commitments')
        .select('partner_id, amount_try')
        .eq('company_id', companyId)
        .eq('payment_status', 'paid')
        .in('partner_id', partnerIds),
      (supabase as SupabaseClient)
        .from('partner_capital_commitments')
        .select('partner_id, amount_try')
        .eq('company_id', companyId)
        .neq('payment_status', 'cancelled')
        .in('partner_id', partnerIds),
    ])

    const paidRows: Array<{ partner_id: string; amount_try: number }> =
      paidResult.status === 'fulfilled' ? (paidResult.value.data ?? []) : []
    const committedRows: Array<{ partner_id: string; amount_try: number }> =
      committedResult.status === 'fulfilled' ? (committedResult.value.data ?? []) : []

    // Aggregate by partner
    const paidByPartner     = new Map<string, number>()
    const committedByPartner = new Map<string, number>()

    for (const r of paidRows) {
      paidByPartner.set(r.partner_id, (paidByPartner.get(r.partner_id) ?? 0) + Number(r.amount_try))
    }
    for (const r of committedRows) {
      committedByPartner.set(r.partner_id, (committedByPartner.get(r.partner_id) ?? 0) + Number(r.amount_try))
    }

    // ── 3. Get total equity from BalanceSheetService ───────────────────────────
    const today = new Date().toISOString().slice(0, 10)
    let current_total_equity_try = 0
    try {
      const bs = await BalanceSheetService.compute('system', companyId, today, supabase)
      current_total_equity_try = bs.equity.total_equity_try
    } catch {
      current_total_equity_try = 0
    }
    // Avoid division by zero
    const safeEquity = current_total_equity_try > 0 ? current_total_equity_try : 1

    // ── 4. Build current_partners ──────────────────────────────────────────────
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

    // ── 5. Build scenarios ─────────────────────────────────────────────────────

    // Scenario A: Gap filled — existing partners pay in remaining committed
    // Shares stay same since all pay proportionally; equity increases by gap total
    const gapFilledPartnersAfter: DilutionScenario['partners_after'] = current_partners.map(p => {
      const value_before = round2(p.share_ratio * safeEquity)
      const value_after  = round2(p.share_ratio * (safeEquity + equity_gap_total_try))
      return {
        partner_name:            p.partner_name,
        share_ratio_before:      p.share_ratio,
        share_ratio_after:       p.share_ratio,  // ratios unchanged
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

    // Scenario B: Small raise — +10% externally, new partner gets 25%
    const smallRaiseCapital   = round2(safeEquity * 0.10)
    const smallRaiseNewShare  = 0.25
    const smallRaiseAfter     = computeDilutionAfterExternalRaise(
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

    // Scenario C: Large raise — +50% externally, new partner gets 33%
    const largeRaiseCapital   = round2(safeEquity * 0.50)
    const largeRaiseNewShare  = 0.33
    const largeRaiseAfter     = computeDilutionAfterExternalRaise(
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

    // Scenario D: Partner buyout — smallest share partner bought out
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
        total_equity_after:  safeEquity,  // total equity unchanged; just redistribution
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

// ── Helpers ───────────────────────────────────────────────────────────────────

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
