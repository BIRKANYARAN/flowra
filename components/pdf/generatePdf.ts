import { calculateLine, calculateTotals, type LineInput } from '@/lib/calc'

// ═══════════════════════════════════════════════════════════════════════════════
// Flowra PDF Engine v4 — Institutional Turkish B2B Proforma
//
// Design principles:
//   • Corporate letterhead, NOT SaaS dashboard
//   • No bright accent stripe — clean white document with subtle structure
//   • Company identity dominant: logo large, name prominent
//   • Document number in a clean bordered box (right side of header)
//   • Table: minimal color — light gray header, alternating white/near-white rows
//   • Totals: right-aligned block, GENEL TOPLAM in dark (not violet)
//   • "Yalnız" amount-in-words in a light gray box — formal Turkish standard
//   • Signature/approval area at bottom
//   • Footer: company · page N/M · doc no
//
// Layout (A4 portrait, 15mm margins):
//   LETTERHEAD: Logo + company block LEFT | Doc metadata box RIGHT
//   THIN RULE (double)
//   CUSTOMER block (lightly shaded)
//   THIN RULE
//   PRODUCT TABLE
//   TOTALS block (right) + YALNIZ (left, in gray box)
//   FX footnote (compact, muted)
//   LEGAL NOTE + VALIDITY
//   BANK INFO
//   SIGNATURE AREA
//   PAGE FOOTER
//
// SAFETY:
//   • Logo: 6 s timeout + onerror fallback — PDF never fails due to logo
//   • All numeric inputs guarded with Number() / toFixed()
//   • Works with empty / partial data
// ═══════════════════════════════════════════════════════════════════════════════

export interface PdfCompany {
  name:      string
  address:   string
  phone:     string
  website:   string
  taxNumber: string
  taxOffice: string
  logoUrl:   string
  mersisNo?: string
  email?:    string
}

export interface PdfCustomer {
  name:      string
  address:   string
  taxNumber: string
  taxOffice: string
  email?:    string
  phone?:    string
}

export interface PdfBank {
  bankName:   string
  branchName: string
  iban:       string
}

export interface PdfItem {
  name:             string
  description?:     string
  unit:             string
  quantity:         number
  price:            number
  kdv:              number
  currency:         string
  discount_percent: number
}

export interface PdfOptions {
  proformaNo:   string
  createdAt:    string
  validityDays: number
  currency:     string
  company:      PdfCompany
  customer:     PdfCustomer
  banks:        PdfBank[]
  items:        PdfItem[]
  notes?:       string
  fxUsd?:       number | null
  fxEur?:       number | null
}

// ── RGB type ──────────────────────────────────────────────────────────────────
type RGB = [number, number, number]

// ── Page geometry ─────────────────────────────────────────────────────────────
const PAGE = { W: 210, H: 297, ML: 15, MR: 15, MT: 15, MB: 18 }
const BODY_W: number = PAGE.W - PAGE.ML - PAGE.MR   // 180 mm
const LX:     number = PAGE.ML
const RX:     number = PAGE.W - PAGE.MR             // 195 mm
const CX:     number = PAGE.W / 2

// Table column widths (mm) — 8 columns summing to 180
const COL = {
  NAME:      50,
  UNIT:      12,
  QTY:       12,
  PRICE:     24,
  DISC:      12,
  DISCPRICE: 24,
  KDV:       12,
  TOTAL:     34,
}
// 50+12+12+24+12+24+12+34 = 180 ✓
const TABLE_W: number = BODY_W
const TABLE_X: number = LX
const ROW_H:   number = 7.5
const THEAD_H: number = 8.5

// Cell padding
const CP: number = 2

// DPI for logo px→mm conversion
const DPI: number       = 96 / 25.4
const LOGO_MAX_W: number = 48
const LOGO_MAX_H: number = 22

// Fonts
const FONT_REG  = '/fonts/LiberationSans-Regular.ttf'
const FONT_BOLD = '/fonts/LiberationSans-Bold.ttf'

