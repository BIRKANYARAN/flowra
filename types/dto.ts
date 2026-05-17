// ─────────────────────────────────────────────────────────────────────────────
// types/dto.ts — Frontend Data Transfer Objects (Flowra Executive OS)
//
// Types that live in the UI layer: view models, workspace state, navigation,
// dashboard shapes, and future financial statements not yet in DB schema.
//
// Rule: These types are NEVER stored in the database.
//       DB-mapped types remain in types/index.ts
// ─────────────────────────────────────────────────────────────────────────────

import type { MemberRole, Period } from '@/types'
export type { Period } from '@/types'

// ── Workspace ─────────────────────────────────────────────────────────────────

/** Granular action permissions derived from MemberRole */
export interface WorkspacePermissions {
  canManageUsers:       boolean
  canManagePartners:    boolean
  canClosePeriod:       boolean
  canLockPeriod:        boolean
  canExportData:        boolean
  canResetData:         boolean
  canViewAuditLog:      boolean
  canManageSettings:    boolean
  canManageBanks:       boolean
  canViewFinance:       boolean
  canEditSales:         boolean
  canEditExpenses:      boolean
  canViewSimulation:    boolean
  canManageProducts:    boolean
}

/** Resolve permissions from role — single source of truth */
export function permissionsFromRole(role: MemberRole | null): WorkspacePermissions {
  const isAdmin   = role === 'admin'
  const isManager = role === 'manager' || isAdmin
  return {
    canManageUsers:    isAdmin,
    canManagePartners: isAdmin,
    canClosePeriod:    isAdmin,
    canLockPeriod:     isAdmin,
    canExportData:     isAdmin,
    canResetData:      isAdmin,
    canViewAuditLog:   isAdmin,
    canManageSettings: isAdmin,
    canManageBanks:    isAdmin,
    canViewFinance:    isManager,
    canEditSales:      isManager,
    canEditExpenses:   isManager,
    canViewSimulation: isManager,
    canManageProducts: isManager,
  }
}

/** Navigation mode — determines which sidebar view the user sees */
export type NavMode = 'CEO' | 'CFO' | 'OPS'

/** Resolve preferred nav mode from role */
export function navModeFromRole(role: MemberRole | null): NavMode {
  if (role === 'admin')   return 'CEO'
  if (role === 'manager') return 'OPS'
  return 'OPS'
}

/** A company the user is a member of */
export interface CompanyEntry {
  companyId:   string
  companyName: string | null
  role:        MemberRole
}

/** Full workspace context value (provided by WorkspaceContext) */
export interface WorkspaceValue {
  companyId:    string | null
  companyName:  string | null
  logoUrl:      string | null
  userRole:     MemberRole | null
  userId:       string | null
  userEmail:    string | null
  userName:     string | null
  userInitials: string | null
  permissions:  WorkspacePermissions
  navMode:      NavMode
  /** Set by user preference (stored in localStorage) */
  setNavMode:   (mode: NavMode) => void
  /** All companies the user belongs to (populated when > 1) */
  companies:    CompanyEntry[]
  /** Switch to a different company — sets cookie + full reload */
  switchCompany: (companyId: string) => void
}

// ── Navigation ─────────────────────────────────────────────────────────────────

export interface NavItem {
  href:   string
  label:  string
  icon:   string
  exact?: boolean
  badge?: string | number  // notification count or label
}

export interface NavGroup {
  group:     string
  items:     NavItem[]
  modes?:    NavMode[]   // undefined = all modes; array = specific modes only
  adminOnly?: boolean
}

export type NavEntry = NavItem | NavGroup

// ── Dashboard / Cockpit ────────────────────────────────────────────────────────

/** CEO Cockpit: Company-level health status */
export type SituationStatus = 'healthy' | 'caution' | 'at-risk' | 'critical'

export interface SituationLine {
  status:    SituationStatus
  headline:  string   // "Şirket sağlıklı seyrediyor"
  reason:    string   // "Nakit akışı pozitif, alacaklar kontrol altında"
  priority?: string   // top action this week
}

