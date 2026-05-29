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

// ─────────────────────────────────────────────────────────────────────────────
// resolveCompany — extended edge cases
// ─────────────────────────────────────────────────────────────────────────────

describe('resolveCompany — edge cases', () => {
  it('returns empty strings when both snapshot and live settings are absent', () => {
    const result = resolveCompany({ company_snapshot: null }, null)
    expect(result.name).toBe('')
    expect(result.address).toBe('')
  })

  it('snapshot with missing name key falls back to empty string', () => {
    const proforma = { company_snapshot: { address: 'Some Addr' } as Record<string, string> }
    const result = resolveCompany(proforma, null)
    expect(result.name).toBe('')
    expect(result.address).toBe('Some Addr')
  })

  it('snapshot with missing address key falls back to empty string', () => {
    const proforma = { company_snapshot: { name: 'Corp' } as Record<string, string> }
    const result = resolveCompany(proforma, null)
    expect(result.name).toBe('Corp')
    expect(result.address).toBe('')
  })

  it('live settings with missing company_name falls back to empty string', () => {
    const result = resolveCompany({ company_snapshot: null }, { address: 'Some St' })
    expect(result.name).toBe('')
    expect(result.address).toBe('Some St')
  })

  it('live settings with missing address falls back to empty string', () => {
    const result = resolveCompany({ company_snapshot: null }, { company_name: 'TechCo' })
    expect(result.name).toBe('TechCo')
    expect(result.address).toBe('')
  })

  it('snapshot takes priority even when live settings have richer data', () => {
    const proforma = { company_snapshot: { name: 'Old Name', address: '' } }
    const live = { company_name: 'New Name', address: 'New Address' }
    const result = resolveCompany(proforma, live)
    // Snapshot wins — even though address is empty
    expect(result.name).toBe('Old Name')
    expect(result.address).toBe('')
  })

  it('snapshot with empty name returns empty string, not live name', () => {
    const proforma = { company_snapshot: { name: '', address: 'Snap Addr' } }
    const live = { company_name: 'Live Corp', address: 'Live Addr' }
    const result = resolveCompany(proforma, live)
    // Snapshot wins entire branch
    expect(result.name).toBe('')
  })

  it('undefined company_snapshot is treated as no snapshot (falls to live)', () => {
    const proforma = {} // no company_snapshot key
    const live = { company_name: 'Default Corp', address: '123 St' }
    const result = resolveCompany(proforma, live)
    expect(result.name).toBe('Default Corp')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// resolveCustomer — extended edge cases
// ─────────────────────────────────────────────────────────────────────────────

describe('resolveCustomer — edge cases', () => {
  it('returns empty strings when no snapshot, no live customer, and no customer_name', () => {
    const result = resolveCustomer({ customer_snapshot: null }, null)
    expect(result.name).toBe('')
    expect(result.address).toBe('')
  })

  it('live customer name takes priority over customer_name fallback', () => {
    const proforma = { customer_snapshot: null, customer_name: 'Header Name' }
    const live = { name: 'Live Customer Name', address: 'Live Addr' }
    const result = resolveCustomer(proforma, live)
    expect(result.name).toBe('Live Customer Name')
  })

  it('customer_name is used when live customer name is missing', () => {
    const proforma = { customer_snapshot: null, customer_name: 'Header Name' }
    const live = { address: 'Some Addr' } // name missing
    const result = resolveCustomer(proforma, live)
    expect(result.name).toBe('Header Name')
  })

  it('live customer address is returned when no snapshot', () => {
    const proforma = { customer_snapshot: null, customer_name: 'X' }
    const live = { name: 'Live', address: 'Business St 5' }
    const result = resolveCustomer(proforma, live)
    expect(result.address).toBe('Business St 5')
  })

  it('customer snapshot address overrides live address', () => {
    const proforma = {
      customer_snapshot: { name: 'Snap', address: 'Snapshot St' },
      customer_name: 'H',
    }
    const live = { name: 'Live', address: 'Live St' }
    const result = resolveCustomer(proforma, live)
    expect(result.address).toBe('Snapshot St')
  })

  it('undefined customer_snapshot behaves as no snapshot', () => {
    const proforma = { customer_name: 'Direct Name' }
    const result = resolveCustomer(proforma, null)
    expect(result.name).toBe('Direct Name')
  })

  it('empty string customer_name falls back to empty string', () => {
    const proforma = { customer_snapshot: null, customer_name: '' }
    const result = resolveCustomer(proforma, null)
    expect(result.name).toBe('')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Snapshot immutability — verifies that live data changes after proforma
// creation do not retroactively alter historical proformas
// ─────────────────────────────────────────────────────────────────────────────

describe('Snapshot immutability contract', () => {
  it('company renaming does not affect proforma created before the rename', () => {
    // Proforma was created when company was named "Original Inc"
    const proforma = {
      company_snapshot: { name: 'Original Inc', address: 'Original Addr' },
    }
    // After rename, live settings say the company is "Renamed Inc"
    const currentLive = { company_name: 'Renamed Inc', address: 'New HQ' }

    const result = resolveCompany(proforma, currentLive)
    expect(result.name).toBe('Original Inc')
  })

  it('customer address change does not affect historical proforma display', () => {
    const proforma = {
      customer_snapshot: { name: 'Customer Ltd', address: 'Old Office' },
    }
    const currentLive = { name: 'Customer Ltd', address: 'New Office' }

    const result = resolveCustomer(proforma, currentLive)
    expect(result.address).toBe('Old Office')
  })

  it('both company and customer snapshots are independently frozen', () => {
    const companySS = { name: 'Frozen Company', address: 'Frozen Addr' }
    const customerSS = { name: 'Frozen Customer', address: 'Customer Frozen Addr' }

    const proformaForCompany = { company_snapshot: companySS }
    const proformaForCustomer = { customer_snapshot: customerSS, customer_name: 'Header' }

    const companyResult  = resolveCompany(proformaForCompany, { company_name: 'New', address: 'New' })
    const customerResult = resolveCustomer(proformaForCustomer, { name: 'New Customer', address: 'New Addr' })

    expect(companyResult.name).toBe('Frozen Company')
    expect(customerResult.name).toBe('Frozen Customer')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Return type consistency — both resolvers always return { name, address }
// ─────────────────────────────────────────────────────────────────────────────

describe('Return type consistency', () => {
  it('resolveCompany always returns an object with name and address keys', () => {
    const cases = [
      [{ company_snapshot: { name: 'A', address: 'B' } }, null],
      [{ company_snapshot: null }, { company_name: 'A', address: 'B' }],
      [{ company_snapshot: null }, null],
    ] as const

    for (const [proforma, live] of cases) {
      const result = resolveCompany(proforma, live as any)
      expect(result).toHaveProperty('name')
      expect(result).toHaveProperty('address')
    }
  })

  it('resolveCustomer always returns an object with name and address keys', () => {
    const cases = [
      [{ customer_snapshot: { name: 'A', address: 'B' } }, null],
      [{ customer_snapshot: null, customer_name: 'A' }, null],
      [{ customer_snapshot: null }, { name: 'A', address: 'B' }],
    ] as const

    for (const [proforma, live] of cases) {
      const result = resolveCustomer(proforma as any, live as any)
      expect(result).toHaveProperty('name')
      expect(result).toHaveProperty('address')
    }
  })

  it('all returned values are strings, never null or undefined', () => {
    const r1 = resolveCompany({ company_snapshot: null }, null)
    const r2 = resolveCustomer({ customer_snapshot: null }, null)

    expect(typeof r1.name).toBe('string')
    expect(typeof r1.address).toBe('string')
    expect(typeof r2.name).toBe('string')
    expect(typeof r2.address).toBe('string')
  })
})
