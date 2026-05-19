import { calculateLine, calculateTotals, type LineInput } from '@/lib/calc'

// ═══════════════════════════════════════════════════════════════════════════════
// Flowra PDF Engine v5 — Kurumsal Türk Ticari Proforma
//
// Tasarım ilkeleri:
//   • Üst tam-genişlik lacivert şerit — kurumsal antetli kağıt duygusu
//   • Şirket adı baskın (16pt bold) — belgede en önemli kimlik
//   • Koyu lacivert tablo başlığı (beyaz metin) — ERP değil, kurumsal evrak
//   • Ara toplam satırları arka plansız, sade hizalı
//   • GENEL TOPLAM: lacivert blok, tek görsel çapa
//   • YALNIZ: tam genişlik, çerçeveli, resmi
//   • İmza alanı: Proformayı Düzenleyen (ad, ünvan)
//   • Dil: %100 Türkçe
//
// Sayfa geometrisi — A4 dikey, 15mm kenar boşlukları:
//   LACIVERT ŞERİT (tam genişlik, 3mm)
//   ANTET: Logo + Şirket bloğu SOL | Belge kimliği SAĞ
//   ÇIZGI
//   ALICI bloğu (lacivert sol kenar, açık arkaplan)
//   ÇIZGI
//   ÜRÜN TABLOSU (koyu lacivert başlık)
//   TOPLAM bloğu (sağ hizalı)
//   YALNIZ (tam genişlik)
//   KUR notu (küçük, soluk)
//   NOTLAR
//   YASAL NOT + GEÇERLİLİK
//   ÖDEME BİLGİLERİ
//   PROFORMAYI DÜZENLEYEN + İMZA ALANLARI
//   SAYFA ALTI
//
// Güvenlik:
//   • Logo: 6sn timeout + hata yakalama — logo yüzünden PDF asla başarısız olmaz
//   • Tüm sayısal girdiler Number() ile korunuyor
//   • Boş / eksik verilerle çalışıyor
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
  name:  string   // Ad Soyad
  title: string   // Ünvan
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
const PAGE = { W: 210, H: 297, ML: 15, MR: 15, MT: 18, MB: 18 }
const BODY_W: number = PAGE.W - PAGE.ML - PAGE.MR   // 180 mm
const LX:     number = PAGE.ML
const RX:     number = PAGE.W - PAGE.MR             // 195 mm
const CX:     number = PAGE.W / 2

// Tablo sütun genişlikleri (mm)
// Sıra(8) + Ürün(46) + Birim(10) + Miktar(12) + BirimFiyat(24) + İsk(10) + NetTutar(22) + KDV(10) + Toplam(38) = 180
const COL = {
  SEQ:       8,
  NAME:      46,
  UNIT:      10,
  QTY:       12,
  PRICE:     24,
  DISC:      10,
  DISCPRICE: 22,
  KDV:       10,
  TOTAL:     38,
}
const TABLE_W: number = BODY_W
const TABLE_X: number = LX
const ROW_H:   number = 8
const THEAD_H: number = 9

// Hücre dolgusu
const CP: number = 2.5

// Logo için DPI → mm dönüşümü
const DPI: number        = 96 / 25.4
const LOGO_MAX_W: number = 38
const LOGO_MAX_H: number = 18

// Fontlar
const FONT_REG  = '/fonts/LiberationSans-Regular.ttf'
const FONT_BOLD = '/fonts/LiberationSans-Bold.ttf'

// ── Renk paleti — kurumsal, minimal ──────────────────────────────────────────
// Sadece lacivert + siyah + gri tonları. Hiç renk yok.
const C: Record<string, RGB> = {
  navy:     [20,  40,  90],     // ana lacivert — şerit, tablo başlığı, TOPLAM
  navyDeep: [14,  28,  66],     // koyu lacivert — GENEL TOPLAM
  black:    [16,  16,  22],     // yakın-siyah — şirket adı, vurgu
  ink:      [35,  35,  45],     // gövde metni
  dark:     [65,  65,  78],     // ikincil metin
  mid:      [115, 115, 128],    // etiketler, soluk
  muted:    [160, 160, 172],    // dipnotlar, sayfa altı
  border:   [185, 190, 200],    // orta kenarlıklar
  rule:     [210, 212, 218],    // ince çizgiler
  thead:    [218, 220, 228],    // (yedek — kullanılmıyor)
  rowAlt:   [247, 248, 250],    // çok hafif satır zebra
  custBg:   [244, 245, 249],    // alıcı bloğu arkaplan
  yalnizBg: [245, 246, 248],    // yalnız bloğu arkaplan
  sigLine:  [155, 158, 168],    // imza çizgisi
  white:    [255, 255, 255],
}

