// ═══════════════════════════════════════════════════════════════════════════════
// lib/pdf/reconciliation.pdf.ts
//
// Institutional 19-section jsPDF PDF for the Ortak Mutabakat Dosyası.
// Client-side only — uses jsPDF + LiberationSans font.
//
// PALETTE:
//   INK       #0f172a   primary text + header bg
//   INK_MID   #334155   secondary
//   INK_LIGHT #64748b   tertiary
//   RULE      #e2e8f0   lines / borders
//   RULE_LIGHT #f8fafc  section backgrounds
//   WHITE     #ffffff
//   POSITIVE  #16a34a   healthy green
//   WARNING   #d97706   amber warning
//   CRITICAL  #dc2626   red critical
// ═══════════════════════════════════════════════════════════════════════════════

import type {
  ReconciliationData,
  ReconSection2_Treasury,
  ReconSection3_Receivables,
  ReconSection4_Payables,
  ReconSection5_Inventory,
  ReconSection6_FixedAssets,
  ReconSection7_TaxPosition,
  ReconSection8_Financing,
  ReconSection9_EquityStructure,
  ReconSection10_PartnerReceivables,
  ReconSection11_PartnerLiabilities,
  ReconSection12_DebtTranches,
  ReconSection13_Distributions,
  ReconSection14_BalanceSheet,
  ReconSection15_PnL,
  ReconSection16_GovernanceRisks,
  GovernanceFinding,
} from '@/types/reconciliation'

// ── Types ─────────────────────────────────────────────────────────────────────

type RGB = [number, number, number]

// ── Palette ───────────────────────────────────────────────────────────────────

const INK:        RGB = [15,  23,  42]
const INK_MID:    RGB = [51,  65,  85]
const INK_LIGHT:  RGB = [100, 116, 139]
const RULE:       RGB = [226, 232, 240]
const RULE_LIGHT: RGB = [248, 250, 252]
const WHITE:      RGB = [255, 255, 255]
const POSITIVE:   RGB = [22,  163,  74]
const WARNING:    RGB = [217, 119,   6]
const CRITICAL:   RGB = [220,  38,  38]

// ── Page constants ────────────────────────────────────────────────────────────

const PAGE_W  = 210
const PAGE_H  = 297
const ML      = 15
const MR      = 15
const LX      = ML
const RX      = PAGE_W - MR
const CX      = PAGE_W / 2
const CONTENT_W = PAGE_W - ML - MR
const PAGE_MB = 18   // bottom margin

// ── Font paths ────────────────────────────────────────────────────────────────

const FONT_REG  = '/fonts/LiberationSans-Regular.ttf'
const FONT_BOLD = '/fonts/LiberationSans-Bold.ttf'

// ── Formatters ────────────────────────────────────────────────────────────────

const _tryFmt = new Intl.NumberFormat('tr-TR', {
  style: 'currency', currency: 'TRY', maximumFractionDigits: 0,
})

function fmt(n: number | null | undefined): string {
  if (n == null) return '—'
  return _tryFmt.format(n)
}

function pct(n: number | null | undefined): string {
  if (n == null) return '—'
  return n.toFixed(2) + '%'
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString('tr-TR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
    })
  } catch { return iso }
}

// ── Font loading ──────────────────────────────────────────────────────────────

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

// ── Turkish transliteration fallback ─────────────────────────────────────────

