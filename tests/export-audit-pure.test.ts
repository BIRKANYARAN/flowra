// tests/export-audit-pure.test.ts
// Pure-function unit tests for certified-export helpers and audit-chain helpers.
// No DB, no network, no Supabase — runs entirely in-process.

import { describe, it, expect } from 'vitest'
import {
  buildExportFilename,
  computeExportHash,
  classifyExportSensitivity,
  trancheOutstandingTry,
} from '../lib/services/export/certified-export.service'

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


describe('trancheOutstandingTry (derived partner-loan outstanding)', () => {
  it('= principal_try − total_repaid_try', () => {
    expect(trancheOutstandingTry({ principal_try: 100_000, total_repaid_try: 30_000 })).toBe(70_000)
  })
  it('is 0 when fully repaid, and never negative', () => {
    expect(trancheOutstandingTry({ principal_try: 50_000, total_repaid_try: 50_000 })).toBe(0)
    expect(trancheOutstandingTry({ principal_try: 50_000, total_repaid_try: 60_000 })).toBe(0)
  })
  it('treats missing fields as 0 (no NaN)', () => {
    expect(trancheOutstandingTry({})).toBe(0)
    expect(trancheOutstandingTry({ principal_try: 80_000 })).toBe(80_000)
  })
})
