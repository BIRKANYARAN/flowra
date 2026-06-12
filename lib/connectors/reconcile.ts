// ── lib/connectors/reconcile.ts ──────────────────────────────────────────────
//
// Pure line-level reconciliation: match imported bank transactions against
// Flowra's book cash movements (sale collections = inflow, expense payments =
// outflow). This is the core of "fatura–banka mutabakatı" (roadmap step 3) at the
// logic level — no DB, no persistence, fully unit-tested. Persistence + UI wiring
// is deferred (needs the bank_statement_lines table — DDL).
//
// Matching is greedy best-effort: same sign, amount within tolerance, date within
// a window; closest date wins. Each side is consumed at most once.

export interface BankLine {
  id:     string
  date:   string          // YYYY-MM-DD
  amount: number          // signed: + inflow, − outflow
  description?: string
}

export interface BookEntry {
  id:     string
  date:   string          // YYYY-MM-DD
  amount: number          // signed: + inflow (collection), − outflow (payment)
  label?: string
}

export interface MatchPair {
  bankId:   string
  bookId:   string
  amount:   number
  daysApart: number
}

export interface ReconcileResult {
  matched:        MatchPair[]
  unmatchedBank:  BankLine[]
  unmatchedBook:  BookEntry[]
  matchedAmountTry: number
  matchRate:      number       // matched / total bank lines (0..1)
}

export interface ReconcileOpts {
  amountTolerance?: number     // absolute TRY, default 0.01 (exact)
  dateWindowDays?:  number     // default 5
}

function daysBetween(a: string, b: string): number {
  const da = Date.parse(a + 'T00:00:00Z'), db = Date.parse(b + 'T00:00:00Z')
  if (isNaN(da) || isNaN(db)) return Infinity
  return Math.abs(da - db) / 86_400_000
}

export function reconcileBankToBook(
  bank: BankLine[],
  book: BookEntry[],
  opts: ReconcileOpts = {},
): ReconcileResult {
  const tol  = opts.amountTolerance ?? 0.01
  const win  = opts.dateWindowDays  ?? 5

  const usedBook = new Set<string>()
  const matched: MatchPair[] = []

  // Process larger amounts first — they're less ambiguous.
  const bankSorted = [...bank].sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))

  for (const bl of bankSorted) {
    let best: { entry: BookEntry; days: number } | null = null
    for (const be of book) {
      if (usedBook.has(be.id)) continue
      if (Math.sign(be.amount) !== Math.sign(bl.amount)) continue
      if (Math.abs(be.amount - bl.amount) > tol) continue
      const days = daysBetween(bl.date, be.date)
      if (days > win) continue
      if (!best || days < best.days) best = { entry: be, days }
    }
    if (best) {
      usedBook.add(best.entry.id)
      matched.push({ bankId: bl.id, bookId: best.entry.id, amount: bl.amount, daysApart: best.days })
    }
  }

  const matchedBankIds = new Set(matched.map(m => m.bankId))
  const matchedBookIds = new Set(matched.map(m => m.bookId))
  const unmatchedBank = bank.filter(b => !matchedBankIds.has(b.id))
  const unmatchedBook = book.filter(b => !matchedBookIds.has(b.id))
  const matchedAmountTry = matched.reduce((s, m) => s + Math.abs(m.amount), 0)

  return {
    matched,
    unmatchedBank,
    unmatchedBook,
    matchedAmountTry: Math.round(matchedAmountTry * 100) / 100,
    matchRate: bank.length > 0 ? matched.length / bank.length : 0,
  }
}
