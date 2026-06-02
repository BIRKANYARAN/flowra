// ─────────────────────────────────────────────────────────────────────────────
// lib/reports/cfo-pack-manifest.ts
//
// Canonical list of all reports that constitute the CFO Pack.
// Used by the API route to communicate completeness to clients, and by the
// BoardPackTab to render the manifest checklist.
// ─────────────────────────────────────────────────────────────────────────────

export interface CFOPackReport {
  id:       string          // e.g. 'trial_balance'
  title:    string          // Turkish
  title_en: string
  category: 'accounting' | 'financial_statement' | 'tax' | 'partner' | 'executive'
  required: boolean         // must have for pack to be valid
  endpoint: string          // API endpoint that generates this data
  format:   'json' | 'pdf' | 'xlsx'
}

export const CFO_PACK_MANIFEST: CFOPackReport[] = [
  {
    id:       'trial_balance',
    title:    'Mizan',
    title_en: 'Trial Balance',
    category: 'accounting',
    required: true,
    endpoint: '/api/ledger/trial-balance',
    format:   'json',
  },
  {
    id:       'income_statement',
    title:    'Gelir Tablosu',
    title_en: 'Income Statement',
    category: 'financial_statement',
    required: true,
    endpoint: '/api/financial-statements/income-statement',
    format:   'json',
  },
  {
    id:       'balance_sheet',
    title:    'Bilanço',
    title_en: 'Balance Sheet',
    category: 'financial_statement',
    required: true,
    endpoint: '/api/financial-statements/balance-sheet',
    format:   'json',
  },
  {
    id:       'cash_flow',
    title:    'Nakit Akış Tablosu',
    title_en: 'Cash Flow Statement',
    category: 'financial_statement',
    required: true,
    endpoint: '/api/financial-statements/cash-flow',
    format:   'json',
  },
  {
    id:       'partner_capital',
    title:    'Ortak Hesabı',
    title_en: 'Partner Capital',
    category: 'partner',
    required: false,
    endpoint: '/api/partners/pcle/state',
    format:   'json',
  },
  {
    id:       'vat_summary',
    title:    'KDV Özeti',
    title_en: 'VAT Summary',
    category: 'tax',
    required: false,
    endpoint: '/api/cfo-metrics',
    format:   'json',
  },
  {
    id:       'receivables_aging',
    title:    'Alacak Yaşlandırma',
    title_en: 'Receivables Aging',
    category: 'financial_statement',
    required: false,
    endpoint: '/api/analytics/receivable-aging',
    format:   'json',
  },
  {
    id:       'executive_summary',
    title:    'Yönetici Özeti',
    title_en: 'Executive Summary',
    category: 'executive',
    required: false,
    endpoint: '/api/reports/executive-summary',
    format:   'json',
  },
]

/** Returns only the reports marked as required */
export function getRequiredReports(): CFOPackReport[] {
  return CFO_PACK_MANIFEST.filter(r => r.required)
}

/** Returns the report with the given id, or undefined */
export function getReportById(id: string): CFOPackReport | undefined {
  return CFO_PACK_MANIFEST.find(r => r.id === id)
}

/** Returns all reports in a given category */
export function getReportsByCategory(category: CFOPackReport['category']): CFOPackReport[] {
  return CFO_PACK_MANIFEST.filter(r => r.category === category)
}
