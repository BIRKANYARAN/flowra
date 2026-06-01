// @vitest-environment jsdom
// Render tests for the pure presentational components extracted from the
// reconciliation detail page. They take props only — direct golden checks.
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { fmt, pct, SectionBlock, KV, SimpleTable, AgingTable } from '@/app/dashboard/admin/reconciliation/[id]/_reconciliation/components'

afterEach(() => cleanup())

describe('reconciliation detail — extracted presentational components', () => {
  it('fmt/pct format numbers and null', () => {
    expect(fmt(null)).toBe('—')
    expect(pct(null)).toBe('—')
    expect(pct(12.345)).toBe('12.35%')
  })
  it('SectionBlock renders its number, title and children', () => {
    render(<SectionBlock number={3} title="Bilanço"><div>içerik</div></SectionBlock>)
    expect(screen.getByText('Bilanço')).toBeInTheDocument()
    expect(screen.getByText('03')).toBeInTheDocument()
    expect(screen.getByText('içerik')).toBeInTheDocument()
  })
  it('KV renders a label/value pair (and — for null)', () => {
    render(<KV label="Durum" value="Tamam" />)
    expect(screen.getByText('Durum')).toBeInTheDocument()
    expect(screen.getByText('Tamam')).toBeInTheDocument()
  })
  it('SimpleTable renders headers and rows', () => {
    render(<SimpleTable cols={['A', 'B']} rows={[['x', 'y'], ['z', null]]} />)
    expect(screen.getByText('A')).toBeInTheDocument()
    expect(screen.getByText('x')).toBeInTheDocument()
  })
  it('AgingTable renders the 4 aging buckets', () => {
    render(<AgingTable aging={{ bucket_0_30: 100, bucket_31_60: 0, bucket_61_90: 0, bucket_90plus: 0 }} />)
    expect(screen.getByText('0-30 Gün')).toBeInTheDocument()
    expect(screen.getByText('90+ Gün')).toBeInTheDocument()
  })
})
