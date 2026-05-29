/**
 * Multi-Period P&L Comparison — unit tests for pure helpers
 *
 * Tests: computePeriodKey, computePeriodLabel, computeChangePct, buildPnlStructure
 * No DB or network calls — all pure function tests.
 */

import { describe, it, expect } from 'vitest'
import {
  computePeriodKey,
  computePeriodLabel,
  computeChangePct,
  buildPnlStructure,
} from '../lib/services/finance/multi-period-pnl.service'

// ── computePeriodKey ──────────────────────────────────────────────────────────

describe('computePeriodKey — pure', () => {

  it('1. month provided → YYYY-MM', () => {
    expect(computePeriodKey(2026, 5)).toBe('2026-05')
  })

  it('2. month provided — pads single digit month', () => {
    expect(computePeriodKey(2025, 1)).toBe('2025-01')
  })

  it('3. month omitted → YYYY only', () => {
    expect(computePeriodKey(2024)).toBe('2024')
  })

  it('4. month = 12 → correct padding', () => {
    expect(computePeriodKey(2026, 12)).toBe('2026-12')
  })
})

// ── computePeriodLabel ────────────────────────────────────────────────────────

describe('computePeriodLabel — pure', () => {

  it('5. month provided → Turkish month + year', () => {
    const label = computePeriodLabel(2026, 5)
    // Should contain both 'Mayıs' and '2026'
    expect(label).toContain('2026')
    expect(label.toLowerCase()).toContain('mayıs')
  })

  it('6. January in Turkish', () => {
    const label = computePeriodLabel(2026, 1)
    expect(label.toLowerCase()).toContain('ocak')
    expect(label).toContain('2026')
  })

  it('7. month omitted → year only as string', () => {
    expect(computePeriodLabel(2024)).toBe('2024')
  })

  it('8. month omitted → no month name in label', () => {
    const label = computePeriodLabel(2025)
    expect(label).toBe('2025')
    // Should NOT contain any month name
    expect(label.toLowerCase()).not.toContain('ocak')
  })
})

// ── computeChangePct ──────────────────────────────────────────────────────────

describe('computeChangePct — pure', () => {

  it('9. normal positive growth', () => {
    // (115 - 100) / 100 * 100 = 15
    expect(computeChangePct(115, 100)).toBeCloseTo(15)
  })

  it('10. negative change (decline)', () => {
    // (80 - 100) / 100 * 100 = -20
    expect(computeChangePct(80, 100)).toBeCloseTo(-20)
  })

  it('11. prior = 0 → null', () => {
    expect(computeChangePct(500, 0)).toBeNull()
  })

  it('12. prior = undefined → null', () => {
    expect(computeChangePct(500, undefined)).toBeNull()
  })

  it('13. both zero → null (prior = 0)', () => {
    expect(computeChangePct(0, 0)).toBeNull()
  })

  it('14. prior = undefined even with current = 0 → null', () => {
    expect(computeChangePct(0, undefined)).toBeNull()
  })
})

// ── buildPnlStructure ─────────────────────────────────────────────────────────

