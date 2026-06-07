// ─────────────────────────────────────────────────────────────────────────────
// lib/services/intelligence/financial-narrative.service.ts
//
// Financial Narrative Engine — generates deterministic, rule-based Turkish
// narrative summaries of financial performance.
// NO AI/LLM — pure template-based Turkish text generation.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'

// ── Types ─────────────────────────────────────────────────────────────────────

export type NarrativeContext = 'ceo_summary' | 'cfo_briefing' | 'monthly_report' | 'alert_context'

export interface NarrativeSection {
  section_id: string
  title: string        // Turkish section title
  narrative: string    // Turkish prose narrative
  highlights: string[] // bullet point highlights (Turkish)
  sentiment: 'positive' | 'neutral' | 'negative' | 'mixed'
  priority: 'critical' | 'high' | 'medium' | 'low'
}

export interface FinancialNarrative {
  generated_at: string       // ISO timestamp
  period: string             // YYYY-MM
  context: NarrativeContext
  headline: string           // Single-sentence Turkish headline
  executive_summary: string  // 2-3 sentence Turkish executive summary
  sections: NarrativeSection[]
  key_numbers: Array<{
    label: string
    value: string             // pre-formatted Turkish number/text
    change_description: string // Turkish: "geçen aya göre %X artış"
    is_positive: boolean
  }>
}

// ── Turkish Month Names ───────────────────────────────────────────────────────

const TURKISH_MONTHS: Record<number, string> = {
  1:  'Ocak',
  2:  'Şubat',
  3:  'Mart',
  4:  'Nisan',
  5:  'Mayıs',
  6:  'Haziran',
  7:  'Temmuz',
  8:  'Ağustos',
  9:  'Eylül',
  10: 'Ekim',
  11: 'Kasım',
  12: 'Aralık',
}

// ── Turkish Expense Category Names ───────────────────────────────────────────

const EXPENSE_CATEGORY_TR: Record<string, string> = {
  salary:     'personel giderleri',
  rent:       'kira giderleri',
  software:   'yazılım/abonelik giderleri',
  marketing:  'pazarlama giderleri',
  logistics:  'lojistik giderleri',
  general:    'genel yönetim giderleri',
  utilities:  'fatura/enerji giderleri',
  other:      'diğer giderler',
}

// ── Pure Helper Functions ─────────────────────────────────────────────────────

/** Get Turkish month name from YYYY-MM string. */
export function getTurkishMonthName(yearMonth: string): string {
  const parts = yearMonth.split('-')
  const month = parseInt(parts[1] ?? '0', 10)
  return TURKISH_MONTHS[month] ?? yearMonth
}

/** Format currency for narrative: ₺1.2M, ₺850K, ₺500 etc.
 *  ≥ 10M  → "₺XM" (0 decimal)
 *  ≥ 1M   → "₺X.XM" (1 decimal)
 *  ≥ 1K   → "₺XK" (rounded to nearest K)
 *  < 1K   → "₺X" (integer)
 */
export function formatNarrativeCurrency(amount: number): string {
  const abs = Math.abs(amount)
  const sign = amount < 0 ? '-' : ''
  if (abs >= 10_000_000) {
    return `${sign}₺${Math.round(abs / 1_000_000)}M`
  }
  if (abs >= 1_000_000) {
    return `${sign}₺${(abs / 1_000_000).toFixed(1)}M`
  }
  if (abs >= 1_000) {
    return `${sign}₺${Math.round(abs / 1_000)}K`
  }
  return `${sign}₺${Math.round(abs)}`
}

/** Compute MoM change description in Turkish.
 *  "geçen aya göre %12 artış", "geçen aya göre %5 düşüş", "değişmedi"
 */
