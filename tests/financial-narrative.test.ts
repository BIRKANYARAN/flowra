/**
 * Financial Narrative Engine — unit tests
 *
 * Tests all pure functions.
 * No DB or network calls.
 * At least 70 test cases.
 */

import { describe, it, expect } from 'vitest'
import {
  getTurkishMonthName,
  formatNarrativeCurrency,
  describeMomChange,
  describeYoyChange,
  classifyPeriodSentiment,
  generateHeadline,
  generateExecutiveSummary,
  generateRevenueNarrative,
  generateExpenseNarrative,
  generateCashNarrative,
  generateReceivablesNarrative,
  generatePartnerNarrative,
  buildFinancialNarrative,
} from '../lib/services/intelligence/financial-narrative.service'

// ── getTurkishMonthName ───────────────────────────────────────────────────────

describe('getTurkishMonthName', () => {
  it('returns Ocak for January', () => {
    expect(getTurkishMonthName('2025-01')).toBe('Ocak')
  })
  it('returns Şubat for February', () => {
    expect(getTurkishMonthName('2025-02')).toBe('Şubat')
  })
  it('returns Mart for March', () => {
    expect(getTurkishMonthName('2025-03')).toBe('Mart')
  })
  it('returns Nisan for April', () => {
    expect(getTurkishMonthName('2025-04')).toBe('Nisan')
  })
  it('returns Mayıs for May', () => {
    expect(getTurkishMonthName('2025-05')).toBe('Mayıs')
  })
  it('returns Haziran for June', () => {
    expect(getTurkishMonthName('2025-06')).toBe('Haziran')
  })
  it('returns Temmuz for July', () => {
    expect(getTurkishMonthName('2025-07')).toBe('Temmuz')
  })
  it('returns Ağustos for August', () => {
    expect(getTurkishMonthName('2025-08')).toBe('Ağustos')
  })
  it('returns Eylül for September', () => {
    expect(getTurkishMonthName('2025-09')).toBe('Eylül')
  })
  it('returns Ekim for October', () => {
    expect(getTurkishMonthName('2025-10')).toBe('Ekim')
  })
  it('returns Kasım for November', () => {
    expect(getTurkishMonthName('2025-11')).toBe('Kasım')
  })
  it('returns Aralık for December', () => {
    expect(getTurkishMonthName('2025-12')).toBe('Aralık')
  })
  it('works with different year', () => {
    expect(getTurkishMonthName('2024-06')).toBe('Haziran')
  })
})

// ── formatNarrativeCurrency ───────────────────────────────────────────────────

describe('formatNarrativeCurrency', () => {
  it('formats 1_200_000 as ₺1.2M', () => {
    expect(formatNarrativeCurrency(1_200_000)).toBe('₺1.2M')
  })
  it('formats 850_000 as ₺850K', () => {
    expect(formatNarrativeCurrency(850_000)).toBe('₺850K')
  })
  it('formats 500 as ₺500', () => {
    expect(formatNarrativeCurrency(500)).toBe('₺500')
  })
  it('formats 10_000_000 as ₺10M (no decimal)', () => {
    expect(formatNarrativeCurrency(10_000_000)).toBe('₺10M')
  })
  it('formats 25_000_000 as ₺25M', () => {
    expect(formatNarrativeCurrency(25_000_000)).toBe('₺25M')
  })
  it('formats 5_600_000 as ₺5.6M', () => {
    expect(formatNarrativeCurrency(5_600_000)).toBe('₺5.6M')
  })
  it('formats 1_000 as ₺1K', () => {
    expect(formatNarrativeCurrency(1_000)).toBe('₺1K')
  })
  it('formats 999 as ₺999', () => {
    expect(formatNarrativeCurrency(999)).toBe('₺999')
  })
  it('formats 0 as ₺0', () => {
    expect(formatNarrativeCurrency(0)).toBe('₺0')
  })
  it('handles negative amounts', () => {
    const result = formatNarrativeCurrency(-500_000)
    expect(result).toContain('500K')
    expect(result).toContain('-')
  })
  it('formats 1_500 as ₺2K (rounded)', () => {
    // 1500/1000 = 1.5 rounds to 2
    expect(formatNarrativeCurrency(1_500)).toBe('₺2K')
  })
})

// ── describeMomChange ─────────────────────────────────────────────────────────

