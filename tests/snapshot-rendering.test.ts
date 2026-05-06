/**
 * Tests for proforma snapshot rendering logic
 * Validates that snapshot data is preferred over live data
 * Run with: npx vitest run tests/snapshot-rendering.test.ts
 */
import { describe, it, expect } from 'vitest'

// Simulate the snapshot preference logic used in both private and public pages
function resolveCompany(
  proforma: { company_snapshot?: Record<string, string> | null },
  liveSettings: { company_name?: string; address?: string } | null
) {
  const cs = proforma.company_snapshot
  if (cs) {
    return {
      name:    cs.name ?? '',
      address: cs.address ?? '',
    }
  }
  if (liveSettings) {
    return {
      name:    liveSettings.company_name ?? '',
      address: liveSettings.address ?? '',
    }
  }
  return { name: '', address: '' }
}

function resolveCustomer(
  proforma: { customer_snapshot?: Record<string, string> | null; customer_name?: string },
  liveCustomer: { name?: string; address?: string } | null
) {
  const cus = proforma.customer_snapshot
  if (cus) {
    return {
      name:    cus.name ?? '',
      address: cus.address ?? '',
    }
  }
  if (liveCustomer) {
    return {
      name:    liveCustomer.name ?? proforma.customer_name ?? '',
      address: liveCustomer.address ?? '',
    }
  }
  return { name: proforma.customer_name ?? '', address: '' }
}

describe('Proforma Snapshot Rendering', () => {
  it('prefers company snapshot over live settings', () => {
    const proforma = {
      company_snapshot: { name: 'Frozen Corp', address: 'Old Address' },
    }
    const liveSettings = { company_name: 'Updated Corp', address: 'New Address' }

    const result = resolveCompany(proforma, liveSettings)
    expect(result.name).toBe('Frozen Corp')
    expect(result.address).toBe('Old Address')
  })

  it('falls back to live settings for old proformas without snapshot', () => {
    const proforma = { company_snapshot: null }
    const liveSettings = { company_name: 'Live Corp', address: 'Live Addr' }

    const result = resolveCompany(proforma, liveSettings)
    expect(result.name).toBe('Live Corp')
  })

  it('prefers customer snapshot over live customer', () => {
    const proforma = {
      customer_snapshot: { name: 'Frozen Customer', address: 'Snapshot Addr' },
      customer_name: 'Header Name',
    }
    const liveCustomer = { name: 'Updated Customer', address: 'Updated Addr' }

    const result = resolveCustomer(proforma, liveCustomer)
    expect(result.name).toBe('Frozen Customer')
    expect(result.address).toBe('Snapshot Addr')
  })

  it('falls back to customer_name when no snapshot and no live customer', () => {
    const proforma = { customer_snapshot: null, customer_name: 'Fallback Name' }
    const result = resolveCustomer(proforma, null)
    expect(result.name).toBe('Fallback Name')
  })
})