export function describeMomChange(currentValue: number, priorValue: number): string {
  if (priorValue === 0) {
    if (currentValue === 0) return 'değişmedi'
    return 'geçen ay verisi yok'
  }
  const pct = ((currentValue - priorValue) / Math.abs(priorValue)) * 100
  const absPct = Math.abs(pct)
  if (absPct < 0.5) return 'değişmedi'
  if (pct > 0) return `geçen aya göre %${absPct.toFixed(1)} artış`
  return `geçen aya göre %${absPct.toFixed(1)} düşüş`
}

/** Compute YoY change description in Turkish.
 *  "geçen yıla göre %25 büyüme", "geçen yıla göre %10 gerileme"
 *  null → "yıl öncesi verisi yok"
 */
export function describeYoyChange(changePct: number | null): string {
  if (changePct === null) return 'yıl öncesi verisi yok'
  const abs = Math.abs(changePct)
  if (abs < 0.5) return 'yıllık bazda değişim yok'
  if (changePct > 0) return `geçen yıla göre %${abs.toFixed(1)} büyüme`
  return `geçen yıla göre %${abs.toFixed(1)} gerileme`
}

/** Classify financial period sentiment based on net income margin.
 *  positive: margin ≥ 10%
 *  mixed:    margin ≥ 0%
 *  negative: margin < 0%
 */
export function classifyPeriodSentiment(
  netIncome: number,
  revenue: number,
): NarrativeSection['sentiment'] {
  if (revenue <= 0) return 'neutral'
  const margin = (netIncome / revenue) * 100
  if (margin >= 10) return 'positive'
  if (margin >= 0)  return 'mixed'
  return 'negative'
}

/** Generate the single-sentence headline. */
export function generateHeadline(
  period: string,
  currentRevenue: number,
  priorRevenue: number,
  netMarginPct: number,
): string {
  const month = getTurkishMonthName(period)
  const revFormatted = formatNarrativeCurrency(currentRevenue)
  const momDesc = describeMomChange(currentRevenue, priorRevenue)
  const marginStr = `%${Math.abs(netMarginPct).toFixed(0)}`

  if (priorRevenue > 0) {
    const pct = ((currentRevenue - priorRevenue) / Math.abs(priorRevenue)) * 100
    if (Math.abs(pct) >= 0.5) {
      const direction = pct > 0 ? 'artarak' : 'düşerek'
      const marginLabel = netMarginPct >= 0 ? 'net kâr marjı' : 'net zarar marjı'
      return `${month}'da gelir ${momDesc.replace('geçen aya göre ', '')} ${direction} ${revFormatted}'ye ulaştı, ${marginLabel} ${marginStr} oldu.`
    }
  }
  const marginLabel = netMarginPct >= 0 ? 'net kâr marjı' : 'net zarar marjı'
  return `${month}'da gelir ${revFormatted} olarak gerçekleşti, ${marginLabel} ${marginStr} oldu.`
}

/** Generate executive summary (2-3 sentences). */
export function generateExecutiveSummary(
  period: string,
  currentRevenue: number,
  priorRevenue: number,
  netIncome: number,
  cashBalance: number | null,
  overdueAmount: number,
  runwayMonths: number | null,
): string {
  const month = getTurkishMonthName(period)
  const revFormatted  = formatNarrativeCurrency(currentRevenue)
  const momDesc       = describeMomChange(currentRevenue, priorRevenue)
  const netFormatted  = formatNarrativeCurrency(Math.abs(netIncome))
  const netLabel      = netIncome >= 0 ? 'net kâr' : 'net zarar'

  let summary = `${month} döneminde toplam gelir ${revFormatted} olarak gerçekleşti (${momDesc}); ${netLabel} ${netFormatted} oldu.`

  if (cashBalance !== null) {
    const cashFormatted = formatNarrativeCurrency(cashBalance)
    if (runwayMonths !== null) {
      summary += ` Nakit pozisyonu ${cashFormatted} seviyesinde, tahmini runway ${runwayMonths.toFixed(1)} ay.`
    } else {
      summary += ` Nakit pozisyonu ${cashFormatted} seviyesinde.`
    }
  } else if (runwayMonths !== null) {
    summary += ` Tahmini nakit yeterliliği ${runwayMonths.toFixed(1)} ay.`
  }

  if (overdueAmount > 0) {
    const overdueFormatted = formatNarrativeCurrency(overdueAmount)
    summary += ` Vadesi geçmiş alacak tutarı ${overdueFormatted} olup tahsilat sürecinin hızlandırılması önerilir.`
  }

  return summary
}

