// ── Simulation shared types, constants, and helpers ──────────────────────────
// Pure module — no React, no JSX

import type { Currency, Product, RecurringProjectionMonth } from '@/types'

export type { Currency, Product, RecurringProjectionMonth }

/* ── Style tokens ───────────────────────────────────────────────────────────── */
export const IL  = 'w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-primary-400 bg-white transition-colors'
export const LAB = 'block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5'

/* ── Formatters ─────────────────────────────────────────────────────────────── */
export function currSym(c: string): string {
  return c === 'USD' ? '$' : c === 'EUR' ? '€' : '₺'
}

export function fmtC(n: number, sym: string) {
  return sym + Number(n || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function pct(n: number) {
  return '%' + Number(n || 0).toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
}

/** Format YYYY-MM as Turkish short month name + year */
export function fmtMonth(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  const names = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara']
  return `${names[m - 1] ?? ym} ${y}`
}

/* ── Partner equalization types ─────────────────────────────────────────────── */
export interface SimEqEntry {
  partner_id:          string
  partner_name:        string
  share_ratio:         number
  equalization_amount: number
  pro_rata_share:      number
  total_payout:        number
}

export interface SimEqResult {
  baseline_per_unit:  number
  total_equalization: number
  distributable:      number
  remaining_after_eq: number
  entries:            SimEqEntry[]
}

export const ZERO_SIM_EQ: SimEqResult = {
  baseline_per_unit: 0, total_equalization: 0, distributable: 0,
  remaining_after_eq: 0, entries: [],
}

/* ── Debt burden types ─────────────────────────────────────────────────────── */
export interface DebtBurdenSummary {
  total_outstanding:     number
  total_loans_given:     number
  total_loans_repaid:    number
  weighted_avg_per_unit: number
  is_balanced:           boolean
  equalization_needed:   number
  partner_count:         number
}

export interface DebtBurdenResult {
  entries: unknown[]
  summary: DebtBurdenSummary
}

/* ── Props ──────────────────────────────────────────────────────────────────── */
export interface SimulationClientProps {
  userId:             string
  companyId:          string | null
  initialProducts:    Product[]
  initialPolicyRates: { TRY: number; USD: number; EUR: number }
  initialFxRates:     { USD: number; EUR: number }
  initialPartnerCount: number
}