describe('describeMomChange', () => {
  it('describes growth correctly', () => {
    const result = describeMomChange(1_120_000, 1_000_000)
    expect(result).toContain('artış')
    expect(result).toContain('12.0')
  })
  it('describes decline correctly', () => {
    const result = describeMomChange(950_000, 1_000_000)
    expect(result).toContain('düşüş')
    expect(result).toContain('5.0')
  })
  it('returns değişmedi when within 0.5%', () => {
    // 0.3% change
    expect(describeMomChange(1_003, 1_000)).toBe('değişmedi')
  })
  it('returns değişmedi for exact same value', () => {
    expect(describeMomChange(1_000, 1_000)).toBe('değişmedi')
  })
  it('handles zero prior month', () => {
    const result = describeMomChange(0, 0)
    expect(result).toBe('değişmedi')
  })
  it('handles nonzero current when prior is zero', () => {
    const result = describeMomChange(50_000, 0)
    expect(result).toBe('geçen ay verisi yok')
  })
  it('describes large growth', () => {
    const result = describeMomChange(2_000_000, 1_000_000)
    expect(result).toContain('100.0')
    expect(result).toContain('artış')
  })
  it('includes "geçen aya göre" phrase for growth', () => {
    const result = describeMomChange(110_000, 100_000)
    expect(result).toContain('geçen aya göre')
  })
  it('includes "geçen aya göre" phrase for decline', () => {
    const result = describeMomChange(90_000, 100_000)
    expect(result).toContain('geçen aya göre')
  })
})

// ── describeYoyChange ─────────────────────────────────────────────────────────

describe('describeYoyChange', () => {
  it('returns yıl öncesi verisi yok for null', () => {
    expect(describeYoyChange(null)).toBe('yıl öncesi verisi yok')
  })
  it('describes YoY growth', () => {
    const result = describeYoyChange(25)
    expect(result).toContain('büyüme')
    expect(result).toContain('25.0')
    expect(result).toContain('geçen yıla göre')
  })
  it('describes YoY decline', () => {
    const result = describeYoyChange(-10)
    expect(result).toContain('gerileme')
    expect(result).toContain('10.0')
  })
  it('handles near-zero YoY change', () => {
    const result = describeYoyChange(0.3)
    expect(result).toContain('değişim yok')
  })
  it('handles large growth', () => {
    const result = describeYoyChange(100)
    expect(result).toContain('büyüme')
    expect(result).toContain('100.0')
  })
})

// ── classifyPeriodSentiment ───────────────────────────────────────────────────

describe('classifyPeriodSentiment', () => {
  it('returns positive when margin >= 10%', () => {
    expect(classifyPeriodSentiment(15_000, 100_000)).toBe('positive')
  })
  it('returns positive at exactly 10% margin', () => {
    expect(classifyPeriodSentiment(10_000, 100_000)).toBe('positive')
  })
  it('returns mixed when margin >= 0% and < 10%', () => {
    expect(classifyPeriodSentiment(5_000, 100_000)).toBe('mixed')
  })
  it('returns mixed at exactly 0% margin', () => {
    expect(classifyPeriodSentiment(0, 100_000)).toBe('mixed')
  })
  it('returns negative when margin < 0%', () => {
    expect(classifyPeriodSentiment(-5_000, 100_000)).toBe('negative')
  })
  it('returns neutral when revenue is zero', () => {
    expect(classifyPeriodSentiment(0, 0)).toBe('neutral')
  })
  it('returns negative for large loss', () => {
    expect(classifyPeriodSentiment(-100_000, 200_000)).toBe('negative')
  })
})

// ── generateHeadline ──────────────────────────────────────────────────────────

describe('generateHeadline', () => {
  it('returns non-empty string', () => {
    const h = generateHeadline('2025-11', 850_000, 750_000, 8)
    expect(typeof h).toBe('string')
    expect(h.length).toBeGreaterThan(10)
  })
  it('contains Turkish month name', () => {
    const h = generateHeadline('2025-11', 850_000, 750_000, 8)
    expect(h).toContain('Kasım')
  })
  it('contains formatted revenue', () => {
    const h = generateHeadline('2025-11', 850_000, 750_000, 8)
    expect(h).toContain('850K')
  })
  it('contains kâr for positive margin', () => {
    const h = generateHeadline('2025-10', 1_000_000, 900_000, 15)
    expect(h).toContain('kâr')
  })
  it('contains zarar for negative margin', () => {
    const h = generateHeadline('2025-10', 800_000, 1_000_000, -5)
    expect(h).toContain('zarar')
  })
  it('works when prior revenue is zero', () => {
    const h = generateHeadline('2025-01', 500_000, 0, 12)
    expect(typeof h).toBe('string')
    expect(h.length).toBeGreaterThan(0)
  })
  it('mentions Ekim for period 2025-10', () => {
    const h = generateHeadline('2025-10', 1_000_000, 800_000, 10)
    expect(h).toContain('Ekim')
  })
})

