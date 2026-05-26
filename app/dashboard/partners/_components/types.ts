// ─────────────────────────────────────────────────────────────────────────────
// Shared types, constants, helpers, and sub-components for /dashboard/partners
// ─────────────────────────────────────────────────────────────────────────────

import { formatTRY as fmt } from '@/lib/format'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PartnerBalance {
  partner_id:            string
  partner_name:          string
  share_ratio:           number
  is_active:             boolean
  total_loaned_try:      number
  total_repaid_try:      number
  total_distributed_try: number
  total_contributed_try: number
  net_loan_try:          number
  partner_balance_try:   number
}

export interface PartnerRow {
  id:          string
  name:        string
  share_ratio: number
  is_active:   boolean
  balance:     PartnerBalance | null
}

export interface EqEntry {
  partner_id:            string
  partner_name:          string
  share_ratio:           number
  per_unit_contribution: number
  equalization_amount:   number
  pro_rata_share:        number
  total_payout:          number
}

export interface EqResult {
  baseline_per_unit:  number
  total_equalization: number
  distributable:      number
  remaining_after_eq: number
  entries:            EqEntry[]
}

export interface LedgerEntry {
  partner_id:           string
  partner_name:         string
  share_ratio:          number
  is_active:            boolean
  equity_contributed:   number
  loans_given:          number
  loans_repaid:         number
  net_loan_outstanding: number
  dividends_received:   number
  salary_received:      number
  company_total_owed:   number
}

export interface LedgerSummary {
  total_equity_pool:      number
  total_debt_to_partners: number
  total_dividends:        number
  total_salary_legacy:    number
  debt_to_equity_ratio:   number | null
  partner_count:          number
  active_partner_count:   number
}

export interface LedgerData {
  entries: LedgerEntry[]
  summary: LedgerSummary
}

export interface WaterfallEntry {
  tranche_id:    string
  partner_name:  string
  component:     string
  allocated_try: number
  description:   string
}

export interface DebtTranche {
  id:                       string
  partner_id:               string
  partner_name:             string
  principal_try:            number
  interest_rate_annual_pct: number
  disbursement_date:        string
  expected_repayment_date?: string
  actual_repaid_try:        number
  accrued_interest_try:     number
  remaining_principal_try:  number
  status:                   'active' | 'partially_repaid' | 'repaid' | 'overdue'
  days_outstanding:         number
}

export interface WaterfallData {
  available_cash_try:    number
  tranches:              DebtTranche[]
  steps:                 WaterfallEntry[]
  total_debt_try:        number
  remaining_after_debt:  number
  debt_clearance_months?: number
}

export interface CapitalReturn {
  partner_id:         string
  partner_name:       string
  total_invested_try: number
  total_returned_try: number
  roi_to_date_pct:    number
}

export interface TxRow {
  id:         string
  tx_type:    string
  amount:     number
  currency:   string
  amount_try: number
  tx_date:    string
  notes:      string | null
}

export interface DistributionLayers {
  gross_net_income_try:    number
  legal_reserve_try:       number
  board_retained_try:      number
  unpaid_compensation_try: number
  distributable_gross_try: number
  withholding_tax_try:     number
  distributable_net_try:   number
  is_distributable:        boolean
  block_reason?:           string
}

export interface PartnerDistribEntry {
  partner_id:            string
  partner_name:          string
  share_ratio:           number
  gross_entitlement_try: number
  withholding_try:       number
  net_entitlement_try:   number
}

export interface ComplianceWarning {
  type:     string
  severity: 'info' | 'warning' | 'error'
  message:  string
  amount?:  number
}

export interface DistribState {
  distribution_layers:      DistributionLayers
  per_partner_distribution: PartnerDistribEntry[]
  compliance_warnings:      ComplianceWarning[]
}

export type TabId = 'partners' | 'ledger' | 'waterfall' | 'tranches' | 'distribution' | 'returns' | 'risk' | 'capital' | 'dividend' | 'compensation' | 'dilution' | 'amortization' | 'dividend-ledger'

export type LedgerSortCol = 'partner_name' | 'equity_contributed' | 'loans_given' | 'net_loan_outstanding' | 'dividends_received' | 'company_total_owed'

// ── Constants ─────────────────────────────────────────────────────────────────

export const TX_TYPE_LABELS: Record<string, string> = {
  capital_in:      'Sermaye Girişi',
  loan_to_company: 'Şirkete Borç',
  loan_repayment:  'Geri Ödeme',
  dividend:        'Temettü',
  loan_in:         'Sermaye Girişi',
  loan_out:        'Ödeme (Çıkış)',
  salary:          'Maaş',
  board_fee:       'Kurul Ücreti',
}

export const STATUS_LABELS: Record<DebtTranche['status'], string> = {
  active:           'Aktif',
  partially_repaid: 'Kısmi Ödendi',
  repaid:           'Ödendi',
  overdue:          'Vadesi Geçmiş',
}

export const ZERO_EQ: EqResult = {
  baseline_per_unit: 0, total_equalization: 0, distributable: 0,
  remaining_after_eq: 0, entries: [],
}

// ── Formatters ─────────────────────────────────────────────────────────────────

export function pct(r: number) {
  return `%${(r * 100).toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

export function fmtPct(v: number) {
  return `%${v.toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}`
}

export { fmt }
