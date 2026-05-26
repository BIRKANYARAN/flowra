// ─────────────────────────────────────────────────────────────────────────────
// lib/services/ledger/entry-mapping.service.ts
//
// Pure reference document for the dual-write system.
// Defines which operational record types produce which GL journal entries.
// No DB calls — pure data + lookup only.
// ─────────────────────────────────────────────────────────────────────────────

export interface EntryMapping {
  source_type:     'sale' | 'expense' | 'purchase' | 'partner_tx' | 'period_close'
  /** Unique key identifying the journal entry template */
  entry_type:      string
  description:     string
  debit_accounts:  string[]   // account codes
  credit_accounts: string[]   // account codes
  conditions?:     string     // human-readable condition or note
}

/**
 * Canonical list of all 15 journal entry types in the Flowra GL architecture.
 *
 * Account code reference:
 *   100 Kasa | 102 Bankalar | 120 Alıcılar | 153 Ticari Mallar
 *   191 İndirilecek KDV | 253 Tesis/Makine | 257 Birikmiş Amortisman
 *   320 Satıcılar | 321 Ortaklara Borçlar (KV) | 335 Personele Borçlar
 *   360 Ödenecek Vergi | 391 Hesaplanan KDV | 421 Ortaklara Borçlar (UV)
 *   500 Sermaye | 501 Ödenmemiş Sermaye | 542 Yasal Yedekler
 *   570 Geçmiş Yıllar Kârları | 580 Geçmiş Yıllar Zararları
 *   590 Dönem Net Kârı | 600 Yurt İçi Satışlar | 620 Satılan Malın Maliyeti
 *   642 Faiz Gelirleri | 760–773 Gider hesapları | 780 Finansman Giderleri
 */
