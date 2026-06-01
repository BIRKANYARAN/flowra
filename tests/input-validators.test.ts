// Node-env tests for two pure validators that were untested:
//   - validateImageBytes (lib/storage.ts) — upload magic-byte / size / SVG security
//   - validatePeriod    (lib/services/finance-rules.ts) — period date sanity
import { describe, it, expect } from 'vitest'
import { validateImageBytes, StorageError } from '@/lib/storage'
import { validatePeriod } from '@/lib/services/finance-rules'

function bufOf(bytes: number[], totalLen = bytes.length): ArrayBuffer {
  const u = new Uint8Array(totalLen)
  u.set(bytes)
  return u.buffer
}

describe('validateImageBytes (magic-byte enforcement)', () => {
  it('accepts a PNG signature', () => {
    expect(() => validateImageBytes(bufOf([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]), 'image/png')).not.toThrow()
  })
  it('accepts a JPEG signature', () => {
    expect(() => validateImageBytes(bufOf([0xff, 0xd8, 0xff, 0xe0]), 'image/jpeg')).not.toThrow()
  })
  it('rejects bytes that match no known image signature', () => {
    try { validateImageBytes(bufOf([0x00, 0x01, 0x02, 0x03]), 'image/png'); throw new Error('should have thrown') }
    catch (e) { expect(e).toBeInstanceOf(StorageError); expect((e as StorageError).code).toBe('INVALID_FILE_TYPE') }
  })
  it('rejects a file larger than the 2MB cap', () => {
    try { validateImageBytes(new ArrayBuffer(2 * 1024 * 1024 + 1), 'image/png'); throw new Error('should have thrown') }
    catch (e) { expect((e as StorageError).code).toBe('FILE_TOO_LARGE') }
  })
  it('accepts valid SVG text but rejects non-SVG text claiming to be SVG', () => {
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>').buffer
    expect(() => validateImageBytes(svg, 'image/svg+xml')).not.toThrow()
    const notSvg = new TextEncoder().encode('<html></html>').buffer
    try { validateImageBytes(notSvg, 'image/svg+xml'); throw new Error('should have thrown') }
    catch (e) { expect((e as StorageError).code).toBe('INVALID_SVG') }
  })
})

describe('validatePeriod', () => {
  it('returns the period unchanged when valid', () => {
    const p = { from: '2026-01-01', to: '2026-03-31' }
    expect(validatePeriod(p)).toBe(p)
  })
  it('throws on a malformed date', () => {
    expect(() => validatePeriod({ from: '2026-1-1', to: '2026-03-31' })).toThrow(/YYYY-MM-DD/)
  })
  it('throws when from is after to', () => {
    expect(() => validatePeriod({ from: '2026-04-01', to: '2026-03-31' })).toThrow(/from must be <= /)
  })
})
