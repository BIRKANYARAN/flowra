import { calculateTotals, round2, type LineInput } from '@/lib/calc'

// ═══════════════════════════════════════════════════════════════════════════════
// Flowra PDF Engine v7 — Institutional Brand System
//
// 5 palettes × 4 document style presets.
// Every combination is designed to feel like a real corporate document,
// not ERP output.
//
// Palettes: charcoal | navy | slate | deep-green | burgundy
// Styles:   corporate | executive | industrial | minimal
//
// Structure per style:
//   corporate  — Full-width accent band, 2-col info, accent table header
//   executive  — No band, large company name + hairline, spacious layout
//   industrial — Narrow accent band, dense info, compact table
//   minimal    — No band, very large name, hairlines only
// ═══════════════════════════════════════════════════════════════════════════════

// ── Exported type contracts ───────────────────────────────────────────────────

export type BrandColor = 'charcoal' | 'navy' | 'slate' | 'deep-green' | 'burgundy'
export type DocumentStyle = 'corporate' | 'executive' | 'industrial' | 'minimal'

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

export interface PdfPreparer {
  name:  string
  title: string
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
  preparer?:    PdfPreparer
  notes?:       string
  fxUsd?:       number | null
  fxEur?:       number | null
  brand?: {
    color: BrandColor
    style: DocumentStyle
  }
}

// ── Internal types ────────────────────────────────────────────────────────────

type RGB = [number, number, number]

interface Palette {
  accent:      RGB
  accentText:  RGB
  ink:         RGB
  inkMid:      RGB
  inkLight:    RGB
  ruleHeavy:   RGB
  ruleMed:     RGB
  ruleLight:   RGB
  bgZebra:     RGB
  white:       RGB
}

interface StyleMetrics {
  // Page margins (mm)
  ml: number
  mr: number
  // Header band
  hasBand:    boolean
  bandH:      number
  // Info block
  infoPad:    number  // top padding below band
  // Table
  rowH:       number
  theadH:     number
  cellPad:    number  // horizontal cell padding
  // Totals box width (mm)
  totW:       number
  // Footer extra padding
  footerPad:  number
  // Vertical rhythm multiplier (1 = normal, 1.4 = executive spacious)
  vRhythm:    number
}

interface LogoData { b64: string; pxW: number; pxH: number; format: 'PNG' | 'JPEG' }

// Logos are rasterized at most this many px on the long edge — they print small
// (≤40mm), so a higher raster only bloats the PDF.
const MAX_LOGO_RASTER_PX = 800

// ── Palette definitions ───────────────────────────────────────────────────────

const PALETTES: Record<BrandColor, Palette> = {
  charcoal: {
    accent:     [31,  41,  55],
    accentText: [255, 255, 255],
    ink:        [17,  24,  39],
    inkMid:     [55,  65,  81],
    inkLight:   [107, 114, 128],
    ruleHeavy:  [55,  65,  81],
    ruleMed:    [156, 163, 175],
    ruleLight:  [229, 231, 235],
    bgZebra:    [249, 250, 251],
    white:      [255, 255, 255],
  },
  navy: {
    accent:     [15,  23,  42],
    accentText: [255, 255, 255],
    ink:        [15,  23,  42],
    inkMid:     [51,  65,  85],
    inkLight:   [100, 116, 139],
    ruleHeavy:  [51,  65,  85],
    ruleMed:    [148, 163, 184],
    ruleLight:  [226, 232, 240],
    bgZebra:    [248, 250, 252],
    white:      [255, 255, 255],
  },
  slate: {
    accent:     [30,  41,  59],
    accentText: [255, 255, 255],
    ink:        [30,  41,  59],
    inkMid:     [71,  85,  105],
    inkLight:   [100, 116, 139],
    ruleHeavy:  [71,  85,  105],
    ruleMed:    [148, 163, 184],
    ruleLight:  [226, 232, 240],
    bgZebra:    [248, 250, 252],
    white:      [255, 255, 255],
  },
  'deep-green': {
    accent:     [6,   46,  26],
    accentText: [255, 255, 255],
    ink:        [6,   46,  26],
    inkMid:     [22,  78,  52],
    inkLight:   [74,  137, 92],
    ruleHeavy:  [22,  78,  52],
    ruleMed:    [134, 187, 151],
    ruleLight:  [220, 242, 227],
    bgZebra:    [250, 253, 251],
    white:      [255, 255, 255],
  },
  burgundy: {
    accent:     [68,  6,   29],
    accentText: [255, 255, 255],
    ink:        [68,  6,   29],
    inkMid:     [127, 29,  29],
    inkLight:   [161, 75,  86],
    ruleHeavy:  [127, 29,  29],
    ruleMed:    [220, 160, 173],
    ruleLight:  [252, 231, 236],
    bgZebra:    [253, 249, 250],
    white:      [255, 255, 255],
  },
}

// ── Style metrics per document preset ────────────────────────────────────────

const STYLE_METRICS: Record<DocumentStyle, StyleMetrics> = {
  corporate: {
    ml: 15, mr: 15,
    hasBand: true,  bandH: 26,
    infoPad: 8,
    rowH: 8.5,  theadH: 9,  cellPad: 3,
    totW: 80,
    footerPad: 6,
    vRhythm: 1.0,
  },
  executive: {
    ml: 18, mr: 18,
    hasBand: false, bandH: 0,
    infoPad: 10,
    rowH: 10,   theadH: 10, cellPad: 4,
    totW: 85,
    footerPad: 9,
    vRhythm: 1.4,
  },
  industrial: {
    ml: 15, mr: 15,
    hasBand: true,  bandH: 14,
    infoPad: 5,
    rowH: 7.5,  theadH: 8,  cellPad: 2.5,
    totW: 78,
    footerPad: 5,
    vRhythm: 0.85,
  },
  minimal: {
    ml: 20, mr: 20,
    hasBand: false, bandH: 0,
    infoPad: 12,
    rowH: 9,    theadH: 9,  cellPad: 3.5,
    totW: 82,
    footerPad: 8,
    vRhythm: 1.2,
  },
}

// ── Page constants ────────────────────────────────────────────────────────────

const PAGE_W = 210
const PAGE_H = 297
const PAGE_MB = 16   // bottom margin
const DPI     = 96 / 25.4

// Font paths (served from /public/fonts/)
const FONT_REG_PATH  = '/fonts/LiberationSans-Regular.ttf'
const FONT_BOLD_PATH = '/fonts/LiberationSans-Bold.ttf'

// Logo constraints (mm)
const LOGO_MAX_W_CORP = 38
const LOGO_MAX_H_CORP = 18
const LOGO_MAX_W_EXEC = 40
const LOGO_MAX_H_EXEC = 12
const LOGO_MAX_W_IND  = 28
const LOGO_MAX_H_IND  = 10
const LOGO_MAX_W_MIN  = 36
const LOGO_MAX_H_MIN  = 14

