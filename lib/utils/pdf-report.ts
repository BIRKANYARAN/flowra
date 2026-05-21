// ─────────────────────────────────────────────────────────────────────────────
// lib/utils/pdf-report.ts
//
// Institutional-quality PDF generation for Flowra financial reports.
// Uses jspdf (already installed) for client-side PDF generation.
//
// Design philosophy:
//   • CFO-grade documents — not ERP output, not startup SaaS
//   • Institutional charcoal palette (#0f172a family)
//   • LiberationSans font (with helvetica fallback)
//   • Full-bleed 32mm header band with company initials box
//   • Section title bars with left accent rule
//   • Footer: company · report title | Gizli · Sirket Ici | Sayfa X / Y
//   • Complete CFO Pack: P&L + Tax + Aging + Balance Sheet + Cash Flow
// ─────────────────────────────────────────────────────────────────────────────

// jspdf is loaded dynamically to avoid SSR issues
type JsPDFInstance = import('jspdf').jsPDF

export type PdfOrientation = 'portrait' | 'landscape'

export interface PdfTableRow {
  label:    string
  value:    string
  bold?:    boolean
  indent?:  boolean
  divider?: boolean  // draw a light separator line after this row
  tone?:    'positive' | 'negative' | 'neutral'
}

export interface PdfSection {
  title:    string
  rows:     PdfTableRow[]
}

export interface PdfReportOptions {
  /** Company name shown in header */
  companyName:   string
  /** Report title, e.g. "Gelir Tablosu" */
  reportTitle:   string
  /** Report subtitle / date range */
  subtitle?:     string
  /** Sections to render */
  sections:      PdfSection[]
  /** Filename (without .pdf extension) */
  filename?:     string
  orientation?:  PdfOrientation
}

// ── Palette (institutional charcoal) ─────────────────────────────────────────

const INK        = [15,  23,  42]  as const   // #0f172a — primary text + header bg
const INK_MID    = [51,  65,  85]  as const   // #334155 — secondary text
const INK_LIGHT  = [100, 116, 139] as const   // #64748b — labels, muted
const RULE_MED   = [203, 213, 225] as const   // #cbd5e1 — dividers
const RULE_LIGHT = [241, 245, 249] as const   // #f1f5f9 — zebra bg
const EMERALD    = [4,   120,  87] as const   // positive values
const RED        = [185,  28,  28] as const   // negative values
const WHITE      = [255, 255, 255] as const

// ── Number formatter ──────────────────────────────────────────────────────────

const _fmt = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function fmtPdfAmount(n: number | string | null | undefined): string {
  const v = Number(n) || 0
  return (v < 0 ? '−' : '') + '₺' + _fmt.format(Math.abs(v))
}

// ── Turkish character transliteration (helvetica fallback) ────────────────────

function tr(s: string): string {
  return s
    .replace(/ğ/g, 'g').replace(/Ğ/g, 'G')
    .replace(/ü/g, 'u').replace(/Ü/g, 'U')
    .replace(/ş/g, 's').replace(/Ş/g, 'S')
    .replace(/ı/g, 'i').replace(/İ/g, 'I')
    .replace(/ö/g, 'o').replace(/Ö/g, 'O')
    .replace(/ç/g, 'c').replace(/Ç/g, 'C')
}

// ── Font loading (mirrors generatePdf.ts pattern) ────────────────────────────

async function fetchFontB64(path: string): Promise<string | null> {
  try {
    const res = await fetch(path)
    if (!res.ok) return null
    const buf = await res.arrayBuffer()
    const arr = new Uint8Array(buf)
    let bin = ''
    const CHUNK = 8192
    for (let i = 0; i < arr.byteLength; i += CHUNK)
      bin += String.fromCharCode(...(arr.subarray(i, i + CHUNK) as unknown as number[]))
    return btoa(bin)
  } catch { return null }
}

// ── Core generator ────────────────────────────────────────────────────────────

