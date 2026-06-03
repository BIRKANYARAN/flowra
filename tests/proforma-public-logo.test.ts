// ── proforma-public-logo.test.ts ─────────────────────────────────────────────
// GUARD for the public/PDF proforma company-logo bug.
//
// Company info (name, address, logo_url, …) lives on the `companies` table, NOT
// user_settings (which has only user_id/company_id). The public proforma loader
// used to select those columns from user_settings → the query 400'd → settings
// was null → the company logo never appeared on the downloaded PDF. On top of
// that, 32/33 existing proformas have an EMPTY company_snapshot.logo_url (created
// before a logo was uploaded), so the render must fall back to the live company
// logo. This test pins both fixes.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve, join } from 'path'

const ROOT = resolve(__dirname, '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')

describe('public proforma loader reads company info from companies (not user_settings)', () => {
  const src = read('lib/public-proforma.ts')

  it('queries the companies table for company info', () => {
    expect(src).toMatch(/safeSystemQuery\('companies'\)/)
  })

  it('does NOT select company columns from user_settings (they do not exist there)', () => {
    expect(src).not.toMatch(/from\('user_settings'\)[\s\S]*logo_url/)
    expect(src).not.toMatch(/safeSystemQuery\('user_settings'\)/)
  })

  it('maps companies.tax_id → tax_number and exposes logo_url', () => {
    expect(src).toMatch(/tax_number:\s*c\.tax_id/)
    expect(src).toMatch(/logo_url:\s*c\.logo_url/)
  })
})

describe('proforma render falls back to the live company logo when the snapshot logo is empty', () => {
  it('print page: snapshot logo OR live settings logo', () => {
    const src = read('app/public/proforma/[id]/print/page.tsx')
    expect(src).toMatch(/logo_url:\s*sn_str\(cs\.logo_url\)\s*\?\?\s*\(settings\?\.logo_url/)
  })
  it('public view: snapshot logo OR live settings logo', () => {
    const src = read('app/public/proforma/[id]/page.tsx')
    expect(src).toMatch(/logo_url:\s*str\(cs\.logo_url\)\s*\?\?\s*\(settings\?\.logo_url/)
  })
})

describe('companies is on the public-read allowlist', () => {
  it('safeSystemQuery permits companies', () => {
    expect(read('lib/admin-db.ts')).toMatch(/\|\s*'companies'/)
  })
})