// ── Utility: safe number ──────────────────────────────────────────────────────

function n(v: unknown): number {
  const r = Number(v)
  return Number.isFinite(r) ? r : 0
}

// ── Utility: currency symbol ──────────────────────────────────────────────────

function sym(c: string): string {
  if (c === 'USD') return '$'
  if (c === 'EUR') return '€'
  if (c === 'GBP') return '£'
  return 'TL'
}

// ── Utility: number formatting ────────────────────────────────────────────────

function money(v: unknown, symbol = ''): string {
  const formatted = n(v).toLocaleString('tr-TR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return symbol ? formatted + ' ' + symbol : formatted
}

// ── Utility: currency label (Turkish proper) ──────────────────────────────────

function currencyLabel(c: string, useTurkish: boolean): string {
  if (c === 'USD') return 'ABD Doları (USD)'
  if (c === 'EUR') return 'Euro (EUR)'
  if (c === 'GBP') return 'İngiliz Sterlini (GBP)'
  return useTurkish ? 'Türk Lirası (TRY)' : 'Turk Lirasi (TRY)'
}

// ── Utility: date formatting ──────────────────────────────────────────────────

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
      day: '2-digit', month: 'long', year: 'numeric',
    })
  } catch { return '' }
}

// ── Turkish number-to-words ───────────────────────────────────────────────────
// useFullTurkish=true: proper ü,ö,ğ,ş,ı characters (LiberationSans)
// useFullTurkish=false: ASCII transliterated fallback

function amountToWords(amount: number, currency: string, useFullTurkish: boolean): string {
  if (!Number.isFinite(amount) || amount < 0) return ''

  if (currency !== 'TRY') {
    const formatted = n(amount).toLocaleString('tr-TR', {
      minimumFractionDigits: 2, maximumFractionDigits: 2,
    })
    return formatted + ' ' + currencyLabel(currency, useFullTurkish)
  }

  // Turkish ones, tens, hundreds
  const ones = useFullTurkish
    ? ['', 'bir', 'iki', 'üç', 'dört', 'beş', 'altı', 'yedi', 'sekiz', 'dokuz']
    : ['', 'bir', 'iki', 'uc',  'dort', 'bes', 'alti', 'yedi', 'sekiz', 'dokuz']
  const tens = useFullTurkish
    ? ['', 'on', 'yirmi', 'otuz', 'kırk', 'elli', 'altmış', 'yetmiş', 'seksen', 'doksan']
    : ['', 'on', 'yirmi', 'otuz', 'kirk', 'elli', 'altmis', 'yetmis', 'seksen', 'doksan']
  const yuz = useFullTurkish ? 'yüz' : 'yuz'
  const bin = 'bin'
  const milyon = 'milyon'
  const sifir = useFullTurkish ? 'sıfır' : 'sifir'

  function cvt(x: number): string {
    if (x === 0) return ''
    if (x < 10)  return ones[x]
    if (x < 100) {
      const t = tens[Math.floor(x / 10)]
      const o = ones[x % 10]
      return o ? t + ' ' + o : t
    }
    if (x < 1000) {
      const h = ones[Math.floor(x / 100)]
      const r = cvt(x % 100)
      const hStr = h === 'bir' ? '' : h + ' '
      return hStr + yuz + (r ? ' ' + r : '')
    }
    if (x < 1_000_000) {
      const t = Math.floor(x / 1000)
      const r = cvt(x % 1000)
      const tStr = t === 1 ? '' : cvt(t) + ' '
      return tStr + bin + (r ? ' ' + r : '')
    }
    const m = Math.floor(x / 1_000_000)
    const r = x % 1_000_000
    return cvt(m) + ' ' + milyon + (r ? ' ' + cvt(r) : '')
  }

  const rounded = Math.round(amount * 100) / 100
  const [iStr, dStr] = rounded.toFixed(2).split('.')
  const iNum = parseInt(iStr, 10)
  const dNum = parseInt(dStr, 10)

  const liraStr = iNum === 0 ? sifir : cvt(iNum)
  const liraLabel = useFullTurkish ? 'Türk Lirası' : 'Turk Lirasi'
  const kurusLabel = useFullTurkish ? 'Kuruş' : 'Kurus'

  const base = liraStr + ' ' + liraLabel
  return dNum > 0 ? base + ' ' + cvt(dNum) + ' ' + kurusLabel : base
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

// ── Logo loading ──────────────────────────────────────────────────────────────

function resolveLogoUrl(url: string): string {
  if (url.startsWith('http') || url.startsWith('data:')) return url
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!base) return url
  return `${base}/storage/v1/object/public/logos/${url}`
}

// Draw an <img> source onto a canvas → compact JPEG data-URL + original pixel
// dimensions. JPEG (vs PNG) keeps the embedded logo ~10× smaller (a 640px logo
// went from ~1.7 MB PNG to ~50 KB), and a white backfill makes transparent PNG
// logos render correctly on the (white) invoice instead of turning black.
function rasterizeToLogoData(imgSrc: string, revoke?: () => void): Promise<LogoData | null> {
  return new Promise<LogoData | null>(resolve => {
    const img = new Image()
    img.onload = () => {
      try {
        const ow = Math.max(img.naturalWidth  || img.width,  1)
        const oh = Math.max(img.naturalHeight || img.height, 1)
        // Downscale the raster (display size is ≤40mm); keep aspect ratio.
        const scale = Math.min(1, MAX_LOGO_RASTER_PX / Math.max(ow, oh))
        const w = Math.max(1, Math.round(ow * scale))
        const h = Math.max(1, Math.round(oh * scale))
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext('2d')
        if (!ctx) { revoke?.(); resolve(null); return }
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, w, h)
        ctx.drawImage(img, 0, 0, w, h)
        revoke?.()
        // pxW/pxH are the ORIGINAL dimensions so the mm sizing keeps the true aspect.
        resolve({ b64: canvas.toDataURL('image/jpeg', 0.92), pxW: ow, pxH: oh, format: 'JPEG' })
      } catch { revoke?.(); resolve(null) }
    }
    img.onerror = () => { revoke?.(); resolve(null) }
    img.src = imgSrc
  })
}

