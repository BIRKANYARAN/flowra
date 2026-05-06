import { calculateLine, calculateTotals, type LineInput } from '@/lib/calc'

// ═══════════════════════════════════════════════════════════════════════════════
// Flowra PDF Engine v3 — Professional e-fatura style
//
// Layout (A4 portrait, 14mm margins):
//   HEADER:  Company logo + info (LEFT) | Document metadata (RIGHT)
//   RULE
//   CUSTOMER block
//   RULE
//   TABLE:   Ürün / Açıklama / Adet / Birim Fiyat / KDV% / Toplam
//   TOTALS:  Ara Toplam, KDV, GENEL TOPLAM (right-aligned block)
//   YALNIZ:  Amount in words (left)
//   FX:      Small footnote (non-dominant)
//   NOTES + VALIDITY
//   BANK INFO
//   PAGE FOOTER: company · page N/M · doc no + date
//
// SAFETY:
//   • Never renders unit_cost, profit, internal_notes
//   • Logo load has 6 s timeout + onerror fallback — PDF never fails due to logo
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
// Mutable tuple — avoids literal-type inference errors when passed to helpers
type RGB = [number, number, number]

// ── Page geometry ─────────────────────────────────────────────────────────────
// Plain object (no `as const`) so all values stay typed as `number`
const PAGE: { W: number; H: number; ML: number; MR: number; MT: number; MB: number } = {
  W: 210, H: 297, ML: 14, MR: 14, MT: 14, MB: 16,
}
const BODY_W: number = PAGE.W - PAGE.ML - PAGE.MR   // 182 mm
const LX:     number = PAGE.ML
const RX:     number = PAGE.W - PAGE.MR             // 196 mm
const CX:     number = PAGE.W / 2

// Table column widths (mm) — Ürün | Birim | Adet | Birim Fiyat (₺) | İskonto % | Net Tutar (₺) | KDV % | Satır Toplamı (₺)
const COL: { NAME: number; UNIT: number; QTY: number; PRICE: number; DISC: number; DISCPRICE: number; KDV: number; TOTAL: number } = {
  NAME:      48,
  UNIT:      13,
  QTY:       12,
  PRICE:     24,
  DISC:      13,
  DISCPRICE: 24,
  KDV:       13,
  TOTAL:     35,
}
// sum = 48+13+12+24+13+24+13+35 = 182 ✓
const TABLE_W: number = BODY_W
const TABLE_X: number = LX
const ROW_H:   number = 8
const THEAD_H: number = 9
const CP:      number = 2   // cell padding mm

// DPI for logo pixel→mm conversion
const DPI:       number = 96 / 25.4
const LOGO_MAX_W: number = 44
const LOGO_MAX_H: number = 18

// Font paths (public/fonts/)
const FONT_REG  = '/fonts/LiberationSans-Regular.ttf'
const FONT_BOLD = '/fonts/LiberationSans-Bold.ttf'

// Color palette — explicit Record type prevents literal tuple inference
const C: Record<string, RGB> = {
  black:  [10,  10,  10],
  ink:    [25,  25,  25],
  dark:   [50,  50,  50],
  mid:    [100, 100, 100],
  muted:  [155, 155, 155],
  light:  [200, 200, 200],
  rule:   [215, 215, 215],
  hrule:  [175, 175, 175],
  thead:  [242, 242, 245],
  alt:    [249, 249, 252],
  total:  [28,  28,  36],
  accent: [67,  56,  202],
  white:  [255, 255, 255],
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function sym(c: string): string {
  return c === 'USD' ? '$' : c === 'EUR' ? '€' : c === 'GBP' ? '£' : '₺'
}

function n(v: unknown): number {
  const r = Number(v)
  return Number.isFinite(r) ? r : 0
}

function money(v: unknown, symbol = ''): string {
  return n(v).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + (symbol ? ' ' + symbol : '')
}

function currencyLabel(c: string): string {
  if (c === 'USD') return 'ABD Doları ($)'
  if (c === 'EUR') return 'Euro (€)'
  if (c === 'GBP') return 'İngiliz Sterlini (£)'
  return 'Türk Lirası (₺)'
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
    return d.toLocaleDateString('tr-TR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
    })
  } catch { return '' }
}

