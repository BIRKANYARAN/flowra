import { describe, it, expect } from 'vitest'
import {
  DocumentService,
  AUDIT_REQUIRED_TYPES,
} from '@/lib/services/documents/document.service'
import type { DocumentType } from '@/lib/services/documents/document.service'

// ── Helpers ───────────────────────────────────────────────────────────────────

type DocRow = {
  document_type: DocumentType
  file_size_bytes: number | null
  is_audit_required: boolean
  is_verified: boolean
  period_year: number | null
  period_month: number | null
}

function makeRow(overrides: Partial<DocRow> & { document_type: DocumentType }): DocRow {
  return {
    file_size_bytes:   null,
    is_audit_required: false,
    is_verified:       false,
    period_year:       2025,
    period_month:      1,
    ...overrides,
  }
}

// ── 1. getStoragePath generates correct path format ───────────────────────────

describe('getStoragePath', () => {
  it('generates correct path format: companyId/documents/year/month/uuid-filename', () => {
    const companyId    = 'abc123'
    const documentDate = '2025-03-15'
    const fileName     = 'invoice.pdf'
    const path         = DocumentService.getStoragePath(companyId, documentDate, fileName)

    expect(path).toMatch(/^abc123\/documents\/2025\/03\/[0-9a-f-]{36}-invoice\.pdf$/)
  })

  it('pads month with leading zero', () => {
    const path = DocumentService.getStoragePath('co1', '2024-07-01', 'doc.pdf')
    expect(path).toContain('/2024/07/')
  })

  it('generates unique paths for same inputs (UUID differs)', () => {
    const p1 = DocumentService.getStoragePath('co1', '2025-01-01', 'file.pdf')
    const p2 = DocumentService.getStoragePath('co1', '2025-01-01', 'file.pdf')
    expect(p1).not.toBe(p2)
  })
})

// ── 2. audit_readiness_pct = (verified / required) × 100 ─────────────────────

describe('DocumentSummary.audit_readiness_pct', () => {
  it('calculates correct percentage from verified/required ratio', () => {
    const rows: DocRow[] = [
      makeRow({ document_type: 'bank_statement',  is_audit_required: true, is_verified: true  }),
      makeRow({ document_type: 'tax_declaration', is_audit_required: true, is_verified: false }),
    ]
    const summary = DocumentService.computeSummary(rows)
    expect(summary.audit_readiness_pct).toBe(50)
  })

  // ── 3. audit_readiness_pct = 100 when all required docs verified ────────────
  it('returns 100 when all required documents are verified', () => {
    const rows: DocRow[] = [
      makeRow({ document_type: 'bank_statement',  is_audit_required: true, is_verified: true }),
      makeRow({ document_type: 'tax_declaration', is_audit_required: true, is_verified: true }),
    ]
    const summary = DocumentService.computeSummary(rows)
    expect(summary.audit_readiness_pct).toBe(100)
  })

  // ── 4. audit_readiness_pct = 0 when none verified ──────────────────────────
  it('returns 0 when none of the required documents are verified', () => {
    const rows: DocRow[] = [
      makeRow({ document_type: 'bank_statement',  is_audit_required: true, is_verified: false }),
      makeRow({ document_type: 'tax_declaration', is_audit_required: true, is_verified: false }),
    ]
    const summary = DocumentService.computeSummary(rows)
    expect(summary.audit_readiness_pct).toBe(0)
  })

  it('returns 0 when there are no audit-required documents', () => {
    const rows: DocRow[] = [
      makeRow({ document_type: 'invoice', is_audit_required: false, is_verified: false }),
    ]
    const summary = DocumentService.computeSummary(rows)
    expect(summary.audit_readiness_pct).toBe(0)
  })
})

// ── 5. by_type counts correctly ───────────────────────────────────────────────

describe('by_type', () => {
  it('counts each document type correctly', () => {
    const rows: DocRow[] = [
      makeRow({ document_type: 'invoice' }),
      makeRow({ document_type: 'invoice' }),
      makeRow({ document_type: 'contract' }),
      makeRow({ document_type: 'bank_statement' }),
    ]
    const { by_type } = DocumentService.computeSummary(rows)
    expect(by_type.invoice).toBe(2)
    expect(by_type.contract).toBe(1)
    expect(by_type.bank_statement).toBe(1)
    expect(by_type.tax_declaration).toBe(0)
  })

  it('initializes all document types with 0', () => {
    const { by_type } = DocumentService.computeSummary([])
    expect(by_type.invoice).toBe(0)
    expect(by_type.other).toBe(0)
  })
})

// ── 6. by_period groups by YYYY-MM correctly ─────────────────────────────────

