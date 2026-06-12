// ── lib/connectors/reconcile-names.ts ────────────────────────────────────────
//
// Pure name-based reconciliation for the cari (customer/supplier) pillar: match
// an accounting system's party list against Flowra's by normalized name. Handles
// the Turkish-business-name reality — case, spacing, punctuation, and common
// company suffixes (A.Ş. / Ltd. / Şti. / San. / Tic. …) that differ between
// systems. No I/O, fully unit-tested.

export interface NamedParty { id: string; name: string }

export interface NameReconcileResult {
  matched:     { aId: string; bId: string; name: string }[]
  onlyInA:     NamedParty[]   // in the uploaded list, not in Flowra
  onlyInB:     NamedParty[]   // in Flowra, not in the uploaded list
  matchRate:   number         // matched / total A (0..1)
}

const SUFFIXES = [
  'a.ş.', 'a.s.', 'aş', 'as', 'anonim şirketi', 'anonim sirketi',
  'ltd. şti.', 'ltd. sti.', 'ltd.şti.', 'ltd sti', 'ltd', 'limited şirketi', 'limited',
  'şti.', 'sti.', 'şti', 'sti',
  'san.', 'san', 'sanayi', 'tic.', 'tic', 'ticaret', 've',
  'inş.', 'ins.', 'inşaat', 'insaat', 'gıda', 'gida', 'lojistik', 'teknoloji',
]

/** Normalize a TR business name for matching: lowercase, strip punctuation +
 *  common suffixes, collapse whitespace. */
export function normalizeName(raw: string): string {
  let s = (raw ?? '')
    .toLocaleLowerCase('tr')
    .replace(/[.,;:'"`/\\()-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  // Strip trailing/standalone suffix tokens repeatedly.
  let changed = true
  while (changed) {
    changed = false
    for (const suf of SUFFIXES) {
      const sufNorm = suf.replace(/[.]/g, ' ').replace(/\s+/g, ' ').trim()
      if (s === sufNorm) continue
      if (s.endsWith(' ' + sufNorm)) { s = s.slice(0, -(sufNorm.length + 1)).trim(); changed = true }
    }
  }
  return s.replace(/\s+/g, ' ').trim()
}

export function reconcileByName(a: NamedParty[], b: NamedParty[]): NameReconcileResult {
  const bByNorm = new Map<string, NamedParty>()
  for (const p of b) {
    const k = normalizeName(p.name)
    if (k && !bByNorm.has(k)) bByNorm.set(k, p)
  }

  const usedB = new Set<string>()
  const matched: NameReconcileResult['matched'] = []
  const onlyInA: NamedParty[] = []

  for (const p of a) {
    const k = normalizeName(p.name)
    const hit = k ? bByNorm.get(k) : undefined
    if (hit && !usedB.has(hit.id)) {
      usedB.add(hit.id)
      matched.push({ aId: p.id, bId: hit.id, name: p.name.trim() })
    } else {
      onlyInA.push(p)
    }
  }

  const onlyInB = b.filter(p => !usedB.has(p.id))
  return { matched, onlyInA, onlyInB, matchRate: a.length > 0 ? matched.length / a.length : 0 }
}