/** Decision-grade alert for CEO/CFO cockpit */
export interface DecisionAlert {
  id:        string
  severity:  'info' | 'warning' | 'critical'
  title:     string
  detail?:   string
  actionLabel?: string
  actionHref?:  string
  dueDate?:  string   // ISO date
  amount?:   number   // TRY amount if relevant
  metric?:   string   // metric key that triggered this
}

/** CFO: Financial health composite score */
export interface FinancialHealthScore {
  overall:      number   // 0-100
  grade:        'A' | 'B' | 'C' | 'D' | 'F'
  components: {
    grossMargin:    { value: number; score: number; benchmark: number }
    operatingMargin:{ value: number; score: number; benchmark: number }
    currentRatio:   { value: number; score: number; benchmark: number }
    debtService:    { value: number; score: number; benchmark: number }
    runwayMonths:   { value: number; score: number; benchmark: number }
  }
}

/** CFO: Accounting integrity check result */
export interface AccountingCheck {
  name:    string
  passed:  boolean
  detail:  string
  action?: string  // suggested fix if failed
}

// ── Financial Statements (new — not in DB yet) ────────────────────────────────

export interface BalanceSheetAssets {
  cash_try:              number
  receivables_try:       number  // unpaid + partial sales
  inventory_try:         number  // FIFO stock value
  other_current_try:     number
  total_current_try:     number
  equipment_try:         number
  deposits_try:          number
  other_non_current_try: number
  total_non_current_try: number
  total_assets_try:      number
}

export interface BalanceSheetLiabilities {
  partner_loans_try:          number  // net_loan_try from partner ledger
  tax_payable_try:            number  // estimated KDV + corporate tax owed
  other_current_payables_try: number
  total_current_try:          number
  partner_loans_long_term_try:number
  other_non_current_try:      number
  total_non_current_try:      number
  total_liabilities_try:      number
}

export interface BalanceSheetEquity {
  partner_capital_lines: Array<{
    partner_id:   string
    partner_name: string
    capital_try:  number
    share_ratio:  number
  }>
  total_partner_capital_try:    number
  retained_earnings_try:        number  // from prior closed periods
  current_period_profit_try:    number  // from income statement
  total_equity_try:             number
}

/** Full Balance Sheet — invariant: assets = liabilities + equity */
export interface BalanceSheet {
  as_of_date:    string   // YYYY-MM-DD
  computed_at:   string   // ISO timestamp
  assets:        BalanceSheetAssets
  liabilities:   BalanceSheetLiabilities
  equity:        BalanceSheetEquity
  /** true if assets ≈ liabilities + equity (within rounding tolerance) */
  balanced:      boolean
  imbalance_try: number   // should be ~0
}

export interface CashFlowLine {
  label:  string
  amount: number  // positive = inflow, negative = outflow
}

/** Cash Flow Statement — 3-section GAAP structure */
export interface CashFlowStatement {
  period:    Period
  operating: {
    net_income_try:            number
    receivables_change_try:    number  // positive = decrease in receivables (cash in)
    inventory_change_try:      number  // positive = decrease in inventory (cash in)
    payables_change_try:       number  // positive = increase in payables (cash saved)
    other_adjustments:         CashFlowLine[]
    net_operating_try:         number
  }
  investing: {
    equipment_purchases_try:   number
    other:                     CashFlowLine[]
    net_investing_try:         number
  }
  financing: {
    partner_loans_received_try:number
    partner_loans_repaid_try:  number
    dividends_paid_try:        number
    capital_injected_try:      number
    other:                     CashFlowLine[]
    net_financing_try:         number
  }
  net_change_try:     number
  opening_balance_try:number
  closing_balance_try:number
}

/** Income Statement (formal wrapper over existing FinancialSummary) */
export interface IncomeStatement {
  period:                    Period
  revenue_try:               number
  cogs_try:                  number
  gross_profit_try:          number
  gross_margin_pct:          number
  operating_expenses_try:    number
  ebitda_try:                number
  depreciation_try:          number
  ebit_try:                  number
  interest_expense_try:      number
  ebt_try:                   number   // earnings before tax
  corporate_tax_try:         number
  net_income_try:            number
  net_margin_pct:            number
}

// ── Partner Finance (Liability Engine) ────────────────────────────────────────

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