// ── generateExecutiveSummary ──────────────────────────────────────────────────

describe('generateExecutiveSummary', () => {
  it('returns non-empty string', () => {
    const s = generateExecutiveSummary('2025-11', 850_000, 750_000, 80_000, 200_000, 30_000, 8)
    expect(typeof s).toBe('string')
    expect(s.length).toBeGreaterThan(20)
  })
  it('contains period month name', () => {
    const s = generateExecutiveSummary('2025-11', 850_000, 750_000, 80_000, 200_000, 0, null)
    expect(s).toContain('Kasım')
  })
  it('mentions cash balance when provided', () => {
    const s = generateExecutiveSummary('2025-06', 1_000_000, 900_000, 100_000, 500_000, 0, 6)
    expect(s).toContain('500K')
  })
  it('mentions runway when provided', () => {
    const s = generateExecutiveSummary('2025-06', 1_000_000, 900_000, 100_000, 500_000, 0, 6)
    expect(s).toContain('6.0')
  })
  it('mentions overdue amount when > 0', () => {
    const s = generateExecutiveSummary('2025-06', 1_000_000, 900_000, 100_000, null, 150_000, null)
    expect(s).toContain('150K')
  })
  it('handles null cash balance', () => {
    const s = generateExecutiveSummary('2025-06', 1_000_000, 900_000, 100_000, null, 0, null)
    expect(typeof s).toBe('string')
    expect(s.length).toBeGreaterThan(10)
  })
  it('uses net zarar for negative net income', () => {
    const s = generateExecutiveSummary('2025-03', 500_000, 600_000, -50_000, null, 0, null)
    expect(s).toContain('zarar')
  })
  it('uses net kâr for positive net income', () => {
    const s = generateExecutiveSummary('2025-03', 600_000, 500_000, 60_000, null, 0, null)
    expect(s).toContain('kâr')
  })
})

// ── generateRevenueNarrative ──────────────────────────────────────────────────

describe('generateRevenueNarrative', () => {
  it('returns section with section_id revenue', () => {
    const s = generateRevenueNarrative(850_000, 750_000, 12, '2025-11')
    expect(s.section_id).toBe('revenue')
  })
  it('sentiment is positive when revenue growing > 5%', () => {
    const s = generateRevenueNarrative(1_100_000, 1_000_000, 10, '2025-11')
    expect(s.sentiment).toBe('positive')
  })
  it('sentiment is negative when revenue declining > 5%', () => {
    const s = generateRevenueNarrative(900_000, 1_000_000, -10, '2025-11')
    expect(s.sentiment).toBe('negative')
  })
  it('sentiment is neutral when change < 5%', () => {
    const s = generateRevenueNarrative(1_030_000, 1_000_000, 3, '2025-11')
    expect(s.sentiment).toBe('neutral')
  })
  it('highlights array is non-empty', () => {
    const s = generateRevenueNarrative(850_000, 750_000, 12, '2025-11')
    expect(s.highlights.length).toBeGreaterThan(0)
  })
  it('highlights contain formatted revenue', () => {
    const s = generateRevenueNarrative(850_000, 750_000, 12, '2025-11')
    const joined = s.highlights.join(' ')
    expect(joined).toContain('850K')
  })
  it('narrative contains month name', () => {
    const s = generateRevenueNarrative(850_000, 750_000, 12, '2025-11')
    expect(s.narrative).toContain('Kasım')
  })
  it('includes top customer name in narrative when provided', () => {
    const s = generateRevenueNarrative(850_000, 750_000, 12, '2025-11', 'Acme Ltd')
    expect(s.narrative).toContain('Acme Ltd')
    expect(s.highlights.join(' ')).toContain('Acme Ltd')
  })
  it('priority is critical for large decline', () => {
    const s = generateRevenueNarrative(600_000, 1_000_000, -40, '2025-10')
    expect(s.priority).toBe('critical')
  })
  it('priority is high for significant growth', () => {
    const s = generateRevenueNarrative(1_300_000, 1_000_000, 30, '2025-10')
    expect(s.priority).toBe('high')
  })
  it('has a title', () => {
    const s = generateRevenueNarrative(850_000, 750_000, 12, '2025-11')
    expect(s.title.length).toBeGreaterThan(0)
  })
})

