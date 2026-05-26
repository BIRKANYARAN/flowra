import { describe, it, expect } from 'vitest'
import {
  CFO_PACK_MANIFEST,
  getRequiredReports,
  getReportById,
  getReportsByCategory,
} from '@/lib/reports/cfo-pack-manifest'

describe('cfo-pack-manifest', () => {

  it('getRequiredReports returns only required=true entries', () => {
    const required = getRequiredReports()
    expect(required.length).toBeGreaterThan(0)
    expect(required.every(r => r.required === true)).toBe(true)
  })

  it('getReportById returns the correct report', () => {
    const report = getReportById('trial_balance')
    expect(report).toBeDefined()
    expect(report?.id).toBe('trial_balance')
    expect(report?.title).toBe('Mizan')
    expect(report?.category).toBe('accounting')
  })

  it('getReportById returns undefined for an unknown id', () => {
    const report = getReportById('nonexistent_report_xyz')
    expect(report).toBeUndefined()
  })

  it('getReportsByCategory filters correctly by category', () => {
    const financialStatements = getReportsByCategory('financial_statement')
    expect(financialStatements.length).toBeGreaterThan(0)
    expect(financialStatements.every(r => r.category === 'financial_statement')).toBe(true)

    // Sanity: income_statement and balance_sheet should be in financial_statement
    const ids = financialStatements.map(r => r.id)
    expect(ids).toContain('income_statement')
    expect(ids).toContain('balance_sheet')
  })

  it('all manifest entries have a non-empty endpoint', () => {
    for (const report of CFO_PACK_MANIFEST) {
      expect(report.endpoint).toBeTruthy()
      expect(report.endpoint.trim().length).toBeGreaterThan(0)
    }
  })

  it('manifest has at least 8 entries', () => {
    expect(CFO_PACK_MANIFEST.length).toBeGreaterThanOrEqual(8)
  })

})