describe('by_period', () => {
  it('groups documents by YYYY-MM period key', () => {
    const rows: DocRow[] = [
      makeRow({ document_type: 'invoice', period_year: 2025, period_month: 1 }),
      makeRow({ document_type: 'invoice', period_year: 2025, period_month: 1 }),
      makeRow({ document_type: 'contract', period_year: 2025, period_month: 3 }),
      makeRow({ document_type: 'bank_statement', period_year: 2024, period_month: 12 }),
    ]
    const { by_period } = DocumentService.computeSummary(rows)
    expect(by_period['2025-01']).toBe(2)
    expect(by_period['2025-03']).toBe(1)
    expect(by_period['2024-12']).toBe(1)
  })

  it('pads month to 2 digits in period key', () => {
    const rows: DocRow[] = [
      makeRow({ document_type: 'invoice', period_year: 2025, period_month: 5 }),
    ]
    const { by_period } = DocumentService.computeSummary(rows)
    expect(by_period['2025-05']).toBe(1)
    expect(by_period['2025-5']).toBeUndefined()
  })

  it('skips rows with null period_year or period_month', () => {
    const rows: DocRow[] = [
      makeRow({ document_type: 'invoice', period_year: null, period_month: null }),
    ]
    const { by_period } = DocumentService.computeSummary(rows)
    expect(Object.keys(by_period)).toHaveLength(0)
  })
})

// ── 7. missing_audit_docs includes types not yet uploaded ─────────────────────

describe('missing_audit_docs', () => {
  it('includes AUDIT_REQUIRED_TYPES that are not present in the document list', () => {
    const rows: DocRow[] = [
      makeRow({ document_type: 'bank_statement' }),
      // no tax_declaration
    ]
    const { missing_audit_docs } = DocumentService.computeSummary(rows)
    const missingTypes = missing_audit_docs.map(m => m.document_type)
    expect(missingTypes).toContain('tax_declaration')
    expect(missingTypes).not.toContain('bank_statement')
  })

  // ── 8. missing_audit_docs empty when all AUDIT_REQUIRED_TYPES present ────────
  it('returns empty array when all AUDIT_REQUIRED_TYPES are present', () => {
    const rows: DocRow[] = AUDIT_REQUIRED_TYPES.map(t =>
      makeRow({ document_type: t }),
    )
    const { missing_audit_docs } = DocumentService.computeSummary(rows)
    expect(missing_audit_docs).toHaveLength(0)
  })

  it('returns all AUDIT_REQUIRED_TYPES as missing when no documents exist', () => {
    const { missing_audit_docs } = DocumentService.computeSummary([])
    const missingTypes = missing_audit_docs.map(m => m.document_type)
    for (const t of AUDIT_REQUIRED_TYPES) {
      expect(missingTypes).toContain(t)
    }
  })
})

// ── 9. total_size_bytes sums correctly ────────────────────────────────────────

describe('total_size_bytes', () => {
  it('sums file_size_bytes across all documents', () => {
    const rows: DocRow[] = [
      makeRow({ document_type: 'invoice',  file_size_bytes: 1024 }),
      makeRow({ document_type: 'contract', file_size_bytes: 2048 }),
      makeRow({ document_type: 'other',    file_size_bytes: 512  }),
    ]
    const { total_size_bytes } = DocumentService.computeSummary(rows)
    expect(total_size_bytes).toBe(3584)
  })

  it('treats null file_size_bytes as 0', () => {
    const rows: DocRow[] = [
      makeRow({ document_type: 'invoice',  file_size_bytes: 1000 }),
      makeRow({ document_type: 'contract', file_size_bytes: null }),
    ]
    const { total_size_bytes } = DocumentService.computeSummary(rows)
    expect(total_size_bytes).toBe(1000)
  })

  it('returns 0 when all sizes are null', () => {
    const rows: DocRow[] = [
      makeRow({ document_type: 'invoice', file_size_bytes: null }),
    ]
    const { total_size_bytes } = DocumentService.computeSummary(rows)
    expect(total_size_bytes).toBe(0)
  })
})

// ── 10. Soft-deleted documents excluded from summary (computeSummary) ─────────