// ── Color palette — minimal, professional ─────────────────────────────────────
// Primary: very dark charcoal (near-black), not pure black
// Accent: dark navy blue — dignified, not violet/purple
// Grays: structural hierarchy
const C: Record<string, RGB> = {
  black:    [15,  15,  20],     // near-black text
  ink:      [30,  30,  40],     // body text
  dark:     [60,  60,  70],     // secondary text
  mid:      [110, 110, 120],    // labels, muted
  muted:    [160, 160, 170],    // footnotes
  light:    [210, 210, 215],    // light borders
  rule:     [220, 220, 224],    // table rules
  hrule:    [180, 180, 188],    // section rules
  accent:   [20,  46,  100],    // dark navy — doc number, table header label
  accentBg: [236, 240, 250],    // very light navy — customer block, table header
  totBg:    [24,  36,  72],     // total block background (dark navy)
  thead:    [240, 241, 244],    // table header background (neutral light gray)
  alt:      [250, 250, 252],    // alternating row (barely visible)
  yalniz:   [245, 246, 248],    // yalniz box background
  white:    [255, 255, 255],
  sigLine:  [140, 140, 148],    // signature line color
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function sym(c: string): string {
  // ₺ (U+20BA) not in LiberationSans — use 'TL' for TRY
  return c === 'USD' ? '$' : c === 'EUR' ? '€' : c === 'GBP' ? '£' : 'TL'
}

function n(v: unknown): number {
  const r = Number(v)
  return Number.isFinite(r) ? r : 0
}

function money(v: unknown, symbol = ''): string {
  return n(v).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) +
    (symbol ? ' ' + symbol : '')
}

function currencyLong(c: string): string {
  if (c === 'USD') return 'ABD Dolari ($)'
  if (c === 'EUR') return 'Euro (EUR)'
  if (c === 'GBP') return 'Ingiliz Sterlini (GBP)'
  return 'Turk Lirasi (TL)'
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('tr-TR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
    })
  } catch { return iso || '' }
}

function addDays(iso: string, days: number): string {
  try {
    const d = new Date(iso)
    d.setDate(d.getDate() + days)
    return d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  } catch { return '' }
}

function toWordsTR(total: number, currency: string): string {
  if (!Number.isFinite(total) || total < 0) return ''
  if (currency !== 'TRY') {
    return n(total).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) +
      ' ' + currencyLong(currency)
  }

  const ones = ['','Bir','Iki','Uc','Dort','Bes','Alti','Yedi','Sekiz','Dokuz']
  const tens  = ['','On','Yirmi','Otuz','Kirk','Elli','Altmis','Yetmis','Seksen','Doksan']

  function cvt(x: number): string {
    if (x === 0) return ''
    if (x < 10)  return ones[x]
    if (x < 100) return tens[Math.floor(x/10)] + (x%10 ? ' '+ones[x%10] : '')
    if (x < 1000) {
      const h = ones[Math.floor(x/100)]
      const r = cvt(x%100)
      return (h === 'Bir' ? '' : h+' ') + 'Yuz' + (r ? ' '+r : '')
    }
    if (x < 1_000_000) {
      const t = Math.floor(x/1000)
      const r = cvt(x%1000)
      return (t===1 ? '' : cvt(t)+' ') + 'Bin' + (r ? ' '+r : '')
    }
    return cvt(Math.floor(x/1_000_000)) + ' Milyon' + (x%1_000_000 ? ' '+cvt(x%1_000_000) : '')
  }

  const rounded = Math.round(total*100)/100
  const [iStr, dStr] = rounded.toFixed(2).split('.')
  const iNum = parseInt(iStr, 10)
  const dNum = parseInt(dStr, 10)
  const lira = iNum === 0 ? 'Sifir' : cvt(iNum)
  return lira + ' Turk Lirasi' + (dNum > 0 ? ' ' + cvt(dNum) + ' Kurus' : '')
}

// ── Logo loading ──────────────────────────────────────────────────────────────

interface LogoData { b64: string; pxW: number; pxH: number }

function resolveLogoUrl(url: string): string {
  if (url.startsWith('http')) return url
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!base) return url
  return `${base}/storage/v1/object/public/logos/${url}`
}

