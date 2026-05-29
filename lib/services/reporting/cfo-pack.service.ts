// ─────────────────────────────────────────────────────────────────────────────
// lib/services/reporting/cfo-pack.service.ts
//
// CFO Monthly Reporting Pack — manifest assembly and pure helpers.
//
// Provides the canonical shape (CfoPackManifest / ReportItem) and a set of
// pure helper functions that can be used server-side (API route) or in tests
// without any DB / auth dependencies.
// ─────────────────────────────────────────────────────────────────────────────

// ── Types ─────────────────────────────────────────────────────────────────────

export type ReportType =
  | 'trial_balance'
  | 'income_statement'
  | 'balance_sheet'
  | 'cash_flow'
  | 'partner_capital'
  | 'kdv_summary'
  | 'corporate_tax_estimate'
  | 'receivables_aging'
  | 'partner_risk_map'
  | 'executive_summary'

export interface ReportItem {
  type:         ReportType
  title:        string          // Turkish
  description:  string
  status:       'ready' | 'generating' | 'error' | 'pending'
  url:          string | null   // PDF URL when ready
  size_kb:      number | null
  generated_at: string | null
}

export interface CfoPackManifest {
  period_id:     string
  period_label:  string
  created_at:    string
  items:         ReportItem[]
  total_size_kb: number
  is_complete:   boolean        // true when all items.status === 'ready'
  download_url:  string | null  // ZIP download URL when is_complete
}

// ── Canonical order ───────────────────────────────────────────────────────────

/** Canonical rendering / generation order for the CFO pack. */
export const REPORT_ORDER: ReportType[] = [
  'trial_balance',
  'income_statement',
  'balance_sheet',
  'cash_flow',
  'partner_capital',
  'kdv_summary',
  'corporate_tax_estimate',
  'receivables_aging',
  'partner_risk_map',
  'executive_summary',
]

// ── Title / description maps ──────────────────────────────────────────────────

const REPORT_TITLES: Record<ReportType, string> = {
  trial_balance:          'Mizan',
  income_statement:       'Gelir Tablosu',
  balance_sheet:          'Bilanço',
  cash_flow:              'Nakit Akış Tablosu',
  partner_capital:        'Ortak Sermaye Hesabı',
  kdv_summary:            'KDV Özeti',
  corporate_tax_estimate: 'Kurumlar Vergisi Tahmini',
  receivables_aging:      'Alacak Yaşlandırma',
  partner_risk_map:       'Ortak Risk Haritası',
  executive_summary:      'Yönetici Özeti',
}

const REPORT_DESCRIPTIONS: Record<ReportType, string> = {
  trial_balance:
    'Tüm hesapların dönem sonu borç/alacak bakiyelerini gösteren mizan raporu.',
  income_statement:
    'Seçili dönem için gelir, maliyet ve kar/zarar tablosu.',
  balance_sheet:
    'Dönem sonu itibarıyla varlıklar, yükümlülükler ve özkaynak özeti.',
  cash_flow:
    'İşletme, yatırım ve finansman faaliyetleri bazında nakit akışları.',
  partner_capital:
    'Her ortağın sermaye katkısı, çekimi ve net sermaye pozisyonu.',
  kdv_summary:
    'Dönem KDV tahakkuku, ödemesi ve devreden KDV tutarlarını içerir.',
  corporate_tax_estimate:
    'Dönem karına dayalı tahmini kurumlar vergisi hesabı.',
  receivables_aging:
    'Vadesi geçmiş alacakların 0-30, 31-60, 61-90 ve 90+ gün dağılımı.',
  partner_risk_map:
    'Ortak bazında borç yoğunlaşması ve risk skoru haritası.',
  executive_summary:
    'Tüm finansal göstergeleri özetleyen tek sayfalık yönetici brifingi.',
}

// ── Pure helper functions ─────────────────────────────────────────────────────

/** Returns the Turkish display title for a ReportType. */
export function getReportTitle(type: ReportType): string {
  return REPORT_TITLES[type]
}

/** Returns the Turkish description for a ReportType. */
export function getReportDescription(type: ReportType): string {
  return REPORT_DESCRIPTIONS[type]
}

/**
 * Builds an empty manifest where every item has status='pending'.
 * Does not touch any database or external service.
 */
export function buildEmptyManifest(
  periodId:    string,
  periodLabel: string,
): CfoPackManifest {
  const items: ReportItem[] = REPORT_ORDER.map(type => ({
    type,
    title:        getReportTitle(type),
    description:  getReportDescription(type),
    status:       'pending',
    url:          null,
    size_kb:      null,
    generated_at: null,
  }))

  return {
    period_id:     periodId,
    period_label:  periodLabel,
    created_at:    new Date().toISOString(),
    items,
    total_size_kb: 0,
    is_complete:   false,
    download_url:  null,
  }
}

/**
 * Computes a 0-100 progress value: percentage of items with status='ready'.
 * Returns 0 for an empty items array.
 */
export function computePackProgress(manifest: CfoPackManifest): number {
  if (manifest.items.length === 0) return 0
  const ready = manifest.items.filter(i => i.status === 'ready').length
  return Math.round((ready / manifest.items.length) * 100)
}

/**
 * Returns true if and only if all items in the manifest have status='ready'.
 * An empty manifest is NOT considered complete.
 */
export function isPackComplete(manifest: CfoPackManifest): boolean {
  if (manifest.items.length === 0) return false
  return manifest.items.every(i => i.status === 'ready')
}