// ── generateExpenseNarrative ──────────────────────────────────────────────────

describe('generateExpenseNarrative', () => {
  it('returns section with section_id expenses', () => {
    const s = generateExpenseNarrative(500_000, 800_000, 'salary', 300_000, '2025-11')
    expect(s.section_id).toBe('expenses')
  })
  it('mentions Turkish category name for salary', () => {
    const s = generateExpenseNarrative(500_000, 800_000, 'salary', 300_000, '2025-11')
    expect(s.narrative).toContain('personel giderleri')
  })
  it('mentions Turkish category name for rent', () => {
    const s = generateExpenseNarrative(400_000, 700_000, 'rent', 200_000, '2025-06')
    expect(s.narrative).toContain('kira giderleri')
  })
  it('mentions Turkish category name for marketing', () => {
    const s = generateExpenseNarrative(400_000, 700_000, 'marketing', 200_000, '2025-06')
    expect(s.narrative).toContain('pazarlama giderleri')
  })
  it('mentions Turkish category name for software', () => {
    const s = generateExpenseNarrative(400_000, 700_000, 'software', 200_000, '2025-06')
    expect(s.narrative).toContain('yazılım/abonelik giderleri')
  })
  it('mentions expense ratio in highlights', () => {
    const s = generateExpenseNarrative(800_000, 1_000_000, 'salary', 600_000, '2025-11')
    const joined = s.highlights.join(' ')
    expect(joined).toContain('80.0')
  })
  it('sentiment is negative when ratio >= 95%', () => {
    const s = generateExpenseNarrative(950_000, 1_000_000, null, 0, '2025-11')
    expect(s.sentiment).toBe('negative')
  })
  it('priority is critical when ratio >= 95%', () => {
    const s = generateExpenseNarrative(950_000, 1_000_000, null, 0, '2025-11')
    expect(s.priority).toBe('critical')
  })
  it('sentiment is positive when ratio < 60%', () => {
    const s = generateExpenseNarrative(500_000, 1_000_000, 'salary', 300_000, '2025-11')
    expect(s.sentiment).toBe('positive')
  })
  it('narrative contains month name', () => {
    const s = generateExpenseNarrative(500_000, 800_000, 'salary', 300_000, '2025-11')
    expect(s.narrative).toContain('Kasım')
  })
  it('handles null top category', () => {
    const s = generateExpenseNarrative(500_000, 800_000, null, 0, '2025-11')
    expect(typeof s.narrative).toBe('string')
    expect(s.narrative.length).toBeGreaterThan(0)
  })
})

// ── generateCashNarrative ─────────────────────────────────────────────────────

describe('generateCashNarrative', () => {
  it('returns section with section_id cash', () => {
    const s = generateCashNarrative(500_000, 8, 'stable', '2025-11')
    expect(s.section_id).toBe('cash')
  })
  it('is critical when runway < 3 months', () => {
    const s = generateCashNarrative(100_000, 2, null, '2025-11')
    expect(s.priority).toBe('critical')
    expect(s.sentiment).toBe('negative')
  })
  it('narrative mentions critical when runway < 3 months', () => {
    const s = generateCashNarrative(100_000, 1.5, null, '2025-11')
    expect(s.narrative.toLowerCase()).toContain('kritik')
  })
  it('is high priority when runway <= 6 months', () => {
    const s = generateCashNarrative(300_000, 5, null, '2025-11')
    expect(s.priority).toBe('high')
    expect(s.sentiment).toBe('mixed')
  })
  it('is positive when runway > 12 months', () => {
    const s = generateCashNarrative(1_000_000, 18, null, '2025-11')
    expect(s.sentiment).toBe('positive')
  })
  it('mentions burn trend increasing', () => {
    const s = generateCashNarrative(500_000, 8, 'increasing', '2025-11')
    expect(s.narrative).toContain('hız')
    const joined = s.highlights.join(' ')
    expect(joined).toContain('artıyor')
  })
  it('mentions burn trend decreasing positively', () => {
    const s = generateCashNarrative(500_000, 8, 'decreasing', '2025-11')
    expect(s.narrative).toContain('yavaşlıyor')
  })
  it('handles null cash balance and null runway', () => {
    const s = generateCashNarrative(null, null, null, '2025-11')
    expect(s.sentiment).toBe('neutral')
    expect(s.narrative).toContain('bulunamadı')
  })
  it('includes cash balance in highlights when provided', () => {
    const s = generateCashNarrative(1_200_000, 10, null, '2025-11')
    const joined = s.highlights.join(' ')
    expect(joined).toContain('1.2M')
  })
})