function tr(s: string): string {
  return s
    .replace(/ğ/g, 'g').replace(/Ğ/g, 'G')
    .replace(/ü/g, 'u').replace(/Ü/g, 'U')
    .replace(/ş/g, 's').replace(/Ş/g, 'S')
    .replace(/ı/g, 'i').replace(/İ/g, 'I')
    .replace(/ö/g, 'o').replace(/Ö/g, 'O')
    .replace(/ç/g, 'c').replace(/Ç/g, 'C')
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN EXPORT
// ═══════════════════════════════════════════════════════════════════════════════

export async function generateReconciliationPdf(snapshot: {
  title:                string
  period_label:         string | null
  reconciliation_date:  string
  data_hash:            string | null
  confidence_score:     number | null
  sections:             ReconciliationData
  signoffs:             Array<{
    partner_name:  string
    ownership_pct: number
    status:        string
    signed_at:     string | null
    comments:      string | null
  }>
}): Promise<void> {
  // ── Load jsPDF ──────────────────────────────────────────────────────────────
  const { default: jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })

  // ── Load font ───────────────────────────────────────────────────────────────
  let FONT = 'helvetica'
  const [regB64, bolB64] = await Promise.all([fetchFontB64(FONT_REG), fetchFontB64(FONT_BOLD)])
  if (regB64 && bolB64) {
    try {
      doc.addFileToVFS('LiberationSans-Regular.ttf', regB64)
      doc.addFont('LiberationSans-Regular.ttf', 'LiberationSans', 'normal')
      doc.addFileToVFS('LiberationSans-Bold.ttf', bolB64)
      doc.addFont('LiberationSans-Bold.ttf', 'LiberationSans', 'bold')
      FONT = 'LiberationSans'
    } catch { FONT = 'helvetica' }
  }
  const useTR = FONT === 'LiberationSans'
  function t(s: string): string { return useTR ? s : tr(s) }

  // ── Drawing primitives ──────────────────────────────────────────────────────

  let curY = 0
  let FONT_NAME = FONT

  function setF(style: 'normal' | 'bold', size: number, col: RGB) {
    doc.setFont(FONT_NAME, style)
    doc.setFontSize(size)
    doc.setTextColor(col[0], col[1], col[2])
  }

  function tL(text: string, x: number, y: number) { doc.text(text, x, y) }
  function tR(text: string, x: number, y: number) { doc.text(text, x, y, { align: 'right' }) }
  function tC(text: string, x: number, y: number) { doc.text(text, x, y, { align: 'center' }) }

  function fillR(x: number, y: number, w: number, h: number, col: RGB) {
    doc.setFillColor(col[0], col[1], col[2])
    doc.rect(x, y, w, h, 'F')
  }

  function hLine(y: number, x1 = LX, x2 = RX, col: RGB = RULE, lw = 0.2) {
    doc.setDrawColor(col[0], col[1], col[2])
    doc.setLineWidth(lw)
    doc.line(x1, y, x2, y)
  }

  // ── Page management ─────────────────────────────────────────────────────────

  const CONTENT_B = PAGE_H - PAGE_MB

  function newPage() {
    doc.addPage()
    // Thin top rule on continuation pages
    fillR(0, 0, PAGE_W, 1.5, INK)
    curY = 8
  }

  function ensureSpace(needed: number): void {
    if (curY + needed > CONTENT_B) newPage()
  }

  // ── Section header bar ──────────────────────────────────────────────────────

  function sectionHeader(num: number, title: string) {
    ensureSpace(14)
    fillR(LX, curY, CONTENT_W, 8, INK)
    setF('bold', 7, WHITE)
    tL(`${String(num).padStart(2, '0')}  ${t(title.toUpperCase())}`, LX + 3, curY + 5.5)
    curY += 8
    // Left accent rule + light background follows in content area
    fillR(LX, curY, CONTENT_W, 1, RULE)
  }

  // ── KV row ──────────────────────────────────────────────────────────────────

  function kvRow(label: string, value: string, bold = false) {
    ensureSpace(7)
    fillR(LX, curY, CONTENT_W, 6.5, curY % 13 < 7 ? WHITE : RULE_LIGHT)
    // Left accent bar
    fillR(LX, curY, 2, 6.5, INK)
    setF('normal', 7, INK_LIGHT)
    tL(t(label), LX + 4, curY + 4.5)
    if (bold) setF('bold', 7, INK)
    else setF('normal', 7, INK_MID)
    tR(value, RX, curY + 4.5)
    curY += 6.5
  }

  // ── Money KV (right-aligned value) ──────────────────────────────────────────

  function moneyRow(label: string, value: number | null, emphasize = false) {
    kvRow(label, fmt(value), emphasize)
  }

  // ── Simple table ─────────────────────────────────────────────────────────────

  function drawTable(cols: string[], widths: number[], rows: string[][]) {
    const ROW_H = 7
    const THEAD_H = 8
    const tableW = widths.reduce((a, b) => a + b, 0)

    ensureSpace(THEAD_H + ROW_H * 2)

    // Header
    fillR(LX, curY, tableW, THEAD_H, INK)
    let cx = LX
    cols.forEach((col, i) => {
      setF('bold', 6, WHITE)
      tL(t(col), cx + 2, curY + 5.5)
      cx += widths[i]
    })
    curY += THEAD_H

    // Rows
    rows.forEach((row, ri) => {
      ensureSpace(ROW_H + 2)
      fillR(LX, curY, tableW, ROW_H, ri % 2 === 0 ? WHITE : RULE_LIGHT)
      // Left accent rule
      fillR(LX, curY, 2, ROW_H, INK)
      let cx2 = LX
      row.forEach((cell, ci) => {
        setF('normal', 6.5, INK_MID)
        const cellW = widths[ci]
        const cellText = String(cell ?? '—')
        const lines = doc.splitTextToSize(cellText, cellW - 4) as string[]
        tL(lines[0] ?? '', cx2 + 2, curY + 4.5)
        cx2 += cellW
      })
      hLine(curY + ROW_H, LX, LX + tableW, RULE, 0.1)
      curY += ROW_H
    })
    curY += 3
  }

  // ── Aging table ──────────────────────────────────────────────────────────────

  function drawAgingTable(aging: {
    bucket_0_30: number; bucket_31_60: number; bucket_61_90: number; bucket_90plus: number
  }) {
    const w = CONTENT_W / 4
    drawTable(
      ['0-30 Gün', '31-60 Gün', '61-90 Gün', '90+ Gün'],
      [w, w, w, w],
      [[fmt(aging.bucket_0_30), fmt(aging.bucket_31_60), fmt(aging.bucket_61_90), fmt(aging.bucket_90plus)]],
    )
  }

  // ── Summary metric boxes ──────────────────────────────────────────────────────

  function metricRow(items: Array<{ label: string; value: string; color?: RGB }>) {
    ensureSpace(16)
    const boxW = CONTENT_W / items.length
    items.forEach((item, i) => {
      const bx = LX + i * boxW
      fillR(bx, curY, boxW - 1, 14, RULE_LIGHT)
      fillR(bx, curY, 2, 14, INK)
      setF('normal', 6, INK_LIGHT)
      tL(t(item.label.toUpperCase()), bx + 4, curY + 5)
      setF('bold', 8, item.color ?? INK)
      tL(item.value, bx + 4, curY + 11.5)
    })
    curY += 16
  }

  // ── Gap ──────────────────────────────────────────────────────────────────────

  function gap(mm: number) {
    ensureSpace(mm)
    curY += mm
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DOCUMENT HEADER (page 1)
  // ═══════════════════════════════════════════════════════════════════════════

  const s = snapshot.sections
  const companyName = s.section1.company_name || 'Şirket'
  const initials = companyName.trim().slice(0, 2).toUpperCase()

  // Full-bleed dark band
  fillR(0, 0, PAGE_W, 32, INK)

  // Initials box
  fillR(LX, 8, 16, 16, [30, 45, 65])
  setF('bold', 9, WHITE)
  tC(initials, LX + 8, 18.5)

  // Company name
  setF('bold', 13, WHITE)
  tL(t(companyName), LX + 20, 15)

  // Document type label
  setF('bold', 7, [100, 116, 139])
  tR(t('ORTAK MUTABAKAT DOSYASI'), RX, 11)
  setF('normal', 8, [148, 163, 184])
  tR(t(snapshot.period_label ?? snapshot.reconciliation_date), RX, 19)
  tR(fmtDate(snapshot.reconciliation_date), RX, 26)

  curY = 36

  // Identifier strip
  fillR(0, curY, PAGE_W, 10, [22, 35, 55])
  setF('normal', 6.5, [100, 116, 139])
  const hashStr = snapshot.data_hash ? `SHA-256: ${snapshot.data_hash.slice(0, 16)}…` : ''
  const confStr = `${t('Güven')}: ${snapshot.confidence_score ?? 0}/100`
  tL(hashStr, LX, curY + 7)
  tC(t(`Dönem: ${snapshot.period_label ?? snapshot.reconciliation_date}`), CX, curY + 7)
  tR(confStr, RX, curY + 7)
  curY += 14

  // ═════════════════════════════════════════════════════════════════════════
  // SECTION 1 — Company Identity
  // ═════════════════════════════════════════════════════════════════════════

  sectionHeader(1, 'Şirket Kimliği')
  gap(1)
  kvRow('Şirket Adı',        s.section1.company_name ?? '—')
  kvRow('VKN',               s.section1.tax_number ?? '—')
  kvRow('Vergi Dairesi',     s.section1.tax_office ?? '—')
  kvRow('MERSIS No',         s.section1.mersis_no ?? '—')
  kvRow('Ticaret Sicil',     s.section1.trade_registry ?? '—')
  kvRow('Adres',             s.section1.address ?? '—')
  kvRow('Telefon',           s.section1.phone ?? '—')
  kvRow('E-posta',           s.section1.email ?? '—')
  kvRow('Website',           s.section1.website ?? '—')
  kvRow('Dönem',             s.section1.period_label ?? '—')
  gap(4)

  // ═════════════════════════════════════════════════════════════════════════
  // SECTION 2 — Treasury
  // ═════════════════════════════════════════════════════════════════════════

  const t2 = s.section2 as ReconSection2_Treasury
  sectionHeader(2, 'Hazine & Nakit')
  gap(1)
  metricRow([
    { label: 'Toplam Nakit', value: fmt(t2.total_cash_try) },
    { label: 'Kullanılabilir', value: fmt(t2.available_cash_try), color: POSITIVE },
    { label: 'Bloke', value: fmt(t2.restricted_cash_try), color: WARNING },
  ])
  if (t2.bank_accounts.length > 0) {
    setF('bold', 6.5, INK_LIGHT)
    tL(t('BANKA HESAPLARI'), LX, curY)
    gap(5)
    drawTable(
      ['Banka', 'Hesap Tipi', 'Bakiye (TRY)', 'Döviz'],
      [55, 40, 50, 35],
      t2.bank_accounts.map(b => [b.bank_name, b.account_type, fmt(b.balance_try), b.currency]),
    )
  }
  if (t2.fx_exposure.length > 0) {
    setF('bold', 6.5, INK_LIGHT)
    tL(t('DÖVİZ POZİSYONU'), LX, curY)
    gap(5)
    drawTable(
      ['Döviz', 'Tutar', 'TRY Karşılığı'],
      [40, 60, 80],
      t2.fx_exposure.map(fx => [fx.currency, fx.amount.toLocaleString('tr-TR'), fmt(fx.try_equiv)]),
    )
  }
  gap(4)

  // ═════════════════════════════════════════════════════════════════════════
  // SECTION 3 — Receivables
  // ═════════════════════════════════════════════════════════════════════════

  const t3 = s.section3 as ReconSection3_Receivables
  sectionHeader(3, 'Alacaklar')
  gap(1)
  metricRow([
    { label: 'Toplam Alacak', value: fmt(t3.total_receivables_try) },
    { label: 'Vadesi Geçmiş', value: fmt(t3.overdue_receivables_try), color: CRITICAL },
    { label: 'Şüpheli', value: fmt(t3.doubtful_try), color: WARNING },
  ])
  setF('bold', 6.5, INK_LIGHT)
  tL(t('YAŞLANDIRMA ANALİZİ'), LX, curY)
  gap(5)
  drawAgingTable(t3.aging)
  if (t3.top_customers.length > 0) {
    setF('bold', 6.5, INK_LIGHT)
    tL(t('ÖNEMLİ MÜŞTERİLER'), LX, curY)
    gap(5)
    drawTable(
      ['Müşteri', 'Bakiye', 'Yaş (Gün)', 'Durum'],
      [60, 45, 30, 45],
      t3.top_customers.map(c => [c.name, fmt(c.outstanding), String(c.oldest_days), c.status]),
    )
  }
  kvRow('Konsantrasyon %', pct(t3.concentration_pct))
  gap(4)

  // ═════════════════════════════════════════════════════════════════════════
  // SECTION 4 — Payables
  // ═════════════════════════════════════════════════════════════════════════

  const t4 = s.section4 as ReconSection4_Payables
  sectionHeader(4, 'Borçlar (Ticari)')
  gap(1)
  metricRow([
    { label: 'Toplam Borç', value: fmt(t4.total_payables_try) },
    { label: '7 Gün İçinde', value: fmt(t4.upcoming_7d_try), color: CRITICAL },
    { label: '30 Gün İçinde', value: fmt(t4.upcoming_30d_try), color: WARNING },
  ])
  setF('bold', 6.5, INK_LIGHT)
  tL(t('YAŞLANDIRMA ANALİZİ'), LX, curY)
  gap(5)
  drawAgingTable(t4.aging)
  if (t4.top_suppliers.length > 0) {
    setF('bold', 6.5, INK_LIGHT)
    tL(t('ÖNEMLİ TEDARİKÇİLER'), LX, curY)
    gap(5)
    drawTable(
      ['Tedarikçi', 'Bakiye', 'Vade'],
      [70, 55, 55],
      t4.top_suppliers.map(sup => [sup.name, fmt(sup.balance), fmtDate(sup.due_date)]),
    )
  }
  gap(4)

  // ═════════════════════════════════════════════════════════════════════════
  // SECTION 5 — Inventory
  // ═════════════════════════════════════════════════════════════════════════

  const t5 = s.section5 as ReconSection5_Inventory
  sectionHeader(5, 'Stok')
  gap(1)
  metricRow([
    { label: 'Toplam Değer', value: fmt(t5.total_inventory_try) },
    { label: 'Ürün Sayısı', value: String(t5.item_count) },
    { label: 'Kritik Stok', value: String(t5.critical_stock_count), color: CRITICAL },
  ])
  if (t5.top_items.length > 0) {
    drawTable(
      ['Ürün', 'Adet', 'Birim Maliyet', 'Toplam Değer'],
      [60, 25, 47, 48],
      t5.top_items.map(it => [
        it.name,
        it.qty.toLocaleString('tr-TR'),
        fmt(it.unit_cost),
        fmt(it.total_value),
      ]),
    )
  }
  if (t5.last_count_date) {
    kvRow('Son Sayım Tarihi', fmtDate(t5.last_count_date))
  }
  gap(4)

  // ═════════════════════════════════════════════════════════════════════════
  // SECTION 6 — Fixed Assets
  // ═════════════════════════════════════════════════════════════════════════

  const t6 = s.section6 as ReconSection6_FixedAssets
  sectionHeader(6, 'Sabit Kıymetler')
  gap(1)
  metricRow([
    { label: 'Brüt Değer', value: fmt(t6.total_gross_try) },
    { label: 'Birikim Amortisman', value: fmt(t6.accumulated_depreciation), color: WARNING },
    { label: 'Net Defter Değeri', value: fmt(t6.net_carrying_value), color: POSITIVE },
  ])
  if (t6.assets.length > 0) {
    drawTable(
      ['Varlık', 'Kategori', 'Brüt Değer', 'Net Değer'],
      [55, 40, 47, 38],
      t6.assets.map(a => [a.description, a.category, fmt(a.gross_value), fmt(a.net_value)]),
    )
  }
  gap(4)

  // ═════════════════════════════════════════════════════════════════════════
  // SECTION 7 — Tax Position
  // ═════════════════════════════════════════════════════════════════════════

  const t7 = s.section7 as ReconSection7_TaxPosition
  sectionHeader(7, 'Vergi Pozisyonu')
  gap(1)
  kvRow('KDV Çıktı',         fmt(t7.kdv_output_try))
  kvRow('KDV Girdi',         fmt(t7.kdv_input_try))
  kvRow('Net KDV',           fmt(t7.net_kdv_try), true)
  kvRow('Kurumlar Vergisi',  fmt(t7.corporate_tax_try))
  kvRow('Stopaj',            fmt(t7.withholding_try))
  kvRow('Gecikmiş Vergi',    fmt(t7.overdue_tax_try), t7.overdue_tax_try > 0)
  kvRow('SGK Yükümlülüğü',   fmt(t7.sgk_obligation_try))
  if (t7.pending_declarations.length > 0) {
    ensureSpace(8)
    setF('normal', 6.5, INK_LIGHT)
    tL(t('Bekleyen Beyannameler: ') + t7.pending_declarations.join(', '), LX + 4, curY + 4.5)
    curY += 7
  }
  gap(4)

  // ═════════════════════════════════════════════════════════════════════════
  // SECTION 8 — Financing
  // ═════════════════════════════════════════════════════════════════════════

  const t8 = s.section8 as ReconSection8_Financing
  sectionHeader(8, 'Finansman')
  gap(1)
  kvRow('Toplam Borç', fmt(t8.total_debt_try), true)
  if (t8.items.length > 0) {
    gap(3)
    drawTable(
      ['Borç Veren', 'Tür', 'Bakiye', 'Aylık Yük', 'Vade'],
      [45, 30, 40, 35, 30],
      t8.items.map(item => [
        item.lender,
        item.type,
        fmt(item.balance_try),
        fmt(item.monthly_burden),
        fmtDate(item.maturity_date),
      ]),
    )
  }
  gap(4)

  // ═════════════════════════════════════════════════════════════════════════
  // SECTION 9 — Equity Structure
  // ═════════════════════════════════════════════════════════════════════════

  const t9 = s.section9 as ReconSection9_EquityStructure
  sectionHeader(9, 'Özsermaye Yapısı')
  gap(1)
  kvRow('Toplam Sermaye', fmt(t9.total_capital_try), true)
  if (t9.shareholders.length > 0) {
    gap(3)
    drawTable(
      ['Ortak', 'Hisse %', 'Ödenen Sermaye', 'Özsermaye Payı'],
      [50, 25, 50, 55],
      t9.shareholders.map(sh => [
        sh.name,
        pct(sh.ownership_pct),
        fmt(sh.paid_capital_try),
        fmt(sh.equity_value_try),
      ]),
    )
  }
  gap(4)

  // ═════════════════════════════════════════════════════════════════════════
  // SECTION 10 — Partner Receivables
  // ═════════════════════════════════════════════════════════════════════════

  const t10 = s.section10 as ReconSection10_PartnerReceivables
  sectionHeader(10, 'Ortak Alacakları')
  gap(1)
  kvRow('Toplam Ortak Borçları', fmt(t10.total_partner_loans_try), true)
  if (t10.partners.length > 0) {
    gap(3)
    drawTable(
      ['Ortak', 'Hisse %', 'Toplam', 'Ödenen', 'Bakiye', 'Faiz'],
      [40, 20, 33, 33, 33, 21],
      t10.partners.map(p => [
        p.partner_name,
        pct(p.ownership_pct),
        fmt(p.loan_total_try),
        fmt(p.repaid_try),
        fmt(p.outstanding_try),
        fmt(p.accrued_interest),
      ]),
    )
  }
  gap(4)

  // ═════════════════════════════════════════════════════════════════════════
  // SECTION 11 — Partner Liabilities
  // ═════════════════════════════════════════════════════════════════════════

  const t11 = s.section11 as ReconSection11_PartnerLiabilities
  sectionHeader(11, 'Ortak Borçları')
  gap(1)
  kvRow('Toplam Ortak Borçları', fmt(t11.total_partner_debt_try), true)
  if (t11.partners.length > 0) {
    gap(3)
    drawTable(
      ['Ortak', 'Bakiye', 'Not'],
      [50, 50, 80],
      t11.partners.map(p => [p.partner_name, fmt(p.outstanding_try), p.repayment_note ?? '—']),
    )
  }
  gap(4)

  // ═════════════════════════════════════════════════════════════════════════
  // SECTION 12 — Debt Tranches
  // ═════════════════════════════════════════════════════════════════════════

  const t12 = s.section12 as ReconSection12_DebtTranches
  sectionHeader(12, 'Borç Dilimleri')
  gap(1)
  kvRow('Toplam Dilim Borcu', fmt(t12.total_tranches_try), true)
  if (t12.tranches.length > 0) {
    gap(3)
    drawTable(
      ['Ortak', 'Dilim', 'Açılış', 'Kalan', 'Faiz %', 'Vade', 'Durum'],
      [30, 20, 32, 32, 16, 25, 25],
      t12.tranches.map(tr => [
        tr.partner_name,
        tr.tranche_label,
        fmt(tr.opening_try),
        fmt(tr.remaining_try),
        pct(tr.interest_rate),
        fmtDate(tr.maturity_date),
        tr.status,
      ]),
    )
  }
  gap(4)

  // ═════════════════════════════════════════════════════════════════════════
  // SECTION 13 — Distributions
  // ═════════════════════════════════════════════════════════════════════════

  const t13 = s.section13 as ReconSection13_Distributions
  sectionHeader(13, 'Dağıtımlar & Temettü')
  gap(1)
  metricRow([
    { label: 'YTD Dağıtılan', value: fmt(t13.total_distributed_try) },
    { label: 'Bekleyen', value: fmt(t13.pending_distributions_try), color: WARNING },
    { label: 'Dağıtılabilir', value: fmt(t13.distributable_profit_try), color: POSITIVE },
    { label: 'Geçmiş Yıl', value: fmt(t13.retained_earnings_try) },
  ])
  if (t13.history.length > 0) {
    drawTable(
      ['Tarih', 'Tür', 'Brüt', 'Stopaj', 'Net'],
      [30, 30, 40, 40, 40],
      t13.history.map(h => [
        fmtDate(h.date),
        h.type,
        fmt(h.gross_try),
        fmt(h.withholding_try),
        fmt(h.net_try),
      ]),
    )
  }
  gap(4)

  // ═════════════════════════════════════════════════════════════════════════
  // SECTION 14 — Balance Sheet (two-column layout)
  // ═════════════════════════════════════════════════════════════════════════

  const t14 = s.section14 as ReconSection14_BalanceSheet
  sectionHeader(14, 'Bilanço')
  gap(2)

  const bsColW = (CONTENT_W - 4) / 2
  const bsRX2  = LX + bsColW + 4
  ensureSpace(70)

  function bsHeader(label: string, x: number) {
    fillR(x, curY, bsColW, 7, [30, 45, 65])
    setF('bold', 7, WHITE)
    tL(t(label), x + 3, curY + 5)
  }

  const bsStartY = curY
  bsHeader('AKTİF', LX)
  bsHeader('PASİF', bsRX2)
  curY += 7

  function bsRow(label: string, value: string, x: number, bold = false) {
    fillR(x, curY, bsColW, 6.5, curY % 13 < 7 ? WHITE : RULE_LIGHT)
    fillR(x, curY, 2, 6.5, INK)
    setF(bold ? 'bold' : 'normal', 7, bold ? INK : INK_LIGHT)
    tL(t(label), x + 4, curY + 4.5)
    setF(bold ? 'bold' : 'normal', 7, bold ? INK : INK_MID)
    tR(value, x + bsColW - 2, curY + 4.5)
    return 6.5
  }

  // Left column (Assets)
  const assetRows = [
    { label: 'Dönen Varlıklar',      value: fmt(t14.current_assets_try) },
    { label: 'Duran Varlıklar',      value: fmt(t14.non_current_assets_try) },
  ]
  let leftY = curY
  assetRows.forEach(r => { bsRow(r.label, r.value, LX); leftY += 6.5 })
  const assetY = leftY
  fillR(LX, assetY, bsColW, 7, INK)
  setF('bold', 7, WHITE)
  tL(t('TOPLAM AKTİF'), LX + 3, assetY + 5)
  tR(fmt(t14.total_assets_try), LX + bsColW - 2, assetY + 5)

  // Right column (Liabilities + Equity)
  curY = bsStartY + 7
  const liabRows = [
    { label: 'Kısa Vadeli Borçlar',   value: fmt(t14.short_term_liabilities) },
    { label: 'Uzun Vadeli Borçlar',   value: fmt(t14.long_term_liabilities) },
  ]
  liabRows.forEach(r => { bsRow(r.label, r.value, bsRX2); curY += 6.5 })
  bsRow('Özsermaye', fmt(t14.equity_try), bsRX2, true)
  curY += 6.5
  const liabEndY = curY
  fillR(bsRX2, liabEndY, bsColW, 7, INK)
  setF('bold', 7, WHITE)
  tL(t('TOPLAM PASİF'), bsRX2 + 3, liabEndY + 5)
  tR(fmt(t14.total_liabilities_try + t14.equity_try), bsRX2 + bsColW - 2, liabEndY + 5)

  curY = Math.max(assetY, liabEndY) + 11
  const balColor: RGB = t14.balanced ? POSITIVE : CRITICAL
  fillR(LX, curY, CONTENT_W, 7, t14.balanced ? [220, 252, 231] : [254, 226, 226])
  fillR(LX, curY, 2, 7, balColor)
  setF('bold', 7, balColor)
  const balText = t14.balanced
    ? t('Bilanço dengeli')
    : t(`Bilanço dengeli değil — fark: ${fmt(t14.imbalance_try)}`)
  tL(balText, LX + 4, curY + 5)
  curY += 11
  gap(4)

  // ═════════════════════════════════════════════════════════════════════════
  // SECTION 15 — P&L
  // ═════════════════════════════════════════════════════════════════════════

  const t15 = s.section15 as ReconSection15_PnL
  sectionHeader(15, 'Gelir Tablosu')
  gap(1)
  kvRow('Gelir',               fmt(t15.revenue_try))
  kvRow('SMM',                 fmt(t15.cogs_try))
  kvRow('Brüt Kâr',           fmt(t15.gross_profit_try), true)
  kvRow('Brüt Marj',          pct(t15.gross_margin_pct))
  kvRow('Faaliyet Giderleri', fmt(t15.operating_expenses))
  kvRow('FAVÖK',              fmt(t15.ebitda_try), true)
  kvRow('FAVÖK Marjı',        pct(t15.ebitda_margin_pct))
  kvRow('Net Kâr',            fmt(t15.net_profit_try), true)
  kvRow('Net Marj',           pct(t15.net_margin_pct))
  gap(4)

  // ═════════════════════════════════════════════════════════════════════════
  // SECTION 16 — Governance Risks
  // ═════════════════════════════════════════════════════════════════════════

  const t16 = s.section16 as ReconSection16_GovernanceRisks
  sectionHeader(16, 'Yönetişim Riskleri')
  gap(1)
  kvRow('Kritik Bulgular', String(t16.total_critical))
  kvRow('Uyarı Bulguları', String(t16.total_warning))
  kvRow('Bilgi Bulguları', String(t16.total_info))

  if (t16.findings.length === 0) {
    ensureSpace(10)
    fillR(LX, curY, CONTENT_W, 9, [220, 252, 231])
    fillR(LX, curY, 2, 9, POSITIVE)
    setF('bold', 7, POSITIVE)
    tL(t('Tespit edilen yönetişim riski bulunmamaktadır.'), LX + 4, curY + 6)
    curY += 13
  } else {
    gap(2)
    t16.findings.forEach((finding: GovernanceFinding) => {
      ensureSpace(22)
      const severity = finding.severity
      const col: RGB = severity === 'critical' ? CRITICAL : severity === 'warning' ? WARNING : [37, 99, 235]
      const bgCol: RGB = severity === 'critical' ? [254, 226, 226] : severity === 'warning' ? [255, 251, 235] : [239, 246, 255]
      fillR(LX, curY, CONTENT_W, 20, bgCol)
      fillR(LX, curY, 3, 20, col)
      const sevLabel = severity === 'critical' ? t('KRİTİK') : severity === 'warning' ? t('UYARI') : t('BİLGİ')
      setF('bold', 6.5, col)
      tL(`[${sevLabel}] ${t(finding.title)}`, LX + 5, curY + 5.5)
      setF('normal', 6.5, INK_MID)
      const descLines = doc.splitTextToSize(t(finding.description), CONTENT_W - 10) as string[]
      descLines.slice(0, 2).forEach((line, i) => tL(line, LX + 5, curY + 10.5 + i * 4))
      if (finding.financial_impact != null) {
        setF('bold', 6.5, col)
        tR(fmt(finding.financial_impact), RX, curY + 5.5)
      }
      curY += 23
    })
  }
  gap(4)

  // ═════════════════════════════════════════════════════════════════════════
  // SECTION 17 — Management Declaration
  // ═════════════════════════════════════════════════════════════════════════

  sectionHeader(17, 'Yönetim Beyannamesi')
  gap(2)
  ensureSpace(30)
  fillR(LX, curY, CONTENT_W, 28, RULE_LIGHT)
  fillR(LX, curY, 2, 28, INK)
  setF('normal', 7, INK_MID)
  const declLines = doc.splitTextToSize(t(s.section17.declaration_text), CONTENT_W - 8) as string[]
  declLines.slice(0, 5).forEach((line, i) => tL(line, LX + 4, curY + 5 + i * 4))
  setF('normal', 6, INK_LIGHT)
  tL(`${t('Hazırlayan')}: ${t(s.section17.prepared_by)}   ·   ${t('Tarih')}: ${fmtDate(s.section17.reconciliation_date)}`, LX + 4, curY + 25)
  curY += 32
  ensureSpace(8)
  fillR(LX, curY, CONTENT_W, 7, [240, 249, 255])
  fillR(LX, curY, 2, 7, [37, 99, 235])
  setF('normal', 6.5, [37, 99, 235])
  tL(t('Bu döküman otomatik olarak hesaplanmıştır ve kriptografik parmak izi ile korunmaktadır.'), LX + 4, curY + 5)
  curY += 11
  gap(4)

  // ═════════════════════════════════════════════════════════════════════════
  // SECTION 18 — Shareholder Declaration
  // ═════════════════════════════════════════════════════════════════════════

  sectionHeader(18, 'Hissedar Beyannamesi')
  gap(2)
  ensureSpace(30)
  fillR(LX, curY, CONTENT_W, 26, RULE_LIGHT)
  fillR(LX, curY, 2, 26, INK)
  setF('normal', 7, INK_MID)
  const shDeclLines = doc.splitTextToSize(t(s.section18.declaration_text), CONTENT_W - 8) as string[]
  shDeclLines.slice(0, 5).forEach((line, i) => tL(line, LX + 4, curY + 5 + i * 4))
  curY += 30
  if (s.section18.items_reviewed.length > 0) {
    ensureSpace(4 + s.section18.items_reviewed.length * 5)
    setF('bold', 6.5, INK_LIGHT)
    tL(t('İNCELENEN MADDELER'), LX, curY)
    gap(5)
    s.section18.items_reviewed.forEach(item => {
      ensureSpace(6)
      fillR(LX, curY, CONTENT_W, 5.5, RULE_LIGHT)
      setF('normal', 6.5, POSITIVE)
      tL('✓', LX + 3, curY + 4)
      setF('normal', 6.5, INK_MID)
      tL(t(item), LX + 9, curY + 4)
      curY += 5.5
    })
  }
  gap(4)

  // ═════════════════════════════════════════════════════════════════════════
  // SECTION 19 — Signoffs
  // ═════════════════════════════════════════════════════════════════════════

  sectionHeader(19, 'Ortak İmzaları')
  gap(2)

  snapshot.signoffs.forEach(sig => {
    ensureSpace(20)
    const sigCol: RGB = sig.status === 'approved' ? POSITIVE : sig.status === 'rejected' ? CRITICAL : WARNING
    const sigBg: RGB  = sig.status === 'approved' ? [220, 252, 231] : sig.status === 'rejected' ? [254, 226, 226] : [255, 251, 235]
    const sigLabel    = sig.status === 'approved' ? t('ONAYLANDI') : sig.status === 'rejected' ? t('REDDEDİLDİ') : t('BEKLİYOR')
    fillR(LX, curY, CONTENT_W, 18, sigBg)
    fillR(LX, curY, 3, 18, sigCol)
    setF('bold', 8, INK)
    tL(t(sig.partner_name), LX + 6, curY + 6)
    setF('normal', 7, INK_LIGHT)
    tL(`%${sig.ownership_pct.toFixed(2)} ${t('hisse')}`, LX + 6, curY + 12)
    setF('bold', 7, sigCol)
    tR(sigLabel, RX, curY + 6)
    if (sig.signed_at) {
      setF('normal', 6.5, INK_LIGHT)
      tR(fmtDate(sig.signed_at), RX, curY + 12)
    }
    if (sig.comments) {
      setF('normal', 6.5, INK_MID)
      tL(t(sig.comments), LX + 6, curY + 17)
    }
    curY += 21
  })

  if (snapshot.signoffs.length === 0) {
    ensureSpace(10)
    fillR(LX, curY, CONTENT_W, 9, RULE_LIGHT)
    setF('normal', 7, INK_LIGHT)
    tC(t('Henüz imza kaydı bulunmamaktadır.'), CX, curY + 6)
    curY += 13
  }

  // ═════════════════════════════════════════════════════════════════════════
  // PAGE FOOTERS — all pages
  // ═════════════════════════════════════════════════════════════════════════

  const totalPages = doc.getNumberOfPages()
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p)
    const fy = PAGE_H - PAGE_MB + 4
    hLine(fy - 2, LX, RX, RULE, 0.3)
    setF('normal', 5.5, INK_LIGHT)
    tL(t(companyName) + t(' · Ortak Mutabakat Dosyası'), LX, fy + 3)
    tC(t('GİZLİ — YÖNETİCİ EKİ'), CX, fy + 3)
    tR(`${t('Sayfa')} ${p} / ${totalPages}`, RX, fy + 3)
  }

  // ═════════════════════════════════════════════════════════════════════════
  // SAVE
  // ═════════════════════════════════════════════════════════════════════════

  const filename = `mutabakat-${(snapshot.period_label ?? snapshot.reconciliation_date).replace(/\s+/g, '-')}.pdf`
  doc.save(filename)
}
