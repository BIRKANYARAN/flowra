// ─────────────────────────────────────────────────────────────────────────────
// lib/services/pcle/dividend.service.ts
//
// Dividend Declaration helper — TTK 509/519 compliance + withholding tax.
//
// Compliance checks:
//   TTK 509 — distribution only from distributable profit (net > 0)
//   TTK 519 — mandatory legal reserve (5% of net income until 20% of capital)
//   GVK 94 §4 — 10% withholding tax on gross dividend
//
// Architecture:
//   DividendService.calculate()   — pure-ish calculation (reads partners + YTD income)
//   DividendService.initiate()    — creates a dividend_declaration workflow_instance
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'
import { WorkflowService } from '@/lib/services/workflow.service'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

// ── Public types ──────────────────────────────────────────────────────────────

export interface PartnerAllocation {
  partner_id: string
  partner_name: string
  share_ratio_pct: number
  gross_share_try: number
  withholding_try: number
  net_share_try: number
}

export interface DividendCalculation {
  // Input
  gross_dividend_try: number

  // Legal reserve check (TTK 519)
  /** 5% of period net income */
  required_legal_reserve_try: number
  /** How much of the reserve still needs to be funded */
  legal_reserve_remaining_try: number
  legal_reserve_satisfied: boolean

  // Distributable amount
  /** Gross dividend after reserve deduction check */
  distributable_gross_try: number

  // Withholding tax (GVK 94, §4 — 10%)
  withholding_rate: number          // 0.10
  withholding_try: number
  distributable_net_try: number

  // Per-partner allocation
  partner_allocations: PartnerAllocation[]

  // Compliance checks
  /** distributable_net > 0 AND period_profit > 0 */
  ttk_509_satisfied: boolean
  /** Legal reserve requirements met */
  ttk_519_satisfied: boolean
  can_declare: boolean
  /** Turkish messages for each failure */
  blocking_reasons: string[]

  // Context data for display
  ytd_net_income_try: number
}

// ── DividendService ───────────────────────────────────────────────────────────