// ── generateReceivablesNarrative ──────────────────────────────────────────────

describe('generateReceivablesNarrative', () => {
  it('returns section with section_id receivables', () => {
    const s = generateReceivablesNarrative(50_000, 35, 40, '2025-11')
    expect(s.section_id).toBe('receivables')
  })
  it('has negative sentiment and high priority when overdue > 30%', () => {
    const s = generateReceivablesNarrative(100_000, 35, null, '2025-11')
    expect(s.sentiment).toBe('negative')
    expect(s.priority).toBe('high')
  })
  it('narrative mentions urgent tone when overdue > 30%', () => {
    const s = generateReceivablesNarrative(100_000, 35, null, '2025-11')
    expect(s.narrative).toContain('ivedilikle')
  })
  it('has positive sentiment when overdue <= 10% and amount > 0', () => {
    const s = generateReceivablesNarrative(10_000, 8, null, '2025-11')
    expect(s.sentiment).toBe('positive')
  })
  it('has positive sentiment when overdue is zero', () => {
    const s = generateReceivablesNarrative(0, null, null, '2025-11')
    expect(s.sentiment).toBe('positive')
  })
  it('mentions DSO in highlights', () => {
    const s = generateReceivablesNarrative(50_000, 20, 50, '2025-11')
    const joined = s.highlights.join(' ')
    expect(joined).toContain('DSO')
    expect(joined).toContain('50')
  })
  it('narrative contains month name', () => {
    const s = generateReceivablesNarrative(50_000, 20, 40, '2025-11')
    expect(s.narrative).toContain('Kasım')
  })
  it('handles null overdue_pct', () => {
    const s = generateReceivablesNarrative(75_000, null, null, '2025-11')
    expect(typeof s.narrative).toBe('string')
    expect(s.highlights.join(' ')).toContain('75K')
  })
})

// ── generatePartnerNarrative ──────────────────────────────────────────────────

describe('generatePartnerNarrative', () => {
  it('returns section with section_id partners', () => {
    const s = generatePartnerNarrative('Acme Ltd', 5, 500_000, '2025-11')
    expect(s.section_id).toBe('partners')
  })
  it('mentions highest risk partner name when provided', () => {
    const s = generatePartnerNarrative('Acme Ltd', 5, 500_000, '2025-11')
    expect(s.narrative).toContain('Acme Ltd')
  })
  it('risk partner name appears in highlights', () => {
    const s = generatePartnerNarrative('Beta Corp', 3, 300_000, '2025-11')
    const joined = s.highlights.join(' ')
    expect(joined).toContain('Beta Corp')
  })
  it('sentiment is mixed when risk partner present', () => {
    const s = generatePartnerNarrative('Acme Ltd', 5, 500_000, '2025-11')
    expect(s.sentiment).toBe('mixed')
  })
  it('sentiment is positive when no risk partner', () => {
    const s = generatePartnerNarrative(null, 5, 500_000, '2025-11')
    expect(s.sentiment).toBe('positive')
  })
  it('mentions partner count', () => {
    const s = generatePartnerNarrative(null, 7, 1_000_000, '2025-11')
    expect(s.narrative).toContain('7')
  })
  it('mentions total loans when > 0', () => {
    const s = generatePartnerNarrative(null, 3, 750_000, '2025-11')
    expect(s.narrative).toContain('750K')
  })
  it('narrative contains month name', () => {
    const s = generatePartnerNarrative(null, 3, 200_000, '2025-11')
    expect(s.narrative).toContain('Kasım')
  })
})

// ── buildFinancialNarrative ───────────────────────────────────────────────────

