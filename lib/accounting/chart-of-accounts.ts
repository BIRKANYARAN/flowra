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