function toWordsTR(total: number, currency: string): string {
  if (!Number.isFinite(total) || total < 0) return ''
  if (currency !== 'TRY') return n(total).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ' + currencyLabel(currency)

  const ones = ['','Bir','İki','Üç','Dört','Beş','Altı','Yedi','Sekiz','Dokuz']
  const tens  = ['','On','Yirmi','Otuz','Kırk','Elli','Altmış','Yetmiş','Seksen','Doksan']

  function cvt(x: number): string {
    if (x === 0) return ''
    if (x < 10) return ones[x]
    if (x < 100) return tens[Math.floor(x / 10)] + (x % 10 ? ' ' + ones[x % 10] : '')
    if (x < 1000) {
      const h = ones[Math.floor(x / 100)]
      const r = cvt(x % 100)
      return (h === 'Bir' ? '' : h + ' ') + 'Yüz' + (r ? ' ' + r : '')
    }
    if (x < 1_000_000) {
      const t = Math.floor(x / 1000)
      const r = cvt(x % 1000)
      return (t === 1 ? '' : cvt(t) + ' ') + 'Bin' + (r ? ' ' + r : '')
    }
    return cvt(Math.floor(x / 1_000_000)) + ' Milyon' + (x % 1_000_000 ? ' ' + cvt(x % 1_000_000) : '')
  }

  const rounded = Math.round(total * 100) / 100
  const [iStr, dStr] = rounded.toFixed(2).split('.')
  const iNum = parseInt(iStr, 10)
  const dNum = parseInt(dStr, 10)
  const lira = iNum === 0 ? 'Sıfır' : cvt(iNum)
  return lira + ' Türk Lirası' + (dNum > 0 ? ' ' + cvt(dNum) + ' Kuruş' : '')
}

// ── Logo loading (safe — never throws, always resolves) ───────────────────────

interface LogoData { b64: string; pxW: number; pxH: number }

/**
 * Resolve a logo value to a loadable URL.
 *
 * New uploads store the full https:// URL directly.
 * Legacy proforma snapshots may contain a bare storage path like "userId/logo.png".
 * Convert that to the Supabase public URL so the image actually loads.
 */
function resolveLogoUrl(url: string): string {
  if (url.startsWith('http')) return url
  // Legacy storage path — derive public URL from env var (available in browser bundles)
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!base) return url  // can't resolve without base; will 404 gracefully
  return `${base}/storage/v1/object/public/logos/${url}`
}