describe('buildFinancialNarrative', () => {
  const SAMPLE_DATA = {
    current_revenue:    850_000,
    prior_revenue:      750_000,
    yoy_change_pct:     15,
    total_expenses:     700_000,
    net_income:         150_000,
    cash_balance:       1_200_000,
    runway_months:      8,
    burn_trend:         'stable',
    overdue_amount:     50_000,
    overdue_pct:        20,
    dso_days:           35,
    top_category:       'salary',
    top_category_amount: 400_000,
    partner_count:      4,
    highest_risk_partner: null,
    total_partner_loans:  300_000,
    top_customer_name:  'Acme Ltd',
  }

  it('returns exactly 5 sections', () => {
    const n = buildFinancialNarrative('ceo_summary', '2025-11', SAMPLE_DATA)
    expect(n.sections).toHaveLength(5)
  })

  it('headline is non-empty string', () => {
    const n = buildFinancialNarrative('ceo_summary', '2025-11', SAMPLE_DATA)
    expect(typeof n.headline).toBe('string')
    expect(n.headline.length).toBeGreaterThan(10)
  })

  it('headline contains month name', () => {
    const n = buildFinancialNarrative('ceo_summary', '2025-11', SAMPLE_DATA)
    expect(n.headline).toContain('Kasım')
  })

  it('executive_summary is non-empty', () => {
    const n = buildFinancialNarrative('ceo_summary', '2025-11', SAMPLE_DATA)
    expect(typeof n.executive_summary).toBe('string')
    expect(n.executive_summary.length).toBeGreaterThan(20)
  })

  it('key_numbers array has 4 entries', () => {
    const n = buildFinancialNarrative('ceo_summary', '2025-11', SAMPLE_DATA)
    expect(n.key_numbers).toHaveLength(4)
  })

  it('period is set correctly', () => {
    const n = buildFinancialNarrative('ceo_summary', '2025-11', SAMPLE_DATA)
    expect(n.period).toBe('2025-11')
  })

  it('context is set correctly', () => {
    const n = buildFinancialNarrative('cfo_briefing', '2025-11', SAMPLE_DATA)
    expect(n.context).toBe('cfo_briefing')
  })

  it('generated_at is an ISO timestamp', () => {
    const n = buildFinancialNarrative('ceo_summary', '2025-11', SAMPLE_DATA)
    expect(() => new Date(n.generated_at)).not.toThrow()
    expect(n.generated_at).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('sections have required fields', () => {
    const n = buildFinancialNarrative('ceo_summary', '2025-11', SAMPLE_DATA)
    for (const s of n.sections) {
      expect(typeof s.section_id).toBe('string')
      expect(typeof s.title).toBe('string')
      expect(typeof s.narrative).toBe('string')
      expect(Array.isArray(s.highlights)).toBe(true)
      expect(['positive', 'neutral', 'negative', 'mixed']).toContain(s.sentiment)
      expect(['critical', 'high', 'medium', 'low']).toContain(s.priority)
    }
  })

  it('key_numbers have required fields', () => {
    const n = buildFinancialNarrative('ceo_summary', '2025-11', SAMPLE_DATA)
    for (const kn of n.key_numbers) {
      expect(typeof kn.label).toBe('string')
      expect(typeof kn.value).toBe('string')
      expect(typeof kn.change_description).toBe('string')
      expect(typeof kn.is_positive).toBe('boolean')
    }
  })

  it('profitable period → positive revenue section sentiment', () => {
    const n = buildFinancialNarrative('ceo_summary', '2025-11', SAMPLE_DATA)
    const rev = n.sections.find(s => s.section_id === 'revenue')
    expect(rev?.sentiment).toBe('positive')
  })

  it('loss period → negative or mixed sections', () => {
    const lossData = {
      ...SAMPLE_DATA,
      current_revenue:  500_000,
      prior_revenue:    1_000_000,
      total_expenses:   700_000,
      net_income:       -200_000,
    }
    const n = buildFinancialNarrative('ceo_summary', '2025-11', lossData)
    const rev = n.sections.find(s => s.section_id === 'revenue')
    expect(['negative', 'neutral']).toContain(rev?.sentiment)
  })

  it('revenue key number has is_positive true when revenue >= prior', () => {
    const n = buildFinancialNarrative('ceo_summary', '2025-11', SAMPLE_DATA)
    const revKn = n.key_numbers.find(k => k.label === 'Gelir')
    expect(revKn?.is_positive).toBe(true)
  })

  it('net income key number reflects profit/loss status', () => {
    const n = buildFinancialNarrative('ceo_summary', '2025-11', SAMPLE_DATA)
    const netKn = n.key_numbers.find(k => k.label === 'Net Kâr' || k.label === 'Net Zarar')
    expect(netKn).toBeDefined()
    expect(netKn?.is_positive).toBe(true) // net_income = 150_000
  })

  it('loss period → net income key_number is_positive false', () => {
    const lossData = { ...SAMPLE_DATA, net_income: -50_000 }
    const n = buildFinancialNarrative('ceo_summary', '2025-11', lossData)
    const netKn = n.key_numbers.find(k => k.label === 'Net Kâr' || k.label === 'Net Zarar')
    expect(netKn?.is_positive).toBe(false)
  })
})