// ── Section Generators ────────────────────────────────────────────────────────

/** Generate Turkish revenue narrative section. */
export function generateRevenueNarrative(
  currentRevenue: number,
  priorRevenue: number,
  yoyChangePct: number | null,
  period: string,
  topCustomerName?: string,
): NarrativeSection {
  const month       = getTurkishMonthName(period)
  const revFmt      = formatNarrativeCurrency(currentRevenue)
  const momDesc     = describeMomChange(currentRevenue, priorRevenue)
  const yoyDesc     = describeYoyChange(yoyChangePct)
  const highlights: string[] = []

  let momPct = 0
  if (priorRevenue > 0) {
    momPct = ((currentRevenue - priorRevenue) / Math.abs(priorRevenue)) * 100
  }

  const sentiment: NarrativeSection['sentiment'] =
    momPct >= 5  ? 'positive' :
    momPct <= -5 ? 'negative' :
    'neutral'

  const priority: NarrativeSection['priority'] =
    momPct <= -20 ? 'critical' :
    momPct <= -5  ? 'high' :
    momPct >= 20  ? 'high' :
    'medium'

  let narrative = `${month} döneminde toplam gelir ${revFmt} olarak gerçekleşti.`
  if (priorRevenue > 0) {
    narrative += ` ${momDesc.charAt(0).toUpperCase() + momDesc.slice(1)} kaydedildi.`
  }
  if (yoyChangePct !== null) {
    narrative += ` Yıllık bazda ${yoyDesc}.`
  }

  highlights.push(`Dönem geliri: ${revFmt}`)
  highlights.push(`Aylık değişim: ${momDesc}`)
  highlights.push(`Yıllık değişim: ${yoyDesc}`)

  if (topCustomerName) {
    narrative += ` En yüksek ciroyu sağlayan müşteri: ${topCustomerName}.`
    highlights.push(`En yüksek ciro: ${topCustomerName}`)
  }

  return {
    section_id: 'revenue',
    title:      'Gelir Analizi',
    narrative,
    highlights,
    sentiment,
    priority,
  }
}

/** Generate Turkish expense narrative section. */
export function generateExpenseNarrative(
  totalExpenses: number,
  revenue: number,
  topCategory: string | null,
  topCategoryAmount: number,
  period: string,
): NarrativeSection {
  const month       = getTurkishMonthName(period)
  const expFmt      = formatNarrativeCurrency(totalExpenses)
  const highlights: string[] = []

  const expenseRatio = revenue > 0 ? (totalExpenses / revenue) * 100 : null
  const ratioStr     = expenseRatio !== null ? `%${expenseRatio.toFixed(1)}` : 'hesaplanamadı'

  const topCategoryTr = topCategory ? (EXPENSE_CATEGORY_TR[topCategory] ?? topCategory) : null
  const topCatFmt     = formatNarrativeCurrency(topCategoryAmount)

  const sentiment: NarrativeSection['sentiment'] =
    expenseRatio === null ? 'neutral' :
    expenseRatio >= 95   ? 'negative' :
    expenseRatio >= 80   ? 'mixed' :
    expenseRatio >= 60   ? 'neutral' :
    'positive'

  const priority: NarrativeSection['priority'] =
    expenseRatio !== null && expenseRatio >= 95 ? 'critical' :
    expenseRatio !== null && expenseRatio >= 80 ? 'high' :
    'medium'

  let narrative = `${month} döneminde toplam gider ${expFmt} olarak gerçekleşti.`
  if (expenseRatio !== null) {
    narrative += ` Gider/gelir oranı ${ratioStr} seviyesinde.`
  }
  if (topCategoryTr) {
    narrative += ` En yüksek gider kalemi ${topCategoryTr} olup ${topCatFmt} tutarında gerçekleşti.`
  }

  highlights.push(`Toplam gider: ${expFmt}`)
  if (expenseRatio !== null) {
    highlights.push(`Gider oranı: ${ratioStr}`)
  }
  if (topCategoryTr) {
    highlights.push(`En büyük gider kalemi: ${topCategoryTr} (${topCatFmt})`)
  }

  return {
    section_id: 'expenses',
    title:      'Gider Analizi',
    narrative,
    highlights,
    sentiment,
    priority,
  }
}