describe('buildPnlStructure — pure', () => {

  it('15. always includes required subtotal keys', () => {
    const struct = buildPnlStructure([])
    const keys = struct.map(s => s.key)
    expect(keys).toContain('gross_profit')
    expect(keys).toContain('total_opex')
    expect(keys).toContain('ebit')
    expect(keys).toContain('net_income')
  })

  it('16. gross_profit is marked is_subtotal', () => {
    const struct = buildPnlStructure([])
    const gp = struct.find(s => s.key === 'gross_profit')
    expect(gp?.is_subtotal).toBe(true)
  })

  it('17. revenue is NOT a subtotal and NOT inverted', () => {
    const struct = buildPnlStructure([])
    const rev = struct.find(s => s.key === 'revenue')
    expect(rev?.is_subtotal).toBe(false)
    expect(rev?.is_inverted).toBe(false)
  })

  it('18. cogs is inverted (expense), indent_level=1', () => {
    const struct = buildPnlStructure([])
    const cogs = struct.find(s => s.key === 'cogs')
    expect(cogs?.is_inverted).toBe(true)
    expect(cogs?.indent_level).toBe(1)
  })

  it('19. total_opex is subtotal and inverted', () => {
    const struct = buildPnlStructure([])
    const to = struct.find(s => s.key === 'total_opex')
    expect(to?.is_subtotal).toBe(true)
    expect(to?.is_inverted).toBe(true)
  })

  it('20. category rows injected with opex_ prefix and indent_level=1', () => {
    const struct = buildPnlStructure(['rent', 'salary'])
    const rent   = struct.find(s => s.key === 'opex_rent')
    const salary = struct.find(s => s.key === 'opex_salary')
    expect(rent).toBeDefined()
    expect(salary).toBeDefined()
    expect(rent?.indent_level).toBe(1)
    expect(salary?.indent_level).toBe(1)
    expect(rent?.is_subtotal).toBe(false)
    expect(rent?.is_inverted).toBe(true)
  })

  it('21. no categories → no opex_ rows', () => {
    const struct = buildPnlStructure([])
    const opexCats = struct.filter(s => s.key.startsWith('opex_') && s.key !== 'opex_header')
    expect(opexCats).toHaveLength(0)
  })

  it('22. ebit and net_income are both subtotals and not inverted', () => {
    const struct = buildPnlStructure([])
    const ebit   = struct.find(s => s.key === 'ebit')
    const net    = struct.find(s => s.key === 'net_income')
    expect(ebit?.is_subtotal).toBe(true)
    expect(ebit?.is_inverted).toBe(false)
    expect(net?.is_subtotal).toBe(true)
    expect(net?.is_inverted).toBe(false)
  })
})

// ── computePeriodKey — extended boundary tests ────────────────────────────────

describe('computePeriodKey — extended', () => {

  it('23. month = 6 → padded correctly', () => {
    expect(computePeriodKey(2025, 6)).toBe('2025-06')
  })

  it('24. month = 10 → two digit month, no extra padding', () => {
    expect(computePeriodKey(2025, 10)).toBe('2025-10')
  })

  it('25. month = 11 → YYYY-11', () => {
    expect(computePeriodKey(2025, 11)).toBe('2025-11')
  })

  it('26. month = 1 → YYYY-01', () => {
    expect(computePeriodKey(2026, 1)).toBe('2026-01')
  })

  it('27. month = 0 → padded to YYYY-00 (degenerate but no crash)', () => {
    expect(computePeriodKey(2025, 0)).toBe('2025-00')
  })

  it('28. year only — 2000 → "2000"', () => {
    expect(computePeriodKey(2000)).toBe('2000')
  })

  it('29. year only — 1999 → "1999"', () => {
    expect(computePeriodKey(1999)).toBe('1999')
  })

  it('30. year only — returns string, not number', () => {
    expect(typeof computePeriodKey(2030)).toBe('string')
  })

  it('31. YYYY-MM format length is exactly 7 chars', () => {
    expect(computePeriodKey(2025, 3)).toHaveLength(7)
  })

  it('32. year-only format length is 4 chars', () => {
    expect(computePeriodKey(2025)).toHaveLength(4)
  })

})

// ── computePeriodLabel — extended boundary tests ──────────────────────────────

