// Flowra Chart of Accounts — MSUGT-compatible SME adaptation
// Account code → canonical name + classification

export type AccountClass =
  | 'current_asset'
  | 'non_current_asset'
  | 'current_liability'
  | 'non_current_liability'
  | 'equity'
  | 'revenue'
  | 'cogs'
  | 'operating_expense'
  | 'financing'

export type NormalBalance = 'debit' | 'credit'

export interface AccountDefinition {
  code:          string
  name:          string
  name_tr:       string
  class:         AccountClass
  normal_balance: NormalBalance
  is_cash?:      boolean   // true → included in cash flow
}

export const CHART_OF_ACCOUNTS: AccountDefinition[] = [
  // ── CURRENT ASSETS (1xx) ──────────────────────────────────────────────────
  { code: '100', name: 'Cash on Hand',          name_tr: 'Kasa',                  class: 'current_asset',     normal_balance: 'debit',  is_cash: true  },
  { code: '102', name: 'Bank Accounts',          name_tr: 'Bankalar',              class: 'current_asset',     normal_balance: 'debit',  is_cash: true  },
  { code: '120', name: 'Trade Receivables',      name_tr: 'Alıcılar',              class: 'current_asset',     normal_balance: 'debit'  },
  { code: '153', name: 'Inventory',              name_tr: 'Ticari Mallar',         class: 'current_asset',     normal_balance: 'debit'  },
  { code: '191', name: 'Deductible VAT',         name_tr: 'İndirilecek KDV',       class: 'current_asset',     normal_balance: 'debit'  },
  // ── NON-CURRENT ASSETS (2xx) ──────────────────────────────────────────────
  { code: '253', name: 'Equipment',              name_tr: 'Tesis Makine Teçhizat', class: 'non_current_asset', normal_balance: 'debit'  },
  { code: '257', name: 'Accumulated Depreciation',name_tr: 'Birikmiş Amortismanlar',class: 'non_current_asset',normal_balance: 'credit' },
  // ── CURRENT LIABILITIES (3xx) ─────────────────────────────────────────────
  { code: '320', name: 'Trade Payables',         name_tr: 'Satıcılar',             class: 'current_liability', normal_balance: 'credit' },
  { code: '321', name: 'Partner Loans (ST)',     name_tr: 'Ortaklara Borçlar (KV)',class: 'current_liability', normal_balance: 'credit' },
  { code: '335', name: 'Payroll Payables',       name_tr: 'Personele Borçlar',     class: 'current_liability', normal_balance: 'credit' },
  { code: '360', name: 'Tax Payable',            name_tr: 'Ödenecek Vergi',        class: 'current_liability', normal_balance: 'credit' },
  { code: '391', name: 'Output VAT',             name_tr: 'Hesaplanan KDV',        class: 'current_liability', normal_balance: 'credit' },
  // ── NON-CURRENT LIABILITIES (4xx) ────────────────────────────────────────
  { code: '421', name: 'Partner Loans (LT)',     name_tr: 'Ortaklara Borçlar (UV)',class: 'non_current_liability', normal_balance: 'credit' },
  // ── EQUITY (5xx) ─────────────────────────────────────────────────────────
  { code: '500', name: 'Paid-in Capital',        name_tr: 'Sermaye',               class: 'equity',            normal_balance: 'credit' },
  { code: '501', name: 'Unpaid Capital (Contra)',name_tr: 'Ödenmemiş Sermaye',     class: 'equity',            normal_balance: 'debit'  },
  { code: '542', name: 'Legal Reserves',         name_tr: 'Yasal Yedekler',        class: 'equity',            normal_balance: 'credit' },
  { code: '570', name: 'Retained Earnings',      name_tr: 'Geçmiş Yıllar Kârları', class: 'equity',           normal_balance: 'credit' },
  { code: '580', name: 'Accumulated Losses',     name_tr: 'Geçmiş Yıllar Zararları',class: 'equity',          normal_balance: 'debit'  },
  { code: '590', name: 'Current Period Profit',  name_tr: 'Dönem Net Kârı',        class: 'equity',            normal_balance: 'credit' },
  // ── REVENUE (6xx) ────────────────────────────────────────────────────────
  { code: '600', name: 'Domestic Sales Revenue', name_tr: 'Yurt İçi Satışlar',    class: 'revenue',           normal_balance: 'credit' },
  { code: '620', name: 'Cost of Goods Sold',     name_tr: 'Satılan Malın Maliyeti',class: 'cogs',             normal_balance: 'debit'  },
  { code: '642', name: 'Interest Income',        name_tr: 'Faiz Gelirleri',        class: 'revenue',           normal_balance: 'credit' },
  { code: '649', name: 'Other Income',           name_tr: 'Diğer Olağan Gelirler', class: 'revenue',           normal_balance: 'credit' },
  // ── OPERATING EXPENSES (7xx) ─────────────────────────────────────────────
  { code: '760', name: 'Marketing & Logistics',  name_tr: 'Pazarlama Satış Dağıtım Giderleri', class: 'operating_expense', normal_balance: 'debit' },
  { code: '770', name: 'General & Administrative',name_tr: 'Genel Yönetim Giderleri',          class: 'operating_expense', normal_balance: 'debit' },
  { code: '771', name: 'Payroll Expense',        name_tr: 'Maaş Giderleri',        class: 'operating_expense', normal_balance: 'debit' },
  { code: '772', name: 'Rent Expense',           name_tr: 'Kira Giderleri',         class: 'operating_expense', normal_balance: 'debit' },
  { code: '773', name: 'Software & Subscriptions',name_tr: 'Yazılım/Abonelik Giderleri',       class: 'operating_expense', normal_balance: 'debit' },
  // ── FINANCING (7xx/6xx) ──────────────────────────────────────────────────
  { code: '780', name: 'Finance Expense',        name_tr: 'Finansman Giderleri',   class: 'financing',         normal_balance: 'debit'  },
]