describe('soft delete exclusion', () => {
  it('computeSummary only includes rows passed in (caller must pre-filter deleted_at)', () => {
    // The service's getSummary() runs IS NULL deleted_at in DB.
    // computeSummary() is a pure function — it operates on whatever rows are given.
    // Here we verify that if only non-deleted rows are passed, summary is correct.
    const activeRows: DocRow[] = [
      makeRow({ document_type: 'invoice',  is_audit_required: true, is_verified: true,  file_size_bytes: 500 }),
      makeRow({ document_type: 'contract', is_audit_required: false, is_verified: false, file_size_bytes: 300 }),
    ]
    const summary = DocumentService.computeSummary(activeRows)
    expect(summary.total_documents).toBe(2)
    expect(summary.total_size_bytes).toBe(800)
    expect(summary.audit_required_total).toBe(1)
    expect(summary.audit_required_verified).toBe(1)
  })

  it('returns zero totals when called with an empty array (simulates all docs soft-deleted)', () => {
    const summary = DocumentService.computeSummary([])
    expect(summary.total_documents).toBe(0)
    expect(summary.total_size_bytes).toBe(0)
    expect(summary.audit_required_total).toBe(0)
    expect(summary.audit_required_verified).toBe(0)
    expect(summary.audit_readiness_pct).toBe(0)
  })
})

// ── 11. DOCUMENT_TYPE_LABELS — all types have Turkish labels ─────────────────

import {
  DOCUMENT_TYPE_LABELS,
  ALL_DOCUMENT_TYPES,
} from '@/lib/services/documents/document.service'

describe('DOCUMENT_TYPE_LABELS', () => {
  it('has a label for every document type in ALL_DOCUMENT_TYPES', () => {
    for (const t of ALL_DOCUMENT_TYPES) {
      expect(DOCUMENT_TYPE_LABELS[t]).toBeDefined()
      expect(typeof DOCUMENT_TYPE_LABELS[t]).toBe('string')
      expect(DOCUMENT_TYPE_LABELS[t].length).toBeGreaterThan(0)
    }
  })

  it('invoice label is "Fatura"', () => {
    expect(DOCUMENT_TYPE_LABELS.invoice).toBe('Fatura')
  })

  it('contract label is "Sözleşme"', () => {
    expect(DOCUMENT_TYPE_LABELS.contract).toBe('Sözleşme')
  })

  it('bank_statement label is "Banka Ekstresi"', () => {
    expect(DOCUMENT_TYPE_LABELS.bank_statement).toBe('Banka Ekstresi')
  })

  it('tax_declaration label is "Vergi Beyannamesi"', () => {
    expect(DOCUMENT_TYPE_LABELS.tax_declaration).toBe('Vergi Beyannamesi')
  })

  it('board_resolution label is defined and non-empty', () => {
    expect(DOCUMENT_TYPE_LABELS.board_resolution.length).toBeGreaterThan(0)
  })

  it('other label is "Diğer"', () => {
    expect(DOCUMENT_TYPE_LABELS.other).toBe('Diğer')
  })
})

// ── 12. ALL_DOCUMENT_TYPES — completeness ────────────────────────────────────

describe('ALL_DOCUMENT_TYPES', () => {
  it('contains exactly 8 types', () => {
    expect(ALL_DOCUMENT_TYPES).toHaveLength(8)
  })

  it('includes invoice', () => expect(ALL_DOCUMENT_TYPES).toContain('invoice'))
  it('includes contract', () => expect(ALL_DOCUMENT_TYPES).toContain('contract'))
  it('includes bank_statement', () => expect(ALL_DOCUMENT_TYPES).toContain('bank_statement'))
  it('includes board_resolution', () => expect(ALL_DOCUMENT_TYPES).toContain('board_resolution'))
  it('includes tax_declaration', () => expect(ALL_DOCUMENT_TYPES).toContain('tax_declaration'))
  it('includes proof_of_payment', () => expect(ALL_DOCUMENT_TYPES).toContain('proof_of_payment'))
  it('includes audit_report', () => expect(ALL_DOCUMENT_TYPES).toContain('audit_report'))
  it('includes other', () => expect(ALL_DOCUMENT_TYPES).toContain('other'))

  it('has no duplicates', () => {
    const unique = new Set(ALL_DOCUMENT_TYPES)
    expect(unique.size).toBe(ALL_DOCUMENT_TYPES.length)
  })
})

// ── 13. AUDIT_REQUIRED_TYPES — subset of ALL_DOCUMENT_TYPES ─────────────────

describe('AUDIT_REQUIRED_TYPES', () => {
  it('is a subset of ALL_DOCUMENT_TYPES', () => {
    for (const t of AUDIT_REQUIRED_TYPES) {
      expect(ALL_DOCUMENT_TYPES).toContain(t)
    }
  })

  it('contains bank_statement', () => {
    expect(AUDIT_REQUIRED_TYPES).toContain('bank_statement')
  })

  it('contains tax_declaration', () => {
    expect(AUDIT_REQUIRED_TYPES).toContain('tax_declaration')
  })

  it('has at least 2 required types', () => {
    expect(AUDIT_REQUIRED_TYPES.length).toBeGreaterThanOrEqual(2)
  })
})