export const ENTRY_MAPPINGS: EntryMapping[] = [
  // ── SALES ──────────────────────────────────────────────────────────────────

  {
    source_type:     'sale',
    entry_type:      'SALE_ACCRUAL',
    description:     'Satış tahakkuku — fatura kesildiğinde alacak ve KDV yükümlülüğü doğar',
    debit_accounts:  ['120'],            // Alıcılar (trade receivable)
    credit_accounts: ['600', '391'],     // Yurt İçi Satışlar + Hesaplanan KDV
    conditions:      'Fatura kesimi anında; payment_status = pending | partial',
  },

  {
    source_type:     'sale',
    entry_type:      'SALE_PAYMENT',
    description:     'Satış tahsilatı — alacak kapatılır, nakit girer',
    debit_accounts:  ['102'],            // Bankalar
    credit_accounts: ['120'],            // Alıcılar
    conditions:      'payment_status = paid; partial için kısmi tutar',
  },

  // ── EXPENSES ───────────────────────────────────────────────────────────────

  {
    source_type:     'expense',
    entry_type:      'EXPENSE_ACCRUAL',
    description:     'Gider tahakkuku — borç doğar veya doğrudan ödenir',
    debit_accounts:  ['770', '191'],     // Gider hesabı (7xx) + İndirilecek KDV
    credit_accounts: ['320', '102'],     // Satıcılar (borç) veya Bankalar (nakit)
    conditions:      'payment_status = pending → CR 320; paid → CR 102',
  },

  {
    source_type:     'expense',
    entry_type:      'EXPENSE_PAYMENT',
    description:     'Gider ödemesi — satıcı borcu kapatılır',
    debit_accounts:  ['320'],            // Satıcılar
    credit_accounts: ['102'],            // Bankalar
    conditions:      'payment_status değişimi: pending → paid',
  },

  // ── PURCHASES / INVENTORY ──────────────────────────────────────────────────

  {
    source_type:     'purchase',
    entry_type:      'PURCHASE_FINALIZE',
    description:     'Stok alımı — stok aktifleşir, borç veya nakit çıkışı olur',
    debit_accounts:  ['153'],            // Ticari Mallar
    credit_accounts: ['102', '320'],     // Bankalar veya Satıcılar
    conditions:      'Stok lot created; paid → CR 102, on-account → CR 320',
  },

  {
    source_type:     'purchase',
    entry_type:      'COGS',
    description:     'Satılan malın maliyeti — stoktan çıkış yapılır',
    debit_accounts:  ['620'],            // Satılan Malın Maliyeti
    credit_accounts: ['153'],            // Ticari Mallar
    conditions:      'Satış faturası kesildiğinde FIFO maliyet ile',
  },

  // ── PARTNER TRANSACTIONS ───────────────────────────────────────────────────

  {
    source_type:     'partner_tx',
    entry_type:      'PARTNER_LOAN_IN',
    description:     'Ortak kredisi — şirkete borç para gelir',
    debit_accounts:  ['102'],            // Bankalar
    credit_accounts: ['321'],            // Ortaklara Borçlar (KV)
    conditions:      'tx_type = loan_to_company | loan_in',
  },

  {
    source_type:     'partner_tx',
    entry_type:      'PARTNER_LOAN_REPAYMENT',
    description:     'Ortak kredisi geri ödemesi',
    debit_accounts:  ['321'],            // Ortaklara Borçlar (KV)
    credit_accounts: ['102'],            // Bankalar
    conditions:      'tx_type = loan_repayment | loan_out',
  },

  {
    source_type:     'partner_tx',
    entry_type:      'PARTNER_EQUITY_IN',
    description:     'Ortak sermaye katkısı',
    debit_accounts:  ['102'],            // Bankalar
    credit_accounts: ['500'],            // Sermaye
    conditions:      'tx_type = capital_in',
  },

  {
    source_type:     'partner_tx',
    entry_type:      'COMPENSATION',
    description:     'Ortak maaş / yönetim kurulu ücreti ödemesi',
    debit_accounts:  ['770'],            // Genel Yönetim Giderleri
    credit_accounts: ['102', '335'],     // Bankalar veya Personele Borçlar
    conditions:      'tx_type = salary | board_fee; paid → CR 102, accrued → CR 335',
  },

  {
    source_type:     'partner_tx',
    entry_type:      'DIVIDEND_DECLARED',
    description:     'Temettü ilanı — dönem kârından temettü borcu doğar',
    debit_accounts:  ['590'],            // Dönem Net Kârı
    credit_accounts: ['360', '335'],     // Ödenecek Vergi (stopaj) + Personele Borçlar (net temettü)
    conditions:      'tx_type = dividend; ilanda; ödeme ayrı kayıt',
  },

  {
    source_type:     'partner_tx',
    entry_type:      'DIVIDEND_PAID',
    description:     'Temettü ödemesi — borç kapatılır',
    debit_accounts:  ['335'],            // Personele Borçlar (net temettü borcu)
    credit_accounts: ['102'],            // Bankalar
    conditions:      'tx_type = dividend; ödeme anında',
  },

  // ── PERIOD CLOSE ───────────────────────────────────────────────────────────

  {
    source_type:     'period_close',
    entry_type:      'PERIOD_CLOSE_PROFIT',
    description:     'Dönem kapanışı — dönem kârı özkaynağa aktarılır',
    debit_accounts:  ['590'],            // Dönem Net Kârı
    credit_accounts: ['570', '542'],     // Geçmiş Yıllar Kârları + Yasal Yedekler
    conditions:      'Yıllık kapanışta; yasal yedek = net kar × %5 (ilk yıllarda)',
  },

  // ── FINANCING ──────────────────────────────────────────────────────────────

  {
    source_type:     'partner_tx',
    entry_type:      'INTEREST_EXPENSE',
    description:     'Faiz gideri — ortak kredisi faizi tahakkuku',
    debit_accounts:  ['780'],            // Finansman Giderleri
    credit_accounts: ['321'],            // Ortaklara Borçlar (KV)
    conditions:      'expense_type = partner_loan_interest',
  },

  {
    source_type:     'sale',
    entry_type:      'INTEREST_INCOME',
    description:     'Faiz geliri — banka faizi tahakkuku',
    debit_accounts:  ['102'],            // Bankalar
    credit_accounts: ['642'],            // Faiz Gelirleri
    conditions:      'Banka hesabına yatırılan faiz',
  },
]

/**
 * Look up the mapping for a given entry_type key.
 * Returns undefined if the entry_type is not recognised.
 */
export function getMappingForSourceType(entryType: string): EntryMapping | undefined {
  return ENTRY_MAPPINGS.find(m => m.entry_type === entryType)
}