export async function generatePdfReport(opts: PdfReportOptions): Promise<void> {
  // Dynamic import — keeps bundle from loading jspdf on server
  const { jsPDF } = await import('jspdf')

  const orientation = opts.orientation ?? 'portrait'
  const doc: JsPDFInstance = new jsPDF({
    orientation,
    unit: 'mm',
    format: 'a4',
  })

  const pageW = orientation === 'portrait' ? 210 : 297
  const pageH = orientation === 'portrait' ? 297 : 210
  const margin = 15
  const contentW = pageW - margin * 2

  // ── Load fonts ─────────────────────────────────────────────────────────────
  let FONT = 'helvetica'
  const [regB64, bolB64] = await Promise.all([
    fetchFontB64('/fonts/LiberationSans-Regular.ttf'),
    fetchFontB64('/fonts/LiberationSans-Bold.ttf'),
  ])
  if (regB64 && bolB64) {
    try {
      doc.addFileToVFS('LiberationSans-Regular.ttf', regB64)
      doc.addFont('LiberationSans-Regular.ttf', 'LiberationSans', 'normal')
      doc.addFileToVFS('LiberationSans-Bold.ttf', bolB64)
      doc.addFont('LiberationSans-Bold.ttf', 'LiberationSans', 'bold')
      FONT = 'LiberationSans'
    } catch { FONT = 'helvetica' }
  }

  const useTurkish = FONT === 'LiberationSans'

  // Text helper: transliterate if using helvetica fallback
  function t(s: string): string {
    return useTurkish ? s : tr(s)
  }

  // ── Drawing helpers ────────────────────────────────────────────────────────

  type RGB = readonly [number, number, number]

  function setF(style: 'normal' | 'bold', size: number, col: RGB) {
    doc.setFont(FONT, style)
    doc.setFontSize(size)
    doc.setTextColor(col[0], col[1], col[2])
  }

  let y = 0

  // ── Header band (full-bleed, 32mm) ─────────────────────────────────────────
  const BAND_H = 32

  doc.setFillColor(INK[0], INK[1], INK[2])
  doc.rect(0, 0, pageW, BAND_H, 'F')

  // Company initials box (white bg, 16×16mm, 2mm rounded corners)
  const INIT_X = margin
  const INIT_Y = (BAND_H - 16) / 2
  doc.setFillColor(WHITE[0], WHITE[1], WHITE[2])
  doc.roundedRect(INIT_X, INIT_Y, 16, 16, 2, 2, 'F')

  // Initials text in INK color
  const initials = opts.companyName.slice(0, 2).toUpperCase()
  setF('bold', 9, INK)
  doc.text(initials, INIT_X + 8, INIT_Y + 10, { align: 'center' })

  // Company name — white bold
  setF('bold', 12, WHITE)
  doc.text(opts.companyName, margin + 20, BAND_H / 2 - 1)

  // Flowra Financial OS subtitle — white/60 (dimmed)
  const DIM_WHITE: RGB = [153, 153, 153] as const
  setF('normal', 7.5, DIM_WHITE)
  doc.text('Flowra Financial OS', margin + 20, BAND_H / 2 + 6)

  // Report title (right-aligned, white bold)
  setF('bold', 14, WHITE)
  doc.text(t(opts.reportTitle), pageW - margin, BAND_H / 2 - 2, { align: 'right' })

  // Report subtitle (right-aligned, white/60)
  if (opts.subtitle) {
    setF('normal', 8, DIM_WHITE)
    doc.text(t(opts.subtitle), pageW - margin, BAND_H / 2 + 5, { align: 'right' })
  }

  // Generation date (right-aligned, white/50)
  const DIM_WHITE2: RGB = [128, 128, 128] as const
  const genAt = new Date().toLocaleDateString('tr-TR', {
    year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
  setF('normal', 7, DIM_WHITE2)
  doc.text(t(`Oluşturulma: ${genAt}`), pageW - margin, BAND_H / 2 + 12, { align: 'right' })

  y = BAND_H + 8

  // ── Sections ──────────────────────────────────────────────────────────────
  for (const section of opts.sections) {
    y = ensureSpace(doc, y, 14, pageH, margin, pageW, opts, FONT, useTurkish)

    // Section title bar: RULE_LIGHT fill, 8mm tall
    doc.setFillColor(RULE_LIGHT[0], RULE_LIGHT[1], RULE_LIGHT[2])
    doc.rect(margin, y, contentW, 8, 'F')

    // Left accent rule (3pt wide, INK color)
    doc.setFillColor(INK[0], INK[1], INK[2])
    doc.rect(margin, y, 3, 8, 'F')

    // Section title text
    setF('bold', 9, INK_MID)
    doc.text(t(section.title).toUpperCase(), margin + 6, y + 5.5)

    y += 10

    // Rows
    let rowIdx = 0
    for (const row of section.rows) {
      y = ensureSpace(doc, y, 7, pageH, margin, pageW, opts, FONT, useTurkish)

      if (row.divider) {
        doc.setDrawColor(RULE_MED[0], RULE_MED[1], RULE_MED[2])
        doc.setLineWidth(0.3)
        doc.line(margin, y + 1, pageW - margin, y + 1)
        y += 3
        continue
      }

      const ROW_H = 6.5
      const isHeader = row.bold && !row.indent

      // Zebra: even rows get RULE_LIGHT bg
      if (rowIdx % 2 === 0) {
        doc.setFillColor(RULE_LIGHT[0], RULE_LIGHT[1], RULE_LIGHT[2])
        doc.rect(margin, y, contentW, ROW_H, 'F')
      }

      // Header rows also get RULE_LIGHT bg (overwrite zebra with same, then bold text)
      if (isHeader) {
        doc.setFillColor(RULE_LIGHT[0], RULE_LIGHT[1], RULE_LIGHT[2])
        doc.rect(margin, y, contentW, ROW_H, 'F')
      }

      // Label
      const xLabel = margin + (row.indent ? 8 : 4)
      setF(row.bold ? 'bold' : 'normal', row.bold ? 9 : 8.5, row.bold ? INK : INK_MID)
      doc.text(t(row.label), xLabel, y + ROW_H - 1.5)

      // Value (right-aligned, tone-colored, tabular style)
      const valueColor: RGB = row.tone === 'positive' ? EMERALD
                            : row.tone === 'negative' ? RED
                            : row.bold ? INK : INK_MID
      setF(row.bold ? 'bold' : 'normal', row.bold ? 9 : 8.5, valueColor)
      doc.text(t(row.value), pageW - margin - 2, y + ROW_H - 1.5, { align: 'right' })

      y += ROW_H
      rowIdx++
    }

    y += 5  // space between sections
  }

  // ── Footer on every page ──────────────────────────────────────────────────
  const totalPages = doc.getNumberOfPages()
  const FOOTER_H = 8

  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i)

    // Thin INK rule above footer
    doc.setDrawColor(INK[0], INK[1], INK[2])
    doc.setLineWidth(0.3)
    doc.line(0, pageH - FOOTER_H - 0.5, pageW, pageH - FOOTER_H - 0.5)

    // Full-width RULE_LIGHT band
    doc.setFillColor(RULE_LIGHT[0], RULE_LIGHT[1], RULE_LIGHT[2])
    doc.rect(0, pageH - FOOTER_H, pageW, FOOTER_H, 'F')

    const fy = pageH - FOOTER_H + 5.5

    // LEFT: company name · report title
    setF('normal', 7, INK_LIGHT)
    doc.text(`${opts.companyName} · ${t(opts.reportTitle)}`, margin, fy)

    // CENTER: confidentiality marker
    setF('normal', 6, INK_LIGHT)
    doc.text(t('Gizli · Şirket İçi'), pageW / 2, fy, { align: 'center' })

    // RIGHT: page counter
    setF('normal', 7, INK_LIGHT)
    doc.text(t(`Sayfa ${i} / ${totalPages}`), pageW - margin, fy, { align: 'right' })
  }

  const filename = (opts.filename ?? opts.reportTitle.toLowerCase().replace(/\s+/g, '-')) + '.pdf'
  doc.save(filename)
}