async function loadLogo(url: string): Promise<LogoData | null> {
  if (!url?.trim()) return null
  const src = resolveLogoUrl(url.trim())
  const fetchUrl = src + (src.includes('?') ? '&' : '?') + '_cb=' + Date.now()
  const controller = new AbortController()
  const timer = setTimeout(() => { controller.abort(); console.warn('[PDF_LOGO_TIMEOUT]', url) }, 6000)
  try {
    const res = await fetch(fetchUrl, { signal: controller.signal })
    clearTimeout(timer)
    if (!res.ok) { console.warn('[PDF_LOGO_FAIL]', url, `HTTP ${res.status}`); return null }
    const blob = await res.blob()
    const blobUrl = URL.createObjectURL(blob)
    return await new Promise<LogoData | null>(resolve => {
      const img = new Image()
      img.onload = () => {
        try {
          const w = Math.max(img.naturalWidth || img.width, 1)
          const h = Math.max(img.naturalHeight || img.height, 1)
          const canvas = document.createElement('canvas')
          canvas.width = w; canvas.height = h
          const ctx = canvas.getContext('2d')
          if (!ctx) { URL.revokeObjectURL(blobUrl); resolve(null); return }
          ctx.drawImage(img, 0, 0)
          URL.revokeObjectURL(blobUrl)
          resolve({ b64: canvas.toDataURL('image/png'), pxW: w, pxH: h })
        } catch { URL.revokeObjectURL(blobUrl); resolve(null) }
      }
      img.onerror = () => { URL.revokeObjectURL(blobUrl); resolve(null) }
      img.src = blobUrl
    })
  } catch (err) {
    clearTimeout(timer)
    if ((err as { name?: string }).name !== 'AbortError') console.warn('[PDF_LOGO_FAIL]', url, err)
    return null
  }
}

function logoDims(pxW: number, pxH: number): { w: number; h: number } {
  const mmW = pxW / DPI
  const mmH = pxH / DPI
  const scale = Math.min(LOGO_MAX_W / mmW, LOGO_MAX_H / mmH, 1)
  return { w: mmW * scale, h: mmH * scale }
}

// ── Font fetch ────────────────────────────────────────────────────────────────