describe('computePeriodLabel — extended', () => {

  it('33. month 12 = December → Turkish "aralık"', () => {
    const label = computePeriodLabel(2025, 12)
    expect(label.toLowerCase()).toContain('aralık')
  })

  it('34. month 6 = June → Turkish "haziran"', () => {
    const label = computePeriodLabel(2025, 6)
    expect(label.toLowerCase()).toContain('haziran')
  })

  it('35. month 9 = September → Turkish "eylül"', () => {
    const label = computePeriodLabel(2025, 9)
    expect(label.toLowerCase()).toContain('eylül')
  })

  it('36. month 3 = March → Turkish "mart"', () => {
    const label = computePeriodLabel(2025, 3)
    expect(label.toLowerCase()).toContain('mart')
  })

  it('37. month 7 = July → Turkish "temmuz"', () => {
    const label = computePeriodLabel(2025, 7)
    expect(label.toLowerCase()).toContain('temmuz')
  })

  it('38. year 2026 included in month label', () => {
    expect(computePeriodLabel(2026, 2)).toContain('2026')
  })

  it('39. year-only returns string representation of year', () => {
    expect(computePeriodLabel(2025)).toBe('2025')
    expect(computePeriodLabel(2000)).toBe('2000')
  })

  it('40. year-only: different years return different strings', () => {
    expect(computePeriodLabel(2024)).not.toBe(computePeriodLabel(2025))
  })

})

// ── computeChangePct — extended boundary tests ────────────────────────────────

describe('computeChangePct — extended', () => {

  it('41. 50% growth: 150 from 100', () => {
    expect(computeChangePct(150, 100)).toBeCloseTo(50)
  })

  it('42. 100% growth: 200 from 100', () => {
    expect(computeChangePct(200, 100)).toBeCloseTo(100)
  })

  it('43. negative prior (loss) — uses absolute value', () => {
    // current=50, prior=-100 → (50-(-100))/abs(-100)*100 = 150/100 = 150%
    expect(computeChangePct(50, -100)).toBeCloseTo(150)
  })

  it('44. current=0, prior non-zero → -100%', () => {
    expect(computeChangePct(0, 100)).toBeCloseTo(-100)
  })

  it('45. very small values: 0.001 from 0.0005', () => {
    expect(computeChangePct(0.001, 0.0005)).toBeCloseTo(100)
  })

  it('46. large values: 2M from 1M → 100%', () => {
    expect(computeChangePct(2_000_000, 1_000_000)).toBeCloseTo(100)
  })

  it('47. equal values: 0% change', () => {
    expect(computeChangePct(500, 500)).toBeCloseTo(0)
  })

  it('48. decimal growth: 1.5 from 1.0 → 50%', () => {
    expect(computeChangePct(1.5, 1.0)).toBeCloseTo(50)
  })

  it('49. large decline: 10 from 1000 → -99%', () => {
    expect(computeChangePct(10, 1000)).toBeCloseTo(-99)
  })

  it('50. triple: current = 3 × prior → 200%', () => {
    expect(computeChangePct(300, 100)).toBeCloseTo(200)
  })

})

// ── buildPnlStructure — extended boundary tests ───────────────────────────────