export interface WaterfallStep {
  tranche_id:     string
  partner_name:   string
  component:      'interest_overdue' | 'interest_current' | 'principal' | 'dividend'
  allocated_try:  number
  description:    string
}

export interface RepaymentWaterfall {
  available_cash_try:     number
  tranches:               DebtTranche[]
  steps:                  WaterfallStep[]
  total_debt_try:         number
  remaining_after_debt:   number
  debt_clearance_months?: number  // projected months until all debt cleared
}

export interface PartnerCapitalReturnProjection {
  partner_id:              string
  partner_name:            string
  total_invested_try:      number
  total_returned_try:      number
  roi_to_date_pct:         number
  projected_clearance_date?: string
  irr_estimated_pct?:      number
}

// ── Simulation Scenarios (saved) ──────────────────────────────────────────────

export type RevenueModel = 'uniform' | 'seasonal' | 'custom'

export interface ScenarioProductPlan {
  product_id:   string
  product_name: string
  quantity:     number
  sale_price:   number
  discount_pct: number
}

export interface ScenarioInputs {
  period_months:                number
  start_month:                  string    // YYYY-MM
  revenue_model:                RevenueModel
  monthly_weights?:             number[]  // 12 weights for seasonal
  product_plans:                ScenarioProductPlan[]
  include_new_purchases:        boolean
  expense_overrides?:           Record<string, number>   // category → monthly override
  assumed_fx_usd?:              number
  assumed_fx_eur?:              number
  tax_rate_override?:           number
}

export interface ScenarioSummary {
  total_revenue_try:    number
  total_cogs_try:       number
  gross_profit_try:     number
  gross_margin_pct:     number
  total_expenses_try:   number
  ebitda_try:           number
  net_income_try:       number
  net_margin_pct:       number
  total_tax_try:        number
  net_vat_try:          number
  runway_from_start:    number   // months of runway at scenario end
  break_even_month?:    string   // YYYY-MM when cumulative profit > 0
}

export interface SavedScenario {
  id:               string
  name:             string
  company_id:       string
  created_at:       string
  inputs:           ScenarioInputs
  summary:          ScenarioSummary
  monthly_breakdown: Array<{
    month:         string
    revenue_try:   number
    cogs_try:      number
    expenses_try:  number
    tax_try:       number
    net_try:       number
    cumulative_try:number
  }>
  assumptions:  string[]
  tags:         string[]
  is_baseline:  boolean  // marked as the reference scenario
}

export interface ScenarioComparison {
  scenarios:               SavedScenario[]
  recommended_scenario_id: string
  recommendation_rationale:string
}

// ── Accounting Periods ────────────────────────────────────────────────────────

export type PeriodStatus = 'open' | 'closed' | 'locked'

export interface AccountingPeriod {
  id:                                  string
  company_id:                          string
  period_start:                        string   // YYYY-MM-DD
  period_end:                          string   // YYYY-MM-DD
  status:                              PeriodStatus
  closed_at?:                          string
  closed_by_name?:                     string
  opening_cash_try:                    number
  closing_cash_try:                    number
  retained_earnings_brought_forward:   number
  period_profit_try:                   number
  retained_earnings_carried_forward:   number
}

export interface PeriodCloseChecklist {
  bank_reconciled:        boolean
  expenses_complete:      boolean
  tax_summary_approved:   boolean
  balance_sheet_balanced: boolean
  ready_to_close:         boolean
}

// ── KPI / Dashboard API shapes ────────────────────────────────────────────────

/** Compact KPI row for dashboard cards */
export interface KpiCardData {
  label:      string
  value:      number
  currency?:  string
  rawValue?:  string
  sub?:       string
  delta?:     number
  tone?:      'positive' | 'negative' | 'neutral' | 'warning'
  href?:      string
}

/** Trend data point for sparkline charts */
export interface TrendPoint {
  month:  string   // YYYY-MM
  value:  number
}

/** 12-month strategic forecast (3 scenarios) */
export interface StrategicForecast {
  months:       string[]   // YYYY-MM labels
  base:         number[]
  optimistic:   number[]
  pessimistic:  number[]
  metric:       'revenue' | 'net_income' | 'cash'
}
