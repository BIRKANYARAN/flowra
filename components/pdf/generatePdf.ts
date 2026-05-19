import { calculateLine, calculateTotals, type LineInput } from '@/lib/calc'

// ═══════════════════════════════════════════════════════════════════════════════
// Flowra PDF Engine v6 — HTML önizlemesiyle birebir eşleşen kurumsal proforma
//
// Tasarım kaynağı: ProformaInvoice.tsx (in-app HTML önizlemesi)
//
// Yapı:
//   1. KOYU BAŞLIK (#1f2937 charcoal): Logo / baş harfler SOL, belge kimliği SAĞ
//   2. BİLGİ SATIRI (3 sütun): Satıcı Bilgileri | Alıcı Bilgileri | Belge Bilgileri
//   3. ÜRÜN TABLOSU: #1f2937 başlık, zebra satırlar
//   4. TOPLAM BLOĞU: Sağ hizalı, kenarlıklı + #1f2937 GENEL TOPLAM şeridi
//   5. YALNIZ SATIRI: Yazı ile tutar
//   6. GEÇERLİLİK + NOTLAR
//   7. ÖDEME BİLGİLERİ
//   8. İMZA ALANI: Satıcı Onayı | Alıcı Onayı
//   9. SAYFA ALTI
//
// Güvenlik:
//   • Logo yüklemesi: 6 sn timeout + onerror — asla başarısız olmaz
//   • Tüm sayısal girdiler Number() ile korunuyor
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
}

// ── RGB ───────────────────────────────────────────────────────────────────────
type RGB = [number, number, number]

// ── Sayfa geometrisi ──────────────────────────────────────────────────────────
const PAGE   = { W: 210, H: 297, ML: 14, MR: 14, MT: 14, MB: 16 }
const BODY_W = PAGE.W - PAGE.ML - PAGE.MR   // 182 mm
const LX     = PAGE.ML
const RX     = PAGE.W - PAGE.MR
const CX     = PAGE.W / 2

// Renk paleti — HTML önizlemesiyle eşleşen
const C: Record<string, RGB> = {
  charcoal:  [31,  41,  55],    // #1f2937 — başlık, tablo header, GENEL TOPLAM
  gray800:   [31,  41,  55],    // aynı
  gray700:   [55,  65,  81],    // koyu metin
  gray600:   [75,  85,  99],    // orta metin
  gray500:   [107, 114, 128],   // soluk metin
  gray400:   [156, 163, 175],   // etiket / muted
  gray300:   [209, 213, 219],   // kenarlık
  gray200:   [229, 231, 235],   // çok hafif kenarlık
  gray100:   [243, 244, 246],   // zebra satır
  gray50:    [249, 250, 251],   // yalnız arkaplan
  red500:    [239,  68,  68],   // iskonto
  white:     [255, 255, 255],
  white50:   [255, 255, 255],   // başlık üzeri soluk beyaz (alfa yok — %50 beyaz üzerine charcoal ≈ [143,148,155])
  whitemid:  [143, 148, 155],   // white/50 üzerine charcoal arka plan efekti
  whitedim:  [107, 114, 128],   // white/40
}

// Başlık yüksekliği
const HDR_H = 20

// Tablo sütun genişlikleri (toplam = BODY_W = 182mm)
// Ürün(50) + Birim(12) + Adet(12) + BirimFiyat(26) + İsk(12) + NetTutar(26) + KDV(12) + Toplam(32) = 182
const COL = { NAME: 50, UNIT: 12, QTY: 12, PRICE: 26, DISC: 12, DISCPRICE: 26, KDV: 12, TOTAL: 32 }
const ROW_H   = 8.5
const THEAD_H = 9
const CP      = 3

// Logo
const DPI        = 96 / 25.4
const LOGO_MAX_W = 40
const LOGO_MAX_H = 14

// Fontlar
const FONT_REG  = '/fonts/LiberationSans-Regular.ttf'
const FONT_BOLD = '/fonts/LiberationSans-Bold.ttf'

// ── Yardımcı fonksiyonlar ─────────────────────────────────────────────────────

