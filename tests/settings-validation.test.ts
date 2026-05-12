/**
 * FAZ 19 — Ayarlar: business-logic unit tests
 *
 * Tests the pure validation functions in settings/SettingsClient.tsx:
 *   1. validateInterestRate() — validates annual interest rate string (0–1000)
 *   2. validateBankForm()     — validates bank name + IBAN presence
 *
 * All functions are pure (no DB, no side effects).
 * Run with: npx vitest run tests/settings-validation.test.ts
 */

import { describe, it, expect } from 'vitest'
import {
  validateInterestRate,
  validateBankForm,
} from '../app/dashboard/settings/SettingsClient'

// ─────────────────────────────────────────────────────────────────────────────
// 1. validateInterestRate
// ─────────────────────────────────────────────────────────────────────────────

describe('validateInterestRate()', () => {
  it('returns null for a valid rate', () => {
    expect(validateInterestRate('45.50')).toBeNull()
  })

  it('returns null for rate of 0', () => {
    expect(validateInterestRate('0')).toBeNull()
  })

  it('returns null for rate of exactly 1000', () => {
    expect(validateInterestRate('1000')).toBeNull()
  })

  it('returns null for a fractional rate', () => {
    expect(validateInterestRate('12.75')).toBeNull()
  })

  it('returns null for rate of 1', () => {
    expect(validateInterestRate('1')).toBeNull()
  })

  it('returns error for empty string', () => {
    const err = validateInterestRate('')
    expect(err).not.toBeNull()
    expect(err).toContain('boş')
  })

  it('returns error for whitespace-only string', () => {
    const err = validateInterestRate('   ')
    expect(err).not.toBeNull()
    expect(err).toContain('boş')
  })

  it('returns error for non-numeric string', () => {
    const err = validateInterestRate('abc')
    expect(err).not.toBeNull()
  })

  it('returns error for negative rate', () => {
    const err = validateInterestRate('-1')
    expect(err).not.toBeNull()
  })

  it('returns error for rate above 1000', () => {
    const err = validateInterestRate('1001')
    expect(err).not.toBeNull()
  })

  it('returns error for Infinity (string)', () => {
    const err = validateInterestRate('Infinity')
    expect(err).not.toBeNull()
  })

  it('returns error for NaN input', () => {
    const err = validateInterestRate('NaN')
    expect(err).not.toBeNull()
  })

  it('returns null for small fractional rate (0.01)', () => {
    expect(validateInterestRate('0.01')).toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 2. validateBankForm
// ─────────────────────────────────────────────────────────────────────────────

describe('validateBankForm()', () => {
  it('returns null when both fields are valid', () => {
    expect(validateBankForm('Akbank', 'TR33 0006 1005 1978 6457 8413 26')).toBeNull()
  })

  it('returns error when bank name is empty', () => {
    const err = validateBankForm('', 'TR33 0006 1005 1978 6457 8413 26')
    expect(err).not.toBeNull()
    expect(err).toContain('Banka adı')
  })

  it('returns error when bank name is whitespace only', () => {
    const err = validateBankForm('   ', 'TR33 0006 1005 1978 6457 8413 26')
    expect(err).not.toBeNull()
    expect(err).toContain('Banka adı')
  })

  it('returns error when IBAN is empty', () => {
    const err = validateBankForm('Akbank', '')
    expect(err).not.toBeNull()
    expect(err).toContain('IBAN')
  })

  it('returns error when IBAN is whitespace only', () => {
    const err = validateBankForm('Akbank', '   ')
    expect(err).not.toBeNull()
    expect(err).toContain('IBAN')
  })

  it('returns bank name error first when both fields are empty', () => {
    // Bank name is checked first in the function
    const err = validateBankForm('', '')
    expect(err).toContain('Banka adı')
  })

  it('accepts minimal bank name (single character)', () => {
    expect(validateBankForm('A', 'TR1234')).toBeNull()
  })

  it('accepts IBAN with spaces (whitespace not trimmed by validator)', () => {
    // The validator only checks for completely blank strings via .trim()
    expect(validateBankForm('Garanti', 'TR12 3456 7890')).toBeNull()
  })
})