/** Generate Turkish cash flow narrative section. */
export function generateCashNarrative(
  cashBalance: number | null,
  runwayMonths: number | null,
  burnTrend: string | null,
  period: string,
): NarrativeSection {
  const month      = getTurkishMonthName(period)
  const highlights: string[] = []

  let sentiment: NarrativeSection['sentiment'] = 'neutral'
  let priority:  NarrativeSection['priority']  = 'medium'
  let narrative  = `${month} dönemi nakit pozisyonu analizi.`

  if (cashBalance !== null) {
    const cashFmt = formatNarrativeCurrency(cashBalance)
    narrative = `${month} döneminde nakit bakiyesi ${cashFmt} olarak tespit edildi.`
    highlights.push(`Nakit bakiyesi: ${cashFmt}`)
  }

  if (runwayMonths !== null) {
    const rwRounded = runwayMonths.toFixed(1)
    narrative += ` Mevcut harcama hızıyla tahmini nakit yeterliliği ${rwRounded} ay.`
    highlights.push(`Runway: ${rwRounded} ay`)

    if (runwayMonths < 3) {
      sentiment = 'negative'
      priority  = 'critical'
      narrative += ' Nakit seviyesi kritik — acil finansal planlama gerekmektedir.'
    } else if (runwayMonths <= 6) {
      sentiment = 'mixed'
      priority  = 'high'
      narrative += ' Büyüme harcamaları kontrol altında tutulmalıdır.'
    } else if (runwayMonths > 12) {
      sentiment = 'positive'
      priority  = 'low'
      narrative += ' Nakit pozisyonu sağlıklı düzeyde.'
    }
  }

  if (burnTrend === 'increasing') {
    narrative += ' Nakit yakımı son dönemde hız kazandı; gider yapısının gözden geçirilmesi önerilir.'
    highlights.push('Yakım hızı: artıyor')
    if (sentiment === 'neutral') sentiment = 'mixed'
    if (priority === 'low') priority = 'medium'
  } else if (burnTrend === 'decreasing') {
    narrative += ' Nakit yakımı yavaşlıyor; olumlu bir sinyal.'
    highlights.push('Yakım hızı: azalıyor')
    if (sentiment === 'neutral') sentiment = 'positive'
  } else if (burnTrend === 'stable') {
    highlights.push('Yakım hızı: sabit')
  }

  if (cashBalance === null && runwayMonths === null) {
    narrative = `${month} dönemine ait nakit pozisyonu verisi bulunamadı.`
    highlights.push('Nakit verisi mevcut değil')
    sentiment = 'neutral'
  }

  return {
    section_id: 'cash',
    title:      'Nakit Pozisyonu',
    narrative,
    highlights,
    sentiment,
    priority,
  }
}