// Lookup maps
const BY_CODE = new Map(CHART_OF_ACCOUNTS.map(a => [a.code, a]))

export function getAccount(code: string): AccountDefinition {
  const a = BY_CODE.get(code)
  if (!a) throw new Error(`Unknown account code: ${code}`)
  return a
}

export function getAccountSafe(code: string): AccountDefinition | null {
  return BY_CODE.get(code) ?? null
}

// expense_type → account code mapping (backward-compatible)
export const EXPENSE_TYPE_TO_ACCOUNT: Record<string, string> = {
  salary:                 '771',
  rent:                   '772',
  software:               '773',
  marketing:              '760',
  logistics:              '760',
  general:                '770',
  operational:            '770',
  utilities:              '770',
  partner_loan_interest:  '780',
  board_fee:              '770',
  other:                  '770',
}

// Account class helpers
export function isCashAccount(code: string): boolean {
  return BY_CODE.get(code)?.is_cash ?? false
}

export function isDebitNormal(code: string): boolean {
  return (BY_CODE.get(code)?.normal_balance ?? 'debit') === 'debit'
}

export function accountClass(code: string): AccountClass | null {
  return BY_CODE.get(code)?.class ?? null
}

// All codes belonging to a class
export function accountsByClass(cls: AccountClass): AccountDefinition[] {
  return CHART_OF_ACCOUNTS.filter(a => a.class === cls)
}

// ── Chart of Accounts completeness validator ──────────────────────────────────

/** Required account codes that must exist in the chart of accounts */
export const REQUIRED_ACCOUNT_CODES: string[] = [
  '100','102','120','153','191','253','257',
  '320','321','335','360','391','421',
  '500','501','542','570','580','590',
  '600','620','760','770','771','772','773','780',
]

export interface ChartOfAccountsValidation {
  valid:                  boolean
  missing_codes:          string[]   // required codes not present in CoA
  duplicate_codes:        string[]   // codes appearing more than once
  normal_balance_errors:  string[]   // accounts where normal_balance seems wrong
}

/**
 * Validate completeness and correctness of the Chart of Accounts.
 *
 * Checks:
 *   1. All required codes are present
 *   2. No duplicate codes exist
 *   3. Normal balance is consistent with account class
 *      (assets/expenses → debit; liabilities/equity/revenue → credit)
 *      Contra accounts (257, 501, 580) are explicitly excluded from this check.
 */
export function validateChartOfAccounts(): ChartOfAccountsValidation {
  const allCodes  = CHART_OF_ACCOUNTS.map(a => a.code)
  const codeSet   = new Set(allCodes)

  // 1. Missing required codes
  const missing_codes = REQUIRED_ACCOUNT_CODES.filter(c => !codeSet.has(c))

  // 2. Duplicate codes
  const seen     = new Set<string>()
  const dupes    = new Set<string>()
  for (const code of allCodes) {
    if (seen.has(code)) dupes.add(code)
    else seen.add(code)
  }
  const duplicate_codes = Array.from(dupes)

  // 3. Normal balance consistency
  // Contra accounts have intentionally reversed normal balances — exclude them
  const CONTRA_ACCOUNTS = new Set(['257', '501', '580'])

  const DEBIT_CLASSES: AccountClass[]  = ['current_asset', 'non_current_asset', 'cogs', 'operating_expense', 'financing']
  const CREDIT_CLASSES: AccountClass[] = ['current_liability', 'non_current_liability', 'equity', 'revenue']

  const normal_balance_errors: string[] = []

  for (const acc of CHART_OF_ACCOUNTS) {
    if (CONTRA_ACCOUNTS.has(acc.code)) continue

    if (DEBIT_CLASSES.includes(acc.class) && acc.normal_balance !== 'debit') {
      normal_balance_errors.push(
        `${acc.code} (${acc.class}) has normal_balance='${acc.normal_balance}' but expected 'debit'`
      )
    } else if (CREDIT_CLASSES.includes(acc.class) && acc.normal_balance !== 'credit') {
      normal_balance_errors.push(
        `${acc.code} (${acc.class}) has normal_balance='${acc.normal_balance}' but expected 'credit'`
      )
    }
  }

  const valid = missing_codes.length === 0 && duplicate_codes.length === 0 && normal_balance_errors.length === 0

  return { valid, missing_codes, duplicate_codes, normal_balance_errors }
}