// ── Multi-section CFO Pack ─────────────────────────────────────────────────

export interface CfoPackData {
  companyName:   string
  from:          string
  to:            string
  incomeStatement?: Record<string, number | null>
  balanceSheet?:    Record<string, unknown>
  cashFlow?:        Record<string, unknown>
  taxSummary?:      Record<string, number | null>
  receivablesAging?: { current: number; overdue_30: number; overdue_60: number; overdue_90: number }
}

export async function generateCfoPack(data: CfoPackData): Promise<void> {
  const fmt = fmtPdfAmount

  const pnl   = data.incomeStatement
  const tax   = data.taxSummary
  const aging = data.receivablesAging
  const bs    = data.balanceSheet
  const cf    = data.cashFlow

  const sections: PdfSection[] = []

  // ── 1. Gelir Tablosu ──────────────────────────────────────────────────────
  if (pnl) {
    sections.push({
      title: 'Gelir Tablosu',
      rows: [
        { label: 'Hasılat (Net)',             value: fmt(pnl.revenue_try),         bold: true, tone: 'positive' },
        { label: 'Satışların Maliyeti',       value: fmt(pnl.cost_try),            indent: true, tone: 'negative' },
        { label: 'Brüt Kâr',                  value: fmt(pnl.gross_profit_try),    bold: true },
        { divider: true, label: '', value: '' },
        { label: 'Faaliyet Giderleri',        value: fmt(pnl.expenses_total_try),  indent: true, tone: 'negative' },
        { label: 'Kurumlar Vergisi Matrahı',  value: fmt(pnl.matrah_try),          bold: true },
        {
          label: 'KV (%' + (Number(pnl.corporate_tax_rate) * 100).toFixed(0) + ')',
          value: fmt(pnl.corporate_tax_try),
          indent: true,
          tone: 'negative',
        },
        {
          label: 'Net Kâr (Vergi Sonrası)',
          value: fmt(pnl.net_after_tax_try),
          bold: true,
          tone: Number(pnl.net_after_tax_try) >= 0 ? 'positive' : 'negative',
        },
      ],
    })
  }

  // ── 2. Vergi Özeti ────────────────────────────────────────────────────────
  if (tax) {
    sections.push({
      title: 'Vergi Özeti',
      rows: [
        { label: 'Hesaplanan KDV (Çıktı)',  value: fmt(tax.total_kdv_collected),   tone: 'negative' },
        { label: 'İndirilecek KDV (Girdi)', value: fmt(tax.total_kdv_deductible),  tone: 'positive' },
        { label: 'Net KDV',                  value: fmt(tax.net_kdv),              bold: true },
        { divider: true, label: '', value: '' },
        { label: 'KV Matrahı',              value: fmt(tax.matrah_try),            indent: true },
        { label: 'KV Tahmini',              value: fmt(tax.corporate_tax_try),     bold: true, tone: 'negative' },
      ],
    })
  }

  // ── 3. Alacak Yaşlandırma ─────────────────────────────────────────────────
  if (aging) {
    const total = aging.current + aging.overdue_30 + aging.overdue_60 + aging.overdue_90
    sections.push({
      title: 'Alacak Yaşlandırma',
      rows: [
        { label: '0-30 Gün',     value: fmt(aging.current),    tone: 'positive' },
        { label: '31-60 Gün',    value: fmt(aging.overdue_30), tone: 'neutral' },
        { label: '61-90 Gün',    value: fmt(aging.overdue_60), tone: 'negative' },
        { label: '90+ Gün',      value: fmt(aging.overdue_90), tone: 'negative' },
        { divider: true, label: '', value: '' },
        { label: 'Toplam Alacak', value: fmt(total),           bold: true },
      ],
    })
  }

  // ── 4. Bilanço ────────────────────────────────────────────────────────────
  if (bs) {
    const bsNum = (key: string): number | null => {
      const v = bs[key]
      const n = Number(v)
      return Number.isFinite(n) ? n : null
    }

    const bsRows: PdfTableRow[] = []

    // Assets
    bsRows.push({ label: 'VARLIKLAR', value: '', bold: true })
    if (bsNum('cash') !== null)
      bsRows.push({ label: 'Nakit ve Nakit Benzerleri', value: fmt(bsNum('cash')), indent: true, tone: 'positive' })
    if (bsNum('receivables') !== null)
      bsRows.push({ label: 'Ticari Alacaklar',          value: fmt(bsNum('receivables')), indent: true })
    if (bsNum('inventory') !== null)
      bsRows.push({ label: 'Stoklar',                   value: fmt(bsNum('inventory')), indent: true })
    if (bsNum('total_assets') !== null)
      bsRows.push({ label: 'Toplam Varlıklar',          value: fmt(bsNum('total_assets')), bold: true })

    bsRows.push({ divider: true, label: '', value: '' })

    // Liabilities & equity
    bsRows.push({ label: 'YÜKÜMLÜLÜKLER VE ÖZKAYNAK', value: '', bold: true })
    if (bsNum('trade_payables') !== null)
      bsRows.push({ label: 'Ticari Borçlar',            value: fmt(bsNum('trade_payables')), indent: true, tone: 'negative' })
    if (bsNum('partner_loans') !== null)
      bsRows.push({ label: 'Ortak Kredileri',           value: fmt(bsNum('partner_loans')), indent: true, tone: 'negative' })
    if (bsNum('total_liabilities') !== null)
      bsRows.push({ label: 'Toplam Yükümlülükler',      value: fmt(bsNum('total_liabilities')), bold: true, tone: 'negative' })

    bsRows.push({ divider: true, label: '', value: '' })

    if (bsNum('retained_earnings') !== null)
      bsRows.push({ label: 'Geçmiş Yıl Kârları',       value: fmt(bsNum('retained_earnings')), indent: true })
    if (bsNum('current_period_profit') !== null)
      bsRows.push({ label: 'Dönem Net Kârı',            value: fmt(bsNum('current_period_profit')), indent: true, tone: Number(bsNum('current_period_profit')) >= 0 ? 'positive' : 'negative' })
    if (bsNum('total_equity') !== null)
      bsRows.push({ label: 'Toplam Özkaynak',           value: fmt(bsNum('total_equity')), bold: true, tone: 'positive' })

    sections.push({ title: 'Bilanço', rows: bsRows })
  }

  // ── 5. Nakit Akışı ────────────────────────────────────────────────────────
  if (cf) {
    const cfNum = (key: string): number | null => {
      const v = cf[key]
      const n = Number(v)
      return Number.isFinite(n) ? n : null
    }

    const cfRows: PdfTableRow[] = []

    // Common cash flow fields — render whatever is present
    const cfFields: Array<{ key: string; label: string; indent?: boolean; tone?: PdfTableRow['tone'] }> = [
      { key: 'operating_cash_flow',    label: 'Faaliyetlerden Nakit Akışı' },
      { key: 'net_income',             label: 'Net Gelir (Başlangıç)',         indent: true },
      { key: 'depreciation',           label: 'Amortisman ve İtfa',            indent: true, tone: 'positive' },
      { key: 'working_capital_change', label: 'İşletme Sermayesi Değişimi',    indent: true },
      { key: 'investing_cash_flow',    label: 'Yatırım Faaliyetleri' },
      { key: 'capex',                  label: 'Sermaye Harcamaları (CAPEX)',   indent: true, tone: 'negative' },
      { key: 'financing_cash_flow',    label: 'Finansman Faaliyetleri' },
      { key: 'loan_proceeds',          label: 'Kredi Girişleri',              indent: true, tone: 'positive' },
      { key: 'loan_repayments',        label: 'Kredi Geri Ödemeleri',         indent: true, tone: 'negative' },
      { key: 'dividends_paid',         label: 'Ödenen Temettüler',            indent: true, tone: 'negative' },
      { key: 'net_cash_change',        label: 'Net Nakit Değişimi' },
      { key: 'opening_cash',           label: 'Dönem Başı Nakit',             indent: true },
      { key: 'closing_cash',           label: 'Dönem Sonu Nakit',             tone: 'positive' },
    ]

    for (const field of cfFields) {
      const val = cfNum(field.key)
      if (val !== null) {
        cfRows.push({
          label:  field.label,
          value:  fmt(val),
          bold:   false,
          indent: field.indent,
          tone:   field.tone,
        })
      }
    }

    if (cfRows.length > 0) {
      sections.push({ title: 'Nakit Akışı', rows: cfRows })
    }
  }

  await generatePdfReport({
    companyName:  data.companyName,
    reportTitle:  'CFO Rapor Paketi',
    subtitle:     `${data.from} — ${data.to}`,
    sections,
    filename:     `cfo-pack-${data.from}-${data.to}`,
  })
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function ensureSpace(
  doc: JsPDFInstance,
  y: number,
  needed: number,
  pageH: number,
  margin: number,
  pageW: number,
  opts: PdfReportOptions,
  font: string,
  useTurkish: boolean,
): number {
  if (y + needed > pageH - 15) {
    doc.addPage()

    // Re-draw slim continuation header
    doc.setFillColor(INK[0], INK[1], INK[2])
    doc.rect(0, 0, pageW, 10, 'F')
    doc.setFont(font, 'bold')
    doc.setFontSize(8)
    doc.setTextColor(WHITE[0], WHITE[1], WHITE[2])
    const label = useTurkish
      ? `${opts.companyName}  —  ${opts.reportTitle}`
      : `${opts.companyName}  —  ${tr(opts.reportTitle)}`
    doc.text(label, margin, 7)

    return 18
  }
  return y
}
