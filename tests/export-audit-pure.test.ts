// tests/export-audit-pure.test.ts
// Pure-function unit tests for certified-export helpers and audit-chain helpers.
// No DB, no network, no Supabase — runs entirely in-process.

import { describe, it, expect } from 'vitest'
import {
  buildExportFilename,
  computeExportHash,
  classifyExportSensitivity,
} from '../lib/services/export/certified-export.service'
import {
  verifyChainLink,
  countChainBreaks,
  formatChainReport,
} from '../lib/services/audit-chain.service'

// ─────────────────────────────────────────────────────────────────────────────
// buildExportFilename
// ─────────────────────────────────────────────────────────────────────────────

describe('buildExportFilename', () => {
  it('returns a string starting with "flowra-"', () => {
    const name = buildExportFilename('balance-sheet', 'nisan-2025', 'pdf')
    expect(name.startsWith('flowra-')).toBe(true)
  })

  it('embeds the type in the filename', () => {
    const name = buildExportFilename('income-statement', 'mayis-2025', 'csv')
    expect(name).toContain('income-statement')
  })

  it('embeds the period in the filename', () => {
    const name = buildExportFilename('cash-flow', 'ocak-2026', 'json')
    expect(name).toContain('ocak-2026')
  })

  it('ends with the correct extension for pdf', () => {
    const name = buildExportFilename('balance-sheet', 'nisan-2025', 'pdf')
    expect(name.endsWith('.pdf')).toBe(true)
  })

  it('ends with the correct extension for csv', () => {
    const name = buildExportFilename('trial-balance', 'mart-2025', 'csv')
    expect(name.endsWith('.csv')).toBe(true)
  })

  it('ends with the correct extension for json', () => {
    const name = buildExportFilename('general-ledger', 'subat-2025', 'json')
    expect(name.endsWith('.json')).toBe(true)
  })

  it('contains an 8-digit date stamp', () => {
    const name = buildExportFilename('balance-sheet', 'nisan-2025', 'pdf')
    // pattern: flowra-<type>-<period>-YYYYMMDD.ext
    expect(/\d{8}/.test(name)).toBe(true)
  })

  it('date stamp has exactly 8 digits', () => {
    const name = buildExportFilename('kpi', 'aralik-2025', 'json')
    const match = name.match(/(\d{8})/)
    expect(match).not.toBeNull()
    expect(match![1]).toHaveLength(8)
  })

  it('produces consistent output for the same inputs on the same day', () => {
    const a = buildExportFilename('balance-sheet', 'nisan-2025', 'pdf')
    const b = buildExportFilename('balance-sheet', 'nisan-2025', 'pdf')
    expect(a).toBe(b)
  })

  it('produces different names for different types', () => {
    const a = buildExportFilename('balance-sheet', 'nisan-2025', 'pdf')
    const b = buildExportFilename('income-statement', 'nisan-2025', 'pdf')
    expect(a).not.toBe(b)
  })

  it('produces different names for different periods', () => {
    const a = buildExportFilename('balance-sheet', 'nisan-2025', 'pdf')
    const b = buildExportFilename('balance-sheet', 'mayis-2025', 'pdf')
    expect(a).not.toBe(b)
  })

  it('produces different names for different formats', () => {
    const a = buildExportFilename('balance-sheet', 'nisan-2025', 'pdf')
    const b = buildExportFilename('balance-sheet', 'nisan-2025', 'csv')
    expect(a).not.toBe(b)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// computeExportHash
// ─────────────────────────────────────────────────────────────────────────────

describe('computeExportHash', () => {
  it('returns a string starting with "h_"', () => {
    const hash = computeExportHash({ foo: 'bar' })
    expect(hash.startsWith('h_')).toBe(true)
  })

  it('is deterministic — same input always produces the same hash', () => {
    const data = { revenue: 1000, expenses: 500 }
    expect(computeExportHash(data)).toBe(computeExportHash(data))
  })

  it('different data produces different hash', () => {
    const a = computeExportHash({ value: 1 })
    const b = computeExportHash({ value: 2 })
    expect(a).not.toBe(b)
  })

  it('empty object produces a hash', () => {
    const hash = computeExportHash({})
    expect(hash).toBeTruthy()
    expect(hash.startsWith('h_')).toBe(true)
  })

  it('hash hex portion is 64 characters (256-bit SHA-256)', () => {
    const hash = computeExportHash({ test: true })
    // Remove the "h_" prefix and check hex length
    expect(hash.slice(2)).toHaveLength(64)
  })

  it('hash is lowercase hex after the prefix', () => {
    const hash = computeExportHash({ x: 99 })
    expect(/^h_[0-9a-f]{64}$/.test(hash)).toBe(true)
  })

  it('nested objects hash consistently', () => {
    const data = { a: { b: { c: 42 } } }
    expect(computeExportHash(data)).toBe(computeExportHash(data))
  })

  it('key order in input affects the hash (JSON.stringify is order-sensitive)', () => {
    const a = computeExportHash({ x: 1, y: 2 })
    const b = computeExportHash({ y: 2, x: 1 })
    // JSON.stringify preserves insertion order, so these differ
    expect(a).not.toBe(b)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// classifyExportSensitivity
// ─────────────────────────────────────────────────────────────────────────────

describe('classifyExportSensitivity', () => {
  it('balance-sheet → confidential', () => {
    expect(classifyExportSensitivity('balance-sheet')).toBe('confidential')
  })

  it('income-statement → confidential', () => {
    expect(classifyExportSensitivity('income-statement')).toBe('confidential')
  })

  it('cash-flow → confidential', () => {
    expect(classifyExportSensitivity('cash-flow')).toBe('confidential')
  })

  it('trial-balance → confidential', () => {
    expect(classifyExportSensitivity('trial-balance')).toBe('confidential')
  })

  it('general-ledger → confidential', () => {
    expect(classifyExportSensitivity('general-ledger')).toBe('confidential')
  })

  it('executive-summary → internal', () => {
    expect(classifyExportSensitivity('executive-summary')).toBe('internal')
  })

  it('kpi → internal', () => {
    expect(classifyExportSensitivity('kpi')).toBe('internal')
  })

  it('proforma → public', () => {
    expect(classifyExportSensitivity('proforma')).toBe('public')
  })

  it('catalog → public', () => {
    expect(classifyExportSensitivity('catalog')).toBe('public')
  })

  it('unknown type → public', () => {
    expect(classifyExportSensitivity('random-unknown-type')).toBe('public')
  })

  it('case-insensitive: BALANCE-SHEET → confidential', () => {
    expect(classifyExportSensitivity('BALANCE-SHEET')).toBe('confidential')
  })

  it('case-insensitive: KPI → internal', () => {
    expect(classifyExportSensitivity('KPI')).toBe('internal')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// verifyChainLink
// ─────────────────────────────────────────────────────────────────────────────

describe('verifyChainLink', () => {
  it('genesis entry (prevEntry=null, prev_hash=null) → true', () => {
    expect(verifyChainLink({ content_hash: 'abc', prev_hash: null }, null)).toBe(true)
  })

  it('genesis entry with non-null prev_hash → false', () => {
    expect(verifyChainLink({ content_hash: 'abc', prev_hash: 'xyz' }, null)).toBe(false)
  })

  it('valid continuation: prev content_hash matches entry prev_hash → true', () => {
    const prev = { content_hash: 'hash1' }
    const entry = { content_hash: 'hash2', prev_hash: 'hash1' }
    expect(verifyChainLink(entry, prev)).toBe(true)
  })

  it('broken link: prev content_hash does not match entry prev_hash → false', () => {
    const prev = { content_hash: 'hash1' }
    const entry = { content_hash: 'hash2', prev_hash: 'differenthash' }
    expect(verifyChainLink(entry, prev)).toBe(false)
  })

  it('broken link: entry prev_hash is null but prevEntry exists → false', () => {
    const prev = { content_hash: 'hash1' }
    const entry = { content_hash: 'hash2', prev_hash: null }
    expect(verifyChainLink(entry, prev)).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// countChainBreaks
// ─────────────────────────────────────────────────────────────────────────────

describe('countChainBreaks', () => {
  it('empty sequence → 0 breaks', () => {
    expect(countChainBreaks([])).toBe(0)
  })

  it('single genesis entry → 0 breaks', () => {
    expect(countChainBreaks([{ content_hash: 'h1', prev_hash: null }])).toBe(0)
  })

  it('two-entry intact chain → 0 breaks', () => {
    const entries = [
      { content_hash: 'h1', prev_hash: null },
      { content_hash: 'h2', prev_hash: 'h1' },
    ]
    expect(countChainBreaks(entries)).toBe(0)
  })

  it('three-entry intact chain → 0 breaks', () => {
    const entries = [
      { content_hash: 'h1', prev_hash: null },
      { content_hash: 'h2', prev_hash: 'h1' },
      { content_hash: 'h3', prev_hash: 'h2' },
    ]
    expect(countChainBreaks(entries)).toBe(0)
  })

  it('one tampered link → 1 break', () => {
    const entries = [
      { content_hash: 'h1', prev_hash: null },
      { content_hash: 'h2', prev_hash: 'WRONG' },   // broken
      { content_hash: 'h3', prev_hash: 'h2' },
    ]
    expect(countChainBreaks(entries)).toBe(1)
  })

  it('two tampered links → 2 breaks', () => {
    const entries = [
      { content_hash: 'h1', prev_hash: null },
      { content_hash: 'h2', prev_hash: 'WRONG1' },  // broken
      { content_hash: 'h3', prev_hash: 'WRONG2' },  // broken
    ]
    expect(countChainBreaks(entries)).toBe(2)
  })

  it('genesis entry has non-null prev_hash → 1 break', () => {
    const entries = [
      { content_hash: 'h1', prev_hash: 'orphaned' }, // broken genesis
    ]
    expect(countChainBreaks(entries)).toBe(1)
  })

  it('all entries broken → count equals length', () => {
    const entries = [
      { content_hash: 'h1', prev_hash: 'bad0' },
      { content_hash: 'h2', prev_hash: 'bad1' },
      { content_hash: 'h3', prev_hash: 'bad2' },
    ]
    expect(countChainBreaks(entries)).toBe(3)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// formatChainReport
// ─────────────────────────────────────────────────────────────────────────────

describe('formatChainReport', () => {
  it('returns a non-empty string', () => {
    const report = formatChainReport(100, 0, '2025-01-01', '2025-01-31')
    expect(typeof report).toBe('string')
    expect(report.length).toBeGreaterThan(0)
  })

  it('intact chain mentions kayıt count', () => {
    const report = formatChainReport(50, 0, '2025-01-01', '2025-01-31')
    expect(report).toContain('50')
  })

  it('intact chain contains a positive Turkish affirmation', () => {
    const report = formatChainReport(50, 0, '2025-01-01', '2025-01-31')
    // Should mention "bütün" or "doğrulandı"
    expect(report.toLowerCase()).toMatch(/bütün|doğrulandı/)
  })

  it('broken chain mentions break count', () => {
    const report = formatChainReport(100, 3, '2025-01-01', '2025-01-31')
    expect(report).toContain('3')
  })

  it('broken chain contains Turkish warning keyword', () => {
    const report = formatChainReport(100, 3, '2025-01-01', '2025-01-31')
    expect(report.toLowerCase()).toMatch(/kırık|tespit|değiştirilmiş/)
  })

  it('report includes the start date', () => {
    const report = formatChainReport(10, 0, '2025-04-01', '2025-04-30')
    expect(report).toContain('2025-04-01')
  })

  it('report includes the end date', () => {
    const report = formatChainReport(10, 0, '2025-04-01', '2025-04-30')
    expect(report).toContain('2025-04-30')
  })

  it('intact report differs from broken report', () => {
    const ok  = formatChainReport(10, 0, '2025-01-01', '2025-01-31')
    const bad = formatChainReport(10, 2, '2025-01-01', '2025-01-31')
    expect(ok).not.toBe(bad)
  })

  it('zero total entries still returns a string', () => {
    const report = formatChainReport(0, 0, '2025-01-01', '2025-01-31')
    expect(typeof report).toBe('string')
  })
})