// ── Yardımcılar ───────────────────────────────────────────────────────────────

function sym(c: string): string {
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
    const d = new Date(iso)
    d.setDate(d.getDate() + days)
    return d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' })
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

// ── Logo yükleme ──────────────────────────────────────────────────────────────

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
  const timer = setTimeout(() => { controller.abort() }, 6000)
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
  } catch (err) {
    clearTimeout(timer)
    void err
    return null
  }
}

function logoDims(pxW: number, pxH: number): { w: number; h: number } {
  const mmW = pxW / DPI
  const mmH = pxH / DPI
  const scale = Math.min(LOGO_MAX_W / mmW, LOGO_MAX_H / mmH, 1)
  return { w: mmW * scale, h: mmH * scale }
}

// ── Font yükleme ──────────────────────────────────────────────────────────────

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

  // ── Çizim yardımcıları ────────────────────────────────────────────────────

  function setF(style: 'normal' | 'bold', size: number, col: RGB = C.ink) {
    doc.setFont(FONT, style)
    doc.setFontSize(size)
    doc.setTextColor(col[0], col[1], col[2])
  }

  function tL(t: string, x: number, y: number)  { doc.text(t, x, y) }
  function tR(t: string, x: number, y: number)  { doc.text(t, x, y, { align: 'right' }) }
  function tC(t: string, x: number, y: number)  { doc.text(t, x, y, { align: 'center' }) }

  function hLine(y: number, x1 = LX, x2 = RX, col: RGB = C.rule, lw = 0.25) {
    doc.setDrawColor(col[0], col[1], col[2])
    doc.setLineWidth(lw)
    doc.line(x1, y, x2, y)
  }

  function vLine(x: number, y1: number, y2: number, col: RGB = C.rule, lw = 0.15) {
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

  // ── Üst lacivert şerit (tam sayfa genişliği, bleed) ──────────────────────
  // Her sayfada tekrarlanır — addPage() öncesinde ayrıca çizilmez;
  // sayfa altı döngüsünde eklenir.
  const STRIP_H = 3.0
  fillR(0, 0, PAGE.W, STRIP_H, C.navy)

  let curY = PAGE.MT
  const CONTENT_B = PAGE.H - PAGE.MB

  function ensureSpace(needed: number) {
    if (curY + needed > CONTENT_B) {
      doc.addPage()
      // Yeni sayfada şerit çiz
      fillR(0, 0, PAGE.W, STRIP_H, C.navy)
      curY = PAGE.MT
    }
  }

  // ── Toplamları hesapla ────────────────────────────────────────────────────
  const totals   = calculateTotals(items as LineInput[])
  const subtotal = totals.subtotal
  const kdvTotal = totals.kdv_total
  const kdvMap   = totals.kdv_breakdown
  const grand    = totals.grand_total
  const kdvRates = Object.keys(kdvMap).filter(k => kdvMap[k] > 0).sort((a,b) => +a - +b)

  // ── Logo yükle ────────────────────────────────────────────────────────────
  let logo: LogoData | null = null
  if (company.logoUrl?.trim()) {
    try { logo = await loadLogo(company.logoUrl.trim()) } catch { logo = null }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // A. ANTET
  //    SOL:  Logo + Şirket adı + Şirket bilgileri
  //    SAĞ:  Belge kimliği (tip, no, tarih)
  // ══════════════════════════════════════════════════════════════════════════

  const HDR_LEFT_W  = 112
  const HDR_RIGHT_W = 60
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
      leftY += lh + 3
    } catch { /* logo başarısız — devam */ }
  }

  // Şirket adı — belgede en baskın unsur
  setF('bold', 15, C.black)
  const nameLines = doc.splitTextToSize(company.name?.trim() || '', HDR_LEFT_W) as string[]
  nameLines.forEach(l => { tL(l, LX, leftY); leftY += 6.5 })
  leftY += 1.5

  // Adres
  if (company.address?.trim()) {
    setF('normal', 7.5, C.dark)
    const aLines = doc.splitTextToSize(company.address.trim(), HDR_LEFT_W) as string[]
    aLines.forEach(l => { tL(l, LX, leftY); leftY += 3.8 })
    leftY += 1.5
  }

  // Vergi bilgisi — her parça ayrı satırda, temiz
  if (company.taxNumber?.trim() || company.taxOffice?.trim()) {
    setF('normal', 7, C.mid)
    const taxLine: string[] = []
    if (company.taxNumber?.trim()) taxLine.push('Vergi No: ' + company.taxNumber.trim())
    if (company.taxOffice?.trim()) taxLine.push('Vergi Dairesi: ' + company.taxOffice.trim())
    tL(taxLine.join('   '), LX, leftY); leftY += 3.8
  }

  if (company.mersisNo?.trim()) {
    setF('normal', 7, C.mid)
    tL('MERSIS: ' + company.mersisNo.trim(), LX, leftY); leftY += 3.8
  }

  // İletişim
  const contactParts = [company.phone?.trim(), company.email?.trim(), company.website?.trim()].filter(Boolean)
  if (contactParts.length > 0) {
    setF('normal', 7, C.mid)
    tL(contactParts.join('   '), LX, leftY); leftY += 3.8
  }

  // ── Sağ: Belge kimlik kutusu ──────────────────────────────────────────────
  // Dış çerçeve (lacivert kenarlık)
  const META_H = 38
  doc.setDrawColor(C.navy[0], C.navy[1], C.navy[2])
  doc.setLineWidth(0.4)
  doc.rect(HDR_RIGHT_X, rightY, HDR_RIGHT_W, META_H, 'S')

  // İç üst şerit — koyu lacivert, beyaz etiket
  fillR(HDR_RIGHT_X, rightY, HDR_RIGHT_W, 9, C.navy)
  setF('bold', 8, C.white)
  tC('PROFORMA FATURA', HDR_RIGHT_X + HDR_RIGHT_W / 2, rightY + 6)

  // Belge numarası — ortalı, büyük, koyu
  const numY = rightY + 18
  setF('bold', 14, C.black)
  tC(proformaNo, HDR_RIGHT_X + HDR_RIGHT_W / 2, numY)

  // İnce ayırıcı çizgi
  hLine(rightY + 21, HDR_RIGHT_X + 3, HDR_RIGHT_X + HDR_RIGHT_W - 3, C.rule, 0.3)

  // Tarih satırları
  const MP = 3
  const colR = HDR_RIGHT_X + HDR_RIGHT_W - MP
  const rowY1 = rightY + 26
  const rowY2 = rightY + 31.5

  setF('normal', 7, C.mid)
  tL('Tarih', HDR_RIGHT_X + MP, rowY1)
  setF('bold', 7, C.ink)
  tR(fmtDate(createdAt), colR, rowY1)

  setF('normal', 7, C.mid)
  tL('Gecerlilik', HDR_RIGHT_X + MP, rowY2)
  setF('bold', 7, C.ink)
  tR(addDays(createdAt, validityDays), colR, rowY2)

  // Para birimi — sağ hizalı, küçük, altında
  const rowY3 = rightY + 36
  setF('normal', 6.5, C.mid)
  tL('Para Birimi', HDR_RIGHT_X + MP, rowY3)
  setF('normal', 6.5, C.dark)
  tR(currencyLabel(currency), colR, rowY3)

  rightY += META_H + 4

  // ── Bölüm ayırıcısı ──────────────────────────────────────────────────────
  curY = Math.max(leftY, rightY) + 6
  hLine(curY, LX, RX, C.border, 0.5)
  curY += 7

  // ══════════════════════════════════════════════════════════════════════════
  // B. ALICI BLOĞU
  //    Sol kenar: 3mm lacivert çizgi (kurumsal ayırıcı)
  //    Açık gri arkaplan
  // ══════════════════════════════════════════════════════════════════════════

  const CUST_PAD_V = 4
  const CUST_PAD_H = 7
  const CUST_LABEL_H = 4.5
  const LEFT_ACCENT = 3  // sol kenar çizgi genişliği (mm)

  const custNameStr = customer.name?.trim() || '—'
  const custAddrLines = customer.address?.trim()
    ? (doc.splitTextToSize(customer.address.trim(), BODY_W * 0.75) as string[])
    : []
  const custTaxParts: string[] = []
  if (customer.taxNumber?.trim()) custTaxParts.push('Vergi No: ' + customer.taxNumber.trim())
  if (customer.taxOffice?.trim()) custTaxParts.push('Vergi Dairesi: ' + customer.taxOffice.trim())
  const custContact = [customer.phone?.trim(), customer.email?.trim()].filter(Boolean)

  const custBlockH = CUST_LABEL_H + CUST_PAD_V
    + 7.5
    + custAddrLines.length * 3.8
    + (custTaxParts.length ? 4 : 0)
    + (custContact.length ? 4 : 0)
    + CUST_PAD_V

  ensureSpace(custBlockH + 4)

  // Arkaplan
  fillR(LX, curY, BODY_W, custBlockH, C.custBg)
  // Sol lacivert kenar çizgisi
  fillR(LX, curY, LEFT_ACCENT, custBlockH, C.navy)
  // Alt ince çizgi
  hLine(curY + custBlockH, LX, RX, C.border, 0.3)

  let cy = curY + CUST_PAD_V

  // "ALICI" etiketi
  setF('bold', 6.5, C.navy)
  tL('ALICI', LX + CUST_PAD_H, cy)
  cy += CUST_LABEL_H

  // Müşteri adı — baskın
  setF('bold', 10.5, C.black)
  const cnLines = doc.splitTextToSize(custNameStr, BODY_W - CUST_PAD_H * 2) as string[]
  cnLines.forEach(l => { tL(l, LX + CUST_PAD_H, cy); cy += 5.5 })

  // Adres
  if (custAddrLines.length > 0) {
    setF('normal', 7.5, C.dark)
    custAddrLines.forEach(l => { tL(l, LX + CUST_PAD_H, cy); cy += 3.8 })
    cy += 0.5
  }

  // Vergi bilgisi
  if (custTaxParts.length > 0) {
    setF('normal', 7, C.mid)
    tL(custTaxParts.join('   '), LX + CUST_PAD_H, cy); cy += 4
  }

  // İletişim
  if (custContact.length > 0) {
    setF('normal', 7, C.mid)
    tL(custContact.join('   '), LX + CUST_PAD_H, cy)
  }

  curY += custBlockH + 9

  // ══════════════════════════════════════════════════════════════════════════
  // C. ÜRÜN TABLOSU
  //    Tablo başlığı: koyu lacivert arkaplan, beyaz metin
  //    Bu tek değişim bile ERP görünümünü kurumsal evraka dönüştürür
  // ══════════════════════════════════════════════════════════════════════════

  const COL_X: Record<string, number> = {
    SEQ:       TABLE_X,
    NAME:      TABLE_X + COL.SEQ,
    UNIT:      TABLE_X + COL.SEQ + COL.NAME,
    QTY:       TABLE_X + COL.SEQ + COL.NAME + COL.UNIT,
    PRICE:     TABLE_X + COL.SEQ + COL.NAME + COL.UNIT + COL.QTY,
    DISC:      TABLE_X + COL.SEQ + COL.NAME + COL.UNIT + COL.QTY + COL.PRICE,
    DISCPRICE: TABLE_X + COL.SEQ + COL.NAME + COL.UNIT + COL.QTY + COL.PRICE + COL.DISC,
    KDV:       TABLE_X + COL.SEQ + COL.NAME + COL.UNIT + COL.QTY + COL.PRICE + COL.DISC + COL.DISCPRICE,
    TOTAL:     TABLE_X + COL.SEQ + COL.NAME + COL.UNIT + COL.QTY + COL.PRICE + COL.DISC + COL.DISCPRICE + COL.KDV,
  }

  function drawTableHeader() {
    // Koyu lacivert arkaplan — kurumsal tablo kimliği
    fillR(TABLE_X, curY, TABLE_W, THEAD_H, C.navy)

    // Beyaz başlık metinleri — 6.5pt bold
    setF('bold', 6.5, C.white)
    const ty = curY + THEAD_H / 2 + 2.5

    tC('No',                              COL_X.SEQ       + COL.SEQ       / 2, ty)
    tL('URUN / HIZMET',                   COL_X.NAME      + CP + 1,            ty)
    tC('BIRIM',                           COL_X.UNIT      + COL.UNIT      / 2, ty)
    tC('MIKTAR',                          COL_X.QTY       + COL.QTY       / 2, ty)
    tR('BIRIM FIYAT',                     COL_X.PRICE     + COL.PRICE     - CP, ty)
    tC('ISK.%',                           COL_X.DISC      + COL.DISC      / 2, ty)
    tR('NET TUTAR',                       COL_X.DISCPRICE + COL.DISCPRICE - CP, ty)
    tC('KDV%',                            COL_X.KDV       + COL.KDV       / 2, ty)
    tR('SATIR TOPLAMI (' + S + ')',        COL_X.TOTAL     + COL.TOTAL     - CP, ty)

    // Çok ince beyaz dikey ayırıcılar başlıkta
    doc.setDrawColor(255, 255, 255)
    doc.setLineWidth(0.12)
    const cols = [COL_X.NAME, COL_X.UNIT, COL_X.QTY, COL_X.PRICE, COL_X.DISC, COL_X.DISCPRICE, COL_X.KDV, COL_X.TOTAL]
    cols.forEach(cx => doc.line(cx, curY, cx, curY + THEAD_H))

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
    const nLines   = doc.splitTextToSize(it.name?.trim() || '—', COL.NAME - CP * 2) as string[]
    const descLines = it.description?.trim()
      ? (doc.splitTextToSize(it.description.trim(), COL.NAME - CP * 2) as string[])
      : []
    const textRows  = nLines.length + descLines.length
    const rowH      = Math.max(ROW_H, textRows * 4.2 + CP * 2 + 1)

    if (curY + rowH > CONTENT_B) {
      doc.addPage()
      fillR(0, 0, PAGE.W, STRIP_H, C.navy)
      curY = PAGE.MT
      drawTableHeader()
    }

    // Zebra — çok hafif
    if (i % 2 === 1) fillR(TABLE_X, curY, TABLE_W, rowH, C.rowAlt)

    // Ürün adı (bold)
    setF('bold', 8, C.ink)
    let ny = curY + CP + 3.8
    nLines.forEach(l => { tL(l, COL_X.NAME + CP + 1, ny); ny += 4.2 })

    // Açıklama (normal, soluk)
    if (descLines.length > 0) {
      setF('normal', 6.5, C.mid)
      descLines.forEach(l => { tL(l, COL_X.NAME + CP + 1, ny); ny += 3.5 })
    }

    const midY = curY + rowH / 2 + 2.5

    setF('normal', 8, C.dark)
    tC(String(i + 1),                     COL_X.SEQ       + COL.SEQ       / 2, midY)

    setF('normal', 8, C.ink)
    tC(it.unit || 'adet',                 COL_X.UNIT      + COL.UNIT      / 2, midY)
    tC(qty.toString(),                    COL_X.QTY       + COL.QTY       / 2, midY)
    tR(money(price),                      COL_X.PRICE     + COL.PRICE     - CP, midY)
    tC(disc > 0 ? '%' + disc : '—',       COL_X.DISC      + COL.DISC      / 2, midY)
    tR(money(lineSub),                    COL_X.DISCPRICE + COL.DISCPRICE - CP, midY)
    tC('%' + kdvPct,                      COL_X.KDV       + COL.KDV       / 2, midY)

    // Satır toplamı — bold, baskın
    setF('bold', 8.5, C.black)
    tR(money(rowTotal, S),                COL_X.TOTAL + COL.TOTAL - CP, midY)

    // Yatay çizgi (çok ince)
    hLine(curY + rowH, TABLE_X, TABLE_X + TABLE_W, C.rule, 0.12)

    // Dikey ayırıcılar (çok ince, gri)
    const colsV = [COL_X.NAME, COL_X.UNIT, COL_X.QTY, COL_X.PRICE,
                   COL_X.DISC, COL_X.DISCPRICE, COL_X.KDV, COL_X.TOTAL]
    colsV.forEach(cx => vLine(cx, curY, curY + rowH, C.rule))

    curY += rowH
  }

  // Tablo kapanış çizgisi
  hLine(curY, TABLE_X, TABLE_X + TABLE_W, C.border, 0.5)
  curY += 12

  // ══════════════════════════════════════════════════════════════════════════
  // D. TOPLAM BLOĞU — sağ hizalı, sade yapı
  //    Subtotal satırları arkaplan yok — sadece GENEL TOPLAM lacivert blok
  // ══════════════════════════════════════════════════════════════════════════

  const TW:  number = 78
  const TXL: number = RX - TW

  const totLines = kdvRates.length + (totals.total_discount > 0 ? 3 : 2) + 1
  const totH = totLines * 5.5 + 18 + 4
  ensureSpace(totH + 35)

  // KDV dağılımı (küçük, soluk)
  if (kdvRates.length > 0) {
    setF('normal', 7, C.mid)
    for (const rate of kdvRates) {
      tL('KDV %' + rate + ' matrah:',  TXL, curY)
      tR(money(kdvMap[rate], S),        RX,  curY)
      curY += 4.5
    }
    hLine(curY, TXL, RX, C.rule, 0.2)
    curY += 3
  }

  // Ara Toplam
  setF('normal', 8.5, C.dark)
  tL('Ara Toplam:', TXL, curY)
  setF('bold', 8.5, C.ink)
  tR(money(subtotal, S), RX, curY)
  curY += 5.5

  // İskonto (varsa)
  if (totals.total_discount > 0) {
    setF('normal', 8, C.dark)
    tL('Toplam Iskonto:', TXL, curY)
    setF('bold', 8, C.ink)
    tR('- ' + money(totals.total_discount, S), RX, curY)
    curY += 5.5
  }

  // Toplam KDV
  setF('normal', 8.5, C.dark)
  tL('Toplam KDV:', TXL, curY)
  setF('bold', 8.5, C.ink)
  tR(money(kdvTotal, S), RX, curY)
  curY += 5.5

  // Ayırıcı (ince çizgi)
  hLine(curY, TXL, RX, C.border, 0.4)
  curY += 3

  // GENEL TOPLAM — lacivert blok, belgede tek dolgu vurgusu
  const GT_H: number = 14
  fillR(TXL - 2, curY, TW + 4, GT_H, C.navyDeep)

  setF('bold', 7.5, C.white)
  tL('GENEL TOPLAM', TXL + CP, curY + GT_H / 2 + 1.5)

  setF('bold', 14, C.white)
  tR(money(grand, S), RX - CP, curY + GT_H / 2 + 3.5)

  curY += GT_H + 9

  // ══════════════════════════════════════════════════════════════════════════
  // E. YALNIZ — tam genişlik, resmi çerçeveli blok
  //    Bankanın dekont kutusu gibi hissettirmeli
  // ══════════════════════════════════════════════════════════════════════════

  if (grand > 0) {
    const yText = toWordsTR(grand, currency)
    if (yText) {
      const yLines = doc.splitTextToSize(yText, BODY_W - 28) as string[]
      const yBoxH  = Math.max(12, yLines.length * 4.5 + 10)

      ensureSpace(yBoxH + 4)

      fillR(LX, curY, BODY_W, yBoxH, C.yalnizBg)
      strokeR(LX, curY, BODY_W, yBoxH, C.border, 0.3)

      // Sol ince lacivert çizgi — aynı dil ALICI bloğuyla
      fillR(LX, curY, 2, yBoxH, C.navy)

      // Etiket
      setF('bold', 6.5, C.navy)
      tL('YALNIZ', LX + 5, curY + 5)

      // İki nokta üst üste ve metin
      setF('normal', 8, C.ink)
      let yy = curY + 5
      yLines.forEach(l => { tL(l, LX + 24, yy); yy += 4.5 })

      curY += yBoxH + 8
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // F. KUR NOTU — küçük, soluk, tek satır
  // ══════════════════════════════════════════════════════════════════════════

  const fxParts: string[] = []
  if (fxUsd > 0) fxParts.push('1 USD = ' + fxUsd.toFixed(4) + ' TL')
  if (fxEur > 0) fxParts.push('1 EUR = ' + fxEur.toFixed(4) + ' TL')
  if (fxParts.length > 0) {
    ensureSpace(6)
    setF('normal', 6, C.muted)
    tL('Referans Kur (' + fmtDate(createdAt) + '): ' + fxParts.join('   '), LX, curY)
    curY += 5
  }

  // ══════════════════════════════════════════════════════════════════════════
  // G. NOTLAR
  // ══════════════════════════════════════════════════════════════════════════

  if (notes?.trim()) {
    ensureSpace(14)
    hLine(curY, LX, RX, C.rule, 0.2)
    curY += 5
    setF('bold', 7, C.dark)
    tL('Notlar:', LX, curY)
    curY += 4
    setF('normal', 7.5, C.dark)
    const nl = doc.splitTextToSize(notes.trim(), BODY_W) as string[]
    nl.forEach(l => { ensureSpace(4); tL(l, LX, curY); curY += 4 })
    curY += 3
  }

  // ══════════════════════════════════════════════════════════════════════════
  // H. YASAL NOT + GEÇERLİLİK
  // ══════════════════════════════════════════════════════════════════════════

  ensureSpace(14)
  hLine(curY, LX, RX, C.rule, 0.25)
  curY += 5

  setF('normal', 6.5, C.mid)
  tL('Bu proforma fatura bilgi amacli olup resmi vergi faturasi yerine gecmez.', LX, curY)
  setF('normal', 6.5, C.mid)
  tR('Son Gecerlilik: ' + addDays(createdAt, validityDays) + '  (' + validityDays + ' gun)', RX, curY)
  curY += 6

  // ══════════════════════════════════════════════════════════════════════════
  // I. ÖDEME BİLGİLERİ
  // ══════════════════════════════════════════════════════════════════════════

  if (banks.length > 0) {
    ensureSpace(22)
    hLine(curY, LX, RX, C.rule, 0.25)
    curY += 5

    setF('bold', 7, C.navy)
    tL('ODEME BILGILERI', LX, curY)
    curY += 5

    const BCOLS: number = banks.length >= 2 ? 2 : 1
    const GAP:   number = 8
    const BCW:   number = (BODY_W - (BCOLS - 1) * GAP) / BCOLS
    const BCX: number[] = Array.from({ length: BCOLS }, (_, i) => PAGE.ML + i * (BCW + GAP))

    for (let i = 0; i < banks.length;) {
      ensureSpace(16)
      const lb = banks[i]
      const rb = BCOLS === 2 && i + 1 < banks.length ? banks[i + 1] : null

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
      curY += 13
      i += rb ? 2 : 1
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // J. PROFORMAYI DÜZENLEYEN + İMZA ALANLARI
  //    Sol: Proformayı Düzenleyen (ad, ünvan, imza çizgisi + şirket)
  //    Sağ: Alıcı Onayı (imza çizgisi + müşteri adı)
  // ══════════════════════════════════════════════════════════════════════════

  ensureSpace(36)
  hLine(curY, LX, RX, C.rule, 0.25)
  curY += 8

  const SIG_W   = 75
  const SIG_LX  = LX
  const SIG_RX  = RX - SIG_W

  // Sol: Düzenleyen
  setF('bold', 6.5, C.navy)
  tL('PROFORMAYI DUZENLEYEN', SIG_LX, curY)

  if (preparer?.name?.trim()) {
    curY += 5
    setF('bold', 9, C.black)
    tL(preparer.name.trim(), SIG_LX, curY)
    if (preparer.title?.trim()) {
      curY += 4.5
      setF('normal', 7.5, C.dark)
      tL(preparer.title.trim(), SIG_LX, curY)
    }
    curY += 5
  } else {
    curY += 14  // Boş alan — imza için yer
  }

  // İmza çizgisi sol
  hLine(curY, SIG_LX, SIG_LX + SIG_W, C.sigLine, 0.35)
  curY += 4

  setF('normal', 6.5, C.mid)
  tL(company.name?.trim() || '', SIG_LX, curY)

  // Sağ: Alıcı onayı — simetrik
  const sigRightTopY = curY - 30   // Aynı üst hizaya dön

  setF('bold', 6.5, C.navy)
  tL('ALICI ONAYI', SIG_RX, sigRightTopY + 0)

  // Boş imza alanı
  hLine(sigRightTopY + 22, SIG_RX, SIG_RX + SIG_W, C.sigLine, 0.35)
  setF('normal', 6.5, C.mid)
  tL(customer.name?.trim() || '', SIG_RX, sigRightTopY + 26)

  curY += 8

  // ══════════════════════════════════════════════════════════════════════════
  // K. SAYFA ALTI (tüm sayfalar)
  // ══════════════════════════════════════════════════════════════════════════

  const totalPages = doc.getNumberOfPages()
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p)

    const fy: number = PAGE.H - PAGE.MB + 3
    hLine(fy, LX, RX, C.rule, 0.25)

    setF('normal', 6, C.muted)
    tL(company.name?.trim() || '', LX, fy + 4)
    tC('Sayfa ' + p + ' / ' + totalPages, CX, fy + 4)
    tR(proformaNo + '  ·  ' + fmtDate(createdAt), RX, fy + 4)
  }

  doc.save(proformaNo + '.pdf')
}
