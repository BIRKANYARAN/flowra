// ── lib/connectors/bank-statement.ts ─────────────────────────────────────────
//
// Pure bank-statement-FILE parser (the safe first real data path — file in, no
// external API). Turns a bank CSV export into ExternalBankTransaction[] ready for
// normalize.ts → reconcile.ts. Handles the messy reality of Turkish bank exports:
//   • TR number format "1.234,56" (dot thousands, comma decimal), parentheses/− negatives
//   • DD.MM.YYYY / DD/MM/YYYY / YYYY-MM-DD dates
//   • single signed "Tutar" column OR separate "Borç"/"Alacak" columns
//   • TR/EN header synonyms; delimiter/BOM via lib/csv
//
// Reuses lib/csv. No I/O, no provider — fully unit-tested.

import { parseCsv, gridToObjects } from '@/lib/csv'
import type { ExternalBankTransaction } from './types'

const STMT_SYNONYMS: Record<string, string> = {
  'tarih': 'date', 'işlem tarihi': 'date', 'islem tarihi': 'date', 'valör': 'date', 'valor': 'date',
  'value date': 'date', 'date': 'date',
  'açıklama': 'description', 'aciklama': 'description', 'işlem': 'description', 'detay': 'description',
  'description': 'description', 'narrative': 'description',
  'tutar': 'amount', 'işlem tutarı': 'amount', 'amount': 'amount', 'miktar': 'amount',
  'borç': 'debit', 'borc': 'debit', 'çıkan': 'debit', 'debit': 'debit',
  'alacak': 'credit', 'giren': 'credit', 'credit': 'credit',
  'bakiye': 'balance', 'balance': 'balance', 'kalan': 'balance',
  'referans': 'reference', 'dekont no': 'reference', 'reference': 'reference', 'fiş no': 'reference',
  'karşı taraf': 'counterparty', 'gönderen': 'counterparty', 'alıcı': 'counterparty', 'counterparty': 'counterparty',
}

/** Parse a TR/EN formatted money string → number (signed). '' / junk → NaN. */
export function parseTrNumber(raw: string | undefined | null): number {
  if (raw == null) return NaN
  let s = String(raw).trim()
  if (s === '') return NaN
  let neg = false
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1) }      // (1.234,56) → negative
  if (s.startsWith('-') || s.endsWith('-')) { neg = true; s = s.replace(/-/g, '') }
  s = s.replace(/[₺$€\s]/g, '')
  // TR: comma = decimal, dot = thousands. Ambiguity is only a lone dot:
  // a dot with exactly 3 trailing digits (or multiple dots) is a thousands
  // separator (1.000 → 1000); otherwise it's an international decimal (1234.56).
  if (s.includes(',')) {
    s = s.replace(/\./g, '').replace(',', '.')                  // comma decimal, dots thousands
  } else if (s.includes('.')) {
    const dots = (s.match(/\./g) || []).length
    const afterLast = s.slice(s.lastIndexOf('.') + 1)
    if (dots > 1 || afterLast.length === 3) s = s.replace(/\./g, '')   // thousands
    // else: lone dot with <3 trailing digits → keep as a decimal point
  }
  const n = Number(s)
  if (!isFinite(n)) return NaN
  return neg ? -n : n
}

/** Normalize a date cell to YYYY-MM-DD; '' if unparseable. */
export function parseStmtDate(raw: string | undefined | null): string {
  const s = (raw ?? '').trim()
  if (!s) return ''
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/)        // YYYY-MM-DD
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/)          // DD.MM.YYYY
  if (m) {
    const yr = m[3].length === 2 ? `20${m[3]}` : m[3]
    return `${yr}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  }
  return ''
}

export interface ParsedStatement {
  transactions: ExternalBankTransaction[]
  /** Rows that couldn't be parsed (no date or no amount) — surfaced, not silently dropped. */
  skipped: number
}

/**
 * Parse a bank statement CSV into ExternalBankTransaction[].
 * @param text       raw CSV
 * @param accountId  external account id to stamp on each line (default 'imported')
 */
export function parseBankStatementCsv(text: string, accountId = 'imported'): ParsedStatement {
  const grid = parseCsv(text)
  const { rows } = gridToObjects(grid, STMT_SYNONYMS)

  const transactions: ExternalBankTransaction[] = []
  let skipped = 0

  rows.forEach((r, i) => {
    const date = parseStmtDate(r.date)
    // Amount: single signed column, else credit − debit.
    let amount: number
    if (r.amount != null && r.amount !== '') {
      amount = parseTrNumber(r.amount)
    } else {
      const credit = parseTrNumber(r.credit)
      const debit  = parseTrNumber(r.debit)
      const c = isFinite(credit) ? credit : 0
      const d = isFinite(debit)  ? debit  : 0
      amount = c - Math.abs(d)
    }
    if (!date || !isFinite(amount) || amount === 0) { skipped++; return }

    transactions.push({
      external_id:        `${accountId}:${i + 1}:${date}:${amount}`,
      account_external_id: accountId,
      date,
      currency:           'TRY',
      amount:             Math.round(amount * 100) / 100,
      description:        (r.description ?? '').trim(),
      counterparty:       (r.counterparty ?? '').trim() || null,
      reference:          (r.reference ?? '').trim() || null,
      balance_after:      r.balance != null && r.balance !== '' && isFinite(parseTrNumber(r.balance))
                            ? Math.round(parseTrNumber(r.balance) * 100) / 100 : null,
    })
  })

  return { transactions, skipped }
}
