// ── lib/csv.ts — tiny dependency-free CSV parser ──────────────────────────────
// Handles the messy reality of SME spreadsheets exported from Excel:
//   • delimiter auto-detect (Turkish Excel commonly uses ';', international ',')
//   • UTF-8 BOM, CRLF/LF, quoted fields with embedded delimiters/newlines/""
//   • blank-line skipping
// Pure + synchronous → unit-testable, runs client-side (no upload needed to parse).

export function detectDelimiter(text: string): ',' | ';' | '\t' {
  const firstLine = (text.replace(/^﻿/, '').split(/\r?\n/)[0]) ?? ''
  const counts: Record<string, number> = { ',': 0, ';': 0, '\t': 0 }
  let inQ = false
  for (const ch of firstLine) {
    if (ch === '"') inQ = !inQ
    else if (!inQ && ch in counts) counts[ch]++
  }
  const best = (Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0]) ?? ','
  return best as ',' | ';' | '\t'
}

/** Parse CSV text into a grid of trimmed string cells. Blank rows are dropped. */
export function parseCsv(text: string, delimiter?: string): string[][] {
  const src = text.replace(/^﻿/, '')
  const delim = delimiter ?? detectDelimiter(src)
  const rows: string[][] = []
  let cur: string[] = []
  let field = ''
  let inQ = false

  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (inQ) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i++ }
        else inQ = false
      } else field += c
    } else if (c === '"') {
      inQ = true
    } else if (c === delim) {
      cur.push(field); field = ''
    } else if (c === '\n') {
      cur.push(field); rows.push(cur); cur = []; field = ''
    } else if (c === '\r') {
      // ignore — handled by the \n branch
    } else {
      field += c
    }
  }
  if (field.length > 0 || cur.length > 0) { cur.push(field); rows.push(cur) }

  return rows
    .map(r => r.map(c => c.trim()))
    .filter(r => r.some(c => c !== ''))
}

/**
 * Map raw header cells to canonical field keys via a synonym dictionary.
 * Returns one entry per header column: the field key, or null if unrecognised.
 */
export function mapHeaders(headers: string[], synonyms: Record<string, string>): (string | null)[] {
  return headers.map(h => {
    const key = h.trim().toLowerCase().replace(/\s+/g, ' ')
    return synonyms[key] ?? null
  })
}

/**
 * Turn a parsed grid (with a header row) into row objects keyed by canonical
 * field. Columns whose header isn't recognised are ignored. Empty values omitted.
 */
export function gridToObjects(
  grid: string[][],
  synonyms: Record<string, string>,
): { fields: string[]; rows: Record<string, string>[] } {
  if (grid.length === 0) return { fields: [], rows: [] }
  const headerMap = mapHeaders(grid[0], synonyms)
  const fields = headerMap.filter((f): f is string => f !== null)
  const rows = grid.slice(1).map(cells => {
    const obj: Record<string, string> = {}
    headerMap.forEach((field, col) => {
      if (field && cells[col] && cells[col].trim() !== '') obj[field] = cells[col].trim()
    })
    return obj
  })
  return { fields, rows }
}