/** Generate Turkish receivables narrative section. */
export function generateReceivablesNarrative(
  overdueAmount: number,
  overduePct: number | null,
  dsoDays: number | null,
  period: string,
): NarrativeSection {
  const month      = getTurkishMonthName(period)
  const ovFmt      = formatNarrativeCurrency(overdueAmount)
  const highlights: string[] = []

  let sentiment: NarrativeSection['sentiment'] = 'neutral'
  let priority:  NarrativeSection['priority']  = 'medium'

  let narrative = `${month} dönemi alacak yapısı analizi.`

  if (overduePct !== null) {
    const pctStr = `%${overduePct.toFixed(1)}`
    narrative = `${month} döneminde vadesi geçmiş alacaklar toplam alacakların ${pctStr}'ini oluşturuyor (${ovFmt}).`
    highlights.push(`Gecikmiş alacak oranı: ${pctStr}`)
    highlights.push(`Gecikmiş tutar: ${ovFmt}`)

    if (overduePct > 30) {
      sentiment = 'negative'
      priority  = 'high'
      narrative += ' Tahsilat süreci ivedilikle hızlandırılmalıdır.'
    } else if (overduePct > 15) {
      sentiment = 'mixed'
      priority  = 'medium'
      narrative += ' Tahsilat takibi güçlendirilmelidir.'
    } else if (overduePct <= 10 && overdueAmount > 0) {
      sentiment = 'positive'
      priority  = 'low'
      narrative += ' Alacak yapısı kontrol altında.'
    }
  } else if (overdueAmount > 0) {
    narrative = `${month} döneminde ${ovFmt} tutarında gecikmiş alacak bulunuyor.`
    highlights.push(`Gecikmiş tutar: ${ovFmt}`)
    sentiment = 'mixed'
  } else {
    narrative = `${month} döneminde vadesi geçmiş alacak bulunmuyor.`
    highlights.push('Gecikmiş alacak: yok')
    sentiment = 'positive'
    priority  = 'low'
  }

  if (dsoDays !== null) {
    const dsoRounded = Math.round(dsoDays)
    narrative += ` Ortalama tahsilat süresi (DSO) ${dsoRounded} gün.`
    highlights.push(`Tahsilat süresi (DSO): ${dsoRounded} gün`)
    if (dsoDays > 45) {
      if (sentiment === 'positive' || sentiment === 'neutral') sentiment = 'mixed'
      if (priority === 'low') priority = 'medium'
    }
  }

  return {
    section_id: 'receivables',
    title:      'Alacak Yönetimi',
    narrative,
    highlights,
    sentiment,
    priority,
  }
}

/** Generate Turkish partner narrative section. */
export function generatePartnerNarrative(
  highestRiskPartner: string | null,
  partnerCount: number,
  totalLoans: number,
  period: string,
): NarrativeSection {
  const month      = getTurkishMonthName(period)
  const loansFmt   = formatNarrativeCurrency(totalLoans)
  const highlights: string[] = []

  let sentiment: NarrativeSection['sentiment'] = 'neutral'
  let priority:  NarrativeSection['priority']  = 'medium'

  let narrative = `${month} döneminde ${partnerCount} aktif ortak bulunmaktadır.`
  highlights.push(`Ortak sayısı: ${partnerCount}`)

  if (totalLoans > 0) {
    narrative += ` Toplam ortak kredisi ${loansFmt} seviyesinde.`
    highlights.push(`Toplam ortak kredisi: ${loansFmt}`)
  }

  if (highestRiskPartner) {
    narrative += ` En yüksek riskli ortak ${highestRiskPartner} — yakın takip önerilir.`
    highlights.push(`Yüksek riskli ortak: ${highestRiskPartner}`)
    sentiment = 'mixed'
    priority  = 'high'
  } else if (partnerCount > 0) {
    sentiment = 'positive'
    priority  = 'low'
    narrative += ' Ortak risk profili dengeli görünüyor.'
  }

  return {
    section_id: 'partners',
    title:      'Ortak Analizi',
    narrative,
    highlights,
    sentiment,
    priority,
  }
}

// ── Full Narrative Builder ─────────────────────────────────────────────────────