function sym(c: string): string {
  return c === 'USD' ? '$' : c === 'EUR' ? '€' : c === 'GBP' ? '£' : 'TL'
}

function n(v: unknown): number {
  const r = Number(v); return Number.isFinite(r) ? r : 0
}

function money(v: unknown, symbol = ''): string {
  return n(v).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) +
    (symbol ? ' ' + symbol : '')
}

function currencyLabel(c: string): string {
  if (c === 'USD') return 'ABD Dolari (USD)'
  if (c === 'EUR') return 'Euro (EUR)'
  if (c === 'GBP') return 'Ingiliz Sterlini (GBP)'
  return 'Turk Lirasi (TRY)'
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
    const d = new Date(iso); d.setDate(d.getDate() + days)
    return d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' })
  } catch { return '' }
}

function toWordsTR(total: number, currency: string): string {
  if (!Number.isFinite(total) || total < 0) return ''
  if (currency !== 'TRY') {
    return n(total).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) +
      ' ' + currencyLabel(currency)
  }
  const ones = ['','Bir','Iki','Uc','Dort','Bes','Alti','Yedi','Sekiz','Dokuz']
  const tens  = ['','On','Yirmi','Otuz','Kirk','Elli','Altmis','Yetmis','Seksen','Doksan']
  function cvt(x: number): string {
    if (x === 0) return ''
    if (x < 10)  return ones[x]
    if (x < 100) return tens[Math.floor(x/10)] + (x%10 ? ' '+ones[x%10] : '')
    if (x < 1000) { const h = ones[Math.floor(x/100)]; const r = cvt(x%100); return (h === 'Bir' ? '' : h+' ') + 'Yuz' + (r ? ' '+r : '') }
    if (x < 1_000_000) { const t = Math.floor(x/1000); const r = cvt(x%1000); return (t===1 ? '' : cvt(t)+' ') + 'Bin' + (r ? ' '+r : '') }
    return cvt(Math.floor(x/1_000_000)) + ' Milyon' + (x%1_000_000 ? ' '+cvt(x%1_000_000) : '')
  }
  const rounded = Math.round(total*100)/100
  const [iStr, dStr] = rounded.toFixed(2).split('.')
  const iNum = parseInt(iStr, 10); const dNum = parseInt(dStr, 10)
  const lira = iNum === 0 ? 'Sifir' : cvt(iNum)
  return lira + ' Turk Lirasi' + (dNum > 0 ? ' ' + cvt(dNum) + ' Kurus' : '')
}

// ── Logo ──────────────────────────────────────────────────────────────────────
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
  const timer = setTimeout(() => controller.abort(), 6000)
  try {
    const res = await fetch(fetchUrl, { signal: controller.signal })
    clearTimeout(timer)
    if (!res.ok) return null
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
  } catch (err) { clearTimeout(timer); void err; return null }
}

function logoDims(pxW: number, pxH: number): { w: number; h: number } {
  const mmW = pxW / DPI; const mmH = pxH / DPI
  const scale = Math.min(LOGO_MAX_W / mmW, LOGO_MAX_H / mmH, 1)
  return { w: mmW * scale, h: mmH * scale }
}

