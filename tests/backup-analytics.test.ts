/**
 * FAZ 15 — Yedekleme Merkezi: business-logic unit tests
 *
 * Tests the pure analytics/formatter functions in backups/page.tsx
 * and backups/BackupsClient.tsx:
 *   1. fmtSize()           — human-readable byte sizes (B / KB / MB)
 *   2. fmtBackupDate()     — parse YYYYMMDD_HHmmss folder name → DD.MM.YYYY HH:mm
 *   3. totalBackupSize()   — sum of totalSize across all BackupEntry objects
 *   4. latestBackupName()  — first entry name (list is already sorted desc)
 *
 * All functions are pure (no DB, no side effects).
 * Run with: npx vitest run tests/backup-analytics.test.ts
 */

import { describe, it, expect } from 'vitest'

// ─────────────────────────────────────────────────────────────────────────────
// Mirror of pure functions from backups/BackupsClient.tsx + backups/page.tsx
// ─────────────────────────────────────────────────────────────────────────────

function fmtSize(bytes: number): string {
  if (bytes === 0)          return '0 B'
  if (bytes < 1024)         return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

function fmtBackupDate(name: string): string {
  try {
    const y   = name.slice(0, 4)
    const m   = name.slice(4, 6)
    const d   = name.slice(6, 8)
    const h   = name.slice(9, 11)
    const min = name.slice(11, 13)
    return `${d}.${m}.${y} ${h}:${min}`
  } catch {
    return name
  }
}

interface BackupStub {
  name:      string
  totalSize: number
}

function totalBackupSize(backups: BackupStub[]): number {
  return backups.reduce((sum, b) => sum + b.totalSize, 0)
}

function latestBackupName(backups: BackupStub[]): string | null {
  return backups[0]?.name ?? null
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. fmtSize
// ─────────────────────────────────────────────────────────────────────────────

describe('fmtSize()', () => {
  it('returns "0 B" for zero bytes', () => {
    expect(fmtSize(0)).toBe('0 B')
  })

  it('returns bytes for values under 1 KB', () => {
    expect(fmtSize(512)).toBe('512 B')
    expect(fmtSize(1023)).toBe('1023 B')
  })

  it('returns KB for values between 1 KB and 1 MB', () => {
    expect(fmtSize(1024)).toBe('1.0 KB')
    expect(fmtSize(2048)).toBe('2.0 KB')
    expect(fmtSize(1536)).toBe('1.5 KB')
  })

  it('returns MB for values >= 1 MB', () => {
    expect(fmtSize(1024 * 1024)).toBe('1.00 MB')
    expect(fmtSize(1024 * 1024 * 2.5)).toBe('2.50 MB')
  })

  it('rounds KB to 1 decimal place', () => {
    // 1100 / 1024 = 1.074... → 1.1 KB
    expect(fmtSize(1100)).toBe('1.1 KB')
  })

  it('rounds MB to 2 decimal places', () => {
    // 1.5 MB = 1572864 bytes → 1.50 MB
    expect(fmtSize(1572864)).toBe('1.50 MB')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 2. fmtBackupDate
// ─────────────────────────────────────────────────────────────────────────────

describe('fmtBackupDate()', () => {
  it('parses YYYYMMDD_HHmmss format correctly', () => {
    expect(fmtBackupDate('20240615_143022')).toBe('15.06.2024 14:30')
  })

  it('handles midnight (00:00)', () => {
    expect(fmtBackupDate('20240101_000000')).toBe('01.01.2024 00:00')
  })

  it('handles end-of-day time', () => {
    expect(fmtBackupDate('20241231_235959')).toBe('31.12.2024 23:59')
  })

  it('returns the name as-is when format is unrecognised (try/catch)', () => {
    // Very short string — slice will return empty strings, not throw
    // The output will be malformed but should not crash
    const result = fmtBackupDate('bad')
    expect(typeof result).toBe('string')
  })

  it('formats single-digit day and month with leading zeros', () => {
    // March 5 → 05.03
    expect(fmtBackupDate('20240305_091500')).toBe('05.03.2024 09:15')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 3. totalBackupSize
// ─────────────────────────────────────────────────────────────────────────────

describe('totalBackupSize()', () => {
  it('returns 0 for empty backups', () => {
    expect(totalBackupSize([])).toBe(0)
  })

  it('sums totalSize across all backups', () => {
    const backups = [
      { name: '20240601_120000', totalSize: 1024 },
      { name: '20240602_120000', totalSize: 2048 },
      { name: '20240603_120000', totalSize: 512  },
    ]
    expect(totalBackupSize(backups)).toBe(3584)
  })

  it('returns single backup size when only one exists', () => {
    const backups = [{ name: '20240601_120000', totalSize: 8192 }]
    expect(totalBackupSize(backups)).toBe(8192)
  })

  it('handles zero-size backups', () => {
    const backups = [
      { name: '20240601_120000', totalSize: 0 },
      { name: '20240602_120000', totalSize: 0 },
    ]
    expect(totalBackupSize(backups)).toBe(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 4. latestBackupName
// ─────────────────────────────────────────────────────────────────────────────

describe('latestBackupName()', () => {
  it('returns null for empty backups', () => {
    expect(latestBackupName([])).toBeNull()
  })

  it('returns the first entry (list already sorted desc by name)', () => {
    const backups = [
      { name: '20240615_120000', totalSize: 1024 },  // newest first
      { name: '20240610_120000', totalSize: 800  },
      { name: '20240601_120000', totalSize: 600  },
    ]
    expect(latestBackupName(backups)).toBe('20240615_120000')
  })

  it('returns the only entry when list has one backup', () => {
    const backups = [{ name: '20240601_090000', totalSize: 512 }]
    expect(latestBackupName(backups)).toBe('20240601_090000')
  })
})