async function fetchFontB64(path: string): Promise<string | null> {
  try {
    const res = await fetch(path)
    if (!res.ok) return null
    const buf = await res.arrayBuffer()
    const arr = new Uint8Array(buf)
    let bin = ''
    const CHUNK = 8192
    for (let i = 0; i < arr.byteLength; i += CHUNK) {
      bin += String.fromCharCode(...(arr.subarray(i, i + CHUNK) as unknown as number[]))
    }
    return btoa(bin)
  } catch { return null }
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN EXPORT
// ═══════════════════════════════════════════════════════════════════════════════

export async function generatePdf(opts: PdfOptions): Promise<void> {
  const proformaNo   = opts.proformaNo   || 'PRF-???'
  const createdAt    = opts.createdAt    || new Date().toISOString()
  const validityDays = n(opts.validityDays) || 30
  const currency     = opts.currency     || 'TRY'
  const company      = opts.company      || {} as PdfCompany
  const customer     = opts.customer     || {} as PdfCustomer
  const banks        = Array.isArray(opts.banks) ? opts.banks : []
  const items        = Array.isArray(opts.items) ? opts.items.filter(Boolean) : []
  const notes        = opts.notes || ''
  const fxUsd        = n(opts.fxUsd)
  const fxEur        = n(opts.fxEur)
  const S            = sym(currency)

  const { default: jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
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

  // ── Drawing helpers ───────────────────────────────────────────────────────

  function setF(style: 'normal' | 'bold', size: number, col: RGB = C.ink) {
    doc.setFont(FONT, style)
    doc.setFontSize(size)
    doc.setTextColor(col[0], col[1], col[2])
  }

  function tL(t: string, x: number, y: number)  { doc.text(t, x, y) }
  function tR(t: string, x: number, y: number)  { doc.text(t, x, y, { align: 'right' }) }
  function tC(t: string, x: number, y: number)  { doc.text(t, x, y, { align: 'center' }) }

  function hLine(y: number, x1 = LX, x2 = RX, col: RGB = C.rule, lw = 0.3) {
    doc.setDrawColor(col[0], col[1], col[2])
    doc.setLineWidth(lw)
    doc.line(x1, y, x2, y)
  }

  function vLine(x: number, y1: number, y2: number, col: RGB = C.rule, lw = 0.18) {
    doc.setDrawColor(col[0], col[1], col[2])
    doc.setLineWidth(lw)
    doc.line(x, y1, x, y2)
  }

  function fillR(x: number, y: number, w: number, h: number, col: RGB) {
    doc.setFillColor(col[0], col[1], col[2])
    doc.rect(x, y, w, h, 'F')
  }

  function strokeR(x: number, y: number, w: number, h: number, col: RGB, lw = 0.3) {
    doc.setDrawColor(col[0], col[1], col[2])
    doc.setLineWidth(lw)
    doc.rect(x, y, w, h, 'S')
  }

  let curY        = PAGE.MT
  const CONTENT_B = PAGE.H - PAGE.MB

  function ensureSpace(needed: number) {
    if (curY + needed > CONTENT_B) { doc.addPage(); curY = PAGE.MT }
  }

  // ── Pre-calculate totals ──────────────────────────────────────────────────
  const totals   = calculateTotals(items as LineInput[])
  const subtotal = totals.subtotal
  const kdvTotal = totals.kdv_total
  const kdvMap   = totals.kdv_breakdown
  const grand    = totals.grand_total
  const kdvRates = Object.keys(kdvMap).filter(k => kdvMap[k] > 0).sort((a,b) => +a - +b)

  // ── Load logo ─────────────────────────────────────────────────────────────
  let logo: LogoData | null = null
  if (company.logoUrl?.trim()) {
    try { logo = await loadLogo(company.logoUrl.trim()) } catch { logo = null }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // A. LETTERHEAD
  //    LEFT:  Logo (if available) + Company name + company details
  //    RIGHT: Bordered box with document number, type, dates
  // ══════════════════════════════════════════════════════════════════════════

  const HDR_LEFT_W  = 110   // mm
  const HDR_RIGHT_W = 62    // mm — right metadata box
  const HDR_RIGHT_X = RX - HDR_RIGHT_W

  let leftY  = curY
  let rightY = curY

  // ── Logo ─────────────────────────────────────────────────────────────────
  if (logo) {
    const { w, h } = logoDims(logo.pxW, logo.pxH)
    const lh = Math.min(h, LOGO_MAX_H)
    const lw = w * (lh / h)
    try {
      doc.addImage(logo.b64, 'PNG', LX, leftY, lw, lh)
      leftY += lh + 2
    } catch { /* logo failed — continue without */ }
  }

  // Company name — large and prominent
  setF('bold', 11, C.black)
  const nameLines = doc.splitTextToSize(company.name?.trim() || '', HDR_LEFT_W) as string[]
  nameLines.forEach(l => { tL(l, LX, leftY); leftY += 5.5 })
  leftY += 1

  // Address
  if (company.address?.trim()) {
    setF('normal', 7.5, C.dark)
    const aLines = doc.splitTextToSize(company.address.trim(), HDR_LEFT_W) as string[]
    aLines.forEach(l => { tL(l, LX, leftY); leftY += 3.8 })
    leftY += 1
  }

  // Tax info
  const taxParts: string[] = []
  if (company.taxNumber?.trim()) taxParts.push('Vergi No: ' + company.taxNumber.trim())
  if (company.taxOffice?.trim()) taxParts.push('Vergi Dairesi: ' + company.taxOffice.trim())
  if (taxParts.length > 0) {
    setF('normal', 7, C.mid)
    tL(taxParts.join('   |   '), LX, leftY); leftY += 4
  }

  if (company.mersisNo?.trim()) {
    setF('normal', 7, C.mid)
    tL('MERSİS: ' + company.mersisNo.trim(), LX, leftY); leftY += 4
  }

  // Contact
  const contactParts = [company.phone?.trim(), company.email?.trim(), company.website?.trim()].filter(Boolean)
  if (contactParts.length > 0) {
    setF('normal', 7, C.mid)
    tL(contactParts.join('   '), LX, leftY); leftY += 4
  }

  // ── Right: Document metadata box ──────────────────────────────────────────
  const META_H = 32
  // Outer box with dark navy border
  doc.setDrawColor(C.accent[0], C.accent[1], C.accent[2])
  doc.setLineWidth(0.5)
  doc.rect(HDR_RIGHT_X, rightY, HDR_RIGHT_W, META_H, 'S')

  // Dark navy header strip inside box
  fillR(HDR_RIGHT_X, rightY, HDR_RIGHT_W, 10, C.accent)
  setF('bold', 8, C.white)
  tC('PROFORMA FATURA', HDR_RIGHT_X + HDR_RIGHT_W/2, rightY + 6.5)

  // Doc number
  const MX = HDR_RIGHT_X + HDR_RIGHT_W / 2
  const MP = 2.5
  setF('bold', 13, C.accent)
  tC(proformaNo, MX, rightY + 18)

  // Dates
  setF('normal', 7, C.dark)
  tL('Tarih:', HDR_RIGHT_X + MP, rightY + 24)
  tR(fmtDate(createdAt), HDR_RIGHT_X + HDR_RIGHT_W - MP, rightY + 24)

  setF('normal', 7, C.dark)
  tL('Gecerlilik:', HDR_RIGHT_X + MP, rightY + 29)
  tR(addDays(createdAt, validityDays), HDR_RIGHT_X + HDR_RIGHT_W - MP, rightY + 29)

  rightY += META_H + 2

  // Currency line below box (compact)
  setF('normal', 6.5, C.mid)
  tR(currencyLong(currency), HDR_RIGHT_X + HDR_RIGHT_W, rightY)
  rightY += 4

  // Section separator — double rule
  curY = Math.max(leftY, rightY) + 5
  hLine(curY, LX, RX, C.hrule, 0.6)
  hLine(curY + 1.2, LX, RX, C.hrule, 0.2)
  curY += 7

  // ══════════════════════════════════════════════════════════════════════════
  // B. CUSTOMER BLOCK — lightly shaded background
  // ══════════════════════════════════════════════════════════════════════════

  const CUST_PAD_V = 4
  const CUST_PAD_H = 5
  const CUST_LABEL_H = 4.5

  const custNameStr = customer.name?.trim() || '—'
  const custAddrLines = customer.address?.trim()
    ? (doc.splitTextToSize(customer.address.trim(), BODY_W * 0.7) as string[])
    : []
  const custTaxParts: string[] = []
  if (customer.taxNumber?.trim()) custTaxParts.push('Vergi No: ' + customer.taxNumber.trim())
  if (customer.taxOffice?.trim()) custTaxParts.push('Vergi Dairesi: ' + customer.taxOffice.trim())
  const custContact = [customer.phone?.trim(), customer.email?.trim()].filter(Boolean)

  const custBlockH = CUST_LABEL_H + CUST_PAD_V
    + 7                              // customer name
    + custAddrLines.length * 3.8
    + (custTaxParts.length ? 4 : 0)
    + (custContact.length ? 4 : 0)
    + CUST_PAD_V

  ensureSpace(custBlockH + 4)

  // Light shaded box
  fillR(LX, curY, BODY_W, custBlockH, C.accentBg)
  strokeR(LX, curY, BODY_W, custBlockH, C.light, 0.3)

  // "FATURA ALICISI" label inside box
  let cy = curY + CUST_PAD_V
  setF('bold', 6.5, C.accent)
  tL('FATURA ALICISI', LX + CUST_PAD_H, cy)
  cy += CUST_LABEL_H

  setF('bold', 10, C.black)
  const cnLines = doc.splitTextToSize(custNameStr, BODY_W - CUST_PAD_H * 2) as string[]
  cnLines.forEach(l => { tL(l, LX + CUST_PAD_H, cy); cy += 5 })
  cy += 1

  setF('normal', 7.5, C.dark)
  custAddrLines.forEach(l => { tL(l, LX + CUST_PAD_H, cy); cy += 3.8 })

  if (custTaxParts.length > 0) {
    setF('normal', 7, C.mid)
    tL(custTaxParts.join('   |   '), LX + CUST_PAD_H, cy); cy += 4
  }
  if (custContact.length > 0) {
    setF('normal', 7, C.mid)
    tL(custContact.join('   '), LX + CUST_PAD_H, cy)
  }

  curY += custBlockH + 8

  // ══════════════════════════════════════════════════════════════════════════
  // C. PRODUCT TABLE
  // ══════════════════════════════════════════════════════════════════════════

  const COL_X: Record<string, number> = {
    NAME:      TABLE_X,
    UNIT:      TABLE_X + COL.NAME,
    QTY:       TABLE_X + COL.NAME + COL.UNIT,
    PRICE:     TABLE_X + COL.NAME + COL.UNIT + COL.QTY,
    DISC:      TABLE_X + COL.NAME + COL.UNIT + COL.QTY + COL.PRICE,
    DISCPRICE: TABLE_X + COL.NAME + COL.UNIT + COL.QTY + COL.PRICE + COL.DISC,
    KDV:       TABLE_X + COL.NAME + COL.UNIT + COL.QTY + COL.PRICE + COL.DISC + COL.DISCPRICE,
    TOTAL:     TABLE_X + COL.NAME + COL.UNIT + COL.QTY + COL.PRICE + COL.DISC + COL.DISCPRICE + COL.KDV,
  }

  function drawTableHeader() {
    // Light neutral gray background for header
    fillR(TABLE_X, curY, TABLE_W, THEAD_H, C.thead)
    // Top + bottom rule for header
    hLine(curY,           TABLE_X, TABLE_X + TABLE_W, C.hrule, 0.5)
    hLine(curY + THEAD_H, TABLE_X, TABLE_X + TABLE_W, C.hrule, 0.5)

    // Left accent bar (dark navy — connects to letterhead language)
    fillR(TABLE_X, curY, 2, THEAD_H, C.accent)

    setF('bold', 6, C.accent)
    const ty = curY + THEAD_H / 2 + 2.5
    tL('ÜRÜN / HİZMET',            COL_X.NAME      + CP + 2, ty)
    tC('BİRİM',                    COL_X.UNIT      + COL.UNIT      / 2, ty)
    tC('ADET',                     COL_X.QTY       + COL.QTY       / 2, ty)
    tR('BİRİM FİYAT',              COL_X.PRICE     + COL.PRICE     - CP, ty)
    tC('İSK.%',                    COL_X.DISC      + COL.DISC      / 2, ty)
    tR('NET TUTAR',                COL_X.DISCPRICE + COL.DISCPRICE - CP, ty)
    tC('KDV%',                     COL_X.KDV       + COL.KDV       / 2, ty)
    tR('SATIR TOPLAMI (' + S + ')', COL_X.TOTAL     + COL.TOTAL     - CP, ty)

    curY += THEAD_H
  }

  ensureSpace(THEAD_H + ROW_H * 2)
  drawTableHeader()

  for (let i = 0; i < items.length; i++) {
    const it        = items[i]
    const line      = calculateLine(it as LineInput)
    const qty       = line.quantity
    const price     = line.price
    const disc      = line.discount_percent
    const lineSub   = line.line_subtotal
    const kdvPct    = line.kdv
    const rowTotal  = line.line_total

    doc.setFontSize(8)
    const nLines  = doc.splitTextToSize(it.name?.trim() || '—', COL.NAME - CP * 2 - 2) as string[]
    const descLines = it.description?.trim()
      ? (doc.splitTextToSize(it.description.trim(), COL.NAME - CP * 2 - 2) as string[])
      : []
    const textRows  = nLines.length + descLines.length
    const rowH      = Math.max(ROW_H, textRows * 4 + CP * 2 + 1.5)

    if (curY + rowH > CONTENT_B) {
      doc.addPage(); curY = PAGE.MT; drawTableHeader()
    }

    if (i % 2 === 1) fillR(TABLE_X, curY, TABLE_W, rowH, C.alt)

    // Product name
    setF('bold', 8, C.ink)
    let ny = curY + CP + 3.5
    nLines.forEach(l => { tL(l, COL_X.NAME + CP + 2, ny); ny += 4 })
    // Description (slightly smaller, muted)
    if (descLines.length > 0) {
      setF('normal', 7, C.mid)
      descLines.forEach(l => { tL(l, COL_X.NAME + CP + 2, ny); ny += 3.5 })
    }

    const midY = curY + rowH / 2 + 2.5
    setF('normal', 8, C.ink)
    tC(it.unit || 'adet',                    COL_X.UNIT      + COL.UNIT      / 2, midY)
    tC(qty.toString(),                        COL_X.QTY       + COL.QTY       / 2, midY)
    tR(money(price),                          COL_X.PRICE     + COL.PRICE     - CP, midY)
    tC(disc > 0 ? disc + '%' : '—',           COL_X.DISC      + COL.DISC      / 2, midY)
    tR(money(lineSub),                        COL_X.DISCPRICE + COL.DISCPRICE - CP, midY)
    tC('%' + kdvPct,                          COL_X.KDV       + COL.KDV       / 2, midY)
    setF('bold', 8, C.black)
    tR(money(rowTotal, S),                    COL_X.TOTAL     + COL.TOTAL     - CP, midY)

    hLine(curY + rowH, TABLE_X, TABLE_X + TABLE_W, C.rule, 0.15)
    vLine(COL_X.UNIT,      curY, curY + rowH, C.rule)
    vLine(COL_X.QTY,       curY, curY + rowH, C.rule)
    vLine(COL_X.PRICE,     curY, curY + rowH, C.rule)
    vLine(COL_X.DISC,      curY, curY + rowH, C.rule)
    vLine(COL_X.DISCPRICE, curY, curY + rowH, C.rule)
    vLine(COL_X.KDV,       curY, curY + rowH, C.rule)
    vLine(COL_X.TOTAL,     curY, curY + rowH, C.rule)
    curY += rowH
  }

  hLine(curY, TABLE_X, TABLE_X + TABLE_W, C.hrule, 0.5)
  curY += 10

  // ══════════════════════════════════════════════════════════════════════════
  // D. TOTALS (right) + YALNIZ (left)
  // ══════════════════════════════════════════════════════════════════════════

  const TW:  number = 72
  const TXL: number = RX - TW

  const totH = kdvRates.length * 4.5 + 5.5 + (totals.total_discount > 0 ? 5.5 : 0) + 5.5 + 16 + 4
  ensureSpace(totH + 28)

  const totStartY = curY

  // KDV breakdown lines
  setF('normal', 7.5, C.mid)
  for (const rate of kdvRates) {
    tL('KDV %' + rate + ':',  TXL, curY)
    tR(money(kdvMap[rate], S), RX,  curY)
    curY += 4.5
  }
  if (kdvRates.length > 0) { hLine(curY, TXL, RX, C.rule, 0.25); curY += 2 }

  // Ara Toplam
  setF('normal', 8.5, C.dark)
  tL('Ara Toplam:', TXL, curY)
  setF('bold', 8.5, C.ink)
  tR(money(subtotal, S), RX, curY)
  curY += 5.5

  // Discount (if any)
  if (totals.total_discount > 0) {
    setF('normal', 8, C.dark)
    tL('Toplam İskonto:', TXL, curY)
    setF('bold', 8, C.accent)
    tR('-' + money(totals.total_discount, S), RX, curY)
    curY += 5.5
  }

  // Toplam KDV
  setF('normal', 8.5, C.dark)
  tL('Toplam KDV:', TXL, curY)
  setF('bold', 8.5, C.ink)
  tR(money(kdvTotal, S), RX, curY)
  curY += 5.5

  hLine(curY, TXL, RX, C.hrule, 0.4)
  curY += 2

  // GENEL TOPLAM — dark navy block
  const GT_H: number = 16
  fillR(TXL - 2, curY, TW + 4, GT_H, C.totBg)
  setF('bold', 8, C.white)
  tL('GENEL TOPLAM', TXL + 3, curY + 7)
  setF('bold', 14, C.white)
  tR(money(grand, S), RX - 3, curY + 10.5)
  curY += GT_H + 6

  // ── YALNIZ — amount in words in a clean gray box ──────────────────────────
  if (grand > 0) {
    const yText = toWordsTR(grand, currency)
    if (yText) {
      const YALNIZ_W: number = TXL - LX - 6
      const yLines = doc.splitTextToSize(yText, YALNIZ_W - 8) as string[]
      const yBoxH  = yLines.length * 4 + 10

      ensureSpace(yBoxH + 4)

      // Draw yalniz box flush with totStartY area (left of totals)
      const yBoxY = totStartY
      fillR(LX, yBoxY, YALNIZ_W, yBoxH, C.yalniz)
      strokeR(LX, yBoxY, YALNIZ_W, yBoxH, C.light, 0.3)

      setF('bold', 6.5, C.accent)
      tL('YALNIZ', LX + 4, yBoxY + 5)

      setF('normal', 7.5, C.dark)
      let yy = yBoxY + 5 + 4.5
      yLines.forEach(l => { tL(l, LX + 4, yy); yy += 4 })
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // E. FX FOOTNOTE (compact, muted — below totals block)
  // ══════════════════════════════════════════════════════════════════════════
  const fxParts: string[] = []
  if (fxUsd > 0) fxParts.push('1 USD = ' + fxUsd.toFixed(4) + ' TL')
  if (fxEur > 0) fxParts.push('1 EUR = ' + fxEur.toFixed(4) + ' TL')
  if (fxParts.length > 0) {
    ensureSpace(6)
    setF('normal', 6.5, C.muted)
    tL('Referans Kur (' + fmtDate(createdAt) + '): ' + fxParts.join('   '), LX, curY)
    curY += 5
  }

  // ══════════════════════════════════════════════════════════════════════════
  // F. NOTES
  // ══════════════════════════════════════════════════════════════════════════
  if (notes?.trim()) {
    ensureSpace(16)
    hLine(curY, LX, RX, C.rule, 0.25)
    curY += 5
    setF('bold', 7.5, C.dark)
    tL('Notlar:', LX, curY)
    curY += 4.5
    setF('normal', 8, C.dark)
    const nl = doc.splitTextToSize(notes.trim(), BODY_W) as string[]
    nl.forEach(l => { ensureSpace(4); tL(l, LX, curY); curY += 4 })
    curY += 3
  }

  // ══════════════════════════════════════════════════════════════════════════
  // G. LEGAL NOTE + VALIDITY
  // ══════════════════════════════════════════════════════════════════════════
  ensureSpace(16)
  hLine(curY, LX, RX, C.rule, 0.25)
  curY += 5

  setF('normal', 7, C.mid)
  tL('Bu belge proforma faturadır ve resmi vergi faturası yerine geçmez.', LX, curY)
  tR('Gecerlilik: ' + validityDays + ' gun  |  Son tarih: ' + addDays(createdAt, validityDays), RX, curY)
  curY += 5

  // ══════════════════════════════════════════════════════════════════════════
  // H. BANK INFORMATION
  // ══════════════════════════════════════════════════════════════════════════
  if (banks.length > 0) {
    ensureSpace(24)
    hLine(curY, LX, RX, C.rule, 0.25)
    curY += 5

    setF('bold', 7.5, C.accent)
    tL('ÖDEME BİLGİLERİ', LX, curY)
    curY += 5.5

    const BCOLS: number = banks.length >= 2 ? 2 : 1
    const GAP:   number = 8
    const BCW:   number = (BODY_W - (BCOLS - 1) * GAP) / BCOLS
    const BCX: number[] = Array.from({ length: BCOLS }, (_, i) => PAGE.ML + i * (BCW + GAP))

    for (let i = 0; i < banks.length;) {
      ensureSpace(14)
      const lb = banks[i]
      const rb = BCOLS === 2 && i + 1 < banks.length ? banks[i + 1] : null

      // Left bank
      setF('bold', 8, C.ink)
      tL([lb.bankName, lb.branchName].filter(Boolean).join(' / '), BCX[0], curY)
      doc.setFont('courier', 'normal')
      doc.setFontSize(7.5)
      doc.setTextColor(C.dark[0], C.dark[1], C.dark[2])
      tL('IBAN: ' + (lb.iban || ''), BCX[0], curY + 5)

      if (rb) {
        doc.setFont(FONT, 'bold')
        doc.setFontSize(8)
        doc.setTextColor(C.ink[0], C.ink[1], C.ink[2])
        tL([rb.bankName, rb.branchName].filter(Boolean).join(' / '), BCX[1], curY)
        doc.setFont('courier', 'normal')
        doc.setFontSize(7.5)
        doc.setTextColor(C.dark[0], C.dark[1], C.dark[2])
        tL('IBAN: ' + (rb.iban || ''), BCX[1], curY + 5)
      }

      doc.setFont(FONT, 'normal')
      curY += 12
      i += rb ? 2 : 1
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // I. SIGNATURE / APPROVAL AREA
  // ══════════════════════════════════════════════════════════════════════════
  ensureSpace(26)
  hLine(curY, LX, RX, C.rule, 0.25)
  curY += 8

  // Two signature blocks: left = seller, right = buyer
  const SIG_W  = 72
  const SIG_GAP = BODY_W - SIG_W * 2
  const SIG_LX  = LX
  const SIG_RX  = RX - SIG_W

  setF('normal', 6.5, C.mid)
  tC('Düzenleyen / Authorized by', SIG_LX + SIG_W / 2, curY)
  tC('Onaylayan / Approved by',    SIG_RX + SIG_W / 2, curY)
  curY += 12

  // Signature lines
  hLine(curY, SIG_LX, SIG_LX + SIG_W, C.sigLine, 0.3)
  hLine(curY, SIG_RX, SIG_RX + SIG_W, C.sigLine, 0.3)
  curY += 4

  setF('normal', 6.5, C.mid)
  tC(company.name?.trim() || '', SIG_LX + SIG_W / 2, curY)
  tC(customer.name?.trim() || '', SIG_RX + SIG_W / 2, curY)

  // ══════════════════════════════════════════════════════════════════════════
  // J. PAGE FOOTER (all pages)
  // ══════════════════════════════════════════════════════════════════════════
  const totalPages = doc.getNumberOfPages()
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p)
    const fy: number = PAGE.H - PAGE.MB + 3
    hLine(fy, LX, RX, C.rule, 0.3)
    setF('normal', 6.5, C.muted)
    tL(company.name?.trim() || '', LX, fy + 4)
    tC('Sayfa ' + p + ' / ' + totalPages, CX, fy + 4)
    tR(proformaNo + '  ·  ' + fmtDate(createdAt), RX, fy + 4)
  }

  doc.save(proformaNo + '.pdf')
}