export class DividendService {
  /**
   * Calculate dividend distribution with TTK 509/519 compliance checks.
   */
  static async calculate(
    companyId: string,
    uid: string,
    supabase: AnyClient,
    grossDividend: number,
  ): Promise<DividendCalculation> {
    const currentYear = new Date().getFullYear()
    const ytdFrom = `${currentYear}-01-01`
    const ytdTo   = new Date().toISOString().slice(0, 10)

    // ── Fetch YTD income + partners in parallel ─────────────────────────────
    const [revenueRes, expensesRes, partnersRes, reservesRes] = await Promise.all([
      supabase
        .from('sales')
        .select('total_try')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .gte('sale_date', ytdFrom)
        .lte('sale_date', ytdTo),
      supabase
        .from('expenses')
        .select('amount_try, expense_type')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .gte('expense_date', ytdFrom)
        .lte('expense_date', ytdTo),
      supabase
        .from('partners')
        .select('id, name, share_ratio')
        .eq('company_id', companyId)
        .eq('is_active', true)
        .is('deleted_at', null)
        .order('name'),
      // Try to get existing legal reserves from finance events
      supabase
        .from('partner_finance_events')
        .select('amount_try')
        .eq('company_id', companyId)
        .eq('event_type', 'LEGAL_RESERVE')
        .is('deleted_at', null),
    ])

    // ── YTD net income ───────────────────────────────────────────────────────
    const FINANCING_TYPES = new Set([
      'partner_financing', 'loan_repayment', 'dividend',
      'internal_transfer', 'principal', 'partner_loan',
    ])

    const ytdRevenue = ((revenueRes.data ?? []) as { total_try: number }[])
      .reduce((s, r) => s + Number(r.total_try ?? 0), 0)

    const ytdExpenses = ((expensesRes.data ?? []) as { amount_try: number; expense_type?: string | null }[])
      .filter(e => !e.expense_type || !FINANCING_TYPES.has(e.expense_type))
      .reduce((s, e) => s + Number(e.amount_try ?? 0), 0)

    const ytdNetIncome = round2(ytdRevenue - ytdExpenses)

    // ── TTK 519: legal reserve = 5% of net income ────────────────────────────
    const requiredLegalReserve = round2(Math.max(0, ytdNetIncome * 0.05))
    const existingReserves = ((reservesRes.data ?? []) as { amount_try: number }[])
      .reduce((s, r) => s + Number(r.amount_try ?? 0), 0)
    const legalReserveRemaining = round2(Math.max(0, requiredLegalReserve - existingReserves))
    const legalReserveSatisfied = legalReserveRemaining <= 0.01

    // ── Distributable ────────────────────────────────────────────────────────
    const distributableGross = round2(grossDividend)
    const withholdingRate    = 0.10
    const withholdingTry     = round2(distributableGross * withholdingRate)
    const distributableNet   = round2(distributableGross - withholdingTry)

    // ── Compliance checks ────────────────────────────────────────────────────
    const blockingReasons: string[] = []

    // TTK 509: no dividend if net income is zero or negative
    const ttk509Satisfied = ytdNetIncome > 0 && distributableNet > 0
    if (ytdNetIncome <= 0) {
      blockingReasons.push(
        `TTK 509: Dağıtılabilir kâr yok — YTD net gelir ${ytdNetIncome >= 0 ? '₺0' : `−₺${Math.abs(ytdNetIncome).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}`}`
      )
    } else if (distributableNet <= 0) {
      blockingReasons.push('TTK 509: Net dağıtım tutarı sıfır veya negatif olamaz')
    }
    // TTK 509: requested gross must not exceed net income
    if (ytdNetIncome > 0 && grossDividend > ytdNetIncome + 0.01) {
      blockingReasons.push(
        `TTK 509: Temettü beyanı net geliri aşıyor — Talep: ₺${grossDividend.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} / YTD net: ₺${ytdNetIncome.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}`
      )
    }

    const ttk519Satisfied = legalReserveSatisfied
    if (!legalReserveSatisfied) {
      blockingReasons.push(
        `TTK 519: Yasal yedek karşılanmadı — ₺${legalReserveRemaining.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} daha ayrılmalı`
      )
    }

    const canDeclare = blockingReasons.length === 0

    // ── Per-partner allocation ───────────────────────────────────────────────
    const partners = (partnersRes.data ?? []) as { id: string; name: string; share_ratio: number }[]

    // Normalize share ratios to ensure they sum to 1
    const totalRatio = partners.reduce((s, p) => s + Number(p.share_ratio ?? 0), 0)
    const partnerAllocations: PartnerAllocation[] = partners.map(p => {
      const ratio       = totalRatio > 0 ? Number(p.share_ratio) / totalRatio : 0
      const grossShare  = round2(distributableGross * ratio)
      const withholding = round2(grossShare * withholdingRate)
      const netShare    = round2(grossShare - withholding)
      return {
        partner_id:      p.id,
        partner_name:    p.name,
        share_ratio_pct: round2(ratio * 100),
        gross_share_try:  grossShare,
        withholding_try:  withholding,
        net_share_try:    netShare,
      }
    })

    return {
      gross_dividend_try:          grossDividend,
      required_legal_reserve_try:  requiredLegalReserve,
      legal_reserve_remaining_try: legalReserveRemaining,
      legal_reserve_satisfied:     legalReserveSatisfied,
      distributable_gross_try:     distributableGross,
      withholding_rate:            withholdingRate,
      withholding_try:             withholdingTry,
      distributable_net_try:       distributableNet,
      partner_allocations:         partnerAllocations,
      ttk_509_satisfied:           ttk509Satisfied,
      ttk_519_satisfied:           ttk519Satisfied,
      can_declare:                 canDeclare,
      blocking_reasons:            blockingReasons,
      ytd_net_income_try:          ytdNetIncome,
    }
  }

  /**
   * Initiate a dividend_declaration workflow instance.
   */
  static async initiateDeclaration(
    companyId: string,
    userId: string,
    supabase: AnyClient,
    calculation: DividendCalculation,
    notes?: string,
  ): Promise<{ workflowId: string }> {
    if (!calculation.can_declare) {
      throw new Error(
        `Temettü beyanı engellenmiş: ${calculation.blocking_reasons.join('; ')}`
      )
    }

    const instance = await WorkflowService.initiate(supabase, {
      companyId,
      workflowType:  'dividend_declaration',
      initiatorId:   userId,
      payload: {
        gross_dividend_try:          calculation.gross_dividend_try,
        withholding_try:             calculation.withholding_try,
        distributable_net_try:       calculation.distributable_net_try,
        withholding_rate:            calculation.withholding_rate,
        ytd_net_income_try:          calculation.ytd_net_income_try,
        ttk_509_satisfied:           calculation.ttk_509_satisfied,
        ttk_519_satisfied:           calculation.ttk_519_satisfied,
        partner_allocations:         calculation.partner_allocations,
        required_legal_reserve_try:  calculation.required_legal_reserve_try,
        legal_reserve_remaining_try: calculation.legal_reserve_remaining_try,
        notes:                       notes ?? null,
      },
      resourceType: 'dividend_declaration',
    })

    return { workflowId: instance.id }
  }
}
