/**
 * CFO Pack Service — pure helper tests
 *
 * Tests for:
 *   buildEmptyManifest   — correct structure, is_complete=false, all items pending
 *   computePackProgress  — 0 if all pending, 100 if all ready, proportional
 *   isPackComplete       — false if any non-ready, true if all ready
 *   getReportTitle       — all 10 ReportTypes return non-empty Turkish strings
 *   getReportDescription — all 10 ReportTypes return non-empty Turkish strings
 *   REPORT_ORDER         — has 10 items, all valid ReportTypes
 *
 * Run: npx vitest run tests/cfo-pack-service.test.ts
 */

import { describe, it, expect } from 'vitest'
import {
  buildEmptyManifest,
  computePackProgress,
  isPackComplete,
  getReportTitle,
  getReportDescription,
  REPORT_ORDER,
  type ReportType,
  type CfoPackManifest,
  type ReportItem,
} from '@/lib/services/reporting/cfo-pack.service'

// ── All valid ReportType values ───────────────────────────────────────────────

const ALL_REPORT_TYPES: ReportType[] = [
  'trial_balance',
  'income_statement',
  'balance_sheet',
  'cash_flow',
  'partner_capital',
  'kdv_summary',
  'corporate_tax_estimate',
  'receivables_aging',
  'partner_risk_map',
  'executive_summary',
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeManifestWithStatus(statuses: ReportItem['status'][]): CfoPackManifest {
  const items: ReportItem[] = statuses.map((status, i) => ({
    type:         ALL_REPORT_TYPES[i % ALL_REPORT_TYPES.length],
    title:        `Title ${i}`,
    description:  `Desc ${i}`,
    status,
    url:          status === 'ready' ? `https://example.com/report-${i}.pdf` : null,
    size_kb:      status === 'ready' ? 100 : null,
    generated_at: status === 'ready' ? new Date().toISOString() : null,
  }))
  return {
    period_id:     'period-test',
    period_label:  'Ocak 2026',
    created_at:    new Date().toISOString(),
    items,
    total_size_kb: items.reduce((s, i) => s + (i.size_kb ?? 0), 0),
    is_complete:   items.every(i => i.status === 'ready'),
    download_url:  items.every(i => i.status === 'ready') ? 'https://example.com/pack.zip' : null,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// buildEmptyManifest
// ─────────────────────────────────────────────────────────────────────────────

describe('buildEmptyManifest', () => {

  it('returns a CfoPackManifest with the given period_id', () => {
    const m = buildEmptyManifest('2026-01', 'Ocak 2026')
    expect(m.period_id).toBe('2026-01')
  })

  it('returns a CfoPackManifest with the given period_label', () => {
    const m = buildEmptyManifest('2026-05', 'Mayıs 2026')
    expect(m.period_label).toBe('Mayıs 2026')
  })

  it('items array has exactly 10 entries (one per ReportType)', () => {
    const m = buildEmptyManifest('2026-01', 'Ocak 2026')
    expect(m.items).toHaveLength(10)
  })

  it('all items have status=pending', () => {
    const m = buildEmptyManifest('2026-01', 'Ocak 2026')
    expect(m.items.every(i => i.status === 'pending')).toBe(true)
  })

  it('all items have url=null', () => {
    const m = buildEmptyManifest('2026-01', 'Ocak 2026')
    expect(m.items.every(i => i.url === null)).toBe(true)
  })

  it('all items have size_kb=null', () => {
    const m = buildEmptyManifest('2026-01', 'Ocak 2026')
    expect(m.items.every(i => i.size_kb === null)).toBe(true)
  })

  it('all items have generated_at=null', () => {
    const m = buildEmptyManifest('2026-01', 'Ocak 2026')
    expect(m.items.every(i => i.generated_at === null)).toBe(true)
  })

  it('is_complete is false', () => {
    const m = buildEmptyManifest('2026-01', 'Ocak 2026')
    expect(m.is_complete).toBe(false)
  })

  it('download_url is null', () => {
    const m = buildEmptyManifest('2026-01', 'Ocak 2026')
    expect(m.download_url).toBeNull()
  })

  it('total_size_kb is 0', () => {
    const m = buildEmptyManifest('2026-01', 'Ocak 2026')
    expect(m.total_size_kb).toBe(0)
  })

  it('created_at is a valid ISO string', () => {
    const m = buildEmptyManifest('2026-01', 'Ocak 2026')
    expect(() => new Date(m.created_at)).not.toThrow()
    expect(new Date(m.created_at).toString()).not.toBe('Invalid Date')
  })

  it('every item has a non-empty title', () => {
    const m = buildEmptyManifest('2026-01', 'Ocak 2026')
    expect(m.items.every(i => typeof i.title === 'string' && i.title.length > 0)).toBe(true)
  })

  it('every item has a non-empty description', () => {
    const m = buildEmptyManifest('2026-01', 'Ocak 2026')
    expect(m.items.every(i => typeof i.description === 'string' && i.description.length > 0)).toBe(true)
  })

  it('item types match all 10 ReportTypes', () => {
    const m = buildEmptyManifest('2026-01', 'Ocak 2026')
    const types = m.items.map(i => i.type)
    for (const rt of ALL_REPORT_TYPES) {
      expect(types).toContain(rt)
    }
  })

  it('calling twice produces independent manifests', () => {
    const m1 = buildEmptyManifest('2026-01', 'Ocak 2026')
    const m2 = buildEmptyManifest('2026-02', 'Şubat 2026')
    expect(m1.period_id).not.toBe(m2.period_id)
    m1.items[0].status = 'ready'
    expect(m2.items[0].status).toBe('pending')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// computePackProgress
// ─────────────────────────────────────────────────────────────────────────────

describe('computePackProgress', () => {

  it('returns 0 when all items are pending', () => {
    const m = buildEmptyManifest('2026-01', 'Ocak 2026')
    expect(computePackProgress(m)).toBe(0)
  })

  it('returns 100 when all items are ready', () => {
    const m = makeManifestWithStatus(Array(10).fill('ready'))
    expect(computePackProgress(m)).toBe(100)
  })

  it('returns 50 when half the items are ready', () => {
    const statuses: ReportItem['status'][] = [
      'ready', 'ready', 'ready', 'ready', 'ready',
      'pending', 'pending', 'pending', 'pending', 'pending',
    ]
    const m = makeManifestWithStatus(statuses)
    expect(computePackProgress(m)).toBe(50)
  })

  it('returns 10 when 1 of 10 items is ready', () => {
    const statuses: ReportItem['status'][] = Array(10).fill('pending') as ReportItem['status'][]
    statuses[0] = 'ready'
    const m = makeManifestWithStatus(statuses)
    expect(computePackProgress(m)).toBe(10)
  })

  it('returns 0 for an empty items array', () => {
    const m = buildEmptyManifest('x', 'x')
    m.items = []
    expect(computePackProgress(m)).toBe(0)
  })

  it('counts only ready items — not generating', () => {
    const statuses: ReportItem['status'][] = [
      'ready', 'generating', 'generating', 'generating', 'generating',
      'generating', 'generating', 'generating', 'generating', 'generating',
    ]
    const m = makeManifestWithStatus(statuses)
    expect(computePackProgress(m)).toBe(10)
  })

  it('counts only ready items — not error', () => {
    const statuses: ReportItem['status'][] = [
      'error', 'error', 'error', 'error', 'error',
      'ready', 'ready', 'ready', 'ready', 'ready',
    ]
    const m = makeManifestWithStatus(statuses)
    expect(computePackProgress(m)).toBe(50)
  })

  it('result is always an integer', () => {
    const statuses: ReportItem['status'][] = Array(10).fill('pending') as ReportItem['status'][]
    statuses[0] = 'ready'
    statuses[1] = 'ready'
    statuses[2] = 'ready'
    const m = makeManifestWithStatus(statuses)
    const p = computePackProgress(m)
    expect(Number.isInteger(p)).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// isPackComplete
// ─────────────────────────────────────────────────────────────────────────────

describe('isPackComplete', () => {

  it('returns false when all items are pending', () => {
    const m = buildEmptyManifest('2026-01', 'Ocak 2026')
    expect(isPackComplete(m)).toBe(false)
  })

  it('returns true when all items are ready', () => {
    const m = makeManifestWithStatus(Array(10).fill('ready'))
    expect(isPackComplete(m)).toBe(true)
  })

  it('returns false when one item is still pending', () => {
    const statuses = Array(10).fill('ready') as ReportItem['status'][]
    statuses[9] = 'pending'
    const m = makeManifestWithStatus(statuses)
    expect(isPackComplete(m)).toBe(false)
  })

  it('returns false when one item is generating', () => {
    const statuses = Array(10).fill('ready') as ReportItem['status'][]
    statuses[0] = 'generating'
    const m = makeManifestWithStatus(statuses)
    expect(isPackComplete(m)).toBe(false)
  })

  it('returns false when one item has errored', () => {
    const statuses = Array(10).fill('ready') as ReportItem['status'][]
    statuses[5] = 'error'
    const m = makeManifestWithStatus(statuses)
    expect(isPackComplete(m)).toBe(false)
  })

  it('returns false for an empty items array', () => {
    const m = buildEmptyManifest('x', 'x')
    m.items = []
    expect(isPackComplete(m)).toBe(false)
  })

  it('is consistent with computePackProgress === 100', () => {
    const m = makeManifestWithStatus(Array(10).fill('ready'))
    expect(isPackComplete(m)).toBe(computePackProgress(m) === 100)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// getReportTitle
// ─────────────────────────────────────────────────────────────────────────────

describe('getReportTitle', () => {

  it.each(ALL_REPORT_TYPES)('returns a non-empty string for %s', (type) => {
    const title = getReportTitle(type)
    expect(typeof title).toBe('string')
    expect(title.length).toBeGreaterThan(0)
  })

  it('trial_balance title is "Mizan"', () => {
    expect(getReportTitle('trial_balance')).toBe('Mizan')
  })

  it('income_statement title is "Gelir Tablosu"', () => {
    expect(getReportTitle('income_statement')).toBe('Gelir Tablosu')
  })

  it('balance_sheet title is "Bilanço"', () => {
    expect(getReportTitle('balance_sheet')).toBe('Bilanço')
  })

  it('executive_summary title is "Yönetici Özeti"', () => {
    expect(getReportTitle('executive_summary')).toBe('Yönetici Özeti')
  })

  it('all 10 titles are distinct', () => {
    const titles = ALL_REPORT_TYPES.map(getReportTitle)
    const unique = new Set(titles)
    expect(unique.size).toBe(10)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// getReportDescription
// ─────────────────────────────────────────────────────────────────────────────

describe('getReportDescription', () => {

  it.each(ALL_REPORT_TYPES)('returns a non-empty string for %s', (type) => {
    const desc = getReportDescription(type)
    expect(typeof desc).toBe('string')
    expect(desc.length).toBeGreaterThan(0)
  })

  it('all 10 descriptions are distinct', () => {
    const descs = ALL_REPORT_TYPES.map(getReportDescription)
    const unique = new Set(descs)
    expect(unique.size).toBe(10)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// REPORT_ORDER
// ─────────────────────────────────────────────────────────────────────────────

describe('REPORT_ORDER', () => {

  it('has exactly 10 items', () => {
    expect(REPORT_ORDER).toHaveLength(10)
  })

  it('all items are valid ReportTypes', () => {
    for (const rt of REPORT_ORDER) {
      expect(ALL_REPORT_TYPES).toContain(rt)
    }
  })

  it('contains no duplicates', () => {
    const unique = new Set(REPORT_ORDER)
    expect(unique.size).toBe(REPORT_ORDER.length)
  })

  it('contains all 10 ReportTypes', () => {
    for (const rt of ALL_REPORT_TYPES) {
      expect(REPORT_ORDER).toContain(rt)
    }
  })

  it('trial_balance comes before executive_summary', () => {
    const tbIdx  = REPORT_ORDER.indexOf('trial_balance')
    const esIdx  = REPORT_ORDER.indexOf('executive_summary')
    expect(tbIdx).toBeLessThan(esIdx)
  })
})