// ── 14. getStoragePath — extended edge cases ──────────────────────────────────

describe('getStoragePath — extended', () => {
  it('uses the exact companyId as path prefix', () => {
    const path = DocumentService.getStoragePath('my-company-456', '2025-01-01', 'file.pdf')
    expect(path.startsWith('my-company-456/')).toBe(true)
  })

  it('includes the filename at the end', () => {
    const path = DocumentService.getStoragePath('co1', '2025-06-15', 'contract.docx')
    expect(path.endsWith('-contract.docx')).toBe(true)
  })

  it('segment count is 5 (company/documents/year/month/uuid-name)', () => {
    const path = DocumentService.getStoragePath('co1', '2025-06-15', 'x.pdf')
    // co1/documents/2025/06/<uuid>-x.pdf → split by / → 5 parts
    expect(path.split('/').length).toBe(5)
  })

  it('contains "documents" as second path segment', () => {
    const path = DocumentService.getStoragePath('co1', '2025-06-15', 'x.pdf')
    expect(path.split('/')[1]).toBe('documents')
  })

  it('year segment matches document date year', () => {
    const path = DocumentService.getStoragePath('co1', '2023-11-01', 'x.pdf')
    expect(path.split('/')[2]).toBe('2023')
  })

  it('month segment is zero-padded (single digit month)', () => {
    const path = DocumentService.getStoragePath('co1', '2025-03-15', 'x.pdf')
    expect(path.split('/')[3]).toBe('03')
  })

  it('month segment for double-digit month is not padded redundantly', () => {
    const path = DocumentService.getStoragePath('co1', '2025-12-01', 'x.pdf')
    expect(path.split('/')[3]).toBe('12')
  })

  it('uses a UUID format in the filename prefix', () => {
    const path = DocumentService.getStoragePath('co1', '2025-01-01', 'file.pdf')
    const filename = path.split('/')[4]
    // UUID is 36 chars (8-4-4-4-12 pattern), then "-" then filename
    const uuidPart = filename.slice(0, 36)
    expect(uuidPart).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
  })
})

// ── 15. computeSummary — mixed audit_required flags ───────────────────────────

describe('computeSummary — audit_required_total / verified counts', () => {
  it('counts audit_required_total correctly with mixed is_audit_required values', () => {
    const rows = [
      makeRow({ document_type: 'invoice',        is_audit_required: false, is_verified: false }),
      makeRow({ document_type: 'bank_statement', is_audit_required: true,  is_verified: true  }),
      makeRow({ document_type: 'tax_declaration',is_audit_required: true,  is_verified: false }),
      makeRow({ document_type: 'contract',       is_audit_required: true,  is_verified: true  }),
    ]
    const summary = DocumentService.computeSummary(rows)
    expect(summary.audit_required_total).toBe(3)
    expect(summary.audit_required_verified).toBe(2)
    expect(summary.audit_readiness_pct).toBe(67)
  })

  it('total_documents equals length of rows input', () => {
    const rows = [
      makeRow({ document_type: 'invoice' }),
      makeRow({ document_type: 'other' }),
      makeRow({ document_type: 'contract' }),
    ]
    expect(DocumentService.computeSummary(rows).total_documents).toBe(3)
  })

  it('by_type counts all zeros for types not in the input', () => {
    const rows = [makeRow({ document_type: 'invoice' })]
    const { by_type } = DocumentService.computeSummary(rows)
    expect(by_type.contract).toBe(0)
    expect(by_type.bank_statement).toBe(0)
    expect(by_type.tax_declaration).toBe(0)
    expect(by_type.board_resolution).toBe(0)
    expect(by_type.proof_of_payment).toBe(0)
    expect(by_type.audit_report).toBe(0)
    expect(by_type.other).toBe(0)
  })

  it('missing_audit_docs includes correct description for bank_statement', () => {
    const rows: DocRow[] = []
    const { missing_audit_docs } = DocumentService.computeSummary(rows)
    const bankEntry = missing_audit_docs.find(m => m.document_type === 'bank_statement')
    expect(bankEntry).toBeDefined()
    expect(bankEntry!.description.length).toBeGreaterThan(0)
  })

  it('missing_audit_docs includes correct description for tax_declaration', () => {
    const rows: DocRow[] = []
    const { missing_audit_docs } = DocumentService.computeSummary(rows)
    const taxEntry = missing_audit_docs.find(m => m.document_type === 'tax_declaration')
    expect(taxEntry).toBeDefined()
    expect(taxEntry!.description.length).toBeGreaterThan(0)
  })
})