async function loadLogo(url: string): Promise<LogoData | null> {
  if (!url?.trim()) return null

  const src = resolveLogoUrl(url.trim())
  // Cache-bust: forces re-fetch after logo replacement (fixed storage path)
  const fetchUrl = src + (src.includes('?') ? '&' : '?') + '_cb=' + Date.now()

  // AbortController gives us a clean timeout that cancels the in-flight request
  const controller = new AbortController()
  const timer = setTimeout(() => {
    controller.abort()
    console.warn('[PDF_LOGO_FAIL]', url, '(timeout after 6 s)')
  }, 6000)

  try {
    const res = await fetch(fetchUrl, { signal: controller.signal })
    clearTimeout(timer)

    if (!res.ok) {
      console.warn('[PDF_LOGO_FAIL]', url, `HTTP ${res.status}`)
      return null
    }

    const blob = await res.blob()

    // Warn early if the logo is unexpectedly large — it will slow canvas
    // rasterisation and inflate the PDF file size noticeably.
    if (blob.size > 2 * 1024 * 1024) {
      console.warn('[PDF_LOGO_WARN]', url, `blob ${(blob.size / 1024 / 1024).toFixed(1)} MB — exceeds 2 MB`)
    }

    // Convert to a same-origin blob: URL so the canvas is never tainted —
    // crossOrigin headers are irrelevant for local blob URLs, eliminating
    // the SecurityError that toDataURL() throws on cross-origin canvases.
    // URL.revokeObjectURL is called in every branch of the Promise below
    // (onload success, onload ctx-null, onload catch, onerror).
    const blobUrl = URL.createObjectURL(blob)

    return await new Promise<LogoData | null>(resolve => {
      const img = new Image()
      img.onload = () => {
        try {
          const w = Math.max(img.naturalWidth  || img.width,  1)
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
      img.onerror = () => {
        console.warn('[PDF_LOGO_FAIL]', url)
        URL.revokeObjectURL(blobUrl)
        resolve(null)
      }
      img.src = blobUrl
    })
  } catch (err) {
    clearTimeout(timer)
    // AbortError means timeout already logged above; surface other errors
    if ((err as { name?: string }).name !== 'AbortError') {
      console.warn('[PDF_LOGO_FAIL]', url, err)
    }
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
  const notes        = opts.notes        || ''
  const fxUsd        = n(opts.fxUsd)
  const fxEur        = n(opts.fxEur)
  const S            = sym(currency)

  const { default: jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
  let FONT = 'helvetica'

  const [regB64, bolB64] = await Promise.all([
    fetchFontB64(FONT_REG),
    fetchFontB64(FONT_BOLD),
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

  // ── Drawing helpers ───────────────────────────────────────────────────────

  function setF(style: 'normal' | 'bold', size: number, col: RGB = C.ink) {
    doc.setFont(FONT, style)
    doc.setFontSize(size)
    doc.setTextColor(col[0], col[1], col[2])
  }

  function tL(t: string, x: number, y: number)  { doc.text(t, x, y) }
  function tR(t: string, x: number, y: number)  { doc.text(t, x, y, { align: 'right'  }) }
  function tC(t: string, x: number, y: number)  { doc.text(t, x, y, { align: 'center' }) }

  // lw typed as `number` (not a literal) so callers can pass any numeric value
  function hLine(y: number, x1: number = LX, x2: number = RX, col: RGB = C.rule, lw: number = 0.25) {
    doc.setDrawColor(col[0], col[1], col[2])
    doc.setLineWidth(lw)
    doc.line(x1, y, x2, y)
  }

  function vLine(x: number, y1: number, y2: number, col: RGB = C.rule, lw: number = 0.18) {
    doc.setDrawColor(col[0], col[1], col[2])
    doc.setLineWidth(lw)
    doc.line(x, y1, x, y2)
  }

  function fillR(x: number, y: number, w: number, h: number, col: RGB) {
    doc.setFillColor(col[0], col[1], col[2])
    doc.rect(x, y, w, h, 'F')
  }

  let curY        = PAGE.MT
  const CONTENT_B = PAGE.H - PAGE.MB

  function ensureSpace(needed: number) {
    if (curY + needed > CONTENT_B) { doc.addPage(); curY = PAGE.MT }
  }

  // ── Pre-calculate totals (central calc engine) ────────────────────────────
  const totals   = calculateTotals(items as LineInput[])
  const subtotal = totals.subtotal
  const kdvTotal = totals.kdv_total
  const kdvMap   = totals.kdv_breakdown
  const grand    = totals.grand_total
  const kdvRates = Object.keys(kdvMap).filter(k => kdvMap[k] > 0).sort((a, b) => +a - +b)

  // ── Load logo (safe, max 6 s) ─────────────────────────────────────────────
  let logo: LogoData | null = null
  if (company.logoUrl?.trim()) {
    try { logo = await loadLogo(company.logoUrl.trim()) }
    catch { logo = null }
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // A. HEADER — LEFT: Company info  |  CENTER: Title  |  RIGHT: Doc metadata
  // ══════════════════════════════════════════════════════════════════════════════
  const COL_LEFT_W:  number = 70
  const COL_RIGHT_W: number = 56

  let leftY  = curY
  let rightY = curY

  // LEFT: Company logo + company info
  if (logo) {
    const { w, h } = logoDims(logo.pxW, logo.pxH)
    try {
      doc.addImage(logo.b64, 'PNG', LX, leftY, w, h)
      leftY += h + 3
    } catch { /* skip broken image — PDF continues */ }
  }

  setF('bold', 10, C.black)
  const nameLines = doc.splitTextToSize(company.name || '', COL_LEFT_W) as string[]
  nameLines.forEach(l => { tL(l, LX, leftY); leftY += 5 })
  leftY += 1

  setF('normal', 7.5, C.dark)
  if (company.address?.trim()) {
    const aLines = doc.splitTextToSize(company.address.trim(), COL_LEFT_W) as string[]
    aLines.forEach(l => { tL(l, LX, leftY); leftY += 4 })
    leftY += 0.5
  }

  const taxStr = [
    company.taxNumber ? 'Vergi Numarası: ' + company.taxNumber : '',
    company.taxOffice ? 'Vergi Dairesi: ' + company.taxOffice : '',
  ].filter(Boolean).join('  ·  ')
  if (taxStr) {
    setF('normal', 7, C.mid)
    tL(taxStr, LX, leftY); leftY += 4
  }

  if (company.mersisNo?.trim()) {
    setF('normal', 7, C.mid)
    tL('MERSİS No: ' + company.mersisNo.trim(), LX, leftY); leftY += 4
  }

  const contactStr = [company.phone, company.website].filter(Boolean).join('   ')
  if (contactStr) {
    setF('normal', 7, C.muted)
    tL(contactStr, LX, leftY); leftY += 4
  }

  // CENTER: Title
  setF('bold', 15, C.black)
  tC('PROFORMA FATURA', CX, curY + 6)
  setF('normal', 7, C.muted)
  tC(currencyLabel(currency), CX, curY + 12)

  // RIGHT: Document metadata
  setF('bold', 11, C.black)
  tR(proformaNo, RX, rightY); rightY += 6

  setF('normal', 8, C.mid)
  tR('Tarih: ' + fmtDate(createdAt), RX, rightY); rightY += 5
  tR('Son Geçerlilik: ' + addDays(createdAt, validityDays), RX, rightY); rightY += 5

  setF('normal', 7.5, C.muted)
  tR('Geçerlilik: ' + validityDays + ' gün', RX, rightY); rightY += 5

  curY = Math.max(leftY, rightY) + 4
  hLine(curY, LX, RX, C.hrule, 0.6)
  curY += 6

  // ══════════════════════════════════════════════════════════════════════════════
  // B. CUSTOMER — explicit "Müşteri Bilgileri" section header
  // ══════════════════════════════════════════════════════════════════════════════
  setF('bold', 7, C.muted)
  tL('MÜŞTERİ BİLGİLERİ', LX, curY); curY += 5

  setF('bold', 9.5, C.black)
  const custName = customer.name?.trim() || '—'
  const cLines = doc.splitTextToSize(custName, BODY_W) as string[]
  cLines.forEach(l => { tL(l, LX, curY); curY += 5 })
  curY += 1

  setF('normal', 8, C.dark)
  if (customer.address?.trim()) {
    const aL = doc.splitTextToSize(customer.address.trim(), BODY_W * 0.65) as string[]
    aL.forEach(l => { tL(l, LX, curY); curY += 4 })
  }

  const custTax = [
    customer.taxNumber ? 'Vergi No: ' + customer.taxNumber : '',
    customer.taxOffice ? 'Vergi Dairesi: ' + customer.taxOffice : '',
  ].filter(Boolean).join('  ·  ')
  if (custTax) {
    setF('normal', 7.5, C.mid)
    tL(custTax, LX, curY); curY += 4
  }

  const custContact = [customer.phone, customer.email].filter(Boolean).join('   ')
  if (custContact) {
    setF('normal', 7.5, C.mid)
    tL(custContact, LX, curY); curY += 4
  }

  curY += 4
  hLine(curY, LX, RX, C.hrule, 0.5)
  curY += 6

  // ══════════════════════════════════════════════════════════════════════════════
  // C. TABLE
  // ══════════════════════════════════════════════════════════════════════════════
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
    fillR(TABLE_X, curY, TABLE_W, THEAD_H, C.thead)
    hLine(curY,           TABLE_X, TABLE_X + TABLE_W, C.hrule, 0.4)
    hLine(curY + THEAD_H, TABLE_X, TABLE_X + TABLE_W, C.hrule, 0.4)

    setF('bold', 6, C.dark)
    const ty = curY + THEAD_H / 2 + 2.8
    tL('ÜRÜN / HİZMET',           COL_X.NAME      + CP, ty)
    tC('BİRİM',                   COL_X.UNIT      + COL.UNIT      / 2, ty)
    tC('ADET',                    COL_X.QTY       + COL.QTY       / 2, ty)
    tR('BİRİM FİYAT (' + S + ')',    COL_X.PRICE     + COL.PRICE     - CP, ty)
    tC('İSKONTO %',                  COL_X.DISC      + COL.DISC      / 2, ty)
    tR('NET TUTAR (' + S + ')',      COL_X.DISCPRICE + COL.DISCPRICE - CP, ty)
    tC('KDV %',                      COL_X.KDV       + COL.KDV       / 2, ty)
    tR('SATIR TOPLAMI (' + S + ')',  COL_X.TOTAL     + COL.TOTAL     - CP, ty)

    // Header underline (thicker rule below header)
    hLine(curY + THEAD_H, TABLE_X, TABLE_X + TABLE_W, C.hrule, 0.6)
    curY += THEAD_H
  }

  ensureSpace(THEAD_H + ROW_H * 2)
  drawTableHeader()

  for (let i = 0; i < items.length; i++) {
    const it          = items[i]
    const line        = calculateLine(it as LineInput)
    const qty         = line.quantity
    const price       = line.price
    const disc        = line.discount_percent
    const lineSubtotal = line.line_subtotal
    const kdvPct      = line.kdv
    const rowTotal    = line.line_total

    doc.setFontSize(8)
    const nLines = doc.splitTextToSize(it.name?.trim() || '—', COL.NAME - CP * 2) as string[]
    const textRows = Math.max(nLines.length, 1)
    const rowH     = Math.max(ROW_H, textRows * 4.3 + CP * 2)

    if (curY + rowH > CONTENT_B) {
      doc.addPage(); curY = PAGE.MT; drawTableHeader()
    }

    if (i % 2 === 1) fillR(TABLE_X, curY, TABLE_W, rowH, C.alt)

    setF('normal', 8, C.dark)
    let ny = curY + CP + 3.8
    nLines.forEach(l => { tL(l, COL_X.NAME + CP, ny); ny += 4.3 })

    const midY = curY + rowH / 2 + 2.8
    setF('normal', 8, C.dark)
    tC(it.unit || 'adet',                                     COL_X.UNIT      + COL.UNIT      / 2, midY)
    tC(qty.toString(),                                         COL_X.QTY       + COL.QTY       / 2, midY)
    tR(money(price, S),                                        COL_X.PRICE     + COL.PRICE     - CP, midY)
    tC(disc > 0 ? '%' + disc : '—',                            COL_X.DISC      + COL.DISC      / 2, midY)
    tR(money(lineSubtotal, S),                                 COL_X.DISCPRICE + COL.DISCPRICE - CP, midY)
    tC('%' + kdvPct,                                           COL_X.KDV       + COL.KDV       / 2, midY)
    setF('bold', 8, C.ink)
    tR(money(rowTotal, S),                                     COL_X.TOTAL     + COL.TOTAL     - CP, midY)

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
  curY += 8

  // ══════════════════════════════════════════════════════════════════════════════
  // D. TOTALS (right block) + YALNIZ (left)
  // ══════════════════════════════════════════════════════════════════════════════
  const TW:  number = 68
  const TXL: number = RX - TW

  const totH = kdvRates.length * 4.5 + 3 + 5.5 + 5.5 + 14 + 4
  ensureSpace(totH + 20)

  // Separator line above totals
  hLine(curY, TXL, RX, C.hrule, 0.4)
  curY += 5

  const totStartY = curY

  setF('normal', 8, C.mid)
  for (const rate of kdvRates) {
    tL('KDV %' + rate, TXL, curY)
    tR(money(kdvMap[rate], S), RX, curY)
    curY += 4.5
  }
  if (kdvRates.length > 0) {
    hLine(curY, TXL, RX, C.rule, 0.2)
    curY += 3
  }

  setF('normal', 9, C.mid)
  tL('Ara Toplam', TXL, curY)
  setF('bold', 9, C.ink)
  tR(money(subtotal, S), RX, curY)
  curY += 6

  // Show discount total if any discount applied
  if (totals.total_discount > 0) {
    setF('normal', 9, C.mid)
    tL('İskonto', TXL, curY)
    setF('bold', 9, C.accent)
    tR('-' + money(totals.total_discount, S), RX, curY)
    curY += 6
  }

  setF('normal', 9, C.mid)
  tL('Toplam KDV', TXL, curY)
  setF('bold', 9, C.ink)
  tR(money(kdvTotal, S), RX, curY)
  curY += 6

  hLine(curY, TXL, RX, C.hrule, 0.3)
  curY += 3

  const GT_H: number = 14
  fillR(TXL - 2, curY, TW + 4, GT_H, C.total)
  setF('bold', 10, C.white)
  tL('GENEL TOPLAM', TXL + 3, curY + 8.5)
  setF('bold', 14, C.white)
  tR(money(grand, S), RX - 3, curY + 9)
  curY += GT_H + 8

  const YALNIZ_W: number = TXL - LX - 6
  if (currency === 'TRY' && grand > 0) {
    const yText = toWordsTR(grand, currency)
    if (yText) {
      setF('bold', 7.5, C.mid)
      tL('Yalnız:', LX, totStartY)
      setF('normal', 7.5, C.dark)
      doc.setFontSize(7.5)
      let yy = totStartY + 4.5
      const yLines = doc.splitTextToSize(yText, YALNIZ_W) as string[]
      yLines.forEach(l => {
        if (yy < CONTENT_B) { tL(l, LX, yy); yy += 4 }
      })
    }
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // E. FX footnote
  // ══════════════════════════════════════════════════════════════════════════════
  const fxParts: string[] = []
  if (fxUsd > 0) fxParts.push('1 USD = ₺' + fxUsd.toFixed(4))
  if (fxEur > 0) fxParts.push('1 EUR = ₺' + fxEur.toFixed(4))
  if (fxParts.length > 0) {
    ensureSpace(7)
    setF('normal', 7, C.muted)
    tL('Kur (Oluşturma Tarihi): ' + fxParts.join('   '), LX, curY)
    curY += 5
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // F. NOTES + VALIDITY LINE
  // ══════════════════════════════════════════════════════════════════════════════
  ensureSpace(12)
  hLine(curY, LX, RX, C.rule, 0.2)
  curY += 5

  setF('normal', 7.5, C.mid)
  tL('Bu proforma fatura ' + validityDays + ' gün geçerlidir.', LX, curY)
  tR('Son geçerlilik: ' + addDays(createdAt, validityDays), RX, curY)
  curY += 5

  setF('normal', 7, C.muted)
  tL('Bu belge proforma faturadır; resmi fatura yerine geçmez.', LX, curY)
  curY += 5

  if (notes?.trim()) {
    ensureSpace(14)
    setF('bold', 8, C.dark)
    tL('Not:', LX, curY); curY += 4.5
    setF('normal', 8, C.dark)
    doc.setFontSize(8)
    const nl = doc.splitTextToSize(notes.trim(), BODY_W) as string[]
    nl.forEach(l => { ensureSpace(4); tL(l, LX, curY); curY += 4 })
    curY += 3
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // G. BANK INFO
  // ══════════════════════════════════════════════════════════════════════════════
  if (banks.length > 0) {
    ensureSpace(20)
    hLine(curY, LX, RX, C.rule, 0.2)
    curY += 5
    setF('bold', 7.5, C.mid)
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

      setF('bold', 8.5, C.ink)
      tL([lb.bankName, lb.branchName].filter(Boolean).join(' — '), BCX[0], curY)
      doc.setFont('courier', 'normal')
      doc.setFontSize(7.5)
      doc.setTextColor(C.mid[0], C.mid[1], C.mid[2])
      tL('IBAN: ' + (lb.iban || ''), BCX[0] + 1, curY + 5)

      if (rb) {
        doc.setFont(FONT, 'bold')
        doc.setFontSize(8.5)
        doc.setTextColor(C.ink[0], C.ink[1], C.ink[2])
        tL([rb.bankName, rb.branchName].filter(Boolean).join(' — '), BCX[1], curY)
        doc.setFont('courier', 'normal')
        doc.setFontSize(7.5)
        doc.setTextColor(C.mid[0], C.mid[1], C.mid[2])
        tL('IBAN: ' + (rb.iban || ''), BCX[1] + 1, curY + 5)
      }

      doc.setFont(FONT, 'normal')
      curY += 12
      i += rb ? 2 : 1
    }
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // H. PAGE FOOTER (all pages)
  // ══════════════════════════════════════════════════════════════════════════════
  const totalPages = doc.getNumberOfPages()
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p)
    const fy: number = PAGE.H - PAGE.MB + 2
    hLine(fy, LX, RX, C.rule, 0.25)
    setF('normal', 7, C.muted)
    tL(company.name || '',                            LX, fy + 4.5)
    tC('Sayfa ' + p + ' / ' + totalPages,         CX, fy + 4.5)
    tR(proformaNo + '  ·  ' + fmtDate(createdAt), RX, fy + 4.5)
  }

  doc.save(proformaNo + '.pdf')
}