describe('buildPnlStructure — extended', () => {

  it('51. revenue appears before cogs in structure', () => {
    const struct = buildPnlStructure([])
    const revIdx  = struct.findIndex(s => s.key === 'revenue')
    const cogsIdx = struct.findIndex(s => s.key === 'cogs')
    expect(revIdx).toBeLessThan(cogsIdx)
  })

  it('52. gross_profit appears after cogs', () => {
    const struct = buildPnlStructure([])
    const cogsIdx = struct.findIndex(s => s.key === 'cogs')
    const gpIdx   = struct.findIndex(s => s.key === 'gross_profit')
    expect(gpIdx).toBeGreaterThan(cogsIdx)
  })

  it('53. total_opex appears before ebit', () => {
    const struct  = buildPnlStructure([])
    const opexIdx = struct.findIndex(s => s.key === 'total_opex')
    const ebitIdx = struct.findIndex(s => s.key === 'ebit')
    expect(opexIdx).toBeLessThan(ebitIdx)
  })

  it('54. ebit appears before net_income', () => {
    const struct   = buildPnlStructure([])
    const ebitIdx  = struct.findIndex(s => s.key === 'ebit')
    const netIdx   = struct.findIndex(s => s.key === 'net_income')
    expect(ebitIdx).toBeLessThan(netIdx)
  })

  it('55. all 5 categories → 5 opex_ rows (excluding opex_header)', () => {
    const cats  = ['rent', 'salary', 'utilities', 'marketing', 'tax']
    const struct = buildPnlStructure(cats)
    const opexRows = struct.filter(s => s.key.startsWith('opex_') && s.key !== 'opex_header')
    expect(opexRows).toHaveLength(5)
  })

  it('56. unknown category key → falls back to raw category name as label', () => {
    const struct = buildPnlStructure(['unknown_xyz'])
    const row    = struct.find(s => s.key === 'opex_unknown_xyz')
    expect(row?.label).toBe('unknown_xyz')
  })

  it('57. known category "rent" → Turkish label "Kira"', () => {
    const struct = buildPnlStructure(['rent'])
    const row    = struct.find(s => s.key === 'opex_rent')
    expect(row?.label).toBe('Kira')
  })

  it('58. known category "salary" → Turkish label "Maaş / Bordro"', () => {
    const struct = buildPnlStructure(['salary'])
    const row    = struct.find(s => s.key === 'opex_salary')
    expect(row?.label).toBe('Maaş / Bordro')
  })

  it('59. known category "marketing" → Turkish label "Pazarlama"', () => {
    const struct = buildPnlStructure(['marketing'])
    const row    = struct.find(s => s.key === 'opex_marketing')
    expect(row?.label).toBe('Pazarlama')
  })

  it('60. known category "software" → Turkish label "Yazılım / Abonelik"', () => {
    const struct = buildPnlStructure(['software'])
    const row    = struct.find(s => s.key === 'opex_software')
    expect(row?.label).toBe('Yazılım / Abonelik')
  })

  it('61. category rows are all is_inverted=true', () => {
    const struct = buildPnlStructure(['rent', 'marketing'])
    const opexCats = struct.filter(s => s.key.startsWith('opex_') && s.key !== 'opex_header')
    expect(opexCats.every(r => r.is_inverted === true)).toBe(true)
  })

  it('62. category rows have indent_level=1', () => {
    const struct = buildPnlStructure(['logistics'])
    const row    = struct.find(s => s.key === 'opex_logistics')
    expect(row?.indent_level).toBe(1)
  })

  it('63. revenue row has indent_level=0', () => {
    const struct = buildPnlStructure([])
    const rev    = struct.find(s => s.key === 'revenue')
    expect(rev?.indent_level).toBe(0)
  })

  it('64. opex_header is NOT a subtotal', () => {
    const struct = buildPnlStructure([])
    const header = struct.find(s => s.key === 'opex_header')
    expect(header?.is_subtotal).toBe(false)
  })

  it('65. opex_header is_inverted = true', () => {
    const struct = buildPnlStructure([])
    const header = struct.find(s => s.key === 'opex_header')
    expect(header?.is_inverted).toBe(true)
  })

  it('66. total_rev is subtotal but NOT inverted', () => {
    const struct = buildPnlStructure([])
    const tr     = struct.find(s => s.key === 'total_rev')
    expect(tr?.is_subtotal).toBe(true)
    expect(tr?.is_inverted).toBe(false)
  })

  it('67. cogs is_subtotal = false', () => {
    const struct = buildPnlStructure([])
    const cogs   = struct.find(s => s.key === 'cogs')
    expect(cogs?.is_subtotal).toBe(false)
  })

  it('68. no duplicate keys in structure', () => {
    const struct = buildPnlStructure(['rent', 'salary', 'other'])
    const keys   = struct.map(s => s.key)
    const unique = new Set(keys)
    expect(unique.size).toBe(keys.length)
  })

  it('69. gross_profit indent_level = 0', () => {
    const struct = buildPnlStructure([])
    const gp     = struct.find(s => s.key === 'gross_profit')
    expect(gp?.indent_level).toBe(0)
  })

  it('70. all required top-level keys present with empty categories', () => {
    const struct = buildPnlStructure([])
    const keys   = struct.map(s => s.key)
    const required = ['revenue', 'total_rev', 'cogs', 'gross_profit', 'opex_header', 'total_opex', 'ebit', 'net_income']
    required.forEach(k => expect(keys).toContain(k))
  })

  it('71. structure with all known categories has correct count', () => {
    const allCats = ['general', 'rent', 'salary', 'utilities', 'marketing',
                     'logistics', 'software', 'equipment', 'tax', 'interest',
                     'board_fee', 'principal', 'dividend', 'partner_loan', 'other']
    const struct  = buildPnlStructure(allCats)
    // 8 fixed rows + 15 category rows = 23 rows
    expect(struct).toHaveLength(8 + allCats.length)
  })

  it('72. known category "equipment" → correct Turkish label', () => {
    const struct = buildPnlStructure(['equipment'])
    const row    = struct.find(s => s.key === 'opex_equipment')
    expect(row?.label).toBe('Ekipman / Donanım')
  })

  it('73. known category "interest" → correct Turkish label', () => {
    const struct = buildPnlStructure(['interest'])
    const row    = struct.find(s => s.key === 'opex_interest')
    expect(row?.label).toBe('Faiz Gideri')
  })

  it('74. known category "other" → "Diğer"', () => {
    const struct = buildPnlStructure(['other'])
    const row    = struct.find(s => s.key === 'opex_other')
    expect(row?.label).toBe('Diğer')
  })

  it('75. known category "logistics" → "Lojistik / Kargo"', () => {
    const struct = buildPnlStructure(['logistics'])
    const row    = struct.find(s => s.key === 'opex_logistics')
    expect(row?.label).toBe('Lojistik / Kargo')
  })

  it('76. known category "utilities" → "Faturalar"', () => {
    const struct = buildPnlStructure(['utilities'])
    const row    = struct.find(s => s.key === 'opex_utilities')
    expect(row?.label).toBe('Faturalar')
  })

  it('77. known category "board_fee" → correct Turkish label', () => {
    const struct = buildPnlStructure(['board_fee'])
    const row    = struct.find(s => s.key === 'opex_board_fee')
    expect(row?.label).toBe('Yönetim Kurulu Ücreti')
  })

  it('78. known category "partner_loan" → correct Turkish label', () => {
    const struct = buildPnlStructure(['partner_loan'])
    const row    = struct.find(s => s.key === 'opex_partner_loan')
    expect(row?.label).toBe('Ortak Finansmanı')
  })

  it('79. category rows appear between opex_header and total_opex', () => {
    const struct     = buildPnlStructure(['rent'])
    const headerIdx  = struct.findIndex(s => s.key === 'opex_header')
    const catIdx     = struct.findIndex(s => s.key === 'opex_rent')
    const totalIdx   = struct.findIndex(s => s.key === 'total_opex')
    expect(catIdx).toBeGreaterThan(headerIdx)
    expect(catIdx).toBeLessThan(totalIdx)
  })

  it('80. two categories → both opex_ rows present', () => {
    const struct = buildPnlStructure(['rent', 'salary'])
    expect(struct.find(s => s.key === 'opex_rent')).toBeDefined()
    expect(struct.find(s => s.key === 'opex_salary')).toBeDefined()
  })

  it('81. net_income label is "Net Kâr"', () => {
    const struct = buildPnlStructure([])
    const row    = struct.find(s => s.key === 'net_income')
    expect(row?.label).toBe('Net Kâr')
  })

  it('82. ebit label contains EBIT', () => {
    const struct = buildPnlStructure([])
    const row    = struct.find(s => s.key === 'ebit')
    expect(row?.label).toContain('EBIT')
  })

  it('83. gross_profit label is "Brüt Kâr"', () => {
    const struct = buildPnlStructure([])
    const row    = struct.find(s => s.key === 'gross_profit')
    expect(row?.label).toBe('Brüt Kâr')
  })

  it('84. revenue label is "Ciro"', () => {
    const struct = buildPnlStructure([])
    const row    = struct.find(s => s.key === 'revenue')
    expect(row?.label).toBe('Ciro')
  })

  it('85. cogs label contains "SMM" or "Maliyet"', () => {
    const struct = buildPnlStructure([])
    const row    = struct.find(s => s.key === 'cogs')
    expect(row?.label).toContain('Satılan')
  })

  it('86. all subtotal rows are not both subtotal and category row', () => {
    const struct = buildPnlStructure(['rent'])
    struct
      .filter(s => s.is_subtotal)
      .forEach(s => expect(s.key.startsWith('opex_') && s.key !== 'opex_header').toBe(false))
  })

  it('87. getKeys returns correct order: revenue before gross_profit before ebit before net_income', () => {
    const struct    = buildPnlStructure([])
    const keys      = struct.map(s => s.key)
    const revIdx    = keys.indexOf('revenue')
    const gpIdx     = keys.indexOf('gross_profit')
    const ebitIdx   = keys.indexOf('ebit')
    const netIdx    = keys.indexOf('net_income')
    expect(revIdx < gpIdx && gpIdx < ebitIdx && ebitIdx < netIdx).toBe(true)
  })

  it('88. all keys are unique even with multiple categories', () => {
    const struct = buildPnlStructure(['rent', 'salary', 'utilities', 'marketing', 'other'])
    const keys   = struct.map(s => s.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('89. empty categories → structure has exactly 8 items', () => {
    const struct = buildPnlStructure([])
    expect(struct).toHaveLength(8)
  })

  it('90. single category → structure has exactly 9 items', () => {
    const struct = buildPnlStructure(['rent'])
    expect(struct).toHaveLength(9)
  })

  it('91. ten categories → structure has 18 items', () => {
    const cats   = ['a','b','c','d','e','f','g','h','i','j']
    const struct = buildPnlStructure(cats)
    expect(struct).toHaveLength(18)
  })

  it('92. category "dividend" → label "Kâr Payı"', () => {
    const struct = buildPnlStructure(['dividend'])
    const row    = struct.find(s => s.key === 'opex_dividend')
    expect(row?.label).toBe('Kâr Payı')
  })

  it('93. category "principal" → label "Anapara Geri Ödemesi"', () => {
    const struct = buildPnlStructure(['principal'])
    const row    = struct.find(s => s.key === 'opex_principal')
    expect(row?.label).toBe('Anapara Geri Ödemesi')
  })

  it('94. opex_header indent_level = 0', () => {
    const struct = buildPnlStructure([])
    const row    = struct.find(s => s.key === 'opex_header')
    expect(row?.indent_level).toBe(0)
  })

  it('95. total_opex indent_level = 0', () => {
    const struct = buildPnlStructure([])
    const row    = struct.find(s => s.key === 'total_opex')
    expect(row?.indent_level).toBe(0)
  })

  it('96. ebit indent_level = 0', () => {
    const struct = buildPnlStructure([])
    const row    = struct.find(s => s.key === 'ebit')
    expect(row?.indent_level).toBe(0)
  })

  it('97. category tax → label "Vergi / Resmi Ücret"', () => {
    const struct = buildPnlStructure(['tax'])
    const row    = struct.find(s => s.key === 'opex_tax')
    expect(row?.label).toBe('Vergi / Resmi Ücret')
  })

  it('98. opex_header label contains "Operasyonel"', () => {
    const struct = buildPnlStructure([])
    const row    = struct.find(s => s.key === 'opex_header')
    expect(row?.label).toContain('Operasyonel')
  })

  it('99. total_rev label is "Toplam Gelir"', () => {
    const struct = buildPnlStructure([])
    const row    = struct.find(s => s.key === 'total_rev')
    expect(row?.label).toBe('Toplam Gelir')
  })

  it('100. total_opex label contains "Toplam"', () => {
    const struct = buildPnlStructure([])
    const row    = struct.find(s => s.key === 'total_opex')
    expect(row?.label).toContain('Toplam')
  })

  it('101. category "general" → label "Genel Giderler"', () => {
    const struct = buildPnlStructure(['general'])
    const row    = struct.find(s => s.key === 'opex_general')
    expect(row?.label).toBe('Genel Giderler')
  })

})
