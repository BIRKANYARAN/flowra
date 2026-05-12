// lib/finance/balance-sheet.ts
// ──────────────────────────────────────────────────────────────────────────────
// Balance Sheet (Bilanço) derived from existing CfoMetrics + FinanceService.
//
// Simplified Turkish SME balance sheet — accrual basis:
//
//  VARLIKLAR (Assets)
//    Dönen Varlıklar (Current):
//      • Nakit ve Nakit Benzerleri   — cash.true_cash_position
//      • Ticari Alacaklar            — receivables.total_outstanding
//      • Stok                        — stock.fifo_value
//    Duran Varlıklar (Non-current):
//      • (not tracked yet — shown as zero)
//
//  KAYNAKLAR (Liabilities + Equity)
//    Kısa Vadeli Yükümlülükler:
//      • KDV Yükümlülüğü             — tax.kdv_net (if > 0)
//      • Kurumlar Vergisi Tahmini    — tax.corporate_tax_estimate
//      • Ortak Alacakları            — partner.company_owes
//    Uzun Vadeli Yükümlülükler:
//      • (not tracked yet)
//    Özsermaye:
//      • Ortakların Koyduğu Sermaye  — partner.total_equity
//      • Dağıtılmamış Kâr/Zarar     — residual (assets − liabilities − equity)

import type { CfoMetrics } from '@/lib/finance/cfo-metrics'

// ── Types ──────────────────────────────────────────────────────────────────────

export interface BalanceSheetLine {
  label:   string
  amount:  number
  indent?: boolean
  isTotal?: boolean
  sub?:    string
}

export interface BalanceSheet {
  // Assets
  currentAssets: {
    cash:        number
    receivables: number
    inventory:   number
    total:       number
  }
  nonCurrentAssets: {
    total: number
  }
  totalAssets: number

  // Liabilities
  currentLiabilities: {
    vatPayable:       number
    corporateTax:     number
    partnerPayable:   number
    total:            number
  }
  nonCurrentLiabilities: {
    total: number
  }
  totalLiabilities: number

  // Equity
  equity: {
    paidInCapital:     number
    retainedEarnings:  number   // residual — assets - liabilities - paid-in
    total:             number
  }

  totalLiabilitiesAndEquity: number
  isBalanced:                boolean  // should be ~true within rounding
}

// ── Computation ───────────────────────────────────────────────────────────────

export function computeBalanceSheet(metrics: CfoMetrics): BalanceSheet {
  // ── Assets ──────────────────────────────────────────────────────────────────
  const cash        = metrics.cash.true_cash_position
  const receivables = metrics.receivables.total_outstanding
  const inventory   = metrics.stock.fifo_value
  const totalCurrent    = cash + receivables + inventory
  const totalNonCurrent = 0
  const totalAssets     = totalCurrent + totalNonCurrent

  // ── Liabilities ─────────────────────────────────────────────────────────────
  const vatPayable     = Math.max(0, metrics.tax.kdv_net)
  const corporateTax   = metrics.tax.corporate_tax_estimate
  const partnerPayable = metrics.partner.company_owes
  const totalCurrentLiab    = vatPayable + corporateTax + partnerPayable
  const totalNonCurrentLiab = 0
  const totalLiabilities    = totalCurrentLiab + totalNonCurrentLiab

  // ── Equity ───────────────────────────────────────────────────────────────────
  const paidInCapital    = metrics.partner.total_equity
  // Retained earnings = residual balancing figure
  const retainedEarnings = totalAssets - totalLiabilities - paidInCapital
  const totalEquity      = paidInCapital + retainedEarnings

  const totalLiabilitiesAndEquity = totalLiabilities + totalEquity
  const isBalanced = Math.abs(totalAssets - totalLiabilitiesAndEquity) < 1

  return {
    currentAssets:     { cash, receivables, inventory, total: totalCurrent },
    nonCurrentAssets:  { total: totalNonCurrent },
    totalAssets,
    currentLiabilities: { vatPayable, corporateTax, partnerPayable, total: totalCurrentLiab },
    nonCurrentLiabilities: { total: totalNonCurrentLiab },
    totalLiabilities,
    equity: { paidInCapital, retainedEarnings, total: totalEquity },
    totalLiabilitiesAndEquity,
    isBalanced,
  }
}

// ── Flattened rows for rendering ──────────────────────────────────────────────

export function balanceSheetRows(bs: BalanceSheet): {
  assets: BalanceSheetLine[]
  liabilitiesAndEquity: BalanceSheetLine[]
} {
  const assets: BalanceSheetLine[] = [
    { label: 'Dönen Varlıklar', amount: bs.currentAssets.total, isTotal: false, indent: false },
    { label: 'Nakit ve Nakit Benzerleri', amount: bs.currentAssets.cash,        indent: true },
    { label: 'Ticari Alacaklar',          amount: bs.currentAssets.receivables, indent: true },
    { label: 'Stok (FIFO)',               amount: bs.currentAssets.inventory,   indent: true },
    { label: 'Toplam Dönen Varlıklar',   amount: bs.currentAssets.total, isTotal: true },
    { label: 'Duran Varlıklar',          amount: 0, indent: false, sub: 'Henüz takip edilmiyor' },
    { label: 'TOPLAM VARLIKLAR',         amount: bs.totalAssets, isTotal: true },
  ]

  const liabilitiesAndEquity: BalanceSheetLine[] = [
    { label: 'Kısa Vadeli Yükümlülükler', amount: bs.currentLiabilities.total, indent: false },
    { label: 'KDV Yükümlülüğü',           amount: bs.currentLiabilities.vatPayable,     indent: true },
    { label: 'Kurumlar Vergisi Tahmini',  amount: bs.currentLiabilities.corporateTax,   indent: true },
    { label: 'Ortaklara Borç',            amount: bs.currentLiabilities.partnerPayable, indent: true },
    { label: 'Toplam Kısa Vadeli',        amount: bs.currentLiabilities.total, isTotal: true },
    { label: 'Uzun Vadeli Yükümlülükler', amount: 0, indent: false, sub: 'Henüz takip edilmiyor' },
    { label: 'Toplam Yükümlülükler',     amount: bs.totalLiabilities, isTotal: true },
    { label: 'Özsermaye', amount: bs.equity.total, indent: false },
    { label: 'Ödenmiş Sermaye (Ortak Katkısı)', amount: bs.equity.paidInCapital,    indent: true },
    { label: 'Dağıtılmamış Kâr / Zarar',         amount: bs.equity.retainedEarnings, indent: true },
    { label: 'Toplam Özsermaye',         amount: bs.equity.total, isTotal: true },
    { label: 'TOPLAM KAYNAKLAR',         amount: bs.totalLiabilitiesAndEquity, isTotal: true },
  ]

  return { assets, liabilitiesAndEquity }
}