// ── Font ──────────────────────────────────────────────────────────────────────
async function fetchFontB64(path: string): Promise<string | null> {
  try {
    const res = await fetch(path); if (!res.ok) return null
    const buf = await res.arrayBuffer(); const arr = new Uint8Array(buf)
    let bin = ''; const CHUNK = 8192
    for (let i = 0; i < arr.byteLength; i += CHUNK)
      bin += String.fromCharCode(...(arr.subarray(i, i + CHUNK) as unknown as number[]))
    return btoa(bin)
  } catch { return null }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ANA FONKSİYON
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
  const preparer     = opts.preparer
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

  // ── Çizim yardımcıları ─────────────────────────────────────────────────────
  function setF(style: 'normal' | 'bold', size: number, col: RGB = C.gray700) {
    doc.setFont(FONT, style); doc.setFontSize(size)
    doc.setTextColor(col[0], col[1], col[2])
  }
  function tL(t: string, x: number, y: number)  { doc.text(t, x, y) }
  function tR(t: string, x: number, y: number)  { doc.text(t, x, y, { align: 'right' }) }
  function tC(t: string, x: number, y: number)  { doc.text(t, x, y, { align: 'center' }) }

  function hLine(y: number, x1 = LX, x2 = RX, col: RGB = C.gray200, lw = 0.25) {
    doc.setDrawColor(col[0], col[1], col[2]); doc.setLineWidth(lw); doc.line(x1, y, x2, y)
  }
  function vLine(x: number, y1: number, y2: number, col: RGB = C.gray200, lw = 0.15) {
    doc.setDrawColor(col[0], col[1], col[2]); doc.setLineWidth(lw); doc.line(x, y1, x, y2)
  }
  function fillR(x: number, y: number, w: number, h: number, col: RGB) {
    doc.setFillColor(col[0], col[1], col[2]); doc.rect(x, y, w, h, 'F')
  }
  function strokeR(x: number, y: number, w: number, h: number, col: RGB, lw = 0.25) {
    doc.setDrawColor(col[0], col[1], col[2]); doc.setLineWidth(lw); doc.rect(x, y, w, h, 'S')
  }

  // ── Toplamlar ─────────────────────────────────────────────────────────────
  const totals        = calculateTotals(items as LineInput[])
  const subtotal      = totals.subtotal
  const totalDiscount = totals.total_discount
  const kdvTotal      = totals.kdv_total
  const kdvMap        = totals.kdv_breakdown
  const grand         = totals.grand_total
  const kdvRates      = Object.keys(kdvMap).filter(k => kdvMap[k] > 0).sort((a,b) => +a - +b)

  // ── Logo yükle ────────────────────────────────────────────────────────────
  let logo: LogoData | null = null
  if (company.logoUrl?.trim()) {
    try { logo = await loadLogo(company.logoUrl.trim()) } catch { logo = null }
  }

  let curY = 0
  const CONTENT_B = PAGE.H - PAGE.MB

  function ensureSpace(needed: number) {
    if (curY + needed > CONTENT_B) {
      doc.addPage()
      // Yeni sayfada başlık şeridini yeniden çiz
      fillR(0, 0, PAGE.W, HDR_H, C.charcoal)
      curY = HDR_H + 4
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 1. KOYU BAŞLIK — charcoal (#1f2937), tam genişlik
  //    SOL: Logo veya baş harfler + şirket adı
  //    SAĞ: Belge tipi + numara + para birimi
  // ══════════════════════════════════════════════════════════════════════════
  fillR(0, 0, PAGE.W, HDR_H, C.charcoal)

  const HDR_PAD = 5
  let logoEndX = LX + HDR_PAD

  // Logo
  if (logo) {
    const { w, h } = logoDims(logo.pxW, logo.pxH)
    const lh = Math.min(h, HDR_H - 4)
    const lw = w * (lh / h)
    const ly = (HDR_H - lh) / 2
    try {
      doc.addImage(logo.b64, 'PNG', LX + HDR_PAD, ly, lw, lh)
      logoEndX = LX + HDR_PAD + lw + 4
    } catch { logo = null }
  }

  if (!logo) {
    // Baş harfler — şirket adı yoksa "FL"
    const initials = company.name?.trim().slice(0, 2).toUpperCase() || 'FL'
    setF('bold', 12, C.white)
    tL(initials, LX + HDR_PAD, HDR_H / 2 + 4)
    logoEndX = LX + HDR_PAD + 14
  }

  // Şirket adı (soluk beyaz, küçük — logo yanında)
  if (company.name?.trim()) {
    setF('normal', 8.5, C.whitemid)
    tL(company.name.trim(), logoEndX, HDR_H / 2 + 3)
  }

  // Sağ taraf: belge kimliği
  const HDR_RX = RX - HDR_PAD
  setF('bold', 7, C.whitemid)
  tR('PROFORMA FATURA', HDR_RX, HDR_H / 2 - 2)
  setF('bold', 11, C.white)
  tR(proformaNo, HDR_RX, HDR_H / 2 + 5)
  // Para birimi küçük etiket
  setF('normal', 6.5, C.whitemid)
  tR(currencyLabel(currency), HDR_RX, HDR_H / 2 + 10)

  curY = HDR_H + 7

  // ══════════════════════════════════════════════════════════════════════════
  // 2. BİLGİ SATIRI — 3 sütun: Satıcı | Alıcı | Belge
  // ══════════════════════════════════════════════════════════════════════════
  const COL3_W  = BODY_W / 3
  const COL3_GAP = 6
  const COL3_IW  = (BODY_W - COL3_GAP * 2) / 3
  const COL3_X   = [LX, LX + COL3_IW + COL3_GAP, LX + (COL3_IW + COL3_GAP) * 2]

  // Sütun başlıkları — gri, küçük caps
  const COL_HEADERS = ['SATICI BILGILERI', 'ALICI BILGILERI', 'BELGE BILGILERI']
  setF('bold', 6, C.gray400)
  COL_HEADERS.forEach((h, i) => tL(h, COL3_X[i], curY))
  curY += 2

  // İnce ayırıcı çizgiler altında başlık
  COL_HEADERS.forEach((_, i) => hLine(curY, COL3_X[i], COL3_X[i] + COL3_IW, C.gray200, 0.2))
  curY += 4

  // Satır başlangıç Y — 3 sütun bağımsız olarak büyür; sonunda max al
  let ySat  = curY
  let yAli  = curY
  let yBelge = curY

  // ── Satıcı sütunu ────────────────────────────────────────────────────────
  const cname = company.name?.trim()
  if (cname) {
    setF('bold', 8.5, C.gray700)
    const nls = doc.splitTextToSize(cname, COL3_IW) as string[]
    nls.forEach(l => { tL(l, COL3_X[0], ySat); ySat += 4.5 })
  }
  if (company.address?.trim()) {
    setF('normal', 7, C.gray500)
    const als = doc.splitTextToSize(company.address.trim(), COL3_IW) as string[]
    als.forEach(l => { tL(l, COL3_X[0], ySat); ySat += 3.6 })
    ySat += 0.5
  }
  if (company.taxNumber?.trim()) {
    setF('normal', 6.5, C.gray400)
    const vkn = 'VKN: ' + company.taxNumber.trim() + (company.taxOffice?.trim() ? '  · ' + company.taxOffice.trim() : '')
    tL(vkn, COL3_X[0], ySat); ySat += 3.6
  }
  if (company.mersisNo?.trim()) {
    setF('normal', 6.5, C.gray400)
    tL('MERSIS: ' + company.mersisNo.trim(), COL3_X[0], ySat); ySat += 3.6
  }
  if (company.phone?.trim()) {
    setF('normal', 6.5, C.gray400)
    tL('Tel: ' + company.phone.trim(), COL3_X[0], ySat); ySat += 3.6
  }
  if (company.website?.trim()) {
    setF('normal', 6.5, C.gray400)
    tL(company.website.trim(), COL3_X[0], ySat); ySat += 3.6
  }

  // ── Alıcı sütunu ─────────────────────────────────────────────────────────
  const custName = customer.name?.trim() || '—'
  setF('bold', 8.5, C.gray700)
  const cnls = doc.splitTextToSize(custName, COL3_IW) as string[]
  cnls.forEach(l => { tL(l, COL3_X[1], yAli); yAli += 4.5 })
  if (customer.address?.trim()) {
    setF('normal', 7, C.gray500)
    const cals = doc.splitTextToSize(customer.address.trim(), COL3_IW) as string[]
    cals.forEach(l => { tL(l, COL3_X[1], yAli); yAli += 3.6 })
    yAli += 0.5
  }
  if (customer.taxNumber?.trim()) {
    setF('normal', 6.5, C.gray400)
    const cvkn = 'VKN: ' + customer.taxNumber.trim() + (customer.taxOffice?.trim() ? '  · ' + customer.taxOffice.trim() : '')
    tL(cvkn, COL3_X[1], yAli); yAli += 3.6
  }
  if (customer.email?.trim()) {
    setF('normal', 6.5, C.gray400)
    tL(customer.email.trim(), COL3_X[1], yAli); yAli += 3.6
  }
  if (customer.phone?.trim()) {
    setF('normal', 6.5, C.gray400)
    tL('Tel: ' + customer.phone.trim(), COL3_X[1], yAli); yAli += 3.6
  }

  // ── Belge bilgileri sütunu ────────────────────────────────────────────────
  const docRows = [
    { label: 'Belge No',          value: proformaNo },
    { label: 'Duzenleme Tarihi',   value: fmtDate(createdAt) },
    { label: 'Gecerlilik',         value: validityDays + ' gun' },
    { label: 'Son Gecerlilik',     value: addDays(createdAt, validityDays) },
  ]
  const BELGE_RX = COL3_X[2] + COL3_IW
  docRows.forEach(({ label, value }) => {
    setF('normal', 6.5, C.gray400)
    tL(label, COL3_X[2], yBelge)
    setF('bold', 7, C.gray600)
    tR(value, BELGE_RX, yBelge)
    yBelge += 5
  })

  curY = Math.max(ySat, yAli, yBelge) + 8

  // ══════════════════════════════════════════════════════════════════════════
  // 3. ÜRÜN TABLOSU — #1f2937 başlık, zebra satırlar, HTML ile aynı sütunlar
  // ══════════════════════════════════════════════════════════════════════════
  const TABLE_X  = LX
  const TABLE_W  = BODY_W

  // Sütun X konumları
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
    // #1f2937 charcoal başlık — HTML önizlemesiyle aynı
    fillR(TABLE_X, curY, TABLE_W, THEAD_H, C.charcoal)

    setF('bold', 6.5, C.whitemid)
    const ty = curY + THEAD_H / 2 + 2.5

    tL('URUN / HIZMET',        COL_X.NAME      + CP,               ty)
    tC('BIRIM',                COL_X.UNIT      + COL.UNIT / 2,     ty)
    tC('ADET',                 COL_X.QTY       + COL.QTY / 2,      ty)
    tR('BIRIM FIYAT (' + S + ')', COL_X.PRICE  + COL.PRICE - CP,   ty)
    tC('ISKONTO',              COL_X.DISC      + COL.DISC / 2,      ty)
    tR('NET TUTAR (' + S + ')', COL_X.DISCPRICE + COL.DISCPRICE - CP, ty)
    tC('KDV',                  COL_X.KDV       + COL.KDV / 2,      ty)
    tR('TOPLAM (' + S + ')',   COL_X.TOTAL     + COL.TOTAL - CP,   ty)

    curY += THEAD_H
  }

  ensureSpace(THEAD_H + ROW_H * 2)
  drawTableHeader()

  for (let i = 0; i < items.length; i++) {
    const it       = items[i]
    const line     = calculateLine(it as LineInput)
    const qty      = line.quantity
    const price    = line.price
    const disc     = line.discount_percent
    const lineSub  = line.line_subtotal
    const kdvPct   = line.kdv
    const rowTotal = line.line_total

    doc.setFontSize(8)
    const nLines    = doc.splitTextToSize(it.name?.trim() || '—', COL.NAME - CP * 2) as string[]
    const descLines = it.description?.trim()
      ? (doc.splitTextToSize(it.description.trim(), COL.NAME - CP * 2) as string[])
      : []
    const textRows  = nLines.length + descLines.length
    const rowH      = Math.max(ROW_H, textRows * 4.2 + CP * 2 + 1)

    if (curY + rowH > CONTENT_B) {
      doc.addPage()
      fillR(0, 0, PAGE.W, HDR_H, C.charcoal)
      // Başlıkta belge no tekrar
      setF('bold', 7, C.whitemid)
      tR(proformaNo, RX - 5, HDR_H / 2 + 3)
      curY = HDR_H + 4
      drawTableHeader()
    }

    // Zebra — gri/beyaz (HTML: #f9fafb / #ffffff)
    if (i % 2 === 1) fillR(TABLE_X, curY, TABLE_W, rowH, C.gray100)

    // Ürün adı
    setF('bold', 8, C.gray700)
    let ny = curY + CP + 3.5
    nLines.forEach(l => { tL(l, COL_X.NAME + CP, ny); ny += 4.2 })

    // Açıklama
    if (descLines.length > 0) {
      setF('normal', 6.5, C.gray500)
      descLines.forEach(l => { tL(l, COL_X.NAME + CP, ny); ny += 3.5 })
    }

    const midY = curY + rowH / 2 + 2.5

    setF('normal', 8, C.gray500)
    tC(it.unit || 'adet',           COL_X.UNIT  + COL.UNIT  / 2, midY)

    setF('normal', 8, C.gray700)
    tC(qty.toString(),              COL_X.QTY   + COL.QTY   / 2, midY)
    tR(money(price),                COL_X.PRICE + COL.PRICE  - CP, midY)

    setF('normal', 8, C.gray500)
    tC(disc > 0 ? '%' + disc : '—', COL_X.DISC  + COL.DISC   / 2, midY)

    setF('normal', 8, C.gray700)
    tR(money(lineSub),              COL_X.DISCPRICE + COL.DISCPRICE - CP, midY)

    setF('normal', 8, C.gray500)
    tC('%' + kdvPct,                COL_X.KDV + COL.KDV / 2, midY)

    // Satır toplamı — bold, koyu
    setF('bold', 8.5, C.gray700)
    tR(money(rowTotal, S),          COL_X.TOTAL + COL.TOTAL - CP, midY)

    // Alt çizgi (çok ince)
    hLine(curY + rowH, TABLE_X, TABLE_X + TABLE_W, C.gray200, 0.12)

    // Dikey ayırıcılar
    const colsV = [COL_X.UNIT, COL_X.QTY, COL_X.PRICE, COL_X.DISC, COL_X.DISCPRICE, COL_X.KDV, COL_X.TOTAL]
    colsV.forEach(cx => vLine(cx, curY, curY + rowH, C.gray200, 0.1))

    curY += rowH
  }

  curY += 8

  // ══════════════════════════════════════════════════════════════════════════
  // 4. TOPLAM BLOĞU — sağ hizalı, ~80mm genişlik
  //    Üst: kenarlıklı kutu (Ara Toplam, İskonto, KDV satırları)
  //    Alt: charcoal şerit (GENEL TOPLAM)
  // ══════════════════════════════════════════════════════════════════════════

  const TW  = 80
  const TXL = RX - TW

  const numTotLines = 1 + (totalDiscount > 0 ? 1 : 0) + kdvRates.length + 1
  const totBoxH = numTotLines * 6 + 8   // iç kutu yüksekliği
  const gtH = 14                         // genel toplam şerit yüksekliği
  ensureSpace(totBoxH + gtH + 40)

  const totStartY = curY

  // Üst kenarlıklı kutu (Ara Toplam + KDV satırları)
  strokeR(TXL, totStartY, TW, totBoxH, C.gray200, 0.25)

  let ty = totStartY + 6

  // Ara Toplam
  setF('normal', 8, C.gray500)
  tL('Ara Toplam', TXL + CP, ty)
  setF('bold', 8, C.gray700)
  tR(money(subtotal, S), RX - CP, ty)
  ty += 6

  // İskonto
  if (totalDiscount > 0) {
    setF('normal', 8, C.gray500)
    tL('Toplam Iskonto', TXL + CP, ty)
    setF('bold', 8, C.red500)
    tR('- ' + money(totalDiscount, S), RX - CP, ty)
    ty += 6
  }

  // KDV satırları
  kdvRates.forEach(rate => {
    setF('normal', 7.5, C.gray400)
    tL('KDV %' + rate, TXL + CP, ty)
    tR(money(kdvMap[rate], S), RX - CP, ty)
    ty += 6
  })

  // Toplam KDV — kalın çizgi üstünde
  hLine(ty - 2, TXL + CP, RX - CP, C.gray200, 0.2)
  setF('bold', 8, C.gray600)
  tL('Toplam KDV', TXL + CP, ty)
  tR(money(kdvTotal, S), RX - CP, ty)

  // Charcoal GENEL TOPLAM şeridi (HTML: bg-gray-900)
  const gtY = totStartY + totBoxH
  fillR(TXL, gtY, TW, gtH, C.charcoal)

  setF('bold', 7, C.whitemid)
  tL('GENEL TOPLAM', TXL + CP, gtY + 6)
  setF('normal', 6.5, C.whitedim)
  tL(currencyLabel(currency), TXL + CP, gtY + 11)

  setF('bold', 14, C.white)
  tR(money(grand, S), RX - CP, gtY + 10)

  curY = gtY + gtH + 8

  // ══════════════════════════════════════════════════════════════════════════
  // 5. ALT BÖLÜM — tek kenarlıklı kutu (HTML: rounded border box)
  //    a. Yalnız satırı (tutarın yazıyla ifadesi)
  //    b. Geçerlilik + Notlar
  //    c. Ödeme bilgileri (varsa)
  //    d. İmza alanı
  // ══════════════════════════════════════════════════════════════════════════

  // Kalan alanı hesapla
  const kur_line = (fxUsd > 0 || fxEur > 0)

  // Yalnız satırı
  const yalnizText = grand > 0 ? toWordsTR(grand, currency) : ''
  const yalnizFull = yalnizText
    ? 'Yalniz ' + grand.toLocaleString('tr-TR', { minimumFractionDigits: 2 }) + ' ' + currencyLabel(currency) + ' tutarindir.'
    : ''

  // Alt kutu içeriğini hesapla (yaklaşık yükseklik)
  const hasNotes = notes?.trim().length > 0
  const hasBanks = banks.length > 0
  const footerInnerH = 9 + 9 + (hasNotes ? 12 : 0) + (hasBanks ? banks.length * 7 + 8 : 0) + (preparer ? 30 : 28) + (kur_line ? 6 : 0)

  ensureSpace(footerInnerH + 4)

  const footerY = curY
  let fi = footerY   // cursor for inside footer

  // Yalnız satırı (gri arka plan)
  fillR(LX, fi, BODY_W, 9, C.gray50)
  hLine(fi + 9, LX, RX, C.gray200, 0.2)
  setF('normal', 7.5, C.gray500)
  tL(yalnizFull, LX + CP, fi + 6)
  fi += 9

  // Geçerlilik + Notlar
  const validLine = 'Bu fiyat teklifi ' + validityDays + ' gun gecerlidir. Son gecerlilik tarihi: ' + addDays(createdAt, validityDays)

  if (hasNotes) {
    // İki sütun: geçerlilik | notlar
    const halfW = BODY_W / 2 - 4
    setF('normal', 7, C.gray500)
    const vls = doc.splitTextToSize(validLine, halfW) as string[]
    const nls2 = doc.splitTextToSize('Not: ' + notes.trim(), halfW) as string[]
    const rowHeight = Math.max(vls.length, nls2.length) * 3.8 + 6

    fillR(LX, fi, BODY_W, rowHeight, C.white)
    let vy = fi + 5
    vls.forEach(l => { tL(l, LX + CP, vy); vy += 3.8 })

    setF('bold', 6.5, C.gray400)
    tL('Not:', LX + BODY_W / 2 + CP, fi + 5)
    setF('normal', 7, C.gray500)
    let ny2 = fi + 5 + 3.8
    nls2.slice(1).forEach(l => { tL(l, LX + BODY_W / 2 + CP, ny2); ny2 += 3.8 })
    hLine(fi + rowHeight, LX, RX, C.gray200, 0.2)
    fi += rowHeight
  } else {
    const rowH2 = 9
    fillR(LX, fi, BODY_W, rowH2, C.white)
    setF('normal', 7, C.gray500)
    tL(validLine, LX + CP, fi + 6)
    hLine(fi + rowH2, LX, RX, C.gray200, 0.2)
    fi += rowH2
  }

  // Kur notu (varsa)
  if (kur_line) {
    const fxParts: string[] = []
    if (fxUsd > 0) fxParts.push('1 USD = ' + fxUsd.toFixed(4) + ' TL')
    if (fxEur > 0) fxParts.push('1 EUR = ' + fxEur.toFixed(4) + ' TL')
    setF('normal', 6, C.gray400)
    tL('Referans Kur (' + fmtDate(createdAt) + '): ' + fxParts.join('   '), LX + CP, fi + 5)
    hLine(fi + 8, LX, RX, C.gray200, 0.2)
    fi += 8
  }

  // Ödeme bilgileri
  if (hasBanks) {
    fillR(LX, fi, BODY_W, banks.length * 7 + 9, C.white)
    setF('bold', 6, C.gray400)
    tL('ODEME BILGILERI', LX + CP, fi + 5)
    fi += 8
    banks.forEach(b => {
      setF('bold', 8, C.gray700)
      tL([b.bankName, b.branchName].filter(Boolean).join(' · '), LX + CP, fi)
      doc.setFont('courier', 'normal')
      doc.setFontSize(7.5)
      doc.setTextColor(C.gray600[0], C.gray600[1], C.gray600[2])
      tR('IBAN: ' + (b.iban || ''), RX - CP, fi)
      doc.setFont(FONT, 'normal')
      fi += 7
    })
    hLine(fi, LX, RX, C.gray200, 0.2)
  }

  // İmza alanı — Satıcı Onayı | Alıcı Onayı
  const sigH = preparer?.name?.trim() ? 30 : 28
  fillR(LX, fi, BODY_W, sigH, C.white)

  const SIG_W = BODY_W / 2 - 6
  const SIG_LX = LX + CP
  const SIG_RX = LX + BODY_W / 2 + CP

  setF('bold', 6, C.gray300)
  tL(preparer?.name?.trim() ? 'PROFORMAYI DUZENLEYEN' : 'SATICI ONAYI', SIG_LX, fi + 5)
  tL('ALICI ONAYI', SIG_RX, fi + 5)

  if (preparer?.name?.trim()) {
    setF('bold', 8.5, C.gray700)
    tL(preparer.name.trim(), SIG_LX, fi + 11)
    if (preparer.title?.trim()) {
      setF('normal', 7, C.gray500)
      tL(preparer.title.trim(), SIG_LX, fi + 16)
    }
    // İmza çizgisi
    hLine(fi + sigH - 7, SIG_LX, SIG_LX + SIG_W, C.gray200, 0.3)
    setF('normal', 6.5, C.gray400)
    tL(company.name?.trim() || '', SIG_LX, fi + sigH - 3)
  } else {
    hLine(fi + sigH - 7, SIG_LX, SIG_LX + SIG_W, C.gray200, 0.3)
    setF('normal', 6.5, C.gray400)
    tL(company.name?.trim() || '', SIG_LX, fi + sigH - 3)
  }

  hLine(fi + sigH - 7, SIG_RX, SIG_RX + SIG_W, C.gray200, 0.3)
  setF('normal', 6.5, C.gray400)
  tL(customer.name?.trim() || '', SIG_RX, fi + sigH - 3)

  fi += sigH

  // Tüm alt kutunun dışına kenarlık çiz
  strokeR(LX, footerY, BODY_W, fi - footerY, C.gray200, 0.25)

  curY = fi + 6

  // ══════════════════════════════════════════════════════════════════════════
  // 6. SAYFA ALTI — tüm sayfalar
  // ══════════════════════════════════════════════════════════════════════════
  const totalPages = doc.getNumberOfPages()
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p)
    const fy = PAGE.H - PAGE.MB + 3
    hLine(fy, LX, RX, C.gray200, 0.2)
    setF('normal', 6, C.gray400)
    tL(company.name?.trim() || '', LX, fy + 4)
    tC('Sayfa ' + p + ' / ' + totalPages, CX, fy + 4)
    tR(proformaNo + '  ·  ' + fmtDate(createdAt), RX, fy + 4)
  }

  doc.save(proformaNo + '.pdf')
}
