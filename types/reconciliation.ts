// ═══════════════════════════════════════════════════════════════════════════════
// types/reconciliation.ts — Master Shareholder Reconciliation Types
// ═══════════════════════════════════════════════════════════════════════════════

export interface ReconSection1_CompanyIdentity {
  company_name: string
  tax_number:   string | null
  tax_office:   string | null
  mersis_no:    string | null
  trade_registry: string | null
  address:      string | null
  phone:        string | null
  email:        string | null
  website:      string | null
  reconciliation_date: string    // YYYY-MM-DD
  period_label: string | null
}

export interface ReconSection2_Treasury {
  total_cash_try:       number
  available_cash_try:   number
  restricted_cash_try:  number
  bank_accounts: Array<{
    bank_name:     string
    account_type:  string
    balance_try:   number
    currency:      string
    fx_rate?:      number
  }>
  fx_exposure: Array<{
    currency:    string
    amount:      number
    try_equiv:   number
  }>
  treasury_note: string | null
}

export interface ReconSection3_Receivables {
  total_receivables_try:  number
  overdue_receivables_try: number
  aging: {
    bucket_0_30:   number
    bucket_31_60:  number
    bucket_61_90:  number
    bucket_90plus: number
  }
  top_customers: Array<{
    name:        string
    outstanding: number
    oldest_days: number
    status:      string
  }>
  doubtful_try:          number
  concentration_pct:     number    // top customer / total
  collection_risk_note:  string | null
}

export interface ReconSection4_Payables {
  total_payables_try: number
  aging: {
    bucket_0_30:   number
    bucket_31_60:  number
    bucket_61_90:  number
    bucket_90plus: number
  }
  upcoming_7d_try:  number
  upcoming_30d_try: number
  top_suppliers: Array<{
    name:      string
    balance:   number
    due_date?: string
  }>
  critical_note: string | null
}

export interface ReconSection5_Inventory {
  total_inventory_try:  number
  item_count:           number
  critical_stock_count: number
  top_items: Array<{
    name:         string
    qty:          number
    unit_cost:    number
    total_value:  number
    stock_alert?: number
  }>
  turnover_note:        string | null
  last_count_date:      string | null
}

export interface ReconSection6_FixedAssets {
  total_gross_try:         number
  accumulated_depreciation: number
  net_carrying_value:      number
  assets: Array<{
    description:  string
    category:     string
    gross_value:  number
    net_value:    number
  }>
  note: string | null
}

export interface ReconSection7_TaxPosition {
  kdv_output_try:       number
  kdv_input_try:        number
  net_kdv_try:          number
  corporate_tax_try:    number
  withholding_try:      number
  overdue_tax_try:      number
  pending_declarations: string[]
  sgk_obligation_try:   number
  note:                 string | null
}

export interface ReconSection8_Financing {
  total_debt_try:   number
  items: Array<{
    lender:         string
    type:           string   // 'bank_loan' | 'leasing' | 'credit_facility' | 'other'
    balance_try:    number
    maturity_date?: string
    monthly_burden: number
  }>
  note: string | null
}

export interface ReconSection9_EquityStructure {
  total_capital_try: number
  shareholders: Array<{
    name:              string
    ownership_pct:     number
    paid_capital_try:  number
    equity_value_try:  number
  }>
}

export interface ReconSection10_PartnerReceivables {
  total_partner_loans_try: number   // company owes partners
  partners: Array<{
    partner_id:        string
    partner_name:      string
    ownership_pct:     number
    loan_total_try:    number
    repaid_try:        number
    accrued_interest:  number
    outstanding_try:   number
    maturity_profile:  string | null
  }>
}

export interface ReconSection11_PartnerLiabilities {
  total_partner_debt_try: number   // partners owe company
  partners: Array<{
    partner_name:   string
    outstanding_try: number
    repayment_note: string | null
  }>
}

export interface ReconSection12_DebtTranches {
  total_tranches_try: number
  tranches: Array<{
    partner_name:    string
    tranche_label:   string
    opening_try:     number
    remaining_try:   number
    interest_rate:   number
    maturity_date:   string | null
    priority:        number
    status:          string
  }>
}

export interface ReconSection13_Distributions {
  total_distributed_try:    number
  pending_distributions_try: number
  distributable_profit_try:  number
  retained_earnings_try:     number
  history: Array<{
    date:             string
    type:             string
    gross_try:        number
    withholding_try:  number
    net_try:          number
    note:             string | null
  }>
}

export interface ReconSection14_BalanceSheet {
  current_assets_try:      number
  non_current_assets_try:  number
  total_assets_try:        number
  short_term_liabilities:  number
  long_term_liabilities:   number
  total_liabilities_try:   number
  equity_try:              number
  net_asset_position_try:  number
  balanced:                boolean
  imbalance_try:           number
}

export interface ReconSection15_PnL {
  revenue_try:       number
  cogs_try:          number
  gross_profit_try:  number
  gross_margin_pct:  number
  operating_expenses: number
  ebitda_try:        number
  ebitda_margin_pct: number
  net_profit_try:    number
  net_margin_pct:    number
  period_label:      string
}

