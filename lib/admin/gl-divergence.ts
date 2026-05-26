// ─────────────────────────────────────────────────────────────────────────────
// lib/admin/gl-divergence.ts
//
// Pure computation helpers for the GL divergence audit tool (TA.1).
// No DB calls here — all logic is testable without mocks.
// ─────────────────────────────────────────────────────────────────────────────

export interface SourceCounts {
  total:              number
  with_entries:       number
  missing:            number
  missing_amount_try: number
}

export interface DivergenceSummary {
  sales:     SourceCounts
  expenses:  SourceCounts
  purchases: SourceCounts
}

export interface OperationalRecord {
  id:         string
  amount_try: number
}

export interface OperationalIds {
  sales:     OperationalRecord[]
  expenses:  OperationalRecord[]
  purchases: OperationalRecord[]
}

export interface JournaledRef {
  source_type: string
  source_id:   string
}

/**
 * Pure function — computes divergence between operational records and journal entries.
 *
 * @param operational  records from sales / expenses / purchases tables
 * @param journaledIds journal_entries rows with source_type + source_id
 * @returns DivergenceSummary — per-type counts and missing-amount totals
 */
export function computeDivergence(
  operational: OperationalIds,
  journaledIds: JournaledRef[],
): DivergenceSummary {
  // Build a Set<"source_type:source_id"> for O(1) lookup
  const journaledSet = new Set<string>(
    journaledIds.map(j => `${j.source_type}:${j.source_id}`),
  )

  function computeType(
    records:    OperationalRecord[],
    sourceType: string,
  ): SourceCounts {
    let withEntries = 0
    let missingAmountTry = 0

    for (const rec of records) {
      if (journaledSet.has(`${sourceType}:${rec.id}`)) {
        withEntries++
      } else {
        missingAmountTry += rec.amount_try
      }
    }

    const missing = records.length - withEntries

    return {
      total:              records.length,
      with_entries:       withEntries,
      missing,
      missing_amount_try: missingAmountTry,
    }
  }

  return {
    sales:     computeType(operational.sales,     'sale'),
    expenses:  computeType(operational.expenses,  'expense'),
    purchases: computeType(operational.purchases, 'purchase'),
  }
}
