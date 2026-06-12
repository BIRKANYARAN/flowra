import { describe, it, expect } from 'vitest'
import { parseTrNumber, parseStmtDate, parseBankStatementCsv } from '@/lib/connectors/bank-statement'
import { reconcileBankToBook, type BankLine, type BookEntry } from '@/lib/connectors/reconcile'

describe('bank-statement — TR number + date parsing', () => {
  it('parses Turkish money format incl. negatives', () => {
    expect(parseTrNumber('1.234,56')).toBeCloseTo(1234.56, 2)
    expect(parseTrNumber('1234.56')).toBeCloseTo(1234.56, 2)
    expect(parseTrNumber('500,00')).toBeCloseTo(500, 2)
    expect(parseTrNumber('(500,00)')).toBeCloseTo(-500, 2)
    expect(parseTrNumber('-1.000')).toBeCloseTo(-1000, 2)
    expect(parseTrNumber('₺ 2.500,75')).toBeCloseTo(2500.75, 2)
    expect(Number.isNaN(parseTrNumber(''))).toBe(true)
  })

  it('normalizes dates to YYYY-MM-DD', () => {
    expect(parseStmtDate('15.06.2026')).toBe('2026-06-15')
    expect(parseStmtDate('15/06/2026')).toBe('2026-06-15')
    expect(parseStmtDate('2026-06-15')).toBe('2026-06-15')
    expect(parseStmtDate('5.6.26')).toBe('2026-06-05')
    expect(parseStmtDate('')).toBe('')
  })
})

describe('bank-statement — CSV parse (Borç/Alacak + single Tutar)', () => {
  it('derives signed amount from separate Borç/Alacak columns', () => {
    const csv = [
      'Tarih;Açıklama;Borç;Alacak;Bakiye',
      '01.06.2026;ABC tahsilat;;31.500,00;131.500,00',
      '03.06.2026;Kira ödemesi;25.000,00;;106.500,00',
    ].join('\n')
    const { transactions, skipped } = parseBankStatementCsv(csv)
    expect(skipped).toBe(0)
    expect(transactions).toHaveLength(2)
    expect(transactions[0]).toMatchObject({ date: '2026-06-01', amount: 31500, description: 'ABC tahsilat' })
    expect(transactions[1]).toMatchObject({ date: '2026-06-03', amount: -25000 })
    expect(transactions[0].balance_after).toBeCloseTo(131500, 2)
  })

  it('uses a single signed Tutar column when present', () => {
    const csv = 'Tarih,Açıklama,Tutar\n2026-06-10,Havale,-1.500,50\n2026-06-11,Gelen,2.000'
    // note: comma delimiter would collide with TR decimals → use semicolon variant
    const csv2 = 'Tarih;Açıklama;Tutar\n2026-06-10;Havale;-1.500,50\n2026-06-11;Gelen;2.000,00'
    const { transactions } = parseBankStatementCsv(csv2)
    expect(transactions).toHaveLength(2)
    expect(transactions[0].amount).toBeCloseTo(-1500.5, 2)
    expect(transactions[1].amount).toBeCloseTo(2000, 2)
    void csv
  })

  it('skips rows without a date or amount', () => {
    const csv = 'Tarih;Açıklama;Tutar\n;Eksik tarih;100,00\n2026-06-01;Sıfır;0,00\n2026-06-02;Geçerli;50,00'
    const { transactions, skipped } = parseBankStatementCsv(csv)
    expect(transactions).toHaveLength(1)
    expect(skipped).toBe(2)
  })
})

describe('reconcile — line-level bank ↔ book matching', () => {
  const bank: BankLine[] = [
    { id: 'b1', date: '2026-06-02', amount: 31500, description: 'ABC' },   // matches book collection
    { id: 'b2', date: '2026-06-03', amount: -25000, description: 'Kira' }, // matches book payment
    { id: 'b3', date: '2026-06-04', amount: 9999, description: 'Bilinmeyen' }, // no match
  ]
  const book: BookEntry[] = [
    { id: 'k1', date: '2026-06-01', amount: 31500, label: 'ABC tahsilat' },  // 1 day apart → match
    { id: 'k2', date: '2026-06-03', amount: -25000, label: 'Kira gideri' },  // exact → match
    { id: 'k3', date: '2026-06-10', amount: 5000, label: 'Eşleşmeyen' },     // no bank line
  ]

  it('matches by sign + amount + date window, one-to-one', () => {
    const r = reconcileBankToBook(bank, book, { dateWindowDays: 5 })
    expect(r.matched).toHaveLength(2)
    expect(r.matched.map(m => m.bankId).sort()).toEqual(['b1', 'b2'])
    expect(r.unmatchedBank.map(b => b.id)).toEqual(['b3'])
    expect(r.unmatchedBook.map(b => b.id)).toEqual(['k3'])
    expect(r.matchedAmountTry).toBeCloseTo(56500, 2)
    expect(r.matchRate).toBeCloseTo(2 / 3, 3)
  })

  it('respects the date window (no match when too far apart)', () => {
    const r = reconcileBankToBook(bank, book, { dateWindowDays: 0 })
    // b1↔k1 are 1 day apart → drop; b2↔k2 exact same date → keep
    expect(r.matched.map(m => m.bankId)).toEqual(['b2'])
  })

  it('does not match opposite signs even at equal magnitude', () => {
    const r = reconcileBankToBook(
      [{ id: 'b', date: '2026-06-01', amount: 1000 }],
      [{ id: 'k', date: '2026-06-01', amount: -1000 }],
    )
    expect(r.matched).toHaveLength(0)
  })

  it('honours amount tolerance', () => {
    const r = reconcileBankToBook(
      [{ id: 'b', date: '2026-06-01', amount: 1000.04 }],
      [{ id: 'k', date: '2026-06-01', amount: 1000.00 }],
      { amountTolerance: 0.05 },
    )
    expect(r.matched).toHaveLength(1)
  })
})