export interface GovernanceFinding {
  code:             string
  severity:         'critical' | 'warning' | 'info'
  title:            string
  description:      string
  financial_impact: number | null
  recommended_action: string
}

export interface ReconSection16_GovernanceRisks {
  total_critical: number
  total_warning:  number
  total_info:     number
  findings:       GovernanceFinding[]
}

export interface ReconSection17_ManagementDeclaration {
  declaration_text: string
  company_name:     string
  reconciliation_date: string
  prepared_by:      string
}

export interface ReconSection18_ShareholderDeclaration {
  declaration_text: string
  items_reviewed:   string[]
}

export interface ReconSection19_Signoffs {
  required_count:  number
  completed_count: number
  pending_count:   number
  signoffs: Array<{
    partner_name:   string
    ownership_pct:  number
    status:         'pending' | 'approved' | 'rejected'
    signed_at:      string | null
    comments:       string | null
  }>
}

export interface ConfidenceFactor {
  name:          string
  passed:        boolean
  weight:        number
  description:   string
}

// ─── Phase 3 Types ────────────────────────────────────────────────────────────

export type ValidationResult = 'PASS' | 'WARNING' | 'FAIL'

export interface ValidationCheck {
  id:          string
  title:       string
  result:      ValidationResult
  variance:    number | null
  explanation: string
  severity:    'critical' | 'warning' | 'info'
}

export interface FinancialValidation {
  balance_sheet_check:   ValidationCheck
  treasury_check:        ValidationCheck
  inventory_check:       ValidationCheck
  partner_finance_check: ValidationCheck
  profit_check:          ValidationCheck
  distribution_check:    ValidationCheck
  overall_status:        ValidationResult
  checks_passed:         number
  checks_total:          number
}

export interface ShareholderPosition {
  partner_name:              string
  ownership_pct:             number
  paid_capital:              number
  capital_injections_ytd:    number
  partner_receivables:       number
  partner_liabilities:       number
  debt_tranche_exposure:     number
  accumulated_distributions: number
  current_distribution_right: number
  net_economic_position:     number
  economic_note:             string | null
}

export interface ShareholderPositionSummary {
  positions:         ShareholderPosition[]
  total_equity:      number
  total_distributable: number
  as_of_date:        string
}

export interface SnapshotDelta {
  field:        string
  label:        string
  previous:     number
  current:      number
  change:       number
  change_pct:   number | null
  direction:    'up' | 'down' | 'flat'
  significance: 'critical' | 'notable' | 'minor'
}

export interface SnapshotComparison {
  current_id:         string
  previous_id:        string
  current_date:       string
  previous_date:      string
  deltas:             SnapshotDelta[]
  governance_summary: string[]
}

export interface AuditEntry {
  action:       'created' | 'approved' | 'rejected' | 'locked' | 'viewed'
  actor:        string
  timestamp:    string
  note:         string | null
  hash_at_time?: string
}

export interface GovernanceExecutiveSummary {
  headline:             string
  treasury_position:    string
  working_capital:      string
  net_assets:           string
  distributable_profit: string
  receivable_risk:      string
  debt_pressure:        string
  governance_issues:    string[]
  confidence_summary:   string
  recommendation:       string
}

export interface ConfidenceScoreV2 {
  total: number
  breakdown: Array<{
    factor:    string
    weight:    number
    score:     number
    max_score: number
    status:    'full' | 'partial' | 'none'
    detail:    string
    deduction: number
  }>
  grade:          'A' | 'B' | 'C' | 'D' | 'F'
  interpretation: string
}

export interface ReconciliationData {
  section1:    ReconSection1_CompanyIdentity
  section2:    ReconSection2_Treasury
  section3:    ReconSection3_Receivables
  section4:    ReconSection4_Payables
  section5:    ReconSection5_Inventory
  section6:    ReconSection6_FixedAssets
  section7:    ReconSection7_TaxPosition
  section8:    ReconSection8_Financing
  section9:    ReconSection9_EquityStructure
  section10:   ReconSection10_PartnerReceivables
  section11:   ReconSection11_PartnerLiabilities
  section12:   ReconSection12_DebtTranches
  section13:   ReconSection13_Distributions
  section14:   ReconSection14_BalanceSheet
  section15:   ReconSection15_PnL
  section16:   ReconSection16_GovernanceRisks
  section17:   ReconSection17_ManagementDeclaration
  section18:   ReconSection18_ShareholderDeclaration
  section19:   ReconSection19_Signoffs
  confidence_score:   number
  confidence_factors: ConfidenceFactor[]
  computed_at:        string
  data_hash:          string
}

export interface ReconciliationSnapshot {
  id:                  string
  company_id:          string
  created_by:          string
  created_at:          string
  reconciliation_date: string
  title:               string
  period_label:        string | null
  status:              'draft' | 'pending_approval' | 'approved' | 'archived'
  sections:            ReconciliationData
  data_hash:           string | null
  is_immutable:        boolean
  immutable_at:        string | null
  confidence_score:    number | null
  confidence_factors:  ConfidenceFactor[] | null
  governance_findings: GovernanceFinding[] | null
  approver_count:      number
  signoff_count:       number
}
