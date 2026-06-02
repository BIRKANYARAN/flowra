// ── fx-source-contract.test.ts ───────────────────────────────────────────────
// GUARD for the FX "no silent 1:1 fallback" rule (lib/fx.ts getOrFetchFxRate).
//
// Any 1:1 rate Flowra returns MUST carry a signaling `source` so downstream never
// treats a placeholder as a real market rate: 'identity' for TRY (legitimately 1:1)
// and 'unavailable' when no rate could be found (a data-quality hole). A future
// edit that returns a bare { rate: 1 } with a normal-looking source would silently
// distort revenue/COGS/KDV on FX rows — this test makes that a red build.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve, join } from 'path'
import { getOrFetchFxRate } from '../lib/fx'

const ROOT = resolve(__dirname, '..')

describe('FX source contract — no silent 1:1 fallback', () => {
  // Behavioral: the TRY path returns before any Supabase/network call.
  it('TRY returns identity 1:1 with source "identity"', async () => {
    const r = await getOrFetchFxRate('TRY')
    expect(r.rate).toBe(1)
    expect(r.source).toBe('identity')
  })

  // Static contract: every `rate: 1` literal in getOrFetchFxRate must be paired
  // with a signaling source, and the no-rate path must warn (never silent).
  const src = readFileSync(join(ROOT, 'lib/fx.ts'), 'utf8')

  it('every 1:1 return carries a signaling source (identity | unavailable)', () => {
    // Find each `rate: 1,` return and assert the surrounding object names a
    // signaling source. We match the two known returns explicitly.
    expect(src).toMatch(/rate:\s*1,\s*source:\s*'identity'/)      // TRY
    expect(src).toMatch(/rate:\s*1,\s*source:\s*'unavailable'/)   // no-rate fallback
    // There must be no bare 1:1 return with a generic/real-looking source word.
    expect(src).not.toMatch(/rate:\s*1,\s*source:\s*'(tcmb|fallback|manual|api)'/)
  })

  it('the no-rate 1:1 fallback is never silent (warns before returning)', () => {
    // The 'unavailable' branch must be preceded by a console.warn in the source.
    const idx = src.indexOf("source: 'unavailable'")
    expect(idx).toBeGreaterThan(-1)
    const before = src.slice(Math.max(0, idx - 200), idx)
    expect(before).toMatch(/console\.warn/)
  })
})
