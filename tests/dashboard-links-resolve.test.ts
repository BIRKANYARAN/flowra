// ── Guard: every STATIC /dashboard/* href resolves to a real route ──────────────
//
// Catches broken navigation before it ships — a Link/href pointing at a route that
// doesn't exist (a 404 for the user). Companion to nav-config / queried-tables /
// schema-drift guards. Scope is deliberately narrow to stay non-flaky:
//   • only STATIC string-literal hrefs ( href="/dashboard/…" / href={"/dashboard/…"} )
//     — template-literal hrefs with ${…} are dynamic and skipped.
//   • a link resolves if it exactly matches a page route, a middleware redirect key,
//     or a detail route (last segment → :id matches a [param] page).
//
// When this fails: either the link is wrong (fix the href) or the route was renamed/
// removed (update the link), or — rarely — add the href to ALLOWLIST with a reason.

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'fs'
import { resolve, join } from 'path'

const ROOT = resolve(__dirname, '..')

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[] = []
  try { entries = readdirSync(dir) } catch { return out }
  for (const name of entries) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) {
      if (name === 'node_modules' || name === '.next') continue
      walk(p, out)
    } else if (/\.(ts|tsx)$/.test(name)) {
      out.push(p)
    }
  }
  return out
}

// Page routes from app/**/page.tsx → pathname (route groups stripped, [param] → :id).
function pageRoutes(): Set<string> {
  const out = new Set<string>()
  for (const f of walk(resolve(ROOT, 'app'))) {
    if (!f.endsWith('/page.tsx')) continue
    let r = f.slice(resolve(ROOT, 'app').length).replace(/\/page\.tsx$/, '')
    r = r.replace(/\/\([^)]+\)/g, '')          // strip route groups (group)
    r = r.replace(/\/\[[^\]]+\]/g, '/:id')      // [id] → :id
    out.add(r || '/')
  }
  return out
}

// Middleware exact-match redirect keys.
function redirectKeys(): Set<string> {
  const txt = readFileSync(resolve(ROOT, 'middleware.ts'), 'utf8')
  return new Set([...txt.matchAll(/'(\/dashboard\/[^']+)':/g)].map(m => m[1]))
}

// Static /dashboard hrefs across the source (no template literals). Covers JSX
// (href="…" / href={"…"}) AND object-literal forms (href: '…', action_href: '…').
function staticDashboardHrefs(): Set<string> {
  const out = new Set<string>()
  const re = /href[=:]\s*\{?["'](\/dashboard\/[a-zA-Z0-9/_-]+)["']/g
  for (const dir of ['app', 'components', 'lib']) {
    for (const f of walk(resolve(ROOT, dir))) {
      const txt = readFileSync(f, 'utf8')
      for (const m of txt.matchAll(re)) out.add(m[1])
    }
  }
  return out
}

// Hrefs intentionally exempt (e.g. external-ish or known dynamic patterns). Keep tiny.
const ALLOWLIST = new Set<string>([])

describe('dashboard link integrity', () => {
  const pages     = pageRoutes()
  const redirects = redirectKeys()
  const hrefs     = staticDashboardHrefs()

  function resolves(link: string): boolean {
    if (link === '/dashboard' || ALLOWLIST.has(link)) return true
    if (pages.has(link) || redirects.has(link)) return true
    // detail route: /dashboard/sales/123 → /dashboard/sales/:id
    const asId = link.replace(/\/[a-zA-Z0-9_-]+$/, '/:id')
    return pages.has(asId)
  }

  it('parsing sanity — found routes and links', () => {
    expect(pages.size).toBeGreaterThan(20)
    expect(hrefs.size).toBeGreaterThan(10)
  })

  it('every static /dashboard href resolves to a page route or redirect', () => {
    const broken = [...hrefs].filter(l => !resolves(l))
    expect(broken).toEqual([])
  })
})