async function loadLogo(url: string): Promise<LogoData | null> {
  if (!url?.trim()) return null
  const src = resolveLogoUrl(url.trim())

  // Data URI (server-embedded): load DIRECTLY into an <img> — no fetch(), so it is
  // immune to the CSP `connect-src` policy that blocked the previous fetch()-based
  // path (the reason the logo never reached the PDF). Data URIs are same-origin →
  // no CORS, no canvas taint. This is the primary, reliable path.
  if (src.startsWith('data:')) {
    return rasterizeToLogoData(src)
  }

  // Remote URL fallback: fetch as a blob (avoids canvas taint), then rasterize.
  const fetchUrl = src + (src.includes('?') ? '&' : '?') + '_cb=' + Date.now()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 6000)
  try {
    const res = await fetch(fetchUrl, { signal: controller.signal })
    clearTimeout(timer)
    if (!res.ok) return null
    const blob = await res.blob()
    const blobUrl = URL.createObjectURL(blob)
    return await rasterizeToLogoData(blobUrl, () => URL.revokeObjectURL(blobUrl))
  } catch (err) { clearTimeout(timer); void err; return null }
}

function logoDims(pxW: number, pxH: number, maxW: number, maxH: number): { w: number; h: number } {
  const mmW   = pxW / DPI
  const mmH   = pxH / DPI
  const scale = Math.min(maxW / mmW, maxH / mmH, 1)
  return { w: mmW * scale, h: mmH * scale }
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

// ── Table column computation (7 columns, no intermediate discounted-price) ────
// Ürün/Hizmet | Birim | Miktar | Birim Fiyatı | İsk.% | KDV% | Tutar

interface ColWidths {
  name:  number   // 35%
  unit:  number   // 7%
  qty:   number   // 8%
  price: number   // 15%
  disc:  number   // 7%
  kdv:   number   // 7%
  total: number   // 21% — adjusted to fill exactly
}

function computeColWidths(contentW: number): ColWidths {
  // Proportions: 35, 7, 8, 15, 7, 7, 21 → sum = 100
  const raw = [35, 7, 8, 15, 7, 7, 21].map(p => Math.round((p / 100) * contentW))
  // Adjust last column for exact fit
  const sumFirst6 = raw.slice(0, 6).reduce((a, b) => a + b, 0)
  raw[6] = contentW - sumFirst6
  return {
    name:  raw[0],
    unit:  raw[1],
    qty:   raw[2],
    price: raw[3],
    disc:  raw[4],
    kdv:   raw[5],
    total: raw[6],
  }
}

// ── Per-row Tutar: price × qty × (1 - disc/100), KDV hariç ──────────────────

function rowTutar(item: PdfItem): number {
  return n(item.price) * n(item.quantity) * (1 - n(item.discount_percent) / 100)
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN EXPORTED FUNCTION
// ═══════════════════════════════════════════════════════════════════════════════

export async function generatePdf(opts: PdfOptions): Promise<void> {
  // ── Unpack options ──────────────────────────────────────────────────────────
  const proformaNo   = opts.proformaNo   || 'PRF-???'
  const createdAt    = opts.createdAt    || new Date().toISOString()
  const validityDays = n(opts.validityDays) || 30
  const currency     = opts.currency     || 'TRY'
  const company      = opts.company      || ({} as PdfCompany)
  const customer     = opts.customer     || ({} as PdfCustomer)
  const banks        = Array.isArray(opts.banks) ? opts.banks : []
  const items        = Array.isArray(opts.items) ? opts.items.filter(Boolean) : []
  const notes        = opts.notes || ''
  const preparer     = opts.preparer
  const fxUsd        = n(opts.fxUsd)
  const fxEur        = n(opts.fxEur)

  // Brand defaults
  const brandColor: BrandColor  = opts.brand?.color ?? 'charcoal'
  const docStyle:   DocumentStyle = opts.brand?.style ?? 'corporate'

  const P  = PALETTES[brandColor]
  const SM = STYLE_METRICS[docStyle]

  const S        = sym(currency)
  const ML       = SM.ml
  const MR       = SM.mr
  const LX       = ML
  const RX       = PAGE_W - MR
  const CX       = PAGE_W / 2
  const CONTENT_W = PAGE_W - ML - MR
  const CONTENT_B = PAGE_H - PAGE_MB
  const COL       = computeColWidths(CONTENT_W)

  // ── Load jsPDF ──────────────────────────────────────────────────────────────
  const { default: jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })

  // ── Load font ───────────────────────────────────────────────────────────────
  let FONT = 'helvetica'
  const [regB64, bolB64] = await Promise.all([
    fetchFontB64(FONT_REG_PATH),
    fetchFontB64(FONT_BOLD_PATH),
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

  // ── Load logo ───────────────────────────────────────────────────────────────
  let logo: LogoData | null = null
  if (company.logoUrl?.trim()) {
    try { logo = await loadLogo(company.logoUrl.trim()) } catch { logo = null }
  }

  // ── Calculate totals ────────────────────────────────────────────────────────
  const totals        = calculateTotals(items as LineInput[])
  const subtotal      = totals.subtotal
  const totalDiscount = totals.total_discount
  const kdvTotal      = totals.kdv_total
  const kdvMap        = totals.kdv_breakdown
  const grand         = totals.grand_total
  const kdvRates      = Object.keys(kdvMap)
    .filter(k => kdvMap[k] > 0)
    .sort((a, b) => +a - +b)
  const hasDiscount   = totalDiscount > 0
  // Ara Toplam must show the PRE-discount gross so the summary reconciles line by
  // line: gross − İskonto + KDV = Genel Toplam. (subtotal is the post-discount net.)
  const grossSubtotal = round2(subtotal + totalDiscount)

  // ── Drawing primitives ──────────────────────────────────────────────────────

  function setF(style: 'normal' | 'bold', size: number, col: RGB) {
    doc.setFont(FONT, style)
    doc.setFontSize(size)
    doc.setTextColor(col[0], col[1], col[2])
  }

  function tL(text: string, x: number, y: number) { doc.text(text, x, y) }
  function tR(text: string, x: number, y: number) { doc.text(text, x, y, { align: 'right' }) }
  function tC(text: string, x: number, y: number) { doc.text(text, x, y, { align: 'center' }) }

  function hLine(y: number, x1 = LX, x2 = RX, col: RGB = P.ruleLight, lw = 0.2) {
    doc.setDrawColor(col[0], col[1], col[2])
    doc.setLineWidth(lw)
    doc.line(x1, y, x2, y)
  }

  function vLine(x: number, y1: number, y2: number, col: RGB = P.ruleLight, lw = 0.12) {
    doc.setDrawColor(col[0], col[1], col[2])
    doc.setLineWidth(lw)
    doc.line(x, y1, x, y2)
  }

  function fillR(x: number, y: number, w: number, h: number, col: RGB) {
    doc.setFillColor(col[0], col[1], col[2])
    doc.rect(x, y, w, h, 'F')
  }

  function strokeR(x: number, y: number, w: number, h: number, col: RGB, lw = 0.25) {
    doc.setDrawColor(col[0], col[1], col[2])
    doc.setLineWidth(lw)
    doc.rect(x, y, w, h, 'S')
  }

  // ── Vertical cursor ─────────────────────────────────────────────────────────
  let curY = 0

  function ensureSpace(needed: number): void {
    if (curY + needed > CONTENT_B) {
      doc.addPage()
      // Repeat a minimal page continuation header
      if (SM.hasBand) {
        fillR(0, 0, PAGE_W, SM.bandH, P.accent)
        setF('bold', 7, P.accentText)
        tR(proformaNo, RX - 4, SM.bandH / 2 + 2.5)
        curY = SM.bandH + 4
      } else {
        // Thin accent rule across top for bandless styles
        fillR(0, 0, PAGE_W, 1.5, P.accent)
        curY = 8
      }
    }
  }

  // ── Logo dimensions per style ───────────────────────────────────────────────

  function getLogoMaxDims(): { maxW: number; maxH: number } {
    switch (docStyle) {
      case 'executive':  return { maxW: LOGO_MAX_W_EXEC, maxH: LOGO_MAX_H_EXEC }
      case 'industrial': return { maxW: LOGO_MAX_W_IND,  maxH: LOGO_MAX_H_IND  }
      case 'minimal':    return { maxW: LOGO_MAX_W_MIN,  maxH: LOGO_MAX_H_MIN  }
      default:           return { maxW: LOGO_MAX_W_CORP, maxH: LOGO_MAX_H_CORP }
    }
  }

  // ── Section spacing helper ──────────────────────────────────────────────────

  function gap(base: number): number {
    return base * SM.vRhythm
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // HEADER — varies by document style
  // ══════════════════════════════════════════════════════════════════════════════

  function drawHeader_Corporate(): void {
    // Full-bleed accent band
    fillR(0, 0, PAGE_W, SM.bandH, P.accent)

    const HPAD   = 5
    const bandMY = SM.bandH / 2  // mid Y of band

    // LEFT side: logo or initials, then company name + address
    let logoEndX = HPAD

    if (logo) {
      const { maxW, maxH } = getLogoMaxDims()
      const { w, h } = logoDims(logo.pxW, logo.pxH, maxW, maxH)
      const logoY = (SM.bandH - h) / 2
      try {
        doc.addImage(logo.b64, logo.format, HPAD, logoY, w, h)
        logoEndX = HPAD + w + 4
      } catch { logo = null }
    }

    if (!logo) {
      // Two-letter initials in a soft box
      const initials = company.name?.trim().slice(0, 2).toUpperCase() || 'FL'
      setF('bold', 11, P.accentText)
      tL(initials, HPAD, bandMY + 4)
      logoEndX = HPAD + 12
    }

    // Company name (bold, medium size)
    if (company.name?.trim()) {
      setF('bold', 11, P.accentText)
      tL(company.name.trim(), logoEndX, bandMY - 1)
    }
    // Company address line (dimmer, smaller)
    if (company.address?.trim()) {
      // Blend toward background: use a lighter version of accentText
      const dimText: RGB = [
        Math.round(P.accentText[0] * 0.65),
        Math.round(P.accentText[1] * 0.65),
        Math.round(P.accentText[2] * 0.65),
      ]
      setF('normal', 6.5, dimText)
      // Single line — truncate if too wide
      const maxAddrW = RX - logoEndX - 70
      const addrLines = doc.splitTextToSize(company.address.trim(), maxAddrW) as string[]
      tL(addrLines[0] || '', logoEndX, bandMY + 5)
    }

    // RIGHT side: document identity
    const accentDim: RGB = [
      Math.round(P.accentText[0] * 0.6),
      Math.round(P.accentText[1] * 0.6),
      Math.round(P.accentText[2] * 0.6),
    ]
    const HDR_RX = RX - HPAD
    setF('normal', 5.5, accentDim)
    tR(t('PROFORMA FATURA'), HDR_RX, bandMY - 4)
    setF('bold', 10, P.accentText)
    tR(proformaNo, HDR_RX, bandMY + 3)
    setF('normal', 7, accentDim)
    tR(fmtDate(createdAt), HDR_RX, bandMY + 9)

    curY = SM.bandH + gap(SM.infoPad)
  }

  function drawHeader_Executive(): void {
    const startY = 14
    // Large company name, left-aligned
    setF('bold', 16, P.ink)
    tL(company.name?.trim() || 'Şirket Adı', LX, startY)

    // RIGHT: proforma no + date
    setF('bold', 9, P.inkMid)
    tR(proformaNo, RX, startY - 4)
    setF('normal', 7.5, P.inkLight)
    tR(fmtDate(createdAt), RX, startY + 2)

    // Logo floated below company name (right edge)
    if (logo) {
      const { maxW, maxH } = getLogoMaxDims()
      const { w, h } = logoDims(logo.pxW, logo.pxH, maxW, maxH)
      try {
        doc.addImage(logo.b64, logo.format, RX - w, startY + 5, w, h)
      } catch { /* ignore */ }
    }

    // Hairline rule
    const ruleY = startY + 7
    hLine(ruleY, LX, RX, P.ruleHeavy, 0.4)

    curY = ruleY + gap(SM.infoPad)
  }

  function drawHeader_Industrial(): void {
    // Narrow accent band
    fillR(0, 0, PAGE_W, SM.bandH, P.accent)

    const HPAD = 4
    const bandMY = SM.bandH / 2

    // LEFT: company name in compact font
    setF('bold', 9, P.accentText)
    tL(company.name?.trim() || '', HPAD, bandMY + 3)

    // RIGHT: "PROFORMA" label + number
    const HDR_RX = RX - HPAD
    const accentDim: RGB = [
      Math.round(P.accentText[0] * 0.6),
      Math.round(P.accentText[1] * 0.6),
      Math.round(P.accentText[2] * 0.6),
    ]
    setF('normal', 5.5, accentDim)
    tR(t('PROFORMA FATURA'), HDR_RX, bandMY - 1)
    setF('bold', 9, P.accentText)
    tR(proformaNo, HDR_RX, bandMY + 5)

    // Heavy rule below band
    hLine(SM.bandH + 0.5, 0, PAGE_W, P.ruleHeavy, 0.6)

    curY = SM.bandH + gap(SM.infoPad)
  }

  function drawHeader_Minimal(): void {
    const startY = 14

    // Logo floated to the right
    if (logo) {
      const { maxW, maxH } = getLogoMaxDims()
      const { w, h } = logoDims(logo.pxW, logo.pxH, maxW, maxH)
      try {
        doc.addImage(logo.b64, logo.format, RX - w, startY - 10, w, h)
      } catch { /* ignore */ }
    }

    // Very large company name
    setF('bold', 20, P.ink)
    tL(company.name?.trim() || 'Şirket Adı', LX, startY)

    // Single hairline across full width
    const ruleY = startY + 6
    hLine(ruleY, LX, RX, P.ruleLight, 0.1)

    // Proforma no — small, right-aligned below rule
    setF('normal', 7, P.inkLight)
    tR(proformaNo + '   ·   ' + fmtDate(createdAt), RX, ruleY + 5)

    curY = ruleY + gap(SM.infoPad)
  }

  // Dispatch header
  switch (docStyle) {
    case 'executive':  drawHeader_Executive();  break
    case 'industrial': drawHeader_Industrial(); break
    case 'minimal':    drawHeader_Minimal();    break
    default:           drawHeader_Corporate();  break
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // INFO BLOCK — 2-column: Satıcı (left) | Alıcı (right)
  // Third info column (document details) is embedded in corporate right-side for
  // executive/minimal; for industrial it's below in a dense row.
  // ══════════════════════════════════════════════════════════════════════════════

  function drawInfoBlock(): void {
    const COL2_W  = (CONTENT_W - 6) / 2
    const COL_L   = LX
    const COL_R   = LX + COL2_W + 6

    // For executive/minimal: include doc details as a 3rd mini-column
    const use3Col  = docStyle === 'corporate' || docStyle === 'industrial'
    const col3W    = use3Col ? 48 : 0
    const col2Adj  = use3Col ? (CONTENT_W - col3W - 8) / 2 : COL2_W
    const colRAdj  = use3Col ? LX + col2Adj + 6 : COL_R
    const colDoc   = use3Col ? RX - col3W : 0

    // Section labels
    const labelColor: RGB = P.inkLight

    if (docStyle === 'industrial') {
      // Dense: heavy top rule, no col borders
      hLine(curY, LX, RX, P.ruleHeavy, 0.5)
      curY += 5
    } else if (docStyle === 'minimal') {
      // No borders at all
    } else if (docStyle === 'executive') {
      // gentle separator
      curY += 2
    }

    const blockStartY = curY

    // ── LEFT: Satıcı ──────────────────────────────────────────────────────
    let ySat = blockStartY

    setF('bold', 5.5, labelColor)
    tL(t('Satıcı'), COL_L, ySat)
    ySat += 3.5

    if (company.name?.trim()) {
      setF('bold', docStyle === 'executive' ? 9 : 8, P.ink)
      let nameLines = doc.splitTextToSize(company.name.trim(), col2Adj) as string[]
      // Avoid orphaned short last line — try slightly wider column with smaller font
      if (nameLines.length === 2 && nameLines[1].length < 8) {
        setF('bold', 7, P.ink)
        nameLines = doc.splitTextToSize(company.name.trim(), col2Adj + 6) as string[]
      }
      nameLines.forEach(l => { tL(l, COL_L, ySat); ySat += 4.2 })
    }
    if (company.address?.trim()) {
      setF('normal', 7, P.inkLight)
      const lines = doc.splitTextToSize(company.address.trim(), col2Adj) as string[]
      lines.forEach(l => { tL(l, COL_L, ySat); ySat += 3.5 })
      ySat += 1
    }
    if (company.taxNumber?.trim()) {
      setF('normal', 6.5, labelColor)
      const vkn = t('VKN: ') + company.taxNumber.trim() +
        (company.taxOffice?.trim() ? '  ·  ' + company.taxOffice.trim() : '')
      tL(vkn, COL_L, ySat); ySat += 3.5
    }
    if (company.mersisNo?.trim()) {
      setF('normal', 6.5, labelColor)
      tL('MERSIS: ' + company.mersisNo.trim(), COL_L, ySat); ySat += 3.5
    }
    if (company.phone?.trim()) {
      setF('normal', 6.5, labelColor)
      tL(t('Tel: ') + company.phone.trim(), COL_L, ySat); ySat += 3.5
    }
    if (company.website?.trim()) {
      setF('normal', 6.5, labelColor)
      tL(company.website.trim(), COL_L, ySat); ySat += 3.5
    }
    if (company.email?.trim()) {
      setF('normal', 6.5, labelColor)
      tL(company.email.trim(), COL_L, ySat); ySat += 3.5
    }

    // ── RIGHT: Alıcı ──────────────────────────────────────────────────────
    let yAli = blockStartY

    setF('bold', 5.5, labelColor)
    tL(t('Alıcı'), colRAdj, yAli)
    yAli += 3.5

    const custName = customer.name?.trim() || '—'
    setF('bold', docStyle === 'executive' ? 9 : 8, P.ink)
    const cnls = doc.splitTextToSize(custName, col2Adj) as string[]
    cnls.forEach(l => { tL(l, colRAdj, yAli); yAli += 4.2 })

    if (customer.address?.trim()) {
      setF('normal', 7, P.inkLight)
      const lines = doc.splitTextToSize(customer.address.trim(), col2Adj) as string[]
      lines.forEach(l => { tL(l, colRAdj, yAli); yAli += 3.5 })
      yAli += 1
    }
    if (customer.taxNumber?.trim()) {
      setF('normal', 6.5, labelColor)
      const cvkn = t('VKN: ') + customer.taxNumber.trim() +
        (customer.taxOffice?.trim() ? '  ·  ' + customer.taxOffice.trim() : '')
      tL(cvkn, colRAdj, yAli); yAli += 3.5
    }
    if (customer.email?.trim()) {
      setF('normal', 6.5, labelColor)
      tL(customer.email.trim(), colRAdj, yAli); yAli += 3.5
    }
    if (customer.phone?.trim()) {
      setF('normal', 6.5, labelColor)
      tL(t('Tel: ') + customer.phone.trim(), colRAdj, yAli); yAli += 3.5
    }

    // ── THIRD COL: Document details (corporate / industrial) ───────────────
    let yDoc = blockStartY
    if (use3Col && colDoc > 0) {
      const docRX = RX
      const docRows: Array<{ label: string; value: string }> = [
        { label: t('Belge No'),           value: proformaNo },
        { label: t('Düzenleme Tarihi'),   value: fmtDate(createdAt) },
        { label: t('Geçerlilik'),         value: validityDays + t(' gün') },
        { label: t('Son Geçerlilik'),     value: addDays(createdAt, validityDays) },
      ]
      yDoc += 3.5  // align with col headers gap
      docRows.forEach(({ label, value }) => {
        setF('normal', 6.5, labelColor)
        tL(label, colDoc, yDoc)
        setF('bold', 7, P.inkMid)
        tR(value, docRX, yDoc)
        yDoc += 5
      })
    }

    // For executive/minimal, show doc details as a subtle line below
    if (!use3Col) {
      // show as inline kicker after info block
      const docY = Math.max(ySat, yAli) + 4
      setF('normal', 6.5, labelColor)
      tR(
        t('Düzenleme: ') + fmtDate(createdAt) + '   ·   ' +
        t('Geçerlilik: ') + validityDays + t(' gün'),
        RX, docY,
      )
    }

    curY = Math.max(ySat, yAli, yDoc) + gap(8)

    // Bottom separator
    if (docStyle === 'industrial') {
      hLine(curY - 4, LX, RX, P.ruleHeavy, 0.5)
    } else if (docStyle === 'minimal') {
      // nothing
    } else {
      hLine(curY - 4, LX, RX, P.ruleLight, 0.2)
    }
  }

  drawInfoBlock()

  // ══════════════════════════════════════════════════════════════════════════════
  // TABLE — 7 columns, style-aware header
  // ══════════════════════════════════════════════════════════════════════════════

  // Column X positions (cumulative from LX)
  const COL_X = {
    name:  LX,
    unit:  LX + COL.name,
    qty:   LX + COL.name + COL.unit,
    price: LX + COL.name + COL.unit + COL.qty,
    disc:  LX + COL.name + COL.unit + COL.qty + COL.price,
    kdv:   LX + COL.name + COL.unit + COL.qty + COL.price + COL.disc,
    total: LX + COL.name + COL.unit + COL.qty + COL.price + COL.disc + COL.kdv,
  }

  const CP = SM.cellPad
  const TABLE_W = CONTENT_W

  function drawTableHeader(): void {
    const theadH = SM.theadH
    const ty     = curY + theadH / 2 + 2.5

    if (docStyle === 'minimal') {
      // Hairlines only: bold underline in ink color
      setF('bold', 6.5, P.inkMid)
      hLine(curY, LX, RX, P.ruleLight, 0.1)
    } else if (docStyle === 'executive') {
      // Bold bottom rule, no fill
      setF('bold', 6.5, P.ink)
    } else {
      // corporate / industrial: filled accent header
      fillR(LX, curY, TABLE_W, theadH, P.accent)
      setF('bold', 6.5, P.accentText)
    }

    const labelKdv = t('KDV%')

    tL(t('Ürün / Hizmet'),   COL_X.name  + CP,                        ty)
    tC(t('Birim'),           COL_X.unit  + COL.unit  / 2,             ty)
    tC(t('Miktar'),          COL_X.qty   + COL.qty   / 2,             ty)
    tR(t('Birim Fiyatı'),   COL_X.price + COL.price  - CP,            ty)
    tC(t('İsk.%'),           COL_X.disc  + COL.disc  / 2,             ty)
    tC(labelKdv,             COL_X.kdv   + COL.kdv   / 2,             ty)
    tR(t('Tutar') + ' (' + S + ')', COL_X.total + COL.total - CP,     ty)

    if (docStyle === 'executive' || docStyle === 'minimal') {
      // Bold underline rule
      const ruleW = docStyle === 'minimal' ? 0.1 : 0.5
      hLine(curY + theadH, LX, RX, P.ruleHeavy, ruleW)
    }

    curY += theadH
  }

  ensureSpace(SM.theadH + SM.rowH * 2)
  drawTableHeader()

  // ── Table rows ──────────────────────────────────────────────────────────────
  for (let i = 0; i < items.length; i++) {
    const it      = items[i]
    const qty     = n(it.quantity)
    const price   = n(it.price)
    const disc    = n(it.discount_percent)
    const kdvPct  = n(it.kdv)
    const tutar   = rowTutar(it)  // KDV hariç

    doc.setFontSize(8)
    const nLines    = doc.splitTextToSize(it.name?.trim() || '—', COL.name - CP * 2) as string[]
    const descLines = it.description?.trim()
      ? (doc.splitTextToSize(it.description.trim(), COL.name - CP * 2) as string[])
      : []

    const textRows = nLines.length + descLines.length
    const rowH     = Math.max(SM.rowH, textRows * 4.0 + CP * 2 + 1)

    if (curY + rowH > CONTENT_B) {
      doc.addPage()
      if (SM.hasBand) {
        fillR(0, 0, PAGE_W, SM.bandH, P.accent)
        setF('bold', 7, P.accentText)
        tR(proformaNo, RX - 4, SM.bandH / 2 + 2.5)
        curY = SM.bandH + 4
      } else {
        fillR(0, 0, PAGE_W, 1.5, P.accent)
        curY = 8
      }
      drawTableHeader()
    }

    // Zebra
    if (i % 2 === 1) {
      fillR(LX, curY, TABLE_W, rowH, P.bgZebra)
    }

    // Product name
    setF('bold', 8, P.ink)
    let ny = curY + CP + 3.5
    nLines.forEach(l => { tL(l, COL_X.name + CP, ny); ny += 4.0 })

    // Description
    if (descLines.length > 0) {
      setF('normal', 6.5, P.inkLight)
      descLines.forEach(l => { tL(l, COL_X.name + CP, ny); ny += 3.5 })
    }

    const midY = curY + rowH / 2 + 2.5

    // Unit
    setF('normal', 8, P.inkLight)
    tC(it.unit || t('adet'), COL_X.unit + COL.unit / 2, midY)

    // Quantity
    setF('normal', 8, P.inkMid)
    tC(qty.toLocaleString('tr-TR'), COL_X.qty + COL.qty / 2, midY)

    // Unit price
    setF('normal', 8, P.inkMid)
    tR(money(price), COL_X.price + COL.price - CP, midY)

    // Discount
    setF('normal', 8, P.inkLight)
    tC(disc > 0 ? '%' + disc : '—', COL_X.disc + COL.disc / 2, midY)

    // KDV rate
    setF('normal', 8, P.inkLight)
    tC('%' + kdvPct, COL_X.kdv + COL.kdv / 2, midY)

    // Tutar (KDV hariç) — bold, anchor color
    setF('bold', 8.5, P.ink)
    tR(money(tutar), COL_X.total + COL.total - CP, midY)

    // Row bottom rule
    const ruleW = docStyle === 'minimal' ? 0.08 : 0.12
    hLine(curY + rowH, LX, RX, P.ruleLight, ruleW)

    // Vertical dividers (subtle)
    const colDividers = [COL_X.unit, COL_X.qty, COL_X.price, COL_X.disc, COL_X.kdv, COL_X.total]
    colDividers.forEach(cx => vLine(cx, curY, curY + rowH, P.ruleLight, 0.08))

    curY += rowH
  }

  curY += gap(8)

  // ══════════════════════════════════════════════════════════════════════════════
  // TOTALS BLOCK — right-aligned box, style-aware
  // ══════════════════════════════════════════════════════════════════════════════

  const TW   = SM.totW
  const TXL  = RX - TW

  // Height calculation
  const totLineCount = 1 + (hasDiscount ? 2 : 0) + kdvRates.length + (kdvRates.length > 1 ? 1 : 0)  // ara toplam + (iskonto + kdv matrahı) + kdv lines + kdv total (only when multiple rates)
  const totLineH = docStyle === 'executive' ? 7.5 : 6.5
  const totBoxH  = totLineCount * totLineH + (docStyle === 'executive' ? 10 : 8)
  const gtH      = docStyle === 'executive' ? 18 : 14  // GENEL TOPLAM stripe height

  ensureSpace(totBoxH + gtH + 50)

  const totStartY = curY

  // ── LEFT PANEL: Bank information (rendered at the same vertical level as totals) ──
  let bankPanelEndY = totStartY
  const hasBanksLocal = banks.length > 0
  if (hasBanksLocal) {
    const bankPanelW = TXL - LX - 8
    let bpy = totStartY

    setF('bold', 5.5, P.inkLight)
    tL(t('Ödeme Bilgileri').toUpperCase(), LX + CP, bpy + 5)
    bpy += 8

    banks.forEach(b => {
      const bankLabel = [b.bankName, b.branchName].filter(Boolean).join(' · ')
      setF('bold', 7.5, P.inkMid)
      const bankLabelLines = doc.splitTextToSize(bankLabel, bankPanelW - CP * 2) as string[]
      bankLabelLines.forEach(l => { tL(l, LX + CP, bpy); bpy += 4 })
      doc.setFont('courier', 'normal')
      doc.setFontSize(7)
      doc.setTextColor(P.inkLight[0], P.inkLight[1], P.inkLight[2])
      tL('IBAN: ' + (b.iban || ''), LX + CP, bpy)
      doc.setFont(FONT, 'normal')
      bpy += 7
    })

    bankPanelEndY = bpy
  }

  // Draw totals box (border only for corporate/industrial; thin rules for executive/minimal)
  if (docStyle === 'corporate' || docStyle === 'industrial') {
    strokeR(TXL, totStartY, TW, totBoxH, P.ruleMed, 0.25)
  }

  let ty = totStartY + (docStyle === 'executive' ? 8 : 6)

  // Ara Toplam
  setF('normal', docStyle === 'executive' ? 8.5 : 8, P.inkLight)
  tL(t('Ara Toplam'), TXL + CP, ty)
  setF('bold', docStyle === 'executive' ? 8.5 : 8, P.inkMid)
  tR(money(grossSubtotal, S), RX - CP, ty)
  ty += totLineH

  // İskonto + KDV Matrahı (net taxable base) — only when there is a discount, so
  // the reader can follow gross → −iskonto → matrah → +KDV → genel toplam.
  if (hasDiscount) {
    hLine(ty - totLineH + 0.5, TXL + CP, RX - CP, P.ruleLight, 0.15)
    setF('normal', docStyle === 'executive' ? 8.5 : 8, P.inkLight)
    tL(t('İskonto'), TXL + CP, ty)
    setF('bold', docStyle === 'executive' ? 8.5 : 8, P.inkMid)
    tR('- ' + money(totalDiscount, S), RX - CP, ty)
    ty += totLineH

    hLine(ty - totLineH + 0.5, TXL + CP, RX - CP, P.ruleLight, 0.15)
    setF('normal', docStyle === 'executive' ? 8.5 : 8, P.inkLight)
    tL(t('KDV Matrahı'), TXL + CP, ty)
    setF('bold', docStyle === 'executive' ? 8.5 : 8, P.inkMid)
    tR(money(subtotal, S), RX - CP, ty)   // subtotal = net = gross − iskonto
    ty += totLineH
  }

  // KDV breakdown lines
  kdvRates.forEach(rate => {
    hLine(ty - totLineH + 0.5, TXL + CP, RX - CP, P.ruleLight, 0.15)
    setF('normal', 7, P.inkLight)
    tL('KDV %' + rate, TXL + CP, ty)
    setF('normal', 7, P.inkLight)
    tR(money(kdvMap[rate], S), RX - CP, ty)
    ty += totLineH
  })

  // KDV Toplam summary row — only shown when there are multiple KDV rates
  if (kdvRates.length > 1) {
    hLine(ty - totLineH * 0.4, TXL + CP, RX - CP, P.ruleMed, 0.2)
    setF('bold', docStyle === 'executive' ? 8.5 : 8, P.inkMid)
    tL(t('KDV Tutarı'), TXL + CP, ty)
    tR(money(kdvTotal, S), RX - CP, ty)
  }

  // ── GENEL TOPLAM — the financial anchor ───────────────────────────────────
  const gtY = totStartY + totBoxH

  if (docStyle === 'executive' || docStyle === 'minimal') {
    // No fill — just generous whitespace + bold large type
    curY = gtY + (docStyle === 'executive' ? 10 : 8)
    setF('normal', 7.5, P.inkLight)
    tL(t('Genel Toplam'), TXL + CP, curY)
    setF('bold', docStyle === 'executive' ? 18 : 15, P.ink)
    tR(money(grand, S), RX - CP, curY + (docStyle === 'executive' ? 9 : 7))
    setF('normal', 6.5, P.inkLight)
    tR(currencyLabel(currency, useTurkish), RX - CP, curY + (docStyle === 'executive' ? 18 : 14))
    const execGtEnd = totStartY + (docStyle === 'executive' ? 28 : 22)
    curY = Math.max(execGtEnd, bankPanelEndY) + gap(6)
  } else {
    // corporate / industrial: filled accent stripe
    fillR(TXL, gtY, TW, gtH, P.accent)

    const accentDim: RGB = [
      Math.round(P.accentText[0] * 0.6),
      Math.round(P.accentText[1] * 0.6),
      Math.round(P.accentText[2] * 0.6),
    ]

    setF('bold', 7, accentDim)
    tL(t('GENEL TOPLAM'), TXL + CP, gtY + 6)
    setF('normal', 6, accentDim)
    tL(currencyLabel(currency, useTurkish), TXL + CP, gtY + 11)

    setF('bold', 14, P.accentText)
    tR(money(grand, S), RX - CP, gtY + 10)

    curY = Math.max(gtY + gtH, bankPanelEndY) + gap(8)
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // FOOTER BOX — Yalnız + Geçerlilik + FX + Banka + İmza
  // ══════════════════════════════════════════════════════════════════════════════

  const hasNotes  = notes?.trim().length > 0
  // Reference FX rates are only relevant when the proforma is in a foreign
  // currency — hide them on TRY-only documents (clutter, not information).
  const hasFx     = currency !== 'TRY' && (fxUsd > 0 || fxEur > 0)
  const hasPreparer = !!(preparer?.name?.trim())

  // "Yalnız" line — proper Turkish
  const yalnizWords  = amountToWords(grand, currency, useTurkish)
  const capitalFirst = yalnizWords.charAt(0).toUpperCase() + yalnizWords.slice(1)
  const yalnizLine   = grand > 0
    ? (useTurkish ? 'Yalnız ' : 'Yalniz ') + capitalFirst + (useTurkish ? ' tutarındadır.' : ' tutarindir.')
    : ''

  // Estimate footer height
  const sigH       = hasPreparer ? 38 : 34
  const yalnizH    = 9
  const validH     = 13   // validity + the "mali değeri yoktur" disclaimer line
  const notesH     = hasNotes ? 14 : 0
  const fxH        = hasFx ? 8 : 0
  const footerH    = yalnizH + validH + notesH + fxH + sigH

  ensureSpace(footerH + 4)

  const footerStartY = curY
  let   fi           = footerStartY

  // ── Yalnız satırı ──────────────────────────────────────────────────────────
  if (docStyle === 'minimal' || docStyle === 'executive') {
    hLine(fi, LX, RX, P.ruleLight, 0.1)
  } else {
    fillR(LX, fi, CONTENT_W, yalnizH, P.bgZebra)
    strokeR(LX, fi, CONTENT_W, yalnizH, P.ruleLight, 0.2)
  }
  setF('normal', 8, P.inkMid)
  tL(yalnizLine, LX + CP, fi + 6)
  fi += yalnizH

  // ── Geçerlilik + yasal ibare satırı ────────────────────────────────────────
  fi += 2  // extra breathing room above validity
  const validLine = t('Bu proforma teklifi ') + validityDays + t(' gün geçerlidir. Son geçerlilik: ') + addDays(createdAt, validityDays)
  const disclaimerLine = t('Bu belge proforma faturadır; mali ve hukuki değeri yoktur, fatura ve irsaliye yerine geçmez.')

  if (hasNotes) {
    const halfW   = CONTENT_W / 2 - 4
    const vls     = doc.splitTextToSize(validLine + ' ' + disclaimerLine, halfW) as string[]
    const nls2    = doc.splitTextToSize(t('Not: ') + notes.trim(), halfW) as string[]
    const blockH  = Math.max(vls.length, nls2.length) * 3.8 + 7

    if (docStyle !== 'minimal' && docStyle !== 'executive') {
      hLine(fi, LX, RX, P.ruleLight, 0.15)
    }
    setF('normal', 7, P.inkLight)
    let vy = fi + 5
    vls.forEach(l => { tL(l, LX + CP, vy); vy += 3.8 })

    setF('bold', 6.5, P.inkLight)
    tL(t('Not:'), LX + CONTENT_W / 2 + CP, fi + 5)
    setF('normal', 7, P.inkLight)
    let ny2 = fi + 5 + 3.8
    // Note: skip first element as it was the "Not:" label
    nls2.slice(1).forEach(l => { tL(l, LX + CONTENT_W / 2 + CP, ny2); ny2 += 3.8 })

    hLine(fi + blockH, LX, RX, P.ruleLight, 0.15)
    fi += blockH
  } else {
    hLine(fi, LX, RX, P.ruleLight, 0.15)
    setF('normal', 7, P.inkLight)
    tL(validLine, LX + CP, fi + 5)
    setF('normal', 6, P.inkLight)
    const dls = doc.splitTextToSize(disclaimerLine, CONTENT_W - CP * 2) as string[]
    let dy = fi + 9
    dls.forEach(l => { tL(l, LX + CP, dy); dy += 3.4 })
    const vH = Math.max(validH, (dy - fi) + 1)
    hLine(fi + vH, LX, RX, P.ruleLight, 0.15)
    fi += vH
  }

  // ── FX kur notu ────────────────────────────────────────────────────────────
  if (hasFx) {
    const fxParts: string[] = []
    if (fxUsd > 0) fxParts.push('1 USD = ' + fxUsd.toFixed(4) + ' TL')
    if (fxEur > 0) fxParts.push('1 EUR = ' + fxEur.toFixed(4) + ' TL')
    setF('normal', 5.5, P.inkLight)
    tL(t('Referans Kur (') + fmtDate(createdAt) + '): ' + fxParts.join('   '), LX + CP, fi + 5)
    hLine(fi + fxH, LX, RX, P.ruleLight, 0.12)
    fi += fxH
  }

  // ── İmza alanı ─────────────────────────────────────────────────────────────
  const SIG_COL_W = CONTENT_W / 2 - 6
  const SIG_LX    = LX + CP
  const SIG_RX    = LX + CONTENT_W / 2 + CP

  // Left label
  setF('bold', 5.5, P.inkMid)
  const leftLabel = hasPreparer ? t('Proformayı Düzenleyen') : t('Satıcı / Kaşe Onayı')
  tL(leftLabel, SIG_LX, fi + 6)
  tL(t('Alıcı Onayı'), SIG_RX, fi + 6)

  let sigCursor = fi + 6

  if (hasPreparer) {
    sigCursor += 5
    setF('bold', 8.5, P.ink)
    tL(preparer!.name.trim(), SIG_LX, sigCursor)
    if (preparer!.title?.trim()) {
      sigCursor += 4.5
      setF('normal', 7, P.inkLight)
      tL(preparer!.title.trim(), SIG_LX, sigCursor)
    }
  }

  // Signature lines — "İmza / Kaşe" label above each line
  const sigLineY = fi + sigH - 8
  setF('normal', 5.5, P.inkLight)
  tL(t('İmza / Kaşe'), SIG_LX, sigLineY - 2)
  tL(t('İmza / Kaşe'), SIG_RX, sigLineY - 2)
  hLine(sigLineY, SIG_LX, SIG_LX + SIG_COL_W, P.ruleMed, 0.45)
  hLine(sigLineY, SIG_RX, SIG_RX + SIG_COL_W, P.ruleMed, 0.45)

  setF('normal', 7, P.inkLight)
  tL(company.name?.trim()  || '', SIG_LX, fi + sigH - 3)
  tL(customer.name?.trim() || '', SIG_RX, fi + sigH - 3)

  fi += sigH

  // Outer border for the entire footer box (corporate/industrial only)
  if (docStyle === 'corporate' || docStyle === 'industrial') {
    strokeR(LX, footerStartY, CONTENT_W, fi - footerStartY, P.ruleLight, 0.25)
  } else {
    hLine(fi, LX, RX, P.ruleLight, 0.15)
  }

  curY = fi + SM.footerPad

  // ══════════════════════════════════════════════════════════════════════════════
  // PAGE FOOTER — all pages
  // ══════════════════════════════════════════════════════════════════════════════

  const totalPages = doc.getNumberOfPages()
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p)
    const fy = PAGE_H - PAGE_MB + 3
    hLine(fy, LX, RX, P.ruleLight, 0.15)
    setF('normal', 5.5, P.inkLight)
    tL(company.name?.trim() || '', LX, fy + 4)
    tC(t('Sayfa ') + p + ' / ' + totalPages, CX, fy + 4)
    tR(proformaNo + '   ·   ' + fmtDate(createdAt), RX, fy + 4)
  }

  doc.save(proformaNo + '.pdf')
}