/** Build full narrative from all inputs. */
export function buildFinancialNarrative(
  context: NarrativeContext,
  period: string,
  data: {
    current_revenue: number
    prior_revenue: number
    yoy_change_pct: number | null
    total_expenses: number
    net_income: number
    cash_balance: number | null
    runway_months: number | null
    burn_trend: string | null
    overdue_amount: number
    overdue_pct: number | null
    dso_days: number | null
    top_category: string | null
    top_category_amount: number
    partner_count: number
    highest_risk_partner: string | null
    total_partner_loans: number
    top_customer_name?: string
  },
): FinancialNarrative {
  const {
    current_revenue,
    prior_revenue,
    yoy_change_pct,
    total_expenses,
    net_income,
    cash_balance,
    runway_months,
    burn_trend,
    overdue_amount,
    overdue_pct,
    dso_days,
    top_category,
    top_category_amount,
    partner_count,
    highest_risk_partner,
    total_partner_loans,
    top_customer_name,
  } = data

  const netMarginPct = current_revenue > 0 ? (net_income / current_revenue) * 100 : 0

  const headline = generateHeadline(period, current_revenue, prior_revenue, netMarginPct)

  const executive_summary = generateExecutiveSummary(
    period,
    current_revenue,
    prior_revenue,
    net_income,
    cash_balance,
    overdue_amount,
    runway_months,
  )

  const sections: NarrativeSection[] = [
    generateRevenueNarrative(current_revenue, prior_revenue, yoy_change_pct, period, top_customer_name),
    generateExpenseNarrative(total_expenses, current_revenue, top_category, top_category_amount, period),
    generateCashNarrative(cash_balance, runway_months, burn_trend, period),
    generateReceivablesNarrative(overdue_amount, overdue_pct, dso_days, period),
    generatePartnerNarrative(highest_risk_partner, partner_count, total_partner_loans, period),
  ]

  const expenseRatio = current_revenue > 0 ? (total_expenses / current_revenue) * 100 : null

  const key_numbers = [
    {
      label:              'Gelir',
      value:              formatNarrativeCurrency(current_revenue),
      change_description: describeMomChange(current_revenue, prior_revenue),
      is_positive:        current_revenue >= prior_revenue,
    },
    {
      label:              'Gider',
      value:              formatNarrativeCurrency(total_expenses),
      change_description: expenseRatio !== null ? `gider oranı %${expenseRatio.toFixed(1)}` : 'oran hesaplanamadı',
      is_positive:        expenseRatio === null || expenseRatio < 80,
    },
    {
      label:              net_income >= 0 ? 'Net Kâr' : 'Net Zarar',
      value:              formatNarrativeCurrency(Math.abs(net_income)),
      change_description: `net marj %${Math.abs(netMarginPct).toFixed(1)}`,
      is_positive:        net_income >= 0,
    },
    {
      label:              'Nakit',
      value:              cash_balance !== null ? formatNarrativeCurrency(cash_balance) : 'Veri yok',
      change_description: runway_months !== null ? `${runway_months.toFixed(1)} ay runway` : 'runway bilinmiyor',
      is_positive:        runway_months === null || runway_months > 6,
    },
  ]

  return {
    generated_at: new Date().toISOString(),
    period,
    context,
    headline,
    executive_summary,
    sections,
    key_numbers,
  }
}

// ── Service Class ─────────────────────────────────────────────────────────────

export class FinancialNarrativeService {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(private readonly supabase: SupabaseClient<any>) {}

