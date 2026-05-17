// ─────────────────────────────────────────────────────────────────────────────
// lib/utils/pdf-report.ts
//
// Branded PDF generation utility for Flowra financial reports.
// Uses jspdf (already installed) for client-side PDF generation.
//
// Design:
//   • A4 portrait by default; landscape for wide tables
//   • Flowra violet header (#7c3aed) with company name + logo area
//   • Consistent typography: Helvetica (built-in, no embed needed)
//   • Supports: tables, key-value rows, section headers, footers
//   • All amounts formatted as Turkish locale (₺ prefix, period+comma)
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

// ── Palette ───────────────────────────────────────────────────────────────────

const PRIMARY   = [124, 58, 237] as const   // violet-600
const GRAY_900  = [17,  24,  39] as const
const GRAY_700  = [55,  65,  81] as const
const GRAY_500  = [107, 114, 128] as const
const GRAY_100  = [243, 244, 246] as const
const WHITE     = [255, 255, 255] as const
const EMERALD   = [4,   120,  87] as const
const RED       = [185,  28,  28] as const

// ── Number formatter ──────────────────────────────────────────────────────────

const _fmt = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function fmtPdfAmount(n: number | string | null | undefined): string {
  const v = Number(n) || 0
  return (v < 0 ? '−' : '') + '₺' + _fmt.format(Math.abs(v))
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

  let y = 0

  // ── Header band ───────────────────────────────────────────────────────────
  doc.setFillColor(...PRIMARY)
  doc.rect(0, 0, pageW, 28, 'F')

  // Logo square
  doc.setFillColor(...WHITE)
  doc.roundedRect(margin, 7, 14, 14, 2, 2, 'F')
  doc.setTextColor(...PRIMARY)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  const initials = opts.companyName.slice(0, 2).toUpperCase()
  doc.text(initials, margin + 7, 16, { align: 'center' })

  // Company name
  doc.setTextColor(...WHITE)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.text(opts.companyName, margin + 18, 15)

  // Report title
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.text('Flowra Financial OS', margin + 18, 20)

  // Title (right-aligned)
  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.text(opts.reportTitle, pageW - margin, 14, { align: 'right' })
  if (opts.subtitle) {
    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    doc.text(opts.subtitle, pageW - margin, 20, { align: 'right' })
  }

  y = 36

  // ── Generated-at line ─────────────────────────────────────────────────────
  const generatedAt = new Date().toLocaleDateString('tr-TR', {
    year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
  doc.setFontSize(7.5)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...GRAY_500)
  doc.text(`Oluşturulma: ${generatedAt}`, pageW - margin, y, { align: 'right' })
  y += 6

  // ── Sections ──────────────────────────────────────────────────────────────
  for (const section of opts.sections) {
    // Section title
    y = ensureSpace(doc, y, 14, pageH, margin, pageW, opts)

    doc.setFillColor(...GRAY_100)
    doc.rect(margin, y - 4, contentW, 8, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(...PRIMARY)
    doc.text(section.title.toUpperCase(), margin + 3, y + 0.5)
    y += 7

    // Rows
    for (const row of section.rows) {
      y = ensureSpace(doc, y, 7, pageH, margin, pageW, opts)

      if (row.divider) {
        doc.setDrawColor(220, 220, 220)
        doc.setLineWidth(0.3)
        doc.line(margin, y, pageW - margin, y)
        y += 2
        continue
      }

      const isHeader = row.bold && !row.indent
      if (isHeader) {
        doc.setFillColor(248, 248, 255)
        doc.rect(margin, y - 3.5, contentW, 6.5, 'F')
      }

      // Label
      const xLabel = margin + (row.indent ? 6 : 2)
      doc.setFont('helvetica', row.bold ? 'bold' : 'normal')
      doc.setFontSize(row.bold ? 9 : 8.5)
      const labelColor = row.bold ? GRAY_900 : GRAY_700
      doc.setTextColor(labelColor[0], labelColor[1], labelColor[2])
      doc.text(row.label, xLabel, y)

      // Value
      const valueColor = row.tone === 'positive' ? EMERALD
                       : row.tone === 'negative' ? RED
                       : GRAY_900
      doc.setFont('helvetica', row.bold ? 'bold' : 'normal')
      doc.setFontSize(row.bold ? 9 : 8.5)
      doc.setTextColor(valueColor[0], valueColor[1], valueColor[2])
      doc.text(row.value, pageW - margin - 2, y, { align: 'right' })

      y += 6
    }

    y += 4  // space between sections
  }

  // ── Footer on every page ──────────────────────────────────────────────────
  const totalPages = (doc as unknown as { internal: { pages: unknown[] } }).internal.pages.length - 1
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i)
    doc.setFillColor(...GRAY_100)
    doc.rect(0, pageH - 10, pageW, 10, 'F')
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.setTextColor(...GRAY_500)
    doc.text('Flowra Financial Operating System — Gizli', margin, pageH - 4)
    doc.text(`${i} / ${totalPages}`, pageW - margin, pageH - 4, { align: 'right' })
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

  const pnl = data.incomeStatement
  const tax = data.taxSummary
  const aging = data.receivablesAging

  const sections: PdfSection[] = []

  // Income Statement
  if (pnl) {
    sections.push({
      title: 'Gelir Tablosu',
      rows: [
        { label: 'Hasılat (Net)',        value: fmt(pnl.revenue_try),         bold: true, tone: 'positive' },
        { label: 'Satışların Maliyeti',  value: fmt(pnl.cost_try),            indent: true, tone: 'negative' },
        { label: 'Brüt Kâr',            value: fmt(pnl.gross_profit_try),    bold: true },
        { divider: true, label: '', value: '' },
        { label: 'Faaliyet Giderleri',  value: fmt(pnl.expenses_total_try),  indent: true, tone: 'negative' },
        { label: 'Kurumlar Vergisi Matrahı', value: fmt(pnl.matrah_try),     bold: true },
        { label: 'KV (%' + ((Number(pnl.corporate_tax_rate) * 100).toFixed(0)) + ')', value: fmt(pnl.corporate_tax_try), indent: true, tone: 'negative' },
        { label: 'Net Kâr (Vergi Sonrası)', value: fmt(pnl.net_after_tax_try), bold: true, tone: Number(pnl.net_after_tax_try) >= 0 ? 'positive' : 'negative' },
      ],
    })
  }

  // Tax Summary
  if (tax) {
    sections.push({
      title: 'Vergi Özeti',
      rows: [
        { label: 'Hesaplanan KDV (Çıktı)', value: fmt(tax.total_kdv_collected),   tone: 'negative' },
        { label: 'İndirilecek KDV (Girdi)', value: fmt(tax.total_kdv_deductible), tone: 'positive' },
        { label: 'Net KDV',                 value: fmt(tax.net_kdv),              bold: true },
        { divider: true, label: '', value: '' },
        { label: 'KV Matrahı',     value: fmt(tax.matrah_try),            indent: true },
        { label: 'KV Tahmini',     value: fmt(tax.corporate_tax_try),     bold: true, tone: 'negative' },
      ],
    })
  }

  // Receivables Aging
  if (aging) {
    const total = aging.current + aging.overdue_30 + aging.overdue_60 + aging.overdue_90
    sections.push({
      title: 'Alacak Yaşlandırma',
      rows: [
        { label: '0-30 Gün',         value: fmt(aging.current),    tone: 'positive' },
        { label: '31-60 Gün',        value: fmt(aging.overdue_30), tone: 'neutral' },
        { label: '61-90 Gün',        value: fmt(aging.overdue_60), tone: 'negative' },
        { label: '90+ Gün',          value: fmt(aging.overdue_90), tone: 'negative' },
        { divider: true, label: '', value: '' },
        { label: 'Toplam Alacak',    value: fmt(total),            bold: true },
      ],
    })
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
): number {
  if (y + needed > pageH - 15) {
    doc.addPage()
    // Re-draw slim header on continuation pages
    doc.setFillColor(...PRIMARY)
    doc.rect(0, 0, pageW, 10, 'F')
    doc.setTextColor(...WHITE)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.text(`${opts.companyName}  —  ${opts.reportTitle}`, margin, 7)
    return 18
  }
  return y
}