  async generateReport(
    companyId: string,
    context: NarrativeContext = 'ceo_summary',
  ): Promise<FinancialNarrative> {
    const now   = new Date()
    const year  = now.getFullYear()
    const month = now.getMonth() + 1
    const period = `${year}-${String(month).padStart(2, '0')}`

    // Build month windows
    const currFrom = `${year}-${String(month).padStart(2, '0')}-01`
    const currTo   = now.toISOString().slice(0, 10)

    const priorDate  = new Date(year, month - 2, 1)
    const priorYear  = priorDate.getFullYear()
    const priorMonth = priorDate.getMonth() + 1
    const priorFrom  = `${priorYear}-${String(priorMonth).padStart(2, '0')}-01`
    const priorLastDay = new Date(priorYear, priorMonth, 0).getDate()
    const priorTo    = `${priorYear}-${String(priorMonth).padStart(2, '0')}-${String(priorLastDay).padStart(2, '0')}`

    // Fetch 12 months back for YoY
    const yoyFrom  = new Date(year - 1, month - 1, 1).toISOString().slice(0, 10)
    const yoyTo    = new Date(year - 1, month, 0).toISOString().slice(0, 10)

    const [currSalesRes, priorSalesRes, yoySalesRes, currExpRes, cashRes, receivablesRes, partnersRes, loansRes] =
      await Promise.allSettled([
        this.supabase
          .from('sales')
          .select('total, customer_name')
          .eq('company_id', companyId)
          .is('deleted_at', null)
          .gte('sale_date', currFrom)
          .lte('sale_date', currTo),

        this.supabase
          .from('sales')
          .select('total')
          .eq('company_id', companyId)
          .is('deleted_at', null)
          .gte('sale_date', priorFrom)
          .lte('sale_date', priorTo),

        this.supabase
          .from('sales')
          .select('total')
          .eq('company_id', companyId)
          .is('deleted_at', null)
          .gte('sale_date', yoyFrom)
          .lte('sale_date', yoyTo),

        this.supabase
          .from('expenses')
          .select('amount_try, expense_type')
          .eq('company_id', companyId)
          .is('deleted_at', null)
          .gte('expense_date', currFrom)
          .lte('expense_date', currTo),

        this.supabase
          .from('balance_sheet_snapshots')
          .select('cash_and_equivalents_try')
          .eq('company_id', companyId)
          .order('snapshot_date', { ascending: false })
          .limit(1),

        this.supabase
          .from('sales')
          .select('total, paid_amount, due_date, sale_date')
          .eq('company_id', companyId)
          .is('deleted_at', null)
          .neq('payment_status', 'paid'),

        this.supabase
          .from('partners')
          .select('id, name')
          .eq('company_id', companyId)
          .is('deleted_at', null),

        this.supabase
          .from('partner_loan_tranches')
          // outstanding_try computed (no such column): principal_try − total_repaid_try
          .select('partner_id, principal_try, total_repaid_try')
          .eq('company_id', companyId)
          .eq('status', 'active'),
      ])

    // Current revenue
    const currRows = currSalesRes.status === 'fulfilled' ? (currSalesRes.value?.data ?? []) : []
    const current_revenue = currRows.reduce((s: number, r: { total: number }) => s + Number(r.total ?? 0), 0)

    // Top customer
    const customerMap = new Map<string, number>()
    for (const r of currRows as Array<{ total: number; customer_name?: string | null }>) {
      if (r.customer_name) {
        customerMap.set(r.customer_name, (customerMap.get(r.customer_name) ?? 0) + Number(r.total ?? 0))
      }
    }
    let top_customer_name: string | undefined
    let topCustAmt = 0
    for (const [name, amt] of customerMap.entries()) {
      if (amt > topCustAmt) { topCustAmt = amt; top_customer_name = name }
    }

    // Prior revenue
    const priorRows    = priorSalesRes.status === 'fulfilled' ? (priorSalesRes.value?.data ?? []) : []
    const prior_revenue = priorRows.reduce((s: number, r: { total: number }) => s + Number(r.total ?? 0), 0)

    // YoY
    const yoyRows  = yoySalesRes.status === 'fulfilled' ? (yoySalesRes.value?.data ?? []) : []
    const yoyTotal = yoyRows.reduce((s: number, r: { total: number }) => s + Number(r.total ?? 0), 0)
    const yoy_change_pct = yoyTotal > 0 ? ((current_revenue - yoyTotal) / yoyTotal) * 100 : null

    // Expenses
    const expRows = currExpRes.status === 'fulfilled' ? (currExpRes.value?.data ?? []) : []
    const total_expenses = expRows.reduce((s: number, r: { amount_try: number }) => s + Number(r.amount_try ?? 0), 0)

    const catMap = new Map<string, number>()
    for (const r of expRows as Array<{ amount_try: number; expense_type: string | null }>) {
      const cat = r.expense_type ?? 'other'
      catMap.set(cat, (catMap.get(cat) ?? 0) + Number(r.amount_try ?? 0))
    }
    let top_category: string | null = null
    let top_category_amount = 0
    for (const [cat, amt] of catMap.entries()) {
      if (amt > top_category_amount) { top_category_amount = amt; top_category = cat }
    }

    // Cash
    const cashRow     = cashRes.status === 'fulfilled' ? cashRes.value?.data?.[0] : null
    const cash_balance: number | null = cashRow?.cash_and_equivalents_try ?? null

    // Simple burn: avg monthly expenses as proxy
    const avg_monthly_expenses = total_expenses  // single month
    const runway_months: number | null = (cash_balance !== null && cash_balance > 0 && avg_monthly_expenses > 0)
      ? Math.round((cash_balance / avg_monthly_expenses) * 10) / 10
      : null

    // Receivables
    const today = now.toISOString().slice(0, 10)
    const recRows = receivablesRes.status === 'fulfilled' ? (receivablesRes.value?.data ?? []) : []
    const totalReceivables = recRows.reduce((s: number, r: { total: number; paid_amount: number | null }) =>
      s + Math.max(0, Number(r.total ?? 0) - Number(r.paid_amount ?? 0)), 0)
    const overdueRows = recRows.filter((r: { due_date: string | null; sale_date: string }) => {
      const due = r.due_date ?? r.sale_date
      return due < today
    })
    const overdue_amount = overdueRows.reduce((s: number, r: { total: number; paid_amount: number | null }) =>
      s + Math.max(0, Number(r.total ?? 0) - Number(r.paid_amount ?? 0)), 0)
    const overdue_pct: number | null = totalReceivables > 0 ? (overdue_amount / totalReceivables) * 100 : null

    const totalAgeDays = recRows.reduce((s: number, r: { sale_date: string }) =>
      s + Math.max(0, (Date.now() - new Date(r.sale_date).getTime()) / 86_400_000), 0)
    const dso_days: number | null = recRows.length > 0 ? totalAgeDays / recRows.length : null

    // Partners
    const partnerRows  = partnersRes.status === 'fulfilled' ? (partnersRes.value?.data ?? []) : []
    const partner_count = partnerRows.length
    const loanRows     = (loansRes.status === 'fulfilled' ? (loansRes.value?.data ?? []) : [])
      .map((r: { partner_id: string; principal_try: number; total_repaid_try: number }) => ({ partner_id: r.partner_id, outstanding_try: Math.max(0, Number(r.principal_try ?? 0) - Number(r.total_repaid_try ?? 0)) }))
    const total_partner_loans = loanRows.reduce((s: number, r: { outstanding_try: number }) => s + Number(r.outstanding_try ?? 0), 0)

    // Find highest risk partner (by loan concentration)
    const loanByPartner = new Map<string, number>()
    for (const r of loanRows as Array<{ partner_id: string; outstanding_try: number }>) {
      loanByPartner.set(r.partner_id, (loanByPartner.get(r.partner_id) ?? 0) + Number(r.outstanding_try ?? 0))
    }
    let highest_risk_partner: string | null = null
    let maxLoan = 0
    for (const p of partnerRows as Array<{ id: string; name: string }>) {
      const loan = loanByPartner.get(p.id) ?? 0
      if (loan > maxLoan && total_partner_loans > 0 && (loan / total_partner_loans) > 0.6) {
        maxLoan = loan; highest_risk_partner = p.name
      }
    }

    const net_income = current_revenue - total_expenses

    return buildFinancialNarrative(context, period, {
      current_revenue,
      prior_revenue,
      yoy_change_pct,
      total_expenses,
      net_income,
      cash_balance,
      runway_months,
      burn_trend: null,
      overdue_amount,
      overdue_pct,
      dso_days,
      top_category,
      top_category_amount,
      partner_count,
      highest_risk_partner,
      total_partner_loans,
      top_customer_name,
    })
  }
}
